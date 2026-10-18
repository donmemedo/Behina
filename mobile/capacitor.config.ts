import type { CapacitorConfig } from "@capacitor/cli";

// The native app wraps the live web app (SSR + /api proxy), so it needs a reachable URL.
// Default = this dev machine on the LAN. For release: APP_URL=https://your-domain npx cap sync
const release = process.env.APP_MODE === "production";
if (release && !process.env.APP_URL) throw new Error("Production mobile sync requires APP_URL=https://your-domain");
const url = process.env.APP_URL || "http://192.168.1.106:3023";
const parsed = new URL(url);
if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
  throw new Error("APP_URL must be an HTTP(S) URL without credentials or a fragment");
}
if (release && parsed.protocol !== "https:") throw new Error("Production mobile sync requires HTTPS");

const config: CapacitorConfig = {
  appId: "ir.khanehbehineh.app",
  appName: "خانه‌بهینه",
  webDir: "www",
  backgroundColor: "#000000",
  server: { url, cleartext: parsed.protocol === "http:", errorPath: "error.html" },
};

export default config;
