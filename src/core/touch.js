// Pantallas táctiles (móviles y pantallas grandes tipo TV): un "mando virtual".
// - Joystick flotante: en los juegos de mapa, arrastrar en la mitad izquierda de la
//   pantalla mueve al operario (el joystick aparece donde se apoya el dedo).
// - Botones virtuales (A, B, X, Y, 1-4…): se comportan como los del mando, así que
//   cada juego los lee igual que un mando PS/Xbox.
// - Toques: el resto de la pantalla funciona como clics (y "mantener" como ratón pulsado).
// Lógica pura en píxeles CSS de la pantalla: no toca el DOM y se prueba en Node.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  const DEAD = 0.18;
  const TILT = 0.6;
  const DRAG = 12; // px para que un toque pase a ser joystick
  const TAP_MS = 350;

  function create() {
    return { layout: null, buttons: [], pointers: new Map(), latched: {}, stick: null, W: 0, H: 0, size: 60 };
  }

  // layout = { stick: bool, stickHint?: false, main: [{ pad, label }], aux: [{ pad, label }] } o null.
  function setLayout(t, layout) {
    t.layout = layout || null;
    t.pointers.clear();
    t.latched = {};
    t.stick = null;
    if (t.W) arrange(t, t.W, t.H, t.view);
  }

  // Coloca los botones. view = zona del juego en la pantalla { ox, oy, gw, gh }.
  // Si sobra margen a los lados (móvil apaisado), van fuera del juego; si no, encima.
  function arrange(t, W, H, view = { ox: 0, oy: 0, gw: W, gh: H }) {
    t.W = W;
    t.H = H;
    t.view = view;
    t.buttons = [];
    const L = t.layout;
    if (!L) return;
    const main = L.main || [];
    const aux = L.aux || [];
    let size = Math.round(Math.max(46, Math.min(78, Math.min(W, H) * 0.14)));
    const most = Math.max(main.length, aux.length);
    if (most) size = Math.max(40, Math.min(size, Math.floor((H - 40) / most) - 10));
    t.size = size;
    const right = W - (view.ox + view.gw);
    const left = view.ox;
    const column = (list, side, s) => {
      const free = side === 'right' ? right : left;
      const inMargin = free >= s + 12;
      const cx = side === 'right' ? (inMargin ? W - free / 2 : W - 12 - s / 2) : inMargin ? free / 2 : 12 + s / 2;
      list.forEach((b, i) => {
        const cy = H - 16 - s / 2 - i * (s + 10);
        t.buttons.push({ pad: b.pad, label: b.label, x: cx, y: cy, r: s / 2, side, inMargin });
      });
    };
    column(main, 'right', size);
    column(aux, 'left', Math.round(size * 0.82));
  }

  function buttonAt(t, x, y) {
    return t.buttons.find((b) => Math.hypot(x - b.x, y - b.y) <= b.r + 8) || null;
  }

  // Devuelve qué es el toque: 'button', 'stick' (aún sin decidir si es arrastre) o 'click'.
  function down(t, id, x, y, now = 0) {
    const b = buttonAt(t, x, y);
    if (b) {
      t.pointers.set(id, { kind: 'button', pad: b.pad });
      t.latched[b.pad] = true;
      return { kind: 'button', pad: b.pad };
    }
    if (t.layout && t.layout.stick && x < t.W * 0.5 && !t.stick) {
      t.pointers.set(id, { kind: 'stick', x0: x, y0: y, x, y, t0: now, dragging: false });
      return { kind: 'stick' };
    }
    t.pointers.set(id, { kind: 'click' });
    return { kind: 'click' };
  }

  function move(t, id, x, y) {
    const p = t.pointers.get(id);
    if (!p) return null;
    if (p.kind === 'stick') {
      p.x = x;
      p.y = y;
      if (!p.dragging && Math.hypot(x - p.x0, y - p.y0) > DRAG) {
        p.dragging = true;
        t.stick = p;
      }
      return { kind: 'stick' };
    }
    if (p.kind === 'button') {
      // Deslizar el dedo de un botón a otro cambia de botón (como en un mando).
      const b = buttonAt(t, x, y);
      if (b && b.pad !== p.pad) {
        p.pad = b.pad;
        t.latched[b.pad] = true;
      }
      return { kind: 'button' };
    }
    return { kind: 'click' };
  }

  // Al soltar: un toque corto sin arrastrar en la zona del joystick cuenta como clic.
  function up(t, id, x, y, now = 0) {
    const p = t.pointers.get(id);
    t.pointers.delete(id);
    if (!p) return null;
    if (p.kind === 'stick') {
      if (t.stick === p) t.stick = null;
      if (!p.dragging && now - p.t0 <= TAP_MS) return { kind: 'tap', x, y };
    }
    return null;
  }

  function cancel(t, id) {
    const p = t.pointers.get(id);
    t.pointers.delete(id);
    if (p && t.stick === p) t.stick = null;
  }

  function stickVector(t) {
    const s = t.stick;
    if (!s) return { lx: 0, ly: 0 };
    const R = t.size * 1.1;
    let lx = (s.x - s.x0) / R;
    let ly = (s.y - s.y0) / R;
    const len = Math.hypot(lx, ly);
    if (len > 1) {
      lx /= len;
      ly /= len;
    }
    if (Math.hypot(lx, ly) < DEAD) return { lx: 0, ly: 0 };
    return { lx, ly };
  }

  // Estado como el de un mando: botones mantenidos (o tocados desde el último frame) y stick.
  function snapshot(t) {
    const held = {};
    for (const p of t.pointers.values()) if (p.kind === 'button') held[p.pad] = true;
    for (const k of Object.keys(t.latched)) held[k] = true;
    t.latched = {};
    const { lx, ly } = stickVector(t);
    held.lsUp = ly < -TILT;
    held.lsDown = ly > TILT;
    held.lsLeft = lx < -TILT;
    held.lsRight = lx > TILT;
    return { id: 'touch', type: 'touch', held, lx, ly, rx: 0, ry: 0 };
  }

  function busy(t) {
    return t.pointers.size > 0 || Object.keys(t.latched).length > 0;
  }

  // Etiquetas que usan los glifos de los juegos mientras se juega con el dedo.
  function labels(t) {
    return layoutLabels(t.layout);
  }

  function layoutLabels(layout) {
    const out = {};
    if (layout) for (const b of [...(layout.main || []), ...(layout.aux || [])]) out[b.pad] = glyph(b.pad);
    return out;
  }

  function glyph(pad) {
    return { a: 'A', b: 'B', x: 'X', y: 'Y', lb: '1', rb: '2', lt: '3', rt: '4', select: '?', start: '⏸' }[pad] || pad.toUpperCase();
  }

  // ------------------------------------------------------------- Dibujo (píxeles CSS)

  const COLORS = { a: '#5cc85c', b: '#e8473b', x: '#3d8fe0', y: '#f2c230' };

  function draw(ctx, t, { font = (s) => `700 ${s}px sans-serif` } = {}) {
    if (!t.layout) return;
    ctx.save();
    ctx.textAlign = 'center';
    for (const b of t.buttons) {
      const pressed = [...t.pointers.values()].some((p) => p.kind === 'button' && p.pad === b.pad);
      const color = COLORS[b.pad] || '#c9a46a';
      ctx.globalAlpha = b.inMargin ? 0.95 : pressed ? 0.85 : 0.55;
      ctx.fillStyle = pressed ? color : 'rgba(20,14,10,0.75)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pressed ? '#140c09' : color;
      ctx.font = font(Math.round(b.r * 0.8));
      ctx.fillText(glyph(b.pad), b.x, b.y + b.r * 0.12);
      ctx.fillStyle = pressed ? '#140c09' : '#f4efe6';
      let fs = Math.max(10, Math.round(b.r * 0.32));
      ctx.font = font(fs);
      while (fs > 8 && ctx.measureText(b.label).width > b.r * 1.45) ctx.font = font(--fs);
      ctx.fillText(b.label, b.x, b.y + b.r * 0.62);
    }
    if (t.layout.stick) {
      const s = t.stick;
      const R = t.size * 1.1;
      if (s) {
        const { lx, ly } = stickVector(t);
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#f4efe6';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.x0, s.y0, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ff8a1f';
        ctx.beginPath();
        ctx.arc(s.x0 + lx * R, s.y0 + ly * R, R * 0.42, 0, Math.PI * 2);
        ctx.fill();
      } else if (t.layout.stickHint !== false) {
        // Pista del joystick flotante, abajo a la izquierda (cada juego puede omitirla).
        const aux = t.buttons.filter((b) => b.side === 'left');
        const from = Math.max(t.view ? t.view.ox : 0, ...aux.map((b) => b.x + b.r));
        const x = from + R + 24;
        const y = t.H - R - 24;
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = '#f4efe6';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f4efe6';
        ctx.font = font(Math.max(11, Math.round(t.size * 0.22)));
        ctx.fillText('arrastra', x, y - 4);
        ctx.fillText('para moverte', x, y + Math.round(t.size * 0.26));
      }
    }
    ctx.restore();
  }

  PF.Touch = { create, setLayout, arrange, buttonAt, down, move, up, cancel, snapshot, busy, labels, layoutLabels, glyph, draw, DRAG, TAP_MS };
})();
