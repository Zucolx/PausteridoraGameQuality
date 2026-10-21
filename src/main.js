// Arranque de la colección: teclado y ratón, bucle principal y pantallas
// (menú → dificultad → turno → pausa → reporte de calidad).
(function () {
  'use strict';
  const PF = globalThis.PF;
  const D = PF.Draw;
  const S = PF.Screens;
  const Audio = PF.Audio;

  const canvas = document.getElementById('game');
  const r = D.createSurface(canvas);
  const games = PF.Games.slice().sort((a, b) => a.order - b.order);
  const RECORDS_KEY = 'lo-que-no-se-ve:records';

  const held = new Set();
  const mouse = { x: -1, y: -1, down: false, moved: false };
  let pressed = [];
  let clicks = [];
  let screen = 'menu';
  let sel = 0;
  let diffSel = 1;
  let inst = null;
  let report = null;
  let isRecord = false;
  let records = loadRecords();
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
  const DIR = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  const NAMED = { KeyE: 'interact', Escape: 'cancel', KeyQ: 'cancel', Space: 'space', Enter: 'confirm', NumpadEnter: 'confirm', Tab: 'tab', KeyY: 'y', KeyX: 'x' };
  const DIGIT = { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4' };
  const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  function loadRecords() {
    try {
      return JSON.parse(localStorage.getItem(RECORDS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveRecords() {
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    } catch {
      // Sin almacenamiento: los récords duran lo que dure la pestaña.
    }
  }

  function game() {
    return games[sel];
  }

  function diffId() {
    return D.DIFFICULTIES[diffSel].id;
  }

  function startGame() {
    inst = game().create(diffId());
    report = null;
    held.clear();
    pressed = [];
    clicks = [];
    screen = 'play';
    D.sfx('enter');
  }

  function finish() {
    report = inst.report();
    const g = game().id;
    const rec = (records[g] = records[g] || {});
    const prev = rec[diffId()];
    // El primer turno siempre queda guardado, pero solo se celebra si puntuó algo.
    isRecord = prev ? report.score > prev.score : report.score > 0;
    if (isRecord || !prev) {
      rec[diffId()] = { score: report.score, rank: report.rank };
      saveRecords();
    }
    if (Audio) Audio.setSiren(false);
    D.sfx('end');
    screen = 'report';
  }

  function toMenu() {
    if (Audio) Audio.setSiren(false);
    inst = null;
    screen = 'menu';
  }

  // ----------------------------------------------------------- Teclado

  addEventListener('keydown', (e) => {
    if (Audio) Audio.init();
    const code = e.code;
    if (PREVENT.has(code)) e.preventDefault();
    if (code === 'KeyM') {
      if (Audio) Audio.setMuted(!Audio.isMuted());
      return;
    }
    const dir = DIR[code];
    if (screen === 'menu') {
      if (dir === 'left') sel = (sel + games.length - 1) % games.length;
      else if (dir === 'right') sel = (sel + 1) % games.length;
      else if (DIGIT[code] && +DIGIT[code] <= games.length) {
        sel = +DIGIT[code] - 1;
        screen = 'setup';
      } else if (code === 'Enter' || code === 'Space') screen = 'setup';
      if (dir) D.sfx('blip');
      return;
    }
    if (screen === 'setup') {
      if (dir === 'up') diffSel = Math.max(0, diffSel - 1);
      else if (dir === 'down') diffSel = Math.min(2, diffSel + 1);
      else if (DIGIT[code] && +DIGIT[code] <= 3) {
        diffSel = +DIGIT[code] - 1;
        startGame();
      } else if (code === 'Enter' || code === 'Space') startGame();
      else if (code === 'Escape' || code === 'Backspace') screen = 'menu';
      if (dir) D.sfx('blip');
      return;
    }
    if (screen === 'report') {
      if (code === 'Enter' || code === 'KeyR' || code === 'Space') startGame();
      else if (code === 'KeyD') screen = 'setup';
      else if (code === 'Escape') toMenu();
      return;
    }
    if (screen === 'paused') {
      if (code === 'KeyP') screen = 'play';
      else if (code === 'KeyR') startGame();
      else if (code === 'Escape') toMenu();
      return;
    }
    // Jugando.
    if (code === 'KeyP') {
      screen = 'paused';
      held.clear();
      if (Audio) Audio.setSiren(false);
      return;
    }
    if (e.repeat) return;
    held.add(code);
    if (NAMED[code]) pressed.push(NAMED[code]);
    if (dir) pressed.push(dir);
    if (DIGIT[code]) pressed.push(DIGIT[code]);
  });

  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  addEventListener('resize', () => D.resize(r));

  // ------------------------------------------------------------- Ratón

  function inside(p, rc) {
    return p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h;
  }

  canvas.addEventListener('mousemove', (e) => {
    const p = D.toLogical(r, e.clientX, e.clientY);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.moved = true;
    if (screen === 'menu') {
      const i = S.menuCards(games.length).findIndex((c) => inside(p, c));
      if (i >= 0 && i !== sel) sel = i;
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (Audio) Audio.init();
    canvas.focus();
    const p = D.toLogical(r, e.clientX, e.clientY);
    mouse.down = true;
    if (screen === 'menu') {
      const i = S.menuCards(games.length).findIndex((c) => inside(p, c));
      if (i >= 0) {
        sel = i;
        screen = 'setup';
      }
    } else if (screen === 'setup') {
      const i = S.diffCards().findIndex((c) => inside(p, c));
      if (i >= 0) {
        if (i === diffSel) startGame();
        else diffSel = i;
      } else if (inside(p, S.playButton())) startGame();
    } else if (screen === 'play') {
      clicks.push(p);
    }
  });

  addEventListener('mouseup', () => {
    mouse.down = false;
  });

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
    const input = { moveX: mx, moveY: my, adjust: mx, space: held.has('Space'), pressed, clicks, mouse: { ...mouse } };
    pressed = [];
    clicks = [];
    mouse.moved = false;
    return input;
  }

  // ------------------------------------------------------------- Bucle

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    r.t += dt;
    const ctx = r.ctx;
    if (screen === 'play') {
      inst.update(dt, readInput());
      inst.draw(r);
      if (inst.over) finish();
    } else if (screen === 'paused') {
      inst.draw(r);
      S.drawPause(ctx);
    } else {
      D.begin(r);
      if (screen === 'menu') S.drawMenu(ctx, r.t, games, sel, records);
      else if (screen === 'setup') S.drawSetup(ctx, r.t, game(), diffSel, records);
      else if (screen === 'report') S.drawReport(ctx, r.t, game(), diffId(), report, (records[game().id] || {})[diffId()], isRecord);
    }
    requestAnimationFrame(frame);
  }

  // Ganchos para pruebas automatizadas en navegador.
  globalThis.__pf = {
    get inst() {
      return inst;
    },
    get screen() {
      return screen;
    },
    games,
    play(id, diff = 'normal') {
      sel = games.findIndex((g) => g.id === id);
      diffSel = D.DIFFICULTIES.findIndex((d) => d.id === diff);
      startGame();
    },
  };

  // El canvas no pide las fuentes por sí solo: se cargan antes de dibujar.
  if (document.fonts) {
    for (const f of ['500 16px Rajdhani', '600 16px Rajdhani', '700 16px Rajdhani', '16px "Share Tech Mono"']) document.fonts.load(f).catch(() => {});
  }

  requestAnimationFrame(frame);
})();
