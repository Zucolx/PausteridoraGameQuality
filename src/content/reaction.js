// Guía Rápida de Reacción: situaciones de emergencia, ítems (los puntos que se
// conectan) y la ruta correcta de cada situación, en orden.
// Los ID (COM, DEL…) son solo referencia interna: en pantalla siempre va el texto completo.
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  const SITUATIONS = {
    S1: { id: 'S1', name: 'Derrame de sustancia química', color: '#9ad14b', icon: 'spill' },
    S2: { id: 'S2', name: 'Contacto con sustancia química', color: '#4fb8ff', icon: 'contact' },
    S3: { id: 'S3', name: 'Conato de incendio', color: '#ff6a3d', icon: 'fire' },
    S4: { id: 'S4', name: 'Emergencia (sismo / incidente mayor)', color: '#ffd23f', icon: 'quake' },
  };

  // text: rótulo completo del punto. info: qué se hace en ese paso (se muestra al conectarlo).
  const ITEMS = {
    COM: {
      text: 'Comunicación (dar aviso)',
      info: 'Lo primero siempre es comunicar: da aviso de inmediato e informa qué pasó, dónde y si hay personas afectadas.',
      icon: 'megaphone',
    },
    DEL: {
      text: 'Delimitación (conos / barreras)',
      info: 'Aísla la zona con conos o barreras para que nadie pise el derrame ni se acerque.',
      icon: 'cone',
    },
    EPP: {
      text: 'EPP’s (traje, guantes, protección respiratoria)',
      info: 'Antes de acercarte al derrame, ponte el traje, los guantes y la protección respiratoria.',
      icon: 'suit',
    },
    KIT: {
      text: 'Uso de kit antiderrames',
      info: 'Con el kit antiderrames contienes y absorbes la sustancia, y recoges los residuos en su bolsa.',
      icon: 'kit',
    },
    LAV: {
      text: 'Lavaojos (mín. 15 min)',
      info: 'Si la sustancia tocó los ojos: lavaojos durante al menos 15 minutos, con los párpados abiertos.',
      icon: 'eyewash',
    },
    DUC: {
      text: 'Ducha de emergencia (mín. 15 min)',
      info: 'Si tocó la piel o la ropa: ducha de emergencia durante al menos 15 minutos.',
      icon: 'shower',
    },
    MSDS: {
      text: 'Hoja de seguridad MSDS',
      info: 'La hoja de seguridad MSDS de la sustancia dice sus riesgos y los primeros auxilios: tenla a mano para la atención.',
      icon: 'msds',
    },
    ALA: {
      text: 'Pulsador de alarma “FIRE”',
      info: 'Activa el pulsador de alarma “FIRE” para alertar a toda la planta.',
      icon: 'pull',
    },
    EXT: {
      text: 'Extintor (técnica PASS)',
      info: 'Extintor con la técnica PASS: tira del pasador, apunta a la base del fuego, aprieta la manija y barre de lado a lado.',
      icon: 'extinguisher',
    },
    GAB: {
      text: 'Gabinete / manguera contra incendio',
      info: 'Si el extintor no basta, se usa el gabinete con la manguera contra incendio.',
      icon: 'hose',
    },
    DET: {
      text: 'Detector de humo',
      info: 'El detector de humo es parte del equipo contra incendio, pero detecta por sí solo: no es un paso que tú ejecutes.',
      icon: 'detector',
    },
    SIR: {
      text: 'Alarma / sirena de evacuación',
      info: 'La alarma o sirena de evacuación avisa a todos que hay que salir: deja lo que haces de forma segura.',
      icon: 'siren',
    },
    SAL: {
      text: 'Salida de emergencia (ruta señalizada)',
      info: 'Evacúa por la salida de emergencia siguiendo la ruta señalizada.',
      icon: 'exit',
    },
    PTO: {
      text: 'Punto de encuentro (conteo de personal)',
      info: 'En el punto de encuentro se hace el conteo de personal: quédate ahí hasta que te cuenten.',
      icon: 'meeting',
    },
    SOP260: {
      text: 'ACADIA QUI-ENV-SOP-260',
      info: 'El procedimiento de derrame de sustancia química está en ACADIA: QUI-ENV-SOP-260.',
      icon: 'sop',
    },
    SOP092: {
      text: 'ACADIA QUI-SEG-SOP-0092',
      info: 'El procedimiento de conato de incendio está en ACADIA: QUI-SEG-SOP-0092.',
      icon: 'sop',
    },
    SOP085: {
      text: 'ACADIA QUI-SEG-SOP-0085',
      info: 'El procedimiento de emergencia está en ACADIA: QUI-SEG-SOP-0085.',
      icon: 'sop',
    },
  };

  const ROUTES = {
    S1: ['COM', 'DEL', 'EPP', 'KIT', 'SOP260'],
    S2: ['COM', 'LAV', 'DUC', 'MSDS'],
    S3: ['COM', 'ALA', 'EXT', 'GAB', 'SOP092'],
    S4: ['COM', 'SIR', 'SAL', 'PTO', 'SOP085'],
  };

  // Ítems que aparecen en la guía junto a una situación pero no son un paso de su ruta.
  const EXTRAS = { S3: ['DET'] };

  // Situaciones en cuya ruta aparece un ítem.
  function situationsOf(itemId) {
    return Object.keys(ROUTES).filter((s) => ROUTES[s].includes(itemId) || (EXTRAS[s] || []).includes(itemId));
  }

  // Explicación de por qué `itemId` no va como paso `step` de la ruta de `sitId`.
  // reveal: decir cuál es el paso correcto.
  function whyWrong(sitId, step, itemId, reveal) {
    const route = ROUTES[sitId];
    const sit = SITUATIONS[sitId];
    const it = ITEMS[itemId];
    const expected = ITEMS[route[step]];
    const prev = step > 0 ? ITEMS[route[step - 1]] : null;
    const next = reveal ? (prev ? ` Después de «${prev.text}» va «${expected.text}».` : ` Se empieza por «${expected.text}».`) : '';
    if (step === 0) return `Toda ruta de reacción empieza por «${ITEMS.COM.text}»: primero se da aviso.`;
    if (itemId === 'DET') return `«${it.text}» detecta por sí solo: no es un paso de la ruta.${next}`;
    const later = route.indexOf(itemId);
    if (later > step) return `«${it.text}» sí es parte de la ruta, pero todavía no: falta ${later - step === 1 ? 'un paso' : `${later - step} pasos`} antes.${next}`;
    if (itemId.startsWith('SOP')) {
      const owner = situationsOf(itemId)[0];
      if (sitId === 'S2') return `«${sit.name}» no tiene procedimiento ACADIA en la guía: su ruta termina en «${ITEMS.MSDS.text}». «${it.text}» es de «${SITUATIONS[owner].name}».${next}`;
      return `«${it.text}» es el procedimiento de «${SITUATIONS[owner].name}», no de «${sit.name}».${next}`;
    }
    const others = situationsOf(itemId).filter((s) => s !== sitId);
    if (others.length) return `«${it.text}» es de la ruta «${SITUATIONS[others[0]].name}», no de «${sit.name}».${next}`;
    return `«${it.text}» no va en la ruta de «${sit.name}».${next}`;
  }

  PF.Reaction = { SITUATIONS, ITEMS, ROUTES, EXTRAS, situationsOf, whyWrong };
})();
