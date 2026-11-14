import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// TANGENT_API points the dev server at another backend (a second checkout runs its own beside the first).
const api = process.env.TANGENT_API ?? 'http://localhost:4000';

// The API address is read at build time; the dev server proxies it so the browser makes same-origin calls.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/v1': api, '/console/v1': api, '/hooks': api } },
  build: { sourcemap: true, target: 'es2022' },
});
