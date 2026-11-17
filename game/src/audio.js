// audio.js — every sound in Solmar is synthesized live with WebAudio.
// No audio files exist: engine hum, sirens, gunshots, chimes and the
// background groove are all oscillators and filtered noise, built here.

import { clamp } from './util.js';

class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicOn = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  // Must be called from a user gesture at least once; safe to call again.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.startEngineLoop();
      this.startMusic();
      return true;
    } catch (e) {
      this.ctx = null;
      return false;
    }
  }

  get ready() {
    return !!this.ctx;
  }

  // Continuous engine drone whose pitch follows the driven car's speed.
  startEngineLoop() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + 0.11 * clamp(speedNorm, 0, 1) : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + 130 * clamp(speedNorm, 0, 1), t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(300 + 1400 * clamp(speedNorm, 0, 1), t, 0.1);
  }

  // Two-tone police siren while any wanted level is active.
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const ctx = this.ctx;
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      let high = false;
      this.sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        high = !high;
        this.sirenOsc.frequency.setTargetAtTime(high ? 950 : 720, ctx.currentTime, 0.05);
      }, 420);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      try { this.sirenOsc.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }

  // Short one-shot helpers below. Each builds its nodes, plays, and lets
  // them garbage-collect; nothing here keeps a reference after playing.

  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  gunshot() { this.noiseBurst(0.16, 0.5, 900); this.blip(140, 0.1, 'square', 0.25); }
  punch() { this.noiseBurst(0.09, 0.35, 500); }
  pickup() { this.blip(880, 0.12, 'sine', 0.25); this.blip(1320, 0.18, 'sine', 0.2); }
  carDoor() { this.noiseBurst(0.08, 0.25, 700); }
  crash() { this.noiseBurst(0.35, 0.5, 420); }
  denied() { this.blip(160, 0.2, 'square', 0.18); }
  missionDone() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.28, 'triangle', 0.25), i * 110));
  }

  // Laid-back sunset groove: a four-chord pad loop with a soft bass line.
  // Chords are A minor, F major, C major, G major — a warm coastal loop.
  startMusic() {
    if (this.musicTimer) return;
    const chords = [
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [196.0, 246.9, 293.7],
      [130.8, 196.0, 246.9],
    ];
    const bass = [55.0, 43.65, 65.41, 49.0];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const step = this.musicStep % 4;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + 0.05;
      chords[step].forEach((f) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0, t0);
        g.gain.linearRampToValueAtTime(0.035, t0 + 0.4);
        g.gain.setValueAtTime(0.035, t0 + 1.6);
        g.gain.linearRampToValueAtTime(0.0, t0 + 2.1);
        o.connect(g);
        g.connect(this.master);
        o.start(t0);
        o.stop(t0 + 2.2);
      });
      const b = ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = bass[step];
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.09, t0);
      bg.gain.linearRampToValueAtTime(0.0, t0 + 1.9);
      b.connect(bg);
      bg.connect(this.master);
      b.start(t0);
      b.stop(t0 + 2.0);
      this.musicStep++;
    }, 2000);
  }
}

export const audio = new AudioSys();
