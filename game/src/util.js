// Vellora Bay — small shared helpers.
// Every system in the game imports from here: deterministic randomness so the
// city looks the same on every load, a few math helpers, and the canvas-texture
// painter used for building facades, road markings and signs.
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(a, b, lambda, dt) {
  // Frame-rate independent exponential approach (lambda ~ how snappy).
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleDamp(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}

// Deterministic PRNG (mulberry32). One seed drives the whole city layout, so a
// screenshot staged from a query string always shows the same streets.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function rangeInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function chance(rng, p) {
  return rng() < p;
}

// Paint on an offscreen canvas and hand back a THREE CanvasTexture. The game
// ships no image files at all — every facade, sign and road marking is drawn.
export function paintTexture(THREE, w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function money(n) {
  const v = Math.max(0, Math.round(n));
  return '$' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Turn a heading (radians, 0 = -Z) into a unit forward vector.
export function forwardOf(heading) {
  return { x: -Math.sin(heading), z: -Math.cos(heading) };
}

export function headingToward(ax, az, bx, bz) {
  return Math.atan2(-(bx - ax), -(bz - az));
}
