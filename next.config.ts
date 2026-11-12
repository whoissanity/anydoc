import type { NextConfig } from "next";

// Security headers locked to this origin: script-src needs 'unsafe-inline' for
// the App Router's hydration tags (no nonce middleware) and 'unsafe-eval' in dev
// only for React Fast Refresh. PDF.js cmaps and OCR worker/assets are vendored
// under /public/vendor, never a CDN.
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} 'wasm-unsafe-eval'`,
  // The layout links Google Fonts at runtime, so both hosts must be allowed.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // pdf.js optionally requires node-canvas; never bundle it for the browser.
      canvas: false,
    };
    return config;
  },
  // Turbopack ignores the webpack hook above and has no `false` alias, so `canvas`
  // maps to an empty stub module instead (paths resolve relative to this file).
  turbopack: {
    resolveAlias: {
      canvas: "./src/lib/empty-module.ts",
    },
  },
};

export default nextConfig;
