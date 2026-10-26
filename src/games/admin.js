// Supervisor de Turno: administración del turno de envasado con GLY, LEF y OSE.
// 6 turnos de 20 s (máx. 2 min). Dos modos:
//  · Diagnóstico de turno: lee el tablero y decide qué tipo de problema hubo
//    (planificación, externo, interno o excelente) y con quién atacarlo.
//  · ¿Qué KPI cae?: en el reporte de fin de turno, clasifica cada pérdida por el
//    primer KPI que la ve (GLY, LEF u OSE).
// Los KPI se calculan siempre con las causas reales: los reportes pueden estar sin
// verificar o equivocados, pero los números no mienten.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const B = PF.Bubble;
  const K = PF.KPI;
  const T = D.T;
  const ACCENT = '#5fc8e8';

  const SHIFTS = 6;
  const SHIFT_S = 20;
  const DONE_S = 2.6;
  const MODES = { diag: 'Diagnóstico de turno', kpi: '¿Qué KPI cae?' };

  const DIFF = {
    facil: { simA: 12, simB: 7, decoy: 0, unverified: 0, wrong: 0, jokers: 3, tags: true, gapHints: true, lineAlways: true, colorTimeline: true, labels: true, itemsB: 3, traps: 0 },
    normal: { simA: 13, simB: 8, decoy: 0.5, unverified: 0.35, wrong: 0, jokers: 2, tags: false, gapHints: false, lineAlways: false, colorTimeline: false, labels: true, itemsB: 4, traps: 1 },
    dificil: { simA: 14, simB: 8, decoy: 1, unverified: 0.25, wrong: 0.3, jokers: 1, tags: false, gapHints: false, lineAlways: false, colorTimeline: false, labels: false, itemsB: 4, traps: 2 },
  };

  // Botones en rombo, igual que la cara del mando: arriba GLY, izquierda LEF, derecha OSE, abajo OK.
  const SLOTS = {
    GLY: { key: '↑', pad: 'y', pos: 'top' },
    LEF: { key: '←', pad: 'x', pos: 'left' },
    OSE: { key: '→', pad: 'b', pos: 'right' },
    OK: { key: '↓', pad: 'a', pos: 'bottom' },
  };
  const SLOT_CAT = { GLY: 'plan', LEF: 'ext', OSE: 'int', OK: 'ok' };
  const CTRL = {
    joker: { key: 'C', pad: 'lb' },
    view: { key: 'V', pad: 'rb' },
    help: { key: 'H', pad: 'select' },
  };

  const PANEL = {
    kpi: { x: 16, y: 76, w: 400, h: 562 },
    center: { x: 428, y: 76, w: 420, h: 562 },
    dec: { x: 860, y: 76, w: 404, h: 562 },
  };
  const MSG = { x: 8, y: 646, w: 1264, h: 66 };
  const MACHINES = ['Depaletizadora', 'Lavadora', 'Llenadora', 'Pasteurizador', 'Etiquetadora', 'Paletizadora'];

  // ------------------------------------------------------------- Estado

  function create(diffId = 'normal', opts = {}) {
    const cfg = DIFF[diffId] || DIFF.normal;
    const mode = MODES[opts.mode] ? opts.mode : 'diag';
    const s = {
      id: 'admin',
      mode,
      diff: diffId,
      cfg,
      rng: D.makeRng(opts.seed),
      duration: SHIFTS * SHIFT_S,
      timeLeft: SHIFTS * SHIFT_S,
      over: false,
      index: -1,
      shift: null,
      jokers: cfg.jokers,
      view: 'line',
      help: false,
      bubble: B.create(),
      floats: [],
      banner: null,
      lastType: [],
      stats: {
        points: 0,
        max: 0,
        diagOk: 0,
        actionOk: 0,
        unanswered: 0,
        jokersUsed: 0,
        items: { GLY: { ok: 0, total: 0 }, LEF: { ok: 0, total: 0 }, OSE: { ok: 0, total: 0 } },
        confusions: {},
      },
    };
    nextShift(s);
    s.update = (dt, input) => update(s, dt, input);
    s.draw = (r) => draw(s, r);
    s.report = () => report(s);
    return s;
  }

  function rint(rng, n) {
    return Math.floor(rng() * n);
  }

  function pick(rng, list) {
    return list[rint(rng, list.length)];
  }

  function round1(x) {
    return Math.round(x * 10) / 10;
  }

  function fmtH(h) {
    return `${h.toFixed(1).replace('.', ',')} h`;
  }

  function clockLabel(h) {
    const m = Math.round(h * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  // Reparte las pérdidas a lo largo de las 12 h sin solaparse.
  function schedule(rng, losses) {
    const order = D.shuffle(rng, losses);
    const busy = order.reduce((a, l) => a + l.hours, 0);
    const free = Math.max(0.5, K.HOURS - busy - 0.3);
    const cuts = order.map(() => rng());
    const total = cuts.reduce((a, b) => a + b, 0) + rng() + 0.2;
    let t = 0.15;
    order.forEach((l, i) => {
      t += (cuts[i] / total) * free;
      l.start = round1(t);
      t = l.start + l.hours;
    });
    return order.sort((a, b) => a.start - b.start);
  }

  // Reporte del operador para cada pérdida: correcto, sin verificar o equivocado.
  function makeReports(s, losses) {
    const { cfg, rng } = s;
    return losses.map((l) => {
      let status = 'ok';
      if (!l.def.base) {
        const x = rng();
        if (x < cfg.wrong) status = 'wrong';
        else if (x < cfg.wrong + cfg.unverified) status = 'unverified';
      }
      const fake = status === 'wrong' ? pick(rng, K.LOSSES.filter((d) => d.cat !== l.def.cat && !d.base)) : null;
      return { loss: l, status, fake, verified: false };
    });
  }

  function genDiag(s) {
    const { rng, cfg } = s;
    // Variedad: no repetir el mismo tipo tres veces seguidas.
    const types = ['ok', 'plan', 'ext', 'int', 'ext', 'int'];
    let type;
    do type = pick(rng, types);
    while (s.lastType.length >= 2 && s.lastType.slice(-2).every((x) => x === type));
    s.lastType.push(type);

    const losses = [];
    const used = new Set();
    const take = (cat, hours, id = null) => {
      const pool = K.LOSSES.filter((d) => (id ? d.id === id : d.cat === cat && !d.base && !used.has(d.id)));
      const def = pick(rng, pool);
      used.add(def.id);
      const l = { def, hours: Math.max(0.1, round1(hours)) };
      losses.push(l);
      return l;
    };
    if (rng() < 0.85) take('plan', 0.5, 'cambio');
    const others = ['plan', 'ext', 'int'].filter((c) => c !== type);
    if (type === 'ok') {
      if (rng() < 0.7) take('ext', 0.1 + rng() * 0.2);
      if (rng() < 0.7) take('int', 0.1 + rng() * 0.2);
      // Un turno real nunca es perfecto: al menos una pérdida pequeña.
      if (!losses.length) take(pick(rng, ['ext', 'int']), 0.1 + rng() * 0.2);
    } else {
      const total = 1.7 + rng() * 1.1;
      const parts = type === 'int' ? 1 + rint(rng, 3) : 1 + rint(rng, 2);
      let left = total;
      for (let i = 0; i < parts; i++) {
        const h = i === parts - 1 ? left : Math.max(0.4, left * (0.35 + rng() * 0.3));
        take(type, h);
        left -= h;
      }
      for (const c of others) if (rng() < 0.5 && c !== 'plan') take(c, 0.1 + rng() * 0.2);
      // Señuelo: otra pérdida de tamaño medio que acerca las brechas.
      if (rng() < cfg.decoy) take(pick(rng, others.filter((c) => c !== 'plan' || !used.has('cambio'))), 0.6 + rng() * 0.4);
    }
    // Garantiza que la causa dominante destaque (y que "excelente" sea de verdad excelente).
    const k = K.kpis(losses.map((l) => ({ ...l, start: 0 })));
    if (type !== 'ok') {
      const second = Math.max(...others.map((c) => k[c]));
      const lack = second + 0.5 - k[type];
      if (lack > 0) losses.find((l) => l.def.cat === type).hours = round1(losses.find((l) => l.def.cat === type).hours + lack + 0.1);
    }
    const sched = schedule(rng, losses);
    const truth = K.diagnose(K.kpis(sched));
    // Con quién se ataca: el dueño de la pérdida más grande de la causa dominante.
    let owner = 'none';
    if (truth !== 'ok') owner = sched.filter((l) => l.def.cat === truth).sort((a, b) => b.hours - a.hours)[0].def.owner;
    const wrong = D.shuffle(
      rng,
      Object.keys(K.OWNERS).filter((o) => o !== owner)
    ).slice(0, 2);
    const options = D.shuffle(rng, [owner, ...wrong]);
    return { type: truth, losses: sched, reports: makeReports(s, sched), owner, options };
  }

  function genKpi(s) {
    const { rng, cfg } = s;
    const used = new Set();
    const defs = [];
    for (const id of D.shuffle(rng, K.TRAPS).slice(0, cfg.traps)) {
      used.add(id);
      defs.push(K.LOSSES.find((d) => d.id === id));
    }
    const cats = D.shuffle(rng, ['plan', 'ext', 'int']);
    let ci = 0;
    while (defs.length < cfg.itemsB) {
      const cat = cats[ci++ % 3];
      const pool = K.LOSSES.filter((d) => d.cat === cat && !used.has(d.id));
      const def = pick(rng, pool);
      used.add(def.id);
      defs.push(def);
    }
    const losses = schedule(
      rng,
      defs.map((def) => ({ def, hours: round1(0.3 + rng() * 1.2) }))
    );
    return { type: null, losses, reports: makeReports(s, losses), answers: losses.map(() => null), cursor: 0 };
  }

  function nextShift(s) {
    s.index++;
    if (s.index >= SHIFTS) {
      s.over = true;
      s.timeLeft = 0;
      return;
    }
    const sh = s.mode === 'diag' ? genDiag(s) : genKpi(s);
    Object.assign(sh, { t: 0, phase: 'run', ff: false, doneT: 0, diag: null, action: null, clock: 0 });
    s.shift = sh;
    s.view = 'line';
    s.timeLeft = (SHIFTS - s.index) * SHIFT_S;
    s.banner = D.makeBanner(`TURNO ${s.index + 1} DE ${SHIFTS} · 12 h en ${s.mode === 'diag' ? s.cfg.simA : s.cfg.simB} s`, ACCENT, s.mode === 'diag' ? 'Mira el tablero: ¿dónde está la gran caída?' : 'Observa la línea: al final clasificarás cada pérdida', 1.3);
  }

  function sim(s) {
    return s.mode === 'diag' ? s.cfg.simA : s.cfg.simB;
  }

  // Se muestran las causas reales (brechas y horas por tipo): en diagnóstico tras responder;
  // en "¿Qué KPI cae?" solo al terminar, para no regalar las respuestas.
  function revealed(s) {
    const sh = s.shift;
    if (!sh) return false;
    return s.mode === 'kpi' ? sh.phase === 'done' : sh.phase === 'action' || sh.phase === 'done';
  }

  // Etiquetas de tipo en los reportes (solo fácil y solo en diagnóstico).
  function tagged(s) {
    return s.cfg.tags && s.mode === 'diag';
  }

  function activeLoss(sh) {
    return sh.losses.find((l) => sh.clock >= l.start && sh.clock < l.start + l.hours) || null;
  }

  // ------------------------------------------------------------- Actualización

  function update(s, dt, input) {
    if (s.over) return;
    const P = input.pressed;
    const pad = input.pad || { pressed: [] };
    const pp = pad.pressed;
    const hit = (keys, btns) => keys.some((k) => P.includes(k)) || btns.some((b) => pp.includes(b));

    if (hit(['help'], ['select'])) s.help = !s.help;
    if (s.help) {
      if (hit(['cancel'], ['b'])) s.help = false;
      return; // la ayuda congela el turno
    }

    const sh = s.shift;
    sh.t += dt;
    s.timeLeft = Math.max(0, (SHIFTS - s.index) * SHIFT_S - sh.t);
    B.update(s.bubble, dt);
    s.floats = D.floatsUpdate(s.floats, dt);
    D.tickBanner(s, dt);
    // Reloj del turno simulado: 12 h en `sim` segundos (acelera tras responder).
    const target = Math.min(K.HOURS, (sh.t / sim(s)) * K.HOURS);
    sh.clock = sh.ff ? Math.min(K.HOURS, sh.clock + dt * 18) : Math.max(sh.clock, target);

    if (sh.phase === 'done') {
      sh.doneT -= dt;
      if (sh.doneT <= 0 || sh.t >= SHIFT_S) nextShift(s);
      return;
    }
    if (sh.t >= SHIFT_S) {
      timeout(s);
      nextShift(s);
      return;
    }
    if (s.mode === 'kpi' && sh.phase === 'run' && sh.clock >= K.HOURS) {
      sh.phase = 'report';
      s.view = 'report';
      D.sfx('alarm');
    }

    if (hit(['tab', 'view'], ['rb']) && !s.cfg.lineAlways && sh.phase === 'run') {
      s.view = s.view === 'line' ? 'reports' : 'line';
      D.sfx('blip');
    }
    if (hit(['joker'], ['lb'])) useJoker(s);

    let ans = null;
    if (hit(['up', '1'], ['y', 'up'])) ans = 'GLY';
    else if (hit(['left', '2'], ['x', 'left'])) ans = 'LEF';
    else if (hit(['right', '3'], ['b', 'right'])) ans = 'OSE';
    else if (hit(['down', '4'], ['a', 'down'])) ans = 'OK';
    for (const c of input.clicks || []) {
      const slot = Object.entries(diamond()).find(([, rc]) => c.x >= rc.x && c.x <= rc.x + rc.w && c.y >= rc.y && c.y <= rc.y + rc.h);
      if (slot) ans = slot[0];
    }
    if (ans) answer(s, ans);
  }

  function useJoker(s) {
    const sh = s.shift;
    if (s.jokers <= 0) {
      B.say(s.bubble, 'Ya no te quedan llamadas para verificar en este juego.', { kind: 'tip', life: 2.5 });
      return;
    }
    const pending = sh.reports.filter((r) => !r.verified && r.loss.start <= sh.clock);
    if (!pending.length) {
      B.say(s.bubble, 'No hay reportes por verificar todavía: espera a que pase algo en la línea.', { kind: 'tip', life: 2.5 });
      return;
    }
    s.jokers--;
    s.stats.jokersUsed++;
    let fixed = 0;
    for (const r of pending) {
      r.verified = true;
      if (r.status !== 'ok') fixed++;
    }
    if (!s.cfg.lineAlways && sh.phase === 'run') s.view = 'reports';
    B.say(s.bubble, fixed ? `Llamaste y verificaste: ${fixed} ${fixed === 1 ? 'reporte estaba' : 'reportes estaban'} sin confirmar o mal informados. Ya ves la causa real.` : 'Llamaste y verificaste: los reportes eran correctos.', { kind: 'ok', title: 'Verificado', life: 4 });
    D.sfx('resolved');
  }

  function answer(s, slot) {
    const sh = s.shift;
    if (s.mode === 'diag') {
      if (sh.phase === 'run') {
        if (slot === 'OK' || SLOT_CAT[slot]) diagAnswer(s, SLOT_CAT[slot]);
      } else if (sh.phase === 'action' && slot !== 'OK') {
        actionAnswer(s, sh.options[['LEF', 'GLY', 'OSE'].indexOf(slot)]);
      }
    } else if (sh.phase === 'report' && slot !== 'OK') {
      itemAnswer(s, slot);
    }
  }

  function diagAnswer(s, cat) {
    const sh = s.shift;
    sh.diag = cat;
    sh.ff = true;
    sh.phase = 'action';
    s.stats.max += 100;
    const truth = sh.type;
    const d = K.DIAG[truth];
    if (cat === truth) {
      s.stats.diagOk++;
      s.stats.points += 100;
      D.floatAdd(s.floats, 1062, 290, '+100', T.ok, 24);
      B.say(s.bubble, `${d.label}. ${K.DIAG_WHY[truth]}`, { kind: 'ok', life: 4.5 });
      D.sfx('resolved');
    } else {
      const key = `${K.DIAG[cat].short} en vez de ${d.short}`;
      s.stats.confusions[key] = (s.stats.confusions[key] || 0) + 1;
      B.say(s.bubble, `No era "${K.DIAG[cat].label.toLowerCase()}": era ${d.label.toLowerCase()}. Patrón: ${d.pattern}. ${K.DIAG_WHY[truth]}`);
    }
  }

  function actionAnswer(s, owner) {
    const sh = s.shift;
    sh.action = owner;
    sh.phase = 'done';
    sh.doneT = DONE_S;
    s.stats.max += 50;
    const correct = sh.owner;
    const why = sh.type === 'ok' ? 'Turno excelente: no hay pérdida grande que atacar; se estandariza lo que funcionó.' : `${K.CATS[sh.type].power}`;
    if (owner === correct) {
      s.stats.actionOk++;
      s.stats.points += 50;
      D.floatAdd(s.floats, 1062, 290, '+50', T.ok, 22);
      if (!(s.bubble.cur && s.bubble.cur.kind === 'error')) B.say(s.bubble, why, { kind: 'ok', title: 'Bien dirigido', life: 3 });
      D.sfx('blip');
    } else {
      B.say(s.bubble, `La pérdida principal se ataca con ${ownerLabel(correct)}, no con ${ownerLabel(owner)}. ${why}`);
    }
  }

  function ownerLabel(o) {
    return o === 'none' ? 'nadie: estandarizar y mantener' : K.OWNERS[o];
  }

  function itemAnswer(s, kpi) {
    const sh = s.shift;
    const i = sh.cursor;
    const l = sh.losses[i];
    const truth = K.CATS[l.def.cat].kpi;
    sh.answers[i] = kpi;
    s.stats.max += 50;
    s.stats.items[truth].total++;
    if (kpi === truth) {
      s.stats.items[truth].ok++;
      s.stats.points += 50;
      D.floatAdd(s.floats, 1062, 290, '+50', T.ok, 22);
      B.say(s.bubble, `${l.def.name}: ${truth}. ${l.def.trap || K.CATS[l.def.cat].explain}`, { kind: 'ok', life: 3.5 });
      D.sfx('blip');
    } else {
      const key = `${truth} → dijiste ${kpi}`;
      s.stats.confusions[key] = (s.stats.confusions[key] || 0) + 1;
      B.say(s.bubble, `"${l.def.name}" no cae primero en ${kpi}: cae en ${truth}. ${l.def.trap || K.CATS[l.def.cat].explain}`);
    }
    sh.cursor++;
    if (sh.cursor >= sh.losses.length) {
      sh.phase = 'done';
      sh.doneT = DONE_S + 0.6;
    }
  }

  // Se acabaron los 20 s del turno sin completar la respuesta.
  function timeout(s) {
    const sh = s.shift;
    if (s.mode === 'diag') {
      if (sh.phase === 'run') {
        s.stats.max += 150;
        s.stats.unanswered++;
        B.say(s.bubble, `Turno sin diagnóstico. Era ${K.DIAG[sh.type].label.toLowerCase()} (${K.DIAG[sh.type].pattern}).`, { kind: 'tip', life: 4 });
      } else if (sh.phase === 'action') s.stats.max += 50;
    } else {
      for (let i = sh.cursor; i < sh.losses.length; i++) {
        s.stats.max += 50;
        s.stats.items[K.CATS[sh.losses[i].def.cat].kpi].total++;
      }
      if (sh.cursor < sh.losses.length) {
        s.stats.unanswered += sh.losses.length - sh.cursor;
        B.say(s.bubble, 'Se acabó el turno con pérdidas sin clasificar: cuentan como fallos.', { kind: 'tip', life: 3 });
      }
    }
  }

  // ------------------------------------------------------------- Dibujo

  function draw(s, r) {
    const ctx = r.ctx;
    const t = r.t;
    D.begin(r);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, D.VIEW.width, D.VIEW.height);
    if (s.shift) {
      drawKpiPanel(s, ctx);
      drawCenter(s, ctx, t);
      drawDecision(s, ctx);
    }
    D.floatsDraw(ctx, s.floats);
    B.bar(ctx, MSG, { bubble: s.bubble, notices: [s.banner], t, split: 0.72 });
    D.hud(ctx, t, {
      title: 'SUPERVISOR DE TURNO',
      diff: s.diff,
      timeLeft: s.timeLeft,
      duration: s.duration,
      accent: ACCENT,
      stats: [
        { label: 'Turno', value: `${Math.min(SHIFTS, s.index + 1)}/${SHIFTS}`, width: 100 },
        { label: 'Puntos', value: s.stats.points, color: T.ok, width: 110 },
        { label: MODES[s.mode], value: '', width: 10, mono: false },
      ],
    });
    D.hints(ctx, [[CTRL.help, 'ayuda']], 1266, 50, { size: 11, align: 'right', ink: T.dim, color: '#6e5a48' });
    if (s.help) drawHelp(ctx);
  }

  function panelTitle(ctx, rc, title, sub = null) {
    D.panel(ctx, rc.x, rc.y, rc.w, rc.h, { fill: '#100c0c', edge: '#2e2420', radius: 12 });
    ctx.fillStyle = ACCENT;
    D.roundRect(ctx, rc.x, rc.y, rc.w, 34, 12);
    ctx.fill();
    ctx.fillRect(rc.x, rc.y + 20, rc.w, 14);
    D.text(ctx, title, rc.x + 14, rc.y + 23, { size: 16, weight: 800, color: '#0c1418' });
    if (sub) D.text(ctx, sub, rc.x + rc.w - 14, rc.y + 23, { size: 13, weight: 700, color: '#0c1418', align: 'right' });
  }

  function kpiColor(v) {
    return v >= 0.9 ? T.ok : v >= 0.8 ? T.warn : T.red;
  }

  function drawKpiPanel(s, ctx) {
    const rc = PANEL.kpi;
    const sh = s.shift;
    panelTitle(ctx, rc, 'TABLERO KPI · LÍNEA 2', `turno ${s.index + 1}/${SHIFTS}`);
    const x = rc.x + 16;
    const w = rc.w - 32;
    // Reloj y línea de tiempo del turno.
    D.text(ctx, `Hora ${clockLabel(sh.clock)} de 12:00`, x, rc.y + 60, { size: 15, weight: 700, color: T.ink, family: D.MONO });
    const ty = rc.y + 70;
    ctx.fillStyle = '#1f2a1f';
    D.roundRect(ctx, x, ty, w, 16, 5);
    ctx.fill();
    const showCat = s.cfg.colorTimeline || revealed(s);
    for (const l of sh.losses) {
      if (l.start > sh.clock) continue;
      const a = x + (l.start / K.HOURS) * w;
      const b = x + (Math.min(sh.clock, l.start + l.hours) / K.HOURS) * w;
      ctx.fillStyle = showCat ? K.CATS[l.def.cat].color : '#8a7a6a';
      ctx.fillRect(a, ty, Math.max(2, b - a), 16);
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + (sh.clock / K.HOURS) * w - 1, ty - 4, 2, 24);
    D.text(ctx, showCat ? 'paradas por tipo' : 'paradas (causa sin clasificar)', x, ty + 32, { size: 11, color: T.faint });

    const k = K.kpis(sh.losses, Math.max(0.01, sh.clock));
    const showGaps = s.cfg.gapHints || revealed(s);
    const rows = [
      ['GLY', 'Productividad global · utilización', k.gly, 1, 'plan'],
      ['LEF', 'Eficiencia de línea · sin pérdidas externas', k.lef, k.gly, 'ext'],
      ['OSE', 'Efectividad real del sistema', k.ose, k.lef, 'int'],
    ];
    const bx = x;
    const bw = w;
    const pos = (v) => bx + Math.max(0, Math.min(1, (v - 0.5) / 0.5)) * bw;
    rows.forEach(([name, sub, v, above, cat], i) => {
      const y = rc.y + 136 + i * 92;
      D.text(ctx, name, x, y + 24, { size: 30, weight: 800, color: T.ink });
      D.text(ctx, sub, x + 70, y + 22, { size: 12, color: T.dim });
      D.text(ctx, K.pct(v), x + w, y + 26, { size: 26, weight: 700, color: kpiColor(v), family: D.MONO, align: 'right' });
      const yb = y + 38;
      ctx.fillStyle = '#241c18';
      D.roundRect(ctx, bx, yb, bw, 24, 6);
      ctx.fill();
      ctx.fillStyle = kpiColor(v);
      D.roundRect(ctx, bx, yb, pos(v) - bx, 24, 6);
      ctx.fill();
      // Brecha: lo que este KPI descuenta respecto al anterior.
      if (showGaps && above - v > 0.002) {
        ctx.fillStyle = K.CATS[cat].color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(pos(v), yb, pos(above) - pos(v), 24);
        ctx.globalAlpha = 1;
        D.text(ctx, `−${((above - v) * 100).toFixed(1).replace('.', ',')} pts · ${K.CATS[cat].short.toLowerCase()}`, x + w, yb + 42, { size: 12, weight: 700, color: K.CATS[cat].color, align: 'right' });
      }
      for (const m of [0.6, 0.7, 0.8, 0.9]) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(pos(m), yb, 1, 24);
      }
    });
    D.text(ctx, sh.clock < K.HOURS ? 'acumulado hasta la hora actual · escala 50–100 %' : 'turno completo · escala 50–100 %', x, rc.y + 136 + 3 * 92 - 8, { size: 11, color: T.faint });

    const y0 = rc.y + 440;
    if (revealed(s)) {
      const kf = K.kpis(sh.losses);
      D.text(ctx, 'HORAS PERDIDAS EN EL TURNO', x, y0, { size: 12, weight: 800, color: T.dim });
      ['plan', 'ext', 'int'].forEach((c, i) => {
        const yy = y0 + 22 + i * 22;
        ctx.fillStyle = K.CATS[c].color;
        ctx.fillRect(x, yy - 10, 12, 12);
        D.text(ctx, `${K.CATS[c].name} → ${K.CATS[c].kpi}`, x + 20, yy, { size: 14, weight: 600 });
        D.text(ctx, fmtH(kf[c]), x + w, yy, { size: 14, weight: 700, color: K.CATS[c].color, align: 'right', family: D.MONO });
      });
      D.text(ctx, 'GLY ≥ LEF ≥ OSE: cada uno descuenta un nivel más de pérdidas', x, y0 + 100, { size: 11, color: T.faint });
    } else if (s.cfg.gapHints && s.mode === 'diag') {
      D.text(ctx, 'REGLA RÁPIDA', x, y0, { size: 12, weight: 800, color: T.dim });
      const rules = [
        ['GLY alto · LEF y OSE bajos', 'externo', K.CATS.ext.color],
        ['GLY y LEF altos · OSE bajo', 'interno', K.CATS.int.color],
        ['GLY, LEF y OSE bajos', 'planificación', K.CATS.plan.color],
        ['todo alto (≥ 90 %)', 'excelente', T.ok],
      ];
      rules.forEach(([a, b, c], i) => {
        D.text(ctx, a, x, y0 + 22 + i * 21, { size: 13, weight: 600 });
        D.text(ctx, `→ ${b}`, x + w, y0 + 22 + i * 21, { size: 13, weight: 800, color: c, align: 'right' });
      });
    } else {
      D.text(ctx, 'GLY ≥ LEF ≥ OSE', x, y0 + 20, { size: 20, weight: 800, color: T.ink });
      D.paragraph(ctx, 'Cada KPI descuenta un nivel más de pérdidas: planificación (GLY), externas (LEF) e internas (OSE). Busca dónde está la gran caída.', x, y0 + 46, w, { size: 13, color: T.dim });
    }
  }

  function drawCenter(s, ctx, t) {
    const rc = PANEL.center;
    const sh = s.shift;
    if (s.mode === 'kpi' && sh.phase !== 'run') {
      drawEndReport(s, ctx);
      return;
    }
    if (s.cfg.lineAlways) {
      panelTitle(ctx, rc, 'VER LA LÍNEA · REPORTES');
      drawLine(s, ctx, { x: rc.x + 10, y: rc.y + 44, w: rc.w - 20, h: 210 }, t);
      drawReports(s, ctx, { x: rc.x + 10, y: rc.y + 264, w: rc.w - 20, h: rc.h - 274 });
      return;
    }
    panelTitle(ctx, rc, s.view === 'line' ? 'VER LA LÍNEA' : 'REPORTES DEL TURNO');
    D.hints(ctx, [[CTRL.view, s.view === 'line' ? 'reportes' : 'ver la línea']], rc.x + rc.w - 12, rc.y + 17, { size: 11, align: 'right', ink: '#0c1418', color: '#0c1418', keyInk: ACCENT });
    if (s.view === 'line') {
      drawLine(s, ctx, { x: rc.x + 10, y: rc.y + 44, w: rc.w - 20, h: 260 }, t);
      D.paragraph(ctx, 'Lo que ves aquí es la causa real, en vivo. Los reportes los escriben los operadores y pueden llegar tarde, sin verificar o equivocados.', rc.x + 16, rc.y + 340, rc.w - 32, { size: 14, color: T.dim });
      const n = sh.reports.filter((r) => r.loss.start <= sh.clock).length;
      D.text(ctx, `${n} reportes recibidos`, rc.x + 16, rc.y + 420, { size: 14, weight: 700, color: ACCENT });
    } else {
      drawReports(s, ctx, { x: rc.x + 10, y: rc.y + 44, w: rc.w - 20, h: rc.h - 54 });
    }
  }

  // Texto que muestra un reporte según su estado (y si ya se verificó).
  function reportText(s, rep) {
    if (rep.verified || rep.status === 'ok' || revealed(s)) return rep.loss.def.name;
    if (rep.status === 'unverified') return 'Línea detenida · causa por confirmar';
    return rep.fake.name;
  }

  function reportBadge(s, rep) {
    if (rep.verified) return rep.status === 'wrong' ? ['✖ estaba mal informado', T.red] : ['✔ verificado', T.ok];
    if (rep.status === 'unverified') return ['? sin verificar', T.warn];
    // En difícil todo reporte de operador llega sin verificar: no se distinguen los erróneos.
    if (s.cfg.wrong > 0 && !rep.loss.def.base) return ['? reporte de operador', T.warn];
    return null;
  }

  function drawReports(s, ctx, rc) {
    const sh = s.shift;
    const list = sh.reports.filter((r) => r.loss.start <= sh.clock);
    if (!list.length) D.text(ctx, 'Sin reportes todavía.', rc.x + 6, rc.y + 24, { size: 14, color: T.faint });
    list.slice(-6).forEach((rep, i) => {
      const y = rc.y + i * 46;
      const l = rep.loss;
      ctx.fillStyle = '#1a1412';
      D.roundRect(ctx, rc.x, y, rc.w, 40, 6);
      ctx.fill();
      const known = rep.verified || rep.status === 'ok';
      if (tagged(s) || (known && revealed(s))) {
        ctx.fillStyle = K.CATS[l.def.cat].color;
        ctx.fillRect(rc.x, y, 5, 40);
      }
      D.text(ctx, clockLabel(l.start), rc.x + 12, y + 17, { size: 13, weight: 700, color: T.dim, family: D.MONO });
      const dur = Math.min(l.hours, Math.max(0, sh.clock - l.start));
      D.text(ctx, fmtH(dur), rc.x + rc.w - 10, y + 17, { size: 13, weight: 700, color: T.dim, align: 'right', family: D.MONO });
      ctx.font = D.font(14, 700);
      let txt = reportText(s, rep);
      while (ctx.measureText(txt).width > rc.w - 130 && txt.length > 4) txt = txt.slice(0, -2);
      if (txt !== reportText(s, rep)) txt += '…';
      D.text(ctx, txt, rc.x + 62, y + 17, { size: 14, weight: 700, color: known ? T.ink : '#ffd9a8' });
      const badge = reportBadge(s, rep);
      if (rep.verified && rep.status === 'wrong') D.text(ctx, `reportado: ${rep.fake.name}`, rc.x + 62, y + 34, { size: 11, color: T.red });
      else if (tagged(s)) D.text(ctx, `${K.CATS[l.def.cat].name} → ${K.CATS[l.def.cat].kpi}`, rc.x + 62, y + 34, { size: 11, color: K.CATS[l.def.cat].color });
      if (badge) D.text(ctx, badge[0], rc.x + rc.w - 10, y + 34, { size: 11, weight: 700, color: badge[1], align: 'right' });
    });
  }

  // Vista de la línea: máquinas, botellas y la causa real de la parada en curso.
  function drawLine(s, ctx, rc, t) {
    const sh = s.shift;
    const loss = activeLoss(sh);
    const cat = loss && loss.def.cat;
    const color = cat ? K.CATS[cat].color : T.ok;
    ctx.fillStyle = '#0c0a09';
    D.roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 8);
    ctx.fill();
    const n = MACHINES.length;
    const mw = (rc.w - 20 - (n - 1) * 6) / n;
    const my = rc.y + 40;
    const mh = 64;
    const vis = loss ? loss.def.visual : null;
    const dark = vis === 'nostaff' || vis === 'noplan' || vis === 'replan';
    // Transportador con botellas.
    const cy = my + mh + 26;
    ctx.fillStyle = '#2b2320';
    ctx.fillRect(rc.x + 10, cy, rc.w - 20, 10);
    const speed = !loss ? 60 : vis === 'slow' ? 18 : 0;
    const emptyIn = vis === 'material' || vis === 'pallets';
    for (let i = 0; i < 18; i++) {
      let bx = rc.x + 14 + ((i * 22 + t * speed) % (rc.w - 30));
      if (emptyIn && bx < rc.x + rc.w * 0.45) continue;
      if (vis === 'jam' && i % 3 === 0) bx += 4;
      ctx.fillStyle = dark ? '#3a3230' : '#c98a2a';
      ctx.fillRect(bx, cy - 10 + (vis === 'jam' && i % 4 === 0 ? -6 : 0), 7, 10);
    }
    MACHINES.forEach((name, i) => {
      const x = rc.x + 10 + i * (mw + 6);
      const hitHere = loss && (loss.def.machine === i || loss.def.machine === -1);
      let fill = dark ? '#1c1715' : '#3b3431';
      let edge = '#0d0807';
      if (hitHere && !dark) {
        const blink = Math.floor(t * 4) % 2 === 0;
        fill = cat === 'int' ? (blink ? '#6a1d16' : '#3b1a16') : cat === 'ext' ? '#4a3416' : '#2e2340';
        edge = color;
      }
      ctx.fillStyle = fill;
      D.roundRect(ctx, x, my, mw, mh, 6);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Luz de estado.
      ctx.fillStyle = !loss ? T.ok : hitHere ? color : dark ? '#3a3230' : T.warn;
      ctx.beginPath();
      ctx.arc(x + mw / 2, my + 14, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(x + mw / 2, my + mh - 10);
      D.text(ctx, name.slice(0, 7) + (name.length > 7 ? '.' : ''), 0, 0, { size: 10, weight: 700, color: T.dim, align: 'center' });
      ctx.restore();
      if (hitHere && !dark) drawCause(ctx, vis, x + mw / 2, my + 38, color, t);
    });
    // Rótulo de estado (en difícil solo el color y la animación).
    let label = 'LÍNEA PRODUCIENDO';
    if (loss) label = s.cfg.labels ? loss.def.name.toUpperCase() : cat === 'int' ? 'PARADA · ALARMA DE MÁQUINA' : cat === 'ext' ? 'PARADA · ESPERANDO' : 'PARADA PREVISTA';
    if (dark && loss) drawCause(ctx, vis, rc.x + rc.w / 2, my + 38, color, t);
    ctx.font = D.font(14, 800);
    const lw = Math.min(rc.w - 20, ctx.measureText(label).width + 30);
    ctx.fillStyle = loss ? color : '#1f3a1f';
    D.roundRect(ctx, rc.x + (rc.w - lw) / 2, rc.y + 8, lw, 24, 12);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(rc.x + 10, rc.y + 8, rc.w - 20, 24);
    ctx.clip();
    D.text(ctx, label, rc.x + rc.w / 2, rc.y + 25, { size: 14, weight: 800, color: loss ? '#140c09' : T.ok, align: 'center' });
    ctx.restore();
    if (rc.h > 220) {
      D.text(ctx, loss ? `Desde las ${clockLabel(loss.start)} · ${fmtH(Math.max(0, sh.clock - loss.start))}` : 'Sin paradas en este momento', rc.x + rc.w / 2, cy + 44, { size: 13, color: T.dim, align: 'center' });
    }
  }

  // Ícono simple de la causa sobre la máquina afectada.
  function drawCause(ctx, vis, x, y, color, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    const bob = Math.sin(t * 5) * 2;
    if (vis === 'breakdown' || vis === 'longchange' || vis === 'changeover' || vis === 'pm') {
      // Llave inglesa.
      ctx.rotate(-0.6 + Math.sin(t * 6) * 0.2);
      ctx.fillRect(-3, -2, 6, 18);
      ctx.beginPath();
      ctx.arc(0, -6, 8, Math.PI * 0.2, Math.PI * 1.8);
      ctx.stroke();
      if (vis === 'longchange') {
        ctx.rotate(0.6);
        ctx.beginPath();
        ctx.arc(16, -10, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (vis === 'electrical') {
      ctx.beginPath();
      ctx.moveTo(4, -14 + bob);
      ctx.lineTo(-6, 2 + bob);
      ctx.lineTo(1, 2 + bob);
      ctx.lineTo(-4, 14 + bob);
      ctx.lineTo(7, -2 + bob);
      ctx.lineTo(0, -2 + bob);
      ctx.closePath();
      ctx.fill();
    } else if (vis === 'micro' || vis === 'jam' || vis === 'slow') {
      D.text(ctx, vis === 'slow' ? '◔' : '!', 0, 8 + bob, { size: 22, weight: 800, color, align: 'center' });
    } else if (vis === 'material' || vis === 'pallets' || vis === 'warehouse') {
      ctx.fillRect(-12, -6 + bob, 18, 12);
      ctx.fillRect(6, -2 + bob, 7, 8);
      ctx.fillStyle = '#140c09';
      ctx.beginPath();
      ctx.arc(-6, 7 + bob, 3, 0, Math.PI * 2);
      ctx.arc(8, 7 + bob, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (vis === 'quality') {
      ctx.beginPath();
      ctx.moveTo(-4, -12);
      ctx.lineTo(4, -12);
      ctx.lineTo(4, -3);
      ctx.lineTo(11, 10);
      ctx.lineTo(-11, 10);
      ctx.lineTo(-4, -3);
      ctx.closePath();
      ctx.stroke();
    } else if (vis === 'utility') {
      D.roundRect(ctx, -6, -12, 12, 24, 5);
      ctx.fill();
    } else if (vis === 'cip') {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-8 + i * 6, -6 + ((t * 20 + i * 7) % 16), 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // Sin personal / sin programa / cambio de plan: calendario.
      ctx.strokeRect(-12, -10, 24, 20);
      ctx.fillRect(-12, -10, 24, 6);
      if (vis === 'replan') D.text(ctx, '!', 0, 9, { size: 13, weight: 800, color, align: 'center' });
    }
    ctx.restore();
  }

  function drawEndReport(s, ctx) {
    const rc = PANEL.center;
    const sh = s.shift;
    panelTitle(ctx, rc, 'REPORTE DE FIN DE TURNO', 'lo que falló');
    D.text(ctx, '¿Qué KPI cae primero con cada pérdida?', rc.x + 16, rc.y + 58, { size: 16, weight: 800, color: ACCENT });
    sh.losses.forEach((l, i) => {
      const rep = sh.reports[i];
      const y = rc.y + 74 + i * 84;
      const cur = sh.phase === 'report' && i === sh.cursor;
      const ans = sh.answers[i];
      const truth = K.CATS[l.def.cat].kpi;
      D.panel(ctx, rc.x + 10, y, rc.w - 20, 76, { fill: cur ? '#16262c' : '#1a1412', edge: cur ? ACCENT : '#2e2420', radius: 8, glow: cur ? ACCENT : null });
      if (cur) D.text(ctx, '▶', rc.x + 22, y + 30, { size: 16, weight: 800, color: ACCENT });
      ctx.font = D.font(15, 700);
      const lines = D.wrap(ctx, reportText(s, rep), rc.w - 150).slice(0, 2);
      lines.forEach((ln, j) => D.text(ctx, ln, rc.x + 40, y + 24 + j * 18, { size: 15, weight: 700, color: rep.verified || rep.status === 'ok' ? T.ink : '#ffd9a8' }));
      D.text(ctx, fmtH(l.hours), rc.x + 40, y + 66, { size: 12, color: T.dim, family: D.MONO });
      const badge = reportBadge(s, rep);
      if (badge) D.text(ctx, badge[0], rc.x + 100, y + 66, { size: 11, weight: 700, color: badge[1] });
      // Respuesta.
      const ax = rc.x + rc.w - 70;
      if (ans) {
        const ok = ans === truth;
        D.panel(ctx, ax - 10, y + 12, 66, 52, { fill: ok ? T.okDark : '#4a1410', edge: ok ? T.ok : T.red, radius: 8 });
        D.text(ctx, ok ? `✔ ${ans}` : `✖ ${ans}`, ax + 23, y + 34, { size: 15, weight: 800, color: ok ? T.ok : T.red, align: 'center' });
        if (!ok) D.text(ctx, `era ${truth}`, ax + 23, y + 54, { size: 12, weight: 700, color: T.ink, align: 'center' });
      } else {
        D.text(ctx, cur ? '?' : '·', ax + 23, y + 46, { size: 26, weight: 800, color: cur ? ACCENT : T.faint, align: 'center' });
      }
    });
  }

  // Rectángulos del rombo de respuestas (también para el ratón).
  function diamond() {
    const rc = PANEL.dec;
    const w = 176;
    const h = 66;
    const cx = rc.x + rc.w / 2;
    const cy = rc.y + 200;
    return {
      GLY: { x: cx - w / 2, y: cy - h - 40, w, h },
      LEF: { x: rc.x + 14, y: cy - h / 2, w, h },
      OSE: { x: rc.x + rc.w - 14 - w, y: cy - h / 2, w, h },
      OK: { x: cx - w / 2, y: cy + 40, w, h },
    };
  }

  function slotLabels(s) {
    const sh = s.shift;
    if (s.mode === 'kpi') {
      return {
        GLY: ['GLY', 'planificación / utilización', K.CATS.plan.color],
        LEF: ['LEF', 'pérdida externa', K.CATS.ext.color],
        OSE: ['OSE', 'pérdida interna', K.CATS.int.color],
      };
    }
    if (sh.phase === 'run') {
      return {
        GLY: ['PLANIFICACIÓN', 'todo bajo · cae el GLY', K.CATS.plan.color],
        LEF: ['EXTERNO', 'GLY alto · LEF bajo', K.CATS.ext.color],
        OSE: ['INTERNO', 'LEF alto · OSE bajo', K.CATS.int.color],
        OK: ['EXCELENTE', 'todo alto (≥ 90 %)', T.ok],
      };
    }
    // Acción: con quién se ataca la pérdida principal.
    const [a, b, c] = sh.options;
    const lab = (o) => (o === 'none' ? ['ESTANDARIZAR', 'y mantener lo que funcionó', T.ok] : [ownerShort(o), ownerHint(o), ACCENT]);
    return { LEF: lab(a), GLY: lab(b), OSE: lab(c) };
  }

  function ownerShort(o) {
    return { planificacion: 'PLANIFICACIÓN', abastecimiento: 'ABASTECIMIENTO', calidad: 'CALIDAD', servicios: 'SERVICIOS', mantenimiento: 'MANTENIMIENTO', operacion: 'OPERACIÓN' }[o];
  }

  function ownerHint(o) {
    return { planificacion: 'programa y dotación', abastecimiento: 'logística y materiales', calidad: 'liberación del producto', servicios: 'industriales: CO₂, vapor', mantenimiento: 'averías y fallas', operacion: 'en el poder de la línea' }[o];
  }

  function drawDecision(s, ctx) {
    const rc = PANEL.dec;
    const sh = s.shift;
    let title = s.mode === 'kpi' ? '¿QUÉ KPI CAE?' : sh.phase === 'run' ? 'DIAGNÓSTICO DEL TURNO' : '¿CON QUIÉN LA ATACAS?';
    if (sh.phase === 'done') title = 'RESULTADO DEL TURNO';
    panelTitle(ctx, rc, title);
    let help = '';
    if (s.mode === 'diag') help = sh.phase === 'run' ? '¿Dónde está la gran caída? Puedes responder antes de que acabe el turno.' : sh.phase === 'action' ? 'Elige con quién atacar la pérdida principal.' : '';
    else help = sh.phase === 'run' ? 'Observa la línea: el reporte llega al final del turno.' : sh.phase === 'report' ? 'Clasifica la pérdida marcada en el reporte.' : '';
    if (help) D.paragraph(ctx, help, rc.x + 16, rc.y + 56, rc.w - 32, { size: 13, color: T.dim });

    const labels = slotLabels(s);
    const active = (s.mode === 'diag' && (sh.phase === 'run' || sh.phase === 'action')) || (s.mode === 'kpi' && sh.phase === 'report');
    const rects = diamond();
    for (const [slot, rcB] of Object.entries(rects)) {
      const lab = labels[slot];
      if (!lab) continue;
      const on = active;
      D.panel(ctx, rcB.x, rcB.y, rcB.w, rcB.h, { fill: '#1a1412', edge: on ? lab[2] : '#2e2420', radius: 10, glow: on ? lab[2] : null });
      ctx.globalAlpha = on ? 1 : 0.45;
      const cw = D.control(ctx, SLOTS[slot], rcB.x + 10, rcB.y + rcB.h / 2, { size: 13, color: lab[2] });
      ctx.font = D.font(16, 800);
      let main = lab[0];
      while (ctx.measureText(main).width > rcB.w - cw - 26 && main.length > 4) main = main.slice(0, -2);
      if (main !== lab[0]) main += '.';
      D.text(ctx, main, rcB.x + cw + 18, rcB.y + 29, { size: 16, weight: 800, color: lab[2] });
      D.text(ctx, lab[1], rcB.x + cw + 18, rcB.y + 48, { size: 11, weight: 600, color: T.dim });
      ctx.globalAlpha = 1;
    }

    // Resultado del turno (modo diagnóstico).
    if (s.mode === 'diag' && sh.phase === 'done') {
      const ok = sh.diag === sh.type;
      const d = K.DIAG[sh.type];
      const y = rc.y + 330;
      D.panel(ctx, rc.x + 14, y, rc.w - 28, 74, { fill: ok ? T.okDark : '#3a1410', edge: ok ? T.ok : T.red, radius: 10 });
      D.text(ctx, ok ? '✔ DIAGNÓSTICO CORRECTO' : '✖ DIAGNÓSTICO INCORRECTO', rc.x + 28, y + 26, { size: 16, weight: 800, color: ok ? T.ok : T.red });
      D.text(ctx, `Era: ${d.label}`, rc.x + 28, y + 48, { size: 14, weight: 700, color: d.color });
      D.text(ctx, `Atacar con: ${ownerLabel(sh.owner)}`, rc.x + 28, y + 66, { size: 12, color: T.ink });
    }

    // Herramientas.
    const ty = rc.y + 430;
    D.text(ctx, 'HERRAMIENTAS', rc.x + 16, ty, { size: 12, weight: 800, color: T.dim });
    let w = D.control(ctx, CTRL.joker, rc.x + 16, ty + 24, { size: 13, color: s.jokers ? ACCENT : '#5a4a40' });
    D.text(ctx, `Llamar y verificar · quedan ${s.jokers}`, rc.x + 24 + w, ty + 29, { size: 14, weight: 700, color: s.jokers ? T.ink : T.faint });
    if (!s.cfg.lineAlways) {
      w = D.control(ctx, CTRL.view, rc.x + 16, ty + 54, { size: 13, color: ACCENT });
      D.text(ctx, 'Ver la línea / reportes', rc.x + 24 + w, ty + 59, { size: 14, weight: 700 });
    }
    // Tiempo del turno.
    const left = Math.max(0, SHIFT_S - sh.t);
    D.text(ctx, `Tiempo para decidir: ${Math.ceil(left)} s`, rc.x + 16, rc.y + rc.h - 22, { size: 13, weight: 700, color: left < 5 ? T.red : T.dim });
    D.progressBar(ctx, rc.x + 16, rc.y + rc.h - 14, rc.w - 32, 6, left / SHIFT_S, left < 5 ? T.red : ACCENT);
  }

  function drawHelp(ctx) {
    ctx.fillStyle = 'rgba(8,4,3,0.9)';
    ctx.fillRect(0, 0, D.VIEW.width, D.VIEW.height);
    D.panel(ctx, 40, 30, 1200, 660, { fill: '#f2e3c6', edge: T.brass, radius: 12 });
    const ink = '#2a170d';
    D.text(ctx, 'GLY, LEF Y OSE: CÓMO SE RELACIONAN', 70, 74, { size: 26, weight: 800, color: '#3a1d0c' });
    // Árbol de filtros.
    const boxes = [
      ['HORAS TOTALES DEL TURNO', '12 h', '#7a5030'],
      ['− planificación / utilización', 'sin personal, sin programa, paradas programadas', K.CATS.plan.color],
      ['GLY', '¿qué parte del tiempo total aprovecho?', '#3a1d0c'],
      ['− pérdidas externas', 'materiales, Calidad, pallets, servicios, logística, planificación incorrecta', K.CATS.ext.color],
      ['LEF', 'cuando debía producir, ¿cuánto operó?', '#3a1d0c'],
      ['− pérdidas internas', 'averías, fallas eléctricas, microparadas, atascos, operación lenta, cambios mal ejecutados', K.CATS.int.color],
      ['OSE', '¿qué parte fue producción efectiva?', '#3a1d0c'],
    ];
    boxes.forEach(([a, b, c], i) => {
      const y = 100 + i * 50;
      const kpi = i % 2 === 0 && i > 0;
      D.panel(ctx, 70, y, 560, 42, { fill: kpi ? '#fff4e2' : '#f7ead4', edge: c, radius: 8 });
      D.text(ctx, a, 84, y + 19, { size: kpi ? 20 : 15, weight: 800, color: c });
      D.paragraph(ctx, b, 84, y + 35, 530, { size: 12, color: ink, maxLines: 1 });
    });
    D.text(ctx, 'Siempre: GLY ≥ LEF ≥ OSE', 70, 466, { size: 20, weight: 800, color: '#3a1d0c' });
    D.paragraph(ctx, 'Convención del juego (la de los ejemplos del material): las tres métricas se calculan sobre las 12 h del turno y cada una descuenta un nivel más de pérdidas.', 70, 490, 560, { size: 13, color: '#7a5030' });

    // Regla rápida y ejemplos.
    D.text(ctx, 'REGLA RÁPIDA DEL SUPERVISOR', 670, 110, { size: 16, weight: 800, color: '#3a1d0c' });
    const rules = [
      ['GLY alto · LEF bajo · OSE bajo', 'problema externo', K.CATS.ext.color],
      ['GLY alto · LEF alto · OSE bajo', 'problema interno (de la línea)', K.CATS.int.color],
      ['GLY bajo · LEF bajo · OSE bajo', 'planificación / utilización', K.CATS.plan.color],
    ];
    rules.forEach(([a, b, c], i) => {
      D.text(ctx, a, 670, 140 + i * 26, { size: 14, weight: 700, color: ink });
      D.text(ctx, `→ ${b}`, 1210, 140 + i * 26, { size: 14, weight: 800, color: c, align: 'right' });
    });
    D.text(ctx, 'EJEMPLOS (TURNO DE 12 h)', 670, 240, { size: 16, weight: 800, color: '#3a1d0c' });
    ['', 'GLY', 'LEF', 'OSE', 'Diagnóstico'].forEach((h, i) => D.text(ctx, h, 670 + [0, 100, 190, 280, 370][i], 268, { size: 13, weight: 800, color: '#7a5030' }));
    K.EXAMPLES.forEach((ex, i) => {
      const k = K.kpis([
        { def: { cat: 'plan' }, start: 0, hours: ex.plan },
        { def: { cat: 'ext' }, start: 1, hours: ex.ext },
        { def: { cat: 'int' }, start: 4, hours: ex.int },
      ]);
      const y = 296 + i * 26;
      D.text(ctx, ex.name, 670, y, { size: 14, weight: 700, color: ink });
      [k.gly, k.lef, k.ose].forEach((v, j) => D.text(ctx, K.pct(v), 670 + [100, 190, 280][j], y, { size: 14, weight: 700, color: ink, family: D.MONO }));
      D.text(ctx, ex.diag, 1040, y, { size: 14, weight: 700, color: ink });
    });
    D.text(ctx, '¿QUÉ ESTÁ EN TU PODER?', 670, 400, { size: 16, weight: 800, color: '#3a1d0c' });
    ['int', 'ext', 'plan'].forEach((c, i) => {
      D.text(ctx, `${K.CATS[c].short}:`, 670, 428 + i * 44, { size: 14, weight: 800, color: K.CATS[c].color });
      D.paragraph(ctx, K.CATS[c].power, 770, 428 + i * 44, 440, { size: 13, color: ink, maxLines: 2 });
    });
    D.text(ctx, 'Analogía: GLY = horas que la autopista estuvo abierta · LEF = abierta sin bloqueos externos · OSE = además, con los autos a velocidad normal.', 640, 590, { size: 13, weight: 600, color: '#7a3010', align: 'center' });
    D.hints(ctx, [[CTRL.help, 'volver al juego (el turno está en pausa)']], 640, 640, { size: 15, align: 'center', ink, color: '#c4501a' });
  }

  // ------------------------------------------------------------- Reporte

  function report(s) {
    const st = s.stats;
    const score = st.max ? Math.max(0, Math.min(100, Math.round((100 * st.points) / st.max))) : 0;
    const rank = D.rankFor(score);
    const conf = Object.entries(st.confusions).sort((a, b) => b[1] - a[1])[0];
    const rows =
      s.mode === 'diag'
        ? [
            ['Diagnósticos correctos', `${st.diagOk} de ${SHIFTS}`, st.diagOk >= 5 ? T.ok : T.warn],
            ['Acciones bien dirigidas', `${st.actionOk} de ${SHIFTS}`, st.actionOk >= 5 ? T.ok : T.warn],
            ['Turnos sin respuesta', String(st.unanswered), st.unanswered ? T.red : T.ok],
            ['Llamadas para verificar', `${st.jokersUsed} de ${s.cfg.jokers}`, T.ink],
            ['Confusión más frecuente', conf ? `${conf[0]} (×${conf[1]})` : 'ninguna', conf ? T.red : T.ok],
            ['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)],
          ]
        : [
            ...['GLY', 'LEF', 'OSE'].map((kpi) => [`Aciertos ${kpi} (${K.CATS[K.KPIS[kpi].cat].short.toLowerCase()})`, `${st.items[kpi].ok} de ${st.items[kpi].total}`, st.items[kpi].ok === st.items[kpi].total ? T.ok : T.warn]),
            ['Llamadas para verificar', `${st.jokersUsed} de ${s.cfg.jokers}`, T.ink],
            ['Confusión más frecuente', conf ? `${conf[0]} (×${conf[1]})` : 'ninguna', conf ? T.red : T.ok],
            ['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)],
          ];
    const total = ['GLY', 'LEF', 'OSE'].reduce((a, k) => a + st.items[k].ok, 0);
    const n = ['GLY', 'LEF', 'OSE'].reduce((a, k) => a + st.items[k].total, 0);
    return {
      score,
      rank,
      headline: s.mode === 'diag' ? `Modo ${MODES.diag}: diagnosticaste bien ${st.diagOk} de ${SHIFTS} turnos` : `Modo ${MODES.kpi}: clasificaste bien ${total} de ${n} pérdidas`,
      rows,
      mistakes: s.bubble.log.slice(),
    };
  }

  // ------------------------------------------------------------- Menú

  function icon(ctx, cx, cy, size, t) {
    // Tres barras GLY ≥ LEF ≥ OSE.
    const vals = [0.95, 0.8 + 0.04 * Math.sin(t * 2), 0.66 + 0.05 * Math.sin(t * 2 + 1)];
    const colors = [T.ok, '#ffb347', '#ff6b5a'];
    const w = size * 0.8;
    vals.forEach((v, i) => {
      const y = cy - size * 0.3 + i * size * 0.24;
      ctx.fillStyle = '#2a2420';
      D.roundRect(ctx, cx - w / 2, y, w, size * 0.15, 5);
      ctx.fill();
      ctx.fillStyle = colors[i];
      D.roundRect(ctx, cx - w / 2, y, w * v, size * 0.15, 5);
      ctx.fill();
      D.text(ctx, ['GLY', 'LEF', 'OSE'][i], cx - w / 2 - 4, y + size * 0.12, { size: size * 0.11, weight: 800, color: T.dim, align: 'right' });
    });
  }

  PF.Admin = { MODES, SHIFTS, SHIFT_S, DIFF };
  PF.Games = PF.Games || [];
  PF.Games.push({
    id: 'admin',
    order: 6,
    title: 'Supervisor de Turno',
    subtitle: 'GLY · LEF · OSE',
    tagline: 'Administra 6 turnos: lee el tablero y descubre dónde se pierden las horas.',
    accent: ACCENT,
    padRaw: true,
    choice: {
      key: 'mode',
      title: 'MODO DE JUEGO',
      values: [
        { value: 'diag', label: 'Diagnóstico' },
        { value: 'kpi', label: '¿Qué KPI cae?' },
      ],
      index: 0,
    },
    icon,
    howTo: [
      '6 turnos de 12 h, cada uno en 20 s (2 min en total). GLY ≥ LEF ≥ OSE: cada uno descuenta más pérdidas.',
      'Diagnóstico: ¿la gran caída es de planificación, externa, interna… o el turno fue excelente? Luego, ¿con quién la atacas?',
      '¿Qué KPI cae?: al final del turno clasifica cada pérdida del reporte en GLY, LEF u OSE.',
      'Ver la línea muestra la causa real; Llamar y verificar corrige reportes dudosos (usos limitados).',
    ],
    controls: [
      ['↑ ← → ↓', 'responder (rombo)', ['y', 'x', 'b', 'a']],
      ['C', 'llamar y verificar', 'lb'],
      ['V', 'ver la línea / reportes', 'rb'],
      ['H', 'ayuda: GLY, LEF y OSE', 'select'],
    ],
    difficulties: {
      facil: ['Línea y reportes a la vista, con su tipo de pérdida', 'Regla rápida y brechas marcadas', '3 llamadas para verificar'],
      normal: ['Reportes sin verificar · alterna línea y reportes', 'Señuelos que acercan las brechas', '2 llamadas para verificar'],
      dificil: ['Reportes equivocados y la línea sin rótulos', 'Siempre hay señuelos y trampas', '1 llamada para verificar'],
    },
    create,
  });
})();
