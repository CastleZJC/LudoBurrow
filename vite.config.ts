import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

// file:// 兼容核心配置：base './'（相对路径资产）+ 单文件 IIFE 产物（JS/CSS 全内联）
// 图片资源不进构建管线，放 public/assets/ 随包拷贝（dist/assets/...，相对路径引用）
export default defineConfig({
  base: './',
  plugins: [vue(), viteSingleFile()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // singlefile 插件会将小资源内联；public/ 下的图库不受影响，仍按相对路径分发
    assetsInlineLimit: 0,
  },
})
