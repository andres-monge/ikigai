import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { LOCAL_APP_ORIGIN, configuredAppOrigin } from './shared/app-origin';

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const configured = process.env.BETTER_AUTH_URL ?? loadEnv(mode, import.meta.dirname, '').BETTER_AUTH_URL ?? '';
const localFallback = mode === 'development' && process.env.VERCEL !== '1' ? LOCAL_APP_ORIGIN : '';
const origin = configuredAppOrigin(configured || localFallback, { nodeEnv: mode, vercel: process.env.VERCEL });
if (!origin) {
  throw new Error('A valid BETTER_AUTH_URL origin is required for the client build');
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    {
      name: 'nami-public-origin',
      transformIndexHtml: (html: string) => html.replaceAll('__NAMI_APP_ORIGIN__', origin),
    },
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    // Output to repo-root public/ for Vercel CDN serving
    // (Vercel ignores express.static() and serves public/** via CDN)
    outDir: path.resolve(import.meta.dirname, "public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
