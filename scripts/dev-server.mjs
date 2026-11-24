// Tiny static server used by `tauri dev` (devUrl) and for browser previews.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src'));
const port = Number(process.env.PORT || 1420);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer(async (req, res) => {
  try {
    // Work with URL-style paths first, so Windows backslashes never leak into the check.
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = resolve(root, rel);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('forbidden');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch (e) {
    console.log('404', req.url, e.message);
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => console.log(`dev server: http://localhost:${port} (serving ${root})`));
