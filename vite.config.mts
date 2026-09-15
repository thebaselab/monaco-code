/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2024 TypeFox and others.
 * Licensed under the MIT License. See license in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { defineConfig } from "vite";
import path from "node:path";
import vsixPlugin from "@codingame/monaco-vscode-rollup-vsix-plugin";
import importMetaUrlPlugin from "@codingame/esbuild-import-meta-url-plugin";

export default defineConfig({
  build: {
    outDir: "monaco-textmate.bundle",
    assetsDir: "assets",
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        name: "monaco-textmate",
        exports: "named",
        assetFileNames: (assetInfo) => {
          return `assets/${assetInfo.name}`;
        },
      },
    },
    target: "esnext",
  },
  plugins: [vsixPlugin()],
  resolve: {
    alias: {
      "@codingame/monaco-vscode-api/vscode": path.resolve(
        __dirname,
        "node_modules/@codingame/monaco-vscode-api/vscode/src"
      ),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [importMetaUrlPlugin],
    },
  },
  define: {
    rootDirectory: JSON.stringify(__dirname),
  },
  worker: {
    format: "es",
  },
});