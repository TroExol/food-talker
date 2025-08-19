import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    root: './',
    setupFiles: path.resolve(__dirname, 'src/vitest/setup.ts'),
    pool: 'threads', // Убрать при наличии ошибок запуска тестов
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
