import { defineConfig } from 'astro/config'
import vercel from '@astrojs/vercel/serverless'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  site: undefined,
  vite: {
    plugins: [tailwindcss()],
  },
})
