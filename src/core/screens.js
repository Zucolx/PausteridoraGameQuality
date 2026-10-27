// Pantallas de la colección: menú de juegos, selector de dificultad, pausa y
// "Reporte de Calidad". Estética del afiche: negro, naranja quemado y latón.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const T = D.T;
  const V = D.VIEW;

  const CARD = { w: 270, h: 392, gap: 16, y: 214 };

  function menuCards(n) {
    const w = Math.min(CARD.w, Math.floor((V.width - 56 - (n - 1) * CARD.gap) / n));
    const total = n * w + (n - 1) * CARD.gap;
    const x0 = (V.width - total) / 2;
    return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + CARD.gap), y: CARD.y, w, h: CARD.h }));
  }

  // rows: filas de opciones extra bajo las tarjetas (0, 1 o 2); con más filas, tarjetas más bajas.
  function diffCards(rows = 0) {
    const h = [146, 124, 108][Math.min(2, +rows)];
    const step = [156, 132, 114][Math.min(2, +rows)];
    return D.DIFFICULTIES.map((d, i) => ({ id: d.id, x: 736, y: 140 + i * step, w: 504, h }));
  }

  // Opciones extra del juego (duración en Control de UP; modo y tiempo de respuesta en Supervisor de Turno).
  // game.choices = [{ key, title, values: [{ value, label }], index }] (index: valor por defecto).
  function choicesOf(game) {
    if (game.choices) return game.choices;
    if (game.choice) return [game.choice];
    if (game.durations) {
      return [{ key: 'duration', title: 'DURACIÓN', values: game.durations.map((v) => ({ value: v, label: `${v} s` })), index: game.durations.length - 1 }];
    }
    return [];
  }

  function choiceOf(game) {
    return choicesOf(game)[0] || null;
  }

  // row: fila de la opción; con dos filas, la primera sube para dejar sitio a la segunda.
  function choiceChips(choice, row = 0, rows = 1) {
    const gap = 8;
    const widths = choice.values.map((v) => Math.max(56, v.label.length * 11 + 24));
    const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
    let x = 736 + 504 - total;
    const y = 548 - (rows - 1 - row) * 58;
    return choice.values.map((v, i) => {
      const c = { value: v.value, label: v.label, x, y, w: widths[i], h: 44 };
      x += widths[i] + gap;
      return c;
    });
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

  // Botones del menú: configuración (con clave) y pantalla completa (táctiles).
  function gearButton() {
    return { x: 1196, y: 18, w: 66, h: 66 };
  }

  function fullscreenButton() {
    return { x: 18, y: 18, w: 66, h: 66 };
  }

  function iconButton(ctx, rc, glyph, caption, color = T.dim) {
    D.panel(ctx, rc.x, rc.y, rc.w, rc.h, { fill: '#170e0a', edge: '#3a2418', radius: 14 });
    D.text(ctx, glyph, rc.x + rc.w / 2, rc.y + 38, { size: 30, weight: 700, color, align: 'center' });
    D.text(ctx, caption, rc.x + rc.w / 2, rc.y + 58, { size: 11, weight: 700, color: T.faint, align: 'center' });
  }

  function drawMenu(ctx, t, games, sel, records, { fullscreen = false } = {}) {
    backdrop(ctx, t);
    iconButton(ctx, gearButton(), '⚙', 'ajustes');
    if (fullscreen) iconButton(ctx, fullscreenButton(), '⛶', 'pantalla');
    glowText(ctx, 'LO QUE NO SE VE,', V.width / 2, 92, 54, T.ink, T.orange);
    glowText(ctx, 'TAMBIÉN SE LIMPIA', V.width / 2, 150, 60, T.orange, T.orangeDark);
    D.text(ctx, 'Colección de juegos de calidad · partidas cortas para aprender jugando', V.width / 2, 188, { size: 19, weight: 600, color: T.dim, align: 'center' });

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
      game.icon(ctx, x + c.w / 2, y + 88, Math.min(120, c.w * 0.5), on ? t : 0);
      ctx.restore();
      D.keycap(ctx, String(i + 1), x + 30, y + 30, { size: 15, color: on ? game.accent : '#5a4030' });

      // Con muchas tarjetas, el título se achica si una palabra no cabe en el ancho.
      let ts = c.w < 250 ? 23 : 27;
      ctx.font = D.font(ts, 800);
      const words = game.title.toUpperCase().split(' ');
      while (ts > 16 && words.some((w) => ctx.measureText(w).width > c.w - 32)) ctx.font = D.font(--ts, 800);
      const lines = D.wrap(ctx, game.title.toUpperCase(), c.w - 32);
      lines.forEach((l, j) => D.text(ctx, l, x + 16, y + 196 + j * (ts + 1), { size: ts, weight: 800, color: on ? T.ink : T.dim }));
      const ty = y + 196 + lines.length * (ts + 1);
      let ss = 16;
      ctx.font = D.font(ss, 700);
      while (ctx.measureText(game.subtitle).width > c.w - 32 && ss > 11) ctx.font = D.font(--ss, 700);
      D.text(ctx, game.subtitle, x + 16, ty, { size: ss, weight: 700, color: game.accent });
      D.paragraph(ctx, game.tagline, x + 16, ty + 26, c.w - 32, { size: 15, weight: 500, color: on ? T.ink : T.faint, maxLines: 3 });

      // Récords por dificultad.
      const rec = records[game.id] || {};
      const chipW = Math.floor((c.w - 32 - 12) / 3);
      D.DIFFICULTIES.forEach((d, j) => {
        const bx = x + 16 + j * (chipW + 6);
        const by = y + c.h - 46;
        ctx.fillStyle = '#100906';
        D.roundRect(ctx, bx, by, chipW, 32, 6);
        ctx.fill();
        D.text(ctx, d.label[0], bx + 12, by + 21, { size: 13, weight: 800, color: d.color });
        const b = rec[d.id];
        D.text(ctx, b ? b.rank : '—', bx + chipW - 12, by + 22, { size: 18, weight: 800, color: b ? D.rankColor(b.rank) : T.faint, align: 'right' });
      });
    });

    const device = D.InputState.device;
    if (device === 'touch') D.text(ctx, '☝  Toca un juego para empezar', V.width / 2, 668, { size: 20, weight: 700, color: T.dim, align: 'center' });
    else {
      D.hints(
        ctx,
        [
          [{ key: '← →', pad: 'dpadLR' }, 'elegir juego'],
          [{ key: 'ENTER', pad: 'a' }, 'continuar'],
          [{ key: 'C', pad: 'select' }, 'ajustes'],
        ].concat(device === 'keyboard' ? [[{ key: 'M' }, 'sonido']] : []),
        V.width / 2,
        664,
        { size: 15, gap: 40, ink: T.dim, align: 'center' }
      );
    }
    D.text(ctx, padStatus(), V.width / 2, 700, { size: 14, color: T.faint, align: 'center' });
  }

  // ------------------------------------------------------- Dificultad

  function padStatus() {
    const type = D.InputState.padType;
    if (D.InputState.device === 'touch') return 'Pantalla táctil · también funciona con teclado, ratón y mandos PS o Xbox';
    if (!type) return 'Teclado y ratón · conecta un mando PS o Xbox y pulsa cualquier botón para usarlo';
    return `Mando ${type === 'ps' ? 'PlayStation' : 'Xbox'} conectado · los botones en pantalla se adaptan al mando`;
  }

  // values: valor elegido en cada fila de opciones; focus: fila activa (-1 = dificultad).
  // locked: dificultad fijada por la configuración (no se puede cambiar).
  function drawSetup(ctx, t, game, diffSel, records, values = [], focus = -1, { locked = false } = {}) {
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
    D.text(ctx, { keyboard: 'teclado', ps: 'mando PlayStation', xbox: 'mando Xbox', touch: 'pantalla táctil' }[D.InputState.device] || 'mando Xbox', 190, 560, { size: 14, weight: 700, color: game.accent });
    game.controls.forEach(([k, label, pad], i) => {
      const cx = 60 + (i % 2) * 320;
      const cy = 596 + Math.floor(i / 2) * 44;
      const w = D.control(ctx, { key: k, pad }, cx, cy, { size: 15, color: game.accent });
      D.text(ctx, label, cx + w + 12, cy + 6, { size: 16, weight: 600, color: T.ink });
    });

    D.text(ctx, locked ? 'DIFICULTAD FIJADA POR CONFIGURACIÓN' : 'ELIGE LA DIFICULTAD', 736, 120, { size: 20, weight: 800, color: T.ink });
    drawButton(ctx, backButton(), { key: 'ESC', pad: 'b' }, '◀ VOLVER', { color: game.accent });
    const rec = records[game.id] || {};
    const choices = choicesOf(game);
    const rows = choices.length;
    const compact = rows > 0;
    const tight = rows > 1;
    diffCards(rows).forEach((c, i) => {
      const d = D.DIFFICULTIES[i];
      const on = i === diffSel;
      ctx.save();
      if (locked && !on) ctx.globalAlpha = 0.3;
      D.panel(ctx, c.x, c.y, c.w, c.h, { fill: on ? '#24150d' : '#140c09', edge: on ? d.color : '#3a2418', radius: 14, glow: on ? d.color : null });
      if (on) {
        ctx.fillStyle = d.color;
        D.roundRect(ctx, c.x, c.y, 10, c.h, 5);
        ctx.fill();
      }
      const top = tight ? 30 : compact ? 34 : 40;
      for (let p = 0; p < 3; p++) D.pumpkin(ctx, c.x + 42 + p * 46, c.y + top, 24, p < d.pumpkins);
      D.text(ctx, d.label, c.x + 172, c.y + top + 10, { size: 32, weight: 800, color: d.color });
      if (D.InputState.device === 'keyboard' && !locked) D.keycap(ctx, String(i + 1), c.x + c.w - 30, c.y + 34, { size: 14, color: on ? d.color : '#5a4030' });
      D.text(ctx, `Récord: ${bestLabel(rec[d.id])}`, c.x + c.w - 54, c.y + 41, { size: 14, weight: 700, color: T.dim, align: 'right' });
      const by = tight ? 62 : compact ? 70 : 82;
      const step = tight ? 18 : compact ? 19 : 22;
      game.difficulties[d.id].forEach((b, j) => {
        D.text(ctx, '•', c.x + 28, c.y + by + j * step, { size: 16, weight: 800, color: d.color });
        D.text(ctx, b, c.x + 44, c.y + by + j * step, { size: tight ? 14 : compact ? 15 : 16, weight: 600, color: on ? T.ink : T.dim });
      });
      if (locked && !on) D.text(ctx, '🔒', c.x + c.w - 30, c.y + c.h - 16, { size: 18, align: 'center' });
      ctx.restore();
    });
    const chosen = [];
    choices.forEach((choice, r) => {
      const chips = choiceChips(choice, r, rows);
      const active = rows > 1 && focus === r;
      const ty = chips[0].y + 28;
      if (active) D.text(ctx, '▸', 736, ty, { size: 17, weight: 800, color: game.accent });
      // El título se achica si no cabe a la izquierda de las opciones.
      const tx = active ? 756 : 736;
      let size = rows > 1 ? 15 : 17;
      ctx.font = D.font(size, 800);
      while (size > 11 && ctx.measureText(choice.title).width > chips[0].x - tx - 10) ctx.font = D.font(--size, 800);
      D.text(ctx, choice.title, tx, ty, { size, weight: 800, color: active ? game.accent : T.ink });
      for (const c of chips) {
        const on = c.value === values[r];
        if (on) chosen.push(c.label);
        D.panel(ctx, c.x, c.y, c.w, c.h, { fill: on ? game.accent : '#140c09', edge: on ? game.accent : '#3a2418', radius: 10, glow: on ? game.accent : null });
        D.text(ctx, c.label, c.x + c.w / 2, c.y + 29, { size: 19, weight: 800, color: on ? '#170e0a' : T.dim, align: 'center' });
      }
    });
    if (rows === 1) D.hints(ctx, [[{ key: '← →', pad: 'dpadLR' }, 'cambiar']], 736, 602, { size: 12, ink: T.dim });
    else if (rows > 1) {
      const what = focus >= 0 ? choices[focus].title.toLowerCase() : choices[0].title.toLowerCase();
      D.hints(ctx, [[{ key: '← →', pad: 'dpadLR' }, `cambiar ${what}`]], 736, 602, { size: 12, ink: T.dim });
    }
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
    const label = `▶  JUGAR EN ${[d.label, ...chosen].join(' · ')}`;
    let size = 24;
    ctx.font = D.font(size, 800);
    while (size > 16 && ctx.measureText(label).width > b.w - 140) ctx.font = D.font(--size, 800);
    D.text(ctx, label, b.x + 24, b.y + 29 + size / 3, { size, weight: 800, color: '#170e0a' });
    D.control(ctx, { key: 'ENTER', pad: 'a' }, b.x + b.w - 90, b.y + b.h / 2, { size: 16, color: '#170e0a', keyInk: d.color });
    const nav = locked ? (rows > 1 ? 'opciones' : null) : rows > 1 ? 'dificultad / opciones' : 'dificultad';
    D.hints(
      ctx,
      [...(nav ? [[{ key: '↑ ↓', pad: 'dpadUD' }, nav]] : []), [{ key: 'ESC', pad: 'b' }, 'volver']],
      b.x + b.w / 2,
      b.y - 16,
      { size: 12, ink: T.faint, align: 'center', color: '#6e5a48' }
    );
  }

  // ------------------------------------------------------------ Botones tocables

  function backButton() {
    return { x: 1080, y: 50, w: 160, h: 42 };
  }

  // Botón con su control (tecla, botón del mando o ☝ en pantallas táctiles) y texto.
  function drawButton(ctx, rc, spec, label, { color = T.orange, fill = '#1e130e', ink = T.ink, size = 18 } = {}) {
    D.panel(ctx, rc.x, rc.y, rc.w, rc.h, { fill, edge: color, radius: 10 });
    ctx.font = D.font(size, 800);
    const cw = D.measureControl(ctx, spec, size * 0.8);
    const tw = ctx.measureText(label).width;
    const x0 = rc.x + (rc.w - (cw + 10 + tw)) / 2;
    D.control(ctx, spec, x0, rc.y + rc.h / 2, { size: size * 0.8, color });
    D.text(ctx, label, x0 + cw + 10, rc.y + rc.h / 2 + size * 0.35, { size, weight: 800, color: ink });
  }

  function row(items, y, w, h, gap = 20) {
    const x0 = V.width / 2 - (items.length * w + (items.length - 1) * gap) / 2;
    return items.map((it, i) => ({ ...it, x: x0 + i * (w + gap), y, w, h }));
  }

  function pauseButtons() {
    return row(
      [
        { action: 'start', spec: { key: 'P', pad: 'start' }, label: 'Continuar' },
        { action: 'alt', spec: { key: 'R', pad: 'y' }, label: 'Reiniciar' },
        { action: 'back', spec: { key: 'ESC', pad: 'b' }, label: 'Menú de juegos' },
      ],
      376,
      260,
      58
    );
  }

  // alt: texto del botón para volver a la pantalla de inicio (null si no hay nada que elegir).
  function reportButtons(alt = 'Cambiar dificultad') {
    return row(
      [
        { action: 'confirm', spec: { key: 'ENTER', pad: 'a' }, label: 'Otra vez' },
        ...(alt ? [{ action: 'alt', spec: { key: 'D', pad: 'y' }, label: alt }] : []),
        { action: 'back', spec: { key: 'ESC', pad: 'b' }, label: 'Menú de juegos' },
      ],
      660,
      280,
      48
    );
  }

  // ------------------------------------------------------------ Configuración

  const DIFF_OPTIONS = [{ value: null, label: 'Cada jugador elige', color: T.ink }].concat(D.DIFFICULTIES.map((d) => ({ value: d.id, label: d.label, color: d.color })));

  // Elementos de la pantalla de configuración, en orden de navegación.
  function configItems(games) {
    const items = games.map((g, i) => ({ kind: 'game', id: g.id, x: 60, y: 168 + i * 64, w: 600, h: 56 }));
    DIFF_OPTIONS.forEach((o, i) => items.push({ kind: 'diff', value: o.value, x: 720, y: 168 + i * 64, w: 500, h: 56 }));
    items.push({ kind: 'done', x: 720, y: 600, w: 500, h: 60 });
    return items;
  }

  function drawConfig(ctx, t, games, cfg, focus) {
    backdrop(ctx, t);
    glowText(ctx, '⚙ CONFIGURACIÓN', V.width / 2, 76, 44, T.ink, T.orange);
    D.text(ctx, 'Se guarda en este dispositivo', V.width / 2, 112, { size: 17, weight: 600, color: T.dim, align: 'center' });
    D.text(ctx, 'JUEGOS ACTIVOS', 60, 152, { size: 16, weight: 800, color: T.dim });
    D.text(ctx, 'DIFICULTAD GENERAL', 720, 152, { size: 16, weight: 800, color: T.dim });
    const items = configItems(games);
    const active = games.filter((g) => !cfg.disabled.includes(g.id)).length;
    items.forEach((it, i) => {
      const on = i === focus;
      if (it.kind === 'game') {
        const g = games.find((x) => x.id === it.id);
        const enabled = !cfg.disabled.includes(it.id);
        D.panel(ctx, it.x, it.y, it.w, it.h, { fill: on ? '#24150d' : '#170e0a', edge: on ? g.accent : '#3a2418', radius: 12, glow: on ? g.accent : null });
        D.text(ctx, `${games.indexOf(g) + 1}. ${g.title}`, it.x + 18, it.y + 26, { size: 20, weight: 800, color: enabled ? T.ink : T.faint });
        D.text(ctx, g.subtitle, it.x + 18, it.y + 46, { size: 13, weight: 700, color: enabled ? g.accent : T.faint });
        // Interruptor.
        const sx = it.x + it.w - 104;
        const sy = it.y + 14;
        ctx.fillStyle = enabled ? T.ok : '#3a2e26';
        D.roundRect(ctx, sx, sy, 86, 28, 14);
        ctx.fill();
        ctx.fillStyle = '#f4efe6';
        ctx.beginPath();
        ctx.arc(enabled ? sx + 72 : sx + 14, sy + 14, 11, 0, Math.PI * 2);
        ctx.fill();
        D.text(ctx, enabled ? 'SÍ' : 'NO', enabled ? sx + 28 : sx + 58, sy + 20, { size: 14, weight: 800, color: enabled ? '#0e1a0c' : T.dim, align: 'center' });
      } else if (it.kind === 'diff') {
        const o = DIFF_OPTIONS.find((x) => x.value === it.value);
        const chosen = cfg.difficulty === it.value;
        D.panel(ctx, it.x, it.y, it.w, it.h, { fill: chosen ? '#24150d' : '#170e0a', edge: on ? T.orange : chosen ? o.color : '#3a2418', radius: 12, glow: on ? T.orange : null });
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(it.x + 30, it.y + it.h / 2, 11, 0, Math.PI * 2);
        ctx.stroke();
        if (chosen) {
          ctx.fillStyle = o.color;
          ctx.beginPath();
          ctx.arc(it.x + 30, it.y + it.h / 2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        D.text(ctx, it.value ? `Fijar en ${o.label}` : o.label, it.x + 54, it.y + 35, { size: 20, weight: 800, color: o.color });
      } else {
        D.panel(ctx, it.x, it.y, it.w, it.h, { fill: T.orange, edge: T.orange, radius: 12, glow: on ? T.orange : null });
        D.text(ctx, '✔  LISTO, VOLVER AL MENÚ', it.x + it.w / 2, it.y + 39, { size: 22, weight: 800, color: '#170e0a', align: 'center' });
      }
    });
    D.paragraph(
      ctx,
      cfg.difficulty
        ? 'La dificultad queda fijada para todos los juegos: en la pantalla de inicio no se puede cambiar.'
        : 'Cada jugador elige la dificultad en la pantalla de inicio de cada juego.',
      720,
      450,
      500,
      { size: 15, color: T.dim }
    );
    D.paragraph(ctx, `${active} de ${games.length} juegos activos. Siempre queda al menos uno.`, 720, 510, 500, { size: 15, color: T.dim });
    D.hints(
      ctx,
      [
        [{ key: '↑ ↓ ← →', pad: 'dpad' }, 'moverse'],
        [{ key: 'ENTER', pad: 'a' }, 'cambiar'],
        [{ key: 'ESC', pad: 'b' }, 'volver'],
      ],
      V.width / 2,
      700,
      { size: 14, gap: 36, ink: T.dim, align: 'center' }
    );
  }

  // ------------------------------------------------------------ Pausa

  function drawPause(ctx) {
    ctx.fillStyle = 'rgba(8,4,3,0.78)';
    ctx.fillRect(0, 0, V.width, V.height);
    glowText(ctx, 'PAUSA', V.width / 2, 320, 72, T.ink, T.orange);
    for (const b of pauseButtons()) drawButton(ctx, b, b.spec, b.label);
  }

  // ------------------------------------------------------------ Reporte

  function drawReport(ctx, t, game, diffId, rep, record, isRecord, { alt = 'Cambiar dificultad' } = {}) {
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

    for (const b of reportButtons(alt)) drawButton(ctx, b, b.spec, b.label, { color: game.accent, size: 17 });
  }

  PF.Screens = { configItems, drawConfig, gearButton, fullscreenButton, menuCards, diffCards, choicesOf, choiceOf, choiceChips, playButton, backButton, pauseButtons, reportButtons, drawButton, drawMenu, drawSetup, drawPause, drawReport };
})();
