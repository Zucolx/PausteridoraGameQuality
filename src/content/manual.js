// Contenido didáctico de los juegos (químicos, TACT, protocolos de paro, riesgos, fichas).
// Todo el texto técnico vive aquí para revisarlo con el manual de la planta sin tocar la lógica.
// Lo marcado con "VERIFICAR" es un valor razonable de referencia que no venía en el
// material original: confírmalo con el CIP Master Plan antes de usar el juego en formación.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  // ------------------------------------------------------------ Químicos
  const CHEMICALS = {
    soda: { name: 'Soda cáustica', brand: 'Bevrosheen', kind: 'Alcalino', color: '#4aa3ff' },
    nitrico: { name: 'Ácido nítrico', brand: '', kind: 'Ácido', color: '#ffcf3a' },
    peracetico: { name: 'Ácido peracético', brand: '', kind: 'Sanitizante', color: '#b06bff' },
    agua: { name: 'Agua caliente', brand: '', kind: 'Sanitización térmica', color: '#ff6b4a' },
  };

  // TACT: Tiempo, Acción, Concentración y Temperatura.
  const TACT_PARAMS = [
    { key: 'time', label: 'Tiempo', unit: 'min', min: 0, max: 40, step: 5, start: 10, decimals: 0 },
    { key: 'action', label: 'Acción', unit: 'm/s', min: 0, max: 3, step: 0.5, start: 0.5, decimals: 1, note: 'velocidad del flujo' },
    { key: 'conc', label: 'Concentración', unit: '%', min: 0, max: 4, step: 0.1, start: 0.5, decimals: 1 },
    { key: 'temp', label: 'Temperatura', unit: '°C', min: 10, max: 95, step: 5, start: 40, decimals: 0 },
  ];

  const CLEANINGS = {
    // Alcalina: 85 °C y 2,0 % vienen del material original. Tiempo y acción: VERIFICAR.
    alcalina: { label: 'Limpieza ALCALINA', chemical: 'soda', tact: { time: 20, action: 1.5, conc: 2.0, temp: 85 } },
    // Ácida: todos los parámetros son de referencia. VERIFICAR.
    acida: { label: 'Limpieza ÁCIDA', chemical: 'nitrico', tact: { time: 15, action: 1.5, conc: 1.0, temp: 60 } },
    // Sanitización térmica: 85 °C viene del material original. Tiempo y acción: VERIFICAR.
    sanitizacion: { label: 'SANITIZACIÓN con agua caliente', chemical: 'agua', tact: { time: 20, action: 1.5, conc: 0, temp: 85 } },
    // Sanitización química con peracético: parámetros de referencia. VERIFICAR.
    peracetico: { label: 'SANITIZACIÓN química', chemical: 'peracetico', tact: { time: 10, action: 1.5, conc: 0.2, temp: 20 } },
  };

  // Órdenes de limpieza de "CIP Rush". La primera siempre es la del ejemplo del material.
  const CIP_ORDERS = [
    { stop: 'Parada de 6 a 52 horas', program: 'CIP Intermedio', cleaning: 'alcalina' },
    { stop: 'Sarro en el tazón de la llenadora', program: 'CIP fase ácida', cleaning: 'acida' }, // VERIFICAR
    { stop: 'Cierre del CIP', program: 'Sanitización final', cleaning: 'sanitizacion' },
    { stop: 'Arranque tras mantenimiento', program: 'Sanitización química', cleaning: 'peracetico', hard: true }, // VERIFICAR
  ];

  const ATP_LIMIT = 50; // URL (unidades relativas de luz)

  function fmtNum(v, decimals) {
    return v.toFixed(decimals).replace('.', ',');
  }

  function chemLabel(id) {
    const c = CHEMICALS[id];
    return c.brand ? `${c.name} (${c.brand})` : c.name;
  }

  function chemicalError(cleaningKey, wrongId) {
    const cl = CLEANINGS[cleaningKey];
    if (cl.chemical === 'agua') return `Esta sanitización es térmica: se hace con agua caliente a 85 °C, no con ${CHEMICALS[wrongId].name.toLowerCase()}.`;
    return `La ${cl.label.toLowerCase()} se hace con ${chemLabel(cl.chemical)}, no con ${CHEMICALS[wrongId].name.toLowerCase()}.`;
  }

  // Explica el primer parámetro TACT incorrecto, o null si todo está bien.
  function tactError(cleaningKey, values) {
    const cl = CLEANINGS[cleaningKey];
    const chem = CHEMICALS[cl.chemical].name.toLowerCase();
    for (const p of TACT_PARAMS) {
      const want = cl.tact[p.key];
      const got = values[p.key];
      if (Math.abs(got - want) < 1e-6) continue;
      const w = `${fmtNum(want, p.decimals)} ${p.unit}`;
      const low = got < want;
      switch (p.key) {
        case 'temp':
          if (cleaningKey === 'sanitizacion' && low) return 'El agua caliente para sanitizar debe estar a 85 °C. ¡Las bacterias sobrevivieron!';
          if (cleaningKey === 'alcalina' && low) return 'La limpieza alcalina va a 85 °C: en frío la soda no despega la suciedad orgánica.';
          if (cleaningKey === 'peracetico' && !low) return 'El peracético se usa a temperatura ambiente (20 °C): el calor lo degrada.';
          return low ? `Temperatura baja: para la ${cl.label.toLowerCase()} el CIP Master Plan pide ${w}.` : `Demasiado caliente: ${w} es lo indicado. Más temperatura gasta energía y castiga las juntas.`;
        case 'conc':
          if (want === 0) return 'La sanitización con agua caliente no lleva químico: concentración 0 %.';
          return low ? `Concentración baja: la ${chem} va al ${w}. Con menos, la suciedad se queda.` : `Concentración alta: ${w} es suficiente. Más químico es desperdicio y riesgo de residuos.`;
        case 'time':
          return low ? `Tiempo de contacto corto: la ${chem} necesita ${w} para actuar.` : `Con ${w} basta. Alargar el CIP retrasa la producción.`;
        case 'action':
          return low ? `Sin acción mecánica no hay arrastre: el flujo debe ir a ${w}.` : `Caudal excesivo: ${w} es lo indicado.`;
      }
    }
    return null;
  }

  // -------------------------------------------- Plan de reacción frente a paradas
  const STOP_STEPS = {
    vaciado: { label: 'Vaciado de tazón', short: 'Vaciar tazón', station: 'tazon', time: 1.2 },
    interna: { label: 'Limpieza interna mínima (agua caliente)', short: 'Interna mínima', station: 'agua', time: 1.5 },
    externa: { label: 'Limpieza externa mínima', short: 'Externa mínima', station: 'externa', time: 1.2 },
    cipIntermedio: { label: 'CIP Intermedio', short: 'CIP Intermedio', station: 'cip', time: 3.5 },
    cipCompleto: { label: 'CIP Completo', short: 'CIP Completo', station: 'cip', time: 6 },
  };

  const STOP_RULES = [
    // "Paros de 60 min a 6 h" del diagrama de la página 17.
    { id: 'corto', range: '60 min a 6 h', steps: ['vaciado', 'interna', 'externa'], hours: [1.5, 2, 3, 4, 5] },
    // "Parada de 6 a 52 horas: requiere CIP Intermedio".
    { id: 'medio', range: '6 a 52 h', steps: ['cipIntermedio'], hours: [8, 12, 18, 24, 36, 48] },
    // Más de 52 h → CIP Completo. VERIFICAR con el diagrama.
    { id: 'largo', range: 'más de 52 h', steps: ['cipCompleto'], hours: [60, 72, 96] },
  ];

  function stopRuleFor(hours) {
    return hours < 6 ? STOP_RULES[0] : hours <= 52 ? STOP_RULES[1] : STOP_RULES[2];
  }

  function hoursLabel(h) {
    if (h < 1) return `${Math.round(h * 60)} minutos`;
    if (h === 1) return '1 hora';
    return `${fmtNum(h, h % 1 ? 1 : 0)} horas`;
  }

  function stopStepError(rule, stepId) {
    const need = rule.steps.map((s) => STOP_STEPS[s].label).join(' + ');
    if (stepId === 'cipCompleto' && rule.id !== 'largo') return `Un CIP Completo para un paro de ${rule.range} retrasa la producción sin necesidad. Toca: ${need}.`;
    if (stepId === 'cipIntermedio' && rule.id === 'corto') return `Para un paro de ${rule.range} no hace falta un CIP: basta ${need}.`;
    if (stepId === 'cipIntermedio' && rule.id === 'largo') return `Más de 52 h parada: un CIP Intermedio se queda corto. Toca CIP Completo.`;
    return `${STOP_STEPS[stepId].label} no es el protocolo para un paro de ${rule.range}. Toca: ${need}.`;
  }

  function contaminationMessage(rule, missing) {
    return `Arrancaste sin completar el protocolo de ${rule.range}. Faltó: ${missing.map((s) => STOP_STEPS[s].short).join(', ')}. ¡Cerveza contaminada!`;
  }

  const SABOTAGE = [
    'El jefe de turno quiere arrancar YA',
    'La producción está esperando',
    'Llevamos 10 minutos de retraso…',
    '"Arranca y luego limpiamos"',
    'Mantenimiento ya terminó, ¿qué esperas?',
    'Logística pregunta por el lote',
  ];

  // ---------------------------------------------------- Cazador de riesgos
  const TOOLS = {
    escoba: { name: 'Escoba y pala', tag: 'COP', color: '#d0a55c', use: 'Retiro en seco de sólidos' },
    espuma: { name: 'Espuma cáustica', tag: 'Topax 66', color: '#4aa3ff', use: 'Suciedad orgánica' },
    peracetico: { name: 'Ácido peracético', tag: 'Sanitizante', color: '#b06bff', use: 'Microorganismos' },
    desincrustante: { name: 'Desincrustante ácido', tag: 'Ácido', color: '#ffcf3a', use: 'Sarro mineral' }, // VERIFICAR producto
  };
  const TOOL_ORDER = ['escoba', 'espuma', 'peracetico', 'desincrustante'];

  const HAZARDS = {
    vidrio: { name: 'Vidrio roto', where: 'estrella de salida', tool: 'escoba', color: '#bfe8ff', error: 'El vidrio no se lava ni se sanitiza: se retira en seco con escoba y pala (COP).' },
    sarro: { name: 'Válvula con sarro', where: 'válvula', tool: 'desincrustante', color: '#e8e0c8', error: 'El sarro es mineral: la soda no lo disuelve. Necesita un desincrustante ácido.' },
    levadura: { name: 'Levadura seca', where: 'guía', tool: 'espuma', color: '#ffd36b', error: 'La levadura seca es suciedad orgánica: se ataca con espuma cáustica (Topax 66).' },
    biofilm: { name: 'Biofilm', where: 'tubo', tool: 'peracetico', color: '#9dff5c', error: 'El biofilm es microbiológico: se trata con sanitizante (ácido peracético).' },
  };

  // Fichas "Sabías que". Las marcadas VERIFICAR son buenas prácticas generales.
  const FACTS = {
    general: [
      'Las llenadoras con presión positiva se limpian externamente cada 8 horas.',
      'Recorrido de 5 minutos: encuentren 1 condición de riesgo de higiene en su área.',
      'Lo que no se ve, también se limpia: el ATP mide suciedad orgánica invisible.',
    ],
    vidrio: ['Ante un vidrio roto se retira en seco antes de mojar: el agua dispersa los fragmentos.'], // VERIFICAR
    sarro: ['El sarro (piedra de cerveza) protege a las bacterias: se elimina con limpieza ácida.'], // VERIFICAR
    levadura: ['La espuma cáustica se adhiere a superficies verticales y alarga el tiempo de contacto.'], // VERIFICAR
    biofilm: ['El biofilm es una capa de microorganismos pegada a la superficie: primero se limpia, después se sanitiza.'], // VERIFICAR
  };

  // Herramientas del afiche convertidas en inventario.
  const INVENTORY = [
    { id: 'luminometro', name: 'Luminómetro', point: 6 },
    { id: 'masterplan', name: 'CIP Master Plan', point: 4 },
    { id: 'tarjeta', name: 'Tarjeta de verificación', point: 8 },
  ];

  PF.Manual = {
    CHEMICALS,
    TACT_PARAMS,
    CLEANINGS,
    CIP_ORDERS,
    ATP_LIMIT,
    chemLabel,
    chemicalError,
    tactError,
    STOP_STEPS,
    STOP_RULES,
    stopRuleFor,
    hoursLabel,
    stopStepError,
    contaminationMessage,
    SABOTAGE,
    TOOLS,
    TOOL_ORDER,
    HAZARDS,
    FACTS,
    INVENTORY,
    fmtNum,
  };
})();
