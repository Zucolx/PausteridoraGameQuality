const test = require('node:test');
const assert = require('node:assert/strict');
const { C, Sim, input, run, playBot } = require('./helpers');

function quietGame() {
  return Sim.createGame({ seed: 1, scheduler: false });
}

test('sin fallas, el turno procesa ~54 HL y todo se aprueba', () => {
  const g = quietGame();
  run(g, 61);
  const r = Sim.results(g);
  assert.equal(g.over, true);
  assert.equal(g.endReason, 'time');
  assert.equal(g.ticks, 600);
  assert.ok(Math.abs(r.processed - 54) < 1e-6, `procesado ${r.processed}`);
  assert.ok(Math.abs(r.approved - 54) < 1e-6);
  assert.equal(r.discarded, 0);
  assert.equal(r.rank, 'S');
  assert.equal(r.mainCauseLabel, null);
});

test('la gracia de 0,4 s evita descartar un parpadeo', () => {
  const g = quietGame();
  run(g, 1);
  g.vars.temp.value = 31;
  run(g, 0.4);
  g.vars.temp.value = 27;
  run(g, 1);
  assert.equal(g.stats.discarded, 0);
});

test('fuera de rango más de 0,4 s desvía ese volumen a descarte', () => {
  const g = quietGame();
  run(g, 1);
  g.vars.flow.value = 0.97; // flujo alto => subpasteuriza
  run(g, 2);
  g.vars.flow.value = 0.9;
  run(g, 1);
  // 2 s fuera de rango - 0,4 s de gracia = 1,6 s a 0,97 HL/s
  assert.ok(Math.abs(g.stats.discarded - 1.6 * 0.97) < 0.1, `descartado ${g.stats.discarded}`);
  assert.equal(g.stats.episodes.flow_high, 1);
  run(g, 60);
  const r = Sim.results(g);
  assert.equal(r.mainCause, 'flow_high');
  assert.match(Sim.summaryText(r), /Causa principal: flujo alto\./);
});

test('episodios repetidos se reportan como intermitentes', () => {
  const g = quietGame();
  for (let i = 0; i < 3; i++) {
    g.vars.flow.value = 0.97;
    run(g, 1);
    g.vars.flow.value = 0.9;
    run(g, 1);
  }
  run(g, 60);
  assert.equal(Sim.results(g).mainCauseLabel, 'flujo alto intermitente');
});

test('válvula al mínimo más de 2 s provoca paro de línea y purga', () => {
  const g = quietGame();
  g.player.operating = 'valve';
  run(g, 4, input({ adjust: -1 })); // cierra hasta el mínimo de 0,6
  assert.equal(g.vars.flow.value, C.VARS.flow.hardMin);
  run(g, 1);
  assert.equal(g.lineStopped, true);
  assert.equal(g.stats.lineStops, 1);
  const processed = g.stats.processed;
  run(g, 2);
  assert.equal(g.stats.processed, processed, 'línea parada no procesa');
  run(g, 1.2);
  assert.equal(g.lineStopped, false);
  assert.ok(g.stats.byCause.lineStop >= C.LINE_STOP.purgeHL);
  assert.equal(g.vars.flow.value, C.VARS.flow.ideal);
});

test('la primera alarma llega en los primeros segundos y es una deriva', () => {
  const g = Sim.createGame({ seed: 7 });
  run(g, 9.5);
  assert.equal(g.stats.spawned, 1);
  assert.ok(['thermalDrift', 'flowDrift', 'slowBelt'].includes(g.activeEvents[0]?.type ?? 'resuelta'));
});

test('caminar respeta las paredes y entrar a una estación requiere cercanía', () => {
  const g = quietGame();
  run(g, 5, input({ moveY: -1 })); // choca contra el panel central
  assert.ok(g.player.y > C.MAP.stations.panel.rect.y);
  run(g, 0.1, input({ pressed: ['interact'] }));
  assert.equal(g.player.operating, null);
  const s = C.MAP.stations.temp.spot;
  g.player.x = s.x;
  g.player.y = s.y;
  run(g, 1 / 60, input({ pressed: ['interact'] }));
  assert.equal(g.player.operating, 'temp');
});

