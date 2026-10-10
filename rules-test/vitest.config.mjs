import { defineConfig } from 'vitest/config';

// Configuración propia para que Vitest no use la del proyecto principal
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['rules.test.mjs'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
