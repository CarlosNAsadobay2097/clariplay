import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Migración desde Create React App (react-scripts está descontinuado y tiene
// vulnerabilidades sin parche). Se mantienen el puerto 3000 (CORS) y la
// carpeta de salida "build" para no romper el despliegue existente.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  preview: {
    port: 3000,
  },
  build: {
    outDir: 'build',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.test.{js,jsx}'],
  },
});
