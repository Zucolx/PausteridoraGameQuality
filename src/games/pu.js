// Control de UP: panel de control de un pasteurizador.
// UP = t × 1,393^(T − 60). Mantén cada lote entre 24 y 30 UP (ideal 26) ajustando la
// temperatura, y decide con la llave de paso si va a la LLENADORA o al DESCARTE.
// Sin muñeco: todo se maneja desde el panel, con teclado o mando (PS / Xbox).
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const B = PF.Bubble;
  const T = D.T;
  const ACCENT = '#ff9a3c';

  // ------------------------------------------------------------- Fórmula
  const BASE = 1.393; // factor derivado de z = 10 °C
  const REF = 60; // °C: 1 UP por minuto a 60 °C
  const LIMITS = { min: 24, max: 30, ideal: 26, idealBand: 1 };

  function rate(T) {
    return Math.pow(BASE, T - REF);
  }

  function units(t, T) {
    return t * rate(T);
  }

  // Temperatura que da `pu` UP en `t` minutos.
  function tempFor(pu, t) {
    return REF + Math.log(pu / t) / Math.log(BASE);
  }

  function status(pu) {
    return pu < LIMITS.min ? 'sub' : pu > LIMITS.max ? 'sobre' : 'ok';
  }

  function isIdeal(pu) {
    return Math.abs(pu - LIMITS.ideal) <= LIMITS.idealBand;
  }

  function fmt(x, d = 1) {
    return x.toFixed(d).replace('.', ',');
  }

  // ------------------------------------------------------------- Ajustes
  const SEC_PER_MIN = 0.55; // segundos de juego por minuto de proceso
  const SPACING = 0.3; // separación entre lotes (fracción del túnel)
  const T_MIN = 55;
  const T_MAX = 70;
  const T_START = 62.9; // 10 min × 1,393^2,9 ≈ 26 UP
  const T_BASE = 10; // minutos dentro del túnel a velocidad normal

  const DIFF = {
    facil: { tau: 0.6, every: [9, 13], mag: 0.7, speed: false, suggest: true, estimate: true, band: true, tips: true },
    normal: { tau: 1.1, every: [6, 9], mag: 1, speed: true, suggest: false, estimate: true, band: true, tips: true },
    dificil: { tau: 1.7, every: [4.5, 7], mag: 1.3, speed: true, suggest: false, estimate: false, band: false, tips: false },
  };

  // Perturbaciones del proceso.
  const EVENTS = [
    { id: 'vapor-baja', name: 'Caída de presión de vapor', hint: 'La temperatura real baja: sube la consigna.', offset: [-2, -1.2], dur: [5, 8] },
    { id: 'vapor-sube', name: 'Pico de vapor', hint: 'La temperatura real sube: baja la consigna.', offset: [1, 1.6], dur: [4, 6] },
    { id: 'frias', name: 'Entran botellas frías', hint: 'Le roban calor al túnel: sube un poco la consigna.', offset: [-1.2, -0.8], dur: [3, 4] },
    { id: 'lenta', name: 'La llenadora baja la velocidad', hint: 'Más minutos dentro = más UP: baja la temperatura.', minutes: [12, 14], dur: [9, 13], speed: true },
    { id: 'rapida', name: 'La línea acelera', hint: 'Menos minutos dentro = menos UP: sube la temperatura.', minutes: [7, 8], dur: [9, 13], speed: true },
  ];

  // Distribución en pantalla (1280 × 720, sin barra lateral).
  const TUN = { x: 170, y: 92, w: 600, h: 156 };
  const BASE_Y = 230;
  const VALVE = { x: 880, y: 198 };
  const FILL = { x: 966, y: 80, w: 296, h: 110 };
  const DRAIN = { x: 966, y: 206, w: 296, h: 110 };
  // Barra de mensajes entre el proceso y los paneles: nunca tapa los controles.
  const MSG = { x: 8, y: 328, w: 1264, h: 66 };
  const PANELS = {
    temp: { x: 16, y: 400, w: 392, h: 312 },
    pu: { x: 420, y: 400, w: 440, h: 312 },
    valve: { x: 872, y: 400, w: 392, h: 312 },
  };

  // Controles: tecla y botón del mando para cada acción (se muestran según el dispositivo).
  const CTRL = {
    temp: { key: 'W / S', pad: ['dpadUD', 'lstickV'] },
    fill: { key: '1', pad: 'a' },
    drain: { key: '2', pad: 'b' },
    toggle: { key: 'ESPACIO', pad: 'rb' },
    help: { key: 'H', pad: 'y' },
    pause: { key: 'P', pad: 'start' },
  };

  // ------------------------------------------------------------- Estado

  function create(diffId = 'normal', opts = {}) {
    const cfg = DIFF[diffId] || DIFF.normal;
    const rng = D.makeRng(opts.seed);
    const duration = Math.max(40, Math.min(60, opts.duration || 60));
    const s = {
      id: 'pu',
      diff: diffId,
      cfg,
      rng,
      duration,
      timeLeft: duration,
      time: 0,
      over: false,
      setpoint: T_START,
      temp: T_START,
      offset: 0,
      minutes: T_BASE,
      event: null,
      nextEvent: 4 + rng() * 2,
      valve: 'fill',
      lotes: [],
      nextId: 1,
      hold: 0,
      help: false,
      bubble: B.create(),
      floats: [],
      banner: D.makeBanner('MANTÉN LAS UP ENTRE 24 Y 30', ACCENT, 'Ideal: 26 UP · la llave de paso decide si va a la llenadora o al descarte', 3.2),
      history: [],
      lastTip: -99,
      outT: 0,
      flash: { fill: 0, drain: 0 },
      stats: { lotes: 0, okFilled: 0, ideal: 0, correctDrain: 0, goodWasted: 0, badFilled: 0, points: 0, puSum: 0 },
    };
    spawn(s);
    s.update = (dt, input) => update(s, dt, input);
    s.draw = (r) => draw(s, r);
    s.report = () => report(s);
    return s;
  }

  function spawn(s) {
    s.lotes.push({ id: s.nextId++, p: -0.25, pu: 0, phase: 'belt', k: 0, dest: null });
  }

  function residence(s) {
    return s.minutes * SEC_PER_MIN;
  }

  function between(rng, [a, b]) {
    return a + rng() * (b - a);
  }

  // UP con que saldría un lote que entra ahora con la temperatura real actual.
  function projection(s) {
    return units(s.minutes, s.temp);
  }

  function estimateExit(s, lote) {
    const remaining = Math.max(0, 1 - Math.max(0, lote.p)) * s.minutes;
    return lote.pu + remaining * rate(s.temp);
  }

  // Próximo lote en llegar a la llave (el más adelantado sin decidir).
  function nextOut(s) {
    let best = null;
    for (const l of s.lotes) if ((l.phase === 'belt' || l.phase === 'exit') && (!best || l.p + l.k > best.p + best.k)) best = l;
    return best;
  }

  // ------------------------------------------------------------- Actualización

  function update(s, dt, input) {
    if (s.over) return;
    const pad = input.pad || { held: {}, pressed: [], ly: 0 };
    const P = input.pressed;
    const pp = pad.pressed;
    const clicks = input.clicks || [];
    const tapped = (rc) => clicks.some((c) => c.x >= rc.x && c.x <= rc.x + rc.w && c.y >= rc.y && c.y <= rc.y + rc.h);
    // La ayuda congela el turno; se abre también tocando "ayuda" y se cierra tocando la pantalla.
    if (s.help) {
      if (P.includes('help') || P.includes('tab') || P.includes('cancel') || pp.includes('y') || pp.includes('b') || clicks.length) s.help = false;
      return;
    }
    if (P.includes('help') || P.includes('tab') || pp.includes('y') || tapped(HELP_TAP)) {
      s.help = true;
      return;
    }

    s.time += dt;
    s.timeLeft -= dt;
    B.update(s.bubble, dt);
    s.floats = D.floatsUpdate(s.floats, dt);
    D.tickBanner(s, dt);
    s.flash.fill = Math.max(0, s.flash.fill - dt);
    s.flash.drain = Math.max(0, s.flash.drain - dt);
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      s.over = true;
      return;
    }

    // Llave de paso.
    if (P.includes('1') || pp.includes('a') || tapped(valveRect('fill'))) setValve(s, 'fill');
    if (P.includes('2') || pp.includes('b') || tapped(valveRect('drain'))) setValve(s, 'drain');
    if (P.includes('space') || pp.includes('rb') || pp.includes('lb') || tapped(toggleRect())) setValve(s, s.valve === 'fill' ? 'drain' : 'fill');

    // Consigna de temperatura: toque = 0,1 °C; mantener = rápido; stick = proporcional.
    const dpad = (pad.held.up ? 1 : 0) - (pad.held.down ? 1 : 0);
    const dir = Math.sign(-input.moveY + dpad);
    const analog = pad.ly ? -pad.ly : 0;
    if (analog) {
      s.setpoint += analog * 1.8 * dt;
      s.hold = 0;
    } else if (dir) {
      if (s.hold === 0) s.setpoint += dir * 0.1;
      s.hold += dt;
      if (s.hold > 0.3) s.setpoint += dir * 1.3 * dt;
    } else s.hold = 0;
    s.setpoint = Math.max(T_MIN, Math.min(T_MAX, s.setpoint));
    if (dir || analog) D.sfx('adjust');

    updateEvents(s, dt);
    // La temperatura real sigue a la consigna con retardo, más la perturbación.
    const target = s.setpoint + s.offset;
    s.temp += (target - s.temp) * Math.min(1, dt / s.cfg.tau);
    s.temp += (s.rng() - 0.5) * 0.012;

    updateLotes(s, dt);
    tips(s, dt);
  }

  // Zonas tocables: "ayuda" del HUD y las dos posiciones de la llave.
  const HELP_TAP = { x: 1170, y: 34, w: 110, h: 30 };
  // "alternar" bajo la llave también se puede tocar.
  function toggleRect() {
    const rc = PANELS.valve;
    return { x: rc.x + 10, y: rc.y + 158, w: 170, h: 28 };
  }

  function valveRect(v) {
    const rc = PANELS.valve;
    return { x: rc.x + 14, y: rc.y + (v === 'fill' ? 48 : 104), w: 236, h: 48 };
  }

  function setValve(s, v) {
    if (s.valve === v) return;
    s.valve = v;
    s.flash[v] = 0.25;
    D.sfx('enter');
  }

  function updateEvents(s, dt) {
    const e = s.event;
    let goal = 0;
    if (e) {
      e.left -= dt;
      if (!e.def.speed) goal = e.offset;
      if (e.left <= 0) {
        if (e.def.speed) {
          s.minutes = T_BASE;
          s.banner = D.makeBanner(`LÍNEA A VELOCIDAD NORMAL · t = ${T_BASE} min`, T.ok, 'Vuelve a la temperatura de antes', 2);
        }
        s.event = null;
      }
    } else {
      s.nextEvent -= dt;
      if (s.nextEvent <= 0) startEvent(s);
    }
    // La perturbación entra y sale de forma suave.
    s.offset += (goal - s.offset) * Math.min(1, dt / 0.5);
  }

  function startEvent(s) {
    const pool = EVENTS.filter((e) => !e.speed || s.cfg.speed);
    const def = pool[Math.floor(s.rng() * pool.length)];
    const left = between(s.rng, def.dur);
    const e = { def, left, total: left, offset: 0 };
    if (def.offset) e.offset = between(s.rng, def.offset) * s.cfg.mag;
    if (def.minutes) s.minutes = Math.round(between(s.rng, def.minutes));
    s.event = e;
    s.nextEvent = between(s.rng, s.cfg.every);
    D.sfx('alarm');
  }

  function updateLotes(s, dt) {
    const speed = 1 / residence(s);
    const r = rate(s.temp);
    for (const l of s.lotes) {
      if (l.phase === 'belt') {
        const p0 = l.p;
        l.p += speed * dt;
        // Solo cuenta el tramo recorrido dentro del túnel: fracción del túnel × t minutos × UP/min.
        const inside = Math.min(1, l.p) - Math.max(0, p0);
        if (inside > 0) l.pu += inside * s.minutes * r;
        if (l.p >= 1) {
          l.p = 1;
          l.phase = 'exit';
          l.k = 0;
        }
      } else if (l.phase === 'exit') {
        l.k += dt / 0.4;
        if (l.k >= 1) decide(s, l);
      } else if (l.phase === 'branch') {
        l.k += dt / 0.55;
        if (l.k >= 1) l.phase = 'done';
      }
    }
    s.lotes = s.lotes.filter((l) => l.phase !== 'done');
    const last = s.lotes.filter((l) => l.phase === 'belt').reduce((m, l) => Math.min(m, l.p), Infinity);
    if (!(last < -0.25 + SPACING)) spawn(s);
  }

  // El lote llega a la llave de paso: va adonde apunte la llave en ese momento.
  function decide(s, l) {
    l.phase = 'branch';
    l.k = 0;
    l.dest = s.valve;
    const st = status(l.pu);
    const ok = st === 'ok';
    const ideal = ok && isIdeal(l.pu);
    const tank = l.dest === 'fill' ? FILL : DRAIN;
    const fx = tank.x + tank.w / 2;
    const fy = tank.y + 30;
    let points = 0;
    let verdict;
    if (ok && l.dest === 'fill') {
      points = ideal ? 15 : 10;
      s.stats.okFilled++;
      if (ideal) s.stats.ideal++;
      verdict = 'good';
      D.floatAdd(s.floats, fx, fy, ideal ? `¡Ideal! ${fmt(l.pu)} UP` : `✔ ${fmt(l.pu)} UP`, ideal ? '#ffd34d' : T.ok, 18);
      D.sfx('resolved');
    } else if (!ok && l.dest === 'drain') {
      points = 5;
      s.stats.correctDrain++;
      verdict = 'good';
      D.floatAdd(s.floats, fx, fy, `Descarte correcto · ${fmt(l.pu)} UP`, T.warn, 16);
      D.sfx('blip');
    } else if (ok) {
      points = -5;
      s.stats.goodWasted++;
      verdict = 'bad';
      D.floatAdd(s.floats, fx, fy, `Cerveza buena botada · ${fmt(l.pu)} UP`, T.red, 16);
      B.say(s.bubble, 'Ese lote estaba entre 24 y 30 UP: era cerveza buena. Botarla también es una pérdida: mándala a la LLENADORA.');
    } else {
      points = -20;
      s.stats.badFilled++;
      verdict = 'bad';
      D.floatAdd(s.floats, fx, fy, `¡Defectuoso envasado! ${fmt(l.pu)} UP`, T.red, 17);
      B.say(
        s.bubble,
        st === 'sub'
          ? 'Lote SUBPASTEURIZADO (menos de 24 UP) enviado a la llenadora: sale turbio y con bolitas verde pálido. Debía ir a DESCARTE.'
          : 'Lote SOBREPASTEURIZADO (más de 30 UP) enviado a la llenadora: tiene aspecto y sabor a quemado. Debía ir a DESCARTE.'
      );
    }
    s.stats.lotes++;
    s.stats.points += points;
    s.stats.puSum += l.pu;
    s.history.push({ pu: l.pu, dest: l.dest, verdict });
  }

  // Avisos didácticos (no cuentan como error): explican la fórmula con los números actuales.
  function tips(s, dt) {
    if (!s.cfg.tips) return;
    const proj = projection(s);
    const st = status(proj);
    s.outT = st === 'ok' ? 0 : s.outT + dt;
    if (s.outT < 1.5 || s.time - s.lastTip < 7 || (s.bubble.cur && s.bubble.cur.kind === 'error')) return;
    s.lastTip = s.time;
    const r = rate(s.temp);
    B.say(
      s.bubble,
      `A ${fmt(s.temp)} °C cada minuto suma ${fmt(r, 2)} UP → ${s.minutes} min × ${fmt(r, 2)} = ${fmt(proj)} UP. ${st === 'sub' ? 'Sube' : 'Baja'} la temperatura hacia ${fmt(tempFor(LIMITS.ideal, s.minutes))} °C.`,
      { kind: 'tip', life: 5 }
    );
  }

  // ------------------------------------------------------------- Dibujo

  function draw(s, r) {
    const ctx = r.ctx;
    const t = r.t;
    D.begin(r);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, D.VIEW.width, D.VIEW.height);
    drawProcess(s, ctx, t);
    drawTempPanel(s, ctx);
    drawPuPanel(s, ctx);
    drawValvePanel(s, ctx, t);
    D.floatsDraw(ctx, s.floats);
    const e = s.event;
    const eventNotice = e && {
      text: `⚠ ${e.def.name}${e.def.speed ? ` · t = ${s.minutes} min` : ''}`,
      sub: e.def.hint,
      color: T.warn,
      life: e.left,
      max: e.total,
    };
    B.bar(ctx, MSG, { bubble: s.bubble, notices: [eventNotice, s.banner], t });
    D.hud(ctx, t, {
      title: 'CONTROL DE UP',
      diff: s.diff,
      timeLeft: s.timeLeft,
      duration: s.duration,
      accent: ACCENT,
      stats: [
        { label: 'Puntos', value: s.stats.points, color: s.stats.points >= 0 ? T.ok : T.red, width: 130 },
        { label: 'Lotes', value: s.stats.lotes, width: 110 },
      ],
    });
    D.hints(ctx, [[CTRL.help, 'ayuda']], 1266, 50, { size: 11, align: 'right', ink: T.dim, color: '#6e5a48' });
    if (s.help) drawHelp(s, ctx, t);
  }

  function drawProcess(s, ctx, t) {
    D.panel(ctx, 8, 72, 1264, MSG.y - 78, { fill: '#120b08', edge: '#2e1d13', radius: 12 });
    // Cinta.
    ctx.fillStyle = '#2b2320';
    ctx.fillRect(16, BASE_Y + 2, VALVE.x - 30, 12);
    ctx.fillStyle = '#4a3d36';
    for (let x = 16 - ((t * 60) % 24); x < VALVE.x - 20; x += 24) if (x > 14) ctx.fillRect(x, BASE_Y + 4, 12, 8);
    D.text(ctx, 'ENTRADA', 70, BASE_Y + 36, { size: 13, weight: 700, color: T.faint, align: 'center' });

    // Túnel de pasteurización.
    const heat = Math.max(0, Math.min(1, (s.temp - 55) / 15));
    ctx.save();
    const g = ctx.createLinearGradient(0, TUN.y, 0, TUN.y + TUN.h);
    g.addColorStop(0, `rgba(${180 + heat * 75},${70 + heat * 40},20,0.35)`);
    g.addColorStop(1, 'rgba(40,20,10,0.15)');
    ctx.fillStyle = g;
    D.roundRect(ctx, TUN.x, TUN.y, TUN.w, TUN.h, 12);
    ctx.fill();
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 10; i++) {
      const k = (t * 0.35 + i * 0.1) % 1;
      ctx.globalAlpha = (1 - k) * 0.35;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(TUN.x + 30 + i * 58, TUN.y + 110 - k * 80, 6 + k * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    D.text(ctx, 'TÚNEL DE PASTEURIZACIÓN', TUN.x + 14, TUN.y + 24, { size: 15, weight: 800, color: '#ffcf9a' });
    D.text(ctx, `T real ${fmt(s.temp)} °C · t = ${s.minutes} min dentro`, TUN.x + TUN.w - 14, TUN.y + 24, { size: 15, weight: 700, color: '#ffcf9a', align: 'right', family: D.MONO });

    // Perturbación activa: el túnel parpadea en ámbar (el detalle va en la barra de mensajes).
    if (s.event) {
      ctx.save();
      ctx.strokeStyle = T.warn;
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 8);
      ctx.lineWidth = 4;
      D.roundRect(ctx, TUN.x - 4, TUN.y - 4, TUN.w + 8, TUN.h + 8, 14);
      ctx.stroke();
      ctx.restore();
    }

    // Salida, llave de paso y tanques.
    D.pipe(ctx, [
      { x: TUN.x + TUN.w, y: BASE_Y - 22 },
      { x: VALVE.x, y: BASE_Y - 22 },
    ]);
    const up = [
      { x: VALVE.x, y: VALVE.y },
      { x: 930, y: VALVE.y },
      { x: 930, y: FILL.y + 60 },
      { x: FILL.x, y: FILL.y + 60 },
    ];
    const down = [
      { x: VALVE.x, y: VALVE.y },
      { x: 930, y: VALVE.y },
      { x: 930, y: DRAIN.y + 60 },
      { x: DRAIN.x, y: DRAIN.y + 60 },
    ];
    D.pipe(ctx, up);
    D.pipe(ctx, down);
    const open = s.valve === 'fill' ? up : down;
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.lineDashOffset = -t * 40;
    D.strokePath(ctx, open, 5, s.valve === 'fill' ? T.ok : T.red);
    ctx.restore();
    drawTank(ctx, FILL, 'LLENADORA', T.ok, s.stats.okFilled + s.stats.badFilled, s.valve === 'fill');
    drawTank(ctx, DRAIN, 'DESCARTE', T.red, s.stats.correctDrain + s.stats.goodWasted, s.valve === 'drain');
    drawValveIcon(ctx, s);

    // Lotes.
    for (const l of s.lotes) {
      const pos = lotePos(l);
      const revealed = l.phase !== 'belt';
      beer(ctx, pos.x, pos.y, 54, l.pu, t, revealed);
      if (l.p >= 0 && l.phase === 'belt') {
        D.text(ctx, fmt(l.pu), pos.x, pos.y - 66, { size: 15, weight: 800, color: '#fff', align: 'center', family: D.MONO });
        if (s.cfg.estimate) {
          const est = estimateExit(s, l);
          D.text(ctx, `→ ${fmt(est, 0)}`, pos.x, pos.y - 82, { size: 12, weight: 700, color: statusColor(status(est)), align: 'center' });
        }
      } else if (revealed) {
        D.text(ctx, `${fmt(l.pu)} UP`, pos.x, pos.y - 66, { size: 15, weight: 800, color: statusColor(status(l.pu)), align: 'center', family: D.MONO });
      }
    }
  }

  function lotePos(l) {
    if (l.phase === 'belt') return { x: TUN.x + l.p * TUN.w, y: BASE_Y };
    if (l.phase === 'exit') return { x: TUN.x + TUN.w + l.k * (VALVE.x - TUN.x - TUN.w - 24), y: BASE_Y };
    const tank = l.dest === 'fill' ? FILL : DRAIN;
    const ex = VALVE.x + 10 + l.k * (tank.x + 60 - VALVE.x);
    const ey = BASE_Y + (tank.y + 92 - BASE_Y) * Math.min(1, l.k * 1.4);
    return { x: ex, y: ey };
  }

  function drawTank(ctx, rc, label, color, count, open) {
    D.panel(ctx, rc.x, rc.y, rc.w, rc.h, { fill: open ? '#1c140f' : '#140d0a', edge: open ? color : '#3a2418', radius: 12, glow: open ? color : null });
    D.text(ctx, label, rc.x + rc.w - 16, rc.y + 34, { size: 24, weight: 800, color, align: 'right' });
    D.text(ctx, `${count} lotes`, rc.x + rc.w - 16, rc.y + 62, { size: 16, weight: 700, color: T.dim, align: 'right', family: D.MONO });
    // Botellas acumuladas en el tanque.
    for (let i = 0; i < Math.min(count, 14); i++) {
      const bx = rc.x + 16 + (i % 7) * 18;
      const by = rc.y + 54 + Math.floor(i / 7) * 34;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75;
      D.roundRect(ctx, bx, by, 12, 22, 3);
      ctx.fill();
      ctx.fillRect(bx + 4, by - 7, 4, 8);
      ctx.globalAlpha = 1;
    }
    if (open) D.text(ctx, '◀ LLAVE ABIERTA', rc.x + rc.w - 16, rc.y + rc.h - 14, { size: 13, weight: 800, color, align: 'right' });
  }

  function drawValveIcon(ctx, s) {
    const { x, y } = VALVE;
    ctx.fillStyle = '#3b3431';
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0d0807';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Palanca: apunta a la rama abierta.
    const ang = s.valve === 'fill' ? -Math.PI / 3 : Math.PI / 3;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = s.valve === 'fill' ? T.ok : T.red;
    D.roundRect(ctx, -6, -6, 56, 12, 6);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#c9c0b8';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    D.text(ctx, 'LLAVE DE PASO', x, y + 48, { size: 12, weight: 800, color: T.dim, align: 'center' });
  }

  function statusColor(st) {
    return st === 'ok' ? T.ok : st === 'sub' ? '#8fd6b8' : '#e0703a';
  }

  function mix(a, b, k) {
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
  }

  // Botella con el aspecto de la cerveza según sus UP (revealed = ya salió del túnel).
  function beer(ctx, x, baseY, h, pu, t, revealed, { seed = 0 } = {}) {
    const st = revealed ? status(pu) : 'ok';
    const sev = st === 'sub' ? Math.max(0.35, Math.min(1, (LIMITS.min - pu) / 8)) : st === 'sobre' ? Math.max(0.35, Math.min(1, (pu - LIMITS.max) / 8)) : 0;
    const bw = h * 0.44;
    const bodyH = h * 0.64;
    const neckH = h * 0.26;
    const top = baseY - bodyH;
    ctx.save();
    // Vidrio.
    ctx.fillStyle = 'rgba(230,240,245,0.18)';
    ctx.strokeStyle = 'rgba(230,240,245,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - bw / 2, baseY);
    ctx.lineTo(x - bw / 2, top + 6);
    ctx.quadraticCurveTo(x - bw / 2, top - 6, x - bw * 0.2, top - 10);
    ctx.lineTo(x - bw * 0.2, top - neckH);
    ctx.lineTo(x + bw * 0.2, top - neckH);
    ctx.lineTo(x + bw * 0.2, top - 10);
    ctx.quadraticCurveTo(x + bw / 2, top - 6, x + bw / 2, top + 6);
    ctx.lineTo(x + bw / 2, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.clip();
    // Líquido.
    let color = '#f2b134';
    if (st === 'sub') color = mix('#f2b134', '#d6d9a2', sev);
    if (st === 'sobre') color = mix('#f2b134', '#4a2008', sev);
    ctx.fillStyle = color;
    ctx.fillRect(x - bw / 2, top - 4, bw, bodyH + 4);
    // Espuma.
    ctx.fillStyle = st === 'sobre' ? mix('#fff6e0', '#b08a5a', sev) : '#fff6e0';
    ctx.fillRect(x - bw / 2, top - 12, bw, 9);
    if (st === 'ok') {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.8 + i * 0.27 + seed) % 1;
        ctx.beginPath();
        ctx.arc(x - bw * 0.25 + (i % 2) * bw * 0.4, baseY - 4 - k * (bodyH - 10), 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (st === 'sub') {
      // Turbia con bolitas verde pálido.
      ctx.fillStyle = `rgba(255,255,255,${0.25 + sev * 0.3})`;
      ctx.fillRect(x - bw / 2, top - 4, bw, bodyH + 4);
      ctx.fillStyle = '#b8f0a4';
      const n = Math.round(3 + sev * 6);
      for (let i = 0; i < n; i++) {
        const px = x - bw * 0.35 + ((i * 37) % 10) / 10 * bw * 0.7;
        const py = baseY - 6 - ((i * 53) % 10) / 10 * (bodyH - 12) + Math.sin(t * 2 + i) * 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 1.8 + (i % 3) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Quemada: motas oscuras.
      ctx.fillStyle = 'rgba(20,6,0,0.55)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(x - bw * 0.3 + ((i * 29) % 10) / 10 * bw * 0.6, baseY - 8 - ((i * 41) % 10) / 10 * (bodyH - 16), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    if (st === 'sobre') {
      // Humo de "quemado".
      ctx.strokeStyle = 'rgba(160,150,140,0.6)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        const sx = x - 4 + i * 8;
        ctx.moveTo(sx, top - neckH - 2);
        ctx.quadraticCurveTo(sx + 6 * Math.sin(t * 3 + i), top - neckH - 10, sx, top - neckH - 18);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#c0281a';
    ctx.fillRect(x - bw * 0.24, top - neckH - 4, bw * 0.48, 5);
  }

  function panelTitle(ctx, rc, title, color = ACCENT) {
    D.panel(ctx, rc.x, rc.y, rc.w, rc.h, { fill: '#150d09', edge: '#3d2619', radius: 12 });
    ctx.fillStyle = color;
    D.roundRect(ctx, rc.x, rc.y, rc.w, 36, 12);
    ctx.fill();
    ctx.fillRect(rc.x, rc.y + 20, rc.w, 16);
    D.text(ctx, title, rc.x + 16, rc.y + 25, { size: 17, weight: 800, color: '#170e0a' });
  }

  function drawTempPanel(s, ctx) {
    const rc = PANELS.temp;
    panelTitle(ctx, rc, 'TEMPERATURA (T)');
    const proj = projection(s);
    const col = statusColor(status(proj));
    D.text(ctx, 'Real', rc.x + 18, rc.y + 66, { size: 15, weight: 700, color: T.dim });
    D.text(ctx, `${fmt(s.temp)} °C`, rc.x + 18, rc.y + 120, { size: 54, weight: 700, color: col, family: D.MONO });
    D.text(ctx, 'Consigna', rc.x + 18, rc.y + 154, { size: 15, weight: 700, color: T.dim });
    D.text(ctx, `${fmt(s.setpoint)} °C`, rc.x + 18, rc.y + 188, { size: 30, weight: 700, color: T.ink, family: D.MONO });
    const diff = s.setpoint + s.offset - s.temp;
    if (Math.abs(diff) > 0.15) D.text(ctx, diff > 0 ? '▲ calentando' : '▼ enfriando', rc.x + 160, rc.y + 186, { size: 14, weight: 700, color: diff > 0 ? '#ff8a5a' : '#7fc8ff' });

    // Termómetro vertical con la ventana de temperatura que da 24-30 UP.
    const bx = rc.x + rc.w - 70;
    const by = rc.y + 54;
    const bh = 210;
    const pos = (v) => by + bh - ((v - T_MIN) / (T_MAX - T_MIN)) * bh;
    ctx.fillStyle = '#2a1c15';
    D.roundRect(ctx, bx, by, 26, bh, 13);
    ctx.fill();
    if (s.cfg.band) {
      const lo = tempFor(LIMITS.min, s.minutes);
      const hi = tempFor(LIMITS.max, s.minutes);
      ctx.fillStyle = 'rgba(125,220,106,0.35)';
      ctx.fillRect(bx - 6, pos(hi), 38, pos(lo) - pos(hi));
      ctx.fillStyle = T.ok;
      ctx.fillRect(bx - 8, pos(tempFor(LIMITS.ideal, s.minutes)) - 1, 42, 2);
      D.text(ctx, '24–30 UP', bx - 10, pos(hi) - 6, { size: 11, weight: 700, color: T.ok, align: 'right' });
    }
    const fillTop = pos(Math.max(T_MIN, Math.min(T_MAX, s.temp)));
    ctx.fillStyle = col;
    D.roundRect(ctx, bx + 6, fillTop, 14, by + bh - fillTop, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx + 13, by + bh + 12, 16, 0, Math.PI * 2);
    ctx.fill();
    const sy = pos(s.setpoint);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(bx + 30, sy);
    ctx.lineTo(bx + 42, sy - 7);
    ctx.lineTo(bx + 42, sy + 7);
    ctx.closePath();
    ctx.fill();
    D.text(ctx, `${T_MAX}`, bx + 46, by + 8, { size: 11, color: T.faint });
    D.text(ctx, `${T_MIN}`, bx + 46, by + bh, { size: 11, color: T.faint });

    D.text(ctx, `t = ${s.minutes} min (velocidad de la línea)`, rc.x + 18, rc.y + 224, { size: 14, weight: 600, color: T.dim });
    const cy = rc.y + rc.h - 30;
    const w = D.control(ctx, CTRL.temp, rc.x + 18, cy, { size: 15, color: ACCENT });
    D.text(ctx, 'subir / bajar', rc.x + 26 + w, cy + 2, { size: 15, weight: 700 });
    const how = D.InputState.device === 'touch' ? 'arrastra el dedo ↑ ↓ en la mitad izquierda' : 'toque = 0,1 °C · mantener = rápido';
    D.text(ctx, how, rc.x + 26 + w, cy + 18, { size: 12, color: T.dim });
  }

  function drawPuPanel(s, ctx) {
    const rc = PANELS.pu;
    panelTitle(ctx, rc, 'UNIDADES DE PASTEURIZACIÓN (UP)');
    const proj = projection(s);
    const r = rate(s.temp);
    const st = status(proj);
    // Fórmula.
    const fx = rc.x + 18;
    let fy = rc.y + 70;
    D.text(ctx, 'UP = t × 1,393', fx, fy, { size: 26, weight: 800, color: T.ink });
    ctx.font = D.font(26, 800);
    const w0 = ctx.measureText('UP = t × 1,393').width;
    D.text(ctx, '(T − 60)', fx + w0 + 3, fy - 13, { size: 16, weight: 800, color: ACCENT });
    fy += 32;
    const sub = `UP = ${s.minutes} min × 1,393`;
    D.text(ctx, sub, fx, fy, { size: 19, weight: 700, color: T.dim, family: D.MONO });
    ctx.font = D.font(19, 700, D.MONO);
    const w1 = ctx.measureText(sub).width;
    D.text(ctx, `(${fmt(s.temp)} − 60)`, fx + w1 + 3, fy - 10, { size: 13, weight: 700, color: ACCENT, family: D.MONO });
    fy += 30;
    D.text(ctx, `   = ${s.minutes} × ${fmt(r, 2)} = `, fx, fy, { size: 19, weight: 700, color: T.dim, family: D.MONO });
    ctx.font = D.font(19, 700, D.MONO);
    const w2 = ctx.measureText(`   = ${s.minutes} × ${fmt(r, 2)} = `).width;
    D.text(ctx, `${fmt(proj)} UP`, fx + w2, fy, { size: 22, weight: 800, color: statusColor(st), family: D.MONO });
    D.text(ctx, `Cada minuto a ${fmt(s.temp)} °C suma ${fmt(r, 2)} UP · +1 °C ≈ +39 % de UP`, fx, fy + 24, { size: 13, weight: 600, color: T.dim });

    // Indicador semicircular de UP (lote que entra ahora).
    const cx = rc.x + rc.w / 2;
    const cy = rc.y + rc.h - 30;
    const R = 92;
    const vmin = 10;
    const vmax = 40;
    const ang = (v) => Math.PI + ((Math.max(vmin, Math.min(vmax, v)) - vmin) / (vmax - vmin)) * Math.PI;
    const arc = (a, b, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.arc(cx, cy, R, ang(a), ang(b));
      ctx.stroke();
    };
    arc(vmin, LIMITS.min, '#3f7f6a');
    arc(LIMITS.min, LIMITS.max, '#3f8a34');
    arc(LIMITS.max, vmax, '#8a3a1a');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    const ai = ang(LIMITS.ideal);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ai) * (R - 14), cy + Math.sin(ai) * (R - 14));
    ctx.lineTo(cx + Math.cos(ai) * (R + 14), cy + Math.sin(ai) * (R + 14));
    ctx.stroke();
    for (const v of [LIMITS.min, LIMITS.ideal, LIMITS.max]) {
      const a = ang(v);
      D.text(ctx, String(v), cx + Math.cos(a) * (R + 26), cy + Math.sin(a) * (R + 26) + 4, { size: 13, weight: 800, color: v === LIMITS.ideal ? '#fff' : T.dim, align: 'center' });
    }
    D.text(ctx, 'SUB', cx - R - 4, cy + 18, { size: 12, weight: 800, color: '#8fd6b8', align: 'center' });
    D.text(ctx, 'SOBRE', cx + R + 4, cy + 18, { size: 12, weight: 800, color: '#e0703a', align: 'center' });
    const an = ang(proj);
    ctx.strokeStyle = statusColor(st);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(an) * (R - 6), cy + Math.sin(an) * (R - 6));
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    // Etiqueta sobre una cápsula oscura para que la aguja no la tape.
    const label = st === 'ok' ? (isIdeal(proj) ? 'EN EL IDEAL' : 'EN RANGO') : st === 'sub' ? 'SUBPASTEURIZA' : 'SOBREPASTEURIZA';
    ctx.font = D.font(14, 800);
    const lw = ctx.measureText(label).width + 20;
    ctx.fillStyle = 'rgba(21,13,9,0.9)';
    D.roundRect(ctx, cx - lw / 2, cy - 46, lw, 26, 13);
    ctx.fill();
    D.text(ctx, label, cx, cy - 28, { size: 14, weight: 800, color: statusColor(st), align: 'center' });
    D.text(ctx, 'lote que entra ahora', cx, cy + 22, { size: 12, color: T.faint, align: 'center' });
  }

  function drawValvePanel(s, ctx, t) {
    const rc = PANELS.valve;
    panelTitle(ctx, rc, 'LLAVE DE PASO');
    const opts = [
      { v: 'fill', label: 'LLENADORA', color: T.ok, ctrl: CTRL.fill, y: rc.y + 48 },
      { v: 'drain', label: 'DESCARTE', color: T.red, ctrl: CTRL.drain, y: rc.y + 104 },
    ];
    for (const o of opts) {
      const on = s.valve === o.v;
      const flash = s.flash[o.v] > 0;
      D.panel(ctx, rc.x + 14, o.y, 236, 48, { fill: on ? o.color : '#1e130e', edge: on ? o.color : '#3d2619', radius: 10, glow: on || flash ? o.color : null });
      const w = D.control(ctx, o.ctrl, rc.x + 26, o.y + 24, { size: 15, color: on ? '#170e0a' : o.color, keyInk: on ? o.color : '#140c09' });
      D.text(ctx, o.label, rc.x + 34 + w, o.y + 31, { size: 20, weight: 800, color: on ? '#170e0a' : o.color });
      if (on) D.text(ctx, 'ABIERTA', rc.x + 240, o.y + 30, { size: 12, weight: 800, color: '#170e0a', align: 'right' });
    }
    D.hints(ctx, [[CTRL.toggle, 'alternar']], rc.x + 16, rc.y + 172, { size: 12, ink: T.dim });

    // Próximo lote en llegar a la llave.
    const nl = nextOut(s);
    const px = rc.x + 320;
    D.text(ctx, 'PRÓXIMO', px, rc.y + 60, { size: 12, weight: 800, color: T.dim, align: 'center' });
    if (nl) {
      const known = nl.phase === 'exit';
      const val = known ? nl.pu : s.cfg.estimate ? estimateExit(s, nl) : nl.pu;
      beer(ctx, px, rc.y + 150, 64, val, t, known || s.cfg.estimate, { seed: 0.3 });
      D.text(ctx, `${fmt(val)} UP`, px, rc.y + 172, { size: 17, weight: 800, color: known || s.cfg.estimate ? statusColor(status(val)) : T.ink, align: 'center', family: D.MONO });
      D.text(ctx, known ? 'saliendo' : s.cfg.estimate ? 'estimado' : 'acumulado', px, rc.y + 188, { size: 11, color: T.faint, align: 'center' });
      if (s.cfg.suggest && (known || s.cfg.estimate)) {
        const want = status(val) === 'ok' ? 'fill' : 'drain';
        const okNow = want === s.valve;
        D.text(ctx, okNow ? '✔ llave bien puesta' : `⚠ cambia a ${want === 'fill' ? 'LLENADORA' : 'DESCARTE'}`, rc.x + 16, rc.y + 198, { size: 14, weight: 800, color: okNow ? T.ok : T.warn });
      }
    }

    // Historial de lotes.
    const hx = rc.x + 16;
    const hy = rc.y + 214;
    const hw = rc.w - 32;
    const hh = 84;
    D.text(ctx, 'ÚLTIMOS LOTES', hx, hy + 2, { size: 11, weight: 800, color: T.dim });
    const yv = (v) => hy + hh - (Math.min(40, v) / 40) * (hh - 12);
    ctx.fillStyle = 'rgba(125,220,106,0.15)';
    ctx.fillRect(hx, yv(LIMITS.max), hw, yv(LIMITS.min) - yv(LIMITS.max));
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(hx, yv(LIMITS.ideal), hw, 1);
    const list = s.history.slice(-16);
    const bw = hw / 16;
    list.forEach((h, i) => {
      const x = hx + i * bw + 2;
      ctx.fillStyle = statusColor(status(h.pu));
      ctx.fillRect(x, yv(h.pu), bw - 4, hy + hh - yv(h.pu));
      if (h.verdict === 'bad') {
        ctx.strokeStyle = T.red;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, yv(h.pu) - 1, bw - 2, hy + hh - yv(h.pu) + 2);
      }
      D.text(ctx, h.dest === 'fill' ? '▲' : '▼', x + (bw - 4) / 2, hy + hh + 12, { size: 10, color: h.dest === 'fill' ? T.ok : T.red, align: 'center' });
    });
  }

  function drawHelp(s, ctx, t) {
    ctx.fillStyle = 'rgba(8,4,3,0.88)';
    ctx.fillRect(0, 0, D.VIEW.width, D.VIEW.height);
    D.panel(ctx, 60, 40, 1160, 640, { fill: '#f2e3c6', edge: T.brass, radius: 12 });
    const ink = '#2a170d';
    D.text(ctx, '¿CÓMO SE CALCULAN LAS UNIDADES DE PASTEURIZACIÓN?', 90, 86, { size: 26, weight: 800, color: '#3a1d0c' });
    D.text(ctx, 'UP = t × 1,393', 90, 140, { size: 40, weight: 800, color: ink });
    ctx.font = D.font(40, 800);
    D.text(ctx, '(T − 60)', 90 + ctx.measureText('UP = t × 1,393').width + 4, 118, { size: 24, weight: 800, color: '#c4501a' });
    const lines = [
      ['UP', 'unidades de pasteurización acumuladas.'],
      ['t', 'minutos que el producto permanece a la temperatura T.'],
      ['T', 'temperatura real del producto (°C), idealmente en el punto más frío del envase.'],
      ['60', 'temperatura de referencia: 1 UP por minuto a 60 °C.'],
      ['1,393', 'factor derivado del valor z = 10 °C para inactivar microorganismos.'],
    ];
    lines.forEach(([k, v], i) => {
      D.text(ctx, k, 110, 186 + i * 28, { size: 18, weight: 800, color: '#c4501a' });
      D.text(ctx, v, 180, 186 + i * 28, { size: 17, weight: 600, color: ink });
    });
    D.text(ctx, 'Ejemplo: 10 min a 63 °C → 10 × 1,393³ = 10 × 2,70 = 27,0 UP (en rango).', 90, 340, { size: 18, weight: 700, color: '#3a1d0c' });
    D.text(ctx, '+1 °C multiplica las UP por 1,393 (≈ +39 %): ¡la temperatura se ajusta en décimas!', 90, 366, { size: 16, weight: 600, color: '#7a3010' });

    const cards = [
      { pu: 20, title: 'MENOS DE 24 UP', sub: 'SUBPASTEURIZADA', desc: 'Turbia, con bolitas verde pálido.', to: '→ DESCARTE', color: '#2f7a6a' },
      { pu: 26, title: '24 – 30 UP (ideal 26)', sub: 'EN RANGO', desc: 'Dorada y brillante.', to: '→ LLENADORA', color: '#2f7a33' },
      { pu: 35, title: 'MÁS DE 30 UP', sub: 'SOBREPASTEURIZADA', desc: 'Aspecto y sabor a quemado.', to: '→ DESCARTE', color: '#a0401a' },
    ];
    cards.forEach((c, i) => {
      const x = 90 + i * 300;
      const y = 396;
      D.panel(ctx, x, y, 280, 190, { fill: '#fff4e2', edge: c.color, radius: 10 });
      ctx.fillStyle = '#1a1210';
      D.roundRect(ctx, x + 12, y + 12, 80, 166, 8);
      ctx.fill();
      beer(ctx, x + 52, y + 160, 96, c.pu, t, true, { seed: i * 0.2 });
      D.text(ctx, c.title, x + 104, y + 38, { size: 16, weight: 800, color: c.color });
      D.text(ctx, c.sub, x + 104, y + 62, { size: 14, weight: 800, color: ink });
      D.paragraph(ctx, c.desc, x + 104, y + 90, 166, { size: 15, weight: 600, color: ink });
      D.text(ctx, c.to, x + 104, y + 166, { size: 18, weight: 800, color: c.color });
    });

    D.text(ctx, 'CONTROLES', 1010, 420, { size: 15, weight: 800, color: '#7a3010' });
    const ctrls = [
      [CTRL.temp, 'temperatura'],
      [CTRL.fill, 'llave → llenadora'],
      [CTRL.drain, 'llave → descarte'],
      [CTRL.toggle, 'alternar llave'],
      [CTRL.pause, 'pausa'],
    ];
    ctrls.forEach(([spec, label], i) => {
      const y = 452 + i * 30;
      const w = D.control(ctx, spec, 1010, y, { size: 13 });
      D.text(ctx, label, 1018 + w, y + 5, { size: 14, weight: 700, color: ink });
    });
    D.hints(ctx, [[CTRL.help, 'volver al juego (el turno está en pausa)']], 640, 640, { size: 17, align: 'center', ink, color: '#c4501a' });
  }

  // ------------------------------------------------------------- Reporte

  function report(s) {
    const st = s.stats;
    const score = st.lotes ? Math.max(0, Math.min(100, Math.round((100 * st.points) / (st.lotes * 15)))) : 0;
    const rank = D.rankFor(score);
    const avg = st.lotes ? st.puSum / st.lotes : 0;
    return {
      score,
      rank,
      headline: st.lotes
        ? `${st.okFilled} de ${st.lotes} lotes envasados en rango · UP promedio ${fmt(avg)} (ideal 26)`
        : 'Ningún lote llegó a la llave de paso',
      rows: [
        ['Lotes envasados en rango (24–30 UP)', String(st.okFilled), T.ok],
        ['Lotes en el ideal (25–27 UP)', String(st.ideal), T.ok],
        ['Descartes correctos', String(st.correctDrain), T.ink],
        ['Cerveza buena botada', String(st.goodWasted), st.goodWasted ? T.warn : T.ok],
        ['Defectuosos enviados a la llenadora', String(st.badFilled), st.badFilled ? T.red : T.ok],
        ['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)],
      ],
      mistakes: s.bubble.log.slice(),
    };
  }

  // ------------------------------------------------------------- Menú

  function icon(ctx, cx, cy, size, t) {
    // Medidor de UP con la aguja oscilando en la zona verde.
    const R = size * 0.42;
    const y = cy + size * 0.18;
    const seg = (a, b, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = size * 0.12;
      ctx.beginPath();
      ctx.arc(cx, y, R, Math.PI + a * Math.PI, Math.PI + b * Math.PI);
      ctx.stroke();
    };
    seg(0, 0.46, '#3f7f6a');
    seg(0.46, 0.67, '#7ddc6a');
    seg(0.67, 1, '#8a3a1a');
    const a = Math.PI + (0.55 + 0.08 * Math.sin(t * 2)) * Math.PI;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + Math.cos(a) * R * 0.9, y + Math.sin(a) * R * 0.9);
    ctx.stroke();
    ctx.lineCap = 'butt';
    D.text(ctx, 'UP', cx, y - R * 0.25, { size: size * 0.16, weight: 800, color: ACCENT, align: 'center' });
  }

  PF.PU = { rate, units, tempFor, status, isIdeal, LIMITS, SEC_PER_MIN, T_BASE };
  PF.Games = PF.Games || [];
  PF.Games.push({
    id: 'pu',
    order: 5,
    title: 'Control de UP',
    subtitle: 'Unidades de Pasteurización',
    tagline: 'Panel de control: temperatura y llave de paso. Cada lote entre 24 y 30 UP.',
    accent: ACCENT,
    padRaw: true,
    durations: [40, 45, 50, 55, 60],
    icon,
    howTo: [
      'UP = t × 1,393^(T − 60): minutos dentro del túnel por un factor que crece con la temperatura.',
      'Ajusta la temperatura para que cada lote salga entre 24 y 30 UP (ideal 26).',
      'Menos de 24: subpasteurizada, turbia con bolitas verde pálido. Más de 30: quemada.',
      'Con la llave de paso decides si cada lote va a la LLENADORA o al DESCARTE.',
    ],
    // Táctil: arrastrar a la izquierda sube o baja la temperatura; la llave también se toca en su panel.
    touch: { stick: true, stickHint: false, main: [{ pad: 'a', label: 'Llenadora' }, { pad: 'b', label: 'Descarte' }, { pad: 'y', label: 'Ayuda' }] },
    controls: [
      ['W / S', 'temperatura', ['dpadUD', 'lstickV']],
      ['1', 'llave → llenadora', 'a'],
      ['2', 'llave → descarte', 'b'],
      ['H', 'ayuda: fórmula y aspectos', 'y'],
    ],
    difficulties: {
      facil: ['La temperatura responde rápido y hay pocas perturbaciones', 'Te sugiere hacia dónde poner la llave', 'Marca la ventana de temperatura buena'],
      normal: ['Perturbaciones y cambios de velocidad de la línea', 'Muestra las UP estimadas de cada lote', 'Sin sugerencias para la llave'],
      dificil: ['La temperatura tarda en responder', 'Perturbaciones fuertes y frecuentes', 'Solo ves las UP acumuladas, sin estimación'],
    },
    create,
  });
})();
