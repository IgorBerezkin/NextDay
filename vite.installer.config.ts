import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "chrome110",
    outDir: "dist-installer",
    emptyOutDir: true,
    rollupOptions: { input: "installer.html" },
  },
});
