// Adaptador de "Pasteurizadora Flash: Turno 60" a la colección de juegos:
// dificultad, burbujas de error y reporte de calidad común.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const D = PF.Draw;
  const B = PF.Bubble;
  const Sim = PF.Sim;
  const C = PF.CONFIG;
  const T = D.T;
  const ACCENT = '#ffd34d';

  const MINIGAME_ERRORS = {
    arrows: 'Así no se desatora: repite la secuencia de flechas en el mismo orden.',
    simon: 'Ese no era el color: el sensor sigue descalibrado. Mira el patrón otra vez.',
    timing: 'Fuera de la zona: el antiespumante se desperdicia. Pulsa cuando la aguja esté dentro.',
  };

  function create(diffId = 'normal', opts = {}) {
    const g = Sim.createGame({ difficulty: diffId, seed: opts.seed });
    const s = { id: 'pasteurizer', diff: diffId, g, bubble: B.create(), surface: null, lastDiscardTip: -99, over: false };
    s.update = (dt, input) => update(s, dt, input);
    s.draw = (r) => draw(s, r);
    s.report = () => report(s);
    return s;
  }

  function update(s, dt, input) {
    const g = s.g;
    Sim.step(g, dt, input);
    B.update(s.bubble, dt);
    if (g.player.adjust) D.sfx('adjust');
    for (const sig of g.signals.splice(0)) {
      if (s.surface) PF.Render.onSignal(s.surface, sig);
      handleSignal(s, sig);
    }
    if (s.surface) PF.Render.update(s.surface, g, dt);
    if (g.over && !s.over) {
      s.over = true;
      if (PF.Audio) PF.Audio.setSiren(false);
    }
  }

  function handleSignal(s, sig) {
    const g = s.g;
    switch (sig.type) {
      case 'error': {
        const rep = Sim.activeRepair(g, sig.station);
        const msg = rep && MINIGAME_ERRORS[rep.mg.type];
        if (msg) B.say(s.bubble, msg);
        D.sfx('error');
        break;
      }
      case 'lineStop':
        B.say(s.bubble, 'Nunca cierres la válvula del todo: la línea se para y al rearrancar se purga 1 HL a descarte.');
        D.sfx('lineStop');
        break;
      case 'denied':
        B.say(s.bubble, 'Estación bloqueada: espera a que se restablezca y atiende otra alarma mientras tanto.', { kind: 'tip' });
        D.sfx('denied');
        break;
      case 'discardStart': {
        D.sfx('discardStart');
        // Avisos de descarte espaciados para no tapar la pantalla en hora pico.
        if (g.time - s.lastDiscardTip < 6 || (s.bubble.cur && s.bubble.cur.kind === 'error')) break;
        s.lastDiscardTip = g.time;
        const cfg = C.VARS[sig.variable];
        const st = { temp: 'T', valve: 'V', pump: 'B' }[cfg.station];
        B.say(s.bubble, `${cfg[sig.dir].cause[0].toUpperCase() + cfg[sig.dir].cause.slice(1)}: la cerveza ${cfg[sig.dir].effect} y se va a DESCARTE. Corre a la estación ${st}.`);
        break;
      }
      case 'resolved':
        if (sig.byPlayer) D.sfx('resolved');
        break;
      case 'phase':
        if (PF.Audio) PF.Audio.setSiren(!!sig.peak);
        break;
      case 'alarm':
      case 'blip':
      case 'enter':
      case 'blocked':
        D.sfx(sig.type);
        break;
    }
  }

  function draw(s, r) {
    if (s.surface !== r) {
      s.surface = r;
      PF.Render.resetFx(r);
    }
    PF.Render.drawGame(r, s.g);
    B.draw(r.ctx, s.bubble, s.g.player);
  }

  function report(s) {
    const res = Sim.results(s.g);
    const score = Math.round(res.efficiency);
    return {
      score,
      rank: res.rank,
      headline: Sim.summaryText(res),
      rows: [
        ['HL procesados', `${Sim.fmt(res.processed, 1)} HL`, T.ink],
        ['HL aprobados', `${Sim.fmt(res.approved, 1)} HL`, '#ffd34d'],
        ['HL desechados', `${Sim.fmt(res.discarded, 1)} HL`, T.red],
        ['Eficiencia', `${Sim.fmt(res.efficiency, 1)} %`, D.rankColor(res.rank)],
        ['Causa principal', res.mainCauseLabel || 'ninguna', res.mainCauseLabel ? T.red : T.ok],
        ['Fallas controladas', `${res.resolved} de ${res.spawned}`, T.ink],
      ],
      mistakes: s.bubble.log.slice(),
    };
  }

  function icon(ctx, cx, cy, size, t) {
    // Termómetro y gota de cerveza.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#e8edf2';
    D.roundRect(ctx, -size * 0.32, -size * 0.42, size * 0.18, size * 0.66, size * 0.09);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-size * 0.23, size * 0.28, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
    const level = 0.45 + 0.25 * Math.sin(t * 2);
    ctx.fillStyle = '#ff4b4b';
    ctx.fillRect(-size * 0.27, size * 0.24 - size * 0.6 * level, size * 0.08, size * 0.6 * level);
    ctx.beginPath();
    ctx.arc(-size * 0.23, size * 0.28, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.moveTo(size * 0.22, -size * 0.36);
    ctx.quadraticCurveTo(size * 0.48, 0, size * 0.22, size * 0.3);
    ctx.quadraticCurveTo(-size * 0.04, 0, size * 0.22, -size * 0.36);
    ctx.fill();
    ctx.restore();
  }

  PF.Games = PF.Games || [];
  PF.Games.push({
    id: 'pasteurizer',
    order: 1,
    title: 'Pasteurizadora Flash',
    subtitle: 'Turno 60',
    tagline: 'Temperatura, flujo y retención en rango mientras las alarmas se acumulan.',
    accent: ACCENT,
    icon,
    howTo: [
      'Mantén temperatura (24–30 PU), flujo (0,85–0,95 HL/s) y retención (2,8–3,2 s) en rango.',
      'Fuera de rango más de 0,4 s → esa cerveza va a descarte.',
      'Corre a la estación marcada, pulsa E y corrige con A/D o con el mini-juego.',
      'No cierres la válvula del todo: 2 s al mínimo y se para la línea.',
    ],
    controls: [
      ['WASD', 'moverse', 'lstick'],
      ['E', 'operar', 'x'],
      ['A / D', 'ajustar', 'dpadLR'],
      ['ESPACIO · 1-4', 'reparar', ['a', 'lb']],
    ],
    difficulties: {
      facil: ['Las variables derivan más despacio', 'Fallas más espaciadas, una menos a la vez', 'Sin bloqueos de estación'],
      normal: ['El turno estándar de 60 s', 'Hasta 3 fallas a la vez en hora pico', 'Bloqueos breves en hora pico'],
      dificil: ['Derivas 20 % más rápidas', 'Una falla simultánea extra', 'Más bloqueos en hora pico'],
    },
    create,
  });
})();
