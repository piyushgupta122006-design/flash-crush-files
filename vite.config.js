import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-core';
            }
            if (id.includes('@material/web')) {
              return 'm3-web-components';
            }
            if (id.includes('pdf-lib') || id.includes('pdfjs-dist') || id.includes('@pdfsmaller')) {
              return 'pdf-vendor';
            }
            if (id.includes('tesseract.js') || id.includes('@imgly') || id.includes('onnxruntime') || id.includes('upscaler')) {
              return 'ai-vision-vendor';
            }
            if (id.includes('jszip') || id.includes('qrcode') || id.includes('imagetracerjs') || id.includes('exifreader') || id.includes('react-rnd')) {
              return 'utils-vendor';
            }
            if (id.includes('peerjs') || id.includes('firebase')) {
              return 'network-vendor';
            }
          }
        }
      }
    },
    chunkSizeWarningLimit: 1200,
  }
})
