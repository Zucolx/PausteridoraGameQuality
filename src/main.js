// Arranque: teclado, bucle principal y máquina de pantallas (título → turno → resumen).
(function () {
  'use strict';
  const PF = globalThis.PF;
  const Sim = PF.Sim;
  const Render = PF.Render;
  const Audio = PF.Audio;

  const canvas = document.getElementById('game');
  const r = Render.create(canvas);
  const BEST_KEY = 'pasteurizadora-flash:best';

  const held = new Set();
  let pressed = [];
  let screen = 'title';
  let game = Sim.createGame({ scheduler: false });
  let result = null;
  let best = loadBest();
  let last = performance.now();

  const MOVE = {
    KeyW: [0, -1],
    ArrowUp: [0, -1],
    KeyS: [0, 1],
    ArrowDown: [0, 1],
    KeyA: [-1, 0],
    ArrowLeft: [-1, 0],
    KeyD: [1, 0],
    ArrowRight: [1, 0],
  };
  const DIR = {
    KeyW: 'up',
    ArrowUp: 'up',
    KeyS: 'down',
    ArrowDown: 'down',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
  };
  const DIGIT = { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4' };

  function loadBest() {
    try {
      const v = parseFloat(localStorage.getItem(BEST_KEY));
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  function saveBest(v) {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch {
      // Sin almacenamiento disponible: el récord vive solo en esta sesión.
    }
  }

  function startGame() {
    game = Sim.createGame();
    result = null;
    Render.resetFx(r);
    held.clear();
    pressed = [];
    screen = 'play';
  }

  function finish() {
    result = Sim.results(game);
    if (best == null || result.efficiency > best) {
      best = result.efficiency;
      saveBest(best);
    }
    Audio.setSiren(false);
    r.fx.banner = null;
    r.fx.floats = [];
    screen = 'end';
  }

  addEventListener('keydown', (e) => {
    Audio.init();
    const code = e.code;
    if (MOVE[code] || code === 'Space') e.preventDefault();
    if (code === 'KeyM') {
      Audio.setMuted(!Audio.isMuted());
      return;
    }
    if (screen === 'title') {
      if (code === 'Enter' || code === 'Space') startGame();
      return;
    }
    if (screen === 'end') {
      if (code === 'Enter' || code === 'KeyR') startGame();
      return;
    }
    if (screen === 'paused') {
      if (code === 'KeyP' || code === 'Escape') screen = 'play';
      else if (code === 'KeyR') startGame();
      return;
    }
    // Jugando.
    if (code === 'KeyP') {
      screen = 'paused';
      held.clear();
      Audio.setSiren(false);
      return;
    }
    if (e.repeat) return;
    held.add(code);
    if (code === 'KeyE') pressed.push('interact');
    else if (code === 'Escape' || code === 'KeyQ') pressed.push('cancel');
    else if (code === 'Space') pressed.push('space');
    if (DIR[code]) pressed.push(DIR[code]);
    if (DIGIT[code]) pressed.push(DIGIT[code]);
  });

  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  addEventListener('resize', () => Render.resize(r));

  function readInput() {
    let mx = 0;
    let my = 0;
    for (const code of held) {
      if (MOVE[code]) {
        mx += MOVE[code][0];
        my += MOVE[code][1];
      }
    }
    mx = Math.sign(mx);
    my = Math.sign(my);
    // En una estación, izquierda/derecha ajustan en lugar de mover.
    const adjust = game.player.operating ? mx : 0;
    const input = { moveX: mx, moveY: my, adjust, space: held.has('Space'), pressed };
    pressed = [];
    return input;
  }

  function handleSignals() {
    for (const s of game.signals.splice(0)) {
      Render.onSignal(r, s);
      switch (s.type) {
        case 'alarm':
        case 'discardStart':
        case 'resolved':
        case 'blip':
        case 'error':
        case 'enter':
        case 'denied':
        case 'blocked':
        case 'lineStop':
        case 'end':
          if (s.type !== 'resolved' || s.byPlayer) Audio.play(s.type);
          break;
        case 'phase':
          Audio.setSiren(!!s.peak);
          break;
      }
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (screen === 'play') {
      const input = readInput();
      Sim.step(game, dt, input);
      if (game.player.adjust) Audio.play('adjust');
      handleSignals();
      Render.update(r, game, dt);
      if (game.over) finish();
      Render.drawGame(r, game);
    } else if (screen === 'title') {
      Render.update(r, game, dt);
      Render.drawTitle(r, game);
    } else if (screen === 'paused') {
      Render.drawPause(r, game);
    } else {
      Render.update(r, game, dt);
      Render.drawEnd(r, game, result, best);
    }
    requestAnimationFrame(frame);
  }

  // Ganchos para pruebas automatizadas en navegador.
  globalThis.__pf = {
    get game() {
      return game;
    },
    get screen() {
      return screen;
    },
    start: startGame,
  };

  // El canvas no pide las fuentes por sí solo: se cargan antes del primer turno.
  if (document.fonts) {
    for (const f of ['500 16px Rajdhani', '600 16px Rajdhani', '700 16px Rajdhani', '16px "Share Tech Mono"']) document.fonts.load(f).catch(() => {});
  }

  requestAnimationFrame(frame);
})();
