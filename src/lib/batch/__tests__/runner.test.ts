import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  batchToolIds,
  runBatch,
  type BatchInput,
  type BatchToolDef,
} from "@/lib/batch/runner";
import { parseRecipe } from "@/lib/batch/recipe";

async function pdfBytes(title = "Test"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.addPage([300, 200]);
  return doc.save();
}

function recipe(steps: Array<{ toolId: string; params?: Record<string, string | number | boolean> }>, stopOnError = false) {
  return parseRecipe({ name: "Test batch", outputTemplate: "{name}-clean.pdf", steps, stopOnError });
}

function tools(): Map<string, BatchToolDef> {
  const list: BatchToolDef[] = [
    {
      id: "noop",
      name: "No-op",
      batchSafe: true,
      run: async (ctx) => ({ bytes: ctx.bytes, message: "ok" }),
    },
    {
      id: "nochange",
      name: "No change",
      batchSafe: true,
      run: async () => ({ message: "left as-is" }),
    },
    {
      id: "fail",
      name: "Failing tool",
      batchSafe: true,
      run: async (ctx) => {
        if (ctx.fileName === "bad.pdf") throw new Error("intentional failure");
        return { bytes: ctx.bytes, message: "ok" };
      },
    },
    {
      id: "select",
      name: "Select tool",
      batchSafe: true,
      params: [
        {
          key: "mode",
          label: "Mode",
          type: "select",
          defaultValue: "a",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      ],
      run: async (ctx) => ({ bytes: ctx.bytes, message: "ok" }),
    },
  ];
  return new Map(list.map((tool) => [tool.id, tool]));
}

describe("runBatch", () => {
  it("applies every step and returns an output", async () => {
    const inputs: BatchInput[] = [{ name: "report.pdf", bytes: await pdfBytes() }];
    const result = await runBatch(recipe([{ toolId: "noop" }, { toolId: "noop" }]), inputs, {
      tools: tools(),
    });

    expect(result.failures).toEqual([]);
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0].fileName).toBe("report-clean.pdf");
    expect(result.outputs[0].steps).toEqual(["noop", "noop"]);
  });

  it("passes through a tool that makes no change", async () => {
    const result = await runBatch(
      recipe([{ toolId: "nochange" }]),
      [{ name: "report.pdf", bytes: await pdfBytes() }],
      { tools: tools() }
    );

    expect(result.outputs).toHaveLength(1);
    expect(result.warnings.join(" ")).toMatch(/left the document unchanged/);
  });

  it("continues after a file failure by default", async () => {
    const inputs: BatchInput[] = [
      { name: "bad.pdf", bytes: await pdfBytes() },
      { name: "good.pdf", bytes: await pdfBytes() },
    ];
    const result = await runBatch(recipe([{ toolId: "fail" }]), inputs, { tools: tools() });

    expect(result.outputs.map((output) => output.inputName)).toEqual(["good.pdf"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({ fileName: "bad.pdf", stepLabel: "Failing tool" });
  });

  it("stops at the first failure when the recipe asks for it", async () => {
    const inputs: BatchInput[] = [
      { name: "bad.pdf", bytes: await pdfBytes() },
      { name: "good.pdf", bytes: await pdfBytes() },
    ];
    const result = await runBatch(
      recipe([{ toolId: "fail" }], true),
      inputs,
      { tools: tools() }
    );

    expect(result.outputs).toEqual([]);
    expect(result.failures).toHaveLength(1);
  });

  it("rejects an unknown parameter value", async () => {
    const result = await runBatch(
      recipe([{ toolId: "select", params: { mode: "z" } }]),
      [{ name: "report.pdf", bytes: await pdfBytes() }],
      { tools: tools() }
    );

    expect(result.failures[0]?.message).toMatch(/unsupported value/);
  });

  it("rejects non-PDF input by content", async () => {
    await expect(
      runBatch(recipe([{ toolId: "noop" }]), [
        { name: "invoice.pdf", bytes: new TextEncoder().encode("<html>nope</html>") },
      ], { tools: tools() })
    ).rejects.toThrow(/not a PDF/);
  });

  it("rejects empty input", async () => {
    await expect(
      runBatch(recipe([{ toolId: "noop" }]), [
        { name: "empty.pdf", bytes: new Uint8Array(0) },
      ], { tools: tools() })
    ).rejects.toThrow(/empty or detached/);
  });

  it("makes output names unique", async () => {
    const result = await runBatch(
      recipe([{ toolId: "noop" }]),
      [
        { name: "same.pdf", bytes: await pdfBytes() },
        { name: "same.pdf", bytes: await pdfBytes() },
      ],
      { tools: tools() }
    );

    expect(result.outputs.map((output) => output.fileName)).toEqual([
      "same-clean.pdf",
      "same-clean (2).pdf",
    ]);
  });

  it("exposes only tools marked batch-safe", () => {
    const map = tools();
    map.set("unsafe", {
      id: "unsafe",
      name: "Unsafe",
      batchSafe: false,
      run: async () => ({ message: "unsafe" }),
    });
    expect([...batchToolIds(map.values())]).toEqual(["noop", "nochange", "fail", "select"]);
  });
});