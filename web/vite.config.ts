import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // share the repo-root .env with the server; only VITE_* vars reach the browser
  envDir: "..",
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
});
