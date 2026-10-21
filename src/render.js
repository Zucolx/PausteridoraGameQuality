// Dibujo en canvas: planta, jugador, HUD, paneles de estación, mini-juegos y pantallas.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const C = PF.CONFIG;
  const Sim = PF.Sim;
  const MAP = C.MAP;
  const V = C.VIEW;

  const COL = {
    bg: '#0b0e12',
    floor: '#1a2027',
    floorLine: '#212932',
    wall: '#0e1216',
    hazard: '#e2b007',
    panel: '#11161c',
    panelEdge: '#2b3540',
    text: '#e8edf2',
    dim: '#8b97a5',
    faint: '#55616e',
    ok: '#4cd28a',
    okDark: '#1f5a3d',
    band: '#2f8a5d',
    warn: '#ffc93c',
    red: '#ff4b4b',
    beer: '#f2b134',
    gold: '#ffd34d',
    steel: '#5d6b78',
    steelDark: '#36414c',
    steelLight: '#8996a3',
    player: '#e8742c',
    playerDark: '#a84d17',
    visor: '#9fdcf2',
  };
  const SIMON_COLORS = ['#ff5a5a', '#4cd28a', '#4aa3ff', '#ffd34d'];
  const ARROW_GLYPH = { up: '↑', right: '→', down: '↓', left: '←' };
  const FONT = '"Rajdhani", "Segoe UI", system-ui, sans-serif';
  const MONO = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';

  // ----------------------------------------------------------- Utilidades

  function font(size, weight = 600, family = FONT) {
    return `${weight} ${size}px ${family}`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(ctx, str, x, y, { size = 16, weight = 600, color = COL.text, align = 'left', base = 'alphabetic', family = FONT } = {}) {
    ctx.font = font(size, weight, family);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillText(str, x, y);
  }

  function wrap(ctx, str, maxWidth) {
    const words = str.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function pathInfo(points) {
    const segs = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      segs.push({ a, b, len, start: total });
      total += len;
    }
    return { points, segs, total };
  }

  function pointAt(info, d) {
    for (const s of info.segs) {
      if (d <= s.start + s.len) {
        const t = (d - s.start) / s.len;
        return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
      }
    }
    return info.points[info.points.length - 1];
  }

  const PIPES = { main: pathInfo(MAP.pipe), good: pathInfo(MAP.pipeGood), bad: pathInfo(MAP.pipeBad) };
  const STATION_TOP = {};
  for (const st of Object.values(MAP.stations)) STATION_TOP[st.id] = { x: st.rect.x + st.rect.w / 2, y: st.rect.y - 8 };
  const FILL_TANK = MAP.obstacles.find((o) => o.label === 'LLENADO');
  const DRAIN_TANK = MAP.obstacles.find((o) => o.label === 'DESCARTE');

  function severityColor(sev) {
    return sev === 'red' ? COL.red : COL.warn;
  }

  function statusColor(status) {
    return status === 'ok' ? COL.ok : status === 'warn' ? COL.warn : COL.red;
  }

  function stationSeverity(g, alarms, id) {
    let sev = null;
    for (const a of alarms) {
      if (a.station !== id) continue;
      if (a.severity === 'red') return 'red';
      sev = 'warn';
    }
    return sev;
  }

  function stationShortName(id) {
    return { temp: 'Temperatura (T)', valve: 'Válvula (V)', pump: 'Bomba (B)', panel: 'Panel' }[id] || id;
  }

  function resetFx(r) {
    r.fx = { particles: [], floats: [], spawnAcc: 0, shake: 0, flash: 0, banner: null };
  }

  // ------------------------------------------------------------ Efectos

  function addFloat(r, x, y, str, color, size = 18, life = 1.2) {
    r.fx.floats.push({ x, y, str, color, size, life, max: life });
  }

  function banner(r, str, color, life = 1.8) {
    r.fx.banner = { str, color, life, max: life };
  }

  function onSignal(r, s) {
    const fx = r.fx;
    const top = STATION_TOP[s.station];
    switch (s.type) {
      case 'alarm':
        if (top) addFloat(r, top.x, top.y - 10, '¡' + s.name + '!', COL.warn, 16, 1.4);
        fx.shake = Math.max(fx.shake, 3);
        break;
      case 'resolved':
        if (top && s.byPlayer) addFloat(r, top.x, top.y - 10, '✔ Controlado', COL.ok, 18, 1.2);
        break;
      case 'volume':
        if (s.approved > 0.005) addFloat(r, FILL_TANK.x + FILL_TANK.w / 2, FILL_TANK.y - 6, '+' + Sim.fmt(s.approved, 2) + ' HL', COL.gold, 15, 1.0);
        if (s.discarded > 0.005) addFloat(r, DRAIN_TANK.x + DRAIN_TANK.w / 2, DRAIN_TANK.y + DRAIN_TANK.h + 22, '−' + Sim.fmt(s.discarded, 2) + ' HL', COL.red, 17, 1.0);
        break;
      case 'discardStart':
        fx.flash = Math.max(fx.flash, 0.35);
        break;
      case 'lineStop':
        banner(r, 'PARO DE LÍNEA', COL.red, 2.2);
        fx.shake = 8;
        break;
      case 'lineRestart':
        banner(r, 'LÍNEA REARRANCADA · purga ' + Sim.fmt(s.purge, 1) + ' HL', COL.warn, 1.6);
        break;
      case 'phase':
        if (s.index === 0) banner(r, '¡ARRANCA EL TURNO!', COL.gold, 1.4);
        else banner(r, s.label.toUpperCase(), s.peak ? COL.red : COL.warn, s.peak ? 2.2 : 1.5);
        if (s.peak) fx.shake = 6;
        break;
      case 'blocked':
        if (top) addFloat(r, top.x, top.y - 34, '⚡ BLOQUEADA', COL.red, 16, 1.4);
        break;
      case 'denied':
        if (top) addFloat(r, top.x, top.y - 34, 'Bloqueada…', COL.red, 14, 0.8);
        break;
    }
  }

  function update(r, g, dt) {
    const fx = r.fx;
    const flow = g.lineStopped ? 0 : Sim.effective(g, 'flow');
    fx.spawnAcc += flow * 11 * dt;
    while (fx.spawnAcc >= 1) {
      fx.spawnAcc -= 1;
      fx.particles.push({ path: 'main', d: 0 });
    }
    const speed = flow * 240;
    for (const p of fx.particles) {
      p.d += speed * dt;
      if (p.path === 'main' && p.d >= PIPES.main.total) {
        p.d -= PIPES.main.total;
        p.path = g.discardingNow ? 'bad' : 'good';
      }
      if (p.path !== 'main' && p.d >= PIPES[p.path].total) p.dead = true;
    }
    fx.particles = fx.particles.filter((p) => !p.dead);
    for (const f of fx.floats) {
      f.life -= dt;
      f.y -= 28 * dt;
    }
    fx.floats = fx.floats.filter((f) => f.life > 0);
    fx.shake = Math.max(0, fx.shake - dt * 18);
    fx.flash = Math.max(0, fx.flash - dt);
    if (fx.banner) {
      fx.banner.life -= dt;
      if (fx.banner.life <= 0) fx.banner = null;
    }
  }

  // --------------------------------------------------------------- Mapa

  function drawFloor(ctx) {
    ctx.fillStyle = COL.wall;
    ctx.fillRect(0, V.hud, V.mapWidth, V.height - V.hud);
    const b = MAP.bounds;
    ctx.fillStyle = COL.floor;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = COL.floorLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = b.x; x <= b.x + b.w; x += 48) {
      ctx.moveTo(x + 0.5, b.y);
      ctx.lineTo(x + 0.5, b.y + b.h);
    }
    for (let y = b.y; y <= b.y + b.h; y += 48) {
      ctx.moveTo(b.x, y + 0.5);
      ctx.lineTo(b.x + b.w, y + 0.5);
    }
    ctx.stroke();
    // Franja de seguridad en el perímetro.
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip('evenodd');
    ctx.fillStyle = '#1c1a10';
    ctx.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
    ctx.strokeStyle = COL.hazard;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = -b.h; i < b.w + b.h; i += 22) {
      ctx.moveTo(b.x + i, b.y - 10);
      ctx.lineTo(b.x + i + b.h + 20, b.y + b.h + 10);
    }
    ctx.stroke();
    ctx.restore();
  }

  function strokePath(ctx, points, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  function drawPipes(r, g) {
    const ctx = r.ctx;
    for (const pts of [MAP.pipe, MAP.pipeGood, MAP.pipeBad]) {
      strokePath(ctx, pts, 18, '#0d1115');
      strokePath(ctx, pts, 14, COL.steelDark);
      strokePath(ctx, pts, 6, '#46525e');
    }
    // Desviador: indica hacia dónde va la cerveza ahora mismo.
    const d = MAP.pipeGood[0];
    const bad = g.discardingNow;
    ctx.fillStyle = bad ? COL.red : COL.ok;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COL.wall;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
    ctx.fill();
    // Etiqueta del tubo de retención.
    ctx.save();
    ctx.translate(372, 400);
    ctx.rotate(-Math.PI / 2);
    text(ctx, 'TUBO DE RETENCIÓN', 0, 0, { size: 11, color: COL.faint, align: 'center', weight: 700 });
    ctx.restore();
    // Partículas de cerveza.
    for (const p of r.fx.particles) {
      const pt = pointAt(PIPES[p.path], p.d);
      ctx.fillStyle = p.path === 'bad' ? COL.red : p.path === 'good' ? COL.gold : COL.beer;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, p.path === 'main' ? 3.4 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawObstacles(r, g) {
    const ctx = r.ctx;
    for (const o of MAP.obstacles) {
      if (o.kind === 'tank') {
        const grad = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
        grad.addColorStop(0, COL.steelDark);
        grad.addColorStop(0.45, COL.steelLight);
        grad.addColorStop(1, COL.steelDark);
        ctx.fillStyle = grad;
        roundRect(ctx, o.x, o.y, o.w, o.h, 12);
        ctx.fill();
        ctx.strokeStyle = '#0d1115';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Nivel del tanque.
        let level = 0.6;
        let color = COL.beer;
        if (o.tone === 'good') {
          level = Math.min(0.92, g.stats.approved / 54);
          color = COL.gold;
        } else if (o.tone === 'bad') {
          level = Math.min(0.92, g.stats.discarded / 15);
          color = COL.red;
        }
        const ih = (o.h - 16) * level;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.8;
        ctx.fillRect(o.x + o.w - 16, o.y + o.h - 8 - ih, 8, ih);
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(o.x + o.w / 2 - 6, o.y + o.h / 2);
        ctx.rotate(-Math.PI / 2);
        text(ctx, o.label, 0, 4, { size: 12, weight: 700, color: o.tone === 'bad' ? '#ffb3b3' : '#10161b', align: 'center' });
        ctx.restore();
      } else {
        ctx.fillStyle = '#4a3a24';
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = '#2b2116';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 1.5, o.y + 1.5, o.w - 3, o.h - 3);
        ctx.beginPath();
        ctx.moveTo(o.x + 4, o.y + 4);
        ctx.lineTo(o.x + o.w - 4, o.y + o.h - 4);
        ctx.moveTo(o.x + o.w - 4, o.y + 4);
        ctx.lineTo(o.x + 4, o.y + o.h - 4);
        ctx.stroke();
        text(ctx, 'MALTA', o.x + o.w / 2, o.y + o.h / 2 + 5, { size: 13, weight: 700, color: '#c9a66b', align: 'center' });
      }
    }
  }

  function drawStation(r, g, st, sev, near) {
    const ctx = r.ctx;
    const { x, y, w, h } = st.rect;
    const t = r.t;
    const blocked = Sim.isBlocked(g, st.id);
    const blink = Math.floor(t * 6) % 2 === 0;

    // Pad de interacción.
    if (st.interactive) {
      ctx.fillStyle = near ? 'rgba(255,211,77,0.22)' : 'rgba(255,255,255,0.05)';
      ctx.strokeStyle = near ? COL.gold : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(st.spot.x, st.spot.y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Halo de alarma.
    if (sev) {
      const pulse = 0.5 + 0.5 * Math.sin(t * (sev === 'red' ? 12 : 6));
      ctx.save();
      ctx.shadowColor = severityColor(sev);
      ctx.shadowBlur = 18 + pulse * 18;
      ctx.strokeStyle = severityColor(sev);
      ctx.globalAlpha = 0.5 + pulse * 0.5;
      ctx.lineWidth = 4;
      roundRect(ctx, x - 5, y - 5, w + 10, h + 10, 10);
      ctx.stroke();
      ctx.restore();
    }

    // Carcasa.
    ctx.fillStyle = COL.steelDark;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = '#0d1115';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#2a333d';
    roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 5);
    ctx.fill();

    const cx = x + w / 2;
    const cy = y + h / 2;
    if (st.id === 'temp') {
      // Placas del intercambiador.
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 ? '#7d8a97' : '#9aa7b3';
        ctx.fillRect(x + 16 + i * 9, y + 14, 6, h - 28);
      }
      const hot = (g.vars.temp.value - 18) / 18;
      ctx.fillStyle = '#10161b';
      roundRect(ctx, x + w - 52, y + 14, 36, h - 28, 4);
      ctx.fill();
      ctx.fillStyle = hot > 0.6 ? COL.red : hot < 0.35 ? '#4aa3ff' : COL.beer;
      const th = (h - 36) * Math.max(0.05, Math.min(1, hot));
      ctx.fillRect(x + w - 40, y + h - 18 - th, 12, th);
    } else if (st.id === 'valve') {
      const ang = (g.vars.flow.value - 0.6) * 18;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.strokeStyle = '#d8423a';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(26, 0);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#8a1f1a';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (st.id === 'pump') {
      const flow = g.lineStopped ? 0 : Sim.effective(g, 'flow');
      ctx.fillStyle = '#26507a';
      ctx.beginPath();
      ctx.arc(cx - 30, cy, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(cx - 30, cy);
      ctx.rotate(t * flow * 14);
      ctx.fillStyle = '#9cc7f0';
      for (let i = 0; i < 3; i++) {
        ctx.rotate((Math.PI * 2) / 3);
        ctx.fillRect(0, -3, 20, 6);
      }
      ctx.restore();
      ctx.fillStyle = '#7d8a97';
      ctx.fillRect(cx + 4, cy - 14, 58, 28);
      ctx.fillStyle = '#10161b';
      for (let i = 0; i < 5; i++) ctx.fillRect(cx + 9 + i * 11, cy - 10, 5, 20);
    } else if (st.id === 'panel') {
      ctx.fillStyle = '#081016';
      roundRect(ctx, x + 10, y + 10, w - 20, h - 20, 4);
      ctx.fill();
      C.VAR_KEYS.forEach((k, i) => {
        const status = Sim.varStatus(g, k);
        const lx = x + 30 + i * 30;
        ctx.fillStyle = statusColor(status);
        ctx.globalAlpha = status === 'ok' ? 0.9 : blink ? 1 : 0.35;
        ctx.beginPath();
        ctx.arc(lx, y + 26, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        text(ctx, ['T', 'F', 'R'][i], lx, y + 48, { size: 11, color: COL.dim, align: 'center', weight: 700 });
      });
    }

    // Rótulo.
    const label = st.id === 'panel' ? 'PANEL DE ALARMAS' : st.id === 'temp' ? 'T · TEMPERATURA' : st.id === 'valve' ? 'V · VÁLVULA' : 'B · BOMBA';
    const ly = st.id === 'pump' ? y - 10 : y + h + 16;
    text(ctx, label, cx, ly, { size: 13, weight: 700, color: COL.dim, align: 'center' });

    // Marcador "!" de alarma.
    if (sev && st.interactive) {
      const by = y - 22 + Math.sin(t * 8) * 4 - (st.id === 'pump' ? 14 : 0);
      ctx.fillStyle = severityColor(sev);
      ctx.beginPath();
      ctx.moveTo(cx, by + 10);
      ctx.lineTo(cx - 13, by - 14);
      ctx.lineTo(cx + 13, by - 14);
      ctx.closePath();
      ctx.fill();
      text(ctx, '!', cx, by - 1, { size: 18, weight: 800, color: '#111', align: 'center' });
    }

    // Bloqueo: chispas y rojo intermitente.
    if (blocked) {
      ctx.fillStyle = blink ? 'rgba(255,75,75,0.45)' : 'rgba(255,75,75,0.15)';
      roundRect(ctx, x, y, w, h, 8);
      ctx.fill();
      ctx.strokeStyle = COL.gold;
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = t * 20 + i * 1.7;
        const sx = cx + Math.cos(a * 1.3) * w * 0.35;
        const sy = cy + Math.sin(a) * h * 0.3;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a) * 10, sy + Math.sin(a * 2) * 10);
        ctx.stroke();
      }
      text(ctx, 'BLOQUEADA', cx, cy + 6, { size: 16, weight: 800, color: '#fff', align: 'center' });
    }
  }

  function drawPlayer(r, g) {
    const ctx = r.ctx;
    const p = g.player;
    const bob = p.moving ? Math.sin(p.walkT * 16) * 2 : 0;
    const step = p.moving ? Math.sin(p.walkT * 16) * 4 : 0;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.scale(p.facing, 1);
    // Sombra.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 18 - bob, 17, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Mochila.
    ctx.fillStyle = COL.playerDark;
    roundRect(ctx, -20, -8, 9, 20, 4);
    ctx.fill();
    // Piernas.
    ctx.fillStyle = COL.playerDark;
    roundRect(ctx, -11, 8 + step * 0.5, 9, 10, 3);
    ctx.fill();
    roundRect(ctx, 3, 8 - step * 0.5, 9, 10, 3);
    ctx.fill();
    // Cuerpo.
    ctx.fillStyle = COL.player;
    roundRect(ctx, -13, -20, 26, 32, 12);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Visor.
    ctx.fillStyle = COL.visor;
    roundRect(ctx, -1, -14, 16, 10, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    roundRect(ctx, 6, -12, 6, 3, 1.5);
    ctx.fill();
    // Casco de seguridad.
    ctx.fillStyle = COL.gold;
    ctx.beginPath();
    ctx.ellipse(0, -19, 12, 5, 0, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }

  // Flecha alrededor del jugador hacia la alarma más urgente.
  function drawGuide(r, g, alarms) {
    const p = g.player;
    if (p.operating || !alarms.length) return;
    const a = alarms[0];
    const st = MAP.stations[a.station];
    if (!st || !st.interactive) return;
    const dx = st.spot.x - p.x;
    const dy = st.spot.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 90) return;
    const ang = Math.atan2(dy, dx);
    const ctx = r.ctx;
    ctx.save();
    ctx.translate(p.x + Math.cos(ang) * 38, p.y + Math.sin(ang) * 38);
    ctx.rotate(ang);
    ctx.fillStyle = severityColor(a.severity);
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(r.t * 10);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPrompt(r, g) {
    const p = g.player;
    if (p.operating) return;
    const id = Sim.nearestStation(g);
    if (!id) return;
    const ctx = r.ctx;
    const blocked = Sim.isBlocked(g, id);
    const x = p.x;
    const y = p.y - 44;
    ctx.fillStyle = blocked ? COL.red : COL.gold;
    roundRect(ctx, x - 13, y - 13, 26, 26, 5);
    ctx.fill();
    text(ctx, 'E', x, y + 6, { size: 18, weight: 800, color: '#111', align: 'center' });
    text(ctx, blocked ? 'bloqueada' : 'operar', x, y - 18, { size: 12, color: blocked ? COL.red : COL.gold, align: 'center' });
  }

  function drawFloats(r) {
    const ctx = r.ctx;
    for (const f of r.fx.floats) {
      ctx.globalAlpha = Math.min(1, f.life / (f.max * 0.4));
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.font = font(f.size, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.strokeText(f.str, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.str, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawMap(r, g, alarms) {
    const ctx = r.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, V.hud, V.mapWidth, V.height - V.hud);
    ctx.clip();
    if (r.fx.shake > 0) ctx.translate((Math.random() - 0.5) * r.fx.shake, (Math.random() - 0.5) * r.fx.shake);
    drawFloor(ctx);
    drawPipes(r, g);
    drawObstacles(r, g);
    const near = g.player.operating ? null : Sim.nearestStation(g);
    for (const st of Object.values(MAP.stations)) drawStation(r, g, st, stationSeverity(g, alarms, st.id), near === st.id);
    drawGuide(r, g, alarms);
    drawPlayer(r, g);
    drawPrompt(r, g);
    drawFloats(r);

    // Ambiente: hora pico y descarte.
    const ph = Sim.phase(g);
    if (ph.peak && !g.over) {
      const pulse = 0.5 + 0.5 * Math.sin(r.t * 7);
      const grad = ctx.createRadialGradient(480, 392, 220, 480, 392, 620);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(1, `rgba(255,30,30,${0.18 + pulse * 0.22})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, V.hud, V.mapWidth, V.height - V.hud);
    }
    if (r.fx.flash > 0) {
      ctx.fillStyle = `rgba(255,40,40,${r.fx.flash * 0.35})`;
      ctx.fillRect(0, V.hud, V.mapWidth, V.height - V.hud);
    }
    if (g.lineStopped) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, V.hud, V.mapWidth, V.height - V.hud);
      text(ctx, 'LÍNEA PARADA', 480, 300, { size: 40, weight: 800, color: COL.red, align: 'center' });
      text(ctx, 'Cerraste la válvula al mínimo: penalización y purga al rearrancar', 480, 330, { size: 16, color: COL.text, align: 'center' });
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD

  function drawTopBar(r, g) {
    const ctx = r.ctx;
    const s = g.stats;
    ctx.fillStyle = COL.panel;
    ctx.fillRect(0, 0, V.width, V.hud);
    ctx.fillStyle = COL.panelEdge;
    ctx.fillRect(0, V.hud - 2, V.width, 2);

    const stat = (label, value, x, color) => {
      text(ctx, label, x, 24, { size: 12, color: COL.dim, weight: 700 });
      text(ctx, value, x, 50, { size: 24, color, weight: 700, family: MONO });
    };
    stat('PROCESADO', Sim.fmt(s.processed, 1) + ' HL', 20, COL.text);
    stat('APROBADO', Sim.fmt(s.approved, 1) + ' HL', 170, COL.gold);
    stat('DESECHADO', Sim.fmt(s.discarded, 1) + ' HL', 320, COL.red);

    // Temporizador con la curva de dificultad debajo.
    const left = Sim.timeLeft(g);
    const secs = Math.ceil(left);
    const critical = left <= 10;
    const tc = critical && Math.floor(r.t * 4) % 2 ? COL.red : COL.text;
    text(ctx, `0:${String(secs).padStart(2, '0')}`, 640, 42, { size: 38, weight: 700, color: tc, align: 'center', family: MONO });
    const bx = 540;
    const bw = 200;
    let prev = 0;
    for (const ph of C.PHASES) {
      const x0 = bx + (prev / C.DURATION) * bw;
      const x1 = bx + (ph.until / C.DURATION) * bw;
      ctx.fillStyle = ph.peak ? '#5a1d1d' : '#2a333d';
      ctx.fillRect(x0 + 1, 52, x1 - x0 - 2, 5);
      prev = ph.until;
    }
    ctx.fillStyle = COL.gold;
    ctx.fillRect(bx, 52, (Math.min(g.time, C.DURATION) / C.DURATION) * bw, 5);

    const eff = s.processed > 0 ? (s.approved / s.processed) * 100 : 100;
    const effColor = eff >= 95 ? COL.ok : eff >= 85 ? COL.gold : eff >= 70 ? COL.warn : COL.red;
    text(ctx, 'EFICIENCIA', 800, 24, { size: 12, color: COL.dim, weight: 700 });
    text(ctx, Sim.fmt(eff, 1) + '%', 800, 50, { size: 24, color: effColor, weight: 700, family: MONO });
    const ph = Sim.phase(g);
    text(ctx, 'FASE', 960, 24, { size: 12, color: COL.dim, weight: 700 });
    text(ctx, ph.label, 960, 50, { size: 22, color: ph.peak ? COL.red : COL.text, weight: 700 });
    text(ctx, PF.Audio && PF.Audio.isMuted() ? 'M: sonido OFF' : 'M: sonido', 1262, 24, { size: 12, color: COL.faint, align: 'right' });
    text(ctx, 'P: pausa', 1262, 44, { size: 12, color: COL.faint, align: 'right' });
  }

  // Barra de medición: rango visible, zona aceptable, banda ideal y aguja.
  function drawGaugeBar(ctx, x, y, w, h, key, value, { lying = false, t = 0 } = {}) {
    const cfg = C.VARS[key];
    const span = cfg.viewMax - cfg.viewMin;
    const px = (v) => x + ((Math.max(cfg.viewMin, Math.min(cfg.viewMax, v)) - cfg.viewMin) / span) * w;
    ctx.fillStyle = '#3a1a1d';
    roundRect(ctx, x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = COL.okDark;
    ctx.fillRect(px(cfg.min), y, px(cfg.max) - px(cfg.min), h);
    ctx.fillStyle = COL.band;
    ctx.fillRect(px(cfg.ideal - cfg.band), y, px(cfg.ideal + cfg.band) - px(cfg.ideal - cfg.band), h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(px(cfg.ideal) - 1, y, 2, h);
    const nx = px(value);
    ctx.fillStyle = lying ? (Math.floor(t * 10) % 2 ? '#c38bff' : '#fff') : '#fff';
    ctx.fillRect(nx - 2, y - 4, 4, h + 8);
    ctx.beginPath();
    ctx.moveTo(nx - 6, y - 6);
    ctx.lineTo(nx + 6, y - 6);
    ctx.lineTo(nx, y + 1);
    ctx.closePath();
    ctx.fill();
  }

  function valueText(key, v) {
    const cfg = C.VARS[key];
    return Sim.fmt(v, cfg.decimals) + ' ' + cfg.unit;
  }

  function drawSidebar(r, g, alarms) {
    const ctx = r.ctx;
    const x0 = V.mapWidth;
    ctx.fillStyle = COL.panel;
    ctx.fillRect(x0, V.hud, V.width - x0, V.height - V.hud);
    ctx.fillStyle = COL.panelEdge;
    ctx.fillRect(x0, V.hud, 2, V.height - V.hud);
    text(ctx, 'INSTRUMENTOS', x0 + 20, 92, { size: 13, weight: 700, color: COL.dim });

    C.VAR_KEYS.forEach((key, i) => {
      const cfg = C.VARS[key];
      const y = 106 + i * 70;
      const d = Sim.display(g, key);
      const status = Sim.varStatus(g, key);
      const discarding = g.vars[key].discarding;
      text(ctx, cfg.label, x0 + 20, y + 14, { size: 15, weight: 700 });
      const shown = d.lying && Math.floor(r.t * 5) % 3 === 0 ? '?? ' + cfg.unit : valueText(key, d.value);
      const color = d.lying ? '#c38bff' : statusColor(status);
      text(ctx, shown, x0 + 300, y + 14, { size: 18, weight: 700, color, align: 'right', family: MONO });
      drawGaugeBar(ctx, x0 + 20, y + 26, 280, 14, key, d.value, { lying: d.lying, t: r.t });
      const note = d.lying ? 'SENSOR LOCO: lectura no fiable' : discarding ? '▼ DESCARTANDO · ' + cfg[g.vars[key].dir].effect : `rango ${Sim.fmt(cfg.min, cfg.decimals)}–${Sim.fmt(cfg.max, cfg.decimals)}`;
      text(ctx, note, x0 + 20, y + 58, { size: 12, color: d.lying ? '#c38bff' : discarding ? COL.red : COL.faint, weight: 600 });
    });

    text(ctx, 'ALARMAS', x0 + 20, 332, { size: 13, weight: 700, color: COL.dim });
    text(ctx, String(alarms.length), x0 + 300, 332, { size: 13, weight: 700, color: alarms.length ? COL.warn : COL.faint, align: 'right' });
    if (!alarms.length) {
      text(ctx, 'Sin alarmas. La línea respira…', x0 + 20, 362, { size: 14, color: COL.faint });
    }
    const blink = Math.floor(r.t * 5) % 2 === 0;
    alarms.slice(0, 5).forEach((a, i) => {
      const y = 344 + i * 66;
      const col = severityColor(a.severity);
      ctx.globalAlpha = a.blink && !blink ? 0.45 : 1;
      ctx.fillStyle = a.severity === 'red' ? '#2c1316' : '#2a2512';
      roundRect(ctx, x0 + 14, y, 292, 58, 6);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(x0 + 14, y, 6, 58);
      text(ctx, a.title, x0 + 30, y + 20, { size: 16, weight: 700, color: col });
      const blocked = Sim.isBlocked(g, a.station);
      text(ctx, '→ ' + stationShortName(a.station) + (blocked ? ' · BLOQUEADA' : ''), x0 + 298, y + 20, { size: 12, weight: 700, color: blocked ? COL.red : COL.text, align: 'right' });
      ctx.font = font(13, 500);
      const hint = wrap(ctx, a.hint, 268)[0];
      text(ctx, hint, x0 + 30, y + 42, { size: 13, weight: 500, color: COL.dim });
      if (a.event && a.event.kind === 'adjust' && a.event.settle > 0) {
        ctx.fillStyle = COL.ok;
        ctx.fillRect(x0 + 30, y + 50, 268 * Math.min(1, a.event.settle / C.SETTLE_TIME), 3);
      } else if (a.event && a.event.mg) {
        const ratio = PF.Minigames[a.event.mg.type].ratio(a.event.mg);
        if (ratio > 0) {
          ctx.fillStyle = COL.ok;
          ctx.fillRect(x0 + 30, y + 50, 268 * ratio, 3);
        }
      }
      ctx.globalAlpha = 1;
    });
    if (alarms.length > 5) text(ctx, `+${alarms.length - 5} más`, x0 + 298, 680, { size: 12, color: COL.dim, align: 'right' });
    text(ctx, 'WASD mover · E operar · A/D ajustar · ESPACIO reparar', x0 + 160, 708, { size: 11, color: COL.faint, align: 'center' });
  }

  // ------------------------------------------------- Panel de estación

  function drawStationPanel(r, g) {
    const id = g.player.operating;
    if (!id) return;
    const ctx = r.ctx;
    const st = MAP.stations[id];
    const key = st.variable;
    const cfg = C.VARS[key];
    const repair = Sim.activeRepair(g, id);
    const events = Sim.stationEvents(g, id);
    const blocked = Sim.isBlocked(g, id);

    const W = 620;
    const H = repair ? 360 : 230;
    const x = (V.mapWidth - W) / 2;
    const y = 690 - H;
    ctx.fillStyle = 'rgba(5,8,11,0.55)';
    ctx.fillRect(0, V.hud, V.mapWidth, V.height - V.hud);
    ctx.fillStyle = '#121a22';
    roundRect(ctx, x, y, W, H, 12);
    ctx.fill();
    ctx.strokeStyle = COL.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();

    text(ctx, st.name.toUpperCase(), x + 24, y + 34, { size: 22, weight: 700 });
    text(ctx, 'E / Esc  salir', x + W - 24, y + 32, { size: 13, color: COL.dim, align: 'right' });

    // Medidor principal.
    const d = Sim.display(g, key);
    const status = Sim.varStatus(g, key);
    const stuck = Sim.isStuck(g, key);
    text(ctx, cfg.label, x + 24, y + 70, { size: 15, color: COL.dim });
    const shown = d.lying && Math.floor(r.t * 5) % 3 === 0 ? '??' : valueText(key, d.value);
    text(ctx, shown, x + W - 24, y + 74, { size: 30, weight: 700, color: d.lying ? '#c38bff' : statusColor(status), align: 'right', family: MONO });
    drawGaugeBar(ctx, x + 24, y + 88, W - 48, 22, key, d.value, { lying: d.lying, t: r.t });
    text(ctx, Sim.fmt(cfg.viewMin, cfg.decimals), x + 24, y + 128, { size: 12, color: COL.faint });
    text(ctx, `ideal ${Sim.fmt(cfg.ideal, cfg.decimals)} ${cfg.unit}`, x + W / 2, y + 128, { size: 12, color: COL.dim, align: 'center' });
    text(ctx, Sim.fmt(cfg.viewMax, cfg.decimals), x + W - 24, y + 128, { size: 12, color: COL.faint, align: 'right' });

    let line;
    let lineColor = COL.dim;
    if (stuck) {
      line = 'VÁLVULA TRABADA: no responde hasta desatorarla';
      lineColor = COL.red;
    } else if (d.lying) {
      line = 'SENSOR LOCO: la lectura miente. Calibra antes de fiarte.';
      lineColor = '#c38bff';
    } else if (status === 'low' || status === 'high') {
      line = `${cfg[status].cause.toUpperCase()}: ${cfg[status].effect}. ◀ A · D ▶ para corregir`;
      lineColor = COL.red;
    } else {
      line = '◀ A · D ▶ ajustar   ·   mantén la aguja en la banda verde clara';
    }
    text(ctx, line, x + 24, y + 156, { size: 14, weight: 600, color: lineColor });

    // Derivas en esta estación.
    const drift = events.find((e) => e.kind === 'adjust');
    if (drift) {
      text(ctx, drift.name.toUpperCase() + ' — estabiliza en la banda ideal', x + 24, y + 186, { size: 14, weight: 700, color: COL.warn });
      ctx.fillStyle = '#26303a';
      ctx.fillRect(x + 24, y + 196, W - 48, 8);
      ctx.fillStyle = COL.ok;
      ctx.fillRect(x + 24, y + 196, (W - 48) * Math.min(1, drift.settle / C.SETTLE_TIME), 8);
    } else if (!repair) {
      const others = events.length ? '' : 'Sin fallas en esta estación.';
      text(ctx, others, x + 24, y + 194, { size: 14, color: COL.faint });
    }

    if (repair) drawMinigame(r, repair, x + 24, y + 218, W - 48, 124);

    if (blocked) {
      const blink = Math.floor(r.t * 6) % 2 === 0;
      ctx.fillStyle = blink ? 'rgba(120,10,10,0.85)' : 'rgba(80,10,10,0.85)';
      roundRect(ctx, x, y, W, H, 12);
      ctx.fill();
      text(ctx, '⚡ ESTACIÓN BLOQUEADA ⚡', x + W / 2, y + H / 2, { size: 30, weight: 800, color: '#fff', align: 'center' });
      text(ctx, 'Espera a que se restablezca…', x + W / 2, y + H / 2 + 30, { size: 15, color: '#ffd0d0', align: 'center' });
    }
  }

  function drawMinigame(r, ev, x, y, w, h) {
    const ctx = r.ctx;
    const mg = ev.mg;
    const t = r.t;
    ctx.fillStyle = '#0c1218';
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = mg.flash > 0 ? COL.red : '#24303b';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, ev.name.toUpperCase(), x + 14, y + 24, { size: 15, weight: 700, color: COL.warn });
    text(ctx, ev.hint, x + w - 14, y + 24, { size: 13, color: COL.text, align: 'right' });
    const cx = x + w / 2;
    const ratio = PF.Minigames[mg.type].ratio(mg);

    if (mg.type === 'hold') {
      text(ctx, mg.active ? 'ENFRIANDO…' : 'Mantén ESPACIO', cx, y + 60, { size: 22, weight: 800, color: mg.active ? '#7fd3ff' : COL.text, align: 'center' });
      progressBar(ctx, x + 40, y + 78, w - 80, 20, ratio, '#7fd3ff');
      if (mg.active) {
        for (let i = 0; i < 6; i++) {
          const px = x + 60 + ((t * 160 + i * 90) % (w - 120));
          text(ctx, '❄', px, y + 116, { size: 14, color: '#bfe8ff', align: 'center' });
        }
      }
    } else if (mg.type === 'arrows') {
      const n = mg.seq.length;
      const size = 48;
      const gap = 14;
      const sx = cx - (n * size + (n - 1) * gap) / 2;
      mg.seq.forEach((dir, i) => {
        const bx = sx + i * (size + gap);
        const done = i < mg.idx;
        const cur = i === mg.idx;
        ctx.fillStyle = mg.flash > 0 ? '#4a1414' : done ? COL.okDark : cur ? '#3b3418' : '#1d262f';
        roundRect(ctx, bx, y + 42, size, size, 8);
        ctx.fill();
        if (cur) {
          ctx.strokeStyle = COL.gold;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        text(ctx, ARROW_GLYPH[dir], bx + size / 2, y + 42 + size / 2 + 11, { size: 32, weight: 800, color: done ? COL.ok : cur ? COL.gold : COL.dim, align: 'center' });
      });
      text(ctx, mg.flash > 0 ? '¡Atascó! Secuencia nueva' : 'Flechas o WASD', cx, y + 114, { size: 13, color: mg.flash > 0 ? COL.red : COL.dim, align: 'center' });
    } else if (mg.type === 'pressure') {
      const gx = x + 40;
      const gw = w - 220;
      const gy = y + 52;
      ctx.fillStyle = '#26303a';
      roundRect(ctx, gx, gy, gw, 26, 6);
      ctx.fill();
      ctx.fillStyle = COL.okDark;
      ctx.fillRect(gx + mg.zone[0] * gw, gy, (mg.zone[1] - mg.zone[0]) * gw, 26);
      const inZone = mg.p >= mg.zone[0] && mg.p <= mg.zone[1];
      ctx.fillStyle = inZone ? COL.ok : COL.warn;
      ctx.fillRect(gx + mg.p * gw - 3, gy - 6, 6, 38);
      text(ctx, 'PRESIÓN', gx, gy + 48, { size: 12, color: COL.dim });
      text(ctx, 'ESPACIO sube · suelta para bajar', gx + gw, gy + 48, { size: 12, color: COL.dim, align: 'right' });
      // Progreso de purga como anillo.
      const rx = x + w - 80;
      const ry = y + 76;
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#26303a';
      ctx.beginPath();
      ctx.arc(rx, ry, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = COL.ok;
      ctx.beginPath();
      ctx.arc(rx, ry, 30, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
      ctx.stroke();
      text(ctx, 'PURGA', rx, ry + 5, { size: 12, weight: 700, color: COL.dim, align: 'center' });
    } else if (mg.type === 'timing') {
      const gx = x + 40;
      const gw = w - 80;
      const gy = y + 52;
      ctx.fillStyle = '#26303a';
      roundRect(ctx, gx, gy, gw, 30, 6);
      ctx.fill();
      ctx.fillStyle = mg.good > 0 ? COL.ok : '#2f6f8f';
      ctx.fillRect(gx + (mg.zone.c - mg.zone.w / 2) * gw, gy, mg.zone.w * gw, 30);
      ctx.fillStyle = mg.flash > 0 ? COL.red : '#fff';
      ctx.fillRect(gx + mg.pos * gw - 3, gy - 8, 6, 46);
      for (let i = 0; i < mg.need; i++) {
        ctx.fillStyle = i < mg.hits ? COL.ok : '#26303a';
        ctx.beginPath();
        ctx.arc(cx - (mg.need - 1) * 14 + i * 28, y + 106, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      text(ctx, 'ANTIESPUMANTE', gx, y + 110, { size: 12, color: COL.dim });
    } else if (mg.type === 'simon') {
      const size = 56;
      const gap = 18;
      const sx = cx - (4 * size + 3 * gap) / 2;
      for (let i = 0; i < 4; i++) {
        const bx = sx + i * (size + gap);
        const lit = mg.lit === i || (mg.press === i && mg.pressT > 0);
        ctx.fillStyle = SIMON_COLORS[i];
        ctx.globalAlpha = lit ? 1 : 0.25;
        roundRect(ctx, bx, y + 36, size, size, 10);
        ctx.fill();
        ctx.globalAlpha = 1;
        text(ctx, String(i + 1), bx + size / 2, y + 36 + size / 2 + 9, { size: 26, weight: 800, color: lit ? '#111' : '#ddd', align: 'center' });
      }
      const msg = mg.flash > 0 ? '¡Error! Mira el patrón de nuevo' : mg.phase === 'show' ? 'Memoriza el patrón…' : `Repite con 1-4  (${mg.idx}/${mg.seq.length})`;
      text(ctx, msg, cx, y + 114, { size: 13, color: mg.flash > 0 ? COL.red : COL.dim, align: 'center' });
    }
  }

  function progressBar(ctx, x, y, w, h, ratio, color) {
    ctx.fillStyle = '#26303a';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    if (ratio > 0) {
      ctx.fillStyle = color;
      roundRect(ctx, x, y, Math.max(h, w * ratio), h, h / 2);
      ctx.fill();
    }
  }

  function drawBanner(r) {
    const b = r.fx.banner;
    if (!b) return;
    const ctx = r.ctx;
    const k = b.life / b.max;
    const appear = Math.min(1, (1 - k) * 8);
    ctx.globalAlpha = Math.min(1, k * 3);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 150, V.mapWidth, 70);
    ctx.save();
    ctx.translate(V.mapWidth / 2, 198);
    ctx.scale(0.8 + 0.2 * appear, 0.8 + 0.2 * appear);
    text(ctx, b.str, 0, 0, { size: 44, weight: 800, color: b.color, align: 'center' });
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawGame(r, g) {
    PF.Draw.begin(r);
    const alarms = Sim.alarms(g);
    drawMap(r, g, alarms);
    drawStationPanel(r, g);
    drawBanner(r);
    drawTopBar(r, g);
    drawSidebar(r, g, alarms);
  }

  PF.Render = { resetFx, update, onSignal, drawGame };
})();
