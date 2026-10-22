// Mandos (PlayStation y Xbox) con el "standard mapping" de la Gamepad API.
// Lógica pura: lee un objeto Gamepad, detecta flancos y traduce a acciones.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  // Índices del mapeo estándar.
  const BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'select', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right'];
  const DEAD = 0.25;
  const TILT = 0.6;

  const LABELS = {
    ps: { a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', select: 'SHARE', start: 'OPTIONS', ls: 'L3', rs: 'R3' },
    xbox: { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', select: 'VIEW', start: 'MENU', ls: 'LS', rs: 'RS' },
  };

  // Xbox primero (su id también dice "Wireless Controller"); PlayStation por id de Sony
  // (054c) o por nombre; cualquier otro mando se muestra con los botones de Xbox (XInput).
  function detect(id) {
    if (/xbox|xinput|045e|microsoft/i.test(id || '')) return 'xbox';
    return /054c|playstation|dualsense|dualshock|wireless controller|ps[345]/i.test(id || '') ? 'ps' : 'xbox';
  }

  function axis(v) {
    return Math.abs(v || 0) > DEAD ? v : 0;
  }

  function snapshot(gp) {
    const held = {};
    BUTTONS.forEach((name, i) => {
      const b = gp.buttons[i];
      held[name] = !!b && (b.pressed || b.value > 0.5);
    });
    const ax = gp.axes || [];
    const lx = axis(ax[0]);
    const ly = axis(ax[1]);
    // El stick izquierdo también cuenta como cruceta "virtual".
    held.lsUp = ly < -TILT;
    held.lsDown = ly > TILT;
    held.lsLeft = lx < -TILT;
    held.lsRight = lx > TILT;
    return { id: gp.id, type: detect(gp.id), held, lx, ly, rx: axis(ax[2]), ry: axis(ax[3]) };
  }

  // Botones que se acaban de pulsar en este frame.
  function edges(prev, cur) {
    const out = [];
    for (const name of Object.keys(cur.held)) if (cur.held[name] && !(prev && prev.held[name])) out.push(name);
    return out;
  }

  function active(cur) {
    return Object.values(cur.held).some(Boolean) || cur.lx || cur.ly || cur.rx || cur.ry;
  }

  // Traducción a las acciones de teclado que entienden los juegos de mapa.
  const TO_KEYS = {
    a: ['space', 'confirm'],
    x: ['interact'],
    b: ['cancel'],
    y: ['tab'],
    up: ['up'],
    down: ['down'],
    left: ['left'],
    right: ['right'],
    lsUp: ['up'],
    lsDown: ['down'],
    lsLeft: ['left'],
    lsRight: ['right'],
    lb: ['1'],
    rb: ['2'],
    lt: ['3'],
    rt: ['4'],
  };

  function toKeys(pressed) {
    const out = [];
    for (const p of pressed) if (TO_KEYS[p]) out.push(...TO_KEYS[p]);
    return out;
  }

  // Acciones de menú: navegar, aceptar, volver, alternativa (Y/△) y pausa.
  const TO_MENU = { up: 'up', lsUp: 'up', down: 'down', lsDown: 'down', left: 'left', lsLeft: 'left', right: 'right', lsRight: 'right', a: 'confirm', b: 'back', y: 'alt', start: 'start' };

  function toMenu(pressed) {
    return pressed.map((p) => TO_MENU[p]).filter(Boolean);
  }

  function label(type, name) {
    return (LABELS[type] || LABELS.xbox)[name] || name.toUpperCase();
  }

  PF.Pad = { BUTTONS, detect, snapshot, edges, active, toKeys, toMenu, label };
})();
