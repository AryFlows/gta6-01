// Vellora Bay — all sound is synthesised with WebAudio. No audio files ship
// with the game: engine hum, sirens, gunshots, footsteps, cash and jingles are
// oscillators and filtered noise, and the music is a tiny bassline sequencer.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicOn = false;
    this.musicTimer = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOscA = null;
    this.sirenOscB = null;
    this.sirenGain = null;
    this.step = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);
    this.startEngineLoop();
    this.startMusic();
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.now();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFreq, type) {
    if (!this.ctx) return;
    const t = this.now();
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  shot() {
    this.noiseBurst(0.16, 0.5, 2600, 'bandpass');
    this.blip(160, 0.09, 'square', 0.16, 55);
  }

  punch() {
    this.noiseBurst(0.09, 0.35, 500, 'lowpass');
  }

  click() {
    this.blip(880, 0.05, 'square', 0.08);
  }

  pickup() {
    this.blip(920, 0.1, 'sine', 0.2, 1400);
    setTimeout(() => this.blip(1380, 0.14, 'sine', 0.18), 70);
  }

  cash() {
    [660, 880, 1170].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.2), i * 85));
  }

  bad() {
    this.blip(220, 0.3, 'sawtooth', 0.16, 110);
  }

  jingle(win) {
    const seq = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    seq.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.22), i * 110));
  }

  startEngineLoop() {
    const t = this.now();
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start(t);
  }

  setEngine(running, speed01) {
    if (!this.ctx || !this.engineGain) return;
    const target = running ? 0.05 + 0.075 * speed01 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, this.now(), 0.12);
    this.engineOsc.frequency.setTargetAtTime(48 + 130 * speed01, this.now(), 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOscA) {
      const t = this.now();
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenGain.connect(this.master);
      this.sirenOscA = this.ctx.createOscillator();
      this.sirenOscA.type = 'sine';
      this.sirenOscA.frequency.value = 720;
      this.sirenOscB = this.ctx.createOscillator();
      this.sirenOscB.type = 'sine';
      this.sirenOscB.frequency.value = 960;
      const gA = this.ctx.createGain();
      gA.gain.value = 0.5;
      const gB = this.ctx.createGain();
      gB.gain.value = 0.0;
      this.sirenOscA.connect(gA);
      gA.connect(this.sirenGain);
      this.sirenOscB.connect(gB);
      gB.connect(this.sirenGain);
      this.sirenOscA.start(t);
      this.sirenOscB.start(t);
      // Two-tone wail: alternate the two oscillators every 450 ms.
      let high = false;
      this.sirenTimer = setInterval(() => {
        if (!this.ctx) return;
        high = !high;
        gA.gain.setTargetAtTime(high ? 0.0 : 0.5, this.now(), 0.05);
        gB.gain.setTargetAtTime(high ? 0.5 : 0.0, this.now(), 0.05);
      }, 450);
    } else if (!on && this.sirenOscA) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      const a = this.sirenOscA;
      const b = this.sirenOscB;
      const g = this.sirenGain;
      this.sirenOscA = null;
      this.sirenOscB = null;
      this.sirenGain = null;
      try {
        g.gain.setTargetAtTime(0, this.now(), 0.08);
        setTimeout(() => {
          try { a.stop(); b.stop(); g.disconnect(); } catch (e) { /* already stopped */ }
        }, 400);
      } catch (e) { /* already stopped */ }
    }
  }

  startMusic() {
    if (this.musicOn || !this.ctx) return;
    this.musicOn = true;
    // A laid-back sunset-drive loop: Am – F – C – G roots with a soft pulse.
    const roots = [110, 87.31, 130.81, 98];
    const bass = [55, 43.65, 65.41, 49];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const bar = Math.floor(this.step / 8) % 4;
      const beat = this.step % 8;
      if (beat === 0 || beat === 4) this.blip(bass[bar], 0.5, 'triangle', 0.11);
      if (beat === 2 || beat === 6) this.blip(roots[bar] * 2, 0.22, 'sine', 0.05);
      if (beat === 7) this.blip(roots[(bar + 1) % 4] * 3, 0.18, 'sine', 0.035);
      this.step++;
    }, 240);
  }
}
