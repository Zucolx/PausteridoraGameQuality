// Movimiento cenital con colisiones y estaciones, compartido por los juegos de mapa.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  const RADIUS = 16;

  function clamp(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }

  function make({ bounds = PF.Draw.MAP_BOUNDS, solids = [], stations = {}, start, speed = 260, interact = 70 }) {
    return { bounds, solids, stations, start, speed, interact };
  }

  function newPlayer(world) {
    return { x: world.start.x, y: world.start.y, facing: 1, moving: false, walkT: 0 };
  }

  function collides(world, x, y) {
    const b = world.bounds;
    if (x - RADIUS < b.x || x + RADIUS > b.x + b.w || y - RADIUS < b.y || y + RADIUS > b.y + b.h) return true;
    for (const s of world.solids) {
      const cx = clamp(x, s.x, s.x + s.w);
      const cy = clamp(y, s.y, s.y + s.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 < RADIUS * RADIUS) return true;
    }
    return false;
  }

  function move(world, p, input, dt, speedMul = 1) {
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (!len) {
      p.moving = false;
      return;
    }
    mx /= len;
    my /= len;
    const step = world.speed * speedMul * dt;
    const nx = p.x + mx * step;
    if (!collides(world, nx, p.y)) p.x = nx;
    const ny = p.y + my * step;
    if (!collides(world, p.x, ny)) p.y = ny;
    if (mx) p.facing = Math.sign(mx);
    p.moving = true;
    p.walkT += dt;
  }

  // Estación interactiva más cercana dentro del radio de interacción.
  function nearest(world, p, filter = null) {
    let best = null;
    let bestD = world.interact;
    for (const st of Object.values(world.stations)) {
      if (!st.spot || (filter && !filter(st))) continue;
      const d = Math.hypot(p.x - st.spot.x, p.y - st.spot.y);
      if (d <= bestD) {
        best = st;
        bestD = d;
      }
    }
    return best;
  }

  function teleport(world, p, stationId) {
    const s = world.stations[stationId].spot;
    p.x = s.x;
    p.y = s.y;
  }

  // Todas las piezas sólidas: obstáculos más carcasas de estaciones.
  function solidsOf(obstacles, stations) {
    return obstacles.concat(Object.values(stations).map((s) => s.rect));
  }

  PF.World = { make, newPlayer, collides, move, nearest, teleport, solidsOf, RADIUS };
})();
