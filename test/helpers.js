// Carga los módulos de la colección (scripts clásicos que cuelgan de globalThis.PF) en Node.
// Solo la lógica: las funciones de dibujo no se llaman en las pruebas.
require('../src/core/pad.js');
require('../src/core/draw.js');
require('../src/config.js');
require('../src/minigames.js');
require('../src/sim.js');
require('../src/render.js');
require('../src/core/bubble.js');
require('../src/core/world.js');
require('../src/content/manual.js');
require('../src/games/pasteurizer.js');
require('../src/games/cip.js');
require('../src/games/hunter.js');
require('../src/games/stop.js');
require('../src/games/pu.js');
require('../src/content/kpi.js');
require('../src/games/admin.js');

const PF = globalThis.PF;
const C = PF.CONFIG;
const Sim = PF.Sim;

function input(over = {}) {
  return Object.assign({ moveX: 0, moveY: 0, adjust: 0, space: false, pressed: [] }, over);
}

// Avanza la partida `seconds` con la misma entrada en cada frame.
function run(g, seconds, inp = input(), dt = 1 / 60) {
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames && !g.over; i++) Sim.step(g, dt, inp);
}

// Operador automático: "camina" (con un retardo de viaje) a la alarma más urgente
// y la resuelve como lo haría un jugador competente. Sirve para comprobar que el
// turno es jugable y para medir el balance.
function makeBot({ travelTime = 1.4, reaction = 0.25 } = {}) {
  let target = null;
  let arriveAt = 0;
  let wait = 0;
  return function botInput(g, dt) {
    const p = g.player;
    const pressed = [];
    const out = input({ pressed });
    if (wait > 0) {
      wait -= dt;
      return out;
    }
    const list = Sim.alarms(g).filter((a) => C.MAP.stations[a.station] && C.MAP.stations[a.station].interactive);
    const want = list.length ? list[0].station : null;
    if (p.operating && (!want || (want !== p.operating && Sim.stationEvents(g, p.operating).length === 0 && !needsTrim(g, p.operating)))) {
      pressed.push('cancel');
      target = null;
      return out;
    }
    if (!p.operating) {
      if (!want) return out;
      if (target !== want) {
        target = want;
        arriveAt = g.time + travelTime;
        return out;
      }
      if (g.time < arriveAt) return out;
      if (Sim.isBlocked(g, want)) return out;
      const st = C.MAP.stations[want];
      p.x = st.spot.x; // teletransporte tras el tiempo de viaje simulado
      p.y = st.spot.y;
      pressed.push('interact');
      wait = reaction;
      return out;
    }
    // Operando: resolver mini-juego y recortar la variable.
    const id = p.operating;
    const key = C.MAP.stations[id].variable;
    const cfg = C.VARS[key];
    const rep = Sim.activeRepair(g, id);
    if (rep) {
      const mg = rep.mg;
      if (mg.type === 'hold') out.space = true;
      if (mg.type === 'pressure') out.space = mg.p < 0.67;
      if (mg.type === 'arrows' && Math.random() < dt * 6) pressed.push(mg.seq[mg.idx]);
      if (mg.type === 'timing' && Math.abs(mg.pos - mg.zone.c) < mg.zone.w / 4) pressed.push('space');
      if (mg.type === 'simon' && mg.phase === 'input' && Math.random() < dt * 5) pressed.push(String(mg.seq[mg.idx] + 1));
    }
    const diff = cfg.ideal - g.vars[key].value;
    if (Math.abs(diff) > cfg.band * 0.3) out.adjust = Math.sign(diff);
    return out;
  };
}

function needsTrim(g, stationId) {
  const key = C.MAP.stations[stationId].variable;
  const cfg = C.VARS[key];
  return Math.abs(g.vars[key].value - cfg.ideal) > cfg.band * 0.6;
}

function playBot(seed, opts) {
  const g = Sim.createGame({ seed });
  const bot = makeBot(opts);
  const dt = 1 / 60;
  while (!g.over) Sim.step(g, dt, bot(g, dt));
  return g;
}

module.exports = { PF, C, Sim, input, run, makeBot, playBot };
