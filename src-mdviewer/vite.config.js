import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [tailwindcss()],
    base: "./",

    build: {
        outDir: "../src/mdViewer",
        emptyOutDir: true,
        modulePreload: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    mermaid: ["mermaid"]
                }
            }
        }
    },

    server: {
        port: 1421,
        strictPort: true
    }
});
