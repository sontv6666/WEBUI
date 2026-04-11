import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  appType: "spa",
  preview: {
    // SPA: deep links resolve to index.html when using BrowserRouter + static preview
    strictPort: false,
  },
});
