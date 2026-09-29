import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react(), {
    name: 'camera-test-fixture',
    transformIndexHtml(html, context) {
      if (context.server && (context.originalUrl ?? context.path).split('?')[0] === '/__test__/camera') {
        return { html, tags: [{ tag: 'script', attrs: { src: '/tests/camera-fixture.js' }, injectTo: 'head' }] };
      }
      return html;
    },
  }],
  server: { port: 5178, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8000' } },
});
