/** Configure the SPA build, environment-owned API proxy and isolated tests. */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: Number(env.DEV_PORT || 5173), strictPort: true,
      proxy: env.API_PROXY_TARGET ? { '/api': { target: env.API_PROXY_TARGET, changeOrigin: true } } : undefined },
    preview: { host: '127.0.0.1', port: Number(env.PREVIEW_PORT || 4173), strictPort: true,
      proxy: env.API_PROXY_TARGET ? { '/api': { target: env.API_PROXY_TARGET, changeOrigin: true } } : undefined },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/tests/setup.js'],
      include: ['src/tests/**/*.test.{js,jsx}'],
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
    },
  };
});
