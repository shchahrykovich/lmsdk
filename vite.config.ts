import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import pkg from "./package.json";

import {cloudflare} from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), cloudflare()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
})
