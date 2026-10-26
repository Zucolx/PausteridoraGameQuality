// Burbuja de pensamiento del operario: aparece cuando el jugador se equivoca
// ("¡Esto no va así!") y explica por qué. También sirve para avisos y aciertos.
// Los mensajes se muestran en un panel lateral fijo (no tapan el juego); sobre el
// operario solo aparece un pequeño indicador de "está pensando".
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;

  const KINDS = {
    error: { title: '¡Esto no va así!', color: '#d8321f', icon: '✖' },
    tip: { title: 'Ojo…', color: '#c4501a', icon: '?' },
    ok: { title: '¡Así sí!', color: '#2f8a3a', icon: '✔' },
  };
  const INK = '#2a170d';
  const PAPER = '#fff4e2';

  function create() {
    return { cur: null, log: [] };
  }

  // Muestra un mensaje. Los errores quedan registrados para el reporte final.
  function say(b, message, { kind = 'error', title = null, life = null } = {}) {
    const k = KINDS[kind] || KINDS.error;
    const ttl = life || Math.min(7, 3.5 + message.length / 35);
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

  function fadeOf(item) {
    if (item.life == null) return 1;
    const inA = item.max != null ? Math.min(1, (item.max - item.life) / 0.2) : 1;
    return Math.max(0, Math.min(1, item.life / 0.4, inA));
  }

  // ------------------------------------------------------- Indicador

  // Nubecita junto a la cabeza del operario (a su derecha, sin tapar la indicación
  // de "operar" que va encima): "mira el panel de mensajes".
  function marker(ctx, b, anchor, t) {
    const c = b.cur;
    if (!c) return;
    const k = KINDS[c.kind] || KINDS.error;
    const x = anchor.x + 40;
    const y = anchor.y - 30 + Math.sin(t * 6) * 2;
    ctx.save();
    ctx.globalAlpha = fadeOf(c);
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (const [dx, dy, r] of [
      [-12, 24, 3],
      [-6, 15, 4.5],
    ]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x - 7, y, 9, 0, Math.PI * 2);
    ctx.arc(x + 7, y, 9, 0, Math.PI * 2);
    ctx.arc(x, y - 6, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = k.color;
    ctx.beginPath();
    ctx.arc(x, y - 2, 8, 0, Math.PI * 2);
    ctx.fill();
    D.text(ctx, k.icon, x, y + 3, { size: 12, weight: 800, color: '#fff', align: 'center' });
    // Flecha hacia el panel de mensajes (a la derecha).
    ctx.fillStyle = k.color;
    ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(t * 8);
    ctx.beginPath();
    ctx.moveTo(x + 24, y - 2);
    ctx.lineTo(x + 16, y - 8);
    ctx.lineTo(x + 16, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------- Tarjetas

  // Aviso del panel. n = { text, sub, color, life, max, kind: 'banner'|'paper'|'toast', actions, shake }
  // Devuelve la altura usada.
  function notice(ctx, n, x, y, w, t, { maxLines = 3, measureOnly = false } = {}) {
    const kind = n.kind || 'banner';
    const pad = 12;
    ctx.font = D.font(kind === 'toast' ? 17 : 17, 800);
    const titleLines = n.text ? D.wrap(ctx, n.text, w - pad * 2 - 6).slice(0, 2) : [];
    ctx.font = D.font(14, 600);
    const subLines = n.sub ? D.wrap(ctx, n.sub, w - pad * 2 - 6).slice(0, maxLines) : [];
    const actions = n.actions || [];
    const h = pad + titleLines.length * 20 + (n.label ? 16 : 0) + subLines.length * 18 + (actions.length ? 30 : 0) + pad - 2;
    if (measureOnly) return h;
    ctx.save();
    ctx.globalAlpha = fadeOf(n);
    let sx = 0;
    if (n.shake) sx = Math.sin(t * 50) * 4 * Math.min(1, n.shake);
    ctx.translate(sx, 0);
    const color = n.color || D.T.orange;
    if (kind === 'paper') {
      D.panel(ctx, x, y, w, h, { fill: '#f2e3c6', edge: D.T.brass, radius: 8 });
    } else {
      // Los avisos recién llegados brillan un momento para llamar la atención.
      const fresh = n.max != null && n.max - n.life < 1.2;
      D.panel(ctx, x, y, w, h, { fill: kind === 'toast' ? '#2a0f0a' : '#1e130e', edge: color, radius: 8, glow: kind === 'toast' || fresh ? color : null });
      ctx.fillStyle = color;
      D.roundRect(ctx, x, y, 6, h, 3);
      ctx.fill();
    }
    let ty = y + pad + 4;
    if (n.label) {
      D.text(ctx, n.label, x + pad + 4, ty + 6, { size: 12, weight: 800, color: kind === 'paper' ? '#7a3010' : color });
      ty += 16;
    }
    const titleColor = kind === 'paper' ? '#7a3010' : kind === 'toast' ? D.T.ink : color;
    titleLines.forEach((l) => {
      D.text(ctx, l, x + pad + 4, ty + 10, { size: 17, weight: 800, color: titleColor });
      ty += 20;
    });
    subLines.forEach((l) => {
      D.text(ctx, l, x + pad + 4, ty + 8, { size: 14, weight: 600, color: kind === 'paper' ? INK : D.T.ink });
      ty += 18;
    });
    if (actions.length) D.hints(ctx, actions, x + pad + 4, ty + 14, { size: 12, gap: 16, ink: D.T.dim, color });
    if (n.progress != null) D.progressBar(ctx, x + 10, y + h - 5, w - 20, 3, n.progress, color);
    ctx.restore();
    return h;
  }

  // Nube de pensamiento con el operario a la izquierda. Devuelve la altura usada.
  // compact: título a la izquierda y mensaje al lado (para la barra horizontal).
  function cloud(ctx, c, x, y, w, maxH, t, { maxLines = 6, compact = false } = {}) {
    const k = KINDS[c.kind] || KINDS.error;
    const left = x + 34;
    const cw = w - 40;
    ctx.font = D.font(19, 800);
    const titleW = compact ? ctx.measureText(c.title).width + 52 : 0;
    ctx.font = D.font(15, 600);
    const room = compact ? Math.max(1, Math.floor((maxH - 12) / 18)) : Math.max(1, Math.floor((maxH - 52) / 19));
    const lines = D.wrap(ctx, c.message, cw - 34 - titleW).slice(0, Math.min(maxLines, room));
    const h = compact ? maxH : 46 + lines.length * 19;
    ctx.save();
    ctx.globalAlpha = fadeOf(c);
    const pop = Math.min(1, c.age / 0.22);
    const sx = c.shake > 0 ? Math.sin(c.age * 70) * 4 * (c.shake / 0.3) : 0;
    // Operario pensando.
    const ax = x + 12;
    const ay = y + h - 14;
    ctx.fillStyle = '#e8742c';
    D.roundRect(ctx, ax - 10, ay - 10, 20, 24, 8);
    ctx.fill();
    ctx.fillStyle = '#9fdcf2';
    D.roundRect(ctx, ax - 2, ay - 6, 11, 7, 3);
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.ellipse(ax, ay - 10, 10, 4, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    [
      [ax + 10, ay - 22, 3],
      [ax + 18, ay - 34, 4.5],
    ].forEach(([cx, cy, r]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    // Nube.
    ctx.translate(sx, 0);
    const s = pop < 1 ? 0.85 + 0.15 * Math.sin((pop * Math.PI) / 1.6) : 1;
    ctx.translate(left + cw / 2, y + h / 2);
    ctx.scale(s, s);
    ctx.translate(-(left + cw / 2), -(y + h / 2));
    ctx.beginPath();
    const bumps = Math.max(3, Math.round(cw / 52));
    for (let i = 0; i < bumps; i++) {
      const px = left + 16 + (i * (cw - 32)) / (bumps - 1);
      ctx.moveTo(px + 14, y + 6);
      ctx.arc(px, y + 6, 14, 0, Math.PI * 2);
      ctx.moveTo(px + 14, y + h - 6);
      ctx.arc(px, y + h - 6, 14, 0, Math.PI * 2);
    }
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fill();
    ctx.fillRect(left, y + 2, cw, h - 4);
    ctx.fillStyle = k.color;
    if (!compact) {
      ctx.beginPath();
      ctx.arc(left + 18, y + 20, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    if (compact) {
      const my = y + h / 2;
      ctx.beginPath();
      ctx.arc(left + 18, my - 2, 11, 0, Math.PI * 2);
      ctx.fill();
      D.text(ctx, k.icon, left + 18, my + 3, { size: 14, weight: 800, color: '#fff', align: 'center' });
      D.text(ctx, c.title, left + 36, my + 4, { size: 19, weight: 800, color: k.color });
      const ly = my + 5 - ((lines.length - 1) * 18) / 2;
      lines.forEach((l, i) => D.text(ctx, l, left + titleW, ly + i * 18, { size: 15, weight: 600, color: INK }));
    } else {
      D.text(ctx, k.icon, left + 18, y + 25, { size: 14, weight: 800, color: '#fff', align: 'center' });
      D.text(ctx, c.title, left + 36, y + 26, { size: 19, weight: 800, color: k.color });
      lines.forEach((l, i) => D.text(ctx, l, left + 12, y + 50 + i * 19, { size: 15, weight: 600, color: INK }));
    }
    ctx.restore();
    return h;
  }

  // ------------------------------------------------------- Paneles

  // Panel lateral de mensajes: avisos arriba, la burbuja de pensamiento debajo.
  function dock(ctx, rect, { bubble = null, notices = [], t = 0, empty = 'Aquí aparecen los avisos y lo que piensa el operario.' } = {}) {
    const items = notices.filter(Boolean);
    D.text(ctx, 'MENSAJES', rect.x, rect.y + 12, { size: 13, weight: 700, color: D.T.dim });
    ctx.fillStyle = D.T.edge;
    ctx.fillRect(rect.x + 80, rect.y + 7, rect.w - 80, 1);
    let y = rect.y + 24;
    const bottom = rect.y + rect.h;
    const cur = bubble && bubble.cur;
    // La burbuja tiene prioridad de espacio: los avisos se acortan si hace falta.
    const reserve = cur ? 46 + 19 * 2 : 0;
    for (const n of items) {
      const h = notice(ctx, n, rect.x, y, rect.w, t, { measureOnly: true });
      if (y + h > bottom - reserve) continue;
      y += notice(ctx, n, rect.x, y, rect.w, t) + 8;
    }
    if (cur) y += cloud(ctx, cur, rect.x, y, rect.w, bottom - y, t);
    if (!items.length && !cur) D.paragraph(ctx, empty, rect.x, rect.y + 46, rect.w, { size: 13, color: D.T.faint });
  }

  // Barra horizontal de mensajes (para juegos sin barra lateral).
  function bar(ctx, rect, { bubble = null, notices = [], t = 0, split = 0.6 } = {}) {
    D.panel(ctx, rect.x, rect.y, rect.w, rect.h, { fill: '#100906', edge: '#2e1d13', radius: 10 });
    const n = notices.filter(Boolean)[0];
    // Sin avisos, la burbuja usa todo el ancho para que quepan las explicaciones largas.
    const lw = n ? Math.round(rect.w * split) : rect.w;
    const cur = bubble && bubble.cur;
    if (cur) cloud(ctx, cur, rect.x + 8, rect.y + 8, lw - 16, rect.h - 16, t, { maxLines: 2, compact: true });
    else D.text(ctx, 'Aquí aparecen los avisos del operario', rect.x + 20, rect.y + rect.h / 2 + 5, { size: 14, color: D.T.faint });
    if (n) {
      const nx = rect.x + lw;
      const nw = rect.w - lw - 8;
      ctx.save();
      ctx.beginPath();
      ctx.rect(nx, rect.y + 4, nw, rect.h - 8);
      ctx.clip();
      notice(ctx, n, nx, rect.y + 6, nw, t, { maxLines: 1 });
      ctx.restore();
    }
  }

  PF.Bubble = { create, say, update, clear, marker, notice, cloud, dock, bar, KINDS };
})();
