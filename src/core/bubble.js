// Burbuja de pensamiento sobre el operario: aparece cuando el jugador se equivoca
// ("¡Esto no va así!") y explica por qué. También sirve para avisos y aciertos.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;

  const KINDS = {
    error: { title: '¡Esto no va así!', color: '#d8321f', icon: '✖' },
    tip: { title: 'Ojo…', color: '#c4501a', icon: '?' },
    ok: { title: '¡Así sí!', color: '#2f8a3a', icon: '✔' },
  };

  function create() {
    return { cur: null, log: [] };
  }

  // Muestra un mensaje. Los errores quedan registrados para el reporte final.
  function say(b, message, { kind = 'error', title = null, life = null } = {}) {
    const k = KINDS[kind] || KINDS.error;
    const ttl = life || Math.min(6, 2.6 + message.length / 40);
    if (b.cur && b.cur.message === message) {
      b.cur.life = Math.max(b.cur.life, ttl);
      b.cur.shake = 0.3;
    } else {
      b.cur = { message, kind, title: title || k.title, life: ttl, max: ttl, age: 0, shake: kind === 'error' ? 0.3 : 0 };
    }
    if (kind === 'error') {
      if (!b.log.includes(message)) b.log.push(message);
      D.sfx('oops');
    }
    return b.cur;
  }

  function update(b, dt) {
    if (!b.cur) return;
    b.cur.age += dt;
    b.cur.life -= dt;
    b.cur.shake = Math.max(0, b.cur.shake - dt);
    if (b.cur.life <= 0) b.cur = null;
  }

  function clear(b) {
    b.cur = null;
  }

  // Dibuja la nube anclada a la cabeza del jugador, dentro del área del mapa.
  // maxBottom: límite inferior opcional (p. ej. el borde de una ventana de estación abierta).
  function draw(ctx, b, anchor, { left = 8, right = D.VIEW.mapWidth - 8, top = D.VIEW.hud + 8, bottom = D.VIEW.height - 8, maxBottom = null } = {}) {
    const c = b.cur;
    if (!c) return;
    const k = KINDS[c.kind] || KINDS.error;
    const W = 330;
    ctx.font = D.font(16, 600);
    const lines = D.wrap(ctx, c.message, W - 44).slice(0, 5);
    const H = 48 + lines.length * 20;

    // Arriba de la cabeza si cabe; si no, debajo de los pies.
    let above = anchor.y - 62 - H >= top;
    let by = above ? anchor.y - 62 - H : anchor.y + 46;
    if (!above && by + H > bottom) {
      above = true;
      by = top;
    }
    if (maxBottom != null && by + H > maxBottom) {
      by = Math.max(top, maxBottom - H - 14);
      above = by + H / 2 < anchor.y;
    }
    let bx = Math.max(left, Math.min(right - W, anchor.x - W / 2));

    // Animación: aparece con rebote, tiembla en errores, se desvanece al final.
    const pop = Math.min(1, c.age / 0.22);
    const scale = pop < 1 ? 0.6 + 0.55 * Math.sin((pop * Math.PI) / 1.6) : 1;
    const alpha = Math.min(1, c.life / 0.35);
    if (c.shake > 0) bx += Math.sin(c.age * 70) * 5 * (c.shake / 0.3);

    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = bx + W / 2;
    const cy = by + H / 2;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    // Burbujitas de pensamiento hacia la cabeza.
    const tx = Math.max(bx + 30, Math.min(bx + W - 30, anchor.x));
    const ty = above ? by + H : by;
    let hy = above ? anchor.y - 30 : anchor.y + 24;
    // Con una ventana abierta, la estela no cruza su cabecera.
    if (maxBottom != null) hy = Math.min(hy, maxBottom - 4);
    ctx.fillStyle = '#fff4e2';
    ctx.strokeStyle = '#2a170d';
    ctx.lineWidth = 2.5;
    [0.3, 0.62, 0.88].forEach((f, i) => {
      const r = 9 - i * 3;
      ctx.beginPath();
      ctx.arc(tx + (anchor.x - tx) * f, ty + (hy - ty) * f, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Nube: rectángulo redondeado con lóbulos en los bordes.
    ctx.beginPath();
    const bumps = 7;
    for (let i = 0; i < bumps; i++) {
      const px = bx + 22 + (i * (W - 44)) / (bumps - 1);
      ctx.moveTo(px + 22, by + 4);
      ctx.arc(px, by + 4, 22, 0, Math.PI * 2);
      ctx.moveTo(px + 22, by + H - 4);
      ctx.arc(px, by + H - 4, 22, 0, Math.PI * 2);
    }
    ctx.moveTo(bx + 4 + 20, cy);
    ctx.arc(bx + 4, cy, 20, 0, Math.PI * 2);
    ctx.moveTo(bx + W - 4 + 20, cy);
    ctx.arc(bx + W - 4, cy, 20, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fill();
    ctx.fillRect(bx, by, W, H);

    // Contenido.
    ctx.fillStyle = k.color;
    ctx.beginPath();
    ctx.arc(bx + 22, by + 20, 12, 0, Math.PI * 2);
    ctx.fill();
    D.text(ctx, k.icon, bx + 22, by + 26, { size: 16, weight: 800, color: '#fff', align: 'center' });
    D.text(ctx, c.title, bx + 42, by + 27, { size: 21, weight: 800, color: k.color });
    lines.forEach((l, i) => D.text(ctx, l, bx + 18, by + 52 + i * 20, { size: 16, weight: 600, color: '#2a170d' }));
    ctx.restore();
  }

  PF.Bubble = { create, say, update, clear, draw, KINDS };
})();
