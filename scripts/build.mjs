// Genera un único HTML autocontenido (scripts y fuentes incrustados) para jugar sin conexión.
// Uso: pnpm build [ruta-de-salida]   (por defecto dist/lo-que-no-se-ve.html)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'dist', 'lo-que-no-se-ve.html'));

export function build() {
  let html = readFileSync(join(root, 'index.html'), 'utf8');

  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
    // "</script" dentro del código cerraría la etiqueta antes de tiempo.
    const code = readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
    return `<script>\n${code}</script>`;
  });

  html = html.replace(/url\(([^)'"]+\.woff2)\)/g, (_, file) => {
    const data = readFileSync(join(root, file)).toString('base64');
    return `url(data:font/woff2;base64,${data})`;
  });

  const external = html.match(/(?:src|href)="(?!data:)[^"]+"|url\((?!data:)[^)]+\)/g);
  if (external) throw new Error('Quedan recursos externos en el HTML: ' + external.join(', '));
  return html;
}

const html = build();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Exportado ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
