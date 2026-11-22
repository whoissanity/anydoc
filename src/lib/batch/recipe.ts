export type RecipeParamValue = string | number | boolean;

export interface RecipeStep {
  toolId: string;
  params: Record<string, RecipeParamValue>;
}

export interface Recipe {
  version: 1;
  name: string;
  description: string;
  stopOnError: boolean;
  outputTemplate: string;
  steps: RecipeStep[];
}

export class RecipeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeError";
  }
}

export const MAX_RECIPE_STEPS = 20;
export const MAX_RECIPE_NAME = 120;
export const MAX_RECIPE_PARAM_BYTES = 64 * 1024;
export const DEFAULT_OUTPUT_TEMPLATE = "{name}-processed.pdf";
export const DEFAULT_RECIPE_NAME = "Untitled recipe";

const FORBIDDEN_PARAM_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, fallback: string, max: number): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new RecipeError("Recipe names and descriptions must be text");
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!trimmed) return fallback;
  if (trimmed.length > max) throw new RecipeError(`Recipe text must be ${max} characters or fewer`);
  return trimmed;
}

function validateOutputTemplate(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return DEFAULT_OUTPUT_TEMPLATE;
  if (raw.length > MAX_RECIPE_NAME) {
    throw new RecipeError(`Output template must be ${MAX_RECIPE_NAME} characters or fewer`);
  }
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw new RecipeError("Output template contains control characters");
  }
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) {
    throw new RecipeError("Output template must be a file name, not a path");
  }
  return raw;
}

function validateParams(value: unknown): Record<string, RecipeParamValue> {
  if (!isRecord(value)) {
    throw new RecipeError("Each recipe step needs a params object");
  }

  const entries = Object.entries(value);
  if (entries.length > 100) throw new RecipeError("A recipe step has too many parameters");

  const params: Record<string, RecipeParamValue> = {};
  for (const [key, raw] of entries) {
    if (FORBIDDEN_PARAM_KEYS.has(key)) {
      throw new RecipeError(`Unsafe parameter name: ${key}`);
    }
    if (!key || key.length > 120) throw new RecipeError("Parameter names must be 1–120 characters");
    if (typeof raw === "string") {
      if (raw.length > 8_192) throw new RecipeError(`Parameter ${key} is too long`);
      params[key] = raw;
    } else if (typeof raw === "number") {
      if (!Number.isFinite(raw)) throw new RecipeError(`Parameter ${key} must be a finite number`);
      params[key] = raw;
    } else if (typeof raw === "boolean") {
      params[key] = raw;
    } else {
      throw new RecipeError(`Parameter ${key} must be text, a number or true/false`);
    }
  }
  return params;
}

function validateStep(value: unknown, index: number, allowedToolIds?: ReadonlySet<string>): RecipeStep {
  if (!isRecord(value)) throw new RecipeError(`Step ${index + 1} must be an object`);
  const toolId = typeof value.toolId === "string" ? value.toolId.trim() : "";
  if (!toolId) throw new RecipeError(`Step ${index + 1} is missing a toolId`);
  if (toolId.length > 120) throw new RecipeError(`Step ${index + 1} has an invalid toolId`);
  if (allowedToolIds && !allowedToolIds.has(toolId)) {
    throw new RecipeError(`Step ${index + 1} uses unknown or unavailable tool “${toolId}”`);
  }

  const params = validateParams(value.params ?? {});
  try {
    const serialized = JSON.stringify(params);
    if (serialized.length > MAX_RECIPE_PARAM_BYTES) {
      throw new RecipeError(`Step ${index + 1} parameters are too large`);
    }
  } catch {
    throw new RecipeError(`Step ${index + 1} parameters are not serializable`);
  }

  return { toolId, params };
}

export function parseRecipe(
  source: string | unknown,
  options: { allowedToolIds?: ReadonlySet<string> } = {}
): Recipe {
  let input: unknown = source;
  if (typeof source === "string") {
    try {
      input = JSON.parse(source);
    } catch (error) {
      throw new RecipeError(error instanceof Error ? `Invalid JSON: ${error.message}` : "Invalid JSON");
    }
  }
  if (!isRecord(input)) throw new RecipeError("A recipe must be a JSON object");

  const version = input.version ?? 1;
  if (version !== 1) throw new RecipeError("Only recipe version 1 is supported");

  const stepsRaw = input.steps;
  if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
    throw new RecipeError("A recipe needs at least one step");
  }
  if (stepsRaw.length > MAX_RECIPE_STEPS) {
    throw new RecipeError(`A recipe may contain at most ${MAX_RECIPE_STEPS} steps`);
  }

  const steps = stepsRaw.map((step, index) => validateStep(step, index, options.allowedToolIds));
  const name = cleanText(input.name, DEFAULT_RECIPE_NAME, MAX_RECIPE_NAME);
  const description = cleanText(input.description, "", 1_000);

  return {
    version: 1,
    name,
    description,
    stopOnError: input.stopOnError === true,
    outputTemplate: validateOutputTemplate(input.outputTemplate),
    steps,
  };
}

export function recipeToJson(recipe: Recipe): string {
  return JSON.stringify(recipe, null, 2);
}

export function defaultRecipe(allowedToolIds?: ReadonlySet<string>): Recipe {
  const steps: RecipeStep[] = [
    {
      toolId: "sanitize",
      params: {
        metadata: true,
        javascript: true,
        attachments: true,
        annotations: false,
        xmp: true,
        forms: "keep",
      },
    },
    { toolId: "compress", params: { mode: "lossless" } },
  ];
  const available = allowedToolIds
    ? steps.filter((step) => allowedToolIds.has(step.toolId))
    : steps;
  if (!available.length) {
    throw new RecipeError("No batch-safe tools are available");
  }
  return parseRecipe(
    {
      name: "Clean and optimise",
      outputTemplate: DEFAULT_OUTPUT_TEMPLATE,
      steps: available,
    },
    { allowedToolIds }
  );
}