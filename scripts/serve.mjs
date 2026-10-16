// Petit serveur local pour tester le dossier jeu/ (comme sur GitHub Pages) : node scripts/serve.mjs  ->  http://localhost:8080
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'jeu');
const PORT = Number(process.env.PORT || 8080);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const full = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Introuvable'); }
}).listen(PORT, () => console.log(`Lorcana Pocket : http://localhost:${PORT}`));
