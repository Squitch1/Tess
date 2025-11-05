import cssnano from "cssnano";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
    root: "./src",
    clearScreen: false,
    server: {
        strictPort: true,
    },
    build: {
        target: ["esnext"],
        minify: !process.env.TAURI_DEBUG ? "terser" : false,
        sourcemap: !!process.env.TAURI_DEBUG,
        outDir: "../src-tauri/dist",
        terserOptions: {
            compress: {
                booleans_as_integers: true,
                drop_console: true,
                drop_debugger: true,
                ecma: 2020,
                hoist_funs: true,
                hoist_vars: true,
                keep_fargs: false,
                passes: 3,
                pure_getters: true,
                pure_new: true,
                unsafe: true,
                unsafe_arrows: true,
                unsafe_math: true,
                unsafe_proto: true,
            },
        },
        rollupOptions: {
            output: {
                assetFileNames: "[hash:4][extname]",
            },
        },
    },
    css: {
        postcss: {
            plugins: [
                cssnano({
                    preset: "default",
                }),
            ],
        },
        preprocessorOptions: {
            scss: {
                additionalData:
                    process.platform === "linux"
                        ? '@use "./target/linux.scss";'
                        : "",
            },
        },
    },
    resolve: {
        alias: {
            "@/managers": resolve(__dirname, "src/ts", "managers"),
            "@/components": resolve(__dirname, "src/ts", "components"),
            "@/schemas": resolve(__dirname, "src/ts", "schemas"),
            "@/utils": resolve(__dirname, "src/ts", "utils"),
            "@/icons": resolve(__dirname, "icons"),
        },
    },
});
