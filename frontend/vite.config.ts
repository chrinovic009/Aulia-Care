import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  root: "./frontend",
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],

  server: {
    proxy: {
      "/auth": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
      "/patients": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
      "/appointments": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
      "/hospitalizations": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
      "/consultations": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
      "/payments": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
      "/billing": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
      "/notifications": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },

  build: {
    outDir: "../dist-frontend",
    emptyOutDir: true,
  },
});