// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // https://vite.dev/config/
// export default defineConfig({
//   plugins: [react()],
// })

import { cwd } from "node:process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, cwd(), "");
  const backendUrl = env.VITE_API_URL || "http://localhost:5028";
  const devHost = env.VITE_HOST || "127.0.0.1";
  const devPort = Number(env.VITE_PORT || 5173);

  return {
    build: {
      outDir: "backend/public",
      emptyOutDir: true,
    },

    server: {
      host: devHost,
      port: devPort,
      proxy: {
        // Proxy all API requests to backend server
        "^/(auth|user|student|announcement|course|batch|teacher|employees|test-studio|enrollment|fee|health|accounting|attendance|holiday|roles|settings)(/|$)":
          {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
            ws: true, // Enable WebSocket proxying
            configure: (proxy, options) => {
              proxy.on("error", (err) => {
                console.log("proxy error", err);
              });
              proxy.on("proxyReq", (...args) => {
                const req = args[1];
                if (!req) return;
                console.log(
                  "Proxying:",
                  req.method,
                  req.url,
                  "→",
                  options.target + req.url,
                );
              });
            },
          },
      },
    },

    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.ico",
          "apple-touch-icon.png",
          "masked-icon.svg",
        ],
        manifest: {
          name: "ODC Academy - Advanced Digital Courses",
          short_name: "ADC Academy",
          description:
            "ADC Academy - Your premier destination for advanced digital courses and professional learning. Access high-quality educational content, track your progress, and master new skills offline and online.",
          theme_color: "#01134C",
          background_color: "#01134C",
          display: "standalone",
          scope: "/",
          start_url: "/",
          orientation: "portrait",
          icons: [
            {
              src: "pwa-64x64.png",
              sizes: "64x64",
              type: "image/png",
            },
            {
              src: "pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,json,bin}"],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: "CacheFirst",
              options: {
                cacheName: "gstatic-fonts-cache",
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: "CacheFirst",
              options: {
                cacheName: "images-cache",
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              urlPattern: /^https:\/\/api\.yourapp\.com\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "api-cache",
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 5, // 5 minutes
                },
                networkTimeoutSeconds: 10,
              },
            },
          ],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
        },
        devOptions: {
          enabled: true, // Enable PWA in development
          type: "module",
        },
      }),
    ],
  };
});
