import { defineConfig } from 'astro/config'
import vercel from '@astrojs/vercel'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Preserve Astro 6 whitespace handling when rendering inline text.
  compressHTML: true,
  output: 'server',
  adapter: vercel(),
  site: undefined,
  vite: {
    plugins: [tailwindcss()],
  },
})
