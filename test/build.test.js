const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const root = join(__dirname, '..');
const DIST = join(root, 'dist', 'lo-que-no-se-ve.html');

function buildTo() {
  const out = join(mkdtempSync(join(tmpdir(), 'pf-build-')), 'juego.html');
  execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs'), out], { stdio: 'pipe' });
  return readFileSync(out, 'utf8');
}

test('el exportable es un único HTML sin recursos externos', () => {
  const html = buildTo();
  assert.doesNotMatch(html, /<script src=/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.equal((html.match(/data:font\/woff2;base64,/g) || []).length, 4);
  for (const name of [
    'PF.Draw = {',
    'PF.Bubble = {',
    'PF.Manual = {',
    'PF.Screens = {',
    'PF.Sim = {',
    'PF.Render = {',
    "id: 'pasteurizer'",
    "id: 'cip'",
    "id: 'hunter'",
    "id: 'stop'",
    "id: 'pu'",
    'PF.Pad = {',
    'requestAnimationFrame(frame)',
  ]) {
    assert.ok(html.includes(name), `falta ${name}`);
  }
});

test('dist/ está al día con el código (si falla: pnpm build)', () => {
  assert.ok(existsSync(DIST), 'falta dist/lo-que-no-se-ve.html: ejecuta pnpm build');
  assert.ok(readFileSync(DIST, 'utf8') === buildTo(), 'dist/lo-que-no-se-ve.html está desactualizado: ejecuta pnpm build');
});
