import type { ParamValues, ToolContext, ToolOutcome } from "@/lib/tools/catalog";
import type { ToolParam } from "@/lib/tools/catalog";
import { loadPdfLib } from "@/lib/document/pages";
import { assertPdfBytes, isDetachedBytes, MAX_PDF_BYTES } from "@/lib/document/validate";
import type { Recipe, RecipeParamValue, RecipeStep } from "@/lib/batch/recipe";
import { MAX_RECIPE_STEPS } from "@/lib/batch/recipe";

export const MAX_BATCH_FILES = 50;
export const MAX_BATCH_TOTAL_BYTES = 200 * 1024 * 1024;

export interface BatchInput {
  name: string;
  bytes: Uint8Array;
}

export interface BatchToolDef {
  id: string;
  name: string;
  batchSafe?: boolean;
  unavailable?: string;
  params?: ToolParam[];
  run?: (ctx: ToolContext, values: ParamValues) => Promise<ToolOutcome>;
}

export interface BatchDeps {
  tools: ReadonlyMap<string, BatchToolDef>;
}

export interface BatchProgress {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  stepIndex: number;
  stepCount: number;
  stepLabel: string;
  percent: number;
}

export interface BatchOutput {
  fileName: string;
  inputName: string;
  bytes: Uint8Array;
  steps: string[];
}

export interface BatchFailure {
  fileName: string;
  message: string;
  stepLabel?: string;
}

export interface BatchResult {
  outputs: BatchOutput[];
  failures: BatchFailure[];
  warnings: string[];
}

export interface BatchOptions {
  stopOnError?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: BatchProgress) => void;
  maxFiles?: number;
  maxTotalBytes?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : (error as { name?: string } | null)?.name === "AbortError";
}

function assertAlive(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
}

function defaultsFor(tool: BatchToolDef): ParamValues {
  const values: ParamValues = {};
  for (const param of tool.params ?? []) {
    values[param.key] = param.defaultValue ?? (param.type === "toggle" ? false : "");
  }
  return values;
}

function validateValues(tool: BatchToolDef, params: Record<string, RecipeParamValue>): ParamValues {
  const values = defaultsFor(tool);
  const definitions = new Map((tool.params ?? []).map((param) => [param.key, param]));

  for (const [key, raw] of Object.entries(params)) {
    const param = definitions.get(key);
    if (!param) throw new Error(`Unknown parameter “${key}” for ${tool.name}`);
    if (param.type === "file") throw new Error(`Parameter “${key}” cannot be set in a recipe`);

    if (param.type === "toggle") {
      if (typeof raw !== "boolean") throw new Error(`Parameter “${key}” must be true or false`);
    } else if (param.type === "number" || param.type === "range") {
      if (typeof raw !== "number") throw new Error(`Parameter “${key}” must be a number`);
      if (param.min !== undefined && raw < param.min) {
        throw new Error(`Parameter “${key}” must be at least ${param.min}`);
      }
      if (param.max !== undefined && raw > param.max) {
        throw new Error(`Parameter “${key}” must be at most ${param.max}`);
      }
    } else if (typeof raw !== "string") {
      throw new Error(`Parameter “${key}” must be text`);
    }

    if (param.type === "select" && param.options?.length) {
      if (!param.options.some((option) => option.value === raw)) {
        throw new Error(`Parameter “${key}” has an unsupported value`);
      }
    }

    values[key] = raw;
  }
  return values;
}

async function countPages(bytes: Uint8Array): Promise<number> {
  try {
    const doc = await loadPdfLib(bytes);
    return doc.getPageCount();
  } catch {
    return 0;
  }
}

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "").trim() || "document";
}

function safeFileName(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120)
    .trim();
  const final = cleaned || "document";
  return /\.pdf$/i.test(final) ? final : `${final}.pdf`;
}

function outputName(
  recipe: Recipe,
  inputName: string,
  index: number,
  applied: string[]
): string {
  const rendered = recipe.outputTemplate
    .replace(/\{name\}/gi, baseName(inputName))
    .replace(/\{index\}/gi, String(index))
    .replace(/\{recipe\}/gi, recipe.name)
    .replace(/\{tool\}/gi, applied.join("-") || "document");
  return safeFileName(rendered);
}

function uniqueName(name: string, used: ReadonlySet<string>): string {
  if (!used.has(name)) return name;
  const suffix = ".pdf";
  const stem = name.slice(0, -suffix.length);
  let index = 2;
  let candidate = `${stem} (${index})${suffix}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${stem} (${index})${suffix}`;
  }
  return candidate;
}

