// Contenido de "Supervisor de Turno": LEF, GLY y OSE, catálogo de pérdidas y explicaciones.
//
// Las tres métricas comparten el mismo numerador, el EPT (tiempo de producción efectiva):
//   LEF = EPT / LET               (LET: tiempo de operación de la línea)
//   GLY = EPT / tiempo programado
//   OSE = EPT / tiempo total
// con  tiempo total − no programado = tiempo programado
//      tiempo programado − paradas planificadas − causas externas = LET
//      LET − pérdidas internas = EPT
// Cualquier pérdida que reduce el EPT baja los tres KPIs; lo que cambia es cuál la detecta
// primero: internas → LEF · planificadas y externas → GLY · no programado → OSE.
// Por eso siempre LEF ≥ GLY ≥ OSE.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  const HOURS = 12;

  // Tipos de pérdida según el primer KPI que las detecta.
  const CATS = {
    int: {
      kpi: 'LEF',
      name: 'Interna de la línea',
      short: 'Interna',
      color: '#ff6b5a',
      explain: 'Es una pérdida interna de la línea: la detecta primero el LEF y, como baja el EPT, arrastra también al GLY y al OSE.',
      power: 'Está en el poder de la línea: mantenimiento, operación, estándares, balance y recuperación tras paradas.',
    },
    pe: {
      kpi: 'GLY',
      name: 'Planificada o externa',
      short: 'Planificada / externa',
      color: '#ffb347',
      explain: 'Es una parada planificada o una causa externa: el LEF la excluye, la detecta primero el GLY (y también baja el OSE).',
      power: 'Las planificadas se reducen con SMED y optimizando CIP y preventivos; las externas se escalan a su área con datos.',
    },
    ns: {
      kpi: 'OSE',
      name: 'No programada (uso de la capacidad)',
      short: 'No programada',
      color: '#b48cff',
      explain: 'Es tiempo en que la línea no se programó: el GLY no lo ve, solo lo detecta el OSE.',
      power: 'Es uso de la capacidad: se decide en planificación y ventas (S&OP), no en la línea.',
    },
    all: {
      kpi: 'TODOS',
      name: 'Error de dato',
      short: 'Error de dato',
      color: '#5fc8e8',
      explain: 'Es un error de dato, no de operación: como el EPT se calcula con la velocidad nominal, infla o desinfla los tres KPIs a la vez.',
      power: 'Se corrige el dato maestro de la línea: no hay pérdida operativa que atacar.',
    },
  };

  const KPIS = {
    LEF: { name: 'LEF', full: 'Line Efficiency', formula: 'EPT / LET', question: 'Mientras la línea operaba, ¿qué parte fue producción efectiva?', cat: 'int' },
    GLY: { name: 'GLY', full: 'Productividad global', formula: 'EPT / tiempo programado', question: 'Del tiempo que se programó, ¿qué parte fue producción efectiva?', cat: 'pe' },
    OSE: { name: 'OSE', full: 'Overall System Effectiveness', formula: 'EPT / tiempo total', question: 'Del tiempo total del calendario, ¿qué parte fue producción efectiva?', cat: 'ns' },
  };

  // Áreas a las que se lleva cada pérdida.
  const OWNERS = {
    mantenimiento: 'Mantenimiento',
    operacion: 'Operación de la línea',
    smed: 'Equipo SMED',
    calidad: 'Calidad e inocuidad',
    abastecimiento: 'Abastecimiento / Logística',
    elaboracion: 'Elaboración',
    utilities: 'Utilities',
    planificacion: 'Planificación y ventas',
  };

  // Catálogo de pérdidas (investigación del área de envasado). `ref` es el número del ítem
  // en el material. Los ítems 19-22 ("pueden caer en más de un KPI") se separan en variantes
  // concretas con una sola respuesta; 23 y 24 son errores de dato y solo salen en "¿Qué KPI cae?".
  // machine: 0 depaletizadora · 1 lavadora · 2 llenadora · 3 pasteurizador · 4 etiquetadora · 5 paletizadora · -1 toda la línea
  const LOSSES = [
    // 1. Detecta el LEF: pérdidas internas de la línea.
    { id: 'falla-llenadora', ref: 1, cat: 'int', name: 'Falla mecánica en la llenadora', owner: 'mantenimiento', visual: 'breakdown', machine: 2, explain: 'Parada no planificada que depende de la propia línea y de su mantenimiento: resta tiempo dentro del LET.' },
    { id: 'falla-electrica', ref: 1, cat: 'int', name: 'Falla eléctrica en la etiquetadora', owner: 'mantenimiento', visual: 'electrical', machine: 4, explain: 'Parada no planificada que depende de la propia línea y de su mantenimiento: resta tiempo dentro del LET.' },
    { id: 'microparadas', ref: 2, cat: 'int', name: 'Microparadas: atascos y botellas caídas en los transportadores', owner: 'operacion', visual: 'micro', machine: 1, explain: 'Cada una dura segundos y muchas no se registran, pero juntas cuestan varios puntos: el EPT queda bajo el tiempo que la línea "estuvo corriendo".' },
    { id: 'velocidad', ref: 3, cat: 'int', name: 'Línea a 60.000 bph con velocidad nominal de 72.000', owner: 'operacion', visual: 'slow', machine: 2, explain: 'El EPT se calcula con la velocidad nominal: correr a 60.000 en vez de 72.000 bph pierde cerca del 17 % sin parar ni un minuto.' },
    { id: 'rechazos', ref: 4, cat: 'int', name: 'Rechazos por nivel de llenado y etiquetado defectuoso', owner: 'operacion', visual: 'reject', machine: 2, explain: 'Solo cuenta el producto bueno: lo rechazado es tiempo de máquina que no se convierte en EPT.' },
    { id: 'balance', ref: 5, cat: 'int', name: 'Mal balance de línea: la llenadora se bloquea por acumulación', owner: 'operacion', visual: 'jam', machine: 2, explain: 'Con buffers y velocidades mal ajustados (perfil en V), la llenadora, cuello de botella, se detiene aunque ninguna máquina esté averiada.' },
    { id: 'ajustes', ref: 6, cat: 'int', name: 'Ajustes, regulaciones y recuperación tras paradas', owner: 'operacion', visual: 'adjust', machine: 2, explain: 'Reacomodar guías o parámetros y recuperar la velocidad tras una parada depende de la habilidad y los estándares del operador: es interno.' },

    // 2. Detecta el GLY y el LEF no: paradas planificadas y causas externas.
    { id: 'cambio-estandar', ref: 7, cat: 'pe', kind: 'planificada', name: 'Cambio de formato dentro del estándar', owner: 'smed', visual: 'changeover', machine: 2, base: true, explain: 'Es una parada planificada (DPA): el LEF la descuenta, el GLY la castiga. Por eso el SMED mejora directamente el GLY.' },
    { id: 'cip', ref: 8, cat: 'pe', kind: 'planificada', name: 'CIP y limpieza programada', owner: 'calidad', visual: 'cip', machine: 2, explain: 'Necesaria por calidad e inocuidad, pero es tiempo programado sin producción: una frecuencia o duración excesiva baja el GLY.' },
    { id: 'preventivo', ref: 9, cat: 'pe', kind: 'planificada', name: 'Mantenimiento planificado o preventivo', owner: 'mantenimiento', visual: 'pm', machine: 3, explain: 'Está planificado, así que el LEF lo descuenta; para el GLY es tiempo de la línea que no produjo.' },
    { id: 'falta-cerveza', ref: 10, cat: 'pe', kind: 'externa', name: 'Falta de cerveza filtrada (filtración o bodega sin volumen)', owner: 'elaboracion', visual: 'beer', machine: 2, explain: 'La causa está en otra área: es externa a envasado. La línea no puede producir aunque esté perfecta.' },
    { id: 'materiales', ref: 11, cat: 'pe', kind: 'externa', name: 'Falta de materiales de envase: botella, tapas, etiquetas, cajas', owner: 'abastecimiento', visual: 'material', machine: 0, explain: 'Es un problema de abastecimiento o logística: causa externa para envasado, pero el activo igual queda detenido.' },
    { id: 'servicios', ref: 12, cat: 'pe', kind: 'externa', name: 'Falla de servicios: energía, vapor, CO₂, aire comprimido o agua', owner: 'utilities', visual: 'utility', machine: 3, explain: 'Los servicios los gestiona utilities, no la línea: el LEF los excluye y el GLY los refleja como tiempo perdido.' },

    // 3. Solo detecta el OSE: uso de la capacidad.
    { id: 'demanda', ref: 13, cat: 'ns', name: 'Demanda menor a la capacidad: la línea queda sin programar', owner: 'planificacion', visual: 'noplan', machine: -1, explain: 'No es una falla operativa, pero es capacidad instalada ociosa: solo el OSE la ve.' },
    { id: 'turno-no', ref: 14, cat: 'ns', name: 'Turno no programado (tercer turno apagado)', owner: 'planificacion', visual: 'noplan', machine: -1, explain: 'Es tiempo de calendario en que el activo existe y no se usa: solo lo detecta el OSE.' },
    { id: 'portafolio', ref: 15, cat: 'ns', name: 'Portafolio cargado en otra línea: esta queda subutilizada', owner: 'planificacion', visual: 'noplan', machine: -1, explain: 'Es una decisión de planificación sobre qué SKU va a cada línea: solo el OSE la pone en evidencia.' },
    { id: 'aguas-arriba', ref: 16, cat: 'ns', name: 'Cocimiento o fermentación sin capacidad: línea sin programar', owner: 'elaboracion', visual: 'upstream', machine: -1, explain: 'Si aguas arriba no hay capacidad para alimentar todas las líneas, alguna se deja sin programar: lo ve el OSE.' },
    { id: 'overhaul', ref: 17, cat: 'ns', name: 'Parada larga por proyecto u overhaul anual', owner: 'planificacion', visual: 'project', machine: -1, explain: 'Según el manual de cada planta, a veces es tiempo no programado: no aparece en GLY ni en LEF, solo en OSE.' },
    { id: 'feriado', ref: 18, cat: 'ns', name: 'Feriado o parada legal obligatoria', owner: 'planificacion', visual: 'noplan', machine: -1, explain: 'Reduce el tiempo útil del año y solo lo ve el OSE. Algunas plantas lo sacan del tiempo total: revisa cómo lo define la tuya.' },

    // 4. Pueden caer en más de un KPI: variantes concretas.
    { id: 'cambio-exceso', ref: 19, cat: 'int', mixed: true, name: 'Exceso de un cambio de formato sobre su estándar', owner: 'smed', visual: 'adjust', machine: 2, explain: 'El tiempo estándar del cambio va como planificado (GLY); el exceso se carga como pérdida interna, así que baja el LEF. Un mismo evento se reparte entre los dos.' },
    { id: 'cip-alarga', ref: 20, cat: 'int', mixed: true, name: 'Sobretiempo de un CIP que se alarga más de lo programado', owner: 'operacion', visual: 'cip', machine: 2, explain: 'La parte planificada del CIP impacta al GLY; el sobretiempo, registrado como ineficiencia, impacta al LEF.' },
    { id: 'proveedor-corre', ref: 21, cat: 'int', mixed: true, name: 'Botella del proveedor fuera de especificación: la línea corre con microparadas y rechazos', owner: 'abastecimiento', visual: 'reject', machine: 1, explain: 'Si la línea corre con ese material, aparecen microparadas y rechazos que bajan el LEF (aunque la causa raíz sea del proveedor).' },
    { id: 'proveedor-para', ref: 21, cat: 'pe', kind: 'externa', mixed: true, name: 'Botella del proveedor rechazada: la línea se detiene sin material aceptable', owner: 'abastecimiento', visual: 'material', machine: 0, explain: 'Si la línea se detiene por no tener material aceptable, se registra como causa externa y baja el GLY.' },
    { id: 'ausentismo-lento', ref: 22, cat: 'int', mixed: true, name: 'Ausentismo: la línea corre con menos gente y baja la velocidad', owner: 'operacion', visual: 'slow', machine: 2, explain: 'Si la línea corre con menos gente cae su velocidad: eso baja el LEF.' },
    { id: 'ausentismo-para', ref: 22, cat: 'pe', kind: 'externa', mixed: true, name: 'Ausentismo: la línea se detiene por falta de operadores', owner: 'planificacion', visual: 'nostaff', machine: -1, explain: 'Si se detiene por falta de gente, cuenta como externa o planificada según la planta: baja el GLY.' },
    { id: 'ausentismo-noprog', ref: 22, cat: 'ns', mixed: true, name: 'Ausentismo: el turno directamente no se programa', owner: 'planificacion', visual: 'nostaff', machine: -1, explain: 'Si por falta de gente el turno ni se programa, es tiempo no programado: baja el OSE.' },
    { id: 'velocidad-nominal', ref: 23, cat: 'all', mixed: true, noHours: true, name: 'Velocidad nominal mal configurada en el sistema', owner: 'operacion', visual: 'none', machine: -1, explain: 'El EPT depende de la velocidad nominal: un valor errado infla o desinfla los tres KPIs a la vez y vuelve injusta la comparación entre líneas.' },
    { id: 'mal-registro', ref: 24, cat: 'int', mixed: true, noHours: true, distort: true, name: 'Una falla interna se registró como causa externa: ¿qué KPI queda distorsionado?', owner: 'operacion', visual: 'none', machine: -1, explain: 'El LEF sube artificialmente y el GLY no cambia (su numerador y denominador siguen iguales). Una brecha GLY/LEF que crece sin explicación suele ser registro mal clasificado.' },
  ];
  const TRAPS = LOSSES.filter((l) => l.mixed).map((l) => l.id);

  // Diagnósticos del modo "Diagnóstico de turno" (regla rápida del supervisor).
  const DIAG = {
    ok: { label: 'Operación excelente', short: 'EXCELENTE', pattern: 'LEF, GLY y OSE altos', color: '#7ddc6a' },
    int: { label: 'Problema interno de la línea', short: 'INTERNO', pattern: 'LEF bajo (y arrastra a GLY y OSE)', color: CATS.int.color },
    pe: { label: 'Paradas planificadas o causas externas', short: 'PLANIFICADA / EXTERNA', pattern: 'LEF alto, GLY bajo', color: CATS.pe.color },
    ns: { label: 'Capacidad sin programar', short: 'SIN PROGRAMAR', pattern: 'LEF y GLY altos, OSE bajo', color: CATS.ns.color },
  };

  const DIAG_WHY = {
    ok: 'Las tres métricas quedaron altas: casi no hubo pérdidas. Lo que toca es estandarizar lo que funcionó.',
    int: 'El LEF ya cae, y al bajar el EPT arrastra al GLY y al OSE: la gran pérdida está dentro de la línea.',
    pe: 'El LEF está alto pero el GLY cae: la brecha LEF–GLY son paradas planificadas o causas externas, que el LEF excluye.',
    ns: 'LEF y GLY están altos y solo cae el OSE: la brecha GLY–OSE es tiempo que la línea no se programó.',
  };

  // Turnos de ejemplo (12 h) para la ayuda.
  const EXAMPLES = [
    { name: 'Turno A', int: 0.2, pe: 0.5, ns: 0, diag: 'Operación excelente' },
    { name: 'Turno B', int: 2.0, pe: 0.5, ns: 0, diag: 'Problema interno' },
    { name: 'Turno C', int: 0.2, pe: 2.5, ns: 0, diag: 'Planificada / externa' },
    { name: 'Turno D', int: 0.2, pe: 0.5, ns: 3.0, diag: 'Capacidad sin programar' },
  ];

  // Horas de cada tipo hasta `upTo` y los tres KPIs (null si su denominador es ~0).
  function kpis(losses, upTo = HOURS) {
    const sum = { int: 0, pe: 0, ns: 0 };
    for (const l of losses) {
      if (l.def.noHours || !(l.def.cat in sum)) continue;
      const a = Math.max(0, Math.min(upTo, l.start));
      const b = Math.max(0, Math.min(upTo, l.start + l.hours));
      sum[l.def.cat] += Math.max(0, b - a);
    }
    const total = upTo;
    const programmed = total - sum.ns;
    const let_ = programmed - sum.pe;
    const ept = Math.max(0, let_ - sum.int);
    const ratio = (d) => (d > 0.05 ? ept / d : null);
    return { lef: ratio(let_), gly: ratio(programmed), ose: ratio(total), ept, let: let_, programmed, total, ...sum };
  }

  // Brechas en puntos: lo que cada KPI detecta primero.
  function gaps(k) {
    const lef = k.lef ?? 1;
    const gly = k.gly ?? lef;
    const ose = k.ose ?? gly;
    return { int: 1 - lef, pe: Math.max(0, lef - gly), ns: Math.max(0, gly - ose) };
  }

  // Diagnóstico correcto de un turno: la brecha más grande, si es de al menos 8 puntos.
  function diagnose(k) {
    const g = gaps(k);
    const top = Object.entries(g).sort((a, b) => b[1] - a[1])[0];
    return top[1] >= 0.08 ? top[0] : 'ok';
  }

  function pct(x) {
    return x == null ? '—' : (x * 100).toFixed(1).replace('.', ',') + ' %';
  }

  PF.KPI = { HOURS, CATS, KPIS, OWNERS, LOSSES, TRAPS, DIAG, DIAG_WHY, EXAMPLES, kpis, gaps, diagnose, pct };
})();
