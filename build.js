#!/usr/bin/env node
/* alcoia — site builder.
 *
 * Deliberately tiny. It does includes and nothing else: no bundling, no
 * transforms, no plugins, no dependencies. The brief (§14) allows exactly this
 * much and no more — the header, footer and legal boilerplate repeat across
 * ~21 pages, and hand-maintaining them would make a nav change 21 edits.
 *
 *   node build.js            build src/ -> dist/
 *   node build.js --serve    build, then serve dist/ on :8080 with clean URLs
 *   node build.js --watch    rebuild on change (implied by --serve)
 *
 * Everything in dist/ is plain static HTML. Nothing at runtime depends on this
 * file; it is a convenience for the author, not a dependency of the site.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');

const SITE = {
  origin: 'https://alcoia.com', // TODO: owner to confirm the domain (brief §14)
  name: 'alcoia',
  // TODO: owner to supply once live — brief §10 requires the Chrome Web
  // Store link before ship. Until the extension is published, "Add to
  // Chrome" points at the install instructions instead of a dead store
  // link, which is the honest and functional interim state.
  'chrome-url': '/docs#install',
  'github-url': 'https://github.com/alcoia-group/alcoia',
  'github-repo-label': 'github.com/alcoia-group/alcoia',
  // Extension ID for magic-link handoff (src/pages/auth-verify.html)
  // Set to the actual extension ID when available.
  // Local dev: find at chrome://extensions/ after loading the extension
  // Web Store: the published extension's store ID
  'extension-id': process.env.EXTENSION_ID || 'LOCAL_DEV_EXTENSION_ID',
  // API base URL for server requests (src/pages/auth-verify.html)
  // Local dev: http://localhost:3000 (alcoiaServer default port)
  // Staging/Prod: the actual API origin (e.g. https://api.alcoia.com)
  'api-base-url': process.env.API_BASE_URL || 'http://localhost:3000',
  // Console URL for sign-in redirect (src/pages/auth-verify.html, src/pages/start-pilot.html)
  // Local dev: http://localhost:8080 (alcoiaConsole dev server port)
  // Staging/Prod: the actual console origin (e.g. https://console.alcoia.com)
  'console-url': process.env.CONSOLE_URL || 'http://localhost:8080',
};

/* ── template ───────────────────────────────────────────────────────────── */

const readPartial = (name) =>
  fs.readFileSync(path.join(SRC, 'partials', `${name}.html`), 'utf8');

// {{> name }} → partial, recursively (partials may include partials).
function expandIncludes(html, depth = 0) {
  if (depth > 8) throw new Error('include depth exceeded — circular partial?');
  return html.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, name) =>
    expandIncludes(readPartial(name), depth + 1)
  );
}

// {{ key }} → front-matter value, or '' when absent.
const fill = (html, data) =>
  html.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, key) =>
    data[key] === undefined ? '' : String(data[key])
  );

/* Front matter is an HTML comment at the very top of a page:
 *
 *   <!--alc
 *   title: Pricing
 *   description: ...
 *   -->
 */
function parsePage(raw) {
  const m = raw.match(/^<!--alc\s*\n([\s\S]*?)\n-->\s*\n?/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, body: raw.slice(m[0].length) };
}

const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── walking ────────────────────────────────────────────────────────────── */

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  for (const file of walk(from)) {
    const dest = path.join(to, path.relative(from, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
}

/* ── build ──────────────────────────────────────────────────────────────── */

function build() {
  const started = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const layout = fs.readFileSync(path.join(SRC, 'layouts', 'base.html'), 'utf8');
  const pagesDir = path.join(SRC, 'pages');
  const pages = walk(pagesDir).filter((f) => f.endsWith('.html'));
  const routes = [];

  for (const file of pages) {
    const rel = path.relative(pagesDir, file).replace(/\\/g, '/');
    const { data, body } = parsePage(fs.readFileSync(file, 'utf8'));

    // index.html -> /, foo.html -> /foo, legal/bar.html -> /legal/bar
    const route =
      rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, '');

    const page = {
      ...SITE,
      ...data,
      path: route,
      canonical: SITE.origin + (route === '/' ? '/' : route),
      title: data.title || SITE.name,
      // <title> reads "thing — alcoia", except on the home page.
      doctitle:
        route === '/'
          ? `${SITE.name} — ${data.title || 'read it once, actually keep it'}`
          : `${data.title} — ${SITE.name}`,
      description: data.description || '',
      bodyclass: data.bodyclass || '',
      head: data.head || '',
      scripts: data.scripts || '',
    };

    let html = fill(expandIncludes(layout.replace('{{content}}', () => body)), page);

    // Nav links carry data-path; the one matching this page gets aria-current.
    html = html.replace(
      new RegExp(`data-path="${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
      `data-path="${route}" aria-current="page"`
    );

    const dest = path.join(OUT, rel === 'index.html' ? 'index.html' : rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);

    if (data.noindex !== 'true') {
      routes.push({ route, priority: data.priority || (route === '/' ? '1.0' : '0.7') });
    }
  }

  copyDir(path.join(SRC, 'assets'), path.join(OUT, 'assets'));
  copyDir(path.join(SRC, 'css'), path.join(OUT, 'css'));
  copyDir(path.join(SRC, 'js'), path.join(OUT, 'js'));
  copyDir(path.join(SRC, 'static'), OUT);

  writeSitemap(routes);

  const bytes = walk(OUT).reduce((n, f) => n + fs.statSync(f).size, 0);
  console.log(
    `built ${pages.length} pages → dist/  (${(bytes / 1024).toFixed(0)} KB total, ${Date.now() - started}ms)`
  );
}

function writeSitemap(routes) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = routes
    .sort((a, b) => a.route.localeCompare(b.route))
    .map(
      (r) =>
        `  <url>\n    <loc>${escapeAttr(SITE.origin + (r.route === '/' ? '/' : r.route))}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n    <priority>${r.priority}</priority>\n  </url>`
    )
    .join('\n');
  fs.writeFileSync(
    path.join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
}

/* ── dev server (clean URLs, like Cloudflare Pages) ─────────────────────── */

function serve(port = 8080) {
  const http = require('http');
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.xml': 'application/xml',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json',
  };
  http
    .createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const candidates = [
        path.join(OUT, url),
        path.join(OUT, url + '.html'),
        path.join(OUT, url, 'index.html'),
      ];
      for (const file of candidates) {
        if (!file.startsWith(OUT)) break;
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
          return res.end(fs.readFileSync(file));
        }
      }
      res.writeHead(404, { 'content-type': types['.html'] });
      const notFound = path.join(OUT, '404.html');
      res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : '404 (dist/404.html not built yet)');
    })
    .listen(port, () => console.log(`serving dist/ → http://localhost:${port}`));
}

function watch() {
  let timer = null;
  fs.watch(SRC, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        build();
      } catch (err) {
        console.error(err.message);
      }
    }, 80);
  });
  console.log('watching src/ …');
}

build();
if (process.argv.includes('--serve')) {
  serve(Number(process.argv[process.argv.indexOf('--port') + 1]) || 8080);
  watch();
} else if (process.argv.includes('--watch')) {
  watch();
}
