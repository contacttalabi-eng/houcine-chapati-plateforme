import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Un seul fichier .env à la racine de plateforme/ pour les 3 applications
  envDir: fromRoot("../../"),
  // Logo, photos du menu, manifestes : partagés par les 3 applications
  publicDir: fromRoot("../../packages/shared/public"),
  server: { host: true },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
});
