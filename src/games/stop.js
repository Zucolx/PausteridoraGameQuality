// Línea en Paro: Decisiones Bajo Presión.
// La línea se detuvo X horas: aplica el plan de reacción correcto antes de arrancar.
// Arrancar sin el protocolo completo = cerveza contaminada.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const W = PF.World;
  const B = PF.Bubble;
  const M = PF.Manual;
  const T = D.T;
  const ACCENT = '#ffb347';

  const DIFF = {
    facil: { lives: 3, showProtocol: true, tab: true, timeMul: 0.8, sabotage: [12, 16], penalty: 0, bigToast: false },
    normal: { lives: 2, showProtocol: false, tab: true, timeMul: 1, sabotage: [7, 11], penalty: 2, bigToast: false },
    dificil: { lives: 1, showProtocol: false, tab: false, timeMul: 1.2, sabotage: [4, 7], penalty: 3, bigToast: true },
  };

  const STATIONS = {
    tazon: { id: 'tazon', name: 'TAZÓN', rect: { x: 100, y: 112, w: 180, h: 100 }, spot: { x: 190, y: 244 } },
    agua: { id: 'agua', name: 'AGUA CALIENTE', rect: { x: 400, y: 112, w: 160, h: 90 }, spot: { x: 480, y: 236 } },
    externa: { id: 'externa', name: 'LIMPIEZA EXTERNA', rect: { x: 690, y: 112, w: 190, h: 90 }, spot: { x: 785, y: 236 } },
    cip: { id: 'cip', name: 'PANEL CIP', rect: { x: 100, y: 580, w: 180, h: 100 }, spot: { x: 190, y: 548 } },
    plan: { id: 'plan', name: 'PLAN DE REACCIÓN', rect: { x: 410, y: 612, w: 140, h: 70 }, spot: { x: 480, y: 580 } },
    arranque: { id: 'arranque', name: 'ARRANQUE', rect: { x: 690, y: 590, w: 190, h: 90 }, spot: { x: 785, y: 558 } },
  };
  const OBSTACLES = [{ x: 300, y: 340, w: 360, h: 80, kind: 'line' }];
  const WORLD = W.make({ solids: W.solidsOf(OBSTACLES, STATIONS), stations: STATIONS, start: { x: 480, y: 470 } });
  const STEP_AT = { tazon: 'vaciado', agua: 'interna', externa: 'externa' };
  const START_HOLD = 0.8;
  const H_MODAL = 300;

  function create(diffId = 'normal', opts = {}) {
    const cfg = DIFF[diffId] || DIFF.normal;
    const s = {
      id: 'stop',
      diff: diffId,
      cfg,
      rng: D.makeRng(opts.seed),
      duration: 60,
      timeLeft: 60,
      time: 0,
      over: false,
      gameOver: false,
      endT: 0,
      lives: cfg.lives,
      player: W.newPlayer(WORLD),
      operating: null,
      action: null,
      book: false,
      bubble: B.create(),
      floats: [],
      banner: null,
      round: null,
      lastHours: null,
      toast: null,
      toastT: 0,
      stats: { lotes: 0, correct: 0, errors: 0, contaminated: 0, resisted: 0, rounds: 0 },
    };
    s.toastT = between(s.rng, cfg.sabotage);
    newRound(s);
    s.world = WORLD;
    s.update = (dt, input) => update(s, dt, input);
    s.draw = (r) => draw(s, r);
    s.report = () => report(s);
    return s;
  }

  function between(rng, [a, b]) {
    return a + rng() * (b - a);
  }

  function newRound(s, forced = null) {
    let rule;
    let hours;
    do {
      const x = s.rng();
      rule = forced || (x < 0.5 ? M.STOP_RULES[0] : x < 0.8 ? M.STOP_RULES[1] : M.STOP_RULES[2]);
      hours = rule.hours[Math.floor(s.rng() * rule.hours.length)];
    } while (hours === s.lastHours && !forced);
    s.lastHours = hours;
    s.round = { hours, rule, done: [], nextT: 0 };
    s.stats.rounds++;
    s.banner = D.makeBanner(`LÍNEA DETENIDA HACE ${M.hoursLabel(hours).toUpperCase()}`, ACCENT, '¿Qué dice el plan de reacción?', 2.4);
    D.sfx('alarm');
  }

  function missingSteps(s) {
    return s.round.rule.steps.filter((x) => !s.round.done.includes(x));
  }

  function mistake(s, msg) {
    B.say(s.bubble, msg);
    s.stats.errors++;
    if (s.cfg.penalty) {
      s.timeLeft -= s.cfg.penalty;
      D.floatAdd(s.floats, s.player.x, s.player.y - 70, `−${s.cfg.penalty} s`, T.red, 20);
    }
  }

  // ------------------------------------------------------------ Actualización

  function update(s, dt, input) {
    if (s.over) return;
    s.time += dt;
    B.update(s.bubble, dt);
    s.floats = D.floatsUpdate(s.floats, dt);
    D.tickBanner(s, dt);
    if (s.endT > 0) {
      s.endT -= dt;
      if (s.endT <= 0) s.over = true;
      return;
    }
    s.timeLeft -= dt;
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      s.over = true;
      return;
    }
    if (s.round.nextT > 0) {
      s.round.nextT -= dt;
      if (s.round.nextT <= 0) newRound(s);
      return;
    }
    updateToast(s, dt, input);
    if (s.round.nextT > 0 || s.endT > 0) return;

    const P = input.pressed;
    if (P.includes('tab')) {
      if (s.cfg.tab) s.book = !s.book;
      else B.say(s.bubble, 'En difícil el plan no va en el bolsillo: consúltalo en el tablero PLAN DE REACCIÓN.', { kind: 'tip' });
    }
    if (s.book) {
      if (P.includes('cancel') || P.includes('interact')) s.book = false;
      return;
    }
    if (s.operating) {
      if (P.includes('interact') || P.includes('cancel')) {
        s.operating = null;
        return;
      }
      updateStation(s, dt, input);
      return;
    }
    W.move(WORLD, s.player, input, dt);
    if (P.includes('interact')) {
      const st = W.nearest(WORLD, s.player);
      if (!st) return;
      if (st.id === 'plan') {
        s.book = true;
        return;
      }
      s.operating = st.id;
      s.action = { progress: 0, choice: null, running: false };
      D.sfx('enter');
    }
  }

  // Notificaciones de presión ("saboteadores").
  function updateToast(s, dt, input) {
    const P = input.pressed;
    if (s.toast) {
      s.toast.life -= dt;
      if (P.includes('y')) {
        s.toast = null;
        startLine(s, true);
        return;
      }
      if (P.includes('x') || s.toast.life <= 0) {
        s.toast = null;
        s.stats.resisted++;
        D.floatAdd(s.floats, s.player.x, s.player.y - 60, 'Presión resistida', T.ok, 15);
      }
      return;
    }
    s.toastT -= dt;
    if (s.toastT <= 0) {
      s.toastT = between(s.rng, s.cfg.sabotage);
      s.toast = { text: M.SABOTAGE[Math.floor(s.rng() * M.SABOTAGE.length)], life: 4.5, max: 4.5 };
      D.sfx('denied');
    }
  }

  function stepFor(s, stationId) {
    if (STEP_AT[stationId]) return STEP_AT[stationId];
    if (stationId === 'cip') return s.action.choice;
    return null;
  }

  function updateStation(s, dt, input) {
    const id = s.operating;
    const P = input.pressed;
    const a = s.action;
    if (id === 'arranque') {
      if (input.space) a.progress += dt;
      else a.progress = Math.max(0, a.progress - dt * 2);
      if (a.progress >= START_HOLD) {
        s.operating = null;
        startLine(s, false);
      }
      return;
    }
    if (id === 'cip' && !a.choice) {
      let pick = null;
      if (P.includes('1')) pick = 'cipIntermedio';
      if (P.includes('2')) pick = 'cipCompleto';
      for (const c of input.clicks || []) {
        const opt = cipOptions().find((o) => c.x >= o.x && c.x <= o.x + o.w && c.y >= o.y && c.y <= o.y + o.h);
        if (opt) pick = opt.step;
      }
      if (!pick) return;
      if (!s.round.rule.steps.includes(pick)) {
        mistake(s, M.stopStepError(s.round.rule, pick));
        return;
      }
      a.choice = pick;
    }
    const step = stepFor(s, id);
    if (!step) return;
    if (s.round.done.includes(step)) return;
    if (!a.running) {
      if (!(P.includes('space') || input.space)) return;
      if (!s.round.rule.steps.includes(step)) {
        mistake(s, M.stopStepError(s.round.rule, step));
        s.operating = null;
        return;
      }
      a.running = true;
    }
    if (input.space) a.progress += dt;
    const need = M.STOP_STEPS[step].time * s.cfg.timeMul;
    if (a.progress >= need) {
      s.round.done.push(step);
      s.stats.correct++;
      D.floatAdd(s.floats, s.player.x, s.player.y - 60, `✔ ${M.STOP_STEPS[step].short}`, T.ok, 17);
      D.sfx('resolved');
      s.operating = null;
    }
  }

  function startLine(s, rushed) {
    const missing = missingSteps(s);
    if (!missing.length) {
      s.stats.lotes++;
      s.banner = D.makeBanner('LOTE SEGURO', T.ok, `Protocolo de ${s.round.rule.range} completo · línea en marcha`, 1.6);
      D.sfx('end');
      s.round.nextT = 1.6;
      return;
    }
    s.stats.contaminated++;
    s.lives--;
    B.say(s.bubble, (rushed ? 'Cediste a la presión. ' : '') + M.contaminationMessage(s.round.rule, missing), { life: 5 });
    D.sfx('lineStop');
    if (s.lives <= 0) {
      s.gameOver = true;
      s.banner = D.makeBanner('CERVEZA CONTAMINADA', T.red, 'Fin del turno: el lote se va a descarte', 2.6);
      s.endT = 2.6;
    } else {
      s.banner = D.makeBanner('CERVEZA CONTAMINADA', T.red, `Te quedan ${s.lives} ${s.lives === 1 ? 'vida' : 'vidas'}`, 2.2);
      s.round.nextT = 2.4;
    }
  }

  function cipOptions() {
    const a = D.modalArea(H_MODAL);
    return [
      { step: 'cipIntermedio', key: '1', x: a.x, y: a.y + 40, w: a.w / 2 - 10, h: 110 },
      { step: 'cipCompleto', key: '2', x: a.x + a.w / 2 + 10, y: a.y + 40, w: a.w / 2 - 10, h: 110 },
    ];
  }

  // ------------------------------------------------------------ Dibujo

  function draw(s, r) {
    const ctx = r.ctx;
    const t = r.t;
    D.begin(r);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, D.VIEW.hud, D.VIEW.mapWidth, D.VIEW.height - D.VIEW.hud);
    ctx.clip();
    D.floor(ctx);
    drawLine(ctx, t);
    const near = s.operating ? null : W.nearest(WORLD, s.player);
    for (const st of Object.values(STATIONS)) {
      const step = STEP_AT[st.id];
      const done = step ? s.round.done.includes(step) : st.id === 'cip' && s.round.done.some((x) => x.startsWith('cip'));
      const required = s.cfg.showProtocol && ((step && s.round.rule.steps.includes(step)) || (st.id === 'cip' && s.round.rule.steps.some((x) => x.startsWith('cip'))));
      const state = done ? 'done' : required ? 'next' : st.id === 'arranque' && !missingSteps(s).length ? 'next' : null;
      D.station(ctx, st, { t, near: near === st, state });
      ART[st.id](s, ctx, st, t);
    }
    D.player(ctx, s.player, { t });
    if (near && !s.operating) D.prompt(ctx, s.player, near.id === 'plan' ? 'consultar' : near.name.toLowerCase(), ACCENT);
    D.floatsDraw(ctx, s.floats);
    if (s.operating) drawModal(s, ctx);
    if (s.book) drawPlan(s, ctx);
    if (s.toast) drawToast(s, ctx, t);
    D.banner(ctx, s.banner);
    B.draw(ctx, s.bubble, s.player, s.operating ? { maxBottom: D.modalArea(H_MODAL).outer.y - 6 } : {});
    ctx.restore();

    D.hud(ctx, t, {
      title: 'LÍNEA EN PARO',
      diff: s.diff,
      timeLeft: s.timeLeft,
      duration: s.duration,
      accent: ACCENT,
      stats: [
        { label: 'Lotes seguros', value: s.stats.lotes, color: T.ok, width: 150 },
        { label: 'Contaminados', value: s.stats.contaminated, color: s.stats.contaminated ? T.red : T.ink, width: 150 },
      ],
    });
    drawSidebar(s, ctx);
  }

  function drawLine(ctx, t) {
    const o = OBSTACLES[0];
    ctx.fillStyle = '#2b2320';
    D.roundRect(ctx, o.x, o.y, o.w, o.h, 8);
    ctx.fill();
    ctx.fillStyle = '#3e3430';
    for (let x = o.x + 8; x < o.x + o.w - 8; x += 24) ctx.fillRect(x, o.y + 14, 14, o.h - 28);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = '#7a4a1e';
      ctx.beginPath();
      ctx.arc(o.x + 40 + i * 56, o.y + o.h / 2, 13, 0, Math.PI * 2);
      ctx.fill();
    }
    D.text(ctx, 'LÍNEA DE ENVASADO — DETENIDA', o.x + o.w / 2, o.y - 10, { size: 14, weight: 800, color: Math.floor(t * 2) % 2 ? T.red : T.dim, align: 'center' });
  }

  const ART = {
    tazon(s, ctx, st) {
      const cx = st.rect.x + st.rect.w / 2;
      const cy = st.rect.y + st.rect.h / 2;
      ctx.fillStyle = '#5a5250';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 60, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      const full = !s.round.done.includes('vaciado');
      ctx.fillStyle = full ? '#e9a23b' : '#2b2320';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 48, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    agua(s, ctx, st, t) {
      const cx = st.rect.x + st.rect.w / 2;
      ctx.fillStyle = '#ff6b4a';
      D.roundRect(ctx, cx - 30, st.rect.y + 18, 60, 52, 10);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const x = cx - 14 + i * 14;
        ctx.moveTo(x, st.rect.y + 14);
        ctx.quadraticCurveTo(x + 6 * Math.sin(t * 4 + i), st.rect.y + 6, x, st.rect.y - 2);
        ctx.stroke();
      }
      D.text(ctx, '85°', cx, st.rect.y + 52, { size: 16, weight: 800, color: '#fff', align: 'center' });
    },
    externa(s, ctx, st) {
      const cx = st.rect.x + st.rect.w / 2;
      ctx.fillStyle = '#4aa3ff';
      for (const [dx, dy, rr] of [[-20, 50, 14], [0, 40, 18], [22, 52, 13], [8, 62, 10]]) {
        ctx.beginPath();
        ctx.arc(cx + dx, st.rect.y + dy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    cip(s, ctx, st) {
      ctx.fillStyle = '#081016';
      D.roundRect(ctx, st.rect.x + 14, st.rect.y + 14, st.rect.w - 28, 50, 4);
      ctx.fill();
      D.text(ctx, 'INTERMEDIO · COMPLETO', st.rect.x + st.rect.w / 2, st.rect.y + 44, { size: 12, weight: 700, color: T.ok, align: 'center' });
    },
    plan(s, ctx, st) {
      ctx.fillStyle = '#f2e3c6';
      D.roundRect(ctx, st.rect.x + 14, st.rect.y + 10, st.rect.w - 28, st.rect.h - 20, 4);
      ctx.fill();
      ctx.strokeStyle = '#7a3010';
      ctx.lineWidth = 2;
      ctx.strokeRect(st.rect.x + 30, st.rect.y + 20, 30, 14);
      ctx.strokeRect(st.rect.x + 80, st.rect.y + 20, 30, 14);
      ctx.beginPath();
      ctx.moveTo(st.rect.x + 60, st.rect.y + 27);
      ctx.lineTo(st.rect.x + 80, st.rect.y + 27);
      ctx.stroke();
      D.text(ctx, 'p. 17', st.rect.x + st.rect.w / 2, st.rect.y + 52, { size: 12, weight: 700, color: '#7a3010', align: 'center' });
    },
    arranque(s, ctx, st, t) {
      const cx = st.rect.x + st.rect.w / 2;
      const cy = st.rect.y + st.rect.h / 2;
      ctx.fillStyle = '#3a0d08';
      ctx.beginPath();
      ctx.arc(cx, cy, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = Math.floor(t * 3) % 2 ? '#ff3b2a' : '#c0281a';
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      D.text(ctx, 'START', cx, cy + 5, { size: 13, weight: 800, color: '#fff', align: 'center' });
    },
  };

  function drawModal(s, ctx) {
    const id = s.operating;
    const st = STATIONS[id];
    const a = D.modal(ctx, st.name, H_MODAL, { accent: ACCENT });
    D.text(ctx, `Paro de ${M.hoursLabel(s.round.hours)}`, a.x + a.w, a.y + 4, { size: 15, weight: 700, color: ACCENT, align: 'right' });
    if (id === 'arranque') {
      const missing = missingSteps(s);
      D.text(ctx, '¿Arrancar la línea?', a.x, a.y + 10, { size: 24, weight: 800 });
      D.paragraph(ctx, 'Antes de arrancar, revisa que el protocolo del plan de reacción esté completo. Si falta algo, la cerveza sale contaminada.', a.x, a.y + 44, a.w, { size: 15, color: T.dim });
      if (s.cfg.showProtocol) D.text(ctx, missing.length ? `Falta: ${missing.map((x) => M.STOP_STEPS[x].short).join(', ')}` : '✔ Protocolo completo', a.x, a.y + 110, { size: 16, weight: 700, color: missing.length ? T.red : T.ok });
      D.progressBar(ctx, a.x, a.y + 140, a.w, 26, s.action.progress / START_HOLD, T.red);
      D.text(ctx, 'Mantén ESPACIO para ARRANCAR', a.x + a.w / 2, a.y + 159, { size: 16, weight: 800, color: '#fff', align: 'center' });
      return;
    }
    if (id === 'cip' && !s.action.choice) {
      D.text(ctx, 'Elige el programa de limpieza', a.x, a.y + 10, { size: 20, weight: 800 });
      for (const o of cipOptions()) {
        D.panel(ctx, o.x, o.y, o.w, o.h, { fill: '#22160f', edge: ACCENT, radius: 10 });
        D.keycap(ctx, o.key, o.x + 26, o.y + 30, { size: 18, color: ACCENT });
        D.text(ctx, M.STOP_STEPS[o.step].label, o.x + 50, o.y + 37, { size: 22, weight: 800 });
        D.text(ctx, `${M.fmtNum(M.STOP_STEPS[o.step].time * s.cfg.timeMul, 1)} s de limpieza`, o.x + 50, o.y + 64, { size: 14, color: T.dim });
      }
      D.text(ctx, 'Pulsa 1 o 2 (o haz clic)', a.x + a.w / 2, a.y + 190, { size: 14, color: T.dim, align: 'center' });
      return;
    }
    const step = stepFor(s, id);
    const info = M.STOP_STEPS[step];
    const done = s.round.done.includes(step);
    D.text(ctx, info.label, a.x, a.y + 14, { size: 24, weight: 800 });
    if (done) {
      D.text(ctx, '✔ Hecho para este paro', a.x, a.y + 60, { size: 20, weight: 700, color: T.ok });
      return;
    }
    const need = info.time * s.cfg.timeMul;
    D.progressBar(ctx, a.x, a.y + 60, a.w, 26, s.action.progress / need, T.ok);
    D.text(ctx, s.action.running ? 'Limpiando…' : 'Mantén ESPACIO para hacerlo', a.x + a.w / 2, a.y + 79, { size: 16, weight: 800, color: '#fff', align: 'center' });
    D.paragraph(ctx, '¿Seguro que este paso toca? Si no está en el plan de reacción para este paro, solo retrasa la producción.', a.x, a.y + 122, a.w, { size: 14, color: T.dim });
  }

  function drawPlan(s, ctx) {
    const x = 70;
    const y = 104;
    const w = 820;
    const h = 420;
    ctx.fillStyle = 'rgba(8,4,3,0.7)';
    ctx.fillRect(0, D.VIEW.hud, D.VIEW.mapWidth, D.VIEW.height - D.VIEW.hud);
    D.panel(ctx, x, y, w, h, { fill: '#f2e3c6', edge: T.brass, radius: 10 });
    D.text(ctx, 'PLAN DE REACCIÓN FRENTE A PARADAS DE LÍNEA', x + 24, y + 38, { size: 24, weight: 800, color: '#3a1d0c' });
    D.text(ctx, 'manual, página 17', x + w - 24, y + 38, { size: 14, color: '#7a5030', align: 'right' });
    // Rombo de decisión.
    const dx = x + 120;
    const dy = y + 220;
    ctx.fillStyle = '#ffd9a8';
    ctx.strokeStyle = '#7a3010';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(dx, dy - 70);
    ctx.lineTo(dx + 90, dy);
    ctx.lineTo(dx, dy + 70);
    ctx.lineTo(dx - 90, dy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    D.text(ctx, '¿Cuánto', dx, dy - 8, { size: 17, weight: 800, color: '#3a1d0c', align: 'center' });
    D.text(ctx, 'lleva parada?', dx, dy + 14, { size: 17, weight: 800, color: '#3a1d0c', align: 'center' });
    M.STOP_RULES.forEach((rule, i) => {
      const by = y + 80 + i * 110;
      const cur = rule === s.round.rule && s.cfg.showProtocol;
      ctx.strokeStyle = '#7a3010';
      ctx.beginPath();
      ctx.moveTo(dx + 90, dy);
      ctx.lineTo(x + 290, by + 45);
      ctx.stroke();
      D.panel(ctx, x + 290, by, w - 320, 90, { fill: cur ? '#ffcf8a' : '#fff4e2', edge: '#7a3010', radius: 8 });
      D.text(ctx, rule.range, x + 306, by + 28, { size: 20, weight: 800, color: '#c4501a' });
      D.paragraph(ctx, rule.steps.map((st) => M.STOP_STEPS[st].label).join(' + '), x + 306, by + 54, w - 350, { size: 16, weight: 700, color: '#2a170d', maxLines: 2 });
    });
    D.text(ctx, `${s.cfg.tab ? 'TAB' : 'E'} cerrar · el reloj sigue corriendo`, x + w / 2, y + h - 14, { size: 14, weight: 700, color: '#7a5030', align: 'center' });
  }

  function drawToast(s, ctx, t) {
    const big = s.cfg.bigToast;
    const w = big ? 520 : 400;
    const h = big ? 130 : 96;
    const x = big ? (D.VIEW.mapWidth - w) / 2 : D.VIEW.mapWidth - w - 18;
    const y = big ? 250 : D.VIEW.hud + 14;
    const shake = Math.sin(t * 40) * (s.toast.life > s.toast.max - 0.4 ? 4 : 0);
    ctx.save();
    ctx.translate(shake, 0);
    D.panel(ctx, x, y, w, h, { fill: '#2a0f0a', edge: T.red, radius: 12, glow: T.red });
    D.text(ctx, '⚠ NOTIFICACIÓN', x + 16, y + 24, { size: 13, weight: 800, color: T.red });
    D.text(ctx, s.toast.text, x + 16, y + (big ? 62 : 54), { size: big ? 24 : 19, weight: 800, color: T.ink });
    const by = y + h - 22;
    D.keycap(ctx, 'Y', x + 30, by, { size: 13, color: T.red });
    D.text(ctx, 'Arrancar ya', x + 48, by + 5, { size: 14, weight: 700, color: '#ffb3a8' });
    D.keycap(ctx, 'X', x + 170, by, { size: 13, color: '#6e5a48' });
    D.text(ctx, 'Seguir el protocolo', x + 188, by + 5, { size: 14, weight: 700, color: T.dim });
    D.progressBar(ctx, x + 16, y + h - 6, w - 32, 3, s.toast.life / s.toast.max, T.red);
    ctx.restore();
  }

  function drawSidebar(s, ctx) {
    D.sidebar(ctx, 'AVISO DE PARO');
    const x = D.VIEW.mapWidth + 18;
    D.panel(ctx, x - 4, 104, 290, 92, { fill: '#2a170d', edge: ACCENT, radius: 8 });
    D.text(ctx, 'Línea detenida hace', x + 8, 128, { size: 14, color: T.dim });
    D.text(ctx, M.hoursLabel(s.round.hours), x + 8, 168, { size: 34, weight: 800, color: ACCENT });

    D.text(ctx, s.cfg.showProtocol ? 'PROTOCOLO A SEGUIR' : 'PASOS REALIZADOS', x, 230, { size: 13, weight: 700, color: T.dim });
    let y = 242;
    if (s.cfg.showProtocol) {
      for (const st of s.round.rule.steps) {
        D.checkRow(ctx, x - 4, y, M.STOP_STEPS[st].short, s.round.done.includes(st) ? 'done' : 'next', { width: 290 });
        y += 42;
      }
      D.checkRow(ctx, x - 4, y, 'Arrancar la línea', missingSteps(s).length ? 'todo' : 'next', { width: 290 });
      y += 42;
    } else {
      if (!s.round.done.length) D.text(ctx, 'Ninguno todavía.', x, y + 20, { size: 15, color: T.faint });
      for (const st of s.round.done) {
        D.checkRow(ctx, x - 4, y, M.STOP_STEPS[st].short, 'done', { width: 290 });
        y += 42;
      }
      D.paragraph(ctx, s.cfg.tab ? '¿No sabes qué toca? Consulta el plan (TAB).' : '¿No sabes qué toca? Ve al tablero PLAN DE REACCIÓN.', x, Math.max(y + 24, 300), 286, { size: 14, color: T.warn });
    }

    D.text(ctx, 'VIDAS', x, 500, { size: 13, weight: 700, color: T.dim });
    for (let i = 0; i < s.cfg.lives; i++) D.pumpkin(ctx, x + 24 + i * 54, 530, 26, i < s.lives);
    D.text(ctx, 'Cada arranque sin protocolo = 1 lote contaminado', x, 574, { size: 12, color: T.faint });
    D.text(ctx, 'PRESIÓN DEL TURNO', x, 610, { size: 13, weight: 700, color: T.dim });
    D.text(ctx, `${s.stats.resisted} notificaciones resistidas`, x, 634, { size: 15, weight: 600, color: T.ok });
    D.text(ctx, 'WASD mover · E operar · TAB plan', x + 143, 706, { size: 12, color: T.faint, align: 'center' });
  }

  function report(s) {
    const st = s.stats;
    let score = st.lotes * 20 - st.errors * 5 - st.contaminated * 20;
    score = Math.max(0, Math.min(100, score));
    const rank = s.gameOver ? 'C' : D.rankFor(score);
    return {
      score,
      rank,
      headline: s.gameOver ? 'GAME OVER: se arrancó la línea sin protocolo y salió cerveza contaminada' : `${st.lotes} ${st.lotes === 1 ? 'lote seguro envasado' : 'lotes seguros envasados'}`,
      rows: [
        ['Lotes seguros', String(st.lotes), T.ok],
        ['Pasos correctos del protocolo', String(st.correct), T.ink],
        ['Decisiones incorrectas', String(st.errors), st.errors ? T.red : T.ok],
        ['Lotes contaminados', String(st.contaminated), st.contaminated ? T.red : T.ok],
        ['Presiones resistidas', String(st.resisted), T.ok],
        ['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)],
      ],
      mistakes: s.bubble.log.slice(),
    };
  }

  function icon(ctx, cx, cy, size, t) {
    // Reloj con señal de stop.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#f2e3c6';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a1d0c';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(t * 2 - Math.PI / 2) * size * 0.3, Math.sin(t * 2 - Math.PI / 2) * size * 0.3);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -size * 0.2);
    ctx.stroke();
    ctx.translate(size * 0.32, size * 0.26);
    ctx.fillStyle = T.red;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * size * 0.2, Math.sin(a) * size * 0.2);
    }
    ctx.closePath();
    ctx.fill();
    D.text(ctx, 'STOP', 0, 4, { size: size * 0.09, weight: 800, color: '#fff', align: 'center' });
    ctx.restore();
  }

  PF.Games = PF.Games || [];
  PF.Games.push({
    id: 'stop',
    order: 4,
    title: 'Línea en Paro',
    subtitle: 'Decisiones Bajo Presión',
    tagline: 'La línea paró: aplica el plan de reacción correcto antes de arrancar.',
    accent: ACCENT,
    icon,
    howTo: [
      'Salta un aviso: "Línea detenida hace 2 horas".',
      'Mira el plan de reacción (p. 17) y corre a las estaciones que tocan.',
      'Cuando el protocolo esté completo, arranca la línea en START.',
      'Ignora las notificaciones que te meten prisa: arrancar sin protocolo = cerveza contaminada.',
    ],
    controls: [
      ['WASD', 'moverse', 'lstick'],
      ['E', 'operar', 'x'],
      ['ESPACIO', 'mantener acción', 'a'],
      ['TAB', 'plan de reacción', 'y'],
    ],
    difficulties: {
      facil: ['La tarjeta muestra el protocolo y resalta las estaciones', '3 vidas', 'Pocas notificaciones de presión'],
      normal: ['Tienes que consultar el plan (TAB)', '2 vidas · cada error resta 2 s', 'Notificaciones frecuentes'],
      dificil: ['El plan solo está en el tablero del mapa', '1 vida: un arranque sin protocolo es game over', 'Notificaciones constantes en medio de la pantalla'],
    },
    create,
  });
})();
