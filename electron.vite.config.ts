import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@': resolve('src')
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@web': resolve('src/renderer/src'),
        '@': resolve('src')
      }
    },
    plugins: [vue(), tailwindcss()]
  }
})
