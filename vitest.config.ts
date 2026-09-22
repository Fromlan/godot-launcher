import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/unit/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/main/services/**/*.ts', 'src/main/utils/**/*.ts'],
      reporter: ['text', 'json-summary']
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  }
});
