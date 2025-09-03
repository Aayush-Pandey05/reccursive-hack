import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  // ✅ ADD THIS LINE to ensure relative paths are used in the build output.
  base: "",

  plugins: [react(), tailwindcss()],
});
