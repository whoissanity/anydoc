import { describe, expect, it } from "vitest";
import { exportCommentsToFdf, type CommentThread } from "@/lib/security/pdf-security";
import { escapeXml, stripControl } from "@/lib/security/escape";

function comment(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: "c1",
    pageIndex: 0,
    author: "Ada",
    text: "Please review",
    date: "2026-01-01T00:00:00.000Z",
    status: "Open",
    ...overrides,
  } as unknown as CommentThread;
}

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

describe("escapeXml", () => {
  it("encodes every character that can end a text node or attribute", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;"
    );
  });

  it("deliberately re-escapes existing entities so untrusted input cannot smuggle markup", () => {
    expect(escapeXml("&lt;script&gt;")).toBe("&amp;lt;script&amp;gt;");
    expect(parse(`<a>${escapeXml("<b>")}</a>`).documentElement.textContent).toBe("<b>");
  });

  it("strips control characters that are invalid in XML", () => {
    expect(stripControl("a\u0000b\u0001c\u001Fd\u007F")).toBe("abcd");
    expect(escapeXml("a\u0000b")).toBe("ab");
  });
});

describe("exportCommentsToFdf", () => {
  it("produces well-formed XML for ordinary comments", () => {
    const xml = exportCommentsToFdf([comment({ text: "Looks fine" })], "report.pdf");
    const doc = parse(xml);

    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.nodeName).toBe("xfdf");
    expect(doc.querySelector("f")?.getAttribute("href")).toBe("report.pdf");
    expect(doc.querySelector("contents")?.textContent).toBe("Looks fine");
  });

  it("cannot be broken out of by markup in the comment body", () => {
    const payload = "</contents></text></annots><script>alert(1)</script>";
    const xml = exportCommentsToFdf([comment({ text: payload })], "report.pdf");
    const doc = parse(xml);

    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(xml).not.toContain("<script");
    // The payload survives as inert text, which is what a reader should show.
    expect(doc.querySelector("contents")?.textContent).toBe(payload);
    expect(doc.querySelectorAll("text")).toHaveLength(1);
  });

  it("escapes attribute contexts: author, date and document name", () => {
    const xml = exportCommentsToFdf(
      [
        comment({
          author: `" onmouseover="alert(1)`,
          date: `"><script>x</script>`,
        }),
      ],
      `a"><script>alert(1)</script>.pdf`
    );
    const doc = parse(xml);

    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(doc.querySelector("text")?.getAttribute("author")).toBe(`" onmouseover="alert(1)`);
    expect(doc.querySelector("text")?.getAttribute("date")).toBe(`"><script>x</script>`);
    expect(doc.querySelector("f")?.getAttribute("href")).toBe(`a"><script>alert(1)</script>.pdf`);
  });

  it("refuses to emit out-of-range page indices or unknown statuses", () => {
    const xml = exportCommentsToFdf(
      [
        comment({ id: "a", pageIndex: -3 }),
        comment({ id: "b", pageIndex: 1.5 }),
        // A hostile value that is not in the allowed status union.
        comment({ id: "c", pageIndex: 2, status: "Pwned" as CommentThread["status"] }),
      ],
      "report.pdf"
    );
    const nodes = [...parse(xml).querySelectorAll("text")];

    expect(nodes.map((n) => n.getAttribute("page"))).toEqual(["0", "0", "2"]);
    expect(nodes.map((n) => n.getAttribute("status"))).toEqual(["Open", "Open", "Open"]);
  });

  it("bounds the length of attacker-controlled fields", () => {
    const xml = exportCommentsToFdf([comment({ text: "A".repeat(6000) })], "report.pdf");
    const contents = parse(xml).querySelector("contents")?.textContent ?? "";
    expect(contents.length).toBeLessThanOrEqual(4000);
  });
});
