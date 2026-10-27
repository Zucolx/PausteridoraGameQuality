// El Cazador de Riesgos: recorrido con linterna UV por la línea a oscuras.
// Encuentra los 5 "monstruos" de contaminación invisibles y límpialos con la herramienta correcta.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const W = PF.World;
  const B = PF.Bubble;
  const M = PF.Manual;
  const T = D.T;
  const ACCENT = '#a46bff';
  const TARGETS = 5;
  const REACH = 72;

  const DIFF = {
    facil: { light: 165, decoys: 0, guide: true, keepPins: true, penalty: 0, showUse: true, flicker: false },
    normal: { light: 125, decoys: 2, guide: false, keepPins: true, penalty: 2, showUse: false, flicker: false },
    dificil: { light: 95, decoys: 4, guide: false, keepPins: false, penalty: 4, showUse: false, flicker: true },
  };

  const MACHINES = [
    { id: 'filler', label: 'LLENADORA', x: 110, y: 130, w: 200, h: 200, kind: 'filler' },
    { id: 'star', label: 'ESTRELLA DE SALIDA', x: 340, y: 196, w: 92, h: 92, kind: 'star' },
    { id: 'conv1', label: 'TRANSPORTADOR', x: 432, y: 226, w: 400, h: 36, kind: 'conveyor' },
    { id: 'tubes', label: 'TUBERÍAS', x: 858, y: 112, w: 52, h: 250, kind: 'tubes' },
    { id: 'valves', label: 'VÁLVULAS', x: 590, y: 420, w: 170, h: 70, kind: 'valves' },
    { id: 'tank', label: 'TANQUE', x: 110, y: 468, w: 120, h: 170, kind: 'tank' },
    { id: 'conv2', label: 'GUÍAS', x: 300, y: 590, w: 420, h: 34, kind: 'conveyor' },
  ];
  // Puntos donde puede esconderse cada tipo de riesgo.
  const SPOTS = [
    { type: 'vidrio', x: 386, y: 192 },
    { type: 'vidrio', x: 386, y: 294 },
    { type: 'vidrio', x: 336, y: 244 },
    { type: 'vidrio', x: 470, y: 586 },
    { type: 'sarro', x: 612, y: 416 },
    { type: 'sarro', x: 700, y: 494 },
    { type: 'sarro', x: 764, y: 455 },
    { type: 'sarro', x: 236, y: 560 },
    { type: 'levadura', x: 520, y: 222 },
    { type: 'levadura', x: 690, y: 266 },
    { type: 'levadura', x: 800, y: 222 },
    { type: 'levadura', x: 620, y: 628 },
    { type: 'biofilm', x: 854, y: 170 },
    { type: 'biofilm', x: 914, y: 300 },
    { type: 'biofilm', x: 176, y: 642 },
    { type: 'biofilm', x: 214, y: 334 },
  ];
  const DECOY_SPOTS = [
    { x: 300, y: 400 },
    { x: 560, y: 530 },
    { x: 860, y: 520 },
    { x: 420, y: 470 },
    { x: 760, y: 640 },
    { x: 80, y: 400 },
  ];
  const WORLD = W.make({ solids: MACHINES, stations: {}, start: { x: 500, y: 360 } });
  const H_TOOL = 330;

  function create(diffId = 'normal', opts = {}) {
    const cfg = DIFF[diffId] || DIFF.normal;
    const rng = D.makeRng(opts.seed);
    const s = {
      id: 'hunter',
      diff: diffId,
      cfg,
      rng,
      duration: 60,
      timeLeft: 60,
      time: 0,
      over: false,
      endT: 0,
      player: W.newPlayer(WORLD),
      bubble: B.create(),
      floats: [],
      banner: D.makeBanner('RECORRIDO UV', ACCENT, 'Encuentra 5 focos de contaminación invisibles', 2.6),
      hazards: pickHazards(rng),
      decoys: D.shuffle(rng, DECOY_SPOTS)
        .slice(0, cfg.decoys)
        .map((p) => ({ ...p, checked: false })),
      target: null,
      tool: { sel: 0, phase: 'choose', progress: 0, shake: 0 },
      fact: null,
      stats: { found: 0, firstTry: 0, errors: 0, decoys: 0 },
      flick: 1,
    };
    s.world = WORLD;
    s.update = (dt, input) => update(s, dt, input);
    s.draw = (r) => draw(s, r);
    s.report = () => report(s);
    return s;
  }

  // Cinco riesgos: al menos uno de cada tipo y el quinto al azar.
  function pickHazards(rng) {
    const types = Object.keys(M.HAZARDS);
    const chosen = [];
    for (const type of types) chosen.push(D.shuffle(rng, SPOTS.filter((p) => p.type === type))[0]);
    const rest = D.shuffle(
      rng,
      SPOTS.filter((p) => !chosen.includes(p))
    );
    while (chosen.length < TARGETS) chosen.push(rest.shift());
    return chosen.map((p, i) => ({ id: i, type: p.type, x: p.x, y: p.y, seen: false, found: false, firstTry: true }));
  }

  function lightRadius(s) {
    return s.cfg.light * s.flick;
  }

  function mistake(s, msg) {
    B.say(s.bubble, msg);
    s.stats.errors++;
    if (s.cfg.penalty) {
      s.timeLeft -= s.cfg.penalty;
      D.floatAdd(s.floats, s.player.x, s.player.y - 70, `−${s.cfg.penalty} s`, T.red, 20);
    }
  }

  function nearbyTarget(s) {
    const p = s.player;
    let best = null;
    let bestD = REACH;
    for (const h of s.hazards) {
      if (h.found) continue;
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      if (d <= bestD && d <= lightRadius(s)) {
        best = { kind: 'hazard', ref: h };
        bestD = d;
      }
    }
    for (const dc of s.decoys) {
      if (dc.checked) continue;
      const d = Math.hypot(dc.x - p.x, dc.y - p.y);
      if (d <= bestD && d <= lightRadius(s)) {
        best = { kind: 'decoy', ref: dc };
        bestD = d;
      }
    }
    return best;
  }

  function update(s, dt, input) {
    if (s.over) return;
    s.time += dt;
    s.timeLeft -= dt;
    B.update(s.bubble, dt);
    s.floats = D.floatsUpdate(s.floats, dt);
    D.tickBanner(s, dt);
    s.tool.shake = Math.max(0, s.tool.shake - dt);
    if (s.fact) {
      s.fact.life -= dt;
      if (s.fact.life <= 0) s.fact = null;
    }
    // La linterna parpadea en difícil.
    s.flick = s.cfg.flicker && Math.sin(s.time * 1.7) > 0.93 ? 0.55 : 1;
    if (s.endT > 0) {
      s.endT -= dt;
      if (s.endT <= 0) s.over = true;
      return;
    }
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      s.over = true;
      return;
    }
    // Revelado: lo que entra en la luz UV queda marcado.
    const R = lightRadius(s);
    for (const h of s.hazards) {
      if (!h.found && Math.hypot(h.x - s.player.x, h.y - s.player.y) < R) {
        if (!h.seen) {
          h.seen = true;
          D.sfx('alarm');
        }
      }
    }

    const P = input.pressed;
    if (s.target) {
      if (P.includes('cancel') || (P.includes('interact') && s.tool.phase === 'choose')) {
        s.target = null;
        return;
      }
      updateTool(s, dt, input);
      return;
    }
    W.move(WORLD, s.player, input, dt);
    if (P.includes('interact')) {
      const t = nearbyTarget(s);
      if (!t) return;
      if (t.kind === 'decoy') {
        t.ref.checked = true;
        s.stats.decoys++;
        B.say(s.bubble, 'Falsa alarma: es solo condensación limpia que brilla con la UV. Sigue buscando.', { kind: 'tip' });
        return;
      }
      s.target = t.ref;
      s.tool = { sel: 0, phase: 'choose', progress: 0, shake: 0 };
      D.sfx('enter');
    }
  }

  function toolCards() {
    const a = D.modalArea(H_TOOL);
    const w = 132;
    const gap = 12;
    const x0 = a.x + (a.w - (4 * w + 3 * gap)) / 2;
    return M.TOOL_ORDER.map((id, i) => ({ id, x: x0 + i * (w + gap), y: a.y + 70, w, h: 130 }));
  }

  function choose(s, toolId) {
    const h = s.target;
    const hz = M.HAZARDS[h.type];
    if (toolId === hz.tool) {
      s.tool.phase = 'clean';
      s.tool.progress = 0;
      D.sfx('blip');
    } else {
      h.firstTry = false;
      s.tool.shake = 0.4;
      mistake(s, `${hz.error} (${M.TOOLS[toolId].name} no sirve aquí.)`);
    }
  }

  function updateTool(s, dt, input) {
    const P = input.pressed;
    const tool = s.tool;
    if (tool.phase === 'choose') {
      if (P.includes('left')) tool.sel = (tool.sel + 3) % 4;
      if (P.includes('right')) tool.sel = (tool.sel + 1) % 4;
      for (const d of ['1', '2', '3', '4']) {
        if (P.includes(d)) {
          tool.sel = +d - 1;
          choose(s, M.TOOL_ORDER[tool.sel]);
          return;
        }
      }
      for (const c of input.clicks || []) {
        const hit = toolCards().find((r) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h);
        if (hit) {
          tool.sel = M.TOOL_ORDER.indexOf(hit.id);
          choose(s, hit.id);
          return;
        }
      }
      if (P.includes('space') || P.includes('confirm')) choose(s, M.TOOL_ORDER[tool.sel]);
      return;
    }
    // Aplicar la herramienta: mantener ESPACIO (o el ratón).
    if (input.space || (input.mouse && input.mouse.down)) tool.progress += dt;
    if (tool.progress >= 1.1) {
      const h = s.target;
      h.found = true;
      s.stats.found++;
      if (h.firstTry) s.stats.firstTry++;
      const pool = M.FACTS[h.type].concat(M.FACTS.general);
      const text = pool[Math.floor(s.rng() * pool.length)];
      s.fact = { title: M.HAZARDS[h.type].name, text, life: 9, max: 9 };
      D.floatAdd(s.floats, h.x, h.y - 30, '✔ Riesgo eliminado', T.ok, 18);
      D.sfx('resolved');
      s.target = null;
      if (s.stats.found >= TARGETS) {
        s.banner = D.makeBanner('¡ZONA SEGURA!', T.ok, 'Encontraste los 5 focos de contaminación', 2);
        s.endT = 1.8;
        D.sfx('end');
      }
    }
  }

  // ------------------------------------------------------------ Dibujo

  let dark = null;

  function draw(s, r) {
    const ctx = r.ctx;
    const t = r.t;
    D.begin(r);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, D.VIEW.hud, D.VIEW.mapWidth, D.VIEW.height - D.VIEW.hud);
    ctx.clip();
    D.floor(ctx, D.MAP_BOUNDS, { floorColor: '#140d12', line: '#1d141b', stripe: '#5a2a7a' });
    for (const m of MACHINES) drawMachine(ctx, m, t);
    for (const dc of s.decoys) if (!dc.checked) drawDecoyBase(ctx, dc);
    D.player(ctx, s.player, { tool: 'flashlight', t });
    drawDarkness(s, r, ctx);

    // Fluorescencia: lo que la luz UV toca brilla por encima de la oscuridad.
    const R = lightRadius(s);
    for (const h of s.hazards) {
      if (h.found) {
        D.text(ctx, '✔', h.x, h.y + 6, { size: 18, weight: 800, color: T.ok, align: 'center' });
        continue;
      }
      const d = Math.hypot(h.x - s.player.x, h.y - s.player.y);
      const alpha = Math.max(0, Math.min(1, (R - d) / (R * 0.35)));
      if (alpha > 0) monster(ctx, h.type, h.x, h.y, 22, t, alpha);
      else if (h.seen && s.cfg.keepPins) pin(ctx, h.x, h.y, t);
    }
    for (const dc of s.decoys) {
      if (dc.checked) continue;
      const d = Math.hypot(dc.x - s.player.x, dc.y - s.player.y);
      const alpha = Math.max(0, Math.min(1, (R - d) / (R * 0.35)));
      if (alpha > 0) decoyGlow(ctx, dc, t, alpha);
    }
    if (s.cfg.guide && !s.target) {
      const rem = s.hazards.filter((h) => !h.found).sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y))[0];
      if (rem) D.guide(ctx, s.player, rem, t, ACCENT);
    }
    const near = !s.target && nearbyTarget(s);
    if (near) D.prompt(ctx, s.player, near.kind === 'hazard' ? 'limpiar' : 'revisar', ACCENT);
    D.floatsDraw(ctx, s.floats);
    if (s.target) drawToolModal(s, ctx, t);
    if (!s.target) B.marker(ctx, s.bubble, s.player, t);
    ctx.restore();

    D.hud(ctx, t, {
      title: 'EL CAZADOR DE RIESGOS',
      diff: s.diff,
      timeLeft: s.timeLeft,
      duration: s.duration,
      accent: ACCENT,
      stats: [
        { label: 'Riesgos', value: `${s.stats.found}/${TARGETS}`, color: T.ok, width: 130 },
        { label: 'Errores', value: s.stats.errors, color: s.stats.errors ? T.red : T.ink, width: 110 },
      ],
    });
    drawSidebar(s, ctx, t);
  }

  function drawMachine(ctx, m, t) {
    ctx.fillStyle = '#2a2228';
    D.roundRect(ctx, m.x, m.y, m.w, m.h, 8);
    ctx.fill();
    ctx.strokeStyle = '#0b070a';
    ctx.lineWidth = 2;
    ctx.stroke();
    const cx = m.x + m.w / 2;
    const cy = m.y + m.h / 2;
    if (m.kind === 'filler') {
      ctx.fillStyle = '#4a4248';
      ctx.beginPath();
      ctx.arc(cx, cy, 86, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        ctx.fillStyle = '#7a7078';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * 66, cy + Math.sin(a) * 66, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (m.kind === 'star') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.4);
      ctx.fillStyle = '#6a6068';
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const rr = i % 2 ? 26 : 42;
        const a = (i / 16) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (m.kind === 'conveyor') {
      ctx.fillStyle = '#3a3238';
      for (let x = m.x + 6; x < m.x + m.w - 6; x += 22) ctx.fillRect(x, m.y + 8, 12, m.h - 16);
      ctx.fillStyle = '#8a7e86';
      ctx.fillRect(m.x, m.y - 3, m.w, 4);
      ctx.fillRect(m.x, m.y + m.h - 1, m.w, 4);
    } else if (m.kind === 'tubes') {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = ['#5a5258', '#6a6268', '#5a5258'][i];
        ctx.fillRect(m.x + 6 + i * 15, m.y + 4, 11, m.h - 8);
      }
    } else if (m.kind === 'valves') {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = '#8a3a2a';
        ctx.beginPath();
        ctx.arc(m.x + 26 + i * 40, cy, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2a1410';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(m.x + 14 + i * 40, cy);
        ctx.lineTo(m.x + 38 + i * 40, cy);
        ctx.stroke();
      }
    } else if (m.kind === 'tank') {
      const g = ctx.createLinearGradient(m.x, 0, m.x + m.w, 0);
      g.addColorStop(0, '#3a3238');
      g.addColorStop(0.5, '#6a6068');
      g.addColorStop(1, '#3a3238');
      ctx.fillStyle = g;
      D.roundRect(ctx, m.x + 6, m.y + 6, m.w - 12, m.h - 12, 14);
      ctx.fill();
    }
    D.text(ctx, m.label, cx, m.kind === 'conveyor' ? m.y - 10 : m.y + m.h + 16, { size: 12, weight: 700, color: '#6a5a66', align: 'center' });
  }

  function drawDecoyBase(ctx, dc) {
    ctx.fillStyle = 'rgba(120,140,160,0.25)';
    ctx.beginPath();
    ctx.ellipse(dc.x, dc.y, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDarkness(s, r, ctx) {
    const k = r.dpr * r.scale;
    const w = Math.ceil(D.VIEW.width * k);
    const h = Math.ceil(D.VIEW.height * k);
    if (!dark) dark = document.createElement('canvas');
    if (dark.width !== w || dark.height !== h) {
      dark.width = w;
      dark.height = h;
    }
    const o = dark.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, w, h);
    o.setTransform(k, 0, 0, k, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.fillStyle = 'rgba(3,1,6,0.95)';
    o.fillRect(0, D.VIEW.hud, D.VIEW.mapWidth, D.VIEW.height - D.VIEW.hud);
    o.globalCompositeOperation = 'destination-out';
    const p = s.player;
    const R = lightRadius(s);
    const g = o.createRadialGradient(p.x, p.y, R * 0.25, p.x, p.y, R);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = g;
    o.beginPath();
    o.arc(p.x, p.y, R, 0, Math.PI * 2);
    o.fill();
    o.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, Math.round(r.dpr * r.ox), Math.round(r.dpr * r.oy));
    ctx.restore();
    // Tinte violeta de la luz UV.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const u = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
    u.addColorStop(0, 'rgba(120,60,200,0.22)');
    u.addColorStop(1, 'rgba(120,60,200,0)');
    ctx.fillStyle = u;
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function pin(ctx, x, y, t) {
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    D.text(ctx, '?', x, y + 6, { size: 15, weight: 800, color: '#140d12', align: 'center' });
    ctx.globalAlpha = 1;
  }

  function decoyGlow(ctx, dc, t, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha * (0.6 + 0.3 * Math.sin(t * 5));
    ctx.shadowColor = '#bfe8ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#d8f0ff';
    ctx.beginPath();
    ctx.ellipse(dc.x, dc.y, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Monstruos de contaminación al estilo Halloween del afiche.
  function monster(ctx, type, x, y, s, t, alpha = 1) {
    const hz = M.HAZARDS[type];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y + Math.sin(t * 3 + x) * 3);
    ctx.shadowColor = hz.color;
    ctx.shadowBlur = 22;
    ctx.fillStyle = hz.color;
    ctx.beginPath();
    if (type === 'vidrio') {
      ctx.moveTo(0, -s * 1.2);
      ctx.lineTo(s * 0.8, -s * 0.1);
      ctx.lineTo(s * 0.45, s * 0.9);
      ctx.lineTo(-s * 0.5, s * 0.8);
      ctx.lineTo(-s * 0.9, -s * 0.2);
      ctx.closePath();
    } else if (type === 'sarro') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rr = s * (0.8 + (i % 3) * 0.15);
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
    } else if (type === 'levadura') {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const rr = s * (i % 2 ? 0.75 : 1.05);
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
    } else {
      ctx.arc(0, -s * 0.1, s * 0.85, Math.PI, 0);
      ctx.lineTo(s * 0.85, s * 0.6);
      for (let i = 0; i < 4; i++) {
        const px = s * 0.85 - (i + 0.5) * (s * 1.7) / 4;
        ctx.quadraticCurveTo(px + s * 0.2, s * (0.6 + 0.4 * Math.sin(t * 4 + i)), px - s * 0.2, s * 0.6);
      }
      ctx.closePath();
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    // Ojos y boca.
    ctx.fillStyle = '#140d12';
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.15, s * 0.16, s * 0.22, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.3, -s * 0.15, s * 0.16, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, s * 0.25, s * 0.25, 0, Math.PI);
    ctx.fill();
    ctx.restore();
  }

  function drawToolModal(s, ctx, t) {
    const h = s.target;
    const hz = M.HAZARDS[h.type];
    const a = D.modal(ctx, `${hz.name.toUpperCase()} en la ${hz.where}`, H_TOOL, { accent: ACCENT, hint: [[{ key: 'Esc', pad: 'b' }, 'salir']] });
    monster(ctx, h.type, a.x + 30, a.y + 22, 20, t, 1);
    if (s.tool.phase === 'choose') {
      D.text(ctx, '¿Con qué lo limpias?', a.x + 70, a.y + 18, { size: 20, weight: 800 });
      D.hints(
        ctx,
        [
          [{ key: '← →', pad: 'dpadLR' }, 'elegir'],
          [{ key: 'ESPACIO', pad: 'a' }, 'usar'],
          [{ key: '1-4', pad: ['lb', 'rb', 'lt', 'rt'] }, 'directo'],
        ],
        a.x + 70,
        a.y + 44,
        { size: 11, gap: 14, ink: T.dim }
      );
      toolCards().forEach((c, i) => {
        const tl = M.TOOLS[c.id];
        const sel = s.tool.sel === i;
        const shake = sel && s.tool.shake > 0 ? Math.sin(t * 60) * 5 : 0;
        ctx.save();
        ctx.translate(shake, 0);
        D.panel(ctx, c.x, c.y, c.w, c.h, { fill: sel ? '#2a1a3a' : '#1c1420', edge: sel ? (s.tool.shake > 0 ? T.red : ACCENT) : '#3a2a44', radius: 10, glow: sel ? ACCENT : null });
        toolIcon(ctx, c.id, c.x + c.w / 2, c.y + 42, tl.color);
        D.control(ctx, { key: String(i + 1), pad: ['lb', 'rb', 'lt', 'rt'][i] }, c.x + 6, c.y + 18, { size: 12, color: sel ? ACCENT : '#5a4a66' });
        D.text(ctx, tl.name, c.x + c.w / 2, c.y + 88, { size: 15, weight: 700, align: 'center' });
        D.text(ctx, tl.tag, c.x + c.w / 2, c.y + 106, { size: 13, weight: 600, color: tl.color, align: 'center' });
        if (s.cfg.showUse) D.text(ctx, tl.use, c.x + c.w / 2, c.y + 123, { size: 11, color: T.dim, align: 'center' });
        ctx.restore();
      });
    } else {
      const tl = M.TOOLS[hz.tool];
      D.text(ctx, `${tl.name}: mantén`, a.x + 70, a.y + 26, { size: 20, weight: 800, color: tl.color });
      ctx.font = D.font(20, 800);
      const tw = ctx.measureText(`${tl.name}: mantén`).width;
      const cw = D.control(ctx, { key: 'ESPACIO', pad: 'a' }, a.x + 80 + tw, a.y + 19, { size: 15, color: tl.color });
      D.text(ctx, 'para aplicar', a.x + 90 + tw + cw, a.y + 26, { size: 20, weight: 800, color: tl.color });
      D.ring(ctx, a.x + a.w / 2, a.y + 150, 54, s.tool.progress / 1.1, tl.color, 12);
      toolIcon(ctx, hz.tool, a.x + a.w / 2, a.y + 150, tl.color);
    }
  }

  function toolIcon(ctx, id, x, y, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    if (id === 'escoba') {
      ctx.beginPath();
      ctx.moveTo(-14, -22);
      ctx.lineTo(6, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(18, 6);
      ctx.lineTo(22, 22);
      ctx.lineTo(-6, 22);
      ctx.closePath();
      ctx.fill();
    } else if (id === 'espuma') {
      for (const [dx, dy, r] of [[-10, 6, 10], [6, 0, 12], [12, 14, 8], [-4, -12, 8]]) {
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (id === 'peracetico') {
      D.roundRect(ctx, -12, -10, 24, 32, 6);
      ctx.fill();
      ctx.fillRect(-5, -20, 10, 10);
      ctx.fillStyle = '#140d12';
      ctx.fillRect(-8, 2, 16, 4);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.quadraticCurveTo(18, 4, 0, 22);
      ctx.quadraticCurveTo(-18, 4, 0, -22);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSidebar(s, ctx, t) {
    D.sidebar(ctx, 'FOCOS DE CONTAMINACIÓN');
    const x = D.VIEW.mapWidth + 18;
    s.hazards.forEach((h, i) => {
      const y = 100 + i * 38;
      const hz = M.HAZARDS[h.type];
      ctx.fillStyle = h.found ? D.T.okDark : '#1c1420';
      D.roundRect(ctx, x - 4, y, 290, 34, 8);
      ctx.fill();
      if (h.found || h.seen) monster(ctx, h.type, x + 16, y + 17, 10, t, h.found ? 1 : 0.6);
      else D.text(ctx, '?', x + 16, y + 24, { size: 20, weight: 800, color: '#5a4a66', align: 'center' });
      D.text(ctx, h.found ? hz.name : h.seen ? `${hz.name} (sin limpiar)` : '???', x + 38, y + 23, { size: 15, weight: 700, color: h.found ? T.ok : h.seen ? T.warn : '#6a5a76' });
      if (h.found) D.text(ctx, '✔', x + 276, y + 24, { size: 17, weight: 800, color: T.ok, align: 'right' });
    });
    D.text(ctx, 'HERRAMIENTAS', x, 306, { size: 13, weight: 700, color: T.dim });
    M.TOOL_ORDER.forEach((id, i) => {
      const tl = M.TOOLS[id];
      const y = 328 + i * 28;
      const w = D.control(ctx, { key: String(i + 1), pad: ['lb', 'rb', 'lt', 'rt'][i] }, x, y, { size: 11, color: tl.color });
      D.text(ctx, tl.name, x + w + 8, y + 5, { size: 14, weight: 700 });
      D.text(ctx, s.cfg.showUse ? tl.use : tl.tag, x + 286, y + 5, { size: 11, color: tl.color, align: 'right' });
    });
    const fact = s.fact && { kind: 'paper', label: `SABÍAS QUE… · ${s.fact.title}`, text: '', sub: s.fact.text, life: s.fact.life, max: s.fact.max };
    B.dock(ctx, D.dockRect(440), { bubble: s.bubble, notices: [fact, s.banner], t });
    D.footer(ctx, [
      [{ key: 'WASD', pad: 'lstick' }, 'mover'],
      [{ key: 'E', pad: 'x' }, 'limpiar'],
      [{ key: '1-4', pad: ['lb', 'rt'] }, 'herramienta'],
    ]);
  }

  function report(s) {
    const st = s.stats;
    const all = st.found >= TARGETS;
    let score = st.found * 16 + (all ? 10 + Math.round((s.timeLeft / s.duration) * 10) : 0) - st.errors * 6;
    score = Math.max(0, Math.min(100, score));
    const rank = D.rankFor(score);
    return {
      score,
      rank,
      headline: all ? 'Zona segura: los 5 focos de contaminación eliminados' : `${TARGETS - st.found} foco(s) de contaminación siguen en la línea`,
      rows: [
        ['Alertas de riesgo encontradas', `${st.found} de ${TARGETS}`, all ? T.ok : T.warn],
        ['Herramienta correcta al primer intento', `${st.firstTry} de ${st.found}`, st.firstTry === st.found ? T.ok : T.warn],
        ['Errores de herramienta', String(st.errors), st.errors ? T.red : T.ok],
        ['Falsas alarmas revisadas', String(st.decoys), T.ink],
        ['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)],
      ],
      mistakes: s.bubble.log.slice(),
    };
  }

  function icon(ctx, cx, cy, size, t) {
    // Linterna UV iluminando un fantasma de biofilm.
    ctx.save();
    const g = ctx.createRadialGradient(cx + size * 0.2, cy, 0, cx + size * 0.2, cy, size * 0.7);
    g.addColorStop(0, 'rgba(164,107,255,0.6)');
    g.addColorStop(1, 'rgba(164,107,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx + size * 0.2, cy, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    monster(ctx, 'biofilm', cx + size * 0.25, cy, size * 0.28, t, 1);
    ctx.save();
    ctx.translate(cx - size * 0.45, cy + size * 0.2);
    ctx.rotate(-0.3);
    ctx.fillStyle = '#3b3431';
    D.roundRect(ctx, -size * 0.2, -8, size * 0.4, 16, 4);
    ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.fillRect(size * 0.18, -9, 6, 18);
    ctx.restore();
  }

  PF.Games = PF.Games || [];
  PF.Games.push({
    id: 'hunter',
    order: 3,
    title: 'El Cazador de Riesgos',
    subtitle: 'Recorrido UV de 60 segundos',
    tagline: 'Linterna UV en mano: encuentra 5 focos de contaminación invisibles.',
    accent: ACCENT,
    icon,
    howTo: [
      'La línea está a oscuras: tu linterna UV revela lo que no se ve.',
      'Busca 5 "monstruos": vidrio roto, sarro, levadura seca y biofilm.',
      'Acércate, pulsa E y elige la herramienta correcta para limpiarlo.',
      'Cada limpieza muestra una ficha "Sabías que" del manual.',
    ],
    touch: { stick: true, main: [{ pad: 'a', label: 'Aplicar' }, { pad: 'x', label: 'Limpiar' }, { pad: 'b', label: 'Salir' }], aux: [{ pad: 'lb', label: '' }, { pad: 'rb', label: '' }, { pad: 'lt', label: '' }, { pad: 'rt', label: '' }] },
    controls: [
      ['WASD', 'moverse', 'lstick'],
      ['E', 'limpiar / revisar', 'x'],
      ['1-4', 'herramienta', ['lb', 'rb', 'lt', 'rt']],
      ['ESPACIO', 'aplicar', 'a'],
    ],
    difficulties: {
      facil: ['Linterna grande y flecha hacia el foco más cercano', 'Las herramientas dicen para qué sirven', 'Sin penalización de tiempo'],
      normal: ['Linterna mediana, sin flecha guía', '2 falsas alarmas que hacen perder tiempo', 'Herramienta equivocada: −2 s'],
      dificil: ['Linterna pequeña que parpadea', '4 falsas alarmas y sin marcas de lo ya visto', 'Herramienta equivocada: −4 s'],
    },
    create,
    monster,
  });
})();
