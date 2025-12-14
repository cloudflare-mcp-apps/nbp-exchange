/**
 * Vite configuration for MCP App widgets
 *
 * Builds React widgets into single-file HTML bundles that can be
 * served via Cloudflare Assets binding.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

const INPUT = process.env.INPUT;
if (!INPUT) {
    throw new Error("INPUT environment variable is not set. Example: INPUT=widgets/currency-rate.html vite build");
}

const isDevelopment = process.env.NODE_ENV === "development";

export default defineConfig({
    // Set root to web/ directory
    // INPUT paths are then relative to this root
    root: "web/",

    plugins: [
        react(),
        viteSingleFile(), // Bundle everything into single HTML
    ],

    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./web"),
        },
    },

    server: {
        port: 5173,
        strictPort: false,
        hmr: {
            overlay: true  // Show build errors in browser overlay
        }
    },

    build: {
        sourcemap: isDevelopment ? "inline" : undefined,
        cssMinify: !isDevelopment,
        minify: !isDevelopment,
        reportCompressedSize: !isDevelopment,  // Skip in dev for faster builds
        rollupOptions: {
            // INPUT is relative to root (web/), e.g., "widgets/currency-rate.html"
            input: path.resolve(__dirname, "web", INPUT),
        },
        // Output to web/dist (relative to root)
        // Result: web/dist/widgets/currency-rate.html
        outDir: "dist",
        emptyOutDir: false,
    },
});