export async function runBatch(
  recipe: Recipe,
  inputs: BatchInput[],
  deps: BatchDeps,
  options: BatchOptions = {}
): Promise<BatchResult> {
  const maxFiles = options.maxFiles ?? MAX_BATCH_FILES;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_BATCH_TOTAL_BYTES;
  const stopOnError = options.stopOnError ?? recipe.stopOnError;
  const signal = options.signal;

  if (!inputs.length) throw new Error("Choose at least one PDF to process");
  if (inputs.length > maxFiles) {
    throw new Error(`A batch may contain at most ${maxFiles} files`);
  }
  if (recipe.steps.length > MAX_RECIPE_STEPS) {
    throw new Error(`A recipe may contain at most ${MAX_RECIPE_STEPS} steps`);
  }

  let totalBytes = 0;
  for (const input of inputs) {
    if (!input.name.trim()) throw new Error("Every input file needs a name");
    assertPdfBytes(input.bytes, input.name);
    totalBytes += input.bytes.byteLength;
    if (totalBytes > maxTotalBytes) {
      throw new Error(`The batch is larger than ${Math.round(maxTotalBytes / (1024 * 1024))} MB`);
    }
  }

  const outputs: BatchOutput[] = [];
  const failures: BatchFailure[] = [];
  const warnings: string[] = [];
  const usedNames = new Set<string>();

  for (let fileIndex = 0; fileIndex < inputs.length; fileIndex += 1) {
    assertAlive(signal);
    const input = inputs[fileIndex];
    let bytes = input.bytes.slice();
    let pageCount = await countPages(bytes);
    let currentName = input.name;
    let currentStep: string | undefined;
    const applied: string[] = [];

    const progress = (stepIndex: number, stepLabel: string) => {
      const percent = ((fileIndex + (stepIndex + 1) / recipe.steps.length) / inputs.length) * 100;
      options.onProgress?.({
        fileIndex,
        fileCount: inputs.length,
        fileName: input.name,
        stepIndex,
        stepCount: recipe.steps.length,
        stepLabel,
        percent: Math.max(0, Math.min(100, percent)),
      });
    };

    try {
      for (let stepIndex = 0; stepIndex < recipe.steps.length; stepIndex += 1) {
        assertAlive(signal);
        const step: RecipeStep = recipe.steps[stepIndex];
        const tool = deps.tools.get(step.toolId);
        currentStep = tool?.name ?? step.toolId;

        if (!tool) throw new Error(`Unknown tool “${step.toolId}”`);
        if (tool.unavailable) throw new Error(tool.unavailable);
        if (tool.batchSafe !== true) throw new Error(`${tool.name} cannot run in a batch recipe`);
        if (!tool.run) throw new Error(`${tool.name} cannot be run`);

        const values = validateValues(tool, step.params);
        const ctx: ToolContext = {
          bytes: bytes.slice(),
          fileName: currentName,
          pageCount,
          currentPage: 1,
          outline: [],
          onProgress: () => {},
          signal,
        };

        const outcome = await tool.run(ctx, values);
        if (outcome.bytes) {
          if (isDetachedBytes(outcome.bytes)) {
            throw new Error(`${tool.name} returned unavailable bytes`);
          }
          bytes = outcome.bytes.slice();
          if (outcome.rename) currentName = outcome.rename;
          applied.push(step.toolId);
          const nextPages = await countPages(bytes);
          if (nextPages > 0) pageCount = nextPages;
        } else {
          warnings.push(`${input.name}: ${tool.name} left the document unchanged`);
        }

        progress(stepIndex, tool.name);
      }

      const name = uniqueName(outputName(recipe, input.name, fileIndex + 1, applied), usedNames);
      usedNames.add(name);
      outputs.push({ fileName: name, inputName: input.name, bytes, steps: applied });
    } catch (error) {
      if (isAbortError(error)) throw error;
      failures.push({
        fileName: input.name,
        message: errorMessage(error),
        stepLabel: currentStep,
      });
      if (stopOnError) break;
    }
  }

  return { outputs, failures, warnings };
}

export function batchToolIds(tools: Iterable<BatchToolDef>): Set<string> {
  const ids = new Set<string>();
  for (const tool of tools) {
    if (tool.batchSafe === true && tool.run && !tool.unavailable) ids.add(tool.id);
  }
  return ids;
}

export function batchOutputBytes(result: BatchResult): number {
  return result.outputs.reduce((sum, output) => sum + output.bytes.byteLength, 0);
}

export function batchInputBytes(inputs: BatchInput[]): number {
  return inputs.reduce((sum, input) => sum + input.bytes.byteLength, 0);
}

export function maxBatchBytes(): number {
  return MAX_PDF_BYTES;
}