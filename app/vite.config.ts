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
    // /demo goes to the hosted demo server by default (its faucet is public; presenter actions need
    // its token), so `npm run dev` works with no setup. Your own: DEMO_PROXY_TARGET=http://127.0.0.1:8787.
    proxy: { "/demo": { target: process.env.DEMO_PROXY_TARGET ?? "https://fathom-demo-api.hackathons-18c.workers.dev", changeOrigin: true } },
  },
});
