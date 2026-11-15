import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTPUT_TEMPLATE,
  RecipeError,
  defaultRecipe,
  parseRecipe,
  recipeToJson,
} from "@/lib/batch/recipe";

const allowed = new Set(["sanitize", "compress"]);

describe("parseRecipe", () => {
  it("parses a valid recipe and applies defaults", () => {
    const recipe = parseRecipe(
      {
        name: "Clean",
        description: "Remove hidden data",
        steps: [
          { toolId: "sanitize", params: { metadata: true } },
          { toolId: "compress", params: { mode: "lossless" } },
        ],
      },
      { allowedToolIds: allowed }
    );

    expect(recipe.version).toBe(1);
    expect(recipe.name).toBe("Clean");
    expect(recipe.stopOnError).toBe(false);
    expect(recipe.outputTemplate).toBe(DEFAULT_OUTPUT_TEMPLATE);
    expect(recipe.steps).toHaveLength(2);
    expect(recipe.steps[0]).toEqual({ toolId: "sanitize", params: { metadata: true } });
  });

  it("accepts a JSON string", () => {
    const recipe = parseRecipe(
      JSON.stringify({ steps: [{ toolId: "compress", params: {} }] }),
      { allowedToolIds: allowed }
    );
    expect(recipe.name).toBe("Untitled recipe");
    expect(recipe.steps[0].toolId).toBe("compress");
  });

  it("rejects malformed JSON", () => {
    expect(() => parseRecipe("{", { allowedToolIds: allowed })).toThrow(RecipeError);
    expect(() => parseRecipe("{", { allowedToolIds: allowed })).toThrow(/Invalid JSON/);
  });

  it("requires at least one step", () => {
    expect(() => parseRecipe({ steps: [] }, { allowedToolIds: allowed })).toThrow(
      /at least one step/
    );
  });

  it("rejects an unknown tool", () => {
    expect(() =>
      parseRecipe({ steps: [{ toolId: "drop-table", params: {} }] }, { allowedToolIds: allowed })
    ).toThrow(/unknown or unavailable tool/);
  });

  it("rejects prototype-polluting parameter names", () => {
    const input = JSON.parse('{"steps":[{"toolId":"compress","params":{"__proto__":true}}]}');
    expect(() => parseRecipe(input, { allowedToolIds: allowed })).toThrow(/Unsafe parameter/);
  });

  it("rejects path traversal in the output template", () => {
    expect(() =>
      parseRecipe(
        { outputTemplate: "../escape.pdf", steps: [{ toolId: "compress", params: {} }] },
        { allowedToolIds: allowed }
      )
    ).toThrow(/file name, not a path/);
  });

  it("round-trips through JSON", () => {
    const recipe = defaultRecipe(allowed);
    const parsed = parseRecipe(recipeToJson(recipe), { allowedToolIds: allowed });
    expect(parsed).toEqual(recipe);
  });

  it("builds a default recipe from the available tools", () => {
    const recipe = defaultRecipe(new Set(["sanitize"]));
    expect(recipe.steps.map((step) => step.toolId)).toEqual(["sanitize"]);
  });
});