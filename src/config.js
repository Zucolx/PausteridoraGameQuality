// Configuración y balance de "Pasteurizadora Flash: Turno 60".
// Todo número que afecte la dificultad vive aquí para poder ajustarlo sin tocar la lógica.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  const CONFIG = {
    DURATION: 60, // segundos de turno
    TICK: 0.1, // paso de contabilidad del flujo (s)
    GRACE_TICKS: 4, // 0,4 s fuera de rango antes de desviar a descarte
    PLAYER_SPEED: 260, // px/s
    PLAYER_RADIUS: 16,
    INTERACT_RADIUS: 70,
    SETTLE_TIME: 0.6, // s dentro de la banda ideal para cerrar una deriva
    WARN_FRACTION: 0.6, // fracción del semirango a partir de la cual la alarma es amarilla

    // Anti-trampa: la válvula no cierra del todo.
    LINE_STOP: {
      minFlow: 0.6,
      threshold: 0.62, // a ≤ este caudal se considera "válvula al mínimo"
      time: 2, // s al mínimo antes del paro
      duration: 3, // s de línea parada
      purgeHL: 1.0, // HL purgados a descarte al rearrancar
    },

    // Paro de planta (opcional): demasiadas alarmas rojas a la vez.
    PLANT_STOP: { enabled: true, minRed: 3, time: 5 },

    // Bloqueos breves de estación durante la hora pico.
    BLOCK_TIME: 1.5,
  };

  CONFIG.VARS = {
    temp: {
      key: 'temp',
      label: 'Temperatura',
      short: 'TEMP',
      unit: 'PU',
      ideal: 27,
      min: 24,
      max: 30,
      hardMin: 16,
      hardMax: 38,
      viewMin: 18,
      viewMax: 36,
      band: 1.0,
      adjustRate: 3.2,
      decimals: 1,
      station: 'temp',
      low: { cause: 'temperatura baja', effect: 'subpasteuriza' },
      high: { cause: 'temperatura alta', effect: 'sobrepasteuriza' },
    },
    flow: {
      key: 'flow',
      label: 'Flujo',
      short: 'FLUJO',
      unit: 'HL/s',
      ideal: 0.9,
      min: 0.85,
      max: 0.95,
      hardMin: 0.6,
      hardMax: 1.15,
      viewMin: 0.6,
      viewMax: 1.15,
      band: 0.02,
      adjustRate: 0.12,
      decimals: 2,
      station: 'valve',
      low: { cause: 'flujo bajo', effect: 'sobrepasteuriza' },
      high: { cause: 'flujo alto', effect: 'subpasteuriza' },
    },
    hold: {
      key: 'hold',
      label: 'Tiempo de retención',
      short: 'RETENCIÓN',
      unit: 's',
      ideal: 3.0,
      min: 2.8,
      max: 3.2,
      hardMin: 2.2,
      hardMax: 3.9,
      viewMin: 2.3,
      viewMax: 3.7,
      band: 0.07,
      adjustRate: 0.6,
      decimals: 2,
      station: 'pump',
      low: { cause: 'tiempo bajo', effect: 'subpasteuriza' },
      high: { cause: 'tiempo alto', effect: 'sobrepasteuriza' },
    },
  };
  CONFIG.VAR_KEYS = ['temp', 'flow', 'hold'];

  // Tipos de evento. kind: 'adjust' se cierra estabilizando la variable en la estación;
  // kind: 'repair' se cierra completando el mini-juego.
  CONFIG.EVENTS = {
    thermalDrift: {
      name: 'Deriva térmica',
      kind: 'adjust',
      station: 'temp',
      vars: ['temp'],
      hint: 'Ajusta el regulador con A/D',
      weight: 3,
    },
    flowDrift: {
      name: 'Deriva de caudal',
      kind: 'adjust',
      station: 'valve',
      vars: ['flow'],
      hint: 'Abre/cierra la válvula con A/D',
      weight: 3,
    },
    slowBelt: {
      name: 'Cinta lenta',
      kind: 'adjust',
      station: 'pump',
      vars: ['hold'],
      hint: 'Ajusta la velocidad con A/D',
      weight: 3,
    },
    steamHit: {
      name: 'Golpe de vapor',
      kind: 'repair',
      minigame: 'hold',
      station: 'temp',
      vars: ['temp'],
      hint: 'Mantén ESPACIO: enfriamiento de emergencia',
      weight: 2,
    },
    stuckValve: {
      name: 'Válvula trabada',
      kind: 'repair',
      minigame: 'arrows',
      station: 'valve',
      vars: ['flow'],
      hint: 'Desatora: repite la secuencia de flechas',
      weight: 2,
    },
    airPump: {
      name: 'Bomba con aire',
      kind: 'repair',
      minigame: 'pressure',
      station: 'pump',
      vars: ['flow'],
      hint: 'Purga: mantén la presión en verde con ESPACIO',
      weight: 2,
    },
    foam: {
      name: 'Espuma',
      kind: 'repair',
      minigame: 'timing',
      station: 'valve',
      vars: ['flow', 'hold'],
      hint: 'Antiespumante: ESPACIO cuando la aguja esté en la zona',
      weight: 2,
    },
    crazySensor: {
      name: 'Sensor loco',
      kind: 'repair',
      minigame: 'simon',
      station: null, // depende de la variable afectada
      vars: null,
      hint: 'Calibra: repite el patrón de colores con 1-4',
      weight: 3,
    },
  };

  // Parámetros físicos de cada evento.
  CONFIG.EVENT_PARAMS = {
    thermalDrift: { rate: [0.5, 0.75] }, // PU/s, signo aleatorio
    flowDrift: { rate: [0.017, 0.025] }, // HL/s por s, signo aleatorio
    slowBelt: { rate: [0.04, 0.055] }, // s/s, siempre sube
    steamHit: { rate: 1.0, coolRate: 2.0, need: 1.3 },
    stuckValve: { offset: [0.07, 0.1], length: 5 },
    airPump: { amp: 0.075, period: 1.4, need: 1.8 },
    foam: { flowOffset: 0.055, wobble: 0.02, holdRate: 0.035, hits: 3 },
    crazySensor: { duration: 10, realDrift: 0.35, length: 4 },
  };

  // Curva de dificultad del turno.
  CONFIG.PHASES = [
    {
      until: 10,
      label: 'Arranque',
      maxActive: 1,
      maxTotal: 1,
      firstAt: 2,
      interval: [3, 6],
      pool: ['thermalDrift', 'flowDrift', 'slowBelt'],
    },
    {
      until: 35,
      label: 'Turno estable',
      maxActive: 2,
      maxRepairs: 2,
      firstAt: 0.5,
      interval: [3, 6],
      pool: ['thermalDrift', 'flowDrift', 'slowBelt', 'steamHit', 'stuckValve', 'airPump', 'foam'],
    },
    {
      until: 50,
      label: 'Presión',
      maxActive: 2,
      minActive: 2,
      firstAt: 0.3,
      interval: [3, 5],
      pool: ['thermalDrift', 'flowDrift', 'slowBelt', 'steamHit', 'stuckValve', 'airPump', 'foam', 'crazySensor'],
      boost: { crazySensor: 3 },
      firstType: 'crazySensor',
    },
    {
      until: 60,
      label: 'HORA PICO',
      peak: true,
      maxActive: 3,
      minActive: 2,
      firstAt: 0.1,
      interval: [2.5, 4],
      blockChance: 0.35,
      pool: ['thermalDrift', 'flowDrift', 'slowBelt', 'steamHit', 'stuckValve', 'airPump', 'foam', 'crazySensor'],
    },
  ];

  // Rango final según eficiencia.
  CONFIG.RANKS = [
    { min: 95, rank: 'S' },
    { min: 85, rank: 'A' },
    { min: 70, rank: 'B' },
    { min: -Infinity, rank: 'C' },
  ];

  // ---------------------------------------------------------------- Mapa
  // Coordenadas lógicas del lienzo (1280x720). El mapa ocupa x 0-960, y 64-720.
  CONFIG.VIEW = { width: 1280, height: 720, hud: 64, mapWidth: 960 };
  CONFIG.MAP = {
    bounds: { x: 24, y: 88, w: 912, h: 608 },
    start: { x: 480, y: 440 },
    stations: {
      panel: {
        id: 'panel',
        name: 'Panel central',
        rect: { x: 420, y: 320, w: 120, h: 64 },
        spot: { x: 480, y: 420 },
        interactive: false,
      },
      temp: {
        id: 'temp',
        name: 'Estación de temperatura',
        short: 'T',
        rect: { x: 110, y: 112, w: 160, h: 76 },
        spot: { x: 190, y: 232 },
        interactive: true,
        variable: 'temp',
      },
      valve: {
        id: 'valve',
        name: 'Válvula de flujo',
        short: 'V',
        rect: { x: 690, y: 112, w: 160, h: 76 },
        spot: { x: 770, y: 232 },
        interactive: true,
        variable: 'flow',
      },
      pump: {
        id: 'pump',
        name: 'Bomba / tubo de retención',
        short: 'B',
        rect: { x: 400, y: 612, w: 160, h: 76 },
        spot: { x: 480, y: 572 },
        interactive: true,
        variable: 'hold',
      },
    },
    obstacles: [
      { x: 40, y: 330, w: 80, h: 130, kind: 'tank', label: 'MOSTO' },
      { x: 862, y: 320, w: 66, h: 100, kind: 'tank', label: 'LLENADO', tone: 'good' },
      { x: 862, y: 480, w: 66, h: 76, kind: 'tank', label: 'DESCARTE', tone: 'bad' },
      { x: 236, y: 440, w: 112, h: 70, kind: 'crate' },
      { x: 612, y: 440, w: 112, h: 70, kind: 'crate' },
    ],
    // Recorrido de la cerveza (tuberías del suelo).
    pipe: [
      { x: 80, y: 330 },
      { x: 80, y: 150 },
      { x: 110, y: 150 },
      { x: 270, y: 150 },
      { x: 384, y: 150 },
      { x: 384, y: 650 },
      { x: 400, y: 650 },
      { x: 560, y: 650 },
      { x: 600, y: 650 },
      { x: 600, y: 150 },
      { x: 690, y: 150 },
      { x: 850, y: 150 },
      { x: 895, y: 150 },
      { x: 895, y: 262 },
    ],
    pipeGood: [
      { x: 895, y: 262 },
      { x: 895, y: 320 },
    ],
    pipeBad: [
      { x: 895, y: 262 },
      { x: 842, y: 262 },
      { x: 842, y: 518 },
      { x: 862, y: 518 },
    ],
  };

  PF.CONFIG = CONFIG;
})();
