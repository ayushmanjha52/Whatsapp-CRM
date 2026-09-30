import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the API is proxied so the browser sees one origin: cookies stay
// SameSite=Strict-compatible and Socket.IO needs no CORS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const target = env.VITE_PROXY_TARGET || 'http://localhost:4000';
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': { target, changeOrigin: false },
        '/auth/whatsapp': { target, changeOrigin: false },
        '/socket.io': { target, ws: true, changeOrigin: false }
      }
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            charts: ['recharts'],
            motion: ['framer-motion']
          }
        }
      }
    }
  };
});
