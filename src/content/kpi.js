// Contenido de "Supervisor de Turno": GLY, LEF y OSE, catálogo de pérdidas y explicaciones.
// Convención del juego (la de los ejemplos del material): todas las métricas se calculan sobre
// las horas totales del turno y cada una descuenta un nivel más de pérdidas:
//   GLY = (T − planificación) / T
//   LEF = (T − planificación − externas) / T
//   OSE = (T − planificación − externas − internas) / T      →  GLY ≥ LEF ≥ OSE
// VERIFICAR con el manual de la planta: hay empresas que usan otro denominador u otro orden.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  const HOURS = 12;

  // Tipos de pérdida y el primer KPI que las "ve".
  const CATS = {
    plan: {
      kpi: 'GLY',
      name: 'Planificación / utilización',
      short: 'Planificación',
      color: '#b48cff',
      explain: 'Es tiempo en que no estaba previsto producir (planificación o utilización): baja el GLY y, por arrastre, también la LEF y la OSE.',
      power: 'Se decide en la planificación: coordinar programa, dotación y paradas con Planificación.',
    },
    ext: {
      kpi: 'LEF',
      name: 'Pérdida externa',
      short: 'Externa',
      color: '#ffb347',
      explain: 'La causa viene de otra área: baja la LEF (y la OSE), pero el GLY no la ve.',
      power: 'Fuera del control de la línea: se escala al área responsable, con los datos de la espera.',
    },
    int: {
      kpi: 'OSE',
      name: 'Pérdida interna',
      short: 'Interna',
      color: '#ff6b5a',
      explain: 'Es una pérdida de la propia línea: solo baja la OSE; el GLY y la LEF no la ven.',
      power: 'Está en el poder de la línea: mantenimiento, operación, estándares y cambios rápidos.',
    },
  };

  const KPIS = {
    GLY: { name: 'GLY', full: 'Productividad global', question: '¿Qué parte del tiempo total aprovecho para producir?', cat: 'plan' },
    LEF: { name: 'LEF', full: 'Line Efficiency', question: 'Cuando la línea debía producir, ¿qué parte del tiempo operó?', cat: 'ext' },
    OSE: { name: 'OSE', full: 'Overall System Effectiveness', question: 'De todo el tiempo disponible, ¿qué parte fue producción efectiva?', cat: 'int' },
  };

  // Áreas a las que se lleva cada pérdida.
  const OWNERS = {
    planificacion: 'Planificación',
    abastecimiento: 'Abastecimiento / Logística',
    calidad: 'Calidad',
    servicios: 'Servicios industriales',
    mantenimiento: 'Mantenimiento',
    operacion: 'Operación de la línea',
  };

  // machine: 0 depaletizadora · 1 lavadora · 2 llenadora · 3 pasteurizador · 4 etiquetadora · 5 paletizadora
  const LOSSES = [
    { id: 'cambio', cat: 'plan', name: 'Cambio de formato programado', owner: 'planificacion', visual: 'changeover', machine: 2, base: true },
    { id: 'sinpersonal', cat: 'plan', name: 'Horas sin personal asignado', owner: 'planificacion', visual: 'nostaff', machine: -1 },
    { id: 'sinprograma', cat: 'plan', name: 'Sin programa de producción (falta de demanda)', owner: 'planificacion', visual: 'noplan', machine: -1, trap: 'No tener programa no es una falla de la línea: es tiempo en que no estaba previsto producir, por eso baja el GLY.' },
    { id: 'cip', cat: 'plan', name: 'Limpieza CIP programada', owner: 'planificacion', visual: 'cip', machine: 2 },
    { id: 'preventivo', cat: 'plan', name: 'Mantenimiento preventivo programado', owner: 'planificacion', visual: 'pm', machine: 3 },
    { id: 'botellas', cat: 'ext', name: 'Falta de botellas del proveedor', owner: 'abastecimiento', visual: 'material', machine: 0 },
    { id: 'etiquetas', cat: 'ext', name: 'Falta de etiquetas y tapas', owner: 'abastecimiento', visual: 'material', machine: 4 },
    { id: 'calidad', cat: 'ext', name: 'Espera de liberación de Calidad', owner: 'calidad', visual: 'quality', machine: 2, trap: 'La línea está lista pero espera a Calidad: la causa es de otra área, por eso es pérdida externa (LEF), no interna.' },
    { id: 'pallets', cat: 'ext', name: 'Falta de pallets', owner: 'abastecimiento', visual: 'pallets', machine: 5 },
    { id: 'servicios', cat: 'ext', name: 'Corte de CO₂ / vapor (servicios industriales)', owner: 'servicios', visual: 'utility', machine: 3 },
    { id: 'bodega', cat: 'ext', name: 'Bodega llena: Logística no retira el producto', owner: 'abastecimiento', visual: 'warehouse', machine: 5 },
    { id: 'replan', cat: 'ext', name: 'Cambio de plan a última hora (planificación incorrecta)', owner: 'planificacion', visual: 'replan', machine: -1, trap: 'La línea debía producir y un error de planificación de otra área la frenó: es pérdida externa (LEF). Distinto de no tener programa, que baja el GLY.' },
    { id: 'averia', cat: 'int', name: 'Avería mecánica en la llenadora', owner: 'mantenimiento', visual: 'breakdown', machine: 2 },
    { id: 'electrica', cat: 'int', name: 'Falla eléctrica en la etiquetadora', owner: 'mantenimiento', visual: 'electrical', machine: 4 },
    { id: 'micro', cat: 'int', name: 'Microparadas en la paletizadora', owner: 'operacion', visual: 'micro', machine: 5 },
    { id: 'atasco', cat: 'int', name: 'Atasco de botellas en la lavadora', owner: 'operacion', visual: 'jam', machine: 1 },
    { id: 'lenta', cat: 'int', name: 'Operación a velocidad reducida', owner: 'operacion', visual: 'slow', machine: 2, trap: 'Aunque la línea no pare, producir más lento que el estándar es pérdida interna: baja la OSE.' },
    { id: 'cambiomal', cat: 'int', name: 'Cambio de formato excedido (mal ejecutado)', owner: 'operacion', visual: 'longchange', machine: 2, trap: 'El cambio programado baja el GLY, pero el tiempo que se pasa del estándar por ejecutarlo mal es pérdida interna: solo baja la OSE.' },
  ];
  const TRAPS = LOSSES.filter((l) => l.trap).map((l) => l.id);

  // Diagnósticos del modo "Diagnóstico de turno" (regla rápida del supervisor).
  const DIAG = {
    ok: { label: 'Operación excelente', short: 'EXCELENTE', pattern: 'GLY, LEF y OSE altos', color: '#7ddc6a' },
    plan: { label: 'Problema de planificación', short: 'PLANIFICACIÓN', pattern: 'GLY, LEF y OSE bajos', color: CATS.plan.color },
    ext: { label: 'Problema externo', short: 'EXTERNO', pattern: 'GLY alto, LEF y OSE bajos', color: CATS.ext.color },
    int: { label: 'Problema interno de la línea', short: 'INTERNO', pattern: 'GLY y LEF altos, OSE bajo', color: CATS.int.color },
  };

  const DIAG_WHY = {
    ok: 'Las tres métricas quedaron altas: casi no hubo pérdidas. Lo que toca es estandarizar lo que funcionó.',
    plan: 'El GLY ya cae y arrastra a la LEF y a la OSE: la gran pérdida es de planificación o utilización (horas sin producir previstas).',
    ext: 'El GLY está alto pero la LEF cae: la gran caída está entre GLY y LEF, así que la causa viene de fuera de la línea.',
    int: 'GLY y LEF están altos y solo cae la OSE: la gran caída está entre LEF y OSE, así que el problema está en la propia línea.',
  };

  // Ejemplos del material (turno de 12 h).
  const EXAMPLES = [
    { name: 'Turno A', plan: 0.5, ext: 0.2, int: 0.1, diag: 'Operación excelente' },
    { name: 'Turno B', plan: 0.5, ext: 2.0, int: 0.2, diag: 'Problema externo' },
    { name: 'Turno C', plan: 0.5, ext: 0.2, int: 2.0, diag: 'Problema interno' },
  ];

  // KPIs con las pérdidas transcurridas hasta `upTo` horas (por defecto el turno completo).
  function kpis(losses, upTo = HOURS) {
    const sum = { plan: 0, ext: 0, int: 0 };
    for (const l of losses) {
      const a = Math.max(0, Math.min(upTo, l.start));
      const b = Math.max(0, Math.min(upTo, l.start + l.hours));
      sum[l.def.cat] += Math.max(0, b - a);
    }
    const T = Math.max(1e-9, upTo);
    const gly = upTo > 0 ? (T - sum.plan) / T : 1;
    const lef = upTo > 0 ? (T - sum.plan - sum.ext) / T : 1;
    const ose = upTo > 0 ? (T - sum.plan - sum.ext - sum.int) / T : 1;
    return { gly, lef, ose, ...sum };
  }

  // Diagnóstico correcto de un turno según dónde está la gran caída.
  function diagnose(k) {
    const gaps = [
      ['plan', k.plan],
      ['ext', k.ext],
      ['int', k.int],
    ].sort((a, b) => b[1] - a[1]);
    return gaps[0][1] >= 1.2 ? gaps[0][0] : 'ok';
  }

  function pct(x) {
    return (x * 100).toFixed(1).replace('.', ',') + ' %';
  }

  PF.KPI = { HOURS, CATS, KPIS, OWNERS, LOSSES, TRAPS, DIAG, DIAG_WHY, EXAMPLES, kpis, diagnose, pct };
})();
