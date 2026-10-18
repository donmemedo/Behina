import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Optional bounded in-process build for restricted, memory-constrained CI.
  experimental: process.env.SEALED_BUILD_IN_PROCESS === "1" ? { webpackBuildWorker: false, cpus: 1 } : {},
  async headers() {
    // Next hydration uses inline scripts; nonce-based CSP needs separate release validation.
    const development = process.env.NODE_ENV !== "production";
    const csp = [
      "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
      "form-action 'self'", `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
      `connect-src 'self'${development ? " ws: wss:" : ""}`,
    ].join("; ");
    return [
      { source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: csp },
      ] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/dashboard", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, max-age=0, must-revalidate" }] },
    ];
  },
  // Browser talks to same origin; Next proxies /api to FastAPI (no CORS needed).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.BACKEND_URL ?? "http://localhost:8023"}/api/:path*` }];
  },
};

export default config;
