import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Dev only: POST a canvas data URL to /__shot?name=x and it lands in .shots/x.png (for automated checks). */
function shots(): Plugin {
  return {
    name: 'derby-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const url = new URL(req.url ?? '', 'http://x');
        const name = (url.searchParams.get('name') ?? 'shot').replace(/[^\w.-]/g, '_');
        // video frames: ?dir=<folder>&ext=jpg writes .shots/<folder>/<name>.jpg
        const sub = (url.searchParams.get('dir') ?? '').replace(/[^\w-]/g, '');
        const ext = url.searchParams.get('ext') === 'jpg' ? 'jpg' : 'png';
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (c: string) => (body += c));
        req.on('end', () => {
          const dir = join(server.config.root, '.shots', sub);
          mkdirSync(dir, { recursive: true });
          const b64 = body.replace(/^data:image\/\w+;base64,/, '');
          writeFileSync(join(dir, `${name}.${ext}`), Buffer.from(b64, 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [shots()],
  server: { port: 5190, strictPort: true, host: '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
});
