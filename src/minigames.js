// Mini-juegos de reparación. Lógica pura (sin DOM): create() devuelve el estado
// y update() lo avanza con la entrada del frame. update() devuelve true al completarse.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const C = PF.CONFIG;

  const DIRS = ['up', 'right', 'down', 'left'];

  function randInt(rng, n) {
    return Math.floor(rng() * n);
  }

  function randomSeq(rng, length, symbols) {
    const seq = [];
    for (let i = 0; i < length; i++) {
      let s = randInt(rng, symbols);
      // Evita tres símbolos iguales seguidos: es legible pero aburrido.
      if (i >= 2 && seq[i - 1] === s && seq[i - 2] === s) s = (s + 1) % symbols;
      seq.push(s);
    }
    return seq;
  }

  const MINIGAMES = {
    // Golpe de vapor: mantener ESPACIO para abrir el enfriamiento de emergencia.
    hold: {
      create() {
        return { type: 'hold', progress: 0, need: C.EVENT_PARAMS.steamHit.need, active: false };
      },
      update(mg, dt, input) {
        mg.active = !!input.space;
        if (mg.active) mg.progress += dt;
        return mg.progress >= mg.need;
      },
      ratio(mg) {
        return Math.min(1, mg.progress / mg.need);
      },
    },

    // Válvula trabada: secuencia de flechas. Un error genera una secuencia nueva.
    arrows: {
      create(rng) {
        const length = C.EVENT_PARAMS.stuckValve.length;
        return { type: 'arrows', seq: randomSeq(rng, length, 4).map((i) => DIRS[i]), idx: 0, flash: 0 };
      },
      update(mg, dt, input, rng, emit) {
        mg.flash = Math.max(0, mg.flash - dt);
        for (const key of input.pressed) {
          if (!DIRS.includes(key)) continue;
          if (key === mg.seq[mg.idx]) {
            mg.idx++;
            emit('blip');
            if (mg.idx >= mg.seq.length) return true;
          } else {
            mg.seq = randomSeq(rng, mg.seq.length, 4).map((i) => DIRS[i]);
            mg.idx = 0;
            mg.flash = 0.35;
            emit('error');
          }
        }
        return false;
      },
      ratio(mg) {
        return mg.idx / mg.seq.length;
      },
    },

    // Bomba con aire: la presión cae sola; ESPACIO la sube. Acumular tiempo en verde.
    pressure: {
      create() {
        return { type: 'pressure', p: 0.25, inZone: 0, need: C.EVENT_PARAMS.airPump.need, zone: [0.55, 0.8], turb: 0, turbT: 0 };
      },
      update(mg, dt, input, rng) {
        mg.turbT -= dt;
        if (mg.turbT <= 0) {
          mg.turbT = 0.35;
          mg.turb = (rng() - 0.5) * 1.1;
        }
        mg.p += ((input.space ? 1.5 : -1.0) + mg.turb) * dt;
        mg.p = Math.max(0, Math.min(1, mg.p));
        if (mg.p >= mg.zone[0] && mg.p <= mg.zone[1]) mg.inZone += dt;
        return mg.inZone >= mg.need;
      },
      ratio(mg) {
        return Math.min(1, mg.inZone / mg.need);
      },
    },

    // Espuma: detener una aguja oscilante dentro de la zona objetivo.
    timing: {
      create(rng) {
        const mg = { type: 'timing', pos: 0, dir: 1, speed: 1.15, hits: 0, need: C.EVENT_PARAMS.foam.hits, cooldown: 0, flash: 0, good: 0, zone: null };
        mg.zone = MINIGAMES.timing.newZone(rng, mg.pos);
        return mg;
      },
      newZone(rng, pos) {
        let c;
        do {
          c = 0.12 + rng() * 0.76;
        } while (Math.abs(c - pos) < 0.25);
        return { c, w: 0.16 };
      },
      update(mg, dt, input, rng, emit) {
        mg.cooldown = Math.max(0, mg.cooldown - dt);
        mg.flash = Math.max(0, mg.flash - dt);
        mg.good = Math.max(0, mg.good - dt);
        mg.pos += mg.dir * mg.speed * dt;
        if (mg.pos > 1) {
          mg.pos = 2 - mg.pos;
          mg.dir = -1;
        } else if (mg.pos < 0) {
          mg.pos = -mg.pos;
          mg.dir = 1;
        }
        if (input.pressed.includes('space') && mg.cooldown <= 0) {
          if (Math.abs(mg.pos - mg.zone.c) <= mg.zone.w / 2) {
            mg.hits++;
            mg.good = 0.25;
            emit('blip');
            if (mg.hits >= mg.need) return true;
            mg.zone = MINIGAMES.timing.newZone(rng, mg.pos);
            mg.speed += 0.12;
          } else {
            mg.cooldown = 0.35;
            mg.flash = 0.35;
            emit('error');
          }
        }
        return false;
      },
      ratio(mg) {
        return mg.hits / mg.need;
      },
    },

    // Sensor loco: memorizar y repetir un patrón de 4 colores (teclas 1-4).
    simon: {
      STEP: 0.5,
      ON: 0.36,
      create(rng) {
        const length = C.EVENT_PARAMS.crazySensor.length;
        return { type: 'simon', seq: randomSeq(rng, length, 4), idx: 0, phase: 'show', t: -0.25, lit: -1, press: -1, pressT: 0, flash: 0 };
      },
      update(mg, dt, input, rng, emit) {
        const S = MINIGAMES.simon;
        mg.pressT = Math.max(0, mg.pressT - dt);
        mg.flash = Math.max(0, mg.flash - dt);
        if (mg.phase === 'show') {
          mg.t += dt;
          const step = Math.floor(mg.t / S.STEP);
          const within = mg.t - step * S.STEP;
          mg.lit = mg.t >= 0 && step < mg.seq.length && within < S.ON ? mg.seq[step] : -1;
          if (mg.t >= mg.seq.length * S.STEP) {
            mg.phase = 'input';
            mg.lit = -1;
          }
          return false;
        }
        for (const key of input.pressed) {
          const d = ['1', '2', '3', '4'].indexOf(key);
          if (d < 0) continue;
          mg.press = d;
          mg.pressT = 0.18;
          if (d === mg.seq[mg.idx]) {
            mg.idx++;
            emit('blip');
            if (mg.idx >= mg.seq.length) return true;
          } else {
            mg.seq = randomSeq(rng, mg.seq.length, 4);
            mg.idx = 0;
            mg.phase = 'show';
            mg.t = -0.4;
            mg.flash = 0.35;
            emit('error');
            return false;
          }
        }
        return false;
      },
      ratio(mg) {
        return mg.idx / mg.seq.length;
      },
    },
  };

  PF.Minigames = MINIGAMES;
})();
