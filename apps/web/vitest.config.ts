import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    clearMocks: true,
    environment: 'jsdom',
    env: {
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:3001',
    },
    restoreMocks: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
