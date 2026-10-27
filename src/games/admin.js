// Supervisor de Turno: administración del turno de envasado con LEF, GLY y OSE.
// 6 turnos: cada turno de 12 h se simula en 6 s y luego hay 30, 40 o 50 s para responder
// (se elige en la configuración, aparte de la dificultad). El juego espera la respuesta;
// solo avanza solo si se acaba ese tiempo. Dos modos:
//  · Diagnóstico de turno: lee el tablero y decide qué KPI detecta la gran caída
//    (LEF, GLY, OSE o ninguno si el turno fue excelente) y con quién atacarla.
//  · ¿Qué KPI cae?: en el reporte de fin de turno, clasifica cada pérdida por el
//    primer KPI que la detecta (LEF, GLY u OSE; o los tres si es un error de dato).
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
  const SIM_S = 6; // 12 h simuladas en 6 s
  const ANSWER_TIMES = [30, 40, 50];
  const REVEAL_S = 6; // tras agotar el tiempo, la solución se ve unos segundos y el juego sigue
  const MODES = { diag: 'Diagnóstico de turno', kpi: '¿Qué KPI cae?' };

  const DIFF = {
    facil: { decoy: 0, unverified: 0, wrong: 0, jokers: 3, tags: true, gapHints: true, lineAlways: true, colorTimeline: true, labels: true, itemsB: 3, traps: 0 },
    normal: { decoy: 0.5, unverified: 0.35, wrong: 0, jokers: 2, tags: false, gapHints: false, lineAlways: false, colorTimeline: false, labels: true, itemsB: 4, traps: 1 },
    dificil: { decoy: 1, unverified: 0.25, wrong: 0.3, jokers: 1, tags: false, gapHints: false, lineAlways: false, colorTimeline: false, labels: false, itemsB: 4, traps: 2 },
  };

  // Botones en rombo, igual que la cara del mando y en el orden LEF ≥ GLY ≥ OSE:
  // arriba LEF (△/Y), izquierda GLY (□/X), derecha OSE (○/B), abajo OK o "los tres" (✕/A).
  const SLOTS = {
    LEF: { key: '↑', pad: 'y', pos: 'top' },
    GLY: { key: '←', pad: 'x', pos: 'left' },
    OSE: { key: '→', pad: 'b', pos: 'right' },
    OK: { key: '↓', pad: 'a', pos: 'bottom' },
  };
  const SLOT_CAT = { LEF: 'int', GLY: 'pe', OSE: 'ns', OK: 'ok' };
  // Diagnóstico expresado como el KPI que detecta primero la gran caída.
  const DIAG_KPI = { int: 'LEF', pe: 'GLY', ns: 'OSE', ok: 'NINGUNO' };
  const POS_INDEX = { left: 0, top: 1, right: 2 };
  const CTRL = {
    joker: { key: 'C', pad: 'lb' },
    view: { key: 'V', pad: 'rb' },
    help: { key: 'H', pad: 'select' },
  };
  const ROWS = ['LEF', 'GLY', 'OSE'];

  const PANEL = {
    kpi: { x: 16, y: 76, w: 400, h: 562 },
    center: { x: 428, y: 76, w: 420, h: 562 },
    dec: { x: 860, y: 76, w: 404, h: 562 },
  };
  const MSG = { x: 8, y: 646, w: 1264, h: 66 };
  const MACHINES = ['Depaletizadora', 'Lavadora', 'Llenadora', 'Pasteurizador', 'Etiquetadora', 'Paletizadora'];

  // Pérdidas que pueden ocupar horas en el turno (23 y 24 son errores de dato).
  const TIMED = K.LOSSES.filter((d) => !d.noHours);
  // El diagnóstico usa los ítems de un solo KPI (1-18); los que "pueden caer en más de
  // uno" quedan como trampas del modo "¿Qué KPI cae?".
  const DIAG_POOL = TIMED.filter((d) => !d.mixed);

  // ------------------------------------------------------------- Estado

  function create(diffId = 'normal', opts = {}) {
    const cfg = DIFF[diffId] || DIFF.normal;
    const mode = MODES[opts.mode] ? opts.mode : 'diag';
    const answerTime = ANSWER_TIMES.includes(+opts.answerTime) ? +opts.answerTime : 40;
    const s = {
      id: 'admin',
      mode,
      diff: diffId,
      cfg,
      rng: D.makeRng(opts.seed),
      answerTime,
      // El reloj del HUD es el tiempo para responder del turno en curso.
      duration: answerTime,
      timeLeft: answerTime,
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
        timeouts: 0,
        jokersUsed: 0,
        items: { LEF: { ok: 0, total: 0 }, GLY: { ok: 0, total: 0 }, OSE: { ok: 0, total: 0 }, TODOS: { ok: 0, total: 0 } },
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
    const timed = losses.filter((l) => !l.def.noHours);
    const order = D.shuffle(rng, timed);
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
    // Los errores de dato no ocupan tiempo: se reportan al final del turno.
    for (const l of losses) if (l.def.noHours) l.start = K.HOURS - 0.01;
    return losses.slice().sort((a, b) => a.start - b.start);
  }

  // Reporte del operador para cada pérdida: correcto, sin verificar o equivocado.
  function makeReports(s, losses) {
    const { cfg, rng } = s;
    return losses.map((l) => {
      let status = 'ok';
      if (!l.def.base && !l.def.noHours) {
        const x = rng();
        if (x < cfg.wrong) status = 'wrong';
        else if (x < cfg.wrong + cfg.unverified) status = 'unverified';
      }
      const fake = status === 'wrong' ? pick(rng, TIMED.filter((d) => d.cat !== l.def.cat && !d.base)) : null;
      return { loss: l, status, fake, verified: false };
    });
  }

  function genDiag(s) {
    const { rng, cfg } = s;
    // Variedad: no repetir el mismo tipo tres veces seguidas.
    const types = ['ok', 'int', 'pe', 'ns', 'int', 'pe'];
    let type;
    do type = pick(rng, types);
    while (s.lastType.length >= 2 && s.lastType.slice(-2).every((x) => x === type));
    s.lastType.push(type);

    const losses = [];
    const used = new Set();
    const take = (cat, hours, id = null) => {
      const pool = DIAG_POOL.filter((d) => (id ? d.id === id : d.cat === cat && !d.base && !used.has(d.id)));
      const def = pick(rng, pool);
      used.add(def.id);
      const l = { def, hours: Math.max(0.1, round1(hours)) };
      losses.push(l);
      return l;
    };
    if (rng() < 0.85) take('pe', 0.5, 'cambio-estandar');
    const others = ['int', 'pe', 'ns'].filter((c) => c !== type);
    if (type === 'ok') {
      if (rng() < 0.7) take('int', 0.1 + rng() * 0.2);
      if (rng() < 0.4) take('pe', 0.1 + rng() * 0.2);
      // Un turno real nunca es perfecto: al menos una pérdida pequeña.
      if (!losses.length) take('int', 0.1 + rng() * 0.2);
    } else {
      const total = 1.7 + rng() * 1.1;
      const parts = type === 'int' ? 1 + rint(rng, 3) : 1 + rint(rng, 2);
      let left = total;
      for (let i = 0; i < parts; i++) {
        const h = i === parts - 1 ? left : Math.max(0.4, left * (0.35 + rng() * 0.3));
        take(type, h);
        left -= h;
      }
      // Ruido: alguna pérdida interna pequeña, casi siempre presente.
      if (type !== 'int' && rng() < 0.6) take('int', 0.1 + rng() * 0.2);
      // Señuelo: otra pérdida de tamaño medio que acerca las brechas.
      if (rng() < cfg.decoy) take(pick(rng, others), 0.6 + rng() * 0.4);
    }
    // La causa dominante debe destacar en el tablero por al menos 5 puntos.
    if (type !== 'ok') {
      for (let i = 0; i < 20; i++) {
        const g = K.gaps(K.kpis(losses.map((l) => ({ ...l, start: 0 }))));
        const second = Math.max(...others.map((c) => g[c]));
        if (g[type] >= 0.12 && g[type] - second >= 0.05) break;
        const main = losses.find((l) => l.def.cat === type);
        main.hours = round1(main.hours + 0.3);
      }
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
    // Trampas: los ítems que "pueden caer en más de un KPI" (difícil incluye los errores de dato).
    const trapPool = K.LOSSES.filter((d) => d.mixed && (s.diff === 'dificil' || !d.noHours));
    for (const def of D.shuffle(rng, trapPool).slice(0, cfg.traps)) {
      used.add(def.id);
      defs.push(def);
    }
    const cats = D.shuffle(rng, ['int', 'pe', 'ns']);
    let ci = 0;
    while (defs.length < cfg.itemsB) {
      const cat = cats[ci++ % 3];
      const pool = K.LOSSES.filter((d) => d.cat === cat && !d.mixed && !used.has(d.id));
      const def = pick(rng, pool);
      used.add(def.id);
      defs.push(def);
    }
    const losses = schedule(
      rng,
      defs.map((def) => ({ def, hours: def.noHours ? 0 : round1(0.3 + rng() * 1.2) }))
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
    Object.assign(sh, { t: 0, wait: 0, phase: 'run', ff: false, timedOut: false, doneT: 0, diag: null, action: null, clock: 0 });
    s.shift = sh;
    s.view = 'line';
    s.timeLeft = s.answerTime;
    B.clear(s.bubble);
    s.banner = D.makeBanner(
      `TURNO ${s.index + 1} DE ${SHIFTS} · 12 h en ${SIM_S} s`,
      ACCENT,
      s.mode === 'diag' ? 'Responde: ¿qué KPI detecta la caída?' : 'Al final, clasifica cada pérdida',
      1.3
    );
  }

  // Terminó la simulación de las 12 h (en diagnóstico se puede responder antes).
  function simDone(sh) {
    return sh.t >= SIM_S || sh.clock >= K.HOURS;
  }

  // El turno queda resuelto: la explicación se queda en pantalla hasta pulsar Continuar.
  function finish(s) {
    const sh = s.shift;
    sh.phase = 'done';
    sh.doneT = REVEAL_S;
    if (s.bubble.cur) s.bubble.cur.life = s.bubble.cur.max = 1e6;
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
    return sh.losses.find((l) => !l.def.noHours && sh.clock >= l.start && sh.clock < l.start + l.hours) || null;
  }

  function kpiOfCat(cat) {
    return K.CATS[cat].kpi;
  }

  // ------------------------------------------------------------- Actualización

  function update(s, dt, input) {
    if (s.over) return;
    const P = input.pressed;
    const pad = input.pad || { pressed: [] };
    const pp = pad.pressed;
    const hit = (keys, btns) => keys.some((k) => P.includes(k)) || btns.some((b) => pp.includes(b));

    const clicks = input.clicks || [];
    const tapped = (rc) => clicks.some((c) => inside(c, rc));
    // La ayuda congela el turno; se cierra con el mismo botón, B o tocando la pantalla.
    if (s.help) {
      if (hit(['help', 'cancel'], ['select', 'b']) || clicks.length) s.help = false;
      return;
    }
    if (hit(['help'], ['select']) || tapped(HELP_TAP)) {
      s.help = true;
      return;
    }

    const sh = s.shift;
    sh.t += dt;
    B.update(s.bubble, dt);
    s.floats = D.floatsUpdate(s.floats, dt);
    D.tickBanner(s, dt);
    // Reloj del turno simulado: 12 h en SIM_S segundos (acelera si respondes antes).
    const target = Math.min(K.HOURS, (sh.t / SIM_S) * K.HOURS);
    sh.clock = sh.ff ? Math.min(K.HOURS, sh.clock + dt * 18) : Math.max(sh.clock, target);

    if (sh.phase === 'done') {
      // Continuar: Enter/Espacio, ✕/A o clic en el botón. Si se agotó el tiempo, sigue solo.
      const next = hit(['confirm', 'space'], ['a']) || (input.clicks || []).some((c) => inside(c, continueRect()));
      if (sh.timedOut) sh.doneT -= dt;
      if (next || (sh.timedOut && sh.doneT <= 0)) {
        nextShift(s);
        D.sfx('blip');
      }
      return;
    }
    // El tiempo para responder corre cuando terminan las 12 h simuladas.
    if (simDone(sh)) sh.wait += dt;
    s.timeLeft = Math.max(0, s.answerTime - sh.wait);
    if (sh.wait >= s.answerTime) {
      timeout(s);
      return;
    }
    if (s.mode === 'kpi' && sh.phase === 'run' && sh.clock >= K.HOURS) {
      sh.phase = 'report';
      s.view = 'report';
      D.sfx('alarm');
    }

    if ((hit(['tab', 'view'], ['rb']) || tapped(toolRect(1))) && !s.cfg.lineAlways && sh.phase === 'run') {
      s.view = s.view === 'line' ? 'reports' : 'line';
      D.sfx('blip');
    }
    if (hit(['joker'], ['lb']) || tapped(toolRect(0))) useJoker(s);

    // Teclado: flechas o 1-4. Mando: △ □ ○ ✕ (Y X B A) o la cruceta.
    let ans = null;
    if (hit(['up', '1'], ['y', 'up'])) ans = 'LEF';
    else if (hit(['left', '2'], ['x', 'left'])) ans = 'GLY';
    else if (hit(['right', '3'], ['b', 'right'])) ans = 'OSE';
    else if (hit(['down', '4'], ['a', 'down'])) ans = 'OK';
    for (const c of input.clicks || []) {
      const slot = Object.entries(diamond()).find(([, rc]) => inside(c, rc));
      if (slot) ans = slot[0];
    }
    if (ans) answer(s, ans);
  }

  // Zonas tocables (pantallas táctiles y ratón): "ayuda" del HUD y las herramientas.
  const HELP_TAP = { x: 1170, y: 34, w: 110, h: 30 };
  function toolRect(i) {
    const rc = PANEL.dec;
    return { x: rc.x + 8, y: rc.y + 440 + i * 30, w: rc.w - 16, h: 30 };
  }

  function inside(p, rc) {
    return p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h;
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
      if (sh.phase === 'run') diagAnswer(s, SLOT_CAT[slot]);
      else if (sh.phase === 'action' && slot !== 'OK') actionAnswer(s, sh.options[POS_INDEX[SLOTS[slot].pos]]);
    } else if (sh.phase === 'report') {
      itemAnswer(s, slot === 'OK' ? 'TODOS' : slot);
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
      B.say(s.bubble, `${diagSaid(truth)} ${K.DIAG_WHY[truth]}`, { kind: 'ok', life: 8 });
      D.sfx('resolved');
    } else {
      const key = `${DIAG_KPI[cat]} en vez de ${DIAG_KPI[truth]}`;
      s.stats.confusions[key] = (s.stats.confusions[key] || 0) + 1;
      const said = cat === 'ok' ? 'No es "ninguno"' : `No es el ${DIAG_KPI[cat]}`;
      const why = diagSaid(truth);
      B.say(s.bubble, `${said}: ${why[0].toLowerCase()}${why.slice(1)} Patrón: ${d.pattern}. ${K.DIAG_WHY[truth]}`, { life: 10 });
    }
  }

  // "La gran caída la detecta el LEF (problema interno de la línea)."
  function diagSaid(type) {
    const d = K.DIAG[type];
    return type === 'ok' ? `Ningún KPI cae: ${d.label.toLowerCase()}.` : `La gran caída la detecta el ${DIAG_KPI[type]} (${d.label.toLowerCase()}).`;
  }

  function actionAnswer(s, owner) {
    const sh = s.shift;
    sh.action = owner;
    s.stats.max += 50;
    const correct = sh.owner;
    const why = sh.type === 'ok' ? 'Turno excelente: no hay pérdida grande que atacar; se estandariza lo que funcionó.' : K.CATS[sh.type].power;
    if (owner === correct) {
      s.stats.actionOk++;
      s.stats.points += 50;
      D.floatAdd(s.floats, 1062, 290, '+50', T.ok, 22);
      if (!(s.bubble.cur && s.bubble.cur.kind === 'error')) B.say(s.bubble, why, { kind: 'ok', title: 'Bien dirigido', life: 3 });
      D.sfx('blip');
    } else {
      B.say(s.bubble, `La pérdida principal se ataca con ${ownerLabel(correct)}, no con ${ownerLabel(owner)}. ${why}`);
    }
    finish(s);
  }

  function ownerLabel(o) {
    return o === 'none' ? 'nadie: estandarizar y mantener' : K.OWNERS[o];
  }

  function itemAnswer(s, kpi) {
    const sh = s.shift;
    const i = sh.cursor;
    const l = sh.losses[i];
    const truth = kpiOfCat(l.def.cat);
    sh.answers[i] = kpi;
    s.stats.max += 50;
    s.stats.items[truth].total++;
    const why = l.def.explain || K.CATS[l.def.cat].explain;
    const said = truth === 'TODOS' ? 'los tres a la vez' : truth;
    if (kpi === truth) {
      s.stats.items[truth].ok++;
      s.stats.points += 50;
      D.floatAdd(s.floats, 1062, 290, '+50', T.ok, 22);
      B.say(s.bubble, `${l.def.distort ? 'Distorsiona el LEF.' : `La detecta ${said}.`} ${why}`, { kind: 'ok', life: 4 });
      D.sfx('blip');
    } else {
      const key = `${truth} → dijiste ${kpi}`;
      s.stats.confusions[key] = (s.stats.confusions[key] || 0) + 1;
      B.say(s.bubble, `No es ${kpi === 'TODOS' ? 'de los tres' : kpi}: ${l.def.distort ? 'el que se distorsiona es el LEF' : `la detecta primero ${said}`}. ${why}`);
    }
    sh.cursor++;
    if (sh.cursor >= sh.losses.length) finish(s);
  }

  // Se acabó el tiempo para responder: lo que falta cuenta como fallo, se muestra la
  // solución unos segundos y el juego avanza solo.
  function timeout(s) {
    const sh = s.shift;
    s.stats.timeouts++;
    if (s.mode === 'diag') {
      if (sh.phase === 'run') {
        s.stats.max += 150;
        s.stats.unanswered++;
        B.say(s.bubble, `Se acabó el tiempo. ${diagSaid(sh.type)} Patrón: ${K.DIAG[sh.type].pattern}. Se ataca con ${ownerLabel(sh.owner)}.`, { kind: 'tip', title: 'Tiempo agotado' });
      } else if (sh.phase === 'action') {
        s.stats.max += 50;
        B.say(s.bubble, `Se acabó el tiempo sin elegir con quién atacarla: era con ${ownerLabel(sh.owner)}.`, { kind: 'tip', title: 'Tiempo agotado' });
      }
    } else {
      for (let i = sh.cursor; i < sh.losses.length; i++) {
        s.stats.max += 50;
        s.stats.items[kpiOfCat(sh.losses[i].def.cat)].total++;
      }
      if (sh.cursor < sh.losses.length) {
        s.stats.unanswered += sh.losses.length - sh.cursor;
        B.say(s.bubble, 'Se acabó el tiempo con pérdidas sin clasificar: cuentan como fallos. Mira la solución en el reporte.', { kind: 'tip', title: 'Tiempo agotado' });
      }
      sh.cursor = sh.losses.length;
    }
    sh.ff = true;
    finish(s);
    sh.timedOut = true;
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
      drawDecision(s, ctx, r);
    }
    D.floatsDraw(ctx, s.floats);
    // Las explicaciones son largas: si hay una, usa todo el ancho de la barra.
    B.bar(ctx, MSG, { bubble: s.bubble, notices: s.bubble.cur ? [] : [s.banner], t, split: 0.72 });
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
    if (v == null) return T.faint;
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
      if (l.def.noHours || l.start > sh.clock) continue;
      const a = x + (l.start / K.HOURS) * w;
      const b = x + (Math.min(sh.clock, l.start + l.hours) / K.HOURS) * w;
      ctx.fillStyle = showCat ? K.CATS[l.def.cat].color : '#8a7a6a';
      ctx.fillRect(a, ty, Math.max(2, b - a), 16);
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + (sh.clock / K.HOURS) * w - 1, ty - 4, 2, 24);
    D.text(ctx, showCat ? 'pérdidas por tipo' : 'pérdidas (causa sin clasificar)', x, ty + 32, { size: 11, color: T.faint });

    const k = K.kpis(sh.losses, Math.max(0.01, sh.clock));
    const showGaps = s.cfg.gapHints || revealed(s);
    // Orden LEF ≥ GLY ≥ OSE: cada barra muestra la brecha que detecta primero.
    const rows = [
      ['LEF', 'EPT / tiempo de operación (LET)', k.lef, 1, 'int'],
      ['GLY', 'EPT / tiempo programado', k.gly, k.lef ?? 1, 'pe'],
      ['OSE', 'EPT / tiempo total', k.ose, k.gly ?? k.lef ?? 1, 'ns'],
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
      if (v != null) {
        ctx.fillStyle = kpiColor(v);
        D.roundRect(ctx, bx, yb, pos(v) - bx, 24, 6);
        ctx.fill();
        // Brecha: lo que este KPI detecta respecto al anterior.
        if (showGaps && above - v > 0.002) {
          ctx.fillStyle = K.CATS[cat].color;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(pos(v), yb, pos(above) - pos(v), 24);
          ctx.globalAlpha = 1;
          D.text(ctx, `−${((above - v) * 100).toFixed(1).replace('.', ',')} pts · ${K.CATS[cat].short.toLowerCase()}`, x + w, yb + 42, { size: 12, weight: 700, color: K.CATS[cat].color, align: 'right' });
        }
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
      ['int', 'pe', 'ns'].forEach((c, i) => {
        const yy = y0 + 22 + i * 22;
        ctx.fillStyle = K.CATS[c].color;
        ctx.fillRect(x, yy - 10, 12, 12);
        D.text(ctx, `${K.CATS[c].short} → la detecta ${K.CATS[c].kpi}`, x + 20, yy, { size: 14, weight: 600 });
        D.text(ctx, fmtH(kf[c]), x + w, yy, { size: 14, weight: 700, color: K.CATS[c].color, align: 'right', family: D.MONO });
      });
      D.text(ctx, 'Mismo numerador (EPT) → LEF ≥ GLY ≥ OSE', x, y0 + 100, { size: 11, color: T.faint });
    } else if (s.cfg.gapHints && s.mode === 'diag') {
      D.text(ctx, 'REGLA RÁPIDA', x, y0, { size: 12, weight: 800, color: T.dim });
      const rules = [
        ['LEF bajo (arrastra a GLY y OSE)', 'interno', K.CATS.int.color],
        ['LEF alto · GLY bajo', 'planificada / externa', K.CATS.pe.color],
        ['LEF y GLY altos · OSE bajo', 'sin programar', K.CATS.ns.color],
        ['todo alto (≥ 90 %)', 'excelente', T.ok],
      ];
      rules.forEach(([a, b, c], i) => {
        D.text(ctx, a, x, y0 + 22 + i * 21, { size: 13, weight: 600 });
        D.text(ctx, `→ ${b}`, x + w, y0 + 22 + i * 21, { size: 13, weight: 800, color: c, align: 'right' });
      });
    } else {
      D.text(ctx, 'LEF ≥ GLY ≥ OSE', x, y0 + 20, { size: 20, weight: 800, color: T.ink });
      D.paragraph(ctx, 'Mismo numerador (EPT), distinto denominador. Busca la brecha más grande: LEF = interna · LEF→GLY = planificada o externa · GLY→OSE = sin programar.', x, y0 + 46, w, { size: 13, color: T.dim });
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
    if (s.cfg.wrong > 0 && !rep.loss.def.base && !rep.loss.def.noHours) return ['? reporte de operador', T.warn];
    return null;
  }

  function drawReports(s, ctx, rc) {
    const sh = s.shift;
    const list = sh.reports.filter((r) => !r.loss.def.noHours && r.loss.start <= sh.clock);
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
      const full = reportText(s, rep);
      let txt = full;
      while (ctx.measureText(txt).width > rc.w - 130 && txt.length > 4) txt = txt.slice(0, -2);
      if (txt !== full) txt += '…';
      D.text(ctx, txt, rc.x + 62, y + 17, { size: 14, weight: 700, color: known ? T.ink : '#ffd9a8' });
      const badge = reportBadge(s, rep);
      if (rep.verified && rep.status === 'wrong') {
        ctx.font = D.font(11, 600);
        let said = `reportado: ${rep.fake.name}`;
        while (ctx.measureText(said).width > rc.w - 200 && said.length > 12) said = said.slice(0, -2);
        D.text(ctx, said.length < `reportado: ${rep.fake.name}`.length ? said + '…' : said, rc.x + 62, y + 34, { size: 11, color: T.red });
      }
      else if (tagged(s)) D.text(ctx, `${K.CATS[l.def.cat].name} → ${K.CATS[l.def.cat].kpi}`, rc.x + 62, y + 34, { size: 11, color: K.CATS[l.def.cat].color });
      if (badge) D.text(ctx, badge[0], rc.x + rc.w - 10, y + 34, { size: 11, weight: 700, color: badge[1], align: 'right' });
    });
  }

  // Vista de la línea: máquinas, botellas y la causa real de la pérdida en curso.
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
    // Sin programar (o sin gente): la línea está apagada.
    const dark = cat === 'ns' || vis === 'nostaff';
    // Las pérdidas de velocidad y rechazo no paran la línea.
    const flowing = !loss || vis === 'slow' || vis === 'reject';
    const cy = my + mh + 26;
    ctx.fillStyle = '#2b2320';
    ctx.fillRect(rc.x + 10, cy, rc.w - 20, 10);
    const speed = !loss ? 60 : vis === 'slow' ? 18 : flowing ? 45 : 0;
    const emptyIn = vis === 'material' || vis === 'beer';
    for (let i = 0; i < 18; i++) {
      let bx = rc.x + 14 + ((i * 22 + t * speed) % (rc.w - 30));
      if (emptyIn && bx < rc.x + rc.w * 0.45) continue;
      if (vis === 'jam' && i % 3 === 0) bx += 4;
      ctx.fillStyle = dark ? '#3a3230' : vis === 'reject' && i % 5 === 0 ? T.red : '#c98a2a';
      ctx.fillRect(bx, cy - 10 + ((vis === 'jam' || vis === 'micro') && i % 4 === 0 ? -6 : 0), 7, 10);
    }
    MACHINES.forEach((name, i) => {
      const x = rc.x + 10 + i * (mw + 6);
      const hitHere = loss && (loss.def.machine === i || loss.def.machine === -1);
      let fill = dark ? '#1c1715' : '#3b3431';
      let edge = '#0d0807';
      if (hitHere && !dark) {
        const blink = Math.floor(t * 4) % 2 === 0;
        fill = cat === 'int' ? (blink ? '#6a1d16' : '#3b1a16') : '#4a3416';
        edge = color;
      }
      ctx.fillStyle = fill;
      D.roundRect(ctx, x, my, mw, mh, 6);
      ctx.fill();
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = !loss ? T.ok : hitHere ? color : dark ? '#3a3230' : flowing ? T.ok : T.warn;
      ctx.beginPath();
      ctx.arc(x + mw / 2, my + 14, 6, 0, Math.PI * 2);
      ctx.fill();
      D.text(ctx, name.slice(0, 7) + (name.length > 7 ? '.' : ''), x + mw / 2, my + mh - 10, { size: 10, weight: 700, color: T.dim, align: 'center' });
      if (hitHere && !dark) drawCause(ctx, vis, x + mw / 2, my + 38, color, t);
    });
    // Rótulo de estado (en difícil solo el color y la animación).
    let label = 'LÍNEA PRODUCIENDO';
    if (loss) label = s.cfg.labels ? loss.def.name.toUpperCase() : cat === 'int' ? 'ALARMA EN LA LÍNEA' : cat === 'pe' ? 'PARADA · PLANIFICADA O ESPERANDO' : 'LÍNEA SIN PROGRAMAR';
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
      D.text(ctx, loss ? `Desde las ${clockLabel(loss.start)} · ${fmtH(Math.max(0, sh.clock - loss.start))}` : 'Sin pérdidas en este momento', rc.x + rc.w / 2, cy + 44, { size: 13, color: T.dim, align: 'center' });
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
    if (vis === 'breakdown' || vis === 'adjust' || vis === 'changeover' || vis === 'pm' || vis === 'project') {
      // Llave inglesa (con reloj si es ajuste o exceso).
      ctx.rotate(-0.6 + Math.sin(t * 6) * 0.2);
      ctx.fillRect(-3, -2, 6, 18);
      ctx.beginPath();
      ctx.arc(0, -6, 8, Math.PI * 0.2, Math.PI * 1.8);
      ctx.stroke();
      if (vis === 'adjust') {
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
    } else if (vis === 'reject') {
      D.text(ctx, '✖', 0, 8 + bob, { size: 20, weight: 800, color, align: 'center' });
    } else if (vis === 'material') {
      // Camión: falta material de envase.
      ctx.fillRect(-12, -6 + bob, 18, 12);
      ctx.fillRect(6, -2 + bob, 7, 8);
      ctx.fillStyle = '#140c09';
      ctx.beginPath();
      ctx.arc(-6, 7 + bob, 3, 0, Math.PI * 2);
      ctx.arc(8, 7 + bob, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (vis === 'beer') {
      // Tanque de cerveza vacío.
      D.roundRect(ctx, -9, -13, 18, 26, 6);
      ctx.stroke();
      ctx.fillRect(-6, 6, 12, 4);
    } else if (vis === 'utility') {
      D.roundRect(ctx, -6, -12, 12, 24, 5);
      ctx.fill();
    } else if (vis === 'cip') {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(-8 + i * 6, -6 + ((t * 20 + i * 7) % 16), 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (vis === 'nostaff') {
      // Persona ausente.
      ctx.beginPath();
      ctx.arc(0, -8, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-8, 12);
      ctx.quadraticCurveTo(0, -2, 8, 12);
      ctx.stroke();
    } else {
      // Sin programar / aguas arriba: calendario.
      ctx.strokeRect(-12, -10, 24, 20);
      ctx.fillRect(-12, -10, 24, 6);
      if (vis === 'upstream') D.text(ctx, '!', 0, 9, { size: 13, weight: 800, color, align: 'center' });
    }
    ctx.restore();
  }

  function drawEndReport(s, ctx) {
    const rc = PANEL.center;
    const sh = s.shift;
    panelTitle(ctx, rc, 'REPORTE DE FIN DE TURNO', 'lo que falló');
    D.text(ctx, '¿Qué KPI la detecta primero?', rc.x + 16, rc.y + 58, { size: 16, weight: 800, color: ACCENT });
    sh.losses.forEach((l, i) => {
      const rep = sh.reports[i];
      const y = rc.y + 74 + i * 84;
      const cur = sh.phase === 'report' && i === sh.cursor;
      const ans = sh.answers[i];
      const truth = kpiOfCat(l.def.cat);
      D.panel(ctx, rc.x + 10, y, rc.w - 20, 76, { fill: cur ? '#16262c' : '#1a1412', edge: cur ? ACCENT : '#2e2420', radius: 8, glow: cur ? ACCENT : null });
      if (cur) D.text(ctx, '▶', rc.x + 22, y + 30, { size: 16, weight: 800, color: ACCENT });
      ctx.font = D.font(15, 700);
      const lines = D.wrap(ctx, reportText(s, rep), rc.w - 150).slice(0, 2);
      lines.forEach((ln, j) => D.text(ctx, ln, rc.x + 40, y + 24 + j * 18, { size: 15, weight: 700, color: rep.verified || rep.status === 'ok' ? T.ink : '#ffd9a8' }));
      D.text(ctx, l.def.noHours ? 'dato' : fmtH(l.hours), rc.x + 40, y + 66, { size: 12, color: T.dim, family: D.MONO });
      const badge = reportBadge(s, rep);
      if (badge) D.text(ctx, badge[0], rc.x + 100, y + 66, { size: 11, weight: 700, color: badge[1] });
      // Respuesta.
      const ax = rc.x + rc.w - 70;
      if (ans) {
        const ok = ans === truth;
        D.panel(ctx, ax - 10, y + 12, 66, 52, { fill: ok ? T.okDark : '#4a1410', edge: ok ? T.ok : T.red, radius: 8 });
        D.text(ctx, `${ok ? '✔' : '✖'} ${ans === 'TODOS' ? '3' : ans}`, ax + 23, y + 34, { size: 15, weight: 800, color: ok ? T.ok : T.red, align: 'center' });
        if (!ok) D.text(ctx, `era ${truth === 'TODOS' ? 'los 3' : truth}`, ax + 23, y + 54, { size: 12, weight: 700, color: T.ink, align: 'center' });
      } else if (sh.phase === 'done') {
        // Sin responder (se agotó el tiempo): se muestra la solución.
        D.panel(ctx, ax - 10, y + 12, 66, 52, { fill: '#2a2018', edge: T.warn, radius: 8 });
        D.text(ctx, '⏱', ax + 23, y + 34, { size: 15, weight: 800, color: T.warn, align: 'center' });
        D.text(ctx, `era ${truth === 'TODOS' ? 'los 3' : truth}`, ax + 23, y + 54, { size: 12, weight: 700, color: T.ink, align: 'center' });
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
      LEF: { x: cx - w / 2, y: cy - h - 40, w, h },
      GLY: { x: rc.x + 14, y: cy - h / 2, w, h },
      OSE: { x: rc.x + rc.w - 14 - w, y: cy - h / 2, w, h },
      OK: { x: cx - w / 2, y: cy + 40, w, h },
    };
  }

  function slotLabels(s) {
    const sh = s.shift;
    if (s.mode === 'kpi') {
      return {
        LEF: ['LEF', 'interna de la línea', K.CATS.int.color],
        GLY: ['GLY', 'planificada o externa', K.CATS.pe.color],
        OSE: ['OSE', 'no programada', K.CATS.ns.color],
        OK: ['LOS TRES', 'error de dato', K.CATS.all.color],
      };
    }
    if (sh.phase === 'run' || (sh.phase === 'done' && !sh.diag)) {
      // ¿Qué KPI detecta la gran caída? El subtítulo recuerda el patrón.
      return {
        LEF: ['LEF', 'cae el LEF y arrastra', K.CATS.int.color],
        GLY: ['GLY', 'LEF alto · GLY bajo', K.CATS.pe.color],
        OSE: ['OSE', 'LEF y GLY altos · OSE bajo', K.CATS.ns.color],
        OK: ['NINGUNO', 'turno excelente (≥ 90 %)', T.ok],
      };
    }
    // Acción: con quién se ataca la pérdida principal (izquierda, arriba, derecha).
    const lab = (o) => (o === 'none' ? ['ESTANDARIZAR', 'y mantener lo que funcionó', T.ok] : [ownerShort(o), ownerHint(o), ACCENT]);
    const out = {};
    for (const [slot, def] of Object.entries(SLOTS)) if (def.pos in POS_INDEX) out[slot] = lab(sh.options[POS_INDEX[def.pos]]);
    return out;
  }

  function ownerShort(o) {
    return { mantenimiento: 'MANTENIMIENTO', operacion: 'OPERACIÓN', smed: 'EQUIPO SMED', calidad: 'CALIDAD', abastecimiento: 'ABASTECIMIENTO', elaboracion: 'ELABORACIÓN', utilities: 'UTILITIES', planificacion: 'PLANIFICACIÓN' }[o];
  }

  function ownerHint(o) {
    return {
      mantenimiento: 'fallas y preventivos',
      operacion: 'en el poder de la línea',
      smed: 'cambios de formato más cortos',
      calidad: 'frecuencia y duración del CIP',
      abastecimiento: 'materiales de envase',
      elaboracion: 'filtración, bodega, cocimiento',
      utilities: 'energía, vapor, CO₂, aire',
      planificacion: 'programa, ventas y capacidad',
    }[o];
  }

  function drawDecision(s, ctx, r) {
    const rc = PANEL.dec;
    const sh = s.shift;
    let title = s.mode === 'kpi' ? '¿QUÉ KPI LA DETECTA?' : sh.phase === 'run' ? '¿QUÉ KPI DETECTA LA CAÍDA?' : '¿CON QUIÉN LA ATACAS?';
    if (sh.phase === 'done') title = 'RESULTADO DEL TURNO';
    panelTitle(ctx, rc, title);
    let help = '';
    if (s.mode === 'diag') help = sh.phase === 'run' ? 'Elige el KPI que detecta primero la gran caída, o NINGUNO si el turno fue excelente.' : sh.phase === 'action' ? 'Elige con quién atacar la pérdida principal.' : '';
    else help = sh.phase === 'run' ? 'Observa la línea: el reporte llega al final del turno.' : sh.phase === 'report' ? 'Clasifica la pérdida marcada: ¿qué KPI la detecta primero?' : '';
    if (help) D.paragraph(ctx, help, rc.x + 16, rc.y + 56, rc.w - 32, { size: 13, color: T.dim });

    const labels = slotLabels(s);
    const active = (s.mode === 'diag' && (sh.phase === 'run' || sh.phase === 'action')) || (s.mode === 'kpi' && sh.phase === 'report');
    for (const [slot, rcB] of Object.entries(diamond())) {
      const lab = labels[slot];
      if (!lab) continue;
      D.panel(ctx, rcB.x, rcB.y, rcB.w, rcB.h, { fill: '#1a1412', edge: active ? lab[2] : '#2e2420', radius: 10, glow: active ? lab[2] : null });
      ctx.globalAlpha = active ? 1 : 0.45;
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
      const none = !sh.diag;
      const d = K.DIAG[sh.type];
      const y = rc.y + 330;
      const edge = ok ? T.ok : none ? T.warn : T.red;
      D.panel(ctx, rc.x + 14, y, rc.w - 28, 74, { fill: ok ? T.okDark : none ? '#2a2018' : '#3a1410', edge, radius: 10 });
      D.text(ctx, ok ? '✔ DIAGNÓSTICO CORRECTO' : none ? '⏱ SIN RESPUESTA A TIEMPO' : '✖ DIAGNÓSTICO INCORRECTO', rc.x + 28, y + 26, { size: 16, weight: 800, color: edge });
      D.text(ctx, `Era: ${DIAG_KPI[sh.type]} · ${d.label}`, rc.x + 28, y + 48, { size: 14, weight: 700, color: d.color });
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
    // Pie: simulación, tiempo para responder o Continuar.
    if (sh.phase === 'done') {
      const b = continueRect();
      const pulse = 0.8 + 0.2 * Math.sin(r.t * 5);
      D.panel(ctx, b.x, b.y, b.w, b.h, { fill: ACCENT, edge: ACCENT, radius: 10, glow: pulse > 0.9 ? ACCENT : null });
      const last = s.index + 1 >= SHIFTS;
      const label = last ? 'VER REPORTE FINAL' : 'CONTINUAR';
      const w = D.control(ctx, { key: 'ENTER', pad: 'a' }, b.x + 12, b.y + b.h / 2, { size: 13, color: '#0e1a1e', keyInk: ACCENT });
      D.text(ctx, label, b.x + w + 24, b.y + 27, { size: 17, weight: 800, color: '#0e1a1e' });
      if (sh.timedOut) D.text(ctx, `sigue solo en ${Math.ceil(Math.max(0, sh.doneT))} s`, b.x + b.w - 12, b.y + 26, { size: 12, weight: 700, color: '#0e1a1e', align: 'right' });
    } else if (!simDone(sh)) {
      D.text(ctx, `Turno en marcha: 12 h en ${SIM_S} s · luego tienes ${s.answerTime} s`, rc.x + 16, rc.y + rc.h - 22, { size: 13, weight: 700, color: T.dim });
      D.progressBar(ctx, rc.x + 16, rc.y + rc.h - 14, rc.w - 32, 6, sh.clock / K.HOURS, '#6e5a48');
    } else {
      const left = Math.max(0, s.answerTime - sh.wait);
      const low = left <= 10;
      D.text(ctx, `Tiempo para responder: ${Math.ceil(left)} s`, rc.x + 16, rc.y + rc.h - 22, { size: 13, weight: 700, color: low ? T.red : T.dim });
      D.progressBar(ctx, rc.x + 16, rc.y + rc.h - 14, rc.w - 32, 6, left / s.answerTime, low ? T.red : ACCENT);
    }
  }

  function continueRect() {
    const rc = PANEL.dec;
    return { x: rc.x + 16, y: rc.y + rc.h - 50, w: rc.w - 32, h: 40 };
  }

  function drawHelp(ctx) {
    ctx.fillStyle = 'rgba(8,4,3,0.9)';
    ctx.fillRect(0, 0, D.VIEW.width, D.VIEW.height);
    D.panel(ctx, 40, 30, 1200, 660, { fill: '#f2e3c6', edge: T.brass, radius: 12 });
    const ink = '#2a170d';
    D.text(ctx, 'LEF, GLY Y OSE: MISMO NUMERADOR, DISTINTO DENOMINADOR', 70, 72, { size: 24, weight: 800, color: '#3a1d0c' });
    // Árbol de tiempos.
    const boxes = [
      ['TIEMPO TOTAL', 'el calendario completo → denominador del OSE', '#7a5030'],
      ['− no programado', 'demanda menor, turnos apagados, portafolio, aguas arriba, overhaul, feriados', K.CATS.ns.color],
      ['TIEMPO PROGRAMADO', 'denominador del GLY', '#3a1d0c'],
      ['− planificadas y externas', 'cambios dentro del estándar, CIP, preventivo · cerveza, materiales, servicios', K.CATS.pe.color],
      ['LET · TIEMPO DE OPERACIÓN', 'denominador del LEF', '#3a1d0c'],
      ['− internas de la línea', 'fallas, microparadas, velocidad, rechazos, balance, ajustes', K.CATS.int.color],
      ['EPT · PRODUCCIÓN EFECTIVA', 'numerador común de los tres KPIs', '#3a1d0c'],
    ];
    boxes.forEach(([a, b, c], i) => {
      const y = 92 + i * 50;
      const strong = i % 2 === 0;
      D.panel(ctx, 70, y, 560, 42, { fill: strong ? '#fff4e2' : '#f7ead4', edge: c, radius: 8 });
      D.text(ctx, a, 84, y + 19, { size: strong ? 17 : 15, weight: 800, color: c });
      D.paragraph(ctx, b, 84, y + 35, 530, { size: 12, color: ink, maxLines: 1 });
    });
    D.text(ctx, 'LEF = EPT / LET  ·  GLY = EPT / programado  ·  OSE = EPT / total', 70, 458, { size: 15, weight: 800, color: '#3a1d0c' });
    D.text(ctx, 'Siempre: LEF ≥ GLY ≥ OSE', 70, 484, { size: 20, weight: 800, color: '#3a1d0c' });
    D.paragraph(ctx, 'Toda pérdida que baja el EPT baja los tres KPIs: lo que cambia es cuál la detecta primero. Ninguna pérdida interna afecta "solo al LEF".', 70, 508, 560, { size: 13, color: '#7a5030' });

    D.text(ctx, 'REGLA RÁPIDA DEL SUPERVISOR', 670, 104, { size: 16, weight: 800, color: '#3a1d0c' });
    const rules = [
      ['LEF bajo (arrastra a GLY y OSE)', 'problema interno', K.CATS.int.color],
      ['LEF alto · GLY bajo', 'planificadas o externas', K.CATS.pe.color],
      ['LEF y GLY altos · OSE bajo', 'capacidad sin programar', K.CATS.ns.color],
    ];
    rules.forEach(([a, b, c], i) => {
      D.text(ctx, a, 670, 132 + i * 24, { size: 14, weight: 700, color: ink });
      D.text(ctx, `→ ${b}`, 1210, 132 + i * 24, { size: 14, weight: 800, color: c, align: 'right' });
    });
    D.text(ctx, 'EJEMPLOS (TURNO DE 12 h)', 670, 222, { size: 16, weight: 800, color: '#3a1d0c' });
    ['', 'LEF', 'GLY', 'OSE', 'Diagnóstico'].forEach((h, i) => D.text(ctx, h, 670 + [0, 90, 180, 270, 360][i], 248, { size: 13, weight: 800, color: '#7a5030' }));
    K.EXAMPLES.forEach((ex, i) => {
      const k = K.kpis([
        { def: { cat: 'ns' }, start: 0, hours: ex.ns },
        { def: { cat: 'pe' }, start: 4, hours: ex.pe },
        { def: { cat: 'int' }, start: 8, hours: ex.int },
      ]);
      const y = 274 + i * 24;
      D.text(ctx, ex.name, 670, y, { size: 14, weight: 700, color: ink });
      [k.lef, k.gly, k.ose].forEach((v, j) => D.text(ctx, K.pct(v), 670 + [90, 180, 270][j], y, { size: 14, weight: 700, color: ink, family: D.MONO }));
      D.text(ctx, ex.diag, 1030, y, { size: 14, weight: 700, color: ink });
    });
    D.text(ctx, '¿QUÉ ESTÁ EN TU PODER?', 670, 392, { size: 16, weight: 800, color: '#3a1d0c' });
    ['int', 'pe', 'ns'].forEach((c, i) => {
      D.text(ctx, `${K.CATS[c].kpi}:`, 670, 418 + i * 44, { size: 14, weight: 800, color: K.CATS[c].color });
      D.paragraph(ctx, K.CATS[c].power, 720, 418 + i * 44, 490, { size: 13, color: ink, maxLines: 2 });
    });
    D.paragraph(ctx, 'Ojo con los datos: una velocidad nominal mal configurada infla o desinfla los tres KPIs; una falla interna registrada como externa sube el LEF artificialmente sin cambiar el GLY.', 670, 556, 540, { size: 13, weight: 600, color: '#7a3010', maxLines: 3 });
    D.hints(ctx, [[CTRL.help, 'volver al juego (el turno está en pausa)']], 640, 650, { size: 15, align: 'center', ink, color: '#c4501a' });
  }

  // ------------------------------------------------------------- Reporte

  function report(s) {
    const st = s.stats;
    const score = st.max ? Math.max(0, Math.min(100, Math.round((100 * st.points) / st.max))) : 0;
    const rank = D.rankFor(score);
    const conf = Object.entries(st.confusions).sort((a, b) => b[1] - a[1])[0];
    const kpiRows = ['LEF', 'GLY', 'OSE', 'TODOS']
      .filter((k) => k !== 'TODOS' || st.items.TODOS.total > 0)
      .map((kpi) => {
        const label = kpi === 'TODOS' ? 'Aciertos "los tres" (error de dato)' : `Aciertos ${kpi} (${K.CATS[K.KPIS[kpi].cat].short.toLowerCase()})`;
        return [label, `${st.items[kpi].ok} de ${st.items[kpi].total}`, st.items[kpi].ok === st.items[kpi].total ? T.ok : T.warn];
      });
    const rows =
      s.mode === 'diag'
        ? [
            ['Diagnósticos correctos', `${st.diagOk} de ${SHIFTS}`, st.diagOk >= 5 ? T.ok : T.warn],
            ['Acciones bien dirigidas', `${st.actionOk} de ${SHIFTS}`, st.actionOk >= 5 ? T.ok : T.warn],
            ['Turnos con tiempo agotado', `${st.timeouts} de ${SHIFTS} (${s.answerTime} s)`, st.timeouts ? T.red : T.ok],
            ['Llamadas para verificar', `${st.jokersUsed} de ${s.cfg.jokers}`, T.ink],
            ['Confusión más frecuente', conf ? `${conf[0]} (×${conf[1]})` : 'ninguna', conf ? T.red : T.ok],
            ['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)],
          ]
        : [
            ...kpiRows,
            ['Turnos con tiempo agotado', `${st.timeouts} de ${SHIFTS} (${s.answerTime} s)`, st.timeouts ? T.red : T.ok],
            ['Llamadas para verificar', `${st.jokersUsed} de ${s.cfg.jokers}`, T.ink],
            ['Confusión más frecuente', conf ? `${conf[0]} (×${conf[1]})` : 'ninguna', conf ? T.red : T.ok],
            ['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)],
          ];
    const keys = Object.keys(st.items);
    const total = keys.reduce((a, k) => a + st.items[k].ok, 0);
    const n = keys.reduce((a, k) => a + st.items[k].total, 0);
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
    // Tres barras LEF ≥ GLY ≥ OSE.
    const vals = [0.95, 0.8 + 0.04 * Math.sin(t * 2), 0.66 + 0.05 * Math.sin(t * 2 + 1)];
    const colors = [T.ok, '#ffb347', '#b48cff'];
    const w = size * 0.8;
    vals.forEach((v, i) => {
      const y = cy - size * 0.3 + i * size * 0.24;
      ctx.fillStyle = '#2a2420';
      D.roundRect(ctx, cx - w / 2, y, w, size * 0.15, 5);
      ctx.fill();
      ctx.fillStyle = colors[i];
      D.roundRect(ctx, cx - w / 2, y, w * v, size * 0.15, 5);
      ctx.fill();
      D.text(ctx, ROWS[i], cx - w / 2 - 4, y + size * 0.12, { size: size * 0.11, weight: 800, color: T.dim, align: 'right' });
    });
  }

  PF.Admin = { MODES, SHIFTS, SIM_S, ANSWER_TIMES, REVEAL_S, DIFF, SLOTS };
  PF.Games = PF.Games || [];
  PF.Games.push({
    id: 'admin',
    order: 6,
    title: 'Supervisor de Turno',
    subtitle: 'LEF · GLY · OSE',
    tagline: 'Administra 6 turnos: lee el tablero y descubre dónde se pierden las horas.',
    accent: ACCENT,
    padRaw: true,
    choices: [
      {
        key: 'mode',
        title: 'MODO DE JUEGO',
        values: [
          { value: 'diag', label: 'Diagnóstico' },
          { value: 'kpi', label: '¿Qué KPI cae?' },
        ],
        index: 0,
      },
      // Independiente de la dificultad: el juego no es de reflejos.
      { key: 'answerTime', title: 'TIEMPO PARA RESPONDER', values: ANSWER_TIMES.map((v) => ({ value: v, label: `${v} s` })), index: 1 },
    ],
    icon,
    howTo: [
      '6 turnos de 12 h simulados en 6 s; luego tienes 30, 40 o 50 s para responder (tú eliges). Tras cada turno, lee la explicación y pulsa Continuar.',
      'Diagnóstico: ¿qué KPI detecta la gran caída: LEF, GLY, OSE… o ninguno (turno excelente)? Luego, ¿con quién la atacas?',
      '¿Qué KPI cae?: al final del turno clasifica cada pérdida del reporte por el KPI que la detecta primero.',
      'Ver la línea muestra la causa real; Llamar y verificar corrige reportes dudosos (usos limitados).',
    ],
    // Táctil: se toca directamente el rombo, las herramientas y la ayuda.
    touch: { stick: false, main: [], aux: [] },
    controls: [
      ['↑ ← → ↓', 'responder (rombo)', ['y', 'x', 'b', 'a']],
      ['C', 'llamar y verificar', 'lb'],
      ['V', 'ver la línea / reportes', 'rb'],
      ['H', 'ayuda: LEF, GLY y OSE', 'select'],
    ],
    difficulties: {
      facil: ['Línea y reportes a la vista, con su tipo de pérdida', 'Regla rápida y brechas marcadas', '3 llamadas para verificar'],
      normal: ['Reportes sin verificar · alterna línea y reportes', 'Señuelos y casos que caen en más de un KPI', '2 llamadas para verificar'],
      dificil: ['Reportes equivocados y la línea sin rótulos', 'Más trampas, incluidos errores de dato', '1 llamada para verificar'],
    },
    create,
  });
})();
