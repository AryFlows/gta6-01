// Vellora Bay — cars. Five types share one arcade chassis: a low-poly body
// built from boxes, spinning wheels that steer at the front, body roll in
// corners and a handbrake that lets the tail step out.
import { clamp, damp, lerp } from './util.js';
import { resolveCollision } from './city.js';

export const CAR_TYPES = {
  sedan: { label: 'Vellora Sedan', color: '#7a8a99', top: 26, accel: 15, grip: 1.0, len: 4.4, wid: 1.9, h: 1.35 },
  taxi: { label: 'Bay Taxi', color: '#e8b92a', top: 25, accel: 14, grip: 1.0, len: 4.4, wid: 1.9, h: 1.35 },
  sports: { label: 'Comet GT', color: '#c22e4a', top: 38, accel: 22, grip: 1.15, len: 4.6, wid: 2.0, h: 1.1 },
  van: { label: 'Mover Van', color: '#5a7a8c', top: 21, accel: 11, grip: 0.9, len: 5.2, wid: 2.1, h: 2.0 },
  police: { label: 'VBPD Cruiser', color: '#20242c', top: 31, accel: 19, grip: 1.1, len: 4.5, wid: 1.95, h: 1.4 },
};

let carUid = 0;

export function makeCarMesh(THREE, type) {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.35, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#0e1a24', roughness: 0.15, metalness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#c8ccd2', roughness: 0.25, metalness: 0.9 });
  const L = spec.len;
  const W = spec.wid;
  const H = spec.h;
  // Lower body + cabin. Sports cars sit low and long; vans are tall boxes.
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.55, L), paint);
  body.position.y = 0.55 + H * 0.27;
  body.castShadow = true;
  g.add(body);
  const cabinH = type === 'van' ? H * 0.55 : H * 0.42;
  const cabinL = type === 'van' ? L * 0.82 : L * 0.5;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, cabinH, cabinL), type === 'van' ? paint : glass);
  cabin.position.set(0, 0.55 + H * 0.55 + cabinH / 2 - 0.08, type === 'van' ? 0 : -L * 0.04);
  cabin.castShadow = true;
  g.add(cabin);
  if (type !== 'van') {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.08, cabinL * 0.9), paint);
    roof.position.set(0, cabin.position.y + cabinH / 2 + 0.02, cabin.position.z);
    g.add(roof);
  }
  // Bumpers, grille, lights.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.22, 0.3), dark);
  bumperF.position.set(0, 0.42, -L / 2 - 0.05);
  g.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = L / 2 + 0.05;
  g.add(bumperR);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#ffe9a8', emissive: '#ffdf8a', emissiveIntensity: 0.9 });
  for (const s of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), lampMat);
    lamp.position.set(s * (W / 2 - 0.32), 0.95, -L / 2 - 0.14);
    g.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), new THREE.MeshStandardMaterial({ color: '#a01818', emissive: '#c02020', emissiveIntensity: 0.7 }));
    tail.position.set(s * (W / 2 - 0.32), 0.95, L / 2 + 0.14);
    g.add(tail);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.4), new THREE.MeshStandardMaterial({ color: '#f5d020', emissive: '#e8b92a', emissiveIntensity: 0.5 }));
    sign.position.set(0, cabin.position.y + cabinH / 2 + 0.18, 0);
    g.add(sign);
  }
  if (type === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.3, L * 0.7), new THREE.MeshStandardMaterial({ color: '#e8e8e8', roughness: 0.4, metalness: 0.4 }));
    stripe.position.set(0, 0.85, 0);
    g.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: '#20242c' }));
    bar.position.set(0, cabin.position.y + cabinH / 2 + 0.12, 0);
    g.add(bar);
    for (const [s, col] of [[-0.3, '#ff2020'], [0.3, '#2040ff']]) {
      const dome = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.34), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6 }));
      dome.position.set(s, cabin.position.y + cabinH / 2 + 0.3, 0);
      g.add(dome);
    }
  }
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.07, 0.5), dark);
    spoiler.position.set(0, 1.15, L / 2 - 0.3);
    g.add(spoiler);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, L * 0.96), chrome);
    stripe.position.set(0, 0.55 + H * 0.55 + 0.02, 0);
    g.add(stripe);
  }
  // Wheels: steer the front pair, spin all four.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const steerPivots = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (W / 2 - 0.05), 0.36, sz * (L / 2 - 0.75));
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8), chrome);
    hub.geometry.rotateZ(Math.PI / 2);
    wheel.add(hub);
    pivot.add(wheel);
    g.add(pivot);
    wheels.push(wheel);
    if (sz < 0) steerPivots.push(pivot);
  }
  return { group: g, body, wheels, steerPivots };
}

