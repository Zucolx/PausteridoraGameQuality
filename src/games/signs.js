// Pictograma Correcto: respuestas rápidas de seguridad. Se muestra una escena de la planta
// y hay que elegir el pictograma de advertencia que le corresponde. Máximo 3 preguntas.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const B = PF.Bubble;
  const T = D.T;
  const ACCENT = '#f7c600';
  const QUESTIONS = 3;
  const FEEDBACK_S = 3.2; // tras responder, la explicación se ve unos segundos (se puede saltar)

  // Señales del material de la planta: texto del letrero, de qué advierte y qué hacer.
  const SIGNS = {
    particulas: {
      name: 'Proyección de partículas',
      label: '¡Atención! Riesgo de proyección de partículas',
      warns: 'advierte de fragmentos o partículas que salen despedidos',
      why: 'Una botella que estalla lanza vidrio a su alrededor: es proyección de partículas. Usa lentes de seguridad y respeta las guardas.',
      scene: 'Una botella estalla en la línea y lanza vidrio',
    },
    atrapamiento: {
      name: 'Riesgo de atrapamiento',
      label: '¡Atención! Riesgo de atrapamiento',
      warns: 'advierte de partes móviles que pueden atrapar manos, ropa o cabello',
      why: 'Cadenas, piñones y transportadores en marcha pueden atrapar manos, ropa o cabello: no metas las manos ni retires guardas con la máquina en movimiento.',
      scene: 'Cadenas, piñones y transportador en movimiento',
    },
    tropiezo: {
      name: 'Riesgo de tropezar',
      label: '¡Atención! Riesgo de tropezar',
      warns: 'advierte de tropiezos, resbalones y caídas al mismo nivel',
      why: 'Un piso mojado o con obstáculos provoca tropiezos y caídas: camina con cuidado, señaliza la zona y avisa para que se limpie.',
      scene: 'Piso mojado en el pasillo de la línea',
    },
    electrico: {
      name: 'Riesgo eléctrico',
      label: 'Riesgo eléctrico',
      warns: 'advierte de partes con tensión eléctrica',
      why: 'Un tablero abierto tiene partes con tensión: solo lo interviene personal autorizado, con el tablero bloqueado y sin energía.',
      scene: 'Tablero eléctrico abierto',
    },
    maquinaria: {
      name: 'Maquinaria en funcionamiento',
      label: 'Peligro: maquinaria en funcionamiento',
      warns: 'advierte de vehículos y máquinas en movimiento, como montacargas',
      why: 'Por el patio circulan montacargas: respeta el semáforo y los pasos peatonales, y mantén distancia de la máquina en movimiento.',
      scene: 'Montacargas circulando en el patio',
    },
  };
  const IDS = Object.keys(SIGNS);

  const DIFF = {
    facil: { options: 3, time: 12, labels: true, caption: true },
    normal: { options: 4, time: 8, labels: false, caption: true },
    dificil: { options: 5, time: 6, labels: false, caption: false },
  };

  const SCENE = { x: 16, y: 76, w: 620, h: 562 };
  const RIGHT = { x: 652, y: 76, w: 612, h: 562 };
  const MSG = { x: 8, y: 646, w: 1264, h: 66 };
  const CTRL = { move: { key: '← →', pad: 'dpadLR' }, pick: { key: 'ENTER', pad: 'a' } };

  // ------------------------------------------------------------- Estado

  function create(diffId = 'normal', opts = {}) {
    const cfg = DIFF[diffId] || DIFF.normal;
    const rng = D.makeRng(opts.seed);
    const order = D.shuffle(rng, IDS).slice(0, QUESTIONS);
    const s = {
      id: 'signs',
      diff: diffId,
      cfg,
      rng,
      order,
      q: -1,
      options: [],
      sel: 0,
      phase: 'ask',
      fbT: 0,
      qTime: cfg.time,
      duration: cfg.time,
      timeLeft: cfg.time,
      over: false,
      answers: [],
      bubble: B.create(),
      floats: [],
      banner: null,
      stats: { points: 0, correct: 0, timeouts: 0, time: 0 },
    };
    next(s);
    s.update = (dt, input) => update(s, dt, input);
    s.draw = (r) => draw(s, r);
    s.report = () => report(s);
    return s;
  }

  // Opciones: la correcta y otras al azar (todas distintas), en orden aleatorio.
  function optionsFor(s, id) {
    const others = D.shuffle(
      s.rng,
      IDS.filter((x) => x !== id)
    ).slice(0, s.cfg.options - 1);
    return D.shuffle(s.rng, [id, ...others]);
  }

  function next(s) {
    s.q++;
    if (s.q >= s.order.length) {
      s.over = true;
      return;
    }
    const id = s.order[s.q];
    s.options = optionsFor(s, id);
    s.sel = 0;
    s.phase = 'ask';
    s.qTime = s.cfg.time;
    s.timeLeft = s.cfg.time;
    B.clear(s.bubble);
    s.banner = D.makeBanner(`PREGUNTA ${s.q + 1} DE ${s.order.length}`, ACCENT, '¿Qué pictograma corresponde a la imagen?', 1.2);
  }

  // ------------------------------------------------------------- Actualización

  function update(s, dt, input) {
    if (s.over) return;
    const P = input.pressed || [];
    const pp = (input.pad && input.pad.pressed) || [];
    const hit = (keys, btns) => keys.some((k) => P.includes(k)) || btns.some((b) => pp.includes(b));
    const clicks = input.clicks || [];
    B.update(s.bubble, dt);
    s.floats = D.floatsUpdate(s.floats, dt);
    D.tickBanner(s, dt);

    if (s.phase === 'feedback') {
      s.fbT -= dt;
      if (s.fbT <= 0 || hit(['confirm', 'space', 'interact'], ['a']) || clicks.length) next(s);
      return;
    }

    s.qTime = Math.max(0, s.qTime - dt);
    s.timeLeft = s.qTime;
    if (s.qTime <= 0) return answer(s, null);

    const n = s.options.length;
    const cols = columns(n);
    if (hit(['left'], ['left', 'lsLeft'])) s.sel = (s.sel + n - 1) % n;
    if (hit(['right'], ['right', 'lsRight'])) s.sel = (s.sel + 1) % n;
    if (hit(['up'], ['up', 'lsUp']) && s.sel - cols >= 0) s.sel -= cols;
    if (hit(['down'], ['down', 'lsDown']) && s.sel + cols < n) s.sel += cols;
    if (input.mouse && input.mouse.moved) {
      const i = cards(n).findIndex((c) => inside(input.mouse, c));
      if (i >= 0) s.sel = i;
    }
    for (const d of ['1', '2', '3', '4', '5']) {
      if (P.includes(d) && +d <= n) return answer(s, s.options[+d - 1]);
    }
    for (const c of clicks) {
      const i = cards(n).findIndex((rc) => inside(c, rc));
      if (i >= 0) {
        s.sel = i;
        return answer(s, s.options[i]);
      }
    }
    if (hit(['confirm', 'space', 'interact'], ['a'])) answer(s, s.options[s.sel]);
  }

  function inside(p, rc) {
    return p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h;
  }

  // chosen = id elegido, o null si se acabó el tiempo.
  function answer(s, chosen) {
    const id = s.order[s.q];
    const sign = SIGNS[id];
    const used = s.cfg.time - s.qTime;
    const ok = chosen === id;
    s.answers.push({ id, chosen, ok, time: used });
    s.stats.time += used;
    if (ok) {
      // 60 por acertar + hasta 40 por rapidez.
      const pts = 60 + Math.round(40 * (s.qTime / s.cfg.time));
      s.stats.correct++;
      s.stats.points += pts;
      D.floatAdd(s.floats, RIGHT.x + RIGHT.w / 2, RIGHT.y + 70, `+${pts}`, T.ok, 26);
      B.say(s.bubble, `${sign.label}. ${sign.why}`, { kind: 'ok', life: 60 });
      D.sfx('resolved');
    } else if (!chosen) {
      s.stats.timeouts++;
      B.say(s.bubble, `Se acabó el tiempo. Era «${sign.name}»: ${sign.why}`, { kind: 'tip', title: 'Tiempo agotado', life: 60 });
    } else {
      B.say(s.bubble, `«${SIGNS[chosen].name}» ${SIGNS[chosen].warns}. Aquí va «${sign.name}»: ${sign.why}`, { life: 60 });
    }
    s.phase = 'feedback';
    s.fbT = FEEDBACK_S + (ok ? 0 : 1.5);
  }

  // ------------------------------------------------------------- Disposición

  function columns(n) {
    return n === 5 ? 3 : 2;
  }

  // Tarjetas de opciones: 3 → 2 + 1, 4 → 2 × 2, 5 → 3 + 2 (filas centradas).
  function cards(n) {
    const cols = columns(n);
    const rows = Math.ceil(n / cols);
    const gap = 16;
    const top = RIGHT.y + 92;
    const w = (RIGHT.w - 32 - gap * (cols - 1)) / cols;
    const h = Math.min(240, (RIGHT.h - 92 - 70 - gap * (rows - 1)) / rows);
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const inRow = Math.min(cols, n - r * cols);
      const x0 = RIGHT.x + 16 + ((cols - inRow) * (w + gap)) / 2;
      out.push({ x: x0 + (i % cols) * (w + gap), y: top + r * (h + gap), w, h });
    }
    return out;
  }

  // ------------------------------------------------------------- Dibujo

  function draw(s, r) {
    const ctx = r.ctx;
    const t = r.t;
    D.begin(r);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, D.VIEW.width, D.VIEW.height);
    if (s.q >= 0 && s.q < s.order.length) {
      drawScenePanel(s, ctx, t);
      drawOptions(s, ctx, t);
    }
    D.floatsDraw(ctx, s.floats);
    B.bar(ctx, MSG, { bubble: s.bubble, notices: s.bubble.cur ? [] : [s.banner], t, split: 0.7 });
    D.hud(ctx, t, {
      title: 'PICTOGRAMA CORRECTO',
      diff: s.diff,
      timeLeft: s.timeLeft,
      duration: s.duration,
      accent: ACCENT,
      stats: [
        { label: 'Pregunta', value: `${Math.min(s.order.length, s.q + 1)}/${s.order.length}`, width: 130 },
        { label: 'Puntos', value: s.stats.points, color: T.ok, width: 120 },
        { label: 'Aciertos', value: s.stats.correct, color: T.ok, width: 110 },
      ],
    });
  }

  function panelTitle(ctx, rc, title, sub) {
    D.panel(ctx, rc.x, rc.y, rc.w, rc.h, { fill: '#100c0a', edge: '#2e2420', radius: 12 });
    ctx.fillStyle = ACCENT;
    D.roundRect(ctx, rc.x, rc.y, rc.w, 34, 12);
    ctx.fill();
    ctx.fillRect(rc.x, rc.y + 20, rc.w, 14);
    D.text(ctx, title, rc.x + 14, rc.y + 23, { size: 16, weight: 800, color: '#15100a' });
    if (sub) D.text(ctx, sub, rc.x + rc.w - 14, rc.y + 23, { size: 13, weight: 700, color: '#15100a', align: 'right' });
  }

  function drawScenePanel(s, ctx, t) {
    const id = s.order[s.q];
    panelTitle(ctx, SCENE, 'MIRA LA IMAGEN', `pregunta ${s.q + 1} de ${s.order.length}`);
    const box = { x: SCENE.x + 14, y: SCENE.y + 48, w: SCENE.w - 28, h: 430 };
    ctx.save();
    D.roundRect(ctx, box.x, box.y, box.w, box.h, 10);
    ctx.clip();
    scene(ctx, id, box, t);
    ctx.restore();
    ctx.strokeStyle = '#3a2e26';
    ctx.lineWidth = 2;
    D.roundRect(ctx, box.x, box.y, box.w, box.h, 10);
    ctx.stroke();
    const showCaption = s.cfg.caption || s.phase === 'feedback';
    if (showCaption) D.paragraph(ctx, SIGNS[id].scene, SCENE.x + SCENE.w / 2, box.y + box.h + 34, SCENE.w - 40, { size: 20, weight: 800, color: T.ink, align: 'center', maxLines: 2 });
    else D.text(ctx, '¿Qué riesgo hay aquí?', SCENE.x + SCENE.w / 2, box.y + box.h + 34, { size: 20, weight: 800, color: T.dim, align: 'center' });
  }

  function drawOptions(s, ctx, t) {
    const id = s.order[s.q];
    const fb = s.phase === 'feedback';
    const last = s.answers[s.answers.length - 1];
    panelTitle(ctx, RIGHT, '¿QUÉ PICTOGRAMA CORRESPONDE?');
    // Tiempo de la pregunta.
    const ratio = s.qTime / s.cfg.time;
    D.text(ctx, fb ? (last.ok ? '✔ ¡Correcto!' : last.chosen ? '✖ No corresponde' : '⏱ Tiempo agotado') : `Responde rápido: ${Math.ceil(s.qTime)} s`, RIGHT.x + 16, RIGHT.y + 62, {
      size: 18,
      weight: 800,
      color: fb ? (last.ok ? T.ok : T.red) : ratio < 0.35 ? T.red : T.ink,
    });
    D.progressBar(ctx, RIGHT.x + 16, RIGHT.y + 74, RIGHT.w - 32, 6, ratio, ratio < 0.35 ? T.red : ACCENT);
    const list = cards(s.options.length);
    s.options.forEach((opt, i) => {
      const c = list[i];
      const sel = !fb && i === s.sel;
      const right = fb && opt === id;
      const wrong = fb && last.chosen === opt && !last.ok;
      const edge = right ? T.ok : wrong ? T.red : sel ? ACCENT : '#3a2e26';
      D.panel(ctx, c.x, c.y, c.w, c.h, { fill: right ? '#13240f' : wrong ? '#2a1210' : sel ? '#2a2210' : '#17110d', edge, radius: 12, glow: right || wrong || sel ? edge : null });
      if (fb && !right && !wrong) ctx.globalAlpha = 0.4;
      const labels = s.cfg.labels || fb;
      const size = Math.min(c.w * 0.58, c.h - (labels ? 92 : 46));
      const sy = labels ? c.y + 22 + size * 0.5 : c.y + c.h / 2 + 4;
      // Placa clara, como un letrero impreso: el borde negro se ve sobre el fondo oscuro.
      D.panel(ctx, c.x + c.w / 2 - size * 0.72, sy - size * 0.62, size * 1.44, size * 1.18, { fill: '#f4efe6', edge: '#d8cfbf', radius: 10 });
      sign(ctx, opt, c.x + c.w / 2, sy, size);
      if (labels) D.paragraph(ctx, SIGNS[opt].name, c.x + c.w / 2, c.y + c.h - 30, c.w - 20, { size: 15, weight: 800, color: right ? T.ok : wrong ? T.red : T.ink, align: 'center', lineHeight: 17, maxLines: 2 });
      ctx.globalAlpha = 1;
      // Número para el teclado.
      if (D.InputState.device === 'keyboard') D.keycap(ctx, String(i + 1), c.x + 22, c.y + 22, { size: 13, color: sel ? ACCENT : '#5a4030' });
      if (right) D.text(ctx, '✔', c.x + c.w - 22, c.y + 30, { size: 24, weight: 800, color: T.ok, align: 'center' });
      if (wrong) D.text(ctx, '✖', c.x + c.w - 22, c.y + 30, { size: 24, weight: 800, color: T.red, align: 'center' });
    });
    const hintY = RIGHT.y + RIGHT.h - 22;
    if (fb) D.hints(ctx, [[CTRL.pick, s.q + 1 >= s.order.length ? 'ver el reporte' : 'siguiente pregunta']], RIGHT.x + RIGHT.w / 2, hintY, { size: 14, align: 'center', ink: T.dim, color: ACCENT });
    else D.hints(ctx, [[CTRL.move, 'elegir'], [CTRL.pick, 'responder']], RIGHT.x + RIGHT.w / 2, hintY, { size: 14, align: 'center', ink: T.dim, color: ACCENT });
  }

  // ------------------------------------------------------------- Pictogramas

  // Triángulo amarillo de advertencia con el símbolo `id`, centrado en (cx, cy); size ≈ alto.
  function sign(ctx, id, cx, cy, size) {
    ctx.save();
    ctx.translate(cx, cy);
    const k = size / 100;
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const tri = (h, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.5);
      ctx.lineTo(h * 0.58, h * 0.45);
      ctx.lineTo(-h * 0.58, h * 0.45);
      ctx.closePath();
      ctx.fill();
    };
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 10;
    tri(100, '#111');
    ctx.beginPath();
    ctx.moveTo(0, -50);
    ctx.lineTo(58, 45);
    ctx.lineTo(-58, 45);
    ctx.closePath();
    ctx.stroke();
    tri(80, ACCENT);
    ctx.translate(0, 12);
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#111';
    SYMBOLS[id](ctx);
    ctx.restore();
  }

  function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  }

  function gear(ctx, x, y, r, teeth) {
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i * Math.PI) / teeth;
      const rr = i % 2 ? r : r * 1.3;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
  }

  const SYMBOLS = {
    // Estallido con fragmentos que salen despedidos.
    particulas(ctx) {
      const pts = [];
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        const r = i % 2 ? 7 : 15;
        pts.push([Math.cos(a) * r, Math.sin(a) * r + 2]);
      }
      poly(ctx, pts);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.55;
        ctx.save();
        ctx.translate(Math.cos(a) * 26, Math.sin(a) * 22 + 6);
        ctx.rotate(a);
        ctx.fillRect(-3, -2, 6, 4);
        ctx.restore();
      }
      ctx.lineWidth = 2.5;
      for (const a of [-2.6, -0.5, 0.4, 2.7]) {
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 17, Math.sin(a) * 15 + 2);
        ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 21 + 2);
        ctx.stroke();
      }
    },
    // Mano que entra entre dos engranajes.
    atrapamiento(ctx) {
      gear(ctx, -10, 16, 10, 8);
      gear(ctx, 11, 16, 10, 8);
      ctx.save();
      ctx.translate(0, -8);
      ctx.rotate(-0.35);
      ctx.fillRect(-4.5, -26, 9, 14); // antebrazo
      D.roundRect(ctx, -7.5, -14, 15, 12, 3); // palma
      ctx.fill();
      for (const x of [-7, -3.2, 0.6, 4.4]) {
        D.roundRect(ctx, x, -4, 3.2, x === -7 || x === 4.4 ? 9 : 11, 1.6); // dedos hacia los engranajes
        ctx.fill();
      }
      ctx.save();
      ctx.translate(-8, -9);
      ctx.rotate(0.9);
      D.roundRect(ctx, -1.6, 0, 3.4, 9, 1.7); // pulgar
      ctx.fill();
      ctx.restore();
      ctx.restore();
    },
    // Persona que tropieza con un obstáculo.
    tropiezo(ctx) {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(12, -14, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(7, -7);
      ctx.lineTo(-6, 8); // tronco inclinado
      ctx.moveTo(4, -4);
      ctx.lineTo(16, 2); // brazo adelante
      ctx.moveTo(1, -1);
      ctx.lineTo(-10, -6); // brazo atrás
      ctx.moveTo(-6, 8);
      ctx.lineTo(4, 22); // pierna adelante
      ctx.moveTo(-6, 8);
      ctx.lineTo(-20, 16); // pierna atrás
      ctx.stroke();
      ctx.fillRect(6, 20, 12, 7); // obstáculo
      ctx.fillRect(-30, 27, 60, 3); // piso
    },
    // Rayo.
    electrico(ctx) {
      poly(ctx, [
        [6, -26],
        [-12, 4],
        [-1, 4],
        [-8, 30],
        [14, -4],
        [3, -4],
        [12, -26],
      ]);
    },
    // Montacargas con carga.
    maquinaria(ctx) {
      ctx.fillRect(-16, 2, 24, 14); // cuerpo
      ctx.fillRect(-12, -12, 3, 14); // cabina
      ctx.fillRect(-12, -12, 14, 3);
      ctx.fillRect(10, -20, 3, 36); // mástil
      ctx.fillRect(13, 12, 14, 3); // horquillas
      ctx.fillRect(14, 0, 11, 11); // carga
      ctx.fillRect(-22, 4, 6, 8); // contrapeso
      ctx.fillStyle = ACCENT;
      ctx.fillRect(-7, -6, 8, 8);
      ctx.fillStyle = '#111';
      for (const x of [-11, 5]) {
        ctx.beginPath();
        ctx.arc(x, 19, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };

  // ------------------------------------------------------------- Escenas

  function scene(ctx, id, b, t) {
    SCENES[id](ctx, b, t);
  }

  function rect(ctx, x, y, w, h, fill, r = 0) {
    ctx.fillStyle = fill;
    if (r) {
      D.roundRect(ctx, x, y, w, h, r);
      ctx.fill();
    } else ctx.fillRect(x, y, w, h);
  }

  function bottle(ctx, x, y, s, color = '#8a4b14') {
    rect(ctx, x - 9 * s, y - 30 * s, 18 * s, 34 * s, color, 5 * s);
    rect(ctx, x - 4 * s, y - 44 * s, 8 * s, 16 * s, color, 2 * s);
    rect(ctx, x - 5 * s, y - 47 * s, 10 * s, 4 * s, '#c9a227', 1);
    rect(ctx, x - 9 * s, y - 20 * s, 18 * s, 10 * s, '#e9dcc0', 1);
  }

  const SCENES = {
    // Botella que estalla sobre el transportador.
    particulas(ctx, b, t) {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, '#c9d2d8');
      g.addColorStop(1, '#8f9ba3');
      rect(ctx, b.x, b.y, b.w, b.h, g);
      const cy = b.y + b.h * 0.7;
      rect(ctx, b.x, cy, b.w, 26, '#4a5258');
      for (let x = b.x - 40 + ((t * 60) % 40); x < b.x + b.w; x += 40) rect(ctx, x, cy + 4, 20, 4, '#6a737a');
      bottle(ctx, b.x + 90, cy, 1.6);
      bottle(ctx, b.x + 180, cy, 1.6);
      bottle(ctx, b.x + b.w - 90, cy, 1.6);
      // Estallido.
      const ex = b.x + b.w / 2 + 20;
      const ey = cy - 50;
      const pulse = 1 + 0.08 * Math.sin(t * 8);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.fillStyle = 'rgba(255,248,220,0.85)';
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = (i * Math.PI) / 10;
        const r = (i % 2 ? 26 : 62) * pulse;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      // Espuma y fragmentos de vidrio ámbar.
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(Math.cos(i * 0.7) * 22, Math.sin(i * 1.3) * 16, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + 0.3;
        const d = 70 + ((i * 37) % 90) + 10 * Math.sin(t * 3 + i);
        ctx.save();
        ctx.translate(Math.cos(a) * d, Math.sin(a) * d * 0.8);
        ctx.rotate(a * 3);
        ctx.fillStyle = i % 3 ? 'rgba(160,82,20,0.9)' : 'rgba(220,240,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(0, -9);
        ctx.lineTo(6, 6);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    },
    // Cadena con piñones y transportador de tablillas.
    atrapamiento(ctx, b, t) {
      rect(ctx, b.x, b.y, b.w, b.h, '#5d6670');
      rect(ctx, b.x, b.y + b.h * 0.62, b.w, b.h * 0.38, '#3f464d');
      // Tablillas del transportador.
      const ty = b.y + b.h * 0.18;
      for (let i = -1; i < 12; i++) {
        const x = b.x + ((i * 52 + t * 40) % (b.w + 52)) - 26;
        rect(ctx, x, ty, 46, 70, '#c3cad0', 4);
        ctx.fillStyle = '#9aa3aa';
        for (let k = 0; k < 6; k++) ctx.fillRect(x + 6 + (k % 3) * 13, ty + 12 + Math.floor(k / 3) * 30, 6, 6);
      }
      // Piñones.
      const py = b.y + b.h * 0.6;
      const drawSprocket = (x, r, dir) => {
        ctx.save();
        ctx.translate(x, py);
        ctx.rotate(dir * t * 1.6);
        ctx.fillStyle = '#2b3036';
        ctx.beginPath();
        for (let i = 0; i < 28; i++) {
          const a = (i * Math.PI) / 14;
          const rr = i % 2 ? r : r * 1.12;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#7a848c';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      drawSprocket(b.x + 150, 62, 1);
      drawSprocket(b.x + b.w - 150, 62, 1);
      // Cadena entre piñones (eslabones que avanzan).
      ctx.fillStyle = '#1e2226';
      for (const y of [py - 66, py + 66]) {
        for (let x = b.x + 150 + ((t * 40) % 22); x < b.x + b.w - 150; x += 22) {
          rect(ctx, x, y - 6, 16, 12, '#1e2226', 4);
          ctx.fillStyle = '#8a939a';
          ctx.beginPath();
          ctx.arc(x + 8, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Punto de atrapamiento resaltado.
      ctx.strokeStyle = 'rgba(247,198,0,0.85)';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.arc(b.x + 150 + 40, py - 58, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    // Pasillo con piso mojado.
    tropiezo(ctx, b, t) {
      rect(ctx, b.x, b.y, b.w, b.h * 0.32, '#4a5560');
      rect(ctx, b.x, b.y + b.h * 0.32, b.w, b.h * 0.68, '#7b8288');
      // Baldosas en perspectiva.
      ctx.strokeStyle = '#5e656b';
      ctx.lineWidth = 2;
      const hy = b.y + b.h * 0.32;
      const vx = b.x + b.w / 2;
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(vx + i * 30, hy);
        ctx.lineTo(vx + i * 160, b.y + b.h);
        ctx.stroke();
      }
      for (let k = 1; k < 7; k++) {
        const y = hy + (b.h * 0.68 * (k * k)) / 49;
        ctx.beginPath();
        ctx.moveTo(b.x, y);
        ctx.lineTo(b.x + b.w, y);
        ctx.stroke();
      }
      // Charcos con reflejo.
      const puddle = (x, y, rx, ry) => {
        ctx.fillStyle = 'rgba(170,200,220,0.55)';
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.ellipse(x - rx * 0.3, y - ry * 0.2, rx * 0.35, ry * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      puddle(b.x + b.w * 0.45, b.y + b.h * 0.72, 170, 40);
      puddle(b.x + b.w * 0.75, b.y + b.h * 0.55, 90, 18);
      puddle(b.x + b.w * 0.2, b.y + b.h * 0.86, 80, 22);
      // Gotas que caen y salpican.
      ctx.fillStyle = 'rgba(200,225,240,0.9)';
      for (let i = 0; i < 6; i++) {
        const x = b.x + 120 + i * 80;
        const y = b.y + ((t * 160 + i * 70) % (b.h * 0.6)) + b.h * 0.1;
        ctx.beginPath();
        ctx.ellipse(x, y, 3, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Manguera en el piso.
      ctx.strokeStyle = '#2f7a33';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(b.x - 10, b.y + b.h * 0.62);
      ctx.bezierCurveTo(b.x + 140, b.y + b.h * 0.5, b.x + 120, b.y + b.h * 0.95, b.x + 260, b.y + b.h * 0.8);
      ctx.stroke();
    },
    // Tablero eléctrico abierto.
    electrico(ctx, b, t) {
      rect(ctx, b.x, b.y, b.w, b.h, '#b9bec2');
      rect(ctx, b.x, b.y + b.h * 0.86, b.w, b.h * 0.14, '#7d8287');
      const cx = b.x + 150;
      const cy = b.y + 34;
      const cw = 300;
      const ch = b.h - 90;
      rect(ctx, cx, cy, cw, ch, '#9aa1a6', 6);
      rect(ctx, cx + 12, cy + 12, cw - 24, ch - 24, '#e9ecee', 4);
      // Rieles con interruptores.
      for (let r = 0; r < 3; r++) {
        const y = cy + 40 + r * 95;
        rect(ctx, cx + 24, y + 22, cw - 48, 8, '#9aa1a6');
        for (let i = 0; i < 8; i++) {
          rect(ctx, cx + 30 + i * 30, y, 24, 52, i % 3 === 0 ? '#2b2f33' : '#f4f4f4', 3);
          rect(ctx, cx + 38 + i * 30, y + 18, 8, 14, i % 3 === 0 ? '#e8473b' : '#3d8fe0', 2);
        }
      }
      // Cables de colores.
      const colors = ['#e8473b', '#2b2f33', '#3d8fe0', '#2f7a33', '#f2c230'];
      ctx.lineWidth = 4;
      colors.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.moveTo(cx + 40 + i * 50, cy + ch - 30);
        ctx.bezierCurveTo(cx + 30 + i * 50, cy + ch - 70, cx + 70 + i * 40, cy + ch - 90, cx + 60 + i * 45, cy + 300);
        ctx.stroke();
      });
      // Puerta abierta.
      ctx.fillStyle = '#8f969b';
      ctx.beginPath();
      ctx.moveTo(cx + cw, cy);
      ctx.lineTo(cx + cw + 120, cy + 30);
      ctx.lineTo(cx + cw + 120, cy + ch - 30);
      ctx.lineTo(cx + cw, cy + ch);
      ctx.closePath();
      ctx.fill();
      rect(ctx, cx + cw + 96, cy + ch / 2 - 20, 8, 40, '#55595d', 3);
      // Chispa intermitente.
      if (Math.sin(t * 9) > 0.2) {
        ctx.fillStyle = '#fff6a0';
        ctx.save();
        ctx.translate(cx + 160, cy + ch - 150);
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          const r = i % 2 ? 6 : 18;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    },
    // Montacargas en el patio, con semáforo y barrera.
    maquinaria(ctx, b, t) {
      const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h * 0.5);
      g.addColorStop(0, '#9fc7e8');
      g.addColorStop(1, '#d9e8f2');
      rect(ctx, b.x, b.y, b.w, b.h * 0.5, g);
      rect(ctx, b.x, b.y + b.h * 0.18, b.w * 0.35, b.h * 0.32, '#c9c2b6');
      rect(ctx, b.x + b.w * 0.62, b.y + b.h * 0.24, b.w * 0.38, b.h * 0.26, '#d8d1c4');
      rect(ctx, b.x, b.y + b.h * 0.5, b.w, b.h * 0.5, '#8d8f91');
      // Paso peatonal amarillo.
      for (let i = 0; i < 6; i++) rect(ctx, b.x + 40 + i * 34, b.y + b.h * 0.86, 20, 40, '#f2c230');
      // Semáforo.
      rect(ctx, b.x + 90, b.y + 40, 10, 220, '#5d6268');
      rect(ctx, b.x + 70, b.y + 30, 50, 120, '#2b2f33', 8);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === 2 ? '#3ddc5a' : '#4a4f55';
        ctx.beginPath();
        ctx.arc(b.x + 95, b.y + 52 + i * 36, 13, 0, Math.PI * 2);
        ctx.fill();
      }
      // Barrera amarilla.
      rect(ctx, b.x + 150, b.y + b.h * 0.58, 14, 110, '#f2c230');
      rect(ctx, b.x + 150, b.y + b.h * 0.58, 120, 14, '#f2c230');
      // Cono.
      ctx.fillStyle = '#ff6a1f';
      ctx.beginPath();
      ctx.moveTo(b.x + b.w - 90, b.y + b.h * 0.62);
      ctx.lineTo(b.x + b.w - 70, b.y + b.h * 0.8);
      ctx.lineTo(b.x + b.w - 110, b.y + b.h * 0.8);
      ctx.closePath();
      ctx.fill();
      // Montacargas que avanza y retrocede.
      const fx = b.x + b.w * 0.55 + Math.sin(t * 0.8) * 60;
      const fy = b.y + b.h * 0.78;
      ctx.save();
      ctx.translate(fx, fy);
      rect(ctx, -70, -60, 100, 50, '#f2b705', 6); // cuerpo
      rect(ctx, -60, -120, 6, 64, '#2b2f33'); // cabina
      rect(ctx, -10, -120, 6, 64, '#2b2f33');
      rect(ctx, -64, -124, 64, 8, '#2b2f33');
      rect(ctx, 34, -150, 10, 140, '#3a3f44'); // mástil
      rect(ctx, 44, -20, 60, 7, '#3a3f44'); // horquillas
      rect(ctx, 46, -78, 56, 56, '#b07a3c', 3); // carga
      rect(ctx, 46, -54, 56, 4, '#8a5a28');
      rect(ctx, -90, -54, 22, 40, '#2b2f33', 4); // contrapeso
      for (const x of [-48, 14]) {
        ctx.fillStyle = '#1e2226';
        ctx.beginPath();
        ctx.arc(x, -6, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a848c';
        ctx.beginPath();
        ctx.arc(x, -6, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      // Baliza naranja.
      ctx.fillStyle = Math.sin(t * 10) > 0 ? '#ff8a1f' : '#7a3a10';
      ctx.beginPath();
      ctx.arc(-32, -130, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
  };

  // ------------------------------------------------------------- Reporte

  function report(s) {
    const st = s.stats;
    const score = Math.max(0, Math.min(100, Math.round(st.points / s.order.length)));
    const rank = D.rankFor(score);
    const answered = s.answers.filter((a) => a.chosen);
    const avg = answered.length ? answered.reduce((a, x) => a + x.time, 0) / answered.length : 0;
    // Una fila por pregunta: ✔ acierto · ✖ pictograma equivocado · ⏱ sin tiempo · — sin jugar.
    const rows = s.order.map((id, i) => {
      const a = s.answers[i];
      return [`${i + 1}. ${SIGNS[id].scene}`, !a ? '—' : a.ok ? '✔' : a.chosen ? '✖' : '⏱', a && a.ok ? T.ok : a ? T.red : T.ink];
    });
    rows.push(['Tiempo medio de respuesta', answered.length ? `${avg.toFixed(1).replace('.', ',')} s` : '—', T.ink]);
    rows.push(['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)]);
    return {
      score,
      rank,
      headline: `Relacionaste bien ${st.correct} de ${s.order.length} pictogramas`,
      rows,
      mistakes: s.bubble.log.slice(),
    };
  }

  // ------------------------------------------------------------- Menú

  function icon(ctx, cx, cy, size) {
    sign(ctx, 'electrico', cx - size * 0.2, cy + size * 0.05, size * 0.55);
    sign(ctx, 'atrapamiento', cx + size * 0.22, cy - size * 0.08, size * 0.42);
  }

  PF.Signs = { SIGNS, IDS, DIFF, QUESTIONS, cards };
  PF.Games = PF.Games || [];
  PF.Games.push({
    id: 'signs',
    order: 8,
    title: 'Pictograma Correcto',
    subtitle: 'Respuesta rápida',
    tagline: 'Mira la imagen y elige rápido el pictograma de seguridad que le corresponde.',
    accent: ACCENT,
    padRaw: true,
    icon,
    howTo: [
      '3 preguntas rápidas: en cada una ves una escena de la planta.',
      'Elige el pictograma de advertencia que corresponde: partículas, atrapamiento, tropiezo, riesgo eléctrico o maquinaria en funcionamiento.',
      'Acertar suma 60 puntos y la rapidez hasta 40 más. Si fallas, te explicamos por qué.',
      'Después de cada respuesta ves la explicación; pasa a la siguiente con ENTER o tocando.',
    ],
    // Táctil: se tocan las tarjetas directamente.
    touch: { stick: false, main: [], aux: [] },
    controls: [
      ['← →', 'elegir pictograma', 'dpadLR'],
      ['ENTER', 'responder (o clic)', 'a'],
    ],
    difficulties: {
      facil: ['3 opciones con su nombre', '12 s por pregunta', 'La imagen trae su descripción'],
      normal: ['4 opciones, solo el pictograma', '8 s por pregunta', 'La imagen trae su descripción'],
      dificil: ['Los 5 pictogramas, sin nombre', '6 s por pregunta', 'Sin descripción de la imagen'],
    },
    create,
  });
})();
