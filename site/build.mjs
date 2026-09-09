#!/usr/bin/env node
// Build concierge.repo.box: bundle main.js, copy the static files, write dist/.
// dist/ is what scripts/publish-site.sh hands to repo-box-publish.sh.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "dist");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

await build({
  entryPoints: [join(SRC, "main.js")],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  outfile: join(OUT, "main.js"),
  legalComments: "none",
});
cpSync(join(SRC, "index.html"), join(OUT, "index.html"));
cpSync(join(SRC, "styles.css"), join(OUT, "styles.css"));
writeFileSync(join(OUT, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://concierge.repo.box/sitemap.xml\n");
writeFileSync(
  join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://concierge.repo.box/</loc></url></urlset>\n`
);

// The page must never carry a provider key or a source map.
for (const f of ["index.html", "main.js", "styles.css"]) {
  const text = readFileSync(join(OUT, f), "utf8");
  if (/VENICE_API_KEY=|sk-[a-zA-Z0-9]{20,}/.test(text)) throw new Error(`secret-looking string in ${f}`);
  if (/sourceMappingURL/.test(text)) throw new Error(`source map reference in ${f}`);
}
for (const f of ["index.html", "main.js", "styles.css", "robots.txt", "sitemap.xml"]) {
  console.log(`${f.padEnd(12)} ${statSync(join(OUT, f)).size} bytes`);
}
console.log("built", OUT);
