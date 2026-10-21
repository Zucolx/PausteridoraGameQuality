const test = require('node:test');
const assert = require('node:assert/strict');
const { PF, input } = require('./helpers');

const M = PF.Manual;
const W = PF.World;
const game = (id) => PF.Games.find((g) => g.id === id);
const DT = 1 / 60;

function tick(s, seconds, inp = input()) {
  const n = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < n && !s.over; i++) s.update(DT, i === 0 ? inp : input({ moveX: inp.moveX, moveY: inp.moveY, space: inp.space }));
}
const press = (s, ...keys) => tick(s, DT, input({ pressed: keys }));
const hold = (s, seconds) => tick(s, seconds, input({ space: true }));

test('la colección registra los cuatro juegos con sus tres dificultades', () => {
  assert.deepEqual(PF.Games.map((g) => g.id).sort(), ['cip', 'hunter', 'pasteurizer', 'stop']);
  for (const g of PF.Games) {
    for (const d of ['facil', 'normal', 'dificil']) {
      assert.ok(g.difficulties[d].length >= 2, `${g.id} ${d}`);
      const s = g.create(d, { seed: 1 });
      s.update(DT, input());
      const r = s.report();
      assert.ok(['S', 'A', 'B', 'C'].includes(r.rank));
      assert.ok(r.rows.length >= 4);
    }
  }
});

test('la burbuja registra cada error una sola vez', () => {
  const b = PF.Bubble.create();
  PF.Bubble.say(b, 'uno');
  PF.Bubble.say(b, 'uno');
  PF.Bubble.say(b, 'pista', { kind: 'tip' });
  assert.deepEqual(b.log, ['uno']);
  assert.equal(b.cur.title, 'Ojo…');
  PF.Bubble.say(b, 'dos');
  assert.equal(b.cur.title, '¡Esto no va así!');
});

test('TACT: valores del CIP Master Plan y mensajes didácticos', () => {
  assert.equal(M.tactError('alcalina', M.CLEANINGS.alcalina.tact), null);
  const cold = { ...M.CLEANINGS.sanitizacion.tact, temp: 60 };
  assert.match(M.tactError('sanitizacion', cold), /85 °C. ¡Las bacterias sobrevivieron!/);
  assert.match(M.tactError('alcalina', { ...M.CLEANINGS.alcalina.tact, conc: 1 }), /2,0 %/);
  assert.match(M.chemicalError('alcalina', 'nitrico'), /Soda cáustica \(Bevrosheen\)/);
});

test('CIP Rush: errores de orden y de químico disparan la burbuja', () => {
  const s = game('cip').create('normal', { seed: 3 });
  assert.equal(s.order.cleaning, 'alcalina');
  W.teleport(s.world, s.player, 'panel');
  press(s, 'interact');
  assert.equal(s.operating, null);
  assert.equal(s.stats.errors, 1);
  assert.match(s.bubble.cur.message, /químico/);
  W.teleport(s.world, s.player, 'tanks');
  press(s, 'interact');
  press(s, '2'); // ácido nítrico
  assert.equal(s.stats.errors, 2);
  assert.equal(s.task.chemical, null);
  assert.match(s.bubble.cur.message, /Soda cáustica/);
});

test('CIP Rush: la limpieza completa libera un lote y la suciedad hace fallar el ATP', () => {
  const s = game('cip').create('normal', { seed: 4 });
  W.teleport(s.world, s.player, 'tanks');
  press(s, 'interact');
  press(s, '1');
  assert.equal(s.task.chemical, 'soda');
  tick(s, 1);
  W.teleport(s.world, s.player, 'panel');
  press(s, 'interact');
  press(s, 'space'); // valores iniciales: incorrectos
  assert.equal(s.task.cip, 'idle');
  assert.ok(s.bubble.cur.message.length > 10);
  Object.assign(s.task.tact, M.CLEANINGS.alcalina.tact);
  press(s, 'space');
  assert.equal(s.task.cip, 'running');
  tick(s, 6);
  assert.equal(s.task.cip, 'done');
  // Verificar sin escobillar: ATP alto.
  W.teleport(s.world, s.player, 'verify');
  press(s, 'interact');
  for (let i = 0; i < 6; i++) press(s, i % 2 ? 'right' : 'left');
  tick(s, 3.2);
  assert.equal(s.stats.atpFails, 1);
  assert.ok(s.stats.atp[0] >= 50);
  // Escobillar todo y verificar de nuevo.
  W.teleport(s.world, s.player, 'filler');
  press(s, 'interact');
  for (const b of s.task.blobs) {
    // Lleva el cepillo a cada mancha y frota.
    s.ui.brush = { x: b.x, y: b.y };
    hold(s, 1);
  }
  assert.equal(s.task.blobs.every((b) => b.dirt <= 0), true);
  tick(s, 1);
  W.teleport(s.world, s.player, 'verify');
  press(s, 'interact');
  for (let i = 0; i < 6; i++) press(s, i % 2 ? 'right' : 'left');
  tick(s, 3.2);
  assert.equal(s.stats.lotes, 1);
  assert.ok(s.stats.atp[1] < 50);
  assert.notEqual(s.task.chemical, 'soda', 'nueva orden: hay que volver a empezar');
});

