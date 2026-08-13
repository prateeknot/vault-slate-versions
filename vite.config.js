import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // v10: split the vendor libraries into their own chunks so the app bundle
  // stays small and the >500kB build warning disappears. Caching improves too
  // (react/supabase change rarely, so browsers keep them cached longer).
  build: {
    rollupOptions: {
      output: {
        // rolldown (Vite 7) requires manualChunks as a function
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react'
          if (id.includes('node_modules/@supabase')) return 'supabase'
        },
      },
    },
  },
})