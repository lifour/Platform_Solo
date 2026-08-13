import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      // Keep an unhashed reader stylesheet for the isolated WKWebView pages
      // hosted inside the native UIPageViewController.
      for (const dir of ['data', 'fonts', 'css']) {
        const src = path.resolve(__dirname, dir)
        const dest = path.resolve(__dirname, 'dist', dir)
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true })
        }
      }
    },
  }
}

export default defineConfig({
  root: '.',
  publicDir: false,
  plugins: [copyStaticAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
})
