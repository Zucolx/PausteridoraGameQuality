// Genera HTML autocontenidos (scripts y fuentes incrustados) para jugar sin conexión.
// Uso:
//   pnpm build                                   → las dos versiones en dist/:
//       lo-que-no-se-ve.html              con configuración (clave)
//       lo-que-no-se-ve-sin-ajustes.html  sin configuración: juegos y dificultad por defecto
//   node scripts/build.mjs ruta.html [--sin-ajustes]   → una sola versión
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function build({ ajustes = true } = {}) {
  let html = readFileSync(join(root, 'index.html'), 'utf8');

  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
    // "</script" dentro del código cerraría la etiqueta antes de tiempo.
    const code = readFileSync(join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
    return `<script>\n${code}</script>`;
  });

  // Versión sin configuración: se marca antes de cargar el resto de scripts.
  if (!ajustes) html = html.replace('<script>', '<script>\nglobalThis.PF = { BUILD: { ajustes: false } };\n</script>\n    <script>');

  html = html.replace(/url\(([^)'"]+\.woff2)\)/g, (_, file) => {
    const data = readFileSync(join(root, file)).toString('base64');
    return `url(data:font/woff2;base64,${data})`;
  });

  const external = html.match(/(?:src|href)="(?!data:)[^"]+"|url\((?!data:)[^)]+\)/g);
  if (external) throw new Error('Quedan recursos externos en el HTML: ' + external.join(', '));
  return html;
}

function write(out, html) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`Exportado ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
}

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
if (target) write(resolve(target), build({ ajustes: !args.includes('--sin-ajustes') }));
else {
  write(join(root, 'dist', 'lo-que-no-se-ve.html'), build());
  write(join(root, 'dist', 'lo-que-no-se-ve-sin-ajustes.html'), build({ ajustes: false }));
}
