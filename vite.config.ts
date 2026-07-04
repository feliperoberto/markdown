import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// GitHub Pages serves this project from a custom domain (see CNAME),
// so assets are resolved from the domain root rather than a repo subpath.
export default defineConfig({
  base: '/',
  plugins: [preact()],
  server: {
    open: '/app.html',
  },
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL('./app.html', import.meta.url)),
    },
  },
  resolve: {
    alias: {
      '@/features': fileURLToPath(new URL('./src/features', import.meta.url)),
      '@/components': fileURLToPath(new URL('./src/components', import.meta.url)),
      '@/lib': fileURLToPath(new URL('./src/lib', import.meta.url)),
    },
  },
})
