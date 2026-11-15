import { describe, expect, it } from "vitest";
import { runSecurityAudit } from "../../../../scripts/security-audit-scan.mjs";

describe("Automated Security & Privacy Audit (AGENTS.md rule 6)", () => {
  it("enforces zero forbidden external origins and no exposed secrets", () => {
    const violations = runSecurityAudit();
    if (violations.length > 0) {
      console.error("Security scan violations:", violations);
    }
    expect(violations).toEqual([]);
  });
});
