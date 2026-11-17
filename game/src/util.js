// util.js — small math and world helpers shared by every Solmar system.
// No imports. Everything here is pure and deterministic where it matters.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

export function randInt(lo, hi) {
  return Math.floor(rand(lo, hi + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Wrap an angle to (-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// Shortest signed turn from angle `from` toward angle `to`.
export function angleDelta(from, to) {
  return wrapAngle(to - from);
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Axis-aligned box used for buildings and walls. {minX, maxX, minZ, maxZ}
export function makeBox(cx, cz, halfW, halfD) {
  return { minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfD, maxZ: cz + halfD };
}

// Push a circle (x, z, radius) out of an AABB. Returns true when a push happened.
export function resolveCircleBox(x, z, r, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    return { x: x + dx * push, z: z + dz * push };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const px = Math.min(x - box.minX, box.maxX - x);
  const pz = Math.min(z - box.minZ, box.maxZ - z);
  if (px < pz) return { x: x < (box.minX + box.maxX) / 2 ? box.minX - r : box.maxX + r, z };
  return { x, z: z < (box.minZ + box.maxZ) / 2 ? box.minZ - r : box.maxZ + r };
}

// Format dollars with commas, e.g. 2500 -> "$2,500".
export function money(n) {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Format a countdown as M:SS.
export function clockText(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Ease a value in [0,1] with a smooth S curve.
export function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// Heading (radians, 0 = +Z, turning toward +X) from a movement vector.
export function headingOf(dx, dz) {
  return Math.atan2(dx, dz);
}

export function pointInBox(x, z, box, pad) {
  const p = pad || 0;
  return x >= box.minX - p && x <= box.maxX + p && z >= box.minZ - p && z <= box.maxZ + p;
}

// Move `value` toward `target` by at most `step`; returns the new value.
export function approach(value, target, step) {
  if (value < target) return Math.min(value + step, target);
  if (value > target) return Math.max(value - step, target);
  return value;
}
