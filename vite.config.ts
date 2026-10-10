import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // The demo build is served from wherever it's hosted, not a site root.
  base: process.env.VITE_DEMO === "1" ? "./" : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
  },
});
