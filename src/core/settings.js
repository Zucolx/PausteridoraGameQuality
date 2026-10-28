// Configuración de la colección (protegida con clave): qué juegos aparecen en el menú
// y si la dificultad queda fijada para todos. Se guarda en este navegador/dispositivo.
//
// SharePoint muestra el HTML en un marco aislado (sandbox sin allow-same-origin): ahí el
// navegador lanza SecurityError con solo leer `localStorage`. Por eso el almacenamiento se
// pide con cuidado y, si no hay, todo vive en memoria mientras la página esté abierta.
// La versión "sin ajustes" (pnpm build) usa siempre los valores por defecto y no ofrece
// la pantalla de configuración (PF.BUILD.ajustes === false).
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  const KEY = 'lo-que-no-se-ve:ajustes';
  // Clave de acceso. Ojo: el juego funciona sin conexión y esto está en el propio HTML,
  // así que evita cambios casuales, no es una protección fuerte.
  const PASSWORD = 'Odiseo';
  const DEFAULTS = { disabled: ['pasteurizer', 'stop'], difficulty: null };
  const DIFFS = ['facil', 'normal', 'dificil'];

  // ¿Esta versión ofrece la pantalla de configuración?
  function editable() {
    return !(PF.BUILD && PF.BUILD.ajustes === false);
  }

  // localStorage si el navegador lo permite; si no (marco aislado, modo privado…), null.
  function storage() {
    try {
      const ls = globalThis.localStorage;
      if (!ls) return null;
      ls.getItem(KEY);
      return ls;
    } catch {
      return null;
    }
  }

  function persistent() {
    return !!storage();
  }

  function check(pw) {
    return String(pw || '').trim().toLowerCase() === PASSWORD.toLowerCase();
  }

  function clean(cfg) {
    const c = cfg && typeof cfg === 'object' ? cfg : {};
    return {
      disabled: Array.isArray(c.disabled) ? c.disabled.filter((x) => typeof x === 'string') : DEFAULTS.disabled.slice(),
      difficulty: DIFFS.includes(c.difficulty) ? c.difficulty : null,
    };
  }

  function load(store = storage()) {
    if (!editable()) return clean(DEFAULTS);
    try {
      const raw = store && store.getItem(KEY);
      return clean(raw ? JSON.parse(raw) : DEFAULTS);
    } catch {
      return clean(DEFAULTS);
    }
  }

  function save(cfg, store = storage()) {
    try {
      if (!store) return false;
      store.setItem(KEY, JSON.stringify(clean(cfg)));
      return true;
    } catch {
      return false; // sin almacenamiento: vale mientras dure la pestaña
    }
  }

  function enabled(cfg, id) {
    return !cfg.disabled.includes(id);
  }

  // Juegos del menú. Si todo estuviera desactivado, se muestran todos.
  function activeGames(games, cfg) {
    const list = games.filter((g) => enabled(cfg, g.id));
    return list.length ? list : games.slice();
  }

  // Activa o desactiva un juego; siempre queda al menos uno activo.
  function toggle(cfg, id, allIds) {
    if (enabled(cfg, id)) {
      const left = allIds.filter((g) => g !== id && enabled(cfg, g));
      if (!left.length) return false;
      cfg.disabled = cfg.disabled.concat(id);
    } else cfg.disabled = cfg.disabled.filter((g) => g !== id);
    return true;
  }

  PF.Settings = { KEY, PASSWORD, DEFAULTS, DIFFS, editable, storage, persistent, check, clean, load, save, enabled, activeGames, toggle };
})();
