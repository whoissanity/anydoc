import { describe, expect, it } from "vitest";
import { classifyNetworkUrl } from "@/lib/privacy/network-monitor";

const ORIGIN = "https://anydoc.example";

describe("classifyNetworkUrl", () => {
  it("treats relative and same-origin targets as local", () => {
    expect(classifyNetworkUrl("/api/nothing", ORIGIN)).toBe("local");
    expect(classifyNetworkUrl("vendor/tesseract/lang/eng.traineddata.gz", ORIGIN)).toBe("local");
    expect(classifyNetworkUrl("https://anydoc.example/editor", ORIGIN)).toBe("local");
    expect(classifyNetworkUrl("wss://anydoc.example/live", ORIGIN)).toBe("local");
  });

  it("flags any other host as external", () => {
    expect(classifyNetworkUrl("https://cdn.example.net/font.woff2", ORIGIN)).toBe("external");
    expect(classifyNetworkUrl("//tracker.example.org/pixel", ORIGIN)).toBe("external");
    expect(classifyNetworkUrl("wss://socket.example.com/feed", ORIGIN)).toBe("external");
    expect(classifyNetworkUrl("http://anydoc.example.evil.test/x", ORIGIN)).toBe("external");
  });

  it("ignores local-only schemes and non-network values", () => {
    expect(classifyNetworkUrl("data:text/plain,hi", ORIGIN)).toBe("ignored");
    expect(classifyNetworkUrl("blob:https://anydoc.example/123", ORIGIN)).toBe("ignored");
    expect(classifyNetworkUrl("about:blank", ORIGIN)).toBe("ignored");
    expect(classifyNetworkUrl("mailto:hi@example.com", ORIGIN)).toBe("ignored");
    expect(classifyNetworkUrl("", ORIGIN)).toBe("ignored");
    expect(classifyNetworkUrl("#section", ORIGIN)).toBe("ignored");
  });
});
