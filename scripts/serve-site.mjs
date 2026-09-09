#!/usr/bin/env node
// Local stand-in for the concierge.repo.box Caddy site: serves site/dist and
// proxies /concierge/* to a Concierge server, exactly like production. Used by
// the site browser gate and for hand-testing. Never used in production.
//
//   node scripts/serve-site.mjs --port 3470 --upstream http://127.0.0.1:3360
import { createServer, request } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : [])).filter((p) => p.length));
const PORT = Number(args.port || 3470);
const UPSTREAM = new URL(args.upstream || "http://127.0.0.1:3360");
const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "site", "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8" };

createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/concierge/")) {
    const proxied = request(
      { host: UPSTREAM.hostname, port: UPSTREAM.port, method: req.method, path: url.pathname.slice("/concierge".length) + url.search, headers: { ...req.headers, host: UPSTREAM.host } },
      (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); }
    );
    proxied.on("error", () => { res.writeHead(502); res.end("upstream unavailable"); });
    req.pipe(proxied);
    return;
  }
  let file = normalize(join(DIST, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`site on http://127.0.0.1:${PORT} → /concierge/* → ${UPSTREAM.origin}`));
