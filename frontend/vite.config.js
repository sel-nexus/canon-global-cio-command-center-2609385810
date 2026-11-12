/** Configure the static build and isolated access tests. */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: Number(env.DEV_PORT || 5173), strictPort: true },
    preview: { host: '127.0.0.1', port: Number(env.PREVIEW_PORT || 4173), strictPort: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.js'],
      include: ['src/tests/**/*.test.{js,jsx}'],
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
    },
  };
});
