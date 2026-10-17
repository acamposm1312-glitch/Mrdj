// Packs the web export (dist/) into ONE self-contained HTML file: the JS
// bundle is inlined and every image becomes a data: URI. Useful to share the
// PC version as a single file or to host it where only one page is allowed.
//   node scripts/single-html.mjs [out.html] [--fragment]
// --fragment omits <!doctype>/<html>/<head>/<body> for hosts that add their own.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const out = process.argv[2] ?? 'dist-single/mrdj.html';
const fragment = process.argv.includes('--fragment');

const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((m) => m[1]);
let js = scripts.map((s) => fs.readFileSync(path.join(dist, s), 'utf8')).join('\n;\n');

js = js.replace(/"(\/assets\/[^"]+\.png)"/g, (_, p) => {
  const file = path.join(dist, decodeURIComponent(p));
  if (!fs.existsSync(file)) return `"${p}"`;
  return `"data:image/png;base64,${fs.readFileSync(file).toString('base64')}"`;
});
js = js.replace(/<\/script/gi, '<\\/script');

const icon = fs.readFileSync(path.join(dist, 'icon-192.png')).toString('base64');
const head = `<title>MrDj</title>
<meta name="theme-color" content="#07070D">
<link rel="icon" href="data:image/png;base64,${icon}">
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; background: #07070d; margin: 0; }
  body { overflow: hidden; overscroll-behavior: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
  #root { display: flex; height: 100%; flex: 1; }
</style>`;
const body = `<div id="root"></div>\n<script>\n${js}\n</script>`;
const page = fragment
  ? `${head}\n${body}\n`
  : `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1e6).toFixed(2)} MB`);
