import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds a single, self-contained editor.html that runs from the file system.
export default defineConfig({
	plugins: [react(), tailwindcss(), viteSingleFile(), classicScript()],
	resolve: {
		alias: {
			"#": fileURLToPath(new URL("./src", import.meta.url)),
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	// no need for the public assets in a single-file build
	publicDir: false,
	build: {
		outDir: "standalone",
		emptyOutDir: true,
		target: "es2022",
		cssCodeSplit: false,
		assetsInlineLimit: 100_000_000,
		chunkSizeWarningLimit: 8000,
		rollupOptions: {
			input: "editor.html",
			// classic script so the file also works when opened from file://
			output: { format: "iife", inlineDynamicImports: true },
		},
	},
});

/**
 * Vite always emits `<script type="module">`, but the bundle is a self-contained
 * IIFE. A classic script tag avoids any file:// module/CORS surprises when the
 * exported HTML is opened straight from disk.
 */
function classicScript() {
	return {
		name: "opencut-classic-script",
		closeBundle() {
			const file = fileURLToPath(new URL("./standalone/editor.html", import.meta.url));
			const html = readFileSync(file, "utf8");
			const next = html.replace(/<script type="module" crossorigin>/g, "<script>");
			if (next !== html) writeFileSync(file, next);
		},
	};
}