test('Cazador: herramienta equivocada = error con explicación; la correcta elimina el riesgo', () => {
  const s = game('hunter').create('normal', { seed: 5 });
  assert.equal(s.hazards.length, 5);
  assert.deepEqual([...new Set(s.hazards.map((h) => h.type))].sort(), ['biofilm', 'levadura', 'sarro', 'vidrio']);
  const h = s.hazards[0];
  s.player.x = h.x + 20;
  s.player.y = h.y + 30;
  press(s, 'interact');
  assert.equal(s.target, h);
  const right = M.TOOL_ORDER.indexOf(M.HAZARDS[h.type].tool);
  press(s, String(((right + 1) % 4) + 1));
  assert.equal(s.stats.errors, 1);
  assert.match(s.bubble.cur.message, new RegExp(M.HAZARDS[h.type].error.slice(0, 20).replace(/[()]/g, '.')));
  assert.equal(s.timeLeft < 58.5, true, 'penaliza 2 s en normal');
  press(s, String(right + 1));
  hold(s, 1.3);
  assert.equal(h.found, true);
  assert.equal(s.stats.found, 1);
  assert.equal(s.stats.firstTry, 0);
  assert.ok(s.fact && s.fact.text.length > 10);
});

test('Cazador: encontrar los 5 focos sin errores da rango S', () => {
  const s = game('hunter').create('facil', { seed: 6 });
  for (const h of s.hazards) {
    s.player.x = h.x + 20;
    s.player.y = h.y + 30;
    press(s, 'interact');
    press(s, String(M.TOOL_ORDER.indexOf(M.HAZARDS[h.type].tool) + 1));
    hold(s, 1.3);
  }
  tick(s, 2);
  assert.equal(s.over, true);
  assert.equal(s.report().rank, 'S');
});

test('Línea en Paro: CIP Completo para un paro de 2 h es una decisión incorrecta', () => {
  const s = game('stop').create('normal', { seed: 7 });
  s.banner = null;
  s.round = { hours: 2, rule: M.STOP_RULES[0], done: [], nextT: 0 };
  W.teleport(s.world, s.player, 'cip');
  press(s, 'interact');
  press(s, '2');
  assert.equal(s.stats.errors, 1);
  assert.match(s.bubble.cur.message, /retrasa la producción/);
});

test('Línea en Paro: protocolo completo = lote seguro; arrancar sin él = contaminada', () => {
  const s = game('stop').create('normal', { seed: 8 });
  s.toastT = 999;
  s.round = { hours: 3, rule: M.STOP_RULES[0], done: [], nextT: 0 };
  for (const st of ['tazon', 'agua', 'externa']) {
    W.teleport(s.world, s.player, st);
    press(s, 'interact');
    hold(s, 1.6);
  }
  assert.deepEqual(s.round.done.sort(), ['externa', 'interna', 'vaciado']);
  W.teleport(s.world, s.player, 'arranque');
  press(s, 'interact');
  hold(s, 1);
  assert.equal(s.stats.lotes, 1);
  tick(s, 2);
  s.round = { hours: 24, rule: M.STOP_RULES[1], done: [], nextT: 0 };
  W.teleport(s.world, s.player, 'arranque');
  press(s, 'interact');
  hold(s, 1);
  assert.equal(s.stats.contaminated, 1);
  assert.equal(s.lives, 1);
  assert.match(s.bubble.log.at(-1), /CIP Intermedio/);
});

test('Línea en Paro difícil: ceder a la presión es game over', () => {
  const s = game('stop').create('dificil', { seed: 9 });
  s.toastT = 0.01;
  tick(s, 0.1);
  assert.ok(s.toast);
  press(s, 'y');
  tick(s, 3);
  assert.equal(s.over, true);
  assert.equal(s.gameOver, true);
  assert.equal(s.report().rank, 'C');
  assert.match(s.report().headline, /GAME OVER/);
});

test('Pasteurizadora: la dificultad cambia el ritmo de las fallas', () => {
  const easy = game('pasteurizer').create('facil', { seed: 2 });
  const hard = game('pasteurizer').create('dificil', { seed: 2 });
  assert.equal(easy.g.diff.drift, 0.7);
  assert.equal(hard.g.diff.drift, 1.2);
  for (let i = 0; i < 60 * 30; i++) {
    easy.update(DT, input());
    hard.update(DT, input());
  }
  assert.ok(easy.g.ph.maxActive < hard.g.ph.maxActive);
  assert.ok(easy.g.ph.interval[0] > hard.g.ph.interval[0]);
});