export class DriveCar {
  constructor(S, type, x, z, heading) {
    this.S = S;
    this.id = ++carUid;
    this.type = type;
    this.spec = CAR_TYPES[type] || CAR_TYPES.sedan;
    this.label = this.spec.label;
    this.x = x;
    this.z = z;
    this.heading = heading || 0;
    this.speed = 0; // signed, m/s; forward is negative heading direction
    this.steer = 0;
    this.driver = null; // 'player' | 'ai' | null (parked)
    this.parked = true;
    this.spin = 0;
    this.stuckTimer = 0;
    const built = makeCarMesh(S.THREE, type);
    this.mesh = built.group;
    this.mesh.userData.car = this; // lets the combat raycast name the car it hit
    this.bodyMesh = built.body;
    this.wheels = built.wheels;
    this.steerPivots = built.steerPivots;
    S.scene.add(this.mesh);
    this.syncMesh();
  }

  get kmh() {
    return Math.abs(this.speed) * 3.6;
  }

  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // Arcade step. input: {up, down, left, right, hand} each boolean.
  drive(dt, input) {
    const spec = this.spec;
    const up = !!input.up;
    const down = !!input.down;
    const hand = !!input.hand;
    if (up) this.speed += spec.accel * dt * (this.speed < 0 ? 2.2 : 1);
    if (down) {
      if (this.speed > 0.5) this.speed -= spec.accel * 1.6 * dt;
      else this.speed -= spec.accel * 0.7 * dt;
    }
    if (!up && !down) this.speed = damp(this.speed, 0, 1.6, dt);
    if (hand) this.speed = damp(this.speed, 0, 2.2, dt);
    this.speed = clamp(this.speed, -spec.top * 0.45, spec.top);
    const steerTarget = (input.left ? 1 : 0) + (input.right ? -1 : 0);
    const steerRate = hand ? 5.5 : 4.2;
    this.steer = damp(this.steer, steerTarget * 0.55, steerRate, dt);
    const grip = hand ? 0.55 : spec.grip;
    const turn = this.steer * clamp(Math.abs(this.speed) / 9, 0, 1) * (this.speed >= 0 ? 1 : -1) * grip;
    this.heading += turn * dt * 1.9;
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);
    const nx = this.x + fx * this.speed * dt;
    const nz = this.z + fz * this.speed * dt;
    const probe = { x: nx, z: nz };
    const hitWall = resolveCollision(this.S.city, probe, Math.max(this.spec.len, this.spec.wid) / 2 - 0.3);
    if (hitWall) {
      // Scrape: keep a little speed, nudge the nose away from the wall.
      this.speed *= 0.55;
      if (this.driver === 'player' && Math.abs(this.speed) > 6) this.S.police.addHeat(0.15, 'hit a wall');
    }
    this.x = clamp(probe.x, -this.S.city.bound, 192);
    this.z = clamp(probe.z, -this.S.city.bound, 176);
    // Body roll + pitch, wheels spin and steer.
    const roll = -this.steer * clamp(Math.abs(this.speed) / spec.top, 0, 1) * (hand ? 1.5 : 1) * 0.09;
    this.mesh.rotation.z = damp(this.mesh.rotation.z, roll, 8, dt);
    this.mesh.rotation.x = damp(this.mesh.rotation.x, clamp(-this.speed * 0.0012, -0.03, 0.03), 6, dt);
    this.spin += this.speed * dt * 2.4;
    for (const w of this.wheels) w.rotation.x = this.spin;
    for (const p of this.steerPivots) p.rotation.y = this.steer * 0.9;
    this.syncMesh();
    if (Math.abs(this.speed) < 0.4) this.stuckTimer += dt;
    else this.stuckTimer = 0;
  }

  // Simple circle push between two cars; returns true on contact.
  bump(other) {
    const dx = other.x - this.x;
    const dz = other.z - this.z;
    const d = Math.hypot(dx, dz);
    const min = 2.6;
    if (d >= min || d < 0.001) return false;
    const push = (min - d) / 2;
    const nx = dx / d;
    const nz = dz / d;
    this.x -= nx * push;
    this.z -= nz * push;
    other.x += nx * push;
    other.z += nz * push;
    const exchange = (this.speed - other.speed) * 0.35;
    this.speed -= exchange;
    other.speed += exchange;
    return true;
  }

  dispose() {
    this.S.scene.remove(this.mesh);
  }
}
