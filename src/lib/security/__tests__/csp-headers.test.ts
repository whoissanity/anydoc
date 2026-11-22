import { describe, expect, it } from "vitest";
import nextConfig from "../../../../next.config";

describe("Security Headers & CSP (AGENTS.md rule 6)", () => {
  it("generates strict security headers for all routes", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const headersConfig = await nextConfig.headers!();
    expect(headersConfig).toHaveLength(1);

    const rootConfig = headersConfig[0];
    expect(rootConfig.source).toBe("/:path*");

    const headerMap = Object.fromEntries(
      rootConfig.headers.map((h) => [h.key, h.value])
    );

    // Verify mandatory headers
    expect(headerMap["X-Content-Type-Options"]).toBe("nosniff");
    expect(headerMap["X-Frame-Options"]).toBe("DENY");
    expect(headerMap["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headerMap["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    expect(headerMap["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains"
    );

    // Content Security Policy
    const csp = headerMap["Content-Security-Policy"];
    expect(csp).toBeDefined();

    // Verify CSP directives
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");

    // No external origins or CDNs allowed in script, font, style, or connect
    const externalOrigins = [
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
      "https://cdn.jsdelivr.net",
      "https://unpkg.com",
      "https://cdnjs.cloudflare.com",
      "https://www.google-analytics.com",
      "https://api.segment.io",
      "https://sentry.io",
    ];

    for (const origin of externalOrigins) {
      expect(csp).not.toContain(origin);
    }

    // Match exact snapshot to catch any accidental loosening or regressions
    expect(rootConfig.headers).toMatchInlineSnapshot(`
      [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff",
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY",
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin",
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31536000; includeSubDomains",
        },
      ]
    `);
  });
});
