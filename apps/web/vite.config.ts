import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const config = defineConfig(({ command }) => ({
  resolve: { tsconfigPaths: true },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['.e2b.app', '.arena.ai', 'localhost'],
  },
  plugins: [
    // the Workers runtime is only needed for `build`/`deploy`; in dev it would
    // bind extra localhost-only ports and shadow the preview
    ...(command === 'build' ? [cloudflare({ viteEnvironment: { name: 'ssr' } })] : []),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
}))

export default config
