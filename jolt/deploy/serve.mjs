#!/usr/bin/env node
/** Zero-dependency static server for the built game (../dist).
 *  Small on purpose: no packages to install or update on the home box. */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
// Fleet contract: bind loopback only (the tailnet proxy fronts it). The
// standalone LAN path (deploy/jolt.service) overrides HOST to 0.0.0.0.
const PORT = Number(process.env.PORT || 8801)
const HOST = process.env.HOST || '127.0.0.1'
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x')
    // normalize + prefix check = no path traversal
    let path = normalize(join(ROOT, decodeURIComponent(url.pathname)))
    if (!path.startsWith(ROOT)) { res.writeHead(403); res.end(); return }
    let s = await stat(path).catch(() => null)
    if (!s || s.isDirectory()) path = join(ROOT, 'index.html')
    const body = await readFile(path)
    res.writeHead(200, {
      'content-type': MIME[extname(path)] || 'application/octet-stream',
      // index.html must revalidate so updates land on refresh; hashed assets can cache hard
      'cache-control': path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    res.end(body)
  } catch { res.writeHead(500); res.end() }
}).listen(PORT, HOST, () => console.log(`jolt serving on http://${HOST}:${PORT}`))
