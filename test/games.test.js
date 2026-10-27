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

test('la colección registra los seis juegos con sus tres dificultades', () => {
  assert.deepEqual(PF.Games.map((g) => g.id).sort(), ['admin', 'cip', 'hunter', 'pasteurizer', 'pu', 'reaction', 'stop']);
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

test('Control de UP: la fórmula UP = t × 1,393^(T − 60)', () => {
  const U = PF.PU;
  assert.equal(U.units(10, 60), 10);
  assert.ok(Math.abs(U.units(10, 63) - 27.03) < 0.01);
  assert.ok(Math.abs(U.units(10, U.tempFor(26, 10)) - 26) < 1e-9);
  assert.equal(U.status(23.9), 'sub');
  assert.equal(U.status(24), 'ok');
  assert.equal(U.status(30), 'ok');
  assert.equal(U.status(30.1), 'sobre');
});

function puGame(diff = 'normal', opts = {}) {
  const s = game('pu').create(diff, { seed: 11, ...opts });
  s.nextEvent = 999; // sin perturbaciones: comportamiento predecible
  s.help = false;
  return s;
}

test('Control de UP: a temperatura constante cada lote sale con t × 1,393^(T − 60)', () => {
  const s = puGame();
  tick(s, 12);
  assert.ok(s.history.length >= 1);
  for (const h of s.history) assert.ok(Math.abs(h.pu - PF.PU.units(10, s.setpoint)) < 0.3, `UP ${h.pu}`);
  assert.equal(s.history[0].dest, 'fill');
  assert.equal(s.stats.okFilled, s.history.length);
});

test('Control de UP: la llave decide y los errores explican el porqué', () => {
  const s = puGame();
  s.setpoint = s.temp = 66; // ~ 67 UP: sobrepasteurizada
  tick(s, 12);
  assert.ok(s.stats.badFilled >= 1);
  assert.match(s.bubble.log[0], /SOBREPASTEURIZADO/);
  press(s, '2'); // llave → descarte
  assert.equal(s.valve, 'drain');
  const before = s.stats.correctDrain;
  tick(s, 4);
  assert.ok(s.stats.correctDrain > before);
  // Cerveza buena al descarte: también es un error.
  s.setpoint = s.temp = PF.PU.tempFor(26, 10);
  tick(s, 12);
  assert.ok(s.stats.goodWasted >= 1);
  assert.ok(s.bubble.log.some((m) => /cerveza buena/.test(m)));
});

test('Control de UP: el mando mueve la consigna y la llave (modo directo)', () => {
  const s = puGame();
  const t0 = s.setpoint;
  for (let i = 0; i < 60; i++) s.update(DT, input({ pad: { held: {}, pressed: [], ly: -1 } }));
  assert.ok(s.setpoint > t0 + 1);
  s.update(DT, input({ pad: { held: {}, pressed: ['b'], ly: 0 } }));
  assert.equal(s.valve, 'drain');
  s.update(DT, input({ pad: { held: {}, pressed: ['a'], ly: 0 } }));
  assert.equal(s.valve, 'fill');
  s.update(DT, input({ pad: { held: {}, pressed: ['y'], ly: 0 } }));
  assert.equal(s.help, true, '△ / Y abre la ayuda');
  const time = s.timeLeft;
  tick(s, 1);
  assert.equal(s.timeLeft, time, 'la ayuda congela el turno');
});

test('Control de UP: duración ajustable entre 40 y 60 s', () => {
  assert.deepEqual(game('pu').durations, [40, 45, 50, 55, 60]);
  const s = puGame('facil', { duration: 40 });
  assert.equal(s.duration, 40);
  tick(s, 41);
  assert.equal(s.over, true);
  assert.equal(game('pu').create('normal', { duration: 90 }).duration, 60);
});

test('Mandos: detección PS/Xbox, flancos y traducción a teclas', () => {
  const Pad = PF.Pad;
  assert.equal(Pad.detect('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'ps');
  assert.equal(Pad.detect('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'), 'ps');
  assert.equal(Pad.detect('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'), 'xbox');
  assert.equal(Pad.detect('Generic USB Joystick'), 'xbox');
  const gp = (pressed, axes = [0, 0, 0, 0]) => ({ id: 'Xbox', buttons: Pad.BUTTONS.map((n) => ({ pressed: pressed.includes(n), value: pressed.includes(n) ? 1 : 0 })), axes });
  const a = Pad.snapshot(gp([]));
  const b = Pad.snapshot(gp(['a', 'up'], [0, -0.9, 0, 0]));
  assert.deepEqual(Pad.edges(a, b).sort(), ['a', 'lsUp', 'up']);
  assert.deepEqual(Pad.edges(b, b), []);
  assert.deepEqual(Pad.toKeys(['a', 'x', 'y']), ['space', 'confirm', 'interact', 'tab']);
  assert.deepEqual(Pad.toMenu(['a', 'b', 'lsDown', 'start']), ['confirm', 'back', 'down', 'start']);
  assert.equal(Pad.label('ps', 'a'), '✕');
  assert.equal(Pad.label('xbox', 'rb'), 'RB');
});

// ------------------------------------------------------------ Supervisor de Turno

const KPI = PF.KPI;
const loss = (cat, hours, start = 0) => ({ def: { cat }, hours, start });
const r1 = (x) => Math.round(x * 1000) / 10;

test('Supervisor: mismo numerador (EPT) → LEF ≥ GLY ≥ OSE y cada pérdida la detecta primero un KPI', () => {
  const base = KPI.kpis([]);
  assert.deepEqual([base.lef, base.gly, base.ose], [1, 1, 1]);
  // Interna: la detecta el LEF y arrastra a GLY y OSE (ninguna interna afecta "solo al LEF").
  const i = KPI.kpis([loss('int', 2)]);
  assert.ok(i.lef < 1 && i.gly < 1 && i.ose < 1);
  // Planificada o externa: el LEF la excluye, la detecta el GLY (y baja el OSE).
  const p = KPI.kpis([loss('pe', 2)]);
  assert.equal(p.lef, 1);
  assert.ok(p.gly < 1 && p.ose < 1);
  // No programada: solo la ve el OSE.
  const n = KPI.kpis([loss('ns', 2)]);
  assert.equal(n.lef, 1);
  assert.equal(n.gly, 1);
  assert.ok(n.ose < 1);
  // Ejemplo: 12 h, 3 h sin programar, 0,5 h de cambio estándar, 0,2 h de falla.
  const d = KPI.kpis([loss('ns', 3), loss('pe', 0.5, 4), loss('int', 0.2, 8)]);
  assert.deepEqual([r1(d.lef), r1(d.gly), r1(d.ose)], [97.6, 92.2, 69.2]);
  assert.ok(d.lef >= d.gly && d.gly >= d.ose);
  assert.equal(KPI.diagnose(d), 'ns');
  assert.equal(KPI.diagnose(KPI.kpis([loss('int', 2), loss('pe', 0.5, 4)])), 'int');
  assert.equal(KPI.diagnose(KPI.kpis([loss('pe', 2.5), loss('int', 0.2, 4)])), 'pe');
  assert.equal(KPI.diagnose(KPI.kpis([loss('pe', 0.5), loss('int', 0.2, 4)])), 'ok');
});

test('Supervisor: el catálogo es el de la investigación (24 ítems) y cada pérdida tiene un KPI', () => {
  const refs = new Set(KPI.LOSSES.map((l) => l.ref));
  assert.deepEqual([...refs].sort((a, b) => a - b), Array.from({ length: 24 }, (_, i) => i + 1));
  const kpiOf = (id) => KPI.CATS[KPI.LOSSES.find((l) => l.id === id).cat].kpi;
  for (const id of ['falla-llenadora', 'microparadas', 'velocidad', 'rechazos', 'balance', 'ajustes']) assert.equal(kpiOf(id), 'LEF', id);
  for (const id of ['cambio-estandar', 'cip', 'preventivo', 'falta-cerveza', 'materiales', 'servicios']) assert.equal(kpiOf(id), 'GLY', id);
  for (const id of ['demanda', 'turno-no', 'portafolio', 'aguas-arriba', 'overhaul', 'feriado']) assert.equal(kpiOf(id), 'OSE', id);
  // Ítems que caen en más de un KPI, separados en variantes concretas.
  assert.equal(kpiOf('cambio-exceso'), 'LEF');
  assert.equal(kpiOf('cip-alarga'), 'LEF');
  assert.equal(kpiOf('proveedor-corre'), 'LEF');
  assert.equal(kpiOf('proveedor-para'), 'GLY');
  assert.equal(kpiOf('ausentismo-lento'), 'LEF');
  assert.equal(kpiOf('ausentismo-para'), 'GLY');
  assert.equal(kpiOf('ausentismo-noprog'), 'OSE');
  assert.equal(kpiOf('velocidad-nominal'), 'TODOS'); // error de dato: los tres
  assert.equal(kpiOf('mal-registro'), 'LEF');
  for (const l of KPI.LOSSES) assert.ok(l.explain && KPI.OWNERS[l.owner], l.id);
});

test('Supervisor: los turnos generados tienen una causa dominante clara y LEF ≥ GLY ≥ OSE', () => {
  const seen = new Set();
  for (const diff of ['facil', 'normal', 'dificil']) {
    for (let seed = 1; seed <= 40; seed++) {
      const s = game('admin').create(diff, { seed, mode: 'diag' });
      for (let i = 0; i < 6 && !s.over; i++) {
        const sh = s.shift;
        const k = KPI.kpis(sh.losses);
        seen.add(sh.type);
        assert.ok(k.lef >= k.gly && k.gly >= k.ose);
        assert.equal(KPI.diagnose(k), sh.type);
        assert.ok(sh.losses.every((l) => !l.def.mixed && !l.def.noHours), 'el diagnóstico usa ítems de un solo KPI');
        const g = KPI.gaps(k);
        if (sh.type === 'ok') assert.ok(k.ose >= 0.9, `excelente con OSE ${k.ose}`);
        else {
          const others = ['int', 'pe', 'ns'].filter((c) => c !== sh.type).map((c) => g[c]);
          assert.ok(g[sh.type] - Math.max(...others) >= 0.045, 'la causa dominante destaca');
        }
        for (let j = 1; j < sh.losses.length; j++) assert.ok(sh.losses[j].start >= sh.losses[j - 1].start + sh.losses[j - 1].hours - 1e-9);
        assert.ok(sh.losses.at(-1).start + sh.losses.at(-1).hours <= 12);
        assert.ok(sh.options.includes(sh.owner));
        // Se agota el tiempo para responder y se continúa.
        s.shift.t = 6;
        s.shift.wait = s.answerTime;
        s.update(DT, input());
        press(s, 'confirm');
      }
    }
  }
  assert.deepEqual([...seen].sort(), ['int', 'ns', 'ok', 'pe']);
});

test('Supervisor (diagnóstico): rombo como la cara del mando y explicación del patrón', () => {
  const s = game('admin').create('normal', { seed: 5, mode: 'diag' });
  // ¿Qué KPI detecta la gran caída? Teclado: ↑ LEF · ← GLY · → OSE · ↓ ninguno (excelente).
  const key = { int: 'up', pe: 'left', ns: 'right', ok: 'down' };
  press(s, key[s.shift.type]);
  assert.equal(s.stats.diagOk, 1);
  assert.equal(s.shift.phase, 'action');
  const pos = ['left', 'up', 'right'][s.shift.options.indexOf(s.shift.owner)];
  press(s, pos);
  assert.equal(s.stats.actionOk, 1);
  assert.equal(s.stats.points, 150);
  assert.equal(s.shift.phase, 'done');
  press(s, 'confirm');
  assert.equal(s.index, 1);
  // Mando: △/Y = LEF · □/X = GLY · ○/B = OSE · ✕/A = ninguno.
  const padBtn = { int: 'y', pe: 'x', ns: 'b', ok: 'a' };
  const wrong = Object.keys(padBtn).find((c) => c !== s.shift.type);
  s.update(DT, input({ pad: { pressed: [padBtn[wrong]] } }));
  assert.equal(s.stats.diagOk, 1);
  assert.equal(s.bubble.cur.kind, 'error');
  assert.match(s.bubble.log[0], /Patrón:/);
  assert.match(s.bubble.log[0], /la gran caída la detecta el (LEF|GLY|OSE)|ningún KPI cae/);
  assert.match(Object.keys(s.stats.confusions)[0], /^(LEF|GLY|OSE|NINGUNO) en vez de (LEF|GLY|OSE|NINGUNO)$/);
  assert.deepEqual(Object.fromEntries(Object.entries(PF.Admin.SLOTS).map(([k, v]) => [k, v.pad])), { LEF: 'y', GLY: 'x', OSE: 'b', OK: 'a' });
});

test('Supervisor: cada pérdida baja todos los KPIs cuyo denominador la incluye', () => {
  const aff = (id) => KPI.affects(KPI.LOSSES.find((l) => l.id === id));
  assert.deepEqual(aff('falla-llenadora'), ['LEF', 'GLY', 'OSE'], 'interna: caen los tres');
  assert.deepEqual(aff('cip'), ['GLY', 'OSE'], 'planificada: el LEF la excluye');
  assert.deepEqual(aff('materiales'), ['GLY', 'OSE'], 'externa');
  assert.deepEqual(aff('demanda'), ['OSE'], 'no programada: solo el OSE');
  assert.deepEqual(aff('ausentismo-lento'), ['LEF', 'GLY', 'OSE']);
  assert.deepEqual(aff('ausentismo-para'), ['GLY', 'OSE']);
  assert.deepEqual(aff('velocidad-nominal'), ['LEF', 'GLY', 'OSE'], 'error de dato en el EPT');
  assert.deepEqual(aff('mal-registro'), ['LEF'], 'solo se distorsiona el LEF');
  // Coherente con el cálculo: los KPIs que bajan con una pérdida de 2 h son justo esos.
  for (const cat of ['int', 'pe', 'ns']) {
    const k = KPI.kpis([loss(cat, 2)]);
    const fell = ['LEF', 'GLY', 'OSE'].filter((n) => k[n.toLowerCase()] < 1);
    assert.deepEqual(fell, KPI.AFFECTS[cat], cat);
  }
});

test('Supervisor (¿qué KPIs caen?): se marcan varios KPIs por pérdida y luego se confirma', () => {
  const s = game('admin').create('dificil', { seed: 8, mode: 'kpi' });
  tick(s, 6.2);
  assert.equal(s.shift.phase, 'report');
  assert.ok(s.shift.losses.some((l) => l.def.mixed), 'difícil incluye ítems que caen en más de un KPI');
  // Teclado: ↑ LEF · ← GLY · → OSE marcan y desmarcan; ↓ o ENTER confirma.
  const key = { LEF: 'up', GLY: 'left', OSE: 'right' };
  press(s, 'down');
  assert.equal(s.shift.cursor, 0, 'sin marcar nada no se confirma');
  assert.equal(s.bubble.cur.kind, 'tip');
  press(s, 'up');
  press(s, 'up');
  assert.equal(s.shift.sel.LEF, false, 'marcar dos veces desmarca');
  for (const l of s.shift.losses) {
    for (const k of KPI.affects(l.def)) press(s, key[k]);
    press(s, 'confirm');
  }
  assert.equal(s.shift.phase, 'done');
  const n = s.shift.losses.length;
  assert.equal(s.stats.points, 50 * n);
  assert.equal(s.stats.exact, n);
  const rep = s.report();
  assert.match(rep.headline, /todos los KPIs en \d+ de \d+ pérdidas/);
  assert.equal(rep.score, 100);
});

test('Supervisor (¿qué KPIs caen?): marcar de más o de menos da puntos parciales y lo explica', () => {
  let s = null;
  for (let seed = 1; seed < 200 && !s; seed++) {
    const g = game('admin').create('normal', { seed, mode: 'kpi' });
    if (g.shift.losses[0].def.cat === 'pe' && !g.shift.losses[0].def.mixed) s = g;
  }
  tick(s, 6.2);
  // Mando: △ LEF · □ GLY · ○ OSE · ✕ confirmar. Una planificada/externa: GLY y OSE.
  const pad = (b) => s.update(DT, input({ pad: { pressed: [b] } }));
  pad('y');
  pad('x');
  pad('a');
  assert.deepEqual(s.shift.answers[0], ['LEF', 'GLY']);
  assert.equal(s.stats.points, 15, 'solo el GLY quedó bien decidido');
  assert.equal(s.bubble.cur.kind, 'error');
  assert.match(s.bubble.cur.message, /Afecta a GLY y OSE: marcaste LEF de más y te faltó OSE/);
  assert.match(s.bubble.cur.message, /el LEF la saca de su denominador/);
  assert.deepEqual([s.stats.kpis.LEF.ok, s.stats.kpis.GLY.ok, s.stats.kpis.OSE.ok], [0, 1, 0]);
  assert.deepEqual(Object.keys(s.stats.confusions).sort(), ['LEF de más · planificada', 'faltó OSE · planificada']);
  // Error de dato: velocidad nominal → los tres (toque en el rombo).
  let found = null;
  for (let seed = 1; seed < 300 && !found; seed++) {
    const g = game('admin').create('dificil', { seed, mode: 'kpi' });
    if (g.shift.losses.some((l) => l.def.id === 'velocidad-nominal')) found = g;
  }
  assert.ok(found, 'aparece el ítem de velocidad nominal mal configurada');
  tick(found, 6.2);
  const tap = (slot) => {
    const rc = { LEF: [1062, 200], GLY: [962, 274], OSE: [1162, 274], OK: [1062, 348] }[slot];
    found.update(DT, input({ clicks: [{ x: rc[0], y: rc[1] }] }));
  };
  for (const l of found.shift.losses) {
    for (const k of KPI.affects(l.def)) tap(k);
    tap('OK');
    if (l.def.id === 'velocidad-nominal') assert.match(found.bubble.cur.message, /Afecta a LEF, GLY y OSE\. Es un error de dato/);
  }
  assert.equal(found.stats.exact, found.shift.losses.length);
});

test('Supervisor: los reportes pueden mentir, el comodín los verifica y los KPI usan la causa real', () => {
  let found = null;
  for (let seed = 1; seed < 80 && !found; seed++) {
    const s = game('admin').create('dificil', { seed, mode: 'diag' });
    if (s.shift.reports.some((r) => r.status === 'wrong')) found = s;
  }
  assert.ok(found, 'difícil genera reportes equivocados');
  const s = found;
  const wrong = s.shift.reports.find((r) => r.status === 'wrong');
  assert.notEqual(wrong.fake.cat, wrong.loss.def.cat);
  tick(s, 6.2);
  assert.equal(s.jokers, 1);
  s.update(DT, input({ pad: { pressed: ['lb'] } }));
  assert.equal(s.jokers, 0);
  assert.ok(s.shift.reports.every((r) => r.verified));
  press(s, 'joker');
  assert.equal(s.jokers, 0, 'sin llamadas no se gastan más');
});

test('Supervisor: 12 h en 6 s y el juego espera la respuesta; solo avanza solo si se acaba el tiempo', () => {
  for (const mode of ['diag', 'kpi']) {
    const s = game('admin').create('normal', { seed: 3, mode, answerTime: 30 });
    assert.equal(s.duration, 30);
    tick(s, 6.2);
    assert.equal(s.shift.clock, 12, 'el turno de 12 h se simula en 6 s');
    if (mode === 'kpi') assert.equal(s.shift.phase, 'report');
    tick(s, 29);
    assert.equal(s.index, 0, 'sin responder, el turno sigue esperando');
    assert.notEqual(s.shift.phase, 'done');
    assert.ok(s.timeLeft > 0 && s.timeLeft < 2);
    tick(s, 1.2);
    assert.equal(s.shift.phase, 'done', 'se agotó el tiempo');
    assert.equal(s.shift.timedOut, true);
    assert.equal(s.stats.timeouts, 1);
    assert.equal(s.bubble.cur.title, 'Tiempo agotado');
    tick(s, PF.Admin.REVEAL_S + 0.2);
    assert.equal(s.index, 1, 'tras mostrar la solución, avanza solo');
    assert.equal(s.report().score, 0, 'sin respuestas no hay puntos');
  }
});

test('Supervisor: tras responder, la explicación espera a que pulses Continuar', () => {
  const s = game('admin').create('dificil', { seed: 4, mode: 'diag', answerTime: 50 });
  const key = { int: 'up', pe: 'left', ns: 'right', ok: 'down' };
  tick(s, 45);
  assert.equal(s.index, 0);
  press(s, key[s.shift.type]);
  press(s, ['left', 'up', 'right'][s.shift.options.indexOf(s.shift.owner)]);
  assert.equal(s.stats.points, 150, 'responder antes de que se acabe el tiempo puntúa');
  assert.equal(s.shift.phase, 'done');
  tick(s, 120);
  assert.equal(s.index, 0, 'no avanza solo: el juego no es frenético');
  assert.ok(s.bubble.cur, 'la explicación sigue a la vista');
  press(s, 'down');
  assert.equal(s.index, 0, 'las flechas no saltan la explicación');
  s.update(DT, input({ pad: { pressed: ['a'] } }));
  assert.equal(s.index, 1, '✕/A continúa');
  assert.equal(s.bubble.cur, null);
  assert.equal(s.timeLeft, 50, 'el reloj de respuesta se reinicia en cada turno');
});

test('Supervisor: el tiempo para responder (30/40/50 s) se elige aparte de la dificultad', () => {
  const g = game('admin');
  assert.deepEqual(
    g.choices.map((c) => c.key),
    ['mode', 'answerTime']
  );
  assert.deepEqual(g.choices[1].values.map((v) => v.value), [30, 40, 50]);
  assert.equal(g.choices[1].values[g.choices[1].index].value, 40);
  for (const diff of ['facil', 'normal', 'dificil']) {
    assert.equal(g.create(diff, { answerTime: 50 }).answerTime, 50);
    assert.equal(g.create(diff, { answerTime: 30 }).answerTime, 30);
    assert.equal(g.create(diff).answerTime, 40);
  }
  assert.equal(g.create('normal', { answerTime: 7 }).answerTime, 40, 'solo valores válidos');
  assert.equal(PF.Admin.SIM_S, 6);
});

test('Supervisor: la ayuda congela el turno y el modo se elige en la pantalla de inicio', () => {
  const g = game('admin');
  assert.equal(g.choices[0].key, 'mode');
  assert.deepEqual(g.choices[0].values.map((v) => v.value), ['diag', 'kpi']);
  const s = g.create('facil', { mode: 'kpi', seed: 2 });
  assert.equal(s.mode, 'kpi');
  s.update(DT, input({ pad: { pressed: ['select'] } }));
  assert.equal(s.help, true, 'SHARE / VIEW abre la ayuda');
  const t0 = s.shift.t;
  tick(s, 2);
  assert.equal(s.shift.t, t0);
});

// ------------------------------------------------------------ Guía Rápida de Reacción

const RX = PF.Reaction;
// Conecta un punto haciendo clic sobre él.
const linkDot = (s, id) => {
  const d = s.dots.find((x) => x.id === id);
  assert.ok(d, `el punto ${id} está en el tablero`);
  s.update(DT, input({ clicks: [{ x: d.x, y: d.y }] }));
};
const finishRoute = (s) => {
  for (const id of RX.ROUTES[s.sit].slice(s.step)) linkDot(s, id);
};

test('Reacción: las rutas son las de la guía y cada punto lleva su texto completo', () => {
  assert.deepEqual(RX.ROUTES, {
    S1: ['COM', 'DEL', 'EPP', 'KIT', 'SOP260'],
    S2: ['COM', 'LAV', 'DUC', 'MSDS'],
    S3: ['COM', 'ALA', 'EXT', 'GAB', 'SOP092'],
    S4: ['COM', 'SIR', 'SAL', 'PTO', 'SOP085'],
  });
  assert.equal(Object.keys(RX.ITEMS).length, 17);
  assert.equal(RX.ITEMS.EPP.text, 'EPP’s (traje, guantes, protección respiratoria)');
  assert.equal(RX.ITEMS.SOP260.text, 'ACADIA QUI-ENV-SOP-260');
  assert.equal(RX.ITEMS.LAV.text, 'Lavaojos (mín. 15 min)');
  assert.equal(RX.SITUATIONS.S4.name, 'Emergencia (sismo / incidente mayor)');
  for (const [id, it] of Object.entries(RX.ITEMS)) {
    assert.ok(it.text.length > id.length && it.info, id);
    assert.ok(RX.situationsOf(id).length >= 1, `${id} pertenece a alguna situación`);
  }
  assert.ok(!Object.values(RX.ROUTES).some((r) => r.includes('DET')), 'el detector de humo no es un paso');
});

test('Reacción: unir los puntos en orden completa las 4 rutas con 100 puntos', () => {
  const s = game('reaction').create('normal', { seed: 7 });
  assert.equal(s.dots.length, 17, 'en Normal están los 17 puntos');
  const seen = [];
  while (!s.over) {
    seen.push(s.sit);
    finishRoute(s);
    assert.equal(s.phase, 'summary', 'la ruta completa queda a la vista');
    assert.equal(s.bubble.cur.title, '¡Ruta completa!');
    tick(s, 30);
    assert.equal(s.phase, 'summary', 'espera a que pulses Continuar');
    press(s, 'confirm');
  }
  assert.deepEqual(seen.sort(), ['S1', 'S2', 'S3', 'S4']);
  const rep = s.report();
  assert.equal(rep.score, 100);
  assert.match(rep.headline, /4 de 4 rutas/);
});

test('Reacción: un punto equivocado explica por qué con los textos completos', () => {
  const s = game('reaction').create('dificil', { seed: 3 });
  const route = RX.ROUTES[s.sit];
  // Lo primero siempre es comunicar.
  linkDot(s, route[1]);
  assert.equal(s.bubble.cur.kind, 'error');
  assert.match(s.bubble.cur.message, /Comunicación \(dar aviso\)/);
  linkDot(s, 'COM');
  assert.equal(s.step, 1);
  // Un ítem de otra ruta: en Difícil no se revela el paso correcto hasta el tercer error.
  const other = Object.keys(RX.ROUTES).find((k) => k !== s.sit);
  const foreign = RX.ROUTES[other][1];
  linkDot(s, foreign);
  assert.match(s.bubble.cur.message, new RegExp(`es de la ruta «${RX.SITUATIONS[other].name.replace(/[()]/g, '.')}»`));
  assert.doesNotMatch(s.bubble.cur.message, /Después de/);
  linkDot(s, foreign);
  linkDot(s, foreign);
  assert.match(s.bubble.cur.message, new RegExp(`Después de «Comunicación \\(dar aviso\\)» va «${RX.ITEMS[route[1]].text.replace(/[()/]/g, '.')}»`));
  assert.equal(s.stats.errors, 4);
  assert.equal(s.stats.perSit[s.sit].errors, 4);
  assert.equal(s.cfg.pictos, false, 'en Difícil, solo texto');
});

test('Reacción: Fácil muestra la ruta y señuelos y revela el paso al primer error', () => {
  const s = game('reaction').create('facil', { seed: 2 });
  const route = RX.ROUTES[s.sit];
  const ids = s.dots.map((d) => d.id);
  for (const id of route) assert.ok(ids.includes(id));
  assert.equal(s.dots.length, route.length + (RX.EXTRAS[s.sit] || []).length + 3);
  linkDot(s, 'COM');
  const wrong = ids.find((id) => !route.includes(id));
  linkDot(s, wrong);
  assert.match(s.bubble.cur.message, /Después de «Comunicación \(dar aviso\)»/);
});

test('Reacción: el detector de humo y los SOP explican por qué no van', () => {
  let s = null;
  for (let seed = 1; seed < 50 && !s; seed++) {
    const g = game('reaction').create('normal', { seed });
    if (g.sit === 'S3') s = g;
  }
  linkDot(s, 'COM');
  linkDot(s, 'DET');
  assert.match(s.bubble.cur.message, /Detector de humo» detecta por sí solo/);
  linkDot(s, 'SOP085');
  assert.match(s.bubble.cur.message, /ACADIA QUI-SEG-SOP-0085» es el procedimiento de «Emergencia \(sismo \/ incidente mayor\)»/);
  let c = null;
  for (let seed = 1; seed < 50 && !c; seed++) {
    const g = game('reaction').create('normal', { seed });
    if (g.sit === 'S2') c = g;
  }
  linkDot(c, 'COM');
  linkDot(c, 'SOP260');
  assert.match(c.bubble.cur.message, /no tiene procedimiento ACADIA en la guía: su ruta termina en «Hoja de seguridad MSDS»/);
});

test('Reacción: flechas o cruceta mueven el cursor y ✕/A conecta; la guía pausa y cuesta puntos', () => {
  const s = game('reaction').create('normal', { seed: 11 });
  const from = s.dots[s.cursor];
  press(s, 'right');
  assert.ok(s.dots[s.cursor].x > from.x, 'el cursor fue a la derecha');
  const comIdx = s.dots.findIndex((d) => d.id === 'COM');
  s.cursor = comIdx;
  s.update(DT, input({ pad: { pressed: ['a'] } }));
  assert.equal(s.step, 1);
  assert.equal(s.stats.points, 10);
  s.update(DT, input({ pad: { pressed: ['select'] } }));
  assert.equal(s.help, true);
  assert.equal(s.stats.points, 5, 'en Normal la guía resta 5 puntos');
  const left = s.timeLeft;
  tick(s, 5);
  assert.equal(s.timeLeft, left, 'la guía congela el tiempo');
  s.update(DT, input({ pad: { pressed: ['b'] } }));
  assert.equal(s.help, false);
});

test('Reacción: si se acaba el tiempo, el juego termina y las rutas pendientes cuentan', () => {
  const s = game('reaction').create('dificil', { seed: 4 });
  assert.equal(s.duration, 180);
  finishRoute(s);
  press(s, 'confirm');
  tick(s, 181);
  assert.equal(s.over, true);
  const rep = s.report();
  assert.ok(rep.score > 0 && rep.score < 40);
  assert.equal(rep.rows.filter((r) => r[1] === 'sin terminar').length, 3);
});

test('Táctil: Control de UP, Supervisor y Reacción responden a toques en su propia interfaz', () => {
  const tap = (s, x, y) => s.update(DT, input({ clicks: [{ x, y }] }));
  // Control de UP: la llave se cambia tocando sus botones; "ayuda" se abre y se cierra tocando.
  const pu = game('pu').create('normal', { seed: 1 });
  tap(pu, 1000, 528);
  assert.equal(pu.valve, 'drain');
  tap(pu, 1000, 472);
  assert.equal(pu.valve, 'fill');
  tap(pu, 1240, 50);
  assert.equal(pu.help, true);
  tap(pu, 640, 360);
  assert.equal(pu.help, false);
  // Supervisor: herramientas y ayuda tocables.
  const ad = game('admin').create('dificil', { seed: 5, mode: 'diag' });
  tick(ad, 6.2);
  tap(ad, 1060, 530);
  assert.equal(ad.stats.jokersUsed, 1, 'tocar "Llamar y verificar"');
  tap(ad, 1240, 50);
  assert.equal(ad.help, true);
  tap(ad, 640, 360);
  assert.equal(ad.help, false);
  assert.equal(ad.stats.diagOk + ad.stats.max, 0, 'cerrar la ayuda tocando no responde el rombo');
  // Reacción: "guía" del HUD.
  const rx = game('reaction').create('normal', { seed: 3 });
  tap(rx, 1240, 50);
  assert.equal(rx.help, true);
  assert.equal(rx.stats.guide, 1);
  tap(rx, 640, 360);
  assert.equal(rx.help, false);
});
