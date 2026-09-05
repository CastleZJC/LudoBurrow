import { copyFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

// file:// 兼容核心配置：base './'（相对路径资产）+ 单文件 IIFE 产物（JS/CSS 全内联）
// 图片资源不进构建管线，放 public/assets/ 随包拷贝（dist/assets/...，相对路径引用）

// 构建时拷贝根 LICENSE 进 dist（发布原则：产物必须携带许可声明；verify-dist 第 7 步校验）
function copyLicense(): Plugin {
  return {
    name: 'copy-license',
    closeBundle() {
      copyFileSync(
        fileURLToPath(new URL('./LICENSE', import.meta.url)),
        fileURLToPath(new URL('./dist/LICENSE', import.meta.url)),
      )
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [vue(), viteSingleFile(), copyLicense()],
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
