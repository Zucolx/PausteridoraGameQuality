// Guía Rápida de Reacción: une los puntos en el orden correcto para armar la ruta
// de reacción de cada situación (derrame, contacto con sustancia química, conato de
// incendio y emergencia). Cada punto lleva el texto completo de la guía.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const B = PF.Bubble;
  const R = PF.Reaction;
  const T = D.T;
  const ACCENT = '#f2c14e';

  const DIFF = {
    facil: { time: 300, all: false, decoys: 3, pictos: true, steps: true, reveal: 1, guideCost: 0 },
    normal: { time: 240, all: true, decoys: 0, pictos: true, steps: true, reveal: 2, guideCost: 5 },
    dificil: { time: 180, all: true, decoys: 0, pictos: false, steps: false, reveal: 3, guideCost: 10 },
  };
  const POINTS = 10;
  const ERROR_COST = 3;

  const LEFT = { x: 16, y: 76, w: 304, h: 562 };
  const BOARD = { x: 332, y: 76, w: 932, h: 562 };
  const MSG = { x: 8, y: 646, w: 1264, h: 66 };
  const COLS = 5;
  const ROWS = 4;
  const START = { x: 168, y: 176 };
  const CTRL = {
    move: { key: '↑ ↓ ← →', pad: 'dpad' },
    link: { key: 'ENTER', pad: 'a' },
    guide: { key: 'H', pad: 'select' },
  };
  const TOTAL_STEPS = Object.values(R.ROUTES).reduce((a, r) => a + r.length, 0);

  // ------------------------------------------------------------- Estado

  function create(diffId = 'normal', opts = {}) {
    const cfg = DIFF[diffId] || DIFF.normal;
    const rng = D.makeRng(opts.seed);
    const s = {
      id: 'reaction',
      diff: diffId,
      cfg,
      rng,
      order: D.shuffle(rng, Object.keys(R.SITUATIONS)),
      round: -1,
      sit: null,
      step: 0,
      path: [],
      dots: [],
      cursor: 0,
      stepErrors: 0,
      phase: 'play',
      help: false,
      duration: cfg.time,
      timeLeft: cfg.time,
      over: false,
      bubble: B.create(),
      floats: [],
      banner: null,
      stats: {
        points: 0,
        correct: 0,
        errors: 0,
        guide: 0,
        perSit: Object.fromEntries(Object.keys(R.SITUATIONS).map((k) => [k, { errors: 0, done: false }])),
        confusions: {},
      },
    };
    nextRound(s);
    s.update = (dt, input) => update(s, dt, input);
    s.draw = (r) => draw(s, r);
    s.report = () => report(s);
    return s;
  }

  function nextRound(s) {
    s.round++;
    if (s.round >= s.order.length) {
      s.over = true;
      return;
    }
    s.sit = s.order[s.round];
    s.step = 0;
    s.path = [];
    s.stepErrors = 0;
    s.phase = 'play';
    s.dots = layout(s);
    // El cursor empieza en el punto más cercano al inicio de la ruta.
    s.cursor = nearest(s.dots, START);
    B.clear(s.bubble);
    const sit = R.SITUATIONS[s.sit];
    s.banner = D.makeBanner(`SITUACIÓN ${s.round + 1} DE ${s.order.length}`, sit.color, sit.name, 1.6);
  }

  // Puntos del tablero: en Fácil, la ruta y unos señuelos; en Normal y Difícil, todos.
  function layout(s) {
    const route = R.ROUTES[s.sit];
    let ids;
    if (s.cfg.all) ids = Object.keys(R.ITEMS);
    else {
      const extras = R.EXTRAS[s.sit] || [];
      const others = D.shuffle(
        s.rng,
        Object.keys(R.ITEMS).filter((id) => !route.includes(id) && !extras.includes(id))
      );
      ids = [...route, ...extras, ...others.slice(0, s.cfg.decoys)];
    }
    const cells = D.shuffle(
      s.rng,
      Array.from({ length: COLS * ROWS }, (_, i) => i)
    );
    const cw = BOARD.w / COLS;
    const ch = (BOARD.h - 44) / ROWS;
    return D.shuffle(s.rng, ids).map((id, i) => {
      const c = cells[i];
      const col = c % COLS;
      const row = Math.floor(c / COLS);
      return {
        id,
        x: BOARD.x + cw * (col + 0.5) + (s.rng() - 0.5) * 26,
        y: BOARD.y + 82 + ch * row + (s.rng() - 0.5) * 10,
      };
    });
  }

  function nearest(dots, p) {
    let best = 0;
    let bd = Infinity;
    dots.forEach((d, i) => {
      const dd = Math.hypot(d.x - p.x, d.y - p.y);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  }

  // Siguiente punto en una dirección (el más cercano dentro de un cono).
  function moveCursor(s, dx, dy) {
    const from = s.dots[s.cursor];
    let best = -1;
    let bs = Infinity;
    s.dots.forEach((d, i) => {
      if (i === s.cursor) return;
      const vx = d.x - from.x;
      const vy = d.y - from.y;
      const along = vx * dx + vy * dy;
      if (along < 20) return;
      const across = Math.abs(vx * dy - vy * dx);
      const score = along + across * 2.2;
      if (score < bs) {
        bs = score;
        best = i;
      }
    });
    if (best >= 0) {
      s.cursor = best;
      D.sfx('blip');
    }
  }

  // ------------------------------------------------------------- Actualización

  function update(s, dt, input) {
    if (s.over) return;
    const P = input.pressed || [];
    const pp = (input.pad && input.pad.pressed) || [];
    const hit = (keys, btns) => keys.some((k) => P.includes(k)) || btns.some((b) => pp.includes(b));

    if (hit(['help'], ['select'])) toggleGuide(s);
    else if (s.help && hit(['cancel'], ['b'])) s.help = false;
    if (s.help) return; // la guía congela el tiempo

    B.update(s.bubble, dt);
    s.floats = D.floatsUpdate(s.floats, dt);
    D.tickBanner(s, dt);

    if (s.phase === 'summary') {
      // La ruta completa queda a la vista hasta pulsar Continuar.
      const click = (input.clicks || []).some((c) => inside(c, continueRect()));
      if (hit(['confirm', 'space', 'interact'], ['a']) || click) {
        nextRound(s);
        D.sfx('enter');
      }
      return;
    }

    s.timeLeft = Math.max(0, s.timeLeft - dt);
    if (s.timeLeft <= 0) {
      s.over = true;
      return;
    }

    if (hit(['up'], ['up', 'lsUp'])) moveCursor(s, 0, -1);
    else if (hit(['down'], ['down', 'lsDown'])) moveCursor(s, 0, 1);
    else if (hit(['left'], ['left', 'lsLeft'])) moveCursor(s, -1, 0);
    else if (hit(['right'], ['right', 'lsRight'])) moveCursor(s, 1, 0);

    const m = input.mouse;
    if (m && m.moved) {
      const i = dotAt(s, m);
      if (i >= 0) s.cursor = i;
    }
    for (const c of input.clicks || []) {
      const i = dotAt(s, c);
      if (i >= 0) {
        s.cursor = i;
        link(s, i);
        return;
      }
    }
    if (hit(['confirm', 'space', 'interact'], ['a'])) link(s, s.cursor);
  }

  function toggleGuide(s) {
    s.help = !s.help;
    if (s.help && !s.over) {
      s.stats.guide++;
      s.stats.points -= s.cfg.guideCost;
    }
  }

  function inside(p, rc) {
    return p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h;
  }

  // Punto bajo el ratón (incluye su rótulo).
  function dotAt(s, p) {
    return s.dots.findIndex((d) => p.x >= d.x - 76 && p.x <= d.x + 76 && p.y >= d.y - 32 && p.y <= d.y + 82);
  }

  function link(s, i) {
    if (s.phase !== 'play') return;
    const dot = s.dots[i];
    const route = R.ROUTES[s.sit];
    const item = R.ITEMS[dot.id];
    if (s.path.includes(dot.id)) {
      B.say(s.bubble, `«${item.text}» ya está conectado en esta ruta.`, { kind: 'tip', life: 2.5 });
      return;
    }
    if (route[s.step] === dot.id) {
      s.path.push(dot.id);
      s.step++;
      s.stepErrors = 0;
      s.stats.correct++;
      s.stats.points += POINTS;
      D.floatAdd(s.floats, dot.x, dot.y - 40, `+${POINTS}`, T.ok, 20);
      D.sfx('resolved');
      if (s.step >= route.length) {
        s.stats.perSit[s.sit].done = true;
        s.phase = 'summary';
        B.say(s.bubble, `Ruta completa: ${R.SITUATIONS[s.sit].name}. ${item.info}`, { kind: 'ok', title: '¡Ruta completa!', life: 1e6 });
      } else B.say(s.bubble, `${s.step}. ${item.text}: ${item.info}`, { kind: 'ok', title: 'Correcto', life: 7 });
      return;
    }
    s.stepErrors++;
    s.stats.errors++;
    s.stats.perSit[s.sit].errors++;
    s.stats.points -= ERROR_COST;
    const expected = R.ITEMS[route[s.step]].text;
    const key = `«${item.text}» en vez de «${expected}»`;
    s.stats.confusions[key] = (s.stats.confusions[key] || 0) + 1;
    B.say(s.bubble, R.whyWrong(s.sit, s.step, dot.id, s.stepErrors >= s.cfg.reveal), { life: 9 });
  }

  // Tras varios errores en el mismo paso, el punto correcto parpadea.
  function hinted(s) {
    return s.phase === 'play' && s.stepErrors >= s.cfg.reveal;
  }

  // ------------------------------------------------------------- Dibujo

  function draw(s, r) {
    const ctx = r.ctx;
    const t = r.t;
    D.begin(r);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, D.VIEW.width, D.VIEW.height);
    if (s.sit) {
      drawLeft(s, ctx);
      drawBoard(s, ctx, t);
      if (s.phase === 'summary') drawSummary(s, ctx, t);
    }
    D.floatsDraw(ctx, s.floats);
    B.bar(ctx, MSG, { bubble: s.bubble, notices: s.bubble.cur ? [] : [s.banner], t, split: 0.7 });
    D.hud(ctx, t, {
      title: 'GUÍA RÁPIDA DE REACCIÓN',
      diff: s.diff,
      timeLeft: s.timeLeft,
      duration: s.duration,
      accent: ACCENT,
      stats: [
        { label: 'Situación', value: `${Math.min(s.order.length, s.round + 1)}/${s.order.length}`, width: 120 },
        { label: 'Puntos', value: Math.max(0, s.stats.points), color: T.ok, width: 110 },
        { label: 'Errores', value: s.stats.errors, color: s.stats.errors ? T.red : T.ink, width: 100 },
      ],
    });
    D.hints(ctx, [[CTRL.guide, 'guía']], 1266, 50, { size: 11, align: 'right', ink: T.dim, color: '#6e5a48' });
    if (s.help) drawGuide(s, ctx);
  }

  function panelTitle(ctx, rc, title, sub, color = ACCENT) {
    D.panel(ctx, rc.x, rc.y, rc.w, rc.h, { fill: '#100c0a', edge: '#2e2420', radius: 12 });
    ctx.fillStyle = color;
    D.roundRect(ctx, rc.x, rc.y, rc.w, 34, 12);
    ctx.fill();
    ctx.fillRect(rc.x, rc.y + 20, rc.w, 14);
    D.text(ctx, title, rc.x + 14, rc.y + 23, { size: 16, weight: 800, color: '#15100a' });
    if (sub) D.text(ctx, sub, rc.x + rc.w - 14, rc.y + 23, { size: 13, weight: 700, color: '#15100a', align: 'right' });
  }

  function drawLeft(s, ctx) {
    const rc = LEFT;
    const sit = R.SITUATIONS[s.sit];
    const route = R.ROUTES[s.sit];
    panelTitle(ctx, rc, 'SITUACIÓN', `${s.round + 1} de ${s.order.length}`, sit.color);
    // Punto de inicio de la ruta.
    ctx.save();
    ctx.shadowColor = sit.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#f4efe6';
    ctx.beginPath();
    ctx.arc(START.x, START.y, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = sit.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(START.x, START.y, 52, 0, Math.PI * 2);
    ctx.stroke();
    picto(ctx, sit.icon, START.x, START.y, 40);
    ctx.font = D.font(22, 800);
    const nl = D.wrap(ctx, sit.name.toUpperCase(), rc.w - 30);
    nl.forEach((l, i) => D.text(ctx, l, START.x, 258 + i * 26, { size: 22, weight: 800, color: sit.color, align: 'center' }));

    let y = 258 + nl.length * 26 + 18;
    D.text(ctx, 'RUTA DE REACCIÓN', rc.x + 16, y, { size: 13, weight: 800, color: T.dim });
    if (s.cfg.steps) D.text(ctx, `paso ${Math.min(s.step + 1, route.length)} de ${route.length}`, rc.x + rc.w - 16, y, { size: 13, weight: 700, color: T.dim, align: 'right' });
    y += 14;
    const shown = s.cfg.steps ? route.length : Math.min(route.length, s.path.length + 1);
    for (let i = 0; i < shown; i++) {
      const done = i < s.path.length;
      const cur = i === s.path.length && s.phase === 'play';
      const rowH = 50;
      D.panel(ctx, rc.x + 10, y, rc.w - 20, rowH - 6, { fill: done ? '#14200f' : cur ? '#231a10' : '#17110d', edge: done ? sit.color : cur ? ACCENT : '#2e2420', radius: 8 });
      ctx.fillStyle = done ? sit.color : cur ? ACCENT : '#3a2e26';
      ctx.beginPath();
      ctx.arc(rc.x + 32, y + (rowH - 6) / 2, 12, 0, Math.PI * 2);
      ctx.fill();
      D.text(ctx, String(i + 1), rc.x + 32, y + (rowH - 6) / 2 + 5, { size: 13, weight: 800, color: '#15100a', align: 'center' });
      if (done) D.paragraph(ctx, R.ITEMS[s.path[i]].text, rc.x + 52, y + 18, rc.w - 72, { size: 13, weight: 700, color: T.ink, lineHeight: 15, maxLines: 2 });
      else D.text(ctx, cur ? '¿Qué sigue?' : '?', rc.x + 52, y + 27, { size: 14, weight: 700, color: cur ? ACCENT : T.faint });
      y += rowH;
    }
    if (!s.cfg.steps && s.phase === 'play') D.text(ctx, 'En Difícil no sabes cuántos pasos quedan.', rc.x + 16, y + 14, { size: 12, color: T.faint });
  }

  function drawBoard(s, ctx, t) {
    const sit = R.SITUATIONS[s.sit];
    panelTitle(ctx, BOARD, 'UNE LOS PUNTOS EN ORDEN', 'de la situación al procedimiento');
    // Líneas de la ruta (estilo "une los puntos").
    const pts = [START, ...s.path.map((id) => s.dots.find((d) => d.id === id))];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = sit.color;
    ctx.lineWidth = 6;
    ctx.shadowColor = sit.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
    // Línea elástica hasta el punto seleccionado.
    if (s.phase === 'play') {
      const last = pts[pts.length - 1];
      const cur = s.dots[s.cursor];
      ctx.save();
      ctx.strokeStyle = 'rgba(242,193,78,0.7)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(cur.x, cur.y);
      ctx.stroke();
      ctx.restore();
    }
    const expected = R.ROUTES[s.sit][s.step];
    s.dots.forEach((d, i) => {
      const order = s.path.indexOf(d.id);
      drawDot(s, ctx, d, {
        selected: i === s.cursor && s.phase === 'play',
        order,
        color: sit.color,
        hint: hinted(s) && d.id === expected,
        t,
      });
    });
  }

  function drawDot(s, ctx, d, { selected, order, color, hint, t }) {
    const item = R.ITEMS[d.id];
    const done = order >= 0;
    const r = s.cfg.pictos ? 30 : 14;
    if (hint) {
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 8);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    if (selected) {
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 22;
    }
    ctx.fillStyle = s.cfg.pictos ? '#f4efe6' : done ? color : '#2a211c';
    ctx.beginPath();
    ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = selected ? ACCENT : done ? color : '#5a4a40';
    ctx.lineWidth = selected ? 5 : 3;
    ctx.beginPath();
    ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (s.cfg.pictos) picto(ctx, item.icon, d.x, d.y, r * 0.78);
    if (done) {
      // Número del paso, como en los dibujos de "une los puntos".
      const bx = d.x + r * 0.78;
      const by = d.y - r * 0.78;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx, by, 11, 0, Math.PI * 2);
      ctx.fill();
      D.text(ctx, String(order + 1), bx, by + 5, { size: 13, weight: 800, color: '#15100a', align: 'center' });
    }
    ctx.font = D.font(13, 700);
    const lines = D.wrap(ctx, item.text, 168).slice(0, 3);
    const ly = d.y + r + 16;
    if (selected) {
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
      D.panel(ctx, d.x - w / 2, ly - 13, w, lines.length * 15 + 8, { fill: '#2a1f12', edge: ACCENT, radius: 6 });
    }
    lines.forEach((l, j) => D.text(ctx, l, d.x, ly + j * 15, { size: 13, weight: 700, color: selected ? '#fff3d6' : done ? color : T.ink, align: 'center' }));
  }

  function continueRect() {
    return { x: BOARD.x + BOARD.w / 2 - 170, y: BOARD.y + BOARD.h - 62, w: 340, h: 46 };
  }

  // Ruta completa, como una fila de la guía: situación → pasos, con lo que se hace en cada uno.
  function drawSummary(s, ctx, t) {
    const sit = R.SITUATIONS[s.sit];
    const route = R.ROUTES[s.sit];
    const rc = BOARD;
    ctx.fillStyle = 'rgba(8,5,4,0.88)';
    ctx.fillRect(rc.x, rc.y + 34, rc.w, rc.h - 34);
    D.text(ctx, `RUTA DE REACCIÓN · ${sit.name.toUpperCase()}`, rc.x + rc.w / 2, rc.y + 70, { size: 20, weight: 800, color: sit.color, align: 'center' });
    const n = route.length;
    const cw = 160;
    const gap = 22;
    const x0 = rc.x + (rc.w - (n * cw + (n - 1) * gap)) / 2;
    route.forEach((id, i) => {
      const item = R.ITEMS[id];
      const x = x0 + i * (cw + gap);
      const y = rc.y + 90;
      D.panel(ctx, x, y, cw, 150, { fill: '#f4efe6', edge: sit.color, radius: 10 });
      picto(ctx, item.icon, x + cw / 2, y + 44, 30);
      D.paragraph(ctx, item.text, x + cw / 2, y + 96, cw - 14, { size: 13, weight: 800, color: '#2a170d', align: 'center', lineHeight: 15, maxLines: 3 });
      if (i < n - 1) D.text(ctx, '➜', x + cw + gap / 2, y + 80, { size: 20, weight: 800, color: ACCENT, align: 'center' });
    });
    let y = rc.y + 270;
    route.forEach((id, i) => {
      const item = R.ITEMS[id];
      D.text(ctx, `${i + 1}.`, rc.x + 40, y, { size: 14, weight: 800, color: sit.color });
      y += D.paragraph(ctx, item.info, rc.x + 64, y, rc.w - 104, { size: 14, color: T.ink, maxLines: 2 }) + 6;
    });
    const errs = s.stats.perSit[s.sit].errors;
    D.text(ctx, errs ? `Errores en esta ruta: ${errs}` : 'Ruta sin errores', rc.x + rc.w / 2, rc.y + rc.h - 76, { size: 14, weight: 800, color: errs ? T.warn : T.ok, align: 'center' });
    const b = continueRect();
    const pulse = 0.75 + 0.25 * Math.sin(t * 5);
    D.panel(ctx, b.x, b.y, b.w, b.h, { fill: ACCENT, edge: ACCENT, radius: 10, glow: pulse > 0.85 ? ACCENT : null });
    const last = s.round + 1 >= s.order.length;
    const w = D.control(ctx, CTRL.link, b.x + 14, b.y + b.h / 2, { size: 13, color: '#15100a', keyInk: ACCENT });
    D.text(ctx, last ? 'VER REPORTE FINAL' : 'SIGUIENTE SITUACIÓN', b.x + w + 26, b.y + 30, { size: 18, weight: 800, color: '#15100a' });
  }

  // Guía completa (como el afiche). Consultarla congela el tiempo; en Normal y Difícil resta puntos.
  function drawGuide(s, ctx) {
    ctx.fillStyle = 'rgba(8,4,3,0.92)';
    ctx.fillRect(0, 0, D.VIEW.width, D.VIEW.height);
    D.panel(ctx, 24, 20, 1232, 680, { fill: '#1c2030', edge: ACCENT, radius: 12 });
    D.text(ctx, 'GUÍA RÁPIDA DE REACCIÓN', 640, 64, { size: 34, weight: 800, color: '#f4efe6', align: 'center' });
    const keys = Object.keys(R.SITUATIONS);
    keys.forEach((k, i) => {
      const sit = R.SITUATIONS[k];
      const route = R.ROUTES[k];
      const y = 92 + i * 142;
      ctx.fillStyle = '#f4efe6';
      ctx.beginPath();
      ctx.arc(80, y + 56, 34, 0, Math.PI * 2);
      ctx.fill();
      picto(ctx, sit.icon, 80, y + 56, 26);
      D.paragraph(ctx, sit.name.toUpperCase(), 124, y + 44, 150, { size: 15, weight: 800, color: sit.color, lineHeight: 17, maxLines: 3 });
      route.forEach((id, j) => {
        const item = R.ITEMS[id];
        const x = 290 + j * 190;
        D.panel(ctx, x, y + 4, 166, 124, { fill: '#f4efe6', edge: sit.color, radius: 8 });
        picto(ctx, item.icon, x + 83, y + 40, 26);
        D.paragraph(ctx, item.text, x + 83, y + 86, 156, { size: 12, weight: 800, color: '#2a170d', align: 'center', lineHeight: 14, maxLines: 3 });
        if (j < route.length - 1) D.text(ctx, '➜', x + 178, y + 70, { size: 16, weight: 800, color: ACCENT, align: 'center' });
      });
    });
    const cost = s.cfg.guideCost ? `Cada consulta resta ${s.cfg.guideCost} puntos · ` : '';
    D.hints(ctx, [[CTRL.guide, `${cost}volver al juego (el tiempo está en pausa)`]], 640, 680, { size: 14, align: 'center', ink: '#f4efe6', color: ACCENT });
  }

  // ------------------------------------------------------------- Pictogramas

  function poly(ctx, pts, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }

  function circle(ctx, x, y, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function rect(ctx, x, y, w, h, fill, r = 0) {
    ctx.fillStyle = fill;
    if (r) {
      D.roundRect(ctx, x, y, w, h, r);
      ctx.fill();
    } else ctx.fillRect(x, y, w, h);
  }

  // Dibuja el pictograma `kind` centrado en (x, y); s ≈ radio.
  function picto(ctx, kind, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 30, s / 30);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    switch (kind) {
      case 'megaphone':
        poly(ctx, [[-14, -6], [12, -20], [12, 20], [-14, 6]], '#e0245e');
        rect(ctx, -22, -7, 9, 14, '#8a1538', 2);
        rect(ctx, -14, 6, 6, 12, '#555', 2);
        ctx.strokeStyle = '#f2b705';
        ctx.lineWidth = 3;
        for (const a of [-0.5, 0, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(17 + Math.cos(a) * 2, Math.sin(a) * 14);
          ctx.lineTo(17 + Math.cos(a) * 10, Math.sin(a) * 24);
          ctx.stroke();
        }
        break;
      case 'cone':
        poly(ctx, [[-4, -24], [4, -24], [14, 18], [-14, 18]], '#ff5a1f');
        poly(ctx, [[-7, -8], [7, -8], [9, 0], [-9, 0]], '#fff');
        rect(ctx, -20, 17, 40, 6, '#333', 2);
        break;
      case 'suit':
        // Traje, guantes y máscara.
        circle(ctx, 0, -18, 8, '#c9d6e3');
        rect(ctx, -7, -19, 14, 7, '#2d3748', 3);
        rect(ctx, -11, -10, 22, 22, '#c9d6e3', 4);
        rect(ctx, -20, -9, 8, 18, '#c9d6e3', 3);
        rect(ctx, 12, -9, 8, 18, '#c9d6e3', 3);
        rect(ctx, -10, 11, 8, 15, '#c9d6e3', 2);
        rect(ctx, 2, 11, 8, 15, '#c9d6e3', 2);
        rect(ctx, -20, 6, 8, 7, '#2b6cb0', 2);
        rect(ctx, 12, 6, 8, 7, '#2b6cb0', 2);
        rect(ctx, -1, -10, 2, 22, '#8aa0b6');
        break;
      case 'kit':
        rect(ctx, -20, -22, 40, 44, '#1f5f3a', 3);
        rect(ctx, -15, -17, 30, 34, '#e9f2ec', 2);
        rect(ctx, -11, -12, 12, 12, '#1f8a4c', 2);
        rect(ctx, 4, -12, 8, 3, '#555');
        rect(ctx, 4, -6, 8, 3, '#555');
        rect(ctx, -11, 5, 22, 3, '#555');
        rect(ctx, -11, 10, 22, 3, '#555');
        break;
      case 'eyewash':
        rect(ctx, -18, 8, 36, 8, '#2f9e5a', 3);
        rect(ctx, -3, 16, 6, 10, '#777');
        ctx.strokeStyle = '#4fb8ff';
        ctx.lineWidth = 4;
        for (const sx of [-8, 8]) {
          ctx.beginPath();
          ctx.moveTo(sx, 8);
          ctx.quadraticCurveTo(sx * 1.2, -14, sx * 0.4, -20);
          ctx.stroke();
        }
        circle(ctx, -3, -22, 2.5, '#4fb8ff');
        circle(ctx, 4, -24, 2.5, '#4fb8ff');
        break;
      case 'shower':
        rect(ctx, -22, -24, 4, 48, '#777');
        rect(ctx, -22, -24, 26, 4, '#777');
        poly(ctx, [[-4, -20], [12, -20], [16, -12], [-8, -12]], '#2f9e5a');
        ctx.fillStyle = '#4fb8ff';
        for (let i = 0; i < 9; i++) circle(ctx, -6 + (i % 3) * 8 + (i > 5 ? 2 : 0), -4 + Math.floor(i / 3) * 9, 2.2, '#4fb8ff');
        break;
      case 'msds':
        rect(ctx, -18, -22, 34, 44, '#f2d64b', 3);
        rect(ctx, -18, -22, 5, 44, '#b89a1f');
        ctx.save();
        ctx.translate(2, 6);
        ctx.rotate(Math.PI / 4);
        rect(ctx, -11, -11, 11, 11, '#d62828');
        rect(ctx, 0, -11, 11, 11, '#f2d64b');
        rect(ctx, -11, 0, 11, 11, '#1d4ed8');
        rect(ctx, 0, 0, 11, 11, '#fff');
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-11, -11, 22, 22);
        ctx.restore();
        D.text(ctx, 'MSDS', 2, -11, { size: 8, weight: 800, color: '#222', align: 'center' });
        break;
      case 'pull':
        rect(ctx, -18, -22, 36, 44, '#d62828', 4);
        D.text(ctx, 'FIRE', 0, -8, { size: 11, weight: 800, color: '#fff', align: 'center' });
        rect(ctx, -9, 0, 18, 14, '#fff', 2);
        rect(ctx, -5, 4, 10, 6, '#d62828', 1);
        break;
      case 'extinguisher':
        rect(ctx, -9, -14, 18, 38, '#d62828', 7);
        rect(ctx, -4, -22, 8, 9, '#333', 2);
        rect(ctx, -12, -24, 18, 4, '#333', 2);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(4, -20);
        ctx.quadraticCurveTo(18, -16, 16, 10);
        ctx.stroke();
        rect(ctx, -7, -2, 14, 8, '#fff', 1);
        break;
      case 'hose':
        rect(ctx, -22, -22, 44, 44, '#c62828', 3);
        rect(ctx, -18, -18, 36, 36, '#f4efe6', 2);
        ctx.strokeStyle = '#c62828';
        ctx.lineWidth = 3;
        for (const rr of [5, 9, 13]) {
          ctx.beginPath();
          ctx.arc(0, 0, rr, 0, Math.PI * 2);
          ctx.stroke();
        }
        rect(ctx, 10, -3, 10, 6, '#888', 1);
        break;
      case 'detector':
        ctx.fillStyle = '#e6e6e6';
        ctx.beginPath();
        ctx.ellipse(0, 0, 24, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, -2, 10, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        for (const sx of [-14, -6, 2, 10]) rect(ctx, sx, 5, 4, 2, '#777');
        break;
      case 'siren':
        rect(ctx, -18, -2, 36, 20, '#9aa0a6', 4);
        circle(ctx, -10, -8, 9, '#d9d9d9');
        circle(ctx, 10, -8, 9, '#d9d9d9');
        circle(ctx, -10, -8, 5, '#ffd23f');
        circle(ctx, 10, -8, 5, '#ffd23f');
        rect(ctx, -10, 6, 20, 6, '#555', 2);
        break;
      case 'exit':
        rect(ctx, -24, -16, 48, 32, '#178a3c', 3);
        poly(ctx, [[-20, 0], [-10, -8], [-10, -3], [-2, -3], [-2, 3], [-10, 3], [-10, 8]], '#fff');
        circle(ctx, 10, -9, 3, '#fff');
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(9, -5);
        ctx.lineTo(7, 4);
        ctx.lineTo(2, 11);
        ctx.moveTo(7, 4);
        ctx.lineTo(13, 11);
        ctx.moveTo(3, -2);
        ctx.lineTo(9, -4);
        ctx.lineTo(16, 0);
        ctx.stroke();
        break;
      case 'meeting':
        rect(ctx, -22, -22, 44, 44, '#178a7a', 3);
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(sx * 18, sy * 18);
          ctx.lineTo(sx * 10, sy * 10);
          ctx.stroke();
          poly(ctx, [[sx * 8, sy * 8], [sx * 14, sy * 9], [sx * 9, sy * 14]], '#fff');
        }
        circle(ctx, -4, -2, 3, '#fff');
        circle(ctx, 4, -2, 3, '#fff');
        rect(ctx, -7, 2, 6, 7, '#fff', 2);
        rect(ctx, 1, 2, 6, 7, '#fff', 2);
        break;
      case 'sop':
        rect(ctx, -22, -18, 44, 36, '#15100c', 4);
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          const px = -8 + Math.cos(a) * 9;
          const py = Math.sin(a) * 9;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        D.text(ctx, 'SOP', 10, 4, { size: 10, weight: 800, color: ACCENT, align: 'center' });
        break;
      case 'spill':
        ctx.fillStyle = '#4caf50';
        ctx.beginPath();
        ctx.ellipse(4, 12, 22, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        circle(ctx, -14, 16, 5, '#4caf50');
        circle(ctx, 20, 6, 4, '#4caf50');
        ctx.save();
        ctx.rotate(-0.5);
        rect(ctx, -18, -24, 18, 26, '#2e7d32', 3);
        rect(ctx, -18, -18, 18, 3, '#1b5e20');
        ctx.restore();
        break;
      case 'contact':
        circle(ctx, -2, -4, 16, '#f1c7a5');
        rect(ctx, -12, -24, 22, 9, '#6b4423', 4);
        circle(ctx, 4, -6, 2, '#333');
        ctx.strokeStyle = '#a0522d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(2, 4, 5, 0.2, Math.PI - 0.2);
        ctx.stroke();
        circle(ctx, 18, -10, 4, '#4caf50');
        circle(ctx, 20, 2, 3, '#4caf50');
        circle(ctx, 14, 12, 3.5, '#4caf50');
        break;
      case 'fire':
        ctx.fillStyle = '#ff6a3d';
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.bezierCurveTo(18, -8, 22, 6, 14, 18);
        ctx.quadraticCurveTo(0, 28, -14, 18);
        ctx.bezierCurveTo(-22, 6, -12, -4, -6, -10);
        ctx.quadraticCurveTo(-4, -2, 0, -2);
        ctx.quadraticCurveTo(4, -14, 0, -26);
        ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.bezierCurveTo(10, 4, 10, 14, 4, 20);
        ctx.quadraticCurveTo(-2, 24, -8, 18);
        ctx.bezierCurveTo(-12, 10, -4, 6, 0, -4);
        ctx.fill();
        break;
      case 'quake':
        rect(ctx, -14, -22, 26, 40, '#8d99ae', 2);
        for (let i = 0; i < 4; i++) {
          rect(ctx, -10, -18 + i * 9, 6, 5, '#edf2f4');
          rect(ctx, 2, -18 + i * 9, 6, 5, '#edf2f4');
        }
        ctx.strokeStyle = '#2b2d42';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-1, -22);
        ctx.lineTo(3, -12);
        ctx.lineTo(-3, -4);
        ctx.lineTo(2, 6);
        ctx.lineTo(-2, 18);
        ctx.stroke();
        ctx.strokeStyle = '#a0522d';
        ctx.beginPath();
        ctx.moveTo(-26, 22);
        ctx.lineTo(-18, 18);
        ctx.lineTo(-10, 24);
        ctx.lineTo(0, 19);
        ctx.lineTo(10, 25);
        ctx.lineTo(20, 19);
        ctx.lineTo(26, 23);
        ctx.stroke();
        break;
      default:
        circle(ctx, 0, 0, 10, '#999');
    }
    ctx.restore();
  }

  // ------------------------------------------------------------- Reporte

  function report(s) {
    const st = s.stats;
    const max = POINTS * TOTAL_STEPS;
    const score = Math.max(0, Math.min(100, Math.round((100 * st.points) / max)));
    const rank = D.rankFor(score);
    const rows = Object.keys(R.SITUATIONS).map((k) => {
      const p = st.perSit[k];
      const value = p.done ? (p.errors ? `${p.errors} ${p.errors === 1 ? 'error' : 'errores'}` : 'sin errores') : 'sin terminar';
      return [R.SITUATIONS[k].name, value, !p.done ? T.red : p.errors ? T.warn : T.ok];
    });
    const done = Object.values(st.perSit).filter((p) => p.done).length;
    const used = s.duration - s.timeLeft;
    rows.push(['Consultas a la guía', String(st.guide), st.guide ? T.warn : T.ok]);
    rows.push(['Tiempo usado', `${Math.floor(used / 60)}:${String(Math.round(used % 60)).padStart(2, '0')}`, T.ink]);
    rows.push(['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)]);
    return {
      score,
      rank,
      headline: `Completaste ${done} de ${s.order.length} rutas de reacción con ${st.errors} ${st.errors === 1 ? 'error' : 'errores'}`,
      rows,
      mistakes: s.bubble.log.slice(),
    };
  }

  // ------------------------------------------------------------- Menú

  function icon(ctx, cx, cy, size, t) {
    // Cuatro puntos unidos por una línea, con el aviso al inicio.
    const pts = [
      [-0.4, 0.26],
      [-0.13, -0.22],
      [0.14, 0.16],
      [0.4, -0.26],
    ].map(([x, y]) => [cx + x * size, cy + y * size]);
    const k = Math.min(3, Math.floor((t * 1.2) % 5));
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = size * 0.04;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= k; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();
    const kinds = ['megaphone', 'cone', 'extinguisher', 'exit'];
    pts.forEach(([x, y], i) => {
      circle(ctx, x, y, size * 0.17, '#f4efe6');
      picto(ctx, kinds[i], x, y, size * 0.13);
    });
  }

  PF.ReactionGame = { DIFF, POINTS, ERROR_COST, TOTAL_STEPS, CTRL };
  PF.Games = PF.Games || [];
  PF.Games.push({
    id: 'reaction',
    order: 7,
    title: 'Guía Rápida de Reacción',
    subtitle: 'Une los puntos',
    tagline: 'Arma la ruta de reacción de cada emergencia, paso a paso.',
    accent: ACCENT,
    padRaw: true,
    icon,
    howTo: [
      'Cuatro situaciones: derrame de sustancia química, contacto con sustancia química, conato de incendio y emergencia (sismo / incidente mayor).',
      'Une los puntos en orden, desde la situación hasta el procedimiento: siempre se empieza por la comunicación.',
      'Si eliges un paso que no va, te explicamos por qué. Al completar cada ruta la ves entera, con lo que se hace en cada paso.',
      'La guía completa está a mano: consultarla pausa el tiempo, pero en Normal y Difícil resta puntos.',
    ],
    controls: [
      ['↑ ↓ ← →', 'elegir punto', 'dpad'],
      ['ENTER', 'conectar (o clic)', 'a'],
      ['H', 'ver la guía completa', 'select'],
    ],
    difficulties: {
      facil: ['Solo los pasos de la ruta y 3 señuelos', 'Te dice el paso correcto al primer error', '5 min · guía sin costo'],
      normal: ['Los 17 puntos en el tablero', 'Pista tras 2 errores en el mismo paso', '4 min · guía resta 5 puntos'],
      dificil: ['Solo texto, sin dibujos ni número de pasos', 'Pista tras 3 errores en el mismo paso', '3 min · guía resta 10 puntos'],
    },
    create,
  });
})();
