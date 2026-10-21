// Pantallas de la colección: menú de juegos, selector de dificultad, pausa y
// "Reporte de Calidad". Estética del afiche: negro, naranja quemado y latón.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const T = D.T;
  const V = D.VIEW;

  const CARD = { w: 270, h: 392, gap: 24, y: 214 };

  function menuCards(n) {
    const total = n * CARD.w + (n - 1) * CARD.gap;
    const x0 = (V.width - total) / 2;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (CARD.w + CARD.gap), y: CARD.y, w: CARD.w, h: CARD.h }));
  }

  function diffCards() {
    return D.DIFFICULTIES.map((d, i) => ({ id: d.id, x: 736, y: 140 + i * 156, w: 504, h: 146 }));
  }

  function playButton() {
    return { x: 736, y: 636, w: 504, h: 56 };
  }

  // Engranajes steampunk y brasas de fondo.
  function backdrop(ctx, t, accent = T.orange) {
    const g = ctx.createRadialGradient(V.width / 2, 120, 40, V.width / 2, 260, 760);
    g.addColorStop(0, 'rgba(196,80,26,0.35)');
    g.addColorStop(1, 'rgba(10,6,5,0)');
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, V.width, V.height);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, V.width, V.height);
    gear(ctx, 70, 80, 90, 12, t * 0.2, '#2a1a10');
    gear(ctx, 190, 30, 50, 9, -t * 0.36, '#24160d');
    gear(ctx, V.width - 80, V.height - 70, 110, 14, -t * 0.15, '#2a1a10');
    gear(ctx, V.width - 210, V.height - 20, 56, 10, t * 0.3, '#24160d');
    for (let i = 0; i < 26; i++) {
      const k = (t * 0.05 + i * 0.137) % 1;
      const x = ((i * 197) % V.width) + Math.sin(t + i) * 12;
      const y = V.height - k * V.height;
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.fillStyle = i % 3 ? accent : T.warn;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function gear(ctx, x, y, r, teeth, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 ? r : r * 0.82;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = T.bg;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function glowText(ctx, str, x, y, size, color, glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 26;
    D.text(ctx, str, x, y, { size, weight: 800, color, align: 'center' });
    ctx.restore();
  }

  function bestLabel(best) {
    return best ? `${best.rank} · ${best.score}` : '—';
  }

  // ------------------------------------------------------------ Menú

  function drawMenu(ctx, t, games, sel, records) {
    backdrop(ctx, t);
    glowText(ctx, 'LO QUE NO SE VE,', V.width / 2, 92, 54, T.ink, T.orange);
    glowText(ctx, 'TAMBIÉN SE LIMPIA', V.width / 2, 150, 60, T.orange, T.orangeDark);
    D.text(ctx, 'Colección de juegos de calidad · elige tu turno de 60 segundos', V.width / 2, 188, { size: 19, weight: 600, color: T.dim, align: 'center' });

    const cards = menuCards(games.length);
    games.forEach((game, i) => {
      const c = cards[i];
      const on = i === sel;
      const lift = on ? -12 - Math.sin(t * 3) * 2 : 0;
      const x = c.x;
      const y = c.y + lift;
      D.panel(ctx, x, y, c.w, c.h, { fill: on ? '#24150d' : '#170e0a', edge: on ? game.accent : '#3a2418', radius: 16, glow: on ? game.accent : null });
      // Ilustración.
      ctx.save();
      ctx.beginPath();
      D.roundRect(ctx, x + 12, y + 12, c.w - 24, 150, 12);
      ctx.clip();
      const bg = ctx.createRadialGradient(x + c.w / 2, y + 90, 10, x + c.w / 2, y + 90, 160);
      bg.addColorStop(0, on ? '#3a2214' : '#24160e');
      bg.addColorStop(1, '#0d0806');
      ctx.fillStyle = bg;
      ctx.fillRect(x + 12, y + 12, c.w - 24, 150);
      game.icon(ctx, x + c.w / 2, y + 88, 120, on ? t : 0);
      ctx.restore();
      D.keycap(ctx, String(i + 1), x + 30, y + 30, { size: 15, color: on ? game.accent : '#5a4030' });

      ctx.font = D.font(27, 800);
      const lines = D.wrap(ctx, game.title.toUpperCase(), c.w - 32);
      lines.forEach((l, j) => D.text(ctx, l, x + 16, y + 196 + j * 28, { size: 27, weight: 800, color: on ? T.ink : T.dim }));
      const ty = y + 196 + lines.length * 28;
      D.text(ctx, game.subtitle, x + 16, ty, { size: 16, weight: 700, color: game.accent });
      D.paragraph(ctx, game.tagline, x + 16, ty + 26, c.w - 32, { size: 15, weight: 500, color: on ? T.ink : T.faint, maxLines: 3 });

      // Récords por dificultad.
      const rec = records[game.id] || {};
      D.DIFFICULTIES.forEach((d, j) => {
        const bx = x + 16 + j * 82;
        const by = y + c.h - 46;
        ctx.fillStyle = '#100906';
        D.roundRect(ctx, bx, by, 76, 32, 6);
        ctx.fill();
        D.text(ctx, d.label[0], bx + 12, by + 21, { size: 13, weight: 800, color: d.color });
        const b = rec[d.id];
        D.text(ctx, b ? b.rank : '—', bx + 64, by + 22, { size: 18, weight: 800, color: b ? D.rankColor(b.rank) : T.faint, align: 'right' });
      });
    });

    let fx = V.width / 2 - 270;
    const fy = 664;
    for (const [k, label] of [
      ['← →', 'elegir juego'],
      ['ENTER', 'continuar'],
      ['M', 'sonido'],
    ]) {
      const w = D.keycap(ctx, k, fx, fy, { size: 15 });
      D.text(ctx, label, fx + w / 2 + 8, fy + 6, { size: 16, weight: 600, color: T.dim });
      fx += 200;
    }
    D.text(ctx, 'o usa el ratón', V.width / 2 + 330, fy + 6, { size: 14, color: T.faint });
  }

  // ------------------------------------------------------- Dificultad

  function drawSetup(ctx, t, game, diffSel, records) {
    backdrop(ctx, t, game.accent);
    D.panel(ctx, 40, 40, 670, 652, { fill: '#160d09', edge: '#3a2418', radius: 16 });
    ctx.save();
    ctx.beginPath();
    D.roundRect(ctx, 56, 56, 150, 150, 14);
    ctx.clip();
    ctx.fillStyle = '#24150d';
    ctx.fillRect(56, 56, 150, 150);
    game.icon(ctx, 131, 131, 130, t);
    ctx.restore();
    ctx.font = D.font(38, 800);
    const tl = D.wrap(ctx, game.title.toUpperCase(), 470);
    tl.forEach((l, i) => D.text(ctx, l, 226, 104 + i * 38, { size: 38, weight: 800 }));
    D.text(ctx, game.subtitle, 226, 104 + tl.length * 38 + 4, { size: 20, weight: 700, color: game.accent });

    D.text(ctx, 'CÓMO SE JUEGA', 60, 252, { size: 15, weight: 800, color: T.dim });
    let y = 284;
    game.howTo.forEach((line, i) => {
      ctx.fillStyle = game.accent;
      ctx.beginPath();
      ctx.arc(72, y - 6, 12, 0, Math.PI * 2);
      ctx.fill();
      D.text(ctx, String(i + 1), 72, y - 1, { size: 14, weight: 800, color: '#170e0a', align: 'center' });
      y += D.paragraph(ctx, line, 96, y, 590, { size: 17, weight: 600, color: T.ink }) + 10;
    });

    D.text(ctx, 'CONTROLES', 60, 560, { size: 15, weight: 800, color: T.dim });
    game.controls.forEach(([k, label], i) => {
      const cx = 60 + (i % 2) * 320;
      const cy = 596 + Math.floor(i / 2) * 44;
      const w = D.keycap(ctx, k, cx + 50, cy, { size: 15, color: game.accent });
      D.text(ctx, label, cx + 50 + w / 2 + 12, cy + 6, { size: 16, weight: 600, color: T.ink });
    });

    D.text(ctx, 'ELIGE LA DIFICULTAD', 736, 120, { size: 20, weight: 800, color: T.ink });
    const rec = records[game.id] || {};
    diffCards().forEach((c, i) => {
      const d = D.DIFFICULTIES[i];
      const on = i === diffSel;
      D.panel(ctx, c.x, c.y, c.w, c.h, { fill: on ? '#24150d' : '#140c09', edge: on ? d.color : '#3a2418', radius: 14, glow: on ? d.color : null });
      if (on) {
        ctx.fillStyle = d.color;
        D.roundRect(ctx, c.x, c.y, 10, c.h, 5);
        ctx.fill();
      }
      for (let p = 0; p < 3; p++) D.pumpkin(ctx, c.x + 42 + p * 46, c.y + 40, 24, p < d.pumpkins);
      D.text(ctx, d.label, c.x + 172, c.y + 50, { size: 32, weight: 800, color: d.color });
      D.keycap(ctx, String(i + 1), c.x + c.w - 30, c.y + 34, { size: 14, color: on ? d.color : '#5a4030' });
      D.text(ctx, `Récord: ${bestLabel(rec[d.id])}`, c.x + c.w - 54, c.y + 41, { size: 14, weight: 700, color: T.dim, align: 'right' });
      game.difficulties[d.id].forEach((b, j) => {
        D.text(ctx, '•', c.x + 28, c.y + 82 + j * 22, { size: 16, weight: 800, color: d.color });
        D.text(ctx, b, c.x + 44, c.y + 82 + j * 22, { size: 16, weight: 600, color: on ? T.ink : T.dim });
      });
    });
    const b = playButton();
    const d = D.DIFFICULTIES[diffSel];
    const pulse = 0.85 + 0.15 * Math.sin(t * 5);
    ctx.save();
    ctx.shadowColor = d.color;
    ctx.shadowBlur = 20 * pulse;
    ctx.fillStyle = d.color;
    D.roundRect(ctx, b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.restore();
    D.text(ctx, `▶  JUGAR EN ${d.label}   [ENTER]`, b.x + b.w / 2, b.y + 37, { size: 24, weight: 800, color: '#170e0a', align: 'center' });
    D.text(ctx, '↑ ↓ dificultad · ESC volver al menú', b.x + b.w / 2, b.y - 14, { size: 14, color: T.faint, align: 'center' });
  }

  // ------------------------------------------------------------ Pausa

  function drawPause(ctx) {
    ctx.fillStyle = 'rgba(8,4,3,0.78)';
    ctx.fillRect(0, 0, V.width, V.height);
    glowText(ctx, 'PAUSA', V.width / 2, 320, 72, T.ink, T.orange);
    let x = V.width / 2 - 300;
    for (const [k, l] of [
      ['P', 'continuar'],
      ['R', 'reiniciar'],
      ['ESC', 'menú de juegos'],
    ]) {
      const w = D.keycap(ctx, k, x, 390, { size: 18 });
      D.text(ctx, l, x + w / 2 + 10, 397, { size: 20, weight: 600, color: T.ink });
      x += 220;
    }
  }

  // ------------------------------------------------------------ Reporte

  function drawReport(ctx, t, game, diffId, rep, record, isRecord) {
    backdrop(ctx, t, game.accent);
    const x = 90;
    const y = 30;
    const w = 1100;
    const h = 620;
    // Hoja de reporte (papel crema).
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#f2e3c6';
    D.roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#3a1d0c';
    D.roundRect(ctx, x, y, w, 64, 8);
    ctx.fill();
    ctx.fillRect(x, y + 40, w, 24);
    D.text(ctx, 'REPORTE DE CALIDAD', x + 28, y + 43, { size: 30, weight: 800, color: '#f2e3c6' });
    const d = D.difficulty(diffId);
    D.text(ctx, `${game.title} · ${d.label}`, x + w - 28, y + 42, { size: 20, weight: 700, color: game.accent, align: 'right' });

    // Sello del rango.
    const rc = D.rankColor(rep.rank);
    const stamp = rep.rank === 'C' ? '#b3261e' : rep.rank === 'B' ? '#b86e00' : rep.rank === 'A' ? '#2f7a33' : '#a07800';
    ctx.save();
    ctx.translate(x + 190, y + 250);
    ctx.rotate(-0.16);
    ctx.strokeStyle = stamp;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 118, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.stroke();
    D.text(ctx, rep.rank, 0, 50, { size: 150, weight: 800, color: stamp, align: 'center' });
    D.text(ctx, 'RANGO', 0, -66, { size: 20, weight: 800, color: stamp, align: 'center' });
    ctx.restore();
    D.text(ctx, 'Puntuación de Calidad', x + 190, y + 408, { size: 17, weight: 700, color: '#7a5030', align: 'center' });
    D.text(ctx, `${rep.score}/100`, x + 190, y + 446, { size: 36, weight: 800, color: '#3a1d0c', align: 'center', family: D.MONO });
    if (isRecord) D.text(ctx, '★ ¡Nuevo récord personal! ★', x + 190, y + 482, { size: 17, weight: 800, color: '#c4501a', align: 'center' });
    else if (record) D.text(ctx, `Récord: ${bestLabel(record)}`, x + 190, y + 482, { size: 16, weight: 700, color: '#7a5030', align: 'center' });

    // Tabla.
    const tx = x + 400;
    D.paragraph(ctx, rep.headline, tx, y + 104, 660, { size: 20, weight: 800, color: '#3a1d0c', maxLines: 2 });
    rep.rows.forEach(([label, value, color], i) => {
      const ry = y + 172 + i * 40;
      D.text(ctx, label, tx, ry, { size: 18, weight: 600, color: '#5a3a20' });
      const dark = color === T.ink ? '#2a170d' : color === T.ok ? '#2f7a33' : color === T.red ? '#b3261e' : color === T.warn ? '#b86e00' : color === rc ? stamp : '#2a170d';
      D.text(ctx, value, tx + 660, ry, { size: 22, weight: 800, color: dark, align: 'right', family: D.MONO });
      ctx.fillStyle = 'rgba(58,29,12,0.18)';
      ctx.fillRect(tx, ry + 12, 660, 1);
    });

    // Lo que no va así.
    const my = y + 172 + rep.rows.length * 40 + 18;
    ctx.fillStyle = rep.mistakes.length ? 'rgba(179,38,30,0.1)' : 'rgba(47,122,51,0.12)';
    D.roundRect(ctx, tx - 12, my - 6, 684, h - (my - y) - 18, 8);
    ctx.fill();
    if (!rep.mistakes.length) {
      D.text(ctx, '✔ Sin errores de procedimiento: ¡así sí!', tx, my + 24, { size: 19, weight: 800, color: '#2f7a33' });
    } else {
      D.text(ctx, `✖ LO QUE NO VA ASÍ (${rep.mistakes.length})`, tx, my + 22, { size: 16, weight: 800, color: '#b3261e' });
      let ly = my + 46;
      for (const m of rep.mistakes.slice(0, 3)) {
        D.text(ctx, '•', tx, ly, { size: 16, weight: 800, color: '#b3261e' });
        ly += D.paragraph(ctx, m, tx + 16, ly, 640, { size: 15, weight: 600, color: '#2a170d', maxLines: 2 }) + 4;
      }
      if (rep.mistakes.length > 3) D.text(ctx, `y ${rep.mistakes.length - 3} más…`, tx + 16, ly + 2, { size: 14, color: '#7a5030' });
    }

    let fx = V.width / 2 - 330;
    for (const [k, l] of [
      ['ENTER', 'otra vez'],
      ['D', 'cambiar dificultad'],
      ['ESC', 'menú de juegos'],
    ]) {
      const kw = D.keycap(ctx, k, fx, 684, { size: 16, color: game.accent });
      D.text(ctx, l, fx + kw / 2 + 10, 690, { size: 18, weight: 600, color: T.ink });
      fx += 240;
    }
  }

  PF.Screens = { menuCards, diffCards, playButton, drawMenu, drawSetup, drawPause, drawReport };
})();
