import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const developmentCertificate = path.resolve(__dirname, "certs", "aulia-care-dev.pfx");
  const https = fs.existsSync(developmentCertificate) && env.AULIA_TLS_PASSWORD
    ? { pfx: fs.readFileSync(developmentCertificate), passphrase: env.AULIA_TLS_PASSWORD }
    : undefined;

  return {
  root: "./frontend",
  plugins: [
    react(),

    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },

      manifest: {
        name: "Aulia Care",
        short_name: "Aulia Care",

        description:
          "Plateforme de gestion hospitalière Aulia Care",

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
    host: "0.0.0.0",
    https,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
    },
  },

  build: {
    outDir: "../dist-frontend",
    emptyOutDir: true,
  },
  };
});
