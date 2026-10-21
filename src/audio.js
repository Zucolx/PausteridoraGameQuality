// Efectos de sonido sintetizados con WebAudio (sin archivos externos).
(function () {
  'use strict';
  const PF = globalThis.PF || (globalThis.PF = {});

  let ctx = null;
  let master = null;
  let muted = false;
  let siren = null;
  let lastTick = 0;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }

  function tone({ freq = 440, to = null, type = 'square', dur = 0.12, vol = 0.15, delay = 0 }) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const sfx = {
    alarm() {
      tone({ freq: 880, dur: 0.1, vol: 0.12 });
      tone({ freq: 660, dur: 0.12, vol: 0.12, delay: 0.12 });
    },
    discardStart() {
      tone({ freq: 220, to: 140, type: 'sawtooth', dur: 0.25, vol: 0.1 });
    },
    resolved() {
      tone({ freq: 523, type: 'triangle', dur: 0.1, vol: 0.18 });
      tone({ freq: 784, type: 'triangle', dur: 0.16, vol: 0.18, delay: 0.08 });
    },
    blip() {
      tone({ freq: 1040, type: 'triangle', dur: 0.06, vol: 0.12 });
    },
    error() {
      tone({ freq: 160, type: 'square', dur: 0.18, vol: 0.12 });
    },
    // Burbuja "¡Esto no va así!": dos notas descendentes tipo "uh-oh".
    oops() {
      tone({ freq: 420, type: 'triangle', dur: 0.14, vol: 0.16 });
      tone({ freq: 300, type: 'triangle', dur: 0.22, vol: 0.16, delay: 0.15 });
    },
    enter() {
      tone({ freq: 340, type: 'triangle', dur: 0.06, vol: 0.1 });
    },
    denied() {
      tone({ freq: 120, type: 'sawtooth', dur: 0.2, vol: 0.12 });
    },
    blocked() {
      tone({ freq: 90, to: 60, type: 'sawtooth', dur: 0.35, vol: 0.14 });
    },
    lineStop() {
      tone({ freq: 300, to: 60, type: 'sawtooth', dur: 0.8, vol: 0.18 });
    },
    end() {
      tone({ freq: 392, type: 'triangle', dur: 0.2, vol: 0.18 });
      tone({ freq: 523, type: 'triangle', dur: 0.2, vol: 0.18, delay: 0.18 });
      tone({ freq: 659, type: 'triangle', dur: 0.4, vol: 0.18, delay: 0.36 });
    },
    adjust() {
      if (!ctx || ctx.currentTime - lastTick < 0.08) return;
      lastTick = ctx.currentTime;
      tone({ freq: 1800, type: 'square', dur: 0.015, vol: 0.04 });
    },
  };

  // Sirena continua de hora pico: oscilador con LFO sobre la frecuencia.
  function setSiren(on) {
    if (!ctx) return;
    if (on && !siren) {
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 620;
      lfo.frequency.value = 1.6;
      lfoGain.gain.value = 180;
      gain.gain.value = 0.035;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.connect(gain).connect(master);
      osc.start();
      lfo.start();
      siren = { osc, lfo };
    } else if (!on && siren) {
      siren.osc.stop();
      siren.lfo.stop();
      siren = null;
    }
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }

  PF.Audio = {
    init,
    play(name) {
      if (sfx[name]) sfx[name]();
    },
    setSiren,
    setMuted,
    isMuted: () => muted,
  };
})();
