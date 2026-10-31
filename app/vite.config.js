import { defineConfig } from "vite";

/* BASE_PATH: where the app is served, e.g. /drogevoeten/ on GitHub Pages */
export default defineConfig({
  base: process.env.BASE_PATH || "/",
});
