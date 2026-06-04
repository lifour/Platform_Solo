import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
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
  base: '',
  publicDir: false,
  plugins: [
    copyStaticAssets(),
    // 移除 <script> 的 crossorigin 属性（Android 本地服务器无 CORS 头）
    {
      name: 'remove-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/ crossorigin/g, '')
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
})
