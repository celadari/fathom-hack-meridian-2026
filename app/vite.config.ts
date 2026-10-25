import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // bb.js ships wasm and workers; let Vite serve it as-is.
  optimizeDeps: { exclude: ["@aztec/bb.js"] },
  build: { target: "es2022" },
  server: {
    port: 5173,
    // The demo server (scripts/demo-server.ts) holds the testnet demo keys.
    proxy: { "/demo": "http://127.0.0.1:8787" },
  },
});
