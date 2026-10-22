// Utilidades de dibujo compartidas por todos los juegos: lienzo escalado, texto,
// paneles, jugador, HUD y tema visual del afiche ("Lo que no se ve, también se limpia").
// No toca el DOM al cargarse, así que la lógica de los juegos se puede probar en Node.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  const VIEW = { width: 1280, height: 720, hud: 64, mapWidth: 960 };
  const MAP_BOUNDS = { x: 24, y: 88, w: 912, h: 608 };
  const FONT = '"Rajdhani", "Segoe UI", system-ui, sans-serif';
  const MONO = '"Share Tech Mono", ui-monospace, Menlo, Consolas, monospace';

  // Paleta del afiche: negros, naranjas oscuros y latón steampunk.
  const T = {
    bg: '#0a0605',
    floor: '#1a1210',
    floorLine: '#241915',
    wall: '#0d0807',
    panel: '#140c09',
    panel2: '#1e130e',
    edge: '#3d2619',
    ink: '#f5e8d3',
    dim: '#bfa48a',
    faint: '#7a6250',
    orange: '#ff7a1a',
    orangeDark: '#c4501a',
    ember: '#7a260c',
    brass: '#d0a55c',
    ok: '#7ddc6a',
    okDark: '#24502a',
    warn: '#ffb347',
    red: '#ff4b3a',
    uv: '#a46bff',
    toxic: '#9dff5c',
    steel: '#6b625d',
    steelDark: '#3b3431',
    steelLight: '#9d938c',
  };

  const DIFFICULTIES = [
    { id: 'facil', label: 'FÁCIL', color: '#7ddc6a', pumpkins: 1 },
    { id: 'normal', label: 'NORMAL', color: '#ffb347', pumpkins: 2 },
    { id: 'dificil', label: 'DIFÍCIL', color: '#ff4b3a', pumpkins: 3 },
  ];

  function font(size, weight = 600, family = FONT) {
    return `${weight} ${size}px ${family}`;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(ctx, str, x, y, { size = 16, weight = 600, color = T.ink, align = 'left', base = 'alphabetic', family = FONT } = {}) {
    ctx.font = font(size, weight, family);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillText(str, x, y);
  }

  function wrap(ctx, str, maxWidth) {
    const lines = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const w of para.split(' ')) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = w;
        } else line = test;
      }
      lines.push(line);
    }
    return lines;
  }

  // Párrafo con ajuste de línea; devuelve la altura usada.
  function paragraph(ctx, str, x, y, maxWidth, { size = 15, weight = 500, color = T.ink, lineHeight = size * 1.3, align = 'left', maxLines = 99 } = {}) {
    ctx.font = font(size, weight);
    const lines = wrap(ctx, str, maxWidth).slice(0, maxLines);
    lines.forEach((l, i) => text(ctx, l, x, y + i * lineHeight, { size, weight, color, align }));
    return lines.length * lineHeight;
  }

  function panel(ctx, x, y, w, h, { fill = T.panel, edge = T.edge, radius = 10, glow = null } = {}) {
    ctx.save();
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 24;
    }
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
  }

  function progressBar(ctx, x, y, w, h, ratio, color, back = '#2a1c15') {
    ctx.fillStyle = back;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ratio = Math.max(0, Math.min(1, ratio));
    if (ratio > 0) {
      ctx.fillStyle = color;
      roundRect(ctx, x, y, Math.max(h, w * ratio), h, h / 2);
      ctx.fill();
    }
  }

  function ring(ctx, x, y, r, ratio, color, width = 8) {
    ctx.lineWidth = width;
    ctx.strokeStyle = '#2a1c15';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.max(0, Math.min(1, ratio)) * Math.PI * 2);
    ctx.stroke();
  }

  // Tecla dibujada: [E]
  function keycap(ctx, label, x, y, { size = 16, color = T.orange, ink = '#140c09' } = {}) {
    ctx.font = font(size, 800);
    const w = Math.max(size * 1.5, ctx.measureText(label).width + size);
    const h = size * 1.6;
    ctx.fillStyle = color;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x - w / 2 + 2, y + h / 2 - 4, w - 4, 3);
    text(ctx, label, x, y + size * 0.36, { size, weight: 800, color: ink, align: 'center' });
    return w;
  }

  // ------------------------------------------------- Botones de mando

  // Dispositivo con el que se está jugando: 'keyboard', 'ps' o 'xbox' (lo actualiza main.js).
  const InputState = (PF.InputState = PF.InputState || { device: 'keyboard', padType: null });

  const FACE = {
    ps: { a: '#8fb8ff', b: '#ff7a7a', x: '#ff9be0', y: '#6fe0a8' },
    xbox: { a: '#5cc85c', b: '#e8473b', x: '#3d8fe0', y: '#f2c230' },
  };

  // Dibuja un botón del mando centrado en (x, y). Devuelve el ancho.
  function padGlyph(ctx, type, name, x, y, size = 16) {
    const r = size * 0.95;
    if (['a', 'b', 'x', 'y'].includes(name)) {
      const color = FACE[type === 'ps' ? 'ps' : 'xbox'][name];
      ctx.save();
      ctx.lineWidth = Math.max(2, size * 0.16);
      if (type === 'ps') {
        ctx.fillStyle = '#17171d';
        ctx.strokeStyle = '#4a4a55';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2.5, size * 0.17);
        const k = r * 0.45;
        ctx.beginPath();
        if (name === 'a') {
          ctx.moveTo(x - k, y - k);
          ctx.lineTo(x + k, y + k);
          ctx.moveTo(x + k, y - k);
          ctx.lineTo(x - k, y + k);
        } else if (name === 'b') {
          ctx.arc(x, y, k * 1.05, 0, Math.PI * 2);
        } else if (name === 'x') {
          ctx.rect(x - k * 0.9, y - k * 0.9, k * 1.8, k * 1.8);
        } else {
          ctx.moveTo(x, y - k * 1.1);
          ctx.lineTo(x + k * 1.05, y + k * 0.75);
          ctx.lineTo(x - k * 1.05, y + k * 0.75);
          ctx.closePath();
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.stroke();
        text(ctx, name.toUpperCase(), x, y + size * 0.36, { size: size * 1.05, weight: 800, color: '#fff', align: 'center' });
      }
      ctx.restore();
      return r * 2;
    }
    if (name.startsWith('dpad') || ['up', 'down', 'left', 'right'].includes(name)) {
      const arm = size * 0.42;
      const len = size * 0.95;
      const on = {
        up: ['dpad', 'dpadUD', 'up'].includes(name),
        down: ['dpad', 'dpadUD', 'down'].includes(name),
        left: ['dpad', 'dpadLR', 'left'].includes(name),
        right: ['dpad', 'dpadLR', 'right'].includes(name),
      };
      ctx.save();
      ctx.fillStyle = '#2a2a33';
      ctx.fillRect(x - arm, y - len, arm * 2, len * 2);
      ctx.fillRect(x - len, y - arm, len * 2, arm * 2);
      ctx.fillStyle = T.orange;
      const seg = len - arm;
      if (on.up) ctx.fillRect(x - arm + 2, y - len + 2, arm * 2 - 4, seg);
      if (on.down) ctx.fillRect(x - arm + 2, y + arm - 2, arm * 2 - 4, seg);
      if (on.left) ctx.fillRect(x - len + 2, y - arm + 2, seg, arm * 2 - 4);
      if (on.right) ctx.fillRect(x + arm - 2, y - arm + 2, seg, arm * 2 - 4);
      ctx.restore();
      return len * 2;
    }
    if (name.startsWith('lstick') || name.startsWith('rstick')) {
      ctx.save();
      ctx.fillStyle = '#17171d';
      ctx.strokeStyle = '#6a6a78';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3a3a46';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, name[0].toUpperCase(), x, y + size * 0.3, { size: size * 0.85, weight: 800, color: '#fff', align: 'center' });
      ctx.fillStyle = T.orange;
      const a = r * 1.25;
      const arrows = name.endsWith('V') ? [-1, 1].map((d) => [0, d]) : name.endsWith('H') ? [-1, 1].map((d) => [d, 0]) : [];
      for (const [dx, dy] of arrows) {
        ctx.beginPath();
        ctx.moveTo(x + dx * (a + 5), y + dy * (a + 5));
        ctx.lineTo(x + dx * a + dy * 5, y + dy * a + dx * 5);
        ctx.lineTo(x + dx * a - dy * 5, y + dy * a - dx * 5);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      return r * 2;
    }
    // Gatillos, hombros y botones de menú: etiqueta en cápsula.
    const label = PF.Pad ? PF.Pad.label(type, name) : name.toUpperCase();
    ctx.font = font(size * 0.8, 800);
    const w = Math.max(size * 1.9, ctx.measureText(label).width + size * 0.9);
    const h = size * 1.5;
    ctx.fillStyle = '#2a2a33';
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = '#6a6a78';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, label, x, y + size * 0.28, { size: size * 0.8, weight: 800, color: '#fff', align: 'center' });
    return w;
  }

  function keyWidth(ctx, label, size) {
    ctx.font = font(size, 800);
    return Math.max(size * 1.5, ctx.measureText(label).width + size);
  }

  // Control según el dispositivo activo: tecla en teclado, botón(es) en el mando.
  // spec = { key: 'W / S', pad: 'dpadUD' | ['dpadUD', 'lstickV'] }. Dibuja desde x (izquierda); devuelve el ancho.
  function control(ctx, spec, x, y, { size = 15, color = T.orange, device = InputState.device } = {}) {
    if (device === 'keyboard' || !spec.pad) {
      const w = keyWidth(ctx, spec.key, size);
      keycap(ctx, spec.key, x + w / 2, y, { size, color });
      return w;
    }
    const list = Array.isArray(spec.pad) ? spec.pad : [spec.pad];
    let cx = x;
    list.forEach((name, i) => {
      if (i) {
        text(ctx, '/', cx + 6, y + size * 0.35, { size, weight: 700, color: T.dim, align: 'center' });
        cx += 12;
      }
      const w = measureGlyph(ctx, device, name, size);
      padGlyph(ctx, device, name, cx + w / 2, y, size);
      cx += w;
    });
    return cx - x;
  }

  function measureGlyph(ctx, type, name, size) {
    if (['a', 'b', 'x', 'y'].includes(name) || name.includes('stick')) return size * 1.9;
    if (name.startsWith('dpad') || ['up', 'down', 'left', 'right'].includes(name)) return size * 1.9;
    const label = PF.Pad ? PF.Pad.label(type, name) : name.toUpperCase();
    ctx.font = font(size * 0.8, 800);
    return Math.max(size * 1.9, ctx.measureText(label).width + size * 0.9);
  }

  // Fila de ayudas "[control] acción" separadas; devuelve el ancho total.
  function hints(ctx, items, x, y, { size = 15, gap = 26, color = T.orange, ink = T.ink, align = 'left' } = {}) {
    const widths = items.map(([spec, label]) => {
      const cw = spec.key || spec.pad ? measureControl(ctx, spec, size) : 0;
      ctx.font = font(size + 1, 600);
      return cw + 8 + ctx.measureText(label).width;
    });
    const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    items.forEach(([spec, label], i) => {
      const cw = control(ctx, spec, cx, y, { size, color });
      text(ctx, label, cx + cw + 8, y + size * 0.38, { size: size + 1, weight: 600, color: ink });
      cx += widths[i] + gap;
    });
    return total;
  }

  function measureControl(ctx, spec, size, device = InputState.device) {
    if (device === 'keyboard' || !spec.pad) return keyWidth(ctx, spec.key, size);
    const list = Array.isArray(spec.pad) ? spec.pad : [spec.pad];
    return list.reduce((a, n, i) => a + measureGlyph(ctx, device, n, size) + (i ? 12 : 0), 0);
  }

  // Calabaza de dificultad (1-3 encendidas).
  function pumpkin(ctx, x, y, s, lit) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = lit ? T.orange : '#3a2418';
    for (const dx of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.ellipse(dx * s, 0, s * 0.42, s * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = lit ? '#3c7a2a' : '#2a2018';
    ctx.fillRect(-s * 0.08, -s * 0.72, s * 0.16, s * 0.28);
    if (lit) {
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -s * 0.12);
      ctx.lineTo(-s * 0.15, -s * 0.12);
      ctx.lineTo(-s * 0.25, -s * 0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.35, -s * 0.12);
      ctx.lineTo(s * 0.15, -s * 0.12);
      ctx.lineTo(s * 0.25, -s * 0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.45, s * 0.35, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.28, -s * 0.35, s * 0.12);
      ctx.fill();
    }
    ctx.restore();
  }

  function difficulty(id) {
    return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];
  }

  // Operario estilo "Among Us" con casco; opcionalmente lleva una herramienta.
  function player(ctx, p, { color = '#e8742c', dark = '#a84d17', tool = null, t = 0 } = {}) {
    const bob = p.moving ? Math.sin(p.walkT * 16) * 2 : 0;
    const step = p.moving ? Math.sin(p.walkT * 16) * 4 : 0;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 18 - bob, 17, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(p.facing || 1, 1);
    ctx.fillStyle = dark;
    roundRect(ctx, -20, -8, 9, 20, 4);
    ctx.fill();
    roundRect(ctx, -11, 8 + step * 0.5, 9, 10, 3);
    ctx.fill();
    roundRect(ctx, 3, 8 - step * 0.5, 9, 10, 3);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(ctx, -13, -20, 26, 32, 12);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#9fdcf2';
    roundRect(ctx, -1, -14, 16, 10, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    roundRect(ctx, 6, -12, 6, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.ellipse(0, -19, 12, 5, 0, Math.PI, 0);
    ctx.fill();
    if (tool === 'flashlight') {
      ctx.fillStyle = '#2b2b33';
      roundRect(ctx, 10, -2, 16, 7, 2);
      ctx.fill();
      ctx.fillStyle = T.uv;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9);
      ctx.beginPath();
      ctx.arc(27, 1.5, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (tool === 'clipboard') {
      ctx.fillStyle = '#f2e3c6';
      ctx.fillRect(10, -4, 11, 14);
      ctx.fillStyle = T.orangeDark;
      ctx.fillRect(13, -6, 5, 3);
    }
    ctx.restore();
  }

  // Suelo de planta con franja de seguridad.
  function floor(ctx, b = MAP_BOUNDS, { floorColor = T.floor, line = T.floorLine, stripe = T.orangeDark } = {}) {
    ctx.fillStyle = T.wall;
    ctx.fillRect(0, VIEW.hud, VIEW.mapWidth, VIEW.height - VIEW.hud);
    ctx.fillStyle = floorColor;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = line;
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
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip('evenodd');
    ctx.fillStyle = '#140b07';
    ctx.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20);
    ctx.strokeStyle = stripe;
    ctx.globalAlpha = 0.6;
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

  function pipe(ctx, points) {
    strokePath(ctx, points, 16, '#0d0807');
    strokePath(ctx, points, 12, T.steelDark);
    strokePath(ctx, points, 5, '#544a44');
  }

  // Estación genérica del mapa: carcasa, halo de estado, rótulo y pad de interacción.
  function station(ctx, st, { t = 0, near = false, state = null, label = st.name, labelBelow = true } = {}) {
    const { x, y, w, h } = st.rect;
    if (st.spot) {
      ctx.fillStyle = near ? 'rgba(255,122,26,0.22)' : 'rgba(255,255,255,0.05)';
      ctx.strokeStyle = near ? T.orange : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(st.spot.x, st.spot.y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (state) {
      const color = state === 'next' ? T.orange : state === 'done' ? T.ok : state === 'busy' ? T.warn : T.red;
      const pulse = 0.5 + 0.5 * Math.sin(t * (state === 'next' ? 6 : 3));
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 14 + pulse * 16;
      ctx.strokeStyle = color;
      ctx.globalAlpha = state === 'done' ? 0.6 : 0.5 + pulse * 0.5;
      ctx.lineWidth = 4;
      roundRect(ctx, x - 5, y - 5, w + 10, h + 10, 10);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = T.steelDark;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = '#0d0807';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#2b2320';
    roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 5);
    ctx.fill();
    if (label) text(ctx, label, x + w / 2, labelBelow ? y + h + 16 : y - 8, { size: 13, weight: 700, color: T.dim, align: 'center' });
  }

  // Marcador flotante "!" o "✔" sobre una estación.
  function marker(ctx, x, y, t, color, glyph = '!') {
    const by = y + Math.sin(t * 8) * 4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, by + 10);
    ctx.lineTo(x - 13, by - 14);
    ctx.lineTo(x + 13, by - 14);
    ctx.closePath();
    ctx.fill();
    text(ctx, glyph, x, by - 1, { size: 17, weight: 800, color: '#111', align: 'center' });
  }

  // Flecha alrededor del jugador hacia un objetivo.
  function guide(ctx, p, target, t, color = T.orange) {
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    if (Math.hypot(dx, dy) < 90) return;
    const ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(p.x + Math.cos(ang) * 40, p.y + Math.sin(ang) * 40);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 10);
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-6, -9);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // "[E] operar" sobre la cabeza del jugador.
  function prompt(ctx, p, label, color = T.orange) {
    keycap(ctx, 'E', p.x, p.y - 44, { size: 15, color });
    text(ctx, label, p.x, p.y - 62, { size: 13, weight: 700, color, align: 'center' });
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // Barra superior común: título del juego, reloj y estadísticas.
  function hud(ctx, t, { title, diff, timeLeft, duration, stats = [], accent = T.orange }) {
    ctx.fillStyle = T.panel;
    ctx.fillRect(0, 0, VIEW.width, VIEW.hud);
    ctx.fillStyle = accent;
    ctx.fillRect(0, VIEW.hud - 3, VIEW.width, 3);
    text(ctx, title, 20, 30, { size: 20, weight: 700, color: accent });
    const d = difficulty(diff);
    text(ctx, d.label, 20, 52, { size: 13, weight: 700, color: d.color });
    for (let i = 0; i < 3; i++) pumpkin(ctx, 108 + i * 24, 46, 12, i < d.pumpkins);

    const critical = timeLeft <= 10;
    const tc = critical && Math.floor(t * 4) % 2 ? T.red : T.ink;
    text(ctx, formatTime(timeLeft), 640, 42, { size: 38, weight: 700, color: tc, align: 'center', family: MONO });
    progressBar(ctx, 560, 52, 160, 5, 1 - timeLeft / duration, critical ? T.red : accent);

    let x = 780;
    for (const s of stats) {
      text(ctx, s.label.toUpperCase(), x, 24, { size: 12, color: T.dim, weight: 700 });
      text(ctx, String(s.value), x, 50, { size: 22, weight: 700, color: s.color || T.ink, family: s.mono === false ? FONT : MONO });
      x += s.width || 160;
    }
    hints(ctx, [[{ key: 'P', pad: 'start' }, 'pausa']], VIEW.width - 14, 18, { size: 11, align: 'right', ink: T.faint, color: '#6e5a48' });
  }

  function sidebar(ctx, title) {
    const x0 = VIEW.mapWidth;
    ctx.fillStyle = T.panel;
    ctx.fillRect(x0, VIEW.hud, VIEW.width - x0, VIEW.height - VIEW.hud);
    ctx.fillStyle = T.edge;
    ctx.fillRect(x0, VIEW.hud, 2, VIEW.height - VIEW.hud);
    if (title) text(ctx, title, x0 + 20, 92, { size: 13, weight: 700, color: T.dim });
  }

  // Casilla de verificación de la "Tarjeta de verificación".
  function checkRow(ctx, x, y, label, state, { width = 270 } = {}) {
    const done = state === 'done';
    const fail = state === 'fail';
    const next = state === 'next';
    ctx.fillStyle = done ? T.okDark : fail ? '#4a1410' : next ? '#3a230f' : '#22160f';
    roundRect(ctx, x, y, width, 34, 6);
    ctx.fill();
    ctx.strokeStyle = done ? T.ok : fail ? T.red : next ? T.orange : '#3d2619';
    ctx.lineWidth = 2;
    roundRect(ctx, x + 8, y + 8, 18, 18, 4);
    ctx.stroke();
    if (done) text(ctx, '✔', x + 17, y + 23, { size: 16, weight: 800, color: T.ok, align: 'center' });
    if (fail) text(ctx, '✖', x + 17, y + 23, { size: 16, weight: 800, color: T.red, align: 'center' });
    text(ctx, label, x + 36, y + 22, { size: 15, weight: 600, color: done ? T.ok : fail ? T.red : next ? T.ink : T.dim });
  }

  // Ventana de estación sobre el mapa (oscurece el fondo). Devuelve el área interior.
  function modalArea(H, W = 640) {
    const x = (VIEW.mapWidth - W) / 2;
    const y = Math.max(VIEW.hud + 12, VIEW.height - 24 - H);
    return { x: x + 20, y: y + 60, w: W - 40, h: H - 74, outer: { x, y, w: W, h: H } };
  }

  function modal(ctx, title, H, { W = 640, accent = T.orange, hint = 'E / Esc  salir' } = {}) {
    const { x, y } = modalArea(H, W).outer;
    ctx.fillStyle = 'rgba(8,4,3,0.6)';
    ctx.fillRect(0, VIEW.hud, VIEW.mapWidth, VIEW.height - VIEW.hud);
    panel(ctx, x, y, W, H, { fill: '#170e0a', edge: accent, radius: 12 });
    ctx.fillStyle = accent;
    roundRect(ctx, x, y, W, 46, 12);
    ctx.fill();
    ctx.fillRect(x, y + 30, W, 16);
    text(ctx, title, x + 20, y + 31, { size: 21, weight: 800, color: '#170e0a' });
    if (hint) text(ctx, hint, x + W - 18, y + 30, { size: 13, weight: 700, color: '#170e0a', align: 'right' });
    return modalArea(H, W);
  }

  // Cartel grande temporal en el centro del mapa.
  function banner(ctx, b) {
    if (!b) return;
    const k = b.life / b.max;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 3);
    const h = b.sub ? 96 : 70;
    const y = 150;
    ctx.fillStyle = 'rgba(10,5,3,0.82)';
    ctx.fillRect(0, y, VIEW.mapWidth, h);
    ctx.fillStyle = b.color;
    ctx.fillRect(0, y, VIEW.mapWidth, 3);
    ctx.fillRect(0, y + h - 3, VIEW.mapWidth, 3);
    const s = 0.85 + 0.15 * Math.min(1, (1 - k) * 8);
    ctx.translate(VIEW.mapWidth / 2, y + 48);
    ctx.scale(s, s);
    text(ctx, b.text, 0, 0, { size: 40, weight: 800, color: b.color, align: 'center' });
    if (b.sub) text(ctx, b.sub, 0, 32, { size: 18, weight: 600, color: T.ink, align: 'center' });
    ctx.restore();
  }

  function makeBanner(text, color, sub = null, life = 2) {
    return { text, color, sub, life, max: life };
  }

  function tickBanner(owner, dt) {
    if (!owner.banner) return;
    owner.banner.life -= dt;
    if (owner.banner.life <= 0) owner.banner = null;
  }

  // Números/textos flotantes ("+1 lote", "-3 s").
  function floatAdd(list, x, y, str, color, size = 18, life = 1.2) {
    list.push({ x, y, str, color, size, life, max: life });
  }

  function floatsUpdate(list, dt) {
    for (const f of list) {
      f.life -= dt;
      f.y -= 28 * dt;
    }
    return list.filter((f) => f.life > 0);
  }

  function floatsDraw(ctx, list) {
    for (const f of list) {
      ctx.globalAlpha = Math.min(1, f.life / (f.max * 0.4));
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.font = font(f.size, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.strokeText(f.str, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.str, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  // mulberry32: RNG reproducible para pruebas.
  function makeRng(seed) {
    if (seed == null) return Math.random;
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(rng, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function rankFor(score) {
    return score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 55 ? 'B' : 'C';
  }

  function rankColor(rank) {
    return { S: '#ffd34d', A: T.ok, B: T.warn, C: T.red }[rank] || T.ink;
  }

  // ---------------------------------------------------------- Lienzo

  function createSurface(canvas) {
    const r = { canvas, ctx: canvas.getContext('2d'), scale: 1, ox: 0, oy: 0, dpr: 1, t: 0 };
    resize(r);
    return r;
  }

  function resize(r) {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = globalThis.innerWidth;
    const h = globalThis.innerHeight;
    r.canvas.width = Math.round(w * dpr);
    r.canvas.height = Math.round(h * dpr);
    r.canvas.style.width = w + 'px';
    r.canvas.style.height = h + 'px';
    r.dpr = dpr;
    r.scale = Math.min(w / VIEW.width, h / VIEW.height);
    r.ox = (w - VIEW.width * r.scale) / 2;
    r.oy = (h - VIEW.height * r.scale) / 2;
  }

  function begin(r) {
    const ctx = r.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);
    ctx.setTransform(r.dpr * r.scale, 0, 0, r.dpr * r.scale, r.dpr * r.ox, r.dpr * r.oy);
  }

  function toLogical(r, clientX, clientY) {
    return { x: (clientX - r.ox) / r.scale, y: (clientY - r.oy) / r.scale };
  }

  function sfx(name) {
    if (PF.Audio) PF.Audio.play(name);
  }

  PF.VIEW = VIEW;
  PF.Draw = {
    VIEW,
    MAP_BOUNDS,
    FONT,
    MONO,
    T,
    DIFFICULTIES,
    difficulty,
    font,
    roundRect,
    text,
    wrap,
    paragraph,
    panel,
    progressBar,
    ring,
    keycap,
    padGlyph,
    control,
    hints,
    InputState,
    pumpkin,
    player,
    floor,
    strokePath,
    pipe,
    station,
    marker,
    guide,
    prompt,
    formatTime,
    hud,
    sidebar,
    checkRow,
    modalArea,
    modal,
    banner,
    makeBanner,
    tickBanner,
    floatAdd,
    floatsUpdate,
    floatsDraw,
    makeRng,
    shuffle,
    rankFor,
    rankColor,
    createSurface,
    resize,
    begin,
    toLogical,
    sfx,
  };
})();
