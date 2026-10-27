// Pantallas táctiles (mando virtual) y configuración protegida con clave.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PF } = require('./helpers');

const Touch = PF.Touch;
const Settings = PF.Settings;
const MAP = { stick: true, main: [{ pad: 'a', label: 'Acción' }, { pad: 'x', label: 'Operar' }, { pad: 'b', label: 'Salir' }], aux: [{ pad: 'lb', label: '' }] };

// Móvil apaisado 844×390: el juego 16:9 deja ~75 px a cada lado.
function phone(layout = MAP) {
  const t = Touch.create();
  Touch.setLayout(t, layout);
  const s = 390 / 720;
  Touch.arrange(t, 844, 390, { ox: (844 - 1280 * s) / 2, oy: 0, gw: 1280 * s, gh: 390 });
  return t;
}

test('Táctil: en el móvil los botones van en los márgenes; en una TV, encima del juego', () => {
  const t = phone();
  assert.equal(t.buttons.length, 4);
  assert.ok(t.buttons.every((b) => b.inMargin), 'fuera del juego');
  assert.ok(t.buttons.filter((b) => b.side === 'right').every((b) => b.x > 844 - 76));
  assert.ok(t.buttons.every((b) => b.y + b.r <= 390 && b.y - b.r >= 0), 'caben en la altura');
  const tv = Touch.create();
  Touch.setLayout(tv, MAP);
  Touch.arrange(tv, 1920, 1080, { ox: 0, oy: 0, gw: 1920, gh: 1080 });
  assert.ok(tv.buttons.every((b) => !b.inMargin));
  assert.ok(tv.buttons.every((b) => b.r * 2 >= 46), 'tamaño mínimo para el dedo');
});

test('Táctil: un botón virtual funciona como el del mando, aunque el toque sea muy corto', () => {
  const t = phone();
  const a = t.buttons.find((b) => b.pad === 'a');
  assert.equal(Touch.down(t, 1, a.x, a.y).kind, 'button');
  Touch.up(t, 1, a.x, a.y);
  assert.equal(Touch.snapshot(t).held.a, true, 'el toque cuenta en el siguiente frame');
  assert.equal(Touch.snapshot(t).held.a, undefined);
  Touch.down(t, 2, a.x, a.y);
  assert.equal(Touch.snapshot(t).held.a, true);
  assert.equal(Touch.snapshot(t).held.a, true, 'mantener el dedo = mantener el botón');
  const x = t.buttons.find((b) => b.pad === 'x');
  Touch.move(t, 2, x.x, x.y);
  assert.equal(Touch.snapshot(t).held.x, true, 'deslizar a otro botón lo pulsa');
  Touch.up(t, 2, x.x, x.y);
  assert.equal(Touch.busy(t), false);
});

test('Táctil: arrastrar a la izquierda es un joystick; un toque corto es un clic', () => {
  const t = phone();
  assert.equal(Touch.down(t, 1, 250, 250, 0).kind, 'stick');
  Touch.move(t, 1, 250, 190);
  const s = Touch.snapshot(t);
  assert.ok(s.ly < -0.6 && s.held.lsUp && Math.abs(s.lx) < 0.1, 'hacia arriba');
  assert.equal(Touch.up(t, 1, 250, 190, 900), null, 'un arrastre no es clic');
  assert.equal(Touch.snapshot(t).ly, 0);
  Touch.down(t, 2, 200, 200, 1000);
  assert.deepEqual(Touch.up(t, 2, 202, 201, 1150), { kind: 'tap', x: 202, y: 201 });
  // A la derecha (o en juegos sin joystick) el toque es un clic directo.
  assert.equal(Touch.down(t, 3, 600, 100).kind, 'click');
  const tap = phone({ stick: false, main: [], aux: [] });
  assert.equal(Touch.down(tap, 1, 150, 200).kind, 'click');
  assert.equal(tap.buttons.length, 0);
});

test('Táctil: cada juego trae su mando virtual y los glifos muestran esos botones', () => {
  for (const g of PF.Games) {
    assert.ok(g.touch, `${g.id} tiene controles táctiles`);
    for (const b of [...(g.touch.main || []), ...(g.touch.aux || [])]) assert.ok(PF.Pad.BUTTONS.includes(b.pad), `${g.id}: ${b.pad}`);
  }
  const hunter = PF.Games.find((g) => g.id === 'hunter');
  assert.deepEqual(Touch.layoutLabels(hunter.touch), { a: 'A', x: 'X', b: 'B', lb: '1', rb: '2', lt: '3', rt: '4' });
  // En el menú, SHARE / VIEW abre la configuración.
  assert.deepEqual(PF.Pad.toMenu(['select']), ['config']);
});

test('Configuración: por defecto, Pasteurizadora Flash y Línea en Paro desactivadas', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  const cfg = Settings.load(storage);
  assert.deepEqual(cfg, { disabled: ['pasteurizer', 'stop'], difficulty: null });
  const ids = PF.Games.map((g) => g.id);
  assert.deepEqual(
    Settings.activeGames(PF.Games, cfg).map((g) => g.id).sort(),
    ids.filter((id) => !['pasteurizer', 'stop'].includes(id)).sort()
  );
  Settings.toggle(cfg, 'stop', ids);
  cfg.difficulty = 'dificil';
  Settings.save(cfg, storage);
  assert.deepEqual(Settings.load(storage), { disabled: ['pasteurizer'], difficulty: 'dificil' });
  // Datos dañados o sin almacenamiento: vuelve a los valores por defecto.
  mem.set(Settings.KEY, '{roto');
  assert.deepEqual(Settings.load(storage), { disabled: ['pasteurizer', 'stop'], difficulty: null });
  assert.deepEqual(Settings.load({ getItem: () => { throw new Error('bloqueado'); } }), { disabled: ['pasteurizer', 'stop'], difficulty: null });
  assert.equal(Settings.clean({ difficulty: 'imposible' }).difficulty, null);
});

test('Configuración: la clave es Odiseo y siempre queda al menos un juego activo', () => {
  assert.equal(Settings.check('Odiseo'), true);
  assert.equal(Settings.check(' odiseo '), true, 'sin importar mayúsculas (teclados de móvil)');
  assert.equal(Settings.check('Odisea'), false);
  assert.equal(Settings.check(''), false);
  const ids = ['a', 'b'];
  const cfg = { disabled: ['a'], difficulty: null };
  assert.equal(Settings.toggle(cfg, 'b', ids), false, 'no se puede desactivar el último');
  assert.deepEqual(cfg.disabled, ['a']);
  assert.equal(Settings.toggle(cfg, 'a', ids), true);
  assert.deepEqual(cfg.disabled, []);
  assert.deepEqual(Settings.activeGames([{ id: 'a' }], { disabled: ['a'] }).map((g) => g.id), ['a'], 'nunca un menú vacío');
});
