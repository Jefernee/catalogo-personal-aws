import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173, open: false },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/pruebas/preparar.js"],
    css: false,
    // .env.local trae la URL real de la API: en las pruebas no debe colarse.
    env: { VITE_API_URL: "", VITE_API_TOKEN: "" },
  },
});
