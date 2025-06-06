/* eslint-disable import/no-extraneous-dependencies */
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
        minify: !process.env.TAURI_DEBUG ? "terser" : false,
        sourcemap: !!process.env.TAURI_DEBUG,
        outDir: "../src-tauri/dist",
        terserOptions: {
            compress: {
                drop_console: true,
                drop_debugger: true,
                ecma: 2018,
                passes: 2,
                unsafe: true,
                hoist_funs: true,
                hoist_vars: true,
                keep_fargs: false,
                pure_getters: true,
                pure_new: true,
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
    root: "./src",
    css: {
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
            managers: resolve(__dirname, "src/ts", "managers"),
            components: resolve(__dirname, "src/ts", "components"),
            schemas: resolve(__dirname, "src/ts", "schemas"),
            utils: resolve(__dirname, "src/ts", "utils"),
            icons: resolve(__dirname, "icons"),
        },
    },
});
