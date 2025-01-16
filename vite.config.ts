import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    clearScreen: false,
    server: {
        strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_"],
    build: {
        target: ["es2021", "chrome100", "safari13"],
        minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
        sourcemap: !!process.env.TAURI_DEBUG,
        outDir: "../src-tauri/dist",
    },
    root: "./src",
    css: {
        preprocessorOptions: {
            scss: {
                additionalData:
                    process.platform === "linux"
                        ? '@import "./target/linux.scss";'
                        : "",
            },
        },
    },
    resolve: {
        alias: {
            managers: resolve(__dirname, "src/ts", "managers"),
            components: resolve(__dirname, "src/ts", "components"),
            schemas: resolve(__dirname, "src/ts", "schemas"),
            utils: resolve(__dirname, "src/ts", "utils"),
            icons: resolve(__dirname, "src/assets", "icons"),
        },
    },
});
