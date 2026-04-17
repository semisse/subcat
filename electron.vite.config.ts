import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      lib: { entry: 'src/electron/main.js' },
      rollupOptions: {
        external: ['better-sqlite3', 'electron-updater'],
      },
    },
  },
  preload: {
    build: {
      lib: { entry: 'renderer/preload.js' },
    },
  },
  renderer: {
    root: 'renderer/src-new',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: 'renderer/src-new/index.html',
      },
    },
  },
})
