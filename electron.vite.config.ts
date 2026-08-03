import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'

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
    plugins: [
      vue(),
      VueI18nPlugin({
        include: [resolve('src/renderer/src/locales/**')]
      }),
      tailwindcss()
    ]
  }
})
