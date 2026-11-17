import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    __MARBLE_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")),
    __EXPORT_GUIDES__: readdirSync(page("content/guides")).filter((f) => /^how-to-(export-.+|set-up-ibkr-flex-query)\.md$/.test(f)).length,
  },
  base: "./",
  server: { port: 5173 },
  build: { rollupOptions: { input: {
    app: page("index.html"), site: page("site.html"), demo: page("demo.html"), legal: page("legal.html"), admin: page("admin.html"),
    ...Object.fromEntries(readdirSync(page("pages")).filter((f) => f.endsWith(".html")).map((f) => [`page-${f.slice(0, -5)}`, page(`pages/${f}`)])),
  } } },
});