test('una deriva se cierra al estabilizar la variable en la estación', () => {
  const g = quietGame();
  const e = { id: 99, type: 'thermalDrift', name: 'x', kind: 'adjust', station: 'temp', vars: ['temp'], age: 0, settle: 0, born: 0, rate: 0.8, mg: null };
  g.activeEvents.push(e);
  run(g, 4);
  assert.ok(g.vars.temp.value > 29.5);
  g.player.operating = 'temp';
  run(g, 1.5, input({ adjust: -1 }));
  run(g, 0.2);
  for (let i = 0; i < 120 && g.activeEvents.length; i++) {
    const diff = 27 - g.vars.temp.value;
    run(g, 1 / 60, input({ adjust: Math.abs(diff) > 0.2 ? Math.sign(diff) : 0 }));
  }
  assert.equal(g.activeEvents.length, 0);
  assert.equal(g.stats.resolved, 1);
});

test('cada mini-juego se puede completar', () => {
  const { PF } = require('./helpers');
  const MG = PF.Minigames;
  const rng = Sim.makeRng(3);
  const noop = () => {};
  const dt = 1 / 60;
  const solve = (type, policy, maxT = 15) => {
    const mg = MG[type].create(rng);
    for (let t = 0; t < maxT; t += dt) if (MG[type].update(mg, dt, policy(mg), rng, noop)) return t;
    return Infinity;
  };
  assert.ok(solve('hold', () => input({ space: true })) < 2);
  assert.ok(solve('arrows', (mg) => input({ pressed: [mg.seq[mg.idx]] })) < 1);
  assert.ok(solve('pressure', (mg) => input({ space: mg.p < 0.67 })) < 4);
  assert.ok(solve('timing', (mg) => input({ pressed: Math.abs(mg.pos - mg.zone.c) < 0.03 ? ['space'] : [] })) < 6);
  assert.ok(solve('simon', (mg) => input({ pressed: mg.phase === 'input' ? [String(mg.seq[mg.idx] + 1)] : [] })) < 4);
  // un error reinicia la secuencia
  const mg = MG.arrows.create(rng);
  MG.arrows.update(mg, dt, input({ pressed: [mg.seq[0]] }), rng, noop);
  assert.equal(mg.idx, 1);
  const wrong = ['up', 'right', 'down', 'left'].find((d) => d !== mg.seq[1]);
  MG.arrows.update(mg, dt, input({ pressed: [wrong] }), rng, noop);
  assert.equal(mg.idx, 0);
});

test('un operador ocioso pierde mucha cerveza; uno competente gana rango alto', () => {
  const idle = [];
  const bot = [];
  for (let seed = 1; seed <= 20; seed++) {
    const g = Sim.createGame({ seed });
    run(g, 61);
    idle.push(Sim.results(g));
    bot.push(Sim.results(playBot(seed)));
  }
  const avg = (xs, f) => xs.reduce((a, x) => a + f(x), 0) / xs.length;
  const idleEff = avg(idle, (r) => r.efficiency);
  const botEff = avg(bot, (r) => r.efficiency);
  console.log(`  eficiencia media: ociosa ${idleEff.toFixed(1)}%, bot ${botEff.toFixed(1)}%`);
  console.log(`  rangos bot: ${bot.map((r) => r.rank).join('')}`);
  console.log(`  ejemplo: ${Sim.summaryText(bot[0])}`);
  assert.ok(idleEff < 60, `ociosa ${idleEff}`);
  assert.ok(botEff > 75, `bot ${botEff}`);
  for (const r of bot) assert.ok(r.processed > 45 && r.processed < 62, `procesado ${r.processed}`);
});

test('el resumen usa coma decimal y el formato del diseño', () => {
  const r = { processed: 54.2, approved: 47.8, discarded: 6.4, efficiency: 88.2, mainCauseLabel: 'flujo alto intermitente', rank: 'A' };
  assert.equal(
    Sim.summaryText(r),
    'Pasaron 54,2 HL. Aprobados: 47,8 HL. Desechados: 6,4 HL. Eficiencia: 88,2%. Causa principal: flujo alto intermitente. Rango A.'
  );
});
