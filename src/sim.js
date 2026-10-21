// Simulación del turno: variables de proceso, eventos/alarmas, jugador y contabilidad
// de hectolitros. Lógica pura y determinista con semilla: no toca el DOM, así que
// se puede probar en Node (ver test/).
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});
  const C = PF.CONFIG;
  const MG = PF.Minigames;
  const VK = C.VAR_KEYS;
  const P = C.EVENT_PARAMS;

  const EMPTY_INPUT = { moveX: 0, moveY: 0, adjust: 0, space: false, pressed: [] };
  const SOLIDS = C.MAP.obstacles.concat(Object.values(C.MAP.stations).map((s) => s.rect));
  // Ritmo típico de deriva por variable; el sensor loco usa una fracción como deriva real oculta.
  const TYPICAL_DRIFT = {
    temp: mid(P.thermalDrift.rate),
    flow: mid(P.flowDrift.rate),
    hold: mid(P.slowBelt.rate),
  };

  function mid(r) {
    return (r[0] + r[1]) / 2;
  }

  function clamp(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }

  function between(rng, r) {
    return r[0] + rng() * (r[1] - r[0]);
  }

  function sign(rng) {
    return rng() < 0.5 ? -1 : 1;
  }

  // mulberry32: RNG pequeño y reproducible para pruebas y repeticiones.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fmt(x, decimals) {
    return x.toFixed(decimals).replace('.', ',');
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ------------------------------------------------------------------ Estado

  function createGame(opts = {}) {
    const rng = opts.rng || (opts.seed != null ? makeRng(opts.seed) : Math.random);
    const vars = {};
    for (const k of VK) vars[k] = { value: C.VARS[k].ideal, outTicks: 0, dir: null, discarding: false, cause: null };
    const stations = {};
    for (const id in C.MAP.stations) stations[id] = { blockedUntil: -1 };
    return {
      rng,
      scheduler: opts.scheduler !== false,
      diff: C.DIFFICULTY[opts.difficulty] || C.DIFFICULTY.normal,
      ph: null,
      time: 0,
      ticks: 0,
      totalTicks: Math.round(C.DURATION / C.TICK),
      tickAcc: 0,
      over: false,
      endReason: null,
      vars,
      stations,
      player: { x: C.MAP.start.x, y: C.MAP.start.y, facing: 1, moving: false, walkT: 0, operating: null, adjust: 0 },
      activeEvents: [],
      nextId: 1,
      phaseIndex: -1,
      phaseSpawns: 0,
      phaseRepairs: 0,
      spawnTimer: 0,
      forcedType: null,
      lowFlowTicks: 0,
      lineStopped: false,
      lineStopTicks: 0,
      redTicks: 0,
      discardingNow: false,
      second: { ticks: 0, approved: 0, discarded: 0 },
      stats: { processed: 0, approved: 0, discarded: 0, byCause: {}, episodes: {}, spawned: 0, resolved: 0, lineStops: 0 },
      signals: [],
    };
  }

  function emit(g, type, data) {
    g.signals.push(Object.assign({ type, time: g.time }, data));
  }

  // ------------------------------------------------------------ Consultas

  function effective(g, key) {
    let x = g.vars[key].value;
    if (key !== 'flow') return x;
    for (const e of g.activeEvents) {
      if (e.type === 'stuckValve') return e.stuckValue;
      if (e.type === 'airPump') x += e.amp * Math.sin(e.phase);
      if (e.type === 'foam') x += e.flowOffset;
    }
    return x;
  }

  // Valor que muestran los instrumentos (puede mentir con un sensor loco).
  function display(g, key) {
    const real = effective(g, key);
    const sensor = g.activeEvents.find((e) => e.type === 'crazySensor' && e.vars[0] === key);
    if (!sensor) return { value: real, lying: false };
    return { value: real + sensor.fake + sensor.jitter, lying: true };
  }

  function varStatus(g, key) {
    const cfg = C.VARS[key];
    const x = effective(g, key);
    if (x < cfg.min - 1e-9) return 'low';
    if (x > cfg.max + 1e-9) return 'high';
    const half = (cfg.max - cfg.min) / 2;
    return Math.abs(x - cfg.ideal) > C.WARN_FRACTION * half ? 'warn' : 'ok';
  }

  function isBlocked(g, stationId) {
    const s = g.stations[stationId];
    return !!s && s.blockedUntil > g.time;
  }

  function isStuck(g, key) {
    return key === 'flow' && g.activeEvents.some((e) => e.type === 'stuckValve');
  }

  function varBusy(g, key) {
    return g.activeEvents.some((e) => e.vars.includes(key));
  }

  function stationEvents(g, stationId) {
    return g.activeEvents.filter((e) => e.station === stationId);
  }

  function activeRepair(g, stationId) {
    return g.activeEvents.find((e) => e.station === stationId && e.kind === 'repair') || null;
  }

  function nearestStation(g) {
    const p = g.player;
    let best = null;
    let bestD = C.INTERACT_RADIUS;
    for (const st of Object.values(C.MAP.stations)) {
      if (!st.interactive) continue;
      const d = Math.hypot(p.x - st.spot.x, p.y - st.spot.y);
      if (d <= bestD) {
        best = st.id;
        bestD = d;
      }
    }
    return best;
  }

  function phase(g) {
    return C.PHASES[Math.max(0, g.phaseIndex)];
  }

  function timeLeft(g) {
    return Math.max(0, C.DURATION - g.time);
  }

  function causeLabel(cause) {
    if (cause === 'lineStop') return 'paro de línea';
    const [key, dir] = cause.split('_');
    return C.VARS[key][dir].cause;
  }

  // Lista de alarmas ordenada por urgencia, para el panel y el HUD.
  function alarms(g) {
    const list = [];
    const covered = new Set();
    for (const e of g.activeEvents) {
      e.vars.forEach((k) => covered.add(k));
      const red = e.vars.some((k) => g.vars[k].discarding);
      list.push({ id: 'e' + e.id, title: e.name, station: e.station, hint: e.hint, severity: red ? 'red' : 'warn', event: e, vars: e.vars, born: e.born });
    }
    for (const k of VK) {
      if (covered.has(k)) continue;
      const status = varStatus(g, k);
      if (status === 'ok') continue;
      const cfg = C.VARS[k];
      const dir = status === 'warn' ? (effective(g, k) < cfg.ideal ? 'low' : 'high') : status;
      list.push({
        id: 'v' + k,
        title: capitalize(cfg[dir].cause),
        station: cfg.station,
        hint: status === 'warn' ? 'Cerca del límite: reajusta con A/D' : 'Fuera de rango: reajusta con A/D',
        severity: g.vars[k].discarding ? 'red' : 'warn',
        event: null,
        vars: [k],
        born: Infinity,
      });
    }
    if (g.lineStopped) {
      list.push({ id: 'line', title: 'Paro de línea', station: 'valve', hint: 'Válvula al mínimo: la línea rearranca sola', severity: 'red', event: null, vars: ['flow'], born: -1 });
    } else if (g.lowFlowTicks > 0) {
      list.push({ id: 'line', title: 'Válvula al mínimo', station: 'valve', hint: '¡Abre la válvula o se para la línea!', severity: 'warn', event: null, vars: ['flow'], born: -1 });
    }
    const reds = list.filter((a) => a.severity === 'red').length;
    for (const a of list) a.blink = (a.severity === 'red' && reds >= 2) || isBlocked(g, a.station);
    list.sort((a, b) => (a.severity === b.severity ? a.born - b.born : a.severity === 'red' ? -1 : 1));
    return list;
  }

  // ------------------------------------------------------------- Jugador

  function collides(x, y) {
    const r = C.PLAYER_RADIUS;
    const b = C.MAP.bounds;
    if (x - r < b.x || x + r > b.x + b.w || y - r < b.y || y + r > b.y + b.h) return true;
    for (const s of SOLIDS) {
      const cx = clamp(x, s.x, s.x + s.w);
      const cy = clamp(y, s.y, s.y + s.h);
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  }

  function updatePlayer(g, dt, input) {
    const p = g.player;
    p.adjust = 0;
    if (input.pressed.includes('interact')) {
      if (p.operating) leaveStation(g);
      else enterStation(g);
    } else if (input.pressed.includes('cancel') && p.operating) {
      leaveStation(g);
    }
    if (p.operating) {
      p.moving = false;
      return;
    }
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (!len) {
      p.moving = false;
      return;
    }
    mx /= len;
    my /= len;
    const step = C.PLAYER_SPEED * dt;
    const nx = p.x + mx * step;
    if (!collides(nx, p.y)) p.x = nx;
    const ny = p.y + my * step;
    if (!collides(p.x, ny)) p.y = ny;
    if (mx) p.facing = Math.sign(mx);
    p.moving = true;
    p.walkT += dt;
  }

  function enterStation(g) {
    const id = nearestStation(g);
    if (!id) return;
    if (isBlocked(g, id)) {
      emit(g, 'denied', { station: id });
      return;
    }
    g.player.operating = id;
    emit(g, 'enter', { station: id });
  }

  function leaveStation(g) {
    emit(g, 'leave', { station: g.player.operating });
    g.player.operating = null;
  }

  function updateStation(g, dt, input) {
    const id = g.player.operating;
    if (!id || isBlocked(g, id)) return;
    const key = C.MAP.stations[id].variable;
    const cfg = C.VARS[key];
    const repair = activeRepair(g, id);
    if (repair) {
      const done = MG[repair.mg.type].update(repair.mg, dt, input, g.rng, (type) => emit(g, type, { station: id }));
      if (done) resolve(g, repair, true);
    }
    if (input.adjust && !isStuck(g, key)) {
      const v = g.vars[key];
      v.value = clamp(v.value + input.adjust * cfg.adjustRate * dt, cfg.hardMin, cfg.hardMax);
      g.player.adjust = input.adjust;
    }
  }

  // ------------------------------------------------------------- Eventos

  function addVar(g, key, delta) {
    const cfg = C.VARS[key];
    const v = g.vars[key];
    v.value = clamp(v.value + delta, cfg.hardMin, cfg.hardMax);
  }

  function updateEvents(g, dt) {
    const rng = g.rng;
    for (const e of g.activeEvents.slice()) {
      e.age += dt;
      switch (e.type) {
        case 'thermalDrift':
        case 'flowDrift':
        case 'slowBelt':
          addVar(g, e.vars[0], e.rate * dt);
          break;
        case 'steamHit': {
          const cooling = e.mg.active && g.player.operating === 'temp' && !isBlocked(g, 'temp');
          addVar(g, 'temp', (cooling ? -P.steamHit.coolRate : P.steamHit.rate * g.diff.drift) * dt);
          break;
        }
        case 'airPump':
          e.phase += ((2 * Math.PI) / P.airPump.period) * dt;
          break;
        case 'foam':
          e.t += dt;
          e.flowOffset = P.foam.flowOffset + P.foam.wobble * Math.sin(e.t * 7.3);
          addVar(g, 'hold', -P.foam.holdRate * g.diff.drift * dt);
          break;
        case 'crazySensor': {
          const key = e.vars[0];
          const half = (C.VARS[key].max - C.VARS[key].min) / 2;
          addVar(g, key, e.realDrift * dt);
          e.fakeT -= dt;
          if (e.fakeT <= 0) {
            e.fakeT = 1 + rng() * 1.2;
            e.fakeTarget = sign(rng) * (0.4 + rng() * 1.1) * half;
          }
          e.fake += (e.fakeTarget - e.fake) * Math.min(1, dt * 3);
          e.jitterT -= dt;
          if (e.jitterT <= 0) {
            e.jitterT = 0.12;
            e.jitter = (rng() - 0.5) * 0.3 * half;
          }
          if (e.age >= P.crazySensor.duration) resolve(g, e, false);
          break;
        }
      }
      // Las derivas se cierran estabilizando la variable en la banda ideal desde la estación.
      if (e.kind === 'adjust' && g.activeEvents.includes(e)) {
        const cfg = C.VARS[e.vars[0]];
        const here = g.player.operating === e.station && !isBlocked(g, e.station);
        if (here && Math.abs(g.vars[e.vars[0]].value - cfg.ideal) <= cfg.band) e.settle += dt;
        else e.settle = 0;
        if (e.settle >= C.SETTLE_TIME) resolve(g, e, true);
      }
    }
  }

  function resolve(g, e, byPlayer) {
    const i = g.activeEvents.indexOf(e);
    if (i < 0) return;
    g.activeEvents.splice(i, 1);
    if (byPlayer) g.stats.resolved++;
    emit(g, 'resolved', { station: e.station, name: e.name, byPlayer });
  }

  function spawnEvent(g, type, ph) {
    const def = C.EVENTS[type];
    const rng = g.rng;
    let vars = def.vars;
    let station = def.station;
    if (type === 'crazySensor') {
      const free = VK.filter((k) => !varBusy(g, k));
      const key = free[Math.floor(rng() * free.length)];
      vars = [key];
      station = C.VARS[key].station;
    }
    const e = { id: g.nextId++, type, name: def.name, kind: def.kind, station, vars, hint: def.hint, age: 0, settle: 0, born: g.time, mg: null };
    switch (type) {
      case 'thermalDrift':
        e.rate = sign(rng) * between(rng, P.thermalDrift.rate) * g.diff.drift;
        break;
      case 'flowDrift':
        e.rate = sign(rng) * between(rng, P.flowDrift.rate) * g.diff.drift;
        break;
      case 'slowBelt':
        e.rate = between(rng, P.slowBelt.rate) * g.diff.drift;
        break;
      case 'stuckValve': {
        const cfg = C.VARS.flow;
        e.stuckValue = clamp(g.vars.flow.value + sign(rng) * between(rng, P.stuckValve.offset), C.LINE_STOP.threshold + 0.05, cfg.hardMax);
        break;
      }
      case 'airPump':
        e.amp = P.airPump.amp;
        e.phase = 0;
        break;
      case 'foam':
        e.t = 0;
        e.flowOffset = P.foam.flowOffset;
        break;
      case 'crazySensor':
        e.realDrift = sign(rng) * P.crazySensor.realDrift * TYPICAL_DRIFT[vars[0]] * g.diff.drift;
        e.fake = 0;
        e.fakeT = 0;
        e.fakeTarget = 0;
        e.jitter = 0;
        e.jitterT = 0;
        break;
    }
    if (def.minigame) e.mg = MG[def.minigame].create(rng);
    g.activeEvents.push(e);
    g.stats.spawned++;
    g.phaseSpawns++;
    if (def.kind === 'repair') g.phaseRepairs++;
    emit(g, 'alarm', { station, name: def.name });
    if (ph.blockChance && rng() < ph.blockChance) {
      g.stations[station].blockedUntil = g.time + C.BLOCK_TIME;
      emit(g, 'blocked', { station });
    }
    return e;
  }

  function canSpawn(g, type, ph) {
    const def = C.EVENTS[type];
    if (g.activeEvents.some((e) => e.type === type)) return false;
    if (def.kind === 'repair' && ph.maxRepairs != null && g.phaseRepairs >= ph.maxRepairs) return false;
    if (type === 'crazySensor') return VK.some((k) => !varBusy(g, k));
    return def.vars.every((k) => !varBusy(g, k));
  }

  function pickType(g, ph) {
    if (g.forcedType && canSpawn(g, g.forcedType, ph)) {
      const t = g.forcedType;
      g.forcedType = null;
      return t;
    }
    const options = ph.pool.filter((t) => canSpawn(g, t, ph));
    if (!options.length) return null;
    const weights = options.map((t) => C.EVENTS[t].weight * ((ph.boost && ph.boost[t]) || 1));
    let r = g.rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < options.length; i++) {
      r -= weights[i];
      if (r <= 0) return options[i];
    }
    return options[options.length - 1];
  }

  function updatePhase(g) {
    let idx = C.PHASES.findIndex((p) => g.time < p.until);
    if (idx < 0) idx = C.PHASES.length - 1;
    if (idx === g.phaseIndex) return;
    g.phaseIndex = idx;
    const ph = C.PHASES[idx];
    // La fase efectiva aplica la dificultad elegida; el arranque (0-10 s) no cambia.
    const d = g.diff;
    const maxActive = idx === 0 ? ph.maxActive : Math.max(1, ph.maxActive + d.maxActiveDelta);
    g.ph = Object.assign({}, ph, {
      maxActive,
      minActive: ph.minActive ? Math.max(1, Math.min(maxActive, ph.minActive + d.maxActiveDelta)) : ph.minActive,
      interval: ph.interval.map((x) => x * d.interval),
      blockChance: (ph.blockChance || 0) * d.block,
    });
    g.phaseSpawns = 0;
    g.phaseRepairs = 0;
    g.spawnTimer = ph.firstAt;
    g.forcedType = ph.firstType || null;
    emit(g, 'phase', { index: idx, label: ph.label, peak: !!ph.peak });
  }

  function updateScheduler(g, dt) {
    const ph = g.ph;
    g.spawnTimer -= dt;
    // En las fases altas se garantiza un mínimo de alarmas simultáneas.
    if (ph.minActive && g.activeEvents.length < ph.minActive) g.spawnTimer = Math.min(g.spawnTimer, 1.2);
    if (g.spawnTimer > 0) return;
    if (ph.maxTotal != null && g.phaseSpawns >= ph.maxTotal) {
      g.spawnTimer = Infinity;
      return;
    }
    const type = g.activeEvents.length < ph.maxActive ? pickType(g, ph) : null;
    if (!type) {
      g.spawnTimer = 0.5;
      return;
    }
    spawnEvent(g, type, ph);
    g.spawnTimer = between(g.rng, ph.interval);
  }

  // ------------------------------------------------------- Contabilidad

  function addCause(g, cause, vol) {
    g.stats.byCause[cause] = (g.stats.byCause[cause] || 0) + vol;
  }

  function accountTick(g) {
    const dt = C.TICK;
    const s = g.stats;
    g.ticks++;

    const causes = [];
    for (const k of VK) {
      const v = g.vars[k];
      const status = varStatus(g, k);
      const dir = status === 'low' || status === 'high' ? status : null;
      v.outTicks = dir ? (dir === v.dir ? v.outTicks + 1 : 1) : 0;
      v.dir = dir;
      const prevCause = v.discarding ? v.cause : null;
      v.discarding = !!dir && !g.lineStopped && v.outTicks > C.GRACE_TICKS;
      v.cause = v.discarding ? k + '_' + dir : null;
      if (v.discarding) {
        causes.push(v.cause);
        if (v.cause !== prevCause) {
          s.episodes[v.cause] = (s.episodes[v.cause] || 0) + 1;
          emit(g, 'discardStart', { variable: k, dir });
        }
      }
    }

    const vol = g.lineStopped ? 0 : effective(g, 'flow') * dt;
    s.processed += vol;
    if (causes.length) {
      s.discarded += vol;
      g.second.discarded += vol;
      for (const c of causes) addCause(g, c, vol / causes.length);
    } else {
      s.approved += vol;
      g.second.approved += vol;
    }
    g.discardingNow = causes.length > 0;

    // Anti-trampa: válvula al mínimo demasiado tiempo => paro de línea.
    const LS = C.LINE_STOP;
    if (!g.lineStopped) {
      g.lowFlowTicks = effective(g, 'flow') <= LS.threshold ? g.lowFlowTicks + 1 : 0;
      if (g.lowFlowTicks * dt > LS.time + 1e-9) {
        g.lineStopped = true;
        g.lineStopTicks = Math.round(LS.duration / dt);
        g.lowFlowTicks = 0;
        s.lineStops++;
        emit(g, 'lineStop', {});
      }
    } else if (--g.lineStopTicks <= 0) {
      g.lineStopped = false;
      s.processed += LS.purgeHL;
      s.discarded += LS.purgeHL;
      g.second.discarded += LS.purgeHL;
      addCause(g, 'lineStop', LS.purgeHL);
      s.episodes.lineStop = (s.episodes.lineStop || 0) + 1;
      g.vars.flow.value = C.VARS.flow.ideal;
      emit(g, 'lineRestart', { purge: LS.purgeHL });
    }

    // Paro de planta opcional.
    const PS = C.PLANT_STOP;
    if (PS.enabled) {
      const reds = alarms(g).filter((a) => a.severity === 'red').length;
      g.redTicks = reds >= PS.minRed ? g.redTicks + 1 : 0;
      if (g.redTicks * dt >= PS.time - 1e-9) end(g, 'plant');
    }

    if (++g.second.ticks >= 10) {
      emit(g, 'volume', { approved: g.second.approved, discarded: g.second.discarded });
      g.second = { ticks: 0, approved: 0, discarded: 0 };
    }
  }

  function end(g, reason) {
    if (g.over) return;
    g.over = true;
    g.endReason = reason;
    g.player.operating = null;
    emit(g, 'end', { reason });
  }

  // ---------------------------------------------------------- Bucle

  function step(g, dt, input) {
    if (g.over) return;
    input = input || EMPTY_INPUT;
    dt = Math.min(dt, 0.1);
    g.time += dt;
    for (const e of g.activeEvents) if (e.mg && e.mg.type === 'hold') e.mg.active = false;
    updatePhase(g);
    updatePlayer(g, dt, input);
    updateStation(g, dt, input);
    updateEvents(g, dt);
    if (g.scheduler) updateScheduler(g, dt);
    g.tickAcc += dt;
    while (g.tickAcc >= C.TICK - 1e-9 && g.ticks < g.totalTicks && !g.over) {
      g.tickAcc -= C.TICK;
      accountTick(g);
    }
    if (!g.over && g.ticks >= g.totalTicks) end(g, 'time');
  }

  // ------------------------------------------------------------ Resumen

  function results(g) {
    const s = g.stats;
    const efficiency = s.processed > 0 ? (s.approved / s.processed) * 100 : 0;
    const causes = Object.keys(s.byCause)
      .map((c) => ({ cause: c, label: causeLabel(c), hl: s.byCause[c], episodes: s.episodes[c] || 0 }))
      .filter((c) => c.hl > 1e-6)
      .sort((a, b) => b.hl - a.hl);
    const main = causes[0] || null;
    let mainLabel = null;
    if (main) mainLabel = main.label + (main.episodes >= 3 && main.cause !== 'lineStop' ? ' intermitente' : '');
    let rank = C.RANKS.find((r) => efficiency >= r.min).rank;
    if (g.endReason === 'plant') rank = 'C';
    return {
      processed: s.processed,
      approved: s.approved,
      discarded: s.discarded,
      efficiency,
      causes,
      mainCause: main ? main.cause : null,
      mainCauseLabel: mainLabel,
      rank,
      endReason: g.endReason,
      spawned: s.spawned,
      resolved: s.resolved,
      lineStops: s.lineStops,
      duration: g.ticks * C.TICK,
    };
  }

  function summaryText(r) {
    const cause = r.mainCauseLabel ? `Causa principal: ${r.mainCauseLabel}.` : 'Causa principal: ninguna, turno limpio.';
    return (
      `Pasaron ${fmt(r.processed, 1)} HL. Aprobados: ${fmt(r.approved, 1)} HL. ` +
      `Desechados: ${fmt(r.discarded, 1)} HL. Eficiencia: ${fmt(r.efficiency, 1)}%. ${cause} Rango ${r.rank}.`
    );
  }

  PF.Sim = {
    createGame,
    step,
    effective,
    display,
    varStatus,
    alarms,
    isBlocked,
    isStuck,
    stationEvents,
    activeRepair,
    nearestStation,
    phase,
    timeLeft,
    results,
    summaryText,
    causeLabel,
    makeRng,
    fmt,
  };
})();
