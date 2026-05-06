import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      // Copy data/ and fonts/ directories into dist/
      for (const dir of ['data', 'fonts']) {
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
