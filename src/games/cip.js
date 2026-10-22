// CIP Rush: El Turno de la Limpieza.
// Recorre la línea de envasado y completa la limpieza que pide la orden:
// químico correcto → TACT en el panel → acción mecánica en la llenadora → ATP < 50 URL.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const W = PF.World;
  const B = PF.Bubble;
  const M = PF.Manual;
  const T = D.T;
  const ACCENT = '#ff7a1a';

  const DIFF = {
    facil: { showTargets: true, showKind: true, cipTime: 4, blobs: 4, scrubRate: 1.9, strokes: 4, timePenalty: 0, hardOrders: false },
    normal: { showTargets: false, showKind: false, cipTime: 5.5, blobs: 6, scrubRate: 1.4, strokes: 6, timePenalty: 0, hardOrders: false },
    dificil: { showTargets: false, showKind: false, cipTime: 7, blobs: 8, scrubRate: 1.1, strokes: 8, timePenalty: 3, hardOrders: true },
  };

  const STATIONS = {
    tanks: { id: 'tanks', name: 'TANQUES DE QUÍMICOS', rect: { x: 40, y: 112, w: 240, h: 120 }, spot: { x: 160, y: 264 } },
    panel: { id: 'panel', name: 'PANEL CIP', rect: { x: 400, y: 112, w: 160, h: 90 }, spot: { x: 480, y: 236 } },
    filler: { id: 'filler', name: 'LLENADORA', rect: { x: 700, y: 140, w: 210, h: 200 }, spot: { x: 662, y: 250 } },
    verify: { id: 'verify', name: 'VERIFICACIÓN ATP', rect: { x: 390, y: 612, w: 180, h: 74 }, spot: { x: 480, y: 572 } },
  };
  const OBSTACLES = [
    { x: 220, y: 420, w: 120, h: 80, kind: 'pallet' },
    { x: 600, y: 430, w: 110, h: 80, kind: 'pallet' },
    { x: 780, y: 340, w: 44, h: 350, kind: 'conveyor' },
  ];
  const WORLD = W.make({ solids: W.solidsOf(OBSTACLES, STATIONS), stations: STATIONS, start: { x: 480, y: 380 } });
  const CHEM_IDS = ['soda', 'nitrico', 'peracetico', 'agua'];
  const STEPS = [
    { key: 'chem', label: 'Químico correcto', station: 'tanks' },
    { key: 'tact', label: 'TACT configurado', station: 'panel' },
    { key: 'scrub', label: 'Acción mecánica', station: 'filler' },
    { key: 'atp', label: 'ATP < 50 URL', station: 'verify' },
  ];
  const H = { tanks: 390, panel: 410, filler: 350, verify: 330 };
  const PIPES = [
    [{ x: 280, y: 150 }, { x: 400, y: 150 }],
    [{ x: 560, y: 150 }, { x: 640, y: 150 }, { x: 640, y: 120 }, { x: 805, y: 120 }, { x: 805, y: 140 }],
  ];

  // ------------------------------------------------------------ Estado

  function create(diffId = 'normal', opts = {}) {
    const cfg = DIFF[diffId] || DIFF.normal;
    const s = {
      id: 'cip',
      diff: diffId,
      cfg,
      rng: D.makeRng(opts.seed),
      duration: 60,
      timeLeft: 60,
      time: 0,
      over: false,
      player: W.newPlayer(WORLD),
      operating: null,
      book: false,
      bubble: B.create(),
      floats: [],
      banner: null,
      queue: [],
      order: null,
      cleaning: null,
      task: null,
      stats: { lotes: 0, errors: 0, chemOk: 0, chemTotal: 0, atp: [], atpFails: 0 },
      ui: { chemSel: 0, tactRow: 0, repeat: 0, held: false, flash: 0, autoClose: 0, hoseFail: 0, brush: { x: 300, y: 100 }, scrubbing: false, swabHinted: false },
    };
    s.queue = buildOrders(s);
    nextOrder(s);
    s.world = WORLD;
    s.update = (dt, input) => update(s, dt, input);
    s.draw = (r) => draw(s, r);
    s.report = () => report(s);
    return s;
  }

  function buildOrders(s) {
    const pool = M.CIP_ORDERS.slice(1).filter((o) => !o.hard || s.cfg.hardOrders);
    let rest = [];
    while (rest.length < 8) rest = rest.concat(D.shuffle(s.rng, pool));
    return [M.CIP_ORDERS[0]].concat(rest);
  }

  function makeBlobs(s) {
    const blobs = [];
    for (let i = 0; i < s.cfg.blobs; i++) {
      let b;
      for (let tries = 0; tries < 40; tries++) {
        b = { x: 60 + s.rng() * 480, y: 50 + s.rng() * 120, r: 20 + s.rng() * 12, dirt: 1, seed: s.rng() * 10 };
        if (blobs.every((o) => Math.hypot(o.x - b.x, o.y - b.y) > o.r + b.r + 8)) break;
      }
      blobs.push(b);
    }
    return blobs;
  }

  function nextOrder(s) {
    s.order = s.queue.shift();
    s.cleaning = M.CLEANINGS[s.order.cleaning];
    const tact = {};
    for (const p of M.TACT_PARAMS) tact[p.key] = p.start;
    s.task = { chemical: null, cip: 'idle', cipT: 0, tact, blobs: makeBlobs(s), swab: null, atpFailed: false };
    s.ui.chemSel = 0;
    s.ui.tactRow = 0;
    s.banner = D.makeBanner('ORDEN DE LIMPIEZA', ACCENT, `${s.order.stop} → ${s.order.program}: ${s.cleaning.label}`, 3.4);
  }

  function dirtLeft(s) {
    const b = s.task.blobs;
    return b.reduce((a, x) => a + Math.max(0, x.dirt), 0) / b.length;
  }

  function stepState(s, key) {
    const k = s.task;
    if (key === 'chem') return k.chemical ? 'done' : 'todo';
    if (key === 'tact') return k.cip !== 'idle' ? 'done' : 'todo';
    if (key === 'scrub') return dirtLeft(s) <= 0 ? 'done' : 'todo';
    return k.atpFailed ? 'fail' : 'todo';
  }

  function nextStep(s) {
    return STEPS.find((st) => stepState(s, st.key) !== 'done') || null;
  }

  function mistake(s, msg) {
    B.say(s.bubble, msg);
    s.stats.errors++;
    if (s.cfg.timePenalty) {
      s.timeLeft -= s.cfg.timePenalty;
      D.floatAdd(s.floats, s.player.x, s.player.y - 70, `−${s.cfg.timePenalty} s`, T.red, 20);
    }
  }

  // ------------------------------------------------------------ Actualización

  function update(s, dt, input) {
    if (s.over) return;
    s.time += dt;
    s.timeLeft -= dt;
    B.update(s.bubble, dt);
    s.floats = D.floatsUpdate(s.floats, dt);
    D.tickBanner(s, dt);
    s.ui.flash = Math.max(0, s.ui.flash - dt);
    s.ui.hoseFail = Math.max(0, s.ui.hoseFail - dt);

    const k = s.task;
    if (k.cip === 'running') {
      k.cipT += dt;
      if (k.cipT >= s.cfg.cipTime) {
        k.cip = 'done';
        D.floatAdd(s.floats, 480, 100, 'CIP TERMINADO', T.ok, 18);
        D.sfx('resolved');
      }
    }
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      s.over = true;
      return;
    }

    const P = input.pressed;
    if (P.includes('tab')) s.book = !s.book;
    if (s.book) {
      if (P.includes('cancel')) s.book = false;
      return;
    }
    if (s.operating) {
      if (s.ui.autoClose > 0) {
        s.ui.autoClose -= dt;
        if (s.ui.autoClose <= 0) close(s);
      }
      if (P.includes('interact') || P.includes('cancel')) {
        close(s);
        return;
      }
      if (s.operating) STATION_UPDATE[s.operating](s, dt, input);
      return;
    }
    W.move(WORLD, s.player, input, dt);
    if (P.includes('interact')) {
      const st = W.nearest(WORLD, s.player);
      if (st) open(s, st.id);
    }
  }

  function close(s) {
    s.operating = null;
    s.ui.autoClose = 0;
    s.ui.scrubbing = false;
  }

  function open(s, id) {
    const k = s.task;
    if (id === 'panel' && !k.chemical) {
      mistake(s, 'Primero conecta el químico correcto en los TANQUES. Sin químico no hay CIP.');
      return;
    }
    if (id === 'filler') {
      if (k.cip === 'idle') {
        mistake(s, 'Sigue el orden: químico → TACT → acción mecánica → verificación. Primero arranca el CIP en el panel.');
        return;
      }
      if (dirtLeft(s) <= 0) {
        B.say(s.bubble, 'La llenadora ya quedó limpia. Ahora toca verificar con el luminómetro.', { kind: 'tip' });
        return;
      }
    }
    if (id === 'verify') {
      if (k.cip === 'idle') {
        mistake(s, 'Aún no hay limpieza que verificar: sigue el orden químico → TACT → acción mecánica → ATP.');
        return;
      }
      if (k.cip === 'running') {
        B.say(s.bubble, 'El CIP sigue corriendo: espera a que termine antes de tomar la muestra.', { kind: 'tip' });
        return;
      }
      k.swab = { strokes: 0, last: null, phase: 'swab', readT: 0, atp: 0, resultT: 0 };
    }
    if (id === 'filler') s.ui.brush = { x: 300, y: 100 };
    s.operating = id;
    D.sfx('enter');
  }

  function tankRects() {
    const a = D.modalArea(H.tanks);
    const w = 120;
    const gap = 30;
    const x0 = a.x + (a.w - (4 * w + 3 * gap)) / 2;
    return CHEM_IDS.map((id, i) => ({ id, x: x0 + i * (w + gap), y: a.y + 34, w, h: 150 }));
  }

  function connect(s, id) {
    const k = s.task;
    s.stats.chemTotal++;
    if (id === s.cleaning.chemical) {
      k.chemical = id;
      s.stats.chemOk++;
      D.floatAdd(s.floats, s.player.x, s.player.y - 60, '✔ Conectado', T.ok, 18);
      D.sfx('resolved');
      s.ui.autoClose = 0.9;
    } else {
      mistake(s, M.chemicalError(s.order.cleaning, id));
      s.ui.hoseFail = 0.6;
    }
  }

  function scrubArea() {
    const a = D.modalArea(H.filler);
    return { x: a.x, y: a.y + 30, w: 600, h: 210 };
  }

  const STATION_UPDATE = {
    tanks(s, dt, input) {
      if (s.task.chemical) return;
      const P = input.pressed;
      if (P.includes('left')) s.ui.chemSel = (s.ui.chemSel + 3) % 4;
      if (P.includes('right')) s.ui.chemSel = (s.ui.chemSel + 1) % 4;
      for (const d of ['1', '2', '3', '4']) {
        if (P.includes(d)) {
          s.ui.chemSel = +d - 1;
          connect(s, CHEM_IDS[s.ui.chemSel]);
          return;
        }
      }
      for (const c of input.clicks || []) {
        const hit = tankRects().find((r) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h + 60);
        if (hit) {
          s.ui.chemSel = CHEM_IDS.indexOf(hit.id);
          connect(s, hit.id);
          return;
        }
      }
      if (P.includes('space') || P.includes('confirm')) connect(s, CHEM_IDS[s.ui.chemSel]);
    },

    panel(s, dt, input) {
      const k = s.task;
      if (k.cip !== 'idle') return;
      const P = input.pressed;
      if (P.includes('up')) s.ui.tactRow = Math.max(0, s.ui.tactRow - 1);
      if (P.includes('down')) s.ui.tactRow = Math.min(M.TACT_PARAMS.length - 1, s.ui.tactRow + 1);
      const dir = input.moveX;
      if (dir) {
        s.ui.repeat -= dt;
        if (s.ui.repeat <= 0) {
          const p = M.TACT_PARAMS[s.ui.tactRow];
          const v = k.tact[p.key] + dir * p.step;
          k.tact[p.key] = Math.max(p.min, Math.min(p.max, Math.round(v / p.step) * p.step));
          k.tact[p.key] = +k.tact[p.key].toFixed(2);
          s.ui.repeat = s.ui.held ? 0.07 : 0.3;
          s.ui.held = true;
          D.sfx('adjust');
        }
      } else {
        s.ui.repeat = 0;
        s.ui.held = false;
      }
      if (P.includes('space') || P.includes('confirm')) {
        const err = M.tactError(s.order.cleaning, k.tact);
        if (err) {
          mistake(s, err);
          s.ui.flash = 0.5;
        } else {
          k.cip = 'running';
          k.cipT = 0;
          D.floatAdd(s.floats, 480, 100, 'CIP EN MARCHA', T.warn, 18);
          D.sfx('resolved');
          s.ui.autoClose = 1.1;
        }
      }
    },

    filler(s, dt, input) {
      const area = scrubArea();
      const br = s.ui.brush;
      br.x = Math.max(0, Math.min(area.w, br.x + input.moveX * 380 * dt));
      br.y = Math.max(0, Math.min(area.h, br.y + input.moveY * 380 * dt));
      const m = input.mouse;
      let mouseScrub = false;
      if (m && m.x >= area.x && m.x <= area.x + area.w && m.y >= area.y && m.y <= area.y + area.h && (m.moved || m.down)) {
        br.x = m.x - area.x;
        br.y = m.y - area.y;
        mouseScrub = m.down;
      }
      s.ui.scrubbing = input.space || mouseScrub;
      if (!s.ui.scrubbing || s.ui.autoClose > 0) return;
      for (const b of s.task.blobs) {
        if (b.dirt > 0 && Math.hypot(br.x - b.x, br.y - b.y) < b.r + 26) b.dirt -= s.cfg.scrubRate * dt;
      }
      if (dirtLeft(s) <= 0) {
        D.floatAdd(s.floats, s.player.x, s.player.y - 60, '✔ Llenadora limpia', T.ok, 18);
        D.sfx('resolved');
        s.ui.autoClose = 0.8;
      }
    },

    verify(s, dt, input) {
      const sw = s.task.swab;
      const P = input.pressed;
      if (sw.phase === 'swab') {
        for (const d of P) {
          if (d !== 'left' && d !== 'right') continue;
          if (d !== sw.last) {
            sw.strokes++;
            sw.last = d;
            D.sfx('blip');
          } else {
            s.ui.flash = 0.3;
            if (!s.ui.swabHinted) {
              s.ui.swabHinted = true;
              B.say(s.bubble, 'Frota en zigzag: alterna ← y → para que el hisopo recorra toda la superficie.', { kind: 'tip' });
            }
          }
        }
        if (sw.strokes >= s.cfg.strokes) {
          sw.phase = 'read';
          sw.readT = 0;
          sw.atp = Math.round(10 + s.rng() * 25 + dirtLeft(s) * 450);
        }
      } else if (sw.phase === 'read') {
        sw.readT += dt;
        if (sw.readT >= 1.6) {
          sw.phase = 'result';
          s.stats.atp.push(sw.atp);
          if (sw.atp < M.ATP_LIMIT) {
            s.stats.lotes++;
            s.banner = D.makeBanner('LOTE APROBADO', T.ok, `ATP ${sw.atp} URL < ${M.ATP_LIMIT} · limpieza verificada`, 2);
            D.sfx('end');
          } else {
            s.stats.atpFails++;
            s.task.atpFailed = true;
            B.say(s.bubble, `ATP ${sw.atp} URL: supera ${M.ATP_LIMIT}. Quedó suciedad en la llenadora: vuelve y repite la acción mecánica.`);
          }
        }
      } else {
        sw.resultT += dt;
        if (sw.resultT >= 1.3) {
          const ok = sw.atp < M.ATP_LIMIT;
          close(s);
          s.task.swab = null;
          if (ok) nextOrder(s);
        }
      }
    },
  };

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
    drawPipes(s, ctx, t);
    drawObstacles(ctx);
    const near = s.operating ? null : W.nearest(WORLD, s.player);
    const next = nextStep(s);
    for (const st of Object.values(STATIONS)) {
      const step = STEPS.find((x) => x.station === st.id);
      const state = stepState(s, step.key);
      const look = state === 'done' ? 'done' : state === 'fail' ? 'fail' : next && next.station === st.id ? 'next' : null;
      D.station(ctx, st, { t, near: near === st, state: st.id === 'panel' && s.task.cip === 'running' ? 'busy' : look });
      STATION_ART[st.id](s, ctx, st, t);
      if (next && next.station === st.id) D.marker(ctx, st.rect.x + st.rect.w / 2, st.rect.y - 16, t, ACCENT);
    }
    if (!s.operating && next) D.guide(ctx, s.player, STATIONS[next.station].spot, t, ACCENT);
    D.player(ctx, s.player, { tool: 'clipboard', t });
    if (near && !s.operating) D.prompt(ctx, s.player, near.name.toLowerCase());
    D.floatsDraw(ctx, s.floats);
    if (s.operating) MODAL[s.operating](s, ctx, t);
    if (s.book) drawBook(s, ctx);
    if (!s.operating && !s.book) B.marker(ctx, s.bubble, s.player, t);
    ctx.restore();

    D.hud(ctx, t, {
      title: 'CIP RUSH',
      diff: s.diff,
      timeLeft: s.timeLeft,
      duration: s.duration,
      accent: ACCENT,
      stats: [
        { label: 'Lotes aprobados', value: s.stats.lotes, color: T.ok, width: 170 },
        { label: 'Errores', value: s.stats.errors, color: s.stats.errors ? T.red : T.ink, width: 120 },
      ],
    });
    drawSidebar(s, ctx, t);
  }

  function drawPipes(s, ctx, t) {
    for (const p of PIPES) D.pipe(ctx, p);
    const k = s.task;
    if (k.chemical) {
      const color = M.CHEMICALS[k.chemical].color;
      ctx.save();
      ctx.setLineDash([10, 12]);
      ctx.lineDashOffset = -t * (k.cip === 'running' ? 80 : 20);
      for (const p of PIPES) D.strokePath(ctx, p, 5, color);
      ctx.restore();
    }
  }

  function drawObstacles(ctx) {
    for (const o of OBSTACLES) {
      if (o.kind === 'conveyor') {
        ctx.fillStyle = '#2b2320';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = '#4a3d36';
        for (let y = o.y + 6; y < o.y + o.h; y += 18) ctx.fillRect(o.x + 4, y, o.w - 8, 8);
        for (let y = o.y + 16; y < o.y + o.h - 10; y += 46) {
          ctx.fillStyle = '#7a4a1e';
          ctx.beginPath();
          ctx.arc(o.x + o.w / 2, y, 12, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#4a3220';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ['#2f5d8a', '#8a6a2f', '#2f5d8a'][i];
          ctx.beginPath();
          ctx.arc(o.x + 22 + i * 38, o.y + o.h / 2, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }
  }

  const STATION_ART = {
    tanks(s, ctx, st) {
      CHEM_IDS.forEach((id, i) => {
        const c = M.CHEMICALS[id];
        const x = st.rect.x + 16 + i * 55;
        const y = st.rect.y + 16;
        ctx.fillStyle = '#1b1411';
        D.roundRect(ctx, x, y, 44, 88, 8);
        ctx.fill();
        ctx.fillStyle = c.color;
        ctx.globalAlpha = s.task.chemical === id ? 1 : 0.65;
        D.roundRect(ctx, x + 4, y + 30, 36, 54, 6);
        ctx.fill();
        ctx.globalAlpha = 1;
      });
    },
    panel(s, ctx, st, t) {
      const { x, y, w } = st.rect;
      ctx.fillStyle = '#081016';
      D.roundRect(ctx, x + 12, y + 12, w - 24, 50, 4);
      ctx.fill();
      ['T', 'A', 'C', 'T'].forEach((l, i) => {
        ctx.fillStyle = s.task.cip === 'idle' ? '#4a3d36' : T.ok;
        ctx.fillRect(x + 22 + i * 30, y + 46 - ((i * 7 + t * (s.task.cip === 'running' ? 40 : 0)) % 26), 16, 6);
        D.text(ctx, l, x + 30 + i * 30, y + 78, { size: 12, weight: 700, color: T.dim, align: 'center' });
      });
      if (s.task.cip === 'running') D.progressBar(ctx, x + 12, y + 66, w - 24, 6, s.task.cipT / s.cfg.cipTime, T.warn);
    },
    filler(s, ctx, st, t) {
      const cx = st.rect.x + st.rect.w / 2;
      const cy = st.rect.y + st.rect.h / 2;
      ctx.fillStyle = '#4a4440';
      ctx.beginPath();
      ctx.arc(cx, cy, 82, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2320';
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.fill();
      const dirty = dirtLeft(s);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t * 0.2;
        const vx = cx + Math.cos(a) * 62;
        const vy = cy + Math.sin(a) * 62;
        ctx.fillStyle = '#b7aea6';
        ctx.beginPath();
        ctx.arc(vx, vy, 9, 0, Math.PI * 2);
        ctx.fill();
        if (dirty > 0 && i % 2 === 0) {
          ctx.fillStyle = `rgba(110,80,30,${0.3 + dirty * 0.7})`;
          ctx.beginPath();
          ctx.arc(vx + 3, vy - 2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      D.text(ctx, 'TAZÓN', cx, cy + 5, { size: 12, weight: 700, color: T.dim, align: 'center' });
    },
    verify(s, ctx, st) {
      const { x, y } = st.rect;
      ctx.fillStyle = '#e8e2d8';
      D.roundRect(ctx, x + 20, y + 16, 40, 44, 6);
      ctx.fill();
      ctx.fillStyle = '#0e2a12';
      ctx.fillRect(x + 26, y + 22, 28, 14);
      D.text(ctx, 'ATP', x + 40, y + 33, { size: 10, weight: 700, color: T.ok, align: 'center' });
      ctx.fillStyle = '#f2e3c6';
      ctx.fillRect(x + 80, y + 20, 70, 36);
      ctx.fillStyle = T.orangeDark;
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 86, y + 26 + i * 7, 40, 3);
    },
  };

  // ------------------------------------------------------------ Ventanas

  const MODAL = {
    tanks(s, ctx, t) {
      const a = D.modal(ctx, 'TANQUES DE QUÍMICOS — conecta la manguera', H.tanks, { accent: ACCENT });
      D.text(ctx, `Orden: ${s.cleaning.label}`, a.x, a.y + 4, { size: 17, weight: 700, color: ACCENT });
      const rects = tankRects();
      const inlet = { x: a.x + a.w / 2, y: a.y + a.h - 22 };
      rects.forEach((rc, i) => {
        const c = M.CHEMICALS[rc.id];
        const sel = s.ui.chemSel === i;
        const connected = s.task.chemical === rc.id;
        if (sel && !s.task.chemical) {
          ctx.save();
          ctx.shadowColor = ACCENT;
          ctx.shadowBlur = 20;
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 4;
          D.roundRect(ctx, rc.x - 6, rc.y - 6, rc.w + 12, rc.h + 72, 12);
          ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = '#2b2320';
        D.roundRect(ctx, rc.x, rc.y, rc.w, rc.h, 14);
        ctx.fill();
        const wave = Math.sin(t * 3 + i) * 3;
        ctx.fillStyle = c.color;
        ctx.globalAlpha = 0.85;
        D.roundRect(ctx, rc.x + 8, rc.y + 50 + wave, rc.w - 16, rc.h - 58 - wave, 10);
        ctx.fill();
        ctx.globalAlpha = 1;
        D.control(ctx, { key: String(i + 1), pad: ['lb', 'rb', 'lt', 'rt'][i] }, rc.x + 8, rc.y + 22, { size: 13, color: sel ? ACCENT : '#6e5a48' });
        ctx.font = D.font(16, 700);
        D.wrap(ctx, c.name, rc.w).forEach((l, j) => D.text(ctx, l, rc.x + rc.w / 2, rc.y + rc.h + 20 + j * 18, { size: 16, weight: 700, align: 'center', color: sel ? T.ink : T.dim }));
        const sub = [c.brand, s.cfg.showKind ? c.kind : ''].filter(Boolean).join(' · ');
        if (sub) D.text(ctx, sub, rc.x + rc.w / 2, rc.y + rc.h + 58, { size: 13, weight: 600, align: 'center', color: c.color });
        if (connected) D.text(ctx, '✔', rc.x + rc.w / 2, rc.y + 40, { size: 30, weight: 800, align: 'center', color: T.ok });
      });
      // Manguera desde el tanque elegido hasta la entrada de la línea CIP.
      const rc = rects[s.ui.chemSel];
      const from = { x: rc.x + rc.w / 2, y: rc.y + rc.h + 72 };
      const fail = s.ui.hoseFail > 0;
      ctx.strokeStyle = s.task.chemical ? M.CHEMICALS[s.task.chemical].color : fail ? (Math.floor(t * 12) % 2 ? T.red : '#5a1a10') : '#6e5a48';
      ctx.lineWidth = 8;
      ctx.setLineDash(s.task.chemical || fail ? [] : [8, 8]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y - 6);
      ctx.quadraticCurveTo(from.x, inlet.y, inlet.x - 40, inlet.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#4a4440';
      D.roundRect(ctx, inlet.x - 40, inlet.y - 14, 140, 28, 6);
      ctx.fill();
      D.text(ctx, 'LÍNEA CIP', inlet.x + 30, inlet.y + 5, { size: 14, weight: 800, align: 'center', color: T.ink });
      if (s.task.chemical) D.text(ctx, '✔ Químico conectado. Ve al PANEL CIP.', a.x + a.w, a.y + 4, { size: 14, weight: 700, color: T.ok, align: 'right' });
      else
        D.hints(
          ctx,
          [
            [{ key: '← →', pad: 'dpadLR' }, 'elegir'],
            [{ key: 'ESPACIO', pad: 'a' }, 'conectar'],
          ],
          a.x + a.w,
          a.y - 2,
          { size: 12, gap: 16, align: 'right', ink: T.dim }
        );
    },

    panel(s, ctx) {
      const a = D.modal(ctx, 'PANEL CIP — configura el TACT', H.panel, { accent: ACCENT });
      const k = s.task;
      const chem = M.CHEMICALS[k.chemical];
      D.text(ctx, `Orden: ${s.cleaning.label}`, a.x, a.y + 4, { size: 17, weight: 700, color: ACCENT });
      D.text(ctx, `Químico: ${chem.name}`, a.x + a.w, a.y + 4, { size: 15, weight: 700, color: chem.color, align: 'right' });
      const target = s.cleaning.tact;
      M.TACT_PARAMS.forEach((p, i) => {
        const y = a.y + 22 + i * 54;
        const sel = s.ui.tactRow === i && k.cip === 'idle';
        ctx.fillStyle = sel ? '#3a230f' : '#1e130e';
        D.roundRect(ctx, a.x, y, a.w, 46, 8);
        ctx.fill();
        if (sel) {
          ctx.strokeStyle = s.ui.flash > 0 ? T.red : ACCENT;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.fillStyle = sel ? ACCENT : '#5a4030';
        D.roundRect(ctx, a.x + 8, y + 7, 32, 32, 6);
        ctx.fill();
        D.text(ctx, p.label[0], a.x + 24, y + 30, { size: 20, weight: 800, color: '#170e0a', align: 'center' });
        D.text(ctx, p.label, a.x + 52, y + 22, { size: 17, weight: 700 });
        if (p.note) D.text(ctx, p.note, a.x + 52, y + 39, { size: 12, color: T.dim });
        const sx = a.x + 200;
        const sw = 250;
        const pos = (v) => sx + ((v - p.min) / (p.max - p.min)) * sw;
        ctx.fillStyle = '#2a1c15';
        D.roundRect(ctx, sx, y + 18, sw, 10, 5);
        ctx.fill();
        ctx.fillStyle = sel ? ACCENT : T.brass;
        D.roundRect(ctx, sx, y + 18, pos(k.tact[p.key]) - sx, 10, 5);
        ctx.fill();
        if (s.cfg.showTargets) {
          ctx.fillStyle = T.ok;
          ctx.fillRect(pos(target[p.key]) - 2, y + 10, 4, 26);
        }
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(pos(k.tact[p.key]), y + 23, 9, 0, Math.PI * 2);
        ctx.fill();
        const ok = Math.abs(k.tact[p.key] - target[p.key]) < 1e-6;
        D.text(ctx, `${M.fmtNum(k.tact[p.key], p.decimals)} ${p.unit}`, a.x + a.w - 12, y + 30, {
          size: 21,
          weight: 700,
          align: 'right',
          family: D.MONO,
          color: s.cfg.showTargets && ok ? T.ok : T.ink,
        });
        if (s.cfg.showTargets) D.text(ctx, `objetivo: ${M.fmtNum(target[p.key], p.decimals)} ${p.unit}`, sx, y + 43, { size: 12, weight: 700, color: T.ok });
      });
      const by = a.y + 22 + 4 * 54 + 8;
      if (k.cip === 'idle') {
        ctx.fillStyle = s.ui.flash > 0 ? T.red : ACCENT;
        D.roundRect(ctx, a.x, by, a.w, 44, 8);
        ctx.fill();
        D.text(ctx, '▶  INICIAR CIP', a.x + a.w / 2 - 20, by + 29, { size: 20, weight: 800, color: '#170e0a', align: 'center' });
        D.control(ctx, { key: 'ESPACIO', pad: 'a' }, a.x + a.w / 2 + 70, by + 22, { size: 14, color: '#170e0a', keyInk: ACCENT });
        D.hints(
          ctx,
          [
            [{ key: '↑ ↓', pad: 'dpadUD' }, 'parámetro'],
            [{ key: '← →', pad: 'dpadLR' }, 'ajustar (mantén)'],
            [{ key: 'TAB', pad: 'y' }, 'CIP Master Plan'],
          ],
          a.x + a.w / 2,
          by + 64,
          { size: 12, gap: 18, align: 'center', ink: T.dim }
        );
      } else {
        const done = k.cip === 'done';
        D.text(ctx, done ? '✔ CIP TERMINADO' : 'CIP EN CURSO…  ve a la LLENADORA mientras tanto', a.x, by + 20, { size: 17, weight: 800, color: done ? T.ok : T.warn });
        D.progressBar(ctx, a.x, by + 32, a.w, 14, done ? 1 : k.cipT / s.cfg.cipTime, done ? T.ok : T.warn);
      }
    },

    filler(s, ctx, t) {
      const a = D.modal(ctx, 'LLENADORA — acción mecánica (escobillado)', H.filler, { accent: ACCENT });
      const area = scrubArea();
      const left = dirtLeft(s);
      D.text(ctx, 'Frota las válvulas y el tazón hasta que no quede suciedad', a.x, a.y + 4, { size: 16, weight: 700, color: T.ink });
      D.text(ctx, `Suciedad: ${Math.round(left * 100)}%`, a.x + a.w, a.y + 4, { size: 16, weight: 800, color: left > 0 ? T.warn : T.ok, align: 'right' });
      ctx.save();
      ctx.beginPath();
      D.roundRect(ctx, area.x, area.y, area.w, area.h, 10);
      ctx.clip();
      const g = ctx.createLinearGradient(area.x, area.y, area.x + area.w, area.y + area.h);
      g.addColorStop(0, '#8e8b88');
      g.addColorStop(0.5, '#c9c5c0');
      g.addColorStop(1, '#7c7976');
      ctx.fillStyle = g;
      ctx.fillRect(area.x, area.y, area.w, area.h);
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(area.x + 50 + i * 100, area.y + area.h / 2, 34, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const b of s.task.blobs) {
        if (b.dirt <= 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          D.text(ctx, '✦', area.x + b.x, area.y + b.y + 6, { size: 18, color: '#fff', align: 'center' });
          continue;
        }
        ctx.fillStyle = `rgba(96,70,24,${0.25 + b.dirt * 0.75})`;
        ctx.beginPath();
        for (let j = 0; j < 9; j++) {
          const ang = (j / 9) * Math.PI * 2;
          const rr = b.r * (0.75 + 0.25 * Math.sin(ang * 3 + b.seed));
          const px = area.x + b.x + Math.cos(ang) * rr;
          const py = area.y + b.y + Math.sin(ang) * rr;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = `rgba(80,140,40,${b.dirt * 0.6})`;
        ctx.beginPath();
        ctx.arc(area.x + b.x - b.r * 0.3, area.y + b.y - b.r * 0.2, b.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      // Cepillo.
      const bx = area.x + s.ui.brush.x;
      const by = area.y + s.ui.brush.y;
      const wob = s.ui.scrubbing ? Math.sin(t * 40) * 5 : 0;
      ctx.fillStyle = '#7a4a1e';
      D.roundRect(ctx, bx - 26 + wob, by - 10, 52, 16, 5);
      ctx.fill();
      ctx.fillStyle = '#ffd34d';
      for (let i = 0; i < 9; i++) ctx.fillRect(bx - 24 + i * 6 + wob, by + 6, 3, 10);
      if (s.ui.scrubbing) {
        for (let i = 0; i < 5; i++) {
          const ang = t * 9 + i * 1.3;
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.beginPath();
          ctx.arc(bx + Math.cos(ang) * 30, by + Math.sin(ang * 1.3) * 22, 3 + (i % 2) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      D.progressBar(ctx, a.x, area.y + area.h + 12, a.w, 10, 1 - left, T.ok);
      D.hints(
        ctx,
        [
          [{ key: 'WASD / ratón', pad: 'lstick' }, 'mover el cepillo'],
          [{ key: 'ESPACIO', pad: 'a' }, 'mantén para frotar'],
        ],
        a.x + a.w / 2,
        area.y + area.h + 40,
        { size: 12, align: 'center', ink: T.dim }
      );
    },

    verify(s, ctx) {
      const a = D.modal(ctx, 'VERIFICACIÓN — luminometría ATP', H.verify, { accent: ACCENT });
      const sw = s.task.swab;
      if (!sw) return;
      // Superficie con el recorrido del hisopo en zigzag.
      const sx = a.x;
      const sy = a.y + 20;
      ctx.fillStyle = '#b9b4ae';
      D.roundRect(ctx, sx, sy, 300, 170, 10);
      ctx.fill();
      ctx.strokeStyle = T.uv;
      ctx.lineWidth = 4;
      ctx.beginPath();
      const n = s.cfg.strokes;
      for (let i = 0; i <= Math.min(sw.strokes, n); i++) {
        const px = sx + 30 + (i % 2) * 240;
        const py = sy + 20 + (i / n) * 130;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      const hx = sx + 30 + (sw.strokes % 2) * 240;
      const hy = sy + 20 + (Math.min(sw.strokes, n) / n) * 130;
      ctx.fillStyle = '#fff';
      ctx.fillRect(hx - 3, hy - 30, 6, 30);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.ellipse(hx, hy, 7, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      if (sw.phase === 'swab') {
        const want = sw.last === 'left' ? 'right' : sw.last === 'right' ? 'left' : null;
        for (const [dir, cx] of [
          ['left', sx + 100],
          ['right', sx + 200],
        ]) {
          const on = want === dir || !want;
          ctx.globalAlpha = on ? 1 : 0.35;
          const spec = { key: dir === 'left' ? '←' : '→', pad: dir };
          D.control(ctx, spec, cx - 18, sy + 200, { size: 22, color: on ? ACCENT : '#5a4030' });
          ctx.globalAlpha = 1;
        }
        D.text(ctx, `Zigzag ${sw.strokes}/${n}`, sx + 150, sy + 242, { size: 14, color: s.ui.flash > 0 ? T.red : T.dim, align: 'center' });
      }
      // Luminómetro.
      const lx = a.x + 340;
      const ly = a.y + 14;
      ctx.fillStyle = '#e8e2d8';
      D.roundRect(ctx, lx, ly, 240, 200, 18);
      ctx.fill();
      ctx.fillStyle = '#0b1a0d';
      D.roundRect(ctx, lx + 20, ly + 20, 200, 90, 8);
      ctx.fill();
      let shown = '----';
      let color = '#3c7a3c';
      let label = 'Esperando muestra';
      if (sw.phase === 'read') {
        shown = String(Math.round((sw.readT / 1.6) * sw.atp + Math.random() * 6));
        color = '#7dff8a';
        label = 'Midiendo…';
      } else if (sw.phase === 'result') {
        const ok = sw.atp < M.ATP_LIMIT;
        shown = String(sw.atp);
        color = ok ? '#7dff8a' : '#ff6b5a';
        label = ok ? '✔ APROBADO' : '✖ RECHAZADO';
      }
      D.text(ctx, shown, lx + 200, ly + 80, { size: 46, weight: 700, color, align: 'right', family: D.MONO });
      D.text(ctx, 'URL', lx + 32, ly + 46, { size: 14, color, family: D.MONO });
      D.text(ctx, label, lx + 120, ly + 142, { size: 20, weight: 800, color: sw.phase === 'result' ? color === '#7dff8a' ? '#2f8a3a' : '#c0321f' : '#3b3431', align: 'center' });
      D.text(ctx, `Límite: menos de ${M.ATP_LIMIT} URL`, lx + 120, ly + 176, { size: 14, weight: 700, color: '#5a4a40', align: 'center' });
    },
  };

  function drawBook(s, ctx) {
    const x = 90;
    const y = 120;
    const w = 780;
    const rows = Object.entries(M.CLEANINGS).filter(([key]) => key !== 'peracetico' || s.cfg.hardOrders);
    const h = 150 + rows.length * 46;
    ctx.fillStyle = 'rgba(8,4,3,0.7)';
    ctx.fillRect(0, D.VIEW.hud, D.VIEW.mapWidth, D.VIEW.height - D.VIEW.hud);
    D.panel(ctx, x, y, w, h, { fill: '#f2e3c6', edge: T.brass, radius: 10 });
    D.text(ctx, 'CIP MASTER PLAN', x + 24, y + 40, { size: 28, weight: 800, color: '#3a1d0c' });
    D.text(ctx, 'Punto 4 del afiche · consulta rápida', x + 270, y + 40, { size: 15, color: '#7a5030' });
    const cols = [
      ['Limpieza', 0],
      ['Químico', 230],
      ['Tiempo', 420],
      ['Acción', 500],
      ['Conc.', 590],
      ['Temp.', 670],
    ];
    cols.forEach(([c, dx]) => D.text(ctx, c, x + 24 + dx, y + 80, { size: 14, weight: 800, color: '#7a5030' }));
    rows.forEach(([key, cl], i) => {
      const ry = y + 112 + i * 46;
      const cur = key === s.order.cleaning;
      if (cur) {
        ctx.fillStyle = 'rgba(255,122,26,0.25)';
        ctx.fillRect(x + 12, ry - 26, w - 24, 40);
      }
      const v = cl.tact;
      const cells = [cl.label, M.chemLabel(cl.chemical), `${v.time} min`, `${M.fmtNum(v.action, 1)} m/s`, `${M.fmtNum(v.conc, 1)} %`, `${v.temp} °C`];
      cells.forEach((c, j) => D.text(ctx, c, x + 24 + cols[j][1], ry, { size: j < 2 ? 15 : 17, weight: 700, color: '#2a170d', family: j < 2 ? D.FONT : D.MONO }));
    });
    D.hints(ctx, [[{ key: 'TAB', pad: 'y' }, 'cerrar · el reloj sigue corriendo']], x + w / 2, y + h - 22, { size: 13, align: 'center', ink: '#7a5030', color: '#c4501a' });
  }

  function drawSidebar(s, ctx, t) {
    D.sidebar(ctx, 'ORDEN DE LIMPIEZA');
    const x = D.VIEW.mapWidth + 18;
    D.panel(ctx, x - 4, 100, 290, 76, { fill: '#2a170d', edge: ACCENT, radius: 8 });
    D.text(ctx, s.order.stop, x + 8, 118, { size: 13, weight: 600, color: T.dim });
    D.text(ctx, s.order.program, x + 8, 143, { size: 20, weight: 800, color: ACCENT });
    D.text(ctx, s.cleaning.label, x + 8, 166, { size: 15, weight: 700, color: T.ink });

    D.text(ctx, 'TARJETA DE VERIFICACIÓN', x, 198, { size: 13, weight: 700, color: T.dim });
    D.text(ctx, 'punto 8', x + 282, 198, { size: 11, color: T.faint, align: 'right' });
    const next = nextStep(s);
    STEPS.forEach((st, i) => {
      let state = stepState(s, st.key);
      if (state === 'todo' && next && next.key === st.key) state = 'next';
      D.checkRow(ctx, x - 4, 206 + i * 38, `${i + 1}. ${st.label}`, state, { width: 290 });
    });
    const k = s.task;
    if (k.cip !== 'idle') {
      D.text(ctx, k.cip === 'done' ? 'CIP terminado' : 'CIP en curso', x, 374, { size: 13, weight: 700, color: k.cip === 'done' ? T.ok : T.warn });
      D.progressBar(ctx, x + 100, 366, 186, 9, k.cip === 'done' ? 1 : k.cipT / s.cfg.cipTime, k.cip === 'done' ? T.ok : T.warn);
    }
    if (s.stats.atp.length) D.text(ctx, `ATP: ${s.stats.atp.slice(-3).join(' · ')} URL`, x, 396, { size: 13, color: T.dim });
    // Inventario del afiche (puntos 4, 6 y 8).
    const w = D.control(ctx, { key: 'TAB', pad: 'y' }, x, 424, { size: 12 });
    D.text(ctx, 'CIP Master Plan', x + w + 8, 429, { size: 14, weight: 700 });
    D.text(ctx, 'Afiche: p. 4 manual · p. 6 luminómetro · p. 8 tarjeta', x, 450, { size: 11, color: T.faint });

    B.dock(ctx, D.dockRect(462), { bubble: s.bubble, notices: [s.banner], t });
    D.footer(ctx, [
      [{ key: 'WASD', pad: 'lstick' }, 'mover'],
      [{ key: 'E', pad: 'x' }, 'operar'],
      [{ key: 'TAB', pad: 'y' }, 'manual'],
    ]);
  }

  // ------------------------------------------------------------ Reporte

  function report(s) {
    const st = s.stats;
    let score = st.lotes * 35 + (st.lotes > 0 && st.errors === 0 ? 10 : 0) - st.errors * 5 - st.atpFails * 5;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const rank = D.rankFor(score);
    return {
      score,
      rank,
      headline: st.lotes ? `${st.lotes} ${st.lotes === 1 ? 'lote liberado' : 'lotes liberados'} con ATP < ${M.ATP_LIMIT} URL` : 'Ningún lote liberado: la línea sigue parada',
      rows: [
        ['Lotes aprobados', String(st.lotes), T.ok],
        ['Químicos usados correctamente', `${st.chemOk} de ${st.chemTotal}`, st.chemOk === st.chemTotal ? T.ok : T.warn],
        ['Errores de procedimiento', String(st.errors), st.errors ? T.red : T.ok],
        ['Lecturas ATP (URL)', st.atp.length ? st.atp.join(' · ') : '—', T.ink],
        ['Puntuación de Calidad', `${score}/100`, D.rankColor(rank)],
      ],
      mistakes: s.bubble.log.slice(),
    };
  }

  // ------------------------------------------------------------ Icono del menú

  function icon(ctx, cx, cy, size, t) {
    // Boquilla de CIP rociando burbujas.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#9d938c';
    D.roundRect(ctx, -size * 0.55, -size * 0.12, size * 0.6, size * 0.24, 6);
    ctx.fill();
    ctx.fillStyle = ACCENT;
    D.roundRect(ctx, 0, -size * 0.18, size * 0.14, size * 0.36, 4);
    ctx.fill();
    for (let i = 0; i < 7; i++) {
      const k = (t * 0.8 + i / 7) % 1;
      const ang = -0.6 + (i % 3) * 0.6;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#bfe8ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(size * 0.2 + Math.cos(ang) * k * size * 0.5, Math.sin(ang) * k * size * 0.5, 4 + k * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  PF.Games = PF.Games || [];
  PF.Games.push({
    id: 'cip',
    order: 2,
    title: 'CIP Rush',
    subtitle: 'El Turno de la Limpieza',
    tagline: 'Químico, TACT, escobillado y ATP antes de que se acabe el turno.',
    accent: ACCENT,
    icon,
    howTo: [
      'La orden de limpieza dice qué toca (ej. CIP Intermedio · limpieza alcalina).',
      'Tanques: conecta la manguera del químico correcto.',
      'Panel CIP: ajusta Tiempo, Acción, Concentración y Temperatura (TACT).',
      'Llenadora: frota válvulas y tazón hasta quitar toda la suciedad.',
      'Verificación: hisopo + luminómetro. Menos de 50 URL = lote aprobado.',
    ],
    controls: [
      ['WASD', 'moverse', 'lstick'],
      ['E', 'operar', 'x'],
      ['ESPACIO', 'confirmar / frotar', 'a'],
      ['TAB', 'CIP Master Plan', 'y'],
    ],
    difficulties: {
      facil: ['Los tanques dicen si son alcalinos o ácidos', 'El panel marca el valor objetivo del TACT', 'Poca suciedad y CIP rápido'],
      normal: ['Consulta los valores en el CIP Master Plan (TAB)', 'Más suciedad en la llenadora', 'CIP de 5,5 s'],
      dificil: ['Cada error resta 3 segundos', 'Incluye sanitización química', 'Mucha suciedad y CIP lento'],
    },
    create,
  });
})();
