import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // bb.js ships wasm and workers; let Vite serve it as-is.
  optimizeDeps: { exclude: ["@aztec/bb.js"] },
  build: { target: "es2022" },
  // The prover worker imports bb.js and noir_js (wasm, top-level await): bundle it as an ES module.
  worker: { format: "es" },
  server: {
    port: 5173,
    // The demo server (scripts/demo-server.ts) holds the testnet demo keys.
    // DEMO_PROXY_TARGET=https://fathom-demo-api.<subdomain>.workers.dev uses the hosted demo server
    // (its faucet is public; ?demo actions need the token), so no local server competes for its keys.
    proxy: { "/demo": { target: process.env.DEMO_PROXY_TARGET ?? "http://127.0.0.1:8787", changeOrigin: true } },
  },
});
