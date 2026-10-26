// Arranque de la colección: teclado, ratón y mando (PS/Xbox), bucle principal y
// pantallas (menú → dificultad/duración → turno → pausa → reporte de calidad).
(function () {
  'use strict';
  const PF = globalThis.PF;
  const D = PF.Draw;
  const S = PF.Screens;
  const Pad = PF.Pad;
  const Audio = PF.Audio;
  const IS = PF.InputState;

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
  let choiceSel = {};
  let inst = null;
  let report = null;
  let isRecord = false;
  let records = loadRecords();
  let padPrev = null;
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
  const NAMED = { KeyE: 'interact', Escape: 'cancel', KeyQ: 'cancel', Space: 'space', Enter: 'confirm', NumpadEnter: 'confirm', Tab: 'tab', KeyY: 'y', KeyX: 'x', KeyH: 'help', KeyC: 'joker', KeyV: 'view' };
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

  // Opción extra del juego (duración, modo…): valor elegido o el de por defecto.
  function choiceIndex() {
    const c = S.choiceOf(game());
    if (!c) return -1;
    const i = choiceSel[game().id] ?? c.index;
    return Math.max(0, Math.min(c.values.length - 1, i));
  }

  function choiceValue() {
    const c = S.choiceOf(game());
    return c ? c.values[choiceIndex()].value : null;
  }

  function moveChoice(delta) {
    const c = S.choiceOf(game());
    if (!c) return;
    choiceSel[game().id] = Math.max(0, Math.min(c.values.length - 1, choiceIndex() + delta));
  }

  function startGame() {
    const c = S.choiceOf(game());
    inst = game().create(diffId(), c ? { [c.key]: choiceValue() } : {});
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

  function pause() {
    screen = 'paused';
    held.clear();
    if (Audio) Audio.setSiren(false);
  }

  // Acciones de las pantallas fuera del turno; las comparten teclado y mando.
  function shell(action, digit) {
    const dirs = ['up', 'down', 'left', 'right'];
    if (screen === 'menu') {
      if (action === 'left') sel = (sel + games.length - 1) % games.length;
      else if (action === 'right') sel = (sel + 1) % games.length;
      else if (action === 'digit' && digit <= games.length) {
        sel = digit - 1;
        screen = 'setup';
      } else if (action === 'confirm' || action === 'start') screen = 'setup';
    } else if (screen === 'setup') {
      if (action === 'up') diffSel = Math.max(0, diffSel - 1);
      else if (action === 'down') diffSel = Math.min(2, diffSel + 1);
      else if (action === 'left') moveChoice(-1);
      else if (action === 'right') moveChoice(1);
      else if (action === 'digit' && digit <= 3) {
        diffSel = digit - 1;
        startGame();
      } else if (action === 'confirm' || action === 'start') startGame();
      else if (action === 'back') screen = 'menu';
    } else if (screen === 'report') {
      if (action === 'confirm' || action === 'start') startGame();
      else if (action === 'alt') screen = 'setup';
      else if (action === 'back') toMenu();
    } else if (screen === 'paused') {
      if (action === 'start') screen = 'play';
      else if (action === 'alt') startGame();
      else if (action === 'back') toMenu();
    }
    if (dirs.includes(action)) D.sfx('blip');
  }

  // ----------------------------------------------------------- Teclado

  const KEY_SHELL = { Enter: 'confirm', Space: 'confirm', NumpadEnter: 'confirm', Escape: 'back', Backspace: 'back', KeyD: 'alt', KeyR: 'alt', KeyP: 'start' };

  addEventListener('keydown', (e) => {
    if (Audio) Audio.init();
    IS.device = 'keyboard';
    const code = e.code;
    if (PREVENT.has(code)) e.preventDefault();
    if (code === 'KeyM') {
      if (Audio) Audio.setMuted(!Audio.isMuted());
      return;
    }
    if (screen !== 'play') {
      if (e.repeat && !DIR[code]) return;
      if (DIGIT[code]) return shell('digit', +DIGIT[code]);
      // En el reporte, D cambia de dificultad aunque también sea "derecha".
      if (screen === 'report' && code === 'KeyD') return shell('alt');
      if (screen === 'report' && code === 'KeyR') return shell('confirm');
      if (screen === 'paused' && code === 'KeyR') return shell('alt');
      if (screen === 'paused' && code === 'Escape') return shell('back');
      if (DIR[code]) return shell(DIR[code]);
      if (KEY_SHELL[code]) shell(KEY_SHELL[code]);
      return;
    }
    if (code === 'KeyP') return pause();
    if (e.repeat) return;
    held.add(code);
    if (NAMED[code]) pressed.push(NAMED[code]);
    if (DIR[code]) pressed.push(DIR[code]);
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
    if (Math.hypot(p.x - mouse.x, p.y - mouse.y) > 4) IS.device = 'keyboard';
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
    IS.device = 'keyboard';
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
      const choice = S.choiceOf(game());
      const i = S.diffCards(!!choice).findIndex((c) => inside(p, c));
      const chip = choice ? S.choiceChips(choice).findIndex((c) => inside(p, c)) : -1;
      if (i >= 0) {
        if (i === diffSel) startGame();
        else diffSel = i;
      } else if (chip >= 0) choiceSel[game().id] = chip;
      else if (inside(p, S.playButton())) startGame();
    } else if (screen === 'play') {
      clicks.push(p);
    }
  });

  addEventListener('mouseup', () => {
    mouse.down = false;
  });

  // ------------------------------------------------------------- Mando

  function pollPad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(list || []).find((p) => p && p.connected);
    if (!gp) {
      padPrev = null;
      IS.padType = null;
      if (IS.device !== 'keyboard') IS.device = 'keyboard';
      return null;
    }
    const cur = Pad.snapshot(gp);
    const fresh = Pad.edges(padPrev, cur);
    padPrev = cur;
    IS.padType = cur.type;
    if (fresh.length || Pad.active(cur)) {
      IS.device = cur.type;
      if (Audio && fresh.length) Audio.init();
    }
    return { cur, pressed: fresh };
  }

  addEventListener('gamepadconnected', (e) => {
    IS.padType = Pad.detect(e.gamepad.id);
    IS.device = IS.padType;
  });

  function readInput(pad) {
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
    const input = { moveX: mx, moveY: my, adjust: mx, space: held.has('Space'), pressed, clicks, mouse: { ...mouse }, pad: null };
    if (pad) {
      const c = pad.cur;
      input.pad = { type: c.type, held: c.held, pressed: pad.pressed, lx: c.lx, ly: c.ly, rx: c.rx, ry: c.ry };
      // Los juegos de mapa reciben el mando traducido a sus teclas; los "raw" lo leen directo.
      if (!game().padRaw) {
        const dx = (c.held.right ? 1 : 0) - (c.held.left ? 1 : 0);
        const dy = (c.held.down ? 1 : 0) - (c.held.up ? 1 : 0);
        input.moveX = Math.sign(input.moveX + dx + (c.lx ? Math.sign(c.lx) : 0));
        input.moveY = Math.sign(input.moveY + dy + (c.ly ? Math.sign(c.ly) : 0));
        input.adjust = input.moveX;
        input.space = input.space || c.held.a;
        input.mouse.down = input.mouse.down || c.held.a;
        input.pressed = input.pressed.concat(Pad.toKeys(pad.pressed));
      }
    }
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
    const pad = pollPad();
    if (pad && screen !== 'play') {
      for (const a of Pad.toMenu(pad.pressed)) shell(a);
      // El botón que arrancó el turno no cuenta como acción dentro del juego.
      if (screen === 'play') pad.pressed = [];
    }
    if (screen === 'play') {
      if (pad && pad.pressed.includes('start')) pause();
    }
    if (screen === 'play') {
      inst.update(dt, readInput(pad));
      inst.draw(r);
      if (inst.over) finish();
    } else if (screen === 'paused') {
      inst.draw(r);
      S.drawPause(ctx);
    } else {
      D.begin(r);
      if (screen === 'menu') S.drawMenu(ctx, r.t, games, sel, records);
      else if (screen === 'setup') S.drawSetup(ctx, r.t, game(), diffSel, records, choiceValue());
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
    // value: duración (Control de UP) o modo (Supervisor de Turno).
    play(id, diff = 'normal', value = null) {
      sel = games.findIndex((g) => g.id === id);
      diffSel = D.DIFFICULTIES.findIndex((d) => d.id === diff);
      const c = S.choiceOf(game());
      if (value != null && c) choiceSel[id] = c.values.findIndex((v) => v.value === value);
      startGame();
    },
  };

  // El canvas no pide las fuentes por sí solo: se cargan antes de dibujar.
  if (document.fonts) {
    for (const f of ['500 16px Rajdhani', '600 16px Rajdhani', '700 16px Rajdhani', '16px "Share Tech Mono"']) document.fonts.load(f).catch(() => {});
  }

  requestAnimationFrame(frame);
})();
