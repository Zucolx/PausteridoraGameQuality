// Arranque de la colección: teclado, ratón, pantallas táctiles y mando (PS/Xbox), bucle
// principal y pantallas (menú → dificultad/opciones → turno → pausa → reporte de calidad,
// y la configuración protegida con clave).
(function () {
  'use strict';
  const PF = globalThis.PF;
  const D = PF.Draw;
  const S = PF.Screens;
  const Pad = PF.Pad;
  const Touch = PF.Touch;
  const Settings = PF.Settings;
  const Audio = PF.Audio;
  const IS = PF.InputState;

  const canvas = document.getElementById('game');
  const r = D.createSurface(canvas);
  const ALL = PF.Games.slice().sort((a, b) => a.order - b.order);
  const RECORDS_KEY = 'lo-que-no-se-ve:records';
  // Toque en el reloj del HUD o en "pausa": pausa (sirve también con el ratón).
  const PAUSE_TAP = [
    { x: 560, y: 0, w: 215, h: 64 },
    { x: 1170, y: 0, w: 110, h: 32 },
  ];
  const TOUCH_DEFAULT = { stick: true, main: [{ pad: 'a', label: 'Acción' }, { pad: 'b', label: 'Salir' }] };

  const held = new Set();
  const mouse = { x: -1, y: -1, down: false, moved: false };
  const tp = Touch.create();
  let settings = Settings.load();
  let pressed = [];
  let clicks = [];
  let screen = 'menu';
  let sel = 0;
  let current = null; // juego elegido (pantalla de inicio, turno y reporte)
  let diffSel = 1;
  let choiceSel = {};
  let cfgFocus = 0;
  let info = null; // juego cuya ventana de instrucciones está abierta (menú o pantalla de inicio)
  let inst = null;
  let report = null;
  let isRecord = false;
  let records = loadRecords();
  let padPrev = null;
  let realPrev = null;
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
  const DIGIT = { Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Numpad1: '1', Numpad2: '2', Numpad3: '3', Numpad4: '4', Numpad5: '5' };
  const PREVENT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  function loadRecords() {
    try {
      const store = Settings.storage();
      return (store && JSON.parse(store.getItem(RECORDS_KEY))) || {};
    } catch {
      return {};
    }
  }

  function saveRecords() {
    try {
      const store = Settings.storage();
      if (store) store.setItem(RECORDS_KEY, JSON.stringify(records));
    } catch {
      // Sin almacenamiento: los récords duran lo que dure la pestaña.
    }
  }

  // Juegos activos en el menú (según la configuración).
  function menuGames() {
    return Settings.activeGames(ALL, settings);
  }

  function game() {
    if (current) return current;
    const list = menuGames();
    return list[Math.min(sel, list.length - 1)];
  }

  function lockedDiff() {
    return settings.difficulty ? D.DIFFICULTIES.findIndex((d) => d.id === settings.difficulty) : -1;
  }

  function diffId() {
    const lock = lockedDiff();
    return D.DIFFICULTIES[lock >= 0 ? lock : diffSel].id;
  }

  function openSetup(g) {
    current = g;
    setupFocus = -1;
    if (lockedDiff() >= 0) diffSel = lockedDiff();
    screen = 'setup';
  }

  // Opciones extra del juego (duración, modo, tiempo de respuesta…): valor elegido o el de por defecto.
  // choiceSel[id] = índice elegido por fila; setupFocus = fila activa (-1 = dificultad).
  let setupFocus = -1;

  function choiceIndex(row) {
    const c = S.choicesOf(game())[row];
    if (!c) return -1;
    const i = (choiceSel[game().id] || [])[row] ?? c.index;
    return Math.max(0, Math.min(c.values.length - 1, i));
  }

  function choiceValues() {
    return S.choicesOf(game()).map((c, r) => c.values[choiceIndex(r)].value);
  }

  function setChoice(row, i) {
    const id = game().id;
    choiceSel[id] = choiceSel[id] || [];
    choiceSel[id][row] = i;
  }

  function moveChoice(delta) {
    const row = Math.max(0, setupFocus);
    const c = S.choicesOf(game())[row];
    if (!c) return;
    setChoice(row, Math.max(0, Math.min(c.values.length - 1, choiceIndex(row) + delta)));
  }

  // ↑ ↓ recorre las dificultades y después las filas de opciones (si hay más de una).
  // Con la dificultad fijada, solo las filas de opciones.
  function moveFocus(delta) {
    const rows = S.choicesOf(game()).length;
    if (lockedDiff() >= 0) {
      if (rows > 1) setupFocus = Math.max(0, Math.min(rows - 1, Math.max(0, setupFocus) + delta));
      return;
    }
    const pos = setupFocus >= 0 ? 3 + setupFocus : diffSel;
    const max = rows > 1 ? 2 + rows : 2;
    const next = Math.max(0, Math.min(max, pos + delta));
    if (next <= 2) {
      diffSel = next;
      setupFocus = -1;
    } else setupFocus = next - 3;
  }

  function touchLayout() {
    Touch.setLayout(tp, game().touch || TOUCH_DEFAULT);
  }

  function startGame() {
    const values = choiceValues();
    const opts = {};
    S.choicesOf(game()).forEach((c, r) => (opts[c.key] = values[r]));
    current = game();
    inst = current.create(diffId(), opts);
    report = null;
    held.clear();
    pressed = [];
    clicks = [];
    touchLayout();
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
    current = null;
    setupFocus = -1;
    screen = 'menu';
  }

  function pause() {
    screen = 'paused';
    held.clear();
    Touch.setLayout(tp, null);
    if (Audio) Audio.setSiren(false);
  }

  function resume() {
    touchLayout();
    screen = 'play';
  }

  // Texto del botón "volver a la pantalla de inicio" del reporte.
  function reportAlt() {
    if (lockedDiff() < 0) return 'Cambiar dificultad';
    return S.choicesOf(game()).length ? 'Cambiar opciones' : null;
  }

  // Acciones de las pantallas fuera del turno; las comparten teclado, mando, ratón y toque.
  function shell(action, digit) {
    const dirs = ['up', 'down', 'left', 'right'];
    const list = menuGames();
    // Instrucciones abiertas: cualquier botón de aceptar, volver o △/Y las cierra.
    if (info) {
      if (['back', 'confirm', 'alt', 'start', 'config'].includes(action)) info = null;
      return;
    }
    if (screen === 'menu') {
      sel = Math.min(sel, list.length - 1);
      if (action === 'left') sel = (sel + list.length - 1) % list.length;
      else if (action === 'right') sel = (sel + 1) % list.length;
      else if (action === 'digit' && digit <= list.length) {
        sel = digit - 1;
        openSetup(list[sel]);
      } else if (action === 'confirm' || action === 'start') openSetup(list[sel]);
      else if (action === 'config' && Settings.editable()) openLogin();
      else if (action === 'alt') info = list[sel];
    } else if (screen === 'setup') {
      if (action === 'up') moveFocus(-1);
      else if (action === 'down') moveFocus(1);
      else if (action === 'left') moveChoice(-1);
      else if (action === 'right') moveChoice(1);
      else if (action === 'digit' && digit <= 3 && lockedDiff() < 0) {
        diffSel = digit - 1;
        setupFocus = -1;
        startGame();
      } else if (action === 'confirm' || action === 'start') startGame();
      else if (action === 'back') toMenu();
      else if (action === 'alt') info = game();
    } else if (screen === 'report') {
      if (action === 'confirm' || action === 'start') startGame();
      else if (action === 'alt' && reportAlt()) openSetup(game());
      else if (action === 'back') toMenu();
    } else if (screen === 'paused') {
      if (action === 'start') resume();
      else if (action === 'alt') startGame();
      else if (action === 'back') toMenu();
    } else if (screen === 'config') {
      configAction(action);
    } else if (screen === 'login') {
      if (action === 'back') closeLogin();
    }
    if (dirs.includes(action)) D.sfx('blip');
  }

  // ------------------------------------------------------- Configuración (con clave)

  function configAction(action) {
    const items = S.configItems(ALL);
    const games = ALL.length;
    const it = items[cfgFocus];
    if (action === 'up' || action === 'down') {
      const d = action === 'up' ? -1 : 1;
      const [lo, hi] = cfgFocus < games ? [0, games - 1] : [games, items.length - 1];
      cfgFocus = Math.max(lo, Math.min(hi, cfgFocus + d));
    } else if (action === 'left' && cfgFocus >= games) cfgFocus = Math.min(games - 1, cfgFocus - games);
    else if (action === 'right' && cfgFocus < games) cfgFocus = Math.min(items.length - 1, games + cfgFocus);
    else if (action === 'confirm' || action === 'start') activateConfig(it);
    else if (action === 'back') leaveConfig();
  }

  function activateConfig(it) {
    if (!it) return;
    if (it.kind === 'game') {
      if (!Settings.toggle(settings, it.id, ALL.map((g) => g.id))) D.sfx('oops');
      else D.sfx('blip');
    } else if (it.kind === 'diff') {
      settings.difficulty = it.value;
      D.sfx('blip');
    } else return leaveConfig();
    Settings.save(settings);
  }

  function leaveConfig() {
    Settings.save(settings);
    sel = 0;
    toMenu();
    D.sfx('enter');
  }

  // Ventana de la clave: un campo HTML para que aparezca el teclado en pantallas táctiles.
  // Sin <form>: en el marco aislado de SharePoint (sin allow-forms) no se puede enviar.
  const login = buildLogin();

  function buildLogin() {
    const wrap = document.createElement('div');
    wrap.id = 'login';
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="box" role="dialog" aria-label="Configuración">
        <h2>⚙ Configuración</h2>
        <p>Escribe la clave para cambiar los juegos activos y la dificultad general.</p>
        <input type="password" name="clave" placeholder="Clave" aria-label="Clave" autocapitalize="off" autocorrect="off" spellcheck="false" />
        <p class="err" aria-live="polite"></p>
        <div class="row">
          <button type="button" class="cancel">Cancelar</button>
          <button type="button" class="ok">Entrar</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('input');
    const err = wrap.querySelector('.err');
    input.setAttribute('autocomplete', 'off');
    function enter() {
      if (Settings.check(input.value)) {
        hide();
        cfgFocus = 0;
        screen = 'config';
        D.sfx('enter');
      } else {
        err.textContent = 'Clave incorrecta';
        input.value = '';
        input.focus();
        D.sfx('oops');
      }
    }
    wrap.querySelector('.ok').addEventListener('click', enter);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        enter();
      }
    });
    wrap.querySelector('.cancel').addEventListener('click', () => closeLogin());
    function hide() {
      wrap.hidden = true;
      input.blur();
      canvas.focus();
    }
    return {
      open() {
        err.textContent = '';
        input.value = '';
        wrap.hidden = false;
        setTimeout(() => input.focus(), 30);
      },
      hide,
    };
  }

  function openLogin() {
    screen = 'login';
    login.open();
  }

  function closeLogin() {
    login.hide();
    screen = 'menu';
  }

  // ----------------------------------------------------------- Teclado

  const KEY_SHELL = { Enter: 'confirm', Space: 'confirm', NumpadEnter: 'confirm', Escape: 'back', Backspace: 'back', KeyD: 'alt', KeyR: 'alt', KeyP: 'start' };

  addEventListener('keydown', (e) => {
    // Mientras se escribe la clave, el teclado es del campo de texto.
    if (screen === 'login') {
      if (e.code === 'Escape') closeLogin();
      return;
    }
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
      if (info && code === 'KeyI') return shell('back');
      if (screen === 'menu' && code === 'KeyI') return shell('alt');
      if (screen === 'setup' && code === 'KeyI') return shell('alt');
      if (screen === 'menu' && code === 'KeyC') return shell('config');
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

  function onResize() {
    D.resize(r);
    Touch.arrange(tp, innerWidth, innerHeight, { ox: r.ox, oy: r.oy, gw: D.VIEW.width * r.scale, gh: D.VIEW.height * r.scale });
  }
  addEventListener('resize', onResize);
  onResize();

  // ------------------------------------------------------- Ratón y toque

  function inside(p, rc) {
    return p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h;
  }

  const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  function toggleFullscreen() {
    const doc = document;
    const el = doc.documentElement;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
      else {
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        const p = req && req.call(el);
        // En móviles, además, se intenta fijar la pantalla en horizontal.
        const o = globalThis.screen && globalThis.screen.orientation;
        if (p && p.then) p.then(() => o && o.lock && o.lock('landscape').catch(() => {})).catch(() => {});
      }
    } catch {
      // Sin pantalla completa: se sigue jugando igual.
    }
  }

  // Un clic o un toque en el punto p (coordenadas del juego).
  function tapAt(p) {
    // Instrucciones abiertas: tocar en cualquier parte las cierra.
    if (info) {
      info = null;
      return;
    }
    if (screen === 'menu') {
      if (Settings.editable() && inside(p, S.gearButton())) return openLogin();
      if (canFullscreen && inside(p, S.fullscreenButton())) return toggleFullscreen();
      const list = menuGames();
      const cards = S.menuCards(list.length);
      const ii = cards.findIndex((c) => inside(p, S.cardInfoButton(c)));
      if (ii >= 0) {
        sel = ii;
        info = list[ii];
        return;
      }
      const i = cards.findIndex((c) => inside(p, c));
      if (i >= 0) {
        sel = i;
        openSetup(list[i]);
      }
    } else if (screen === 'setup') {
      if (inside(p, S.backButton())) return shell('back');
      if (inside(p, S.infoButton())) {
        info = game();
        return;
      }
      const choices = S.choicesOf(game());
      const i = S.diffCards(choices.length).findIndex((c) => inside(p, c));
      let hit = null;
      choices.forEach((c, r) => {
        const chip = S.choiceChips(c, r, choices.length).findIndex((ch) => inside(p, ch));
        if (chip >= 0) hit = [r, chip];
      });
      if (i >= 0) {
        setupFocus = -1;
        if (i === diffSel) startGame();
        else if (lockedDiff() < 0) diffSel = i;
      } else if (hit) {
        setChoice(hit[0], hit[1]);
        if (choices.length > 1) setupFocus = hit[0];
      } else if (inside(p, S.playButton())) startGame();
    } else if (screen === 'play') {
      if (PAUSE_TAP.some((rc) => inside(p, rc))) return pause();
      clicks.push(p);
    } else if (screen === 'paused') {
      const b = S.pauseButtons().find((x) => inside(p, x));
      if (b) shell(b.action);
    } else if (screen === 'report') {
      const b = S.reportButtons(reportAlt()).find((x) => inside(p, x));
      if (b) shell(b.action);
    } else if (screen === 'config') {
      const items = S.configItems(ALL);
      const i = items.findIndex((x) => inside(p, x));
      if (i >= 0) {
        cfgFocus = i;
        activateConfig(items[i]);
      }
    }
  }

  function setMouse(p) {
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.moved = true;
  }

  const isTouch = (e) => e.pointerType === 'touch' || e.pointerType === 'pen';

  canvas.addEventListener('pointerdown', (e) => {
    if (Audio) Audio.init();
    canvas.focus();
    const p = D.toLogical(r, e.clientX, e.clientY);
    if (isTouch(e)) {
      e.preventDefault();
      IS.device = 'touch';
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Algunos navegadores no capturan punteros sintéticos.
      }
      if (screen !== 'play') return tapAt(p);
      const res = Touch.down(tp, e.pointerId, e.clientX, e.clientY, e.timeStamp);
      if (res.kind === 'click') {
        setMouse(p);
        mouse.down = true;
        tapAt(p);
      }
      return;
    }
    IS.device = 'keyboard';
    setMouse(p);
    mouse.down = true;
    tapAt(p);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = D.toLogical(r, e.clientX, e.clientY);
    if (isTouch(e)) {
      e.preventDefault();
      const res = Touch.move(tp, e.pointerId, e.clientX, e.clientY);
      if (res && res.kind === 'click') setMouse(p);
      return;
    }
    if (Math.hypot(p.x - mouse.x, p.y - mouse.y) > 4) IS.device = 'keyboard';
    setMouse(p);
    if (screen === 'menu') {
      const i = S.menuCards(menuGames().length).findIndex((c) => inside(p, c));
      if (i >= 0 && i !== sel) sel = i;
    }
  });

  function pointerEnd(e) {
    if (isTouch(e)) {
      const res = Touch.up(tp, e.pointerId, e.clientX, e.clientY, e.timeStamp);
      if (res && res.kind === 'tap') {
        const p = D.toLogical(r, res.x, res.y);
        setMouse(p);
        tapAt(p);
      }
      if (![...tp.pointers.values()].some((x) => x.kind === 'click')) mouse.down = false;
      return;
    }
    mouse.down = false;
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', (e) => {
    Touch.cancel(tp, e.pointerId);
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ------------------------------------------------------------- Mando

  // Combina el mando físico y el virtual (táctil) en un solo estado.
  function merge(a, b) {
    if (!a) return b;
    if (!b) return a;
    const heldAll = { ...a.held };
    for (const [k, v] of Object.entries(b.held)) heldAll[k] = heldAll[k] || v;
    return { ...a, type: IS.device === 'touch' ? 'touch' : a.type, held: heldAll, lx: a.lx || b.lx, ly: a.ly || b.ly };
  }

  function pollPad() {
    // En marcos aislados (SharePoint) el navegador puede negar el acceso a los mandos.
    let list = [];
    try {
      list = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch {
      list = [];
    }
    const gp = Array.from(list || []).find((p) => p && p.connected);
    let real = null;
    if (gp) {
      real = Pad.snapshot(gp);
      IS.padType = real.type;
      if (Pad.edges(realPrev, real).length || Pad.active(real)) {
        IS.device = real.type;
        if (Audio) Audio.init();
      }
    } else {
      IS.padType = null;
      if (IS.device === 'ps' || IS.device === 'xbox') IS.device = 'keyboard';
    }
    realPrev = real;
    const virt = screen === 'play' && Touch.busy(tp) ? Touch.snapshot(tp) : null;
    const cur = merge(real, virt);
    if (!cur) {
      padPrev = null;
      return null;
    }
    const fresh = Pad.edges(padPrev, cur);
    padPrev = cur;
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

  // ------------------------------------------------------------- Dibujo táctil

  function drawTouch(ctx) {
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    Touch.draw(ctx, tp, { font: (s) => `700 ${s}px Rajdhani, sans-serif` });
    // Botón de pausa junto al reloj del HUD (tocar el reloj pausa).
    ctx.setTransform(r.dpr * r.scale, 0, 0, r.dpr * r.scale, r.dpr * r.ox, r.dpr * r.oy);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#2a1f18';
    ctx.strokeStyle = '#f4efe6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(752, 32, 19, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4efe6';
    ctx.fillRect(744, 23, 5, 18);
    ctx.fillRect(755, 23, 5, 18);
    ctx.restore();
  }

  // En vertical no cabe el juego: se pide girar el dispositivo (y se pausa).
  function portrait() {
    return IS.device === 'touch' && innerHeight > innerWidth * 1.05;
  }

  function drawRotate(ctx) {
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    ctx.fillStyle = 'rgba(10,6,5,0.94)';
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = '#ff8a1f';
    ctx.textAlign = 'center';
    ctx.font = '700 64px Rajdhani, sans-serif';
    ctx.fillText('⟳', innerWidth / 2, innerHeight / 2 - 30);
    ctx.fillStyle = '#f4efe6';
    ctx.font = '700 24px Rajdhani, sans-serif';
    ctx.fillText('Gira el dispositivo', innerWidth / 2, innerHeight / 2 + 20);
    ctx.fillStyle = '#b8a48c';
    ctx.font = '600 17px Rajdhani, sans-serif';
    ctx.fillText('Los juegos se ven en horizontal', innerWidth / 2, innerHeight / 2 + 48);
  }

  // ------------------------------------------------------------- Bucle

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    r.t += dt;
    const ctx = r.ctx;
    const turned = portrait();
    if (turned && screen === 'play') pause();
    // Glifos de los juegos: con el dedo, muestran los botones virtuales del juego en curso.
    // En la pantalla de inicio, los controles muestran los botones que tendrá el juego.
    const layout = screen === 'play' ? tp.layout : info ? info.touch || TOUCH_DEFAULT : screen === 'setup' ? game().touch || TOUCH_DEFAULT : null;
    IS.touchLabels = Touch.layoutLabels(layout);
    IS.touchStick = !!(layout && layout.stick);
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
      if (IS.device === 'touch') drawTouch(ctx);
      if (inst.over) finish();
    } else if (screen === 'paused') {
      inst.draw(r);
      S.drawPause(ctx);
    } else {
      D.begin(r);
      const fullscreen = canFullscreen && IS.device !== 'ps' && IS.device !== 'xbox';
      if (screen === 'menu' || screen === 'login') S.drawMenu(ctx, r.t, menuGames(), Math.min(sel, menuGames().length - 1), records, { fullscreen, settings: Settings.editable() });
      else if (screen === 'setup') S.drawSetup(ctx, r.t, game(), lockedDiff() >= 0 ? lockedDiff() : diffSel, records, choiceValues(), setupFocus, { locked: lockedDiff() >= 0 });
      else if (screen === 'report') S.drawReport(ctx, r.t, game(), diffId(), report, (records[game().id] || {})[diffId()], isRecord, { alt: reportAlt() });
      else if (screen === 'config') S.drawConfig(ctx, r.t, ALL, settings, cfgFocus, { persistent: Settings.persistent() });
      if (info && (screen === 'menu' || screen === 'setup')) S.drawInstructions(ctx, r.t, info);
      else info = null;
    }
    if (turned) drawRotate(ctx);
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
    get info() {
      return info && info.id;
    },
    get settings() {
      return settings;
    },
    get menu() {
      return menuGames().map((g) => g.id);
    },
    touch: tp,
    games: ALL,
    // value: valor de la primera opción (duración en Control de UP, modo en Supervisor de Turno)
    // u objeto { clave: valor } para varias (p. ej. { mode: 'kpi', answerTime: 30 }).
    play(id, diff = 'normal', value = null) {
      current = ALL.find((g) => g.id === id);
      diffSel = D.DIFFICULTIES.findIndex((d) => d.id === diff);
      const choices = S.choicesOf(game());
      const wanted = value != null && typeof value === 'object' ? value : value != null && choices[0] ? { [choices[0].key]: value } : {};
      choices.forEach((c, r) => {
        if (c.key in wanted) setChoice(r, c.values.findIndex((v) => v.value === wanted[c.key]));
      });
      startGame();
    },
  };

  // El canvas no pide las fuentes por sí solo: se cargan antes de dibujar.
  if (document.fonts) {
    for (const f of ['500 16px Rajdhani', '600 16px Rajdhani', '700 16px Rajdhani', '16px "Share Tech Mono"']) document.fonts.load(f).catch(() => {});
  }

  requestAnimationFrame(frame);
})();
