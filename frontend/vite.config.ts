import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "./frontend",
  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },

      manifest: {
        name: "D7 Clinic",
        short_name: "D7 Clinic",

        description:
          "Plateforme de gestion hospitalière D7 Clinic",

        theme_color: "#ffffff",

        background_color: "#ffffff",

        display: "standalone",

        orientation: "portrait",

        start_url: "/",

        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png"
          }
        ]
      }
    }),

    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  

  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: "../dist-frontend",
    emptyOutDir: true,
  },
});