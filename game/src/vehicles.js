// vehicles.js — every car in Solmar: its look, its driving feel, and the
// steal-and-drive loop. Cars are built from boxes and cylinders so the
// whole fleet costs almost no geometry, and each type reads at a glance:
// taxi yellow, police black-and-white, sports low and red.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, rand, pick, resolveCircleBox } from './util.js';

export const CAR_TYPES = {
  sedan: { body: 0x7a8a9a, top: 22, accel: 13, max: 24 },
  taxi: { body: 0xe8c832, top: 21, accel: 12, max: 23 },
  sports: { body: 0xc83228, top: 26, accel: 19, max: 33 },
  van: { body: 0x8a7a5a, top: 17, accel: 9, max: 19 },
  police: { body: 0x1a1d22, top: 24, accel: 16, max: 29 },
};

const PAINTS = [0x7a8a9a, 0x4a6a8a, 0x8a4a4a, 0x5a7a4a, 0x9a9a9a, 0x3a3a4a, 0xc8a832];

export function makeCarMesh(type, colorOverride) {
  const spec = CAR_TYPES[type] || CAR_TYPES.sedan;
  // Each type has its own read-at-a-glance paint: taxis yellow, sports cars
  // hot red or orange, police black-and-white; sedans and vans vary.
  let color = colorOverride;
  if (color === undefined) {
    if (type === 'taxi') color = 0xe8c832;
    else if (type === 'sports') color = pick([0xc83228, 0xd86428]);
    else if (type === 'police') color = 0x1a1d22;
    else color = pick(PAINTS);
  }
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2836 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x181818 });

  const low = type === 'sports';
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, low ? 0.55 : 0.75, 4.4), bodyMat);
  body.position.y = low ? 0.55 : 0.75;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
  cabin.position.set(0, (low ? 0.85 : 1.15) + 0.3, -0.2);
  group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.9), bodyMat);
  roof.position.set(0, cabin.position.y + 0.32, -0.2);
  group.add(roof);

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.38, wz);
    group.add(wheel);
  }
  // Headlights and taillights so cars read at dusk and in the minimap's dark.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b8, emissive: 0xaa8833 });
  for (const sx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), headMat);
    head.position.set(sx, 0.75, 2.21);
    group.add(head);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.18, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xaa1818, emissive: 0x550000 })
    );
    tail.position.set(sx, 0.75, -2.21);
    group.add(tail);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    sign.position.set(0, cabin.position.y + 0.45, -0.2);
    group.add(sign);
  }
  if (type === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x223344 }));
    bar.position.set(0, cabin.position.y + 0.42, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0x880000 }));
    red.position.set(-0.3, cabin.position.y + 0.48, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.2, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2040ff, emissive: 0x000088 }));
    blue.position.set(0.3, cabin.position.y + 0.48, -0.2);
    group.add(blue);
    // White doors read as a police car from any angle.
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 1.6),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    door.position.set(0, 0.72, 0.2);
    group.add(door);
  }
  group.userData.spec = spec;
  return group;
}

// A drivable car record. `mesh` is positioned by the caller.
export function makeCar(scene, type, x, z, angle) {
  const mesh = makeCarMesh(type);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = angle;
  scene.add(mesh);
  return {
    mesh, type,
    x, z, angle,
    speed: 0,
    steer: 0,
    parked: true,
    isPolice: type === 'police',
    crashed: 0, // cooldown after a hard hit so one crash is one sound
  };
}

export function spawnParkedCars(scene, spots, count) {
  const cars = [];
  const used = new Set();
  let guard = 0;
  while (cars.length < count && guard < 400) {
    guard++;
    const i = Math.floor(Math.random() * spots.length);
    if (used.has(i)) continue;
    used.add(i);
    const s = spots[i];
    const type = Math.random() < 0.14 ? 'taxi' : Math.random() < 0.16 ? 'sports' : Math.random() < 0.12 ? 'van' : 'sedan';
    cars.push(makeCar(scene, type, s.x, s.z, s.angle));
  }
  return cars;
}

// Drive one car for one frame. `input` is {forward, back, left, right,
// handbrake}. Returns the speed in m/s. Building collision is a circle
// push-out; car-car bumps are handled by the caller (traffic/police).
export function driveCar(car, input, dt, colliders, onCrash) {
  const spec = car.mesh.userData.spec;
  const maxFwd = spec.max;
  const maxRev = 9;
  if (input.forward) car.speed += spec.accel * dt;
  else if (input.back) {
    if (car.speed > 0.5) car.speed -= 26 * dt; // brake
    else car.speed -= 8 * dt; // reverse
  } else {
    // Rolling drag and engine braking.
    car.speed -= car.speed * 0.9 * dt;
    if (Math.abs(car.speed) < 0.15) car.speed = 0;
  }
  if (input.handbrake) car.speed -= car.speed * 2.2 * dt;
  car.speed = clamp(car.speed, -maxRev, maxFwd);

  const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const steerSpeed = 2.4;
  car.steer += (steerTarget - car.steer) * Math.min(1, steerSpeed * dt * 3);
  const speedFactor = clamp(Math.abs(car.speed) / 10, 0, 1);
  const turnRate = car.steer * 1.7 * speedFactor * (car.speed >= 0 ? 1 : -1);
  car.angle += turnRate * dt;

  const nx = car.x + Math.sin(car.angle) * car.speed * dt;
  const nz = car.z + Math.cos(car.angle) * car.speed * dt;
  let hit = false;
  let px = nx;
  let pz = nz;
  for (const box of colliders) {
    const out = resolveCircleBox(px, pz, 2.1, box);
    if (out) { px = out.x; pz = out.z; hit = true; }
  }
  if (hit && Math.abs(car.speed) > 6 && car.crashed <= 0) {
    car.crashed = 0.8;
    if (onCrash) onCrash(Math.abs(car.speed));
    car.speed *= 0.35;
  }
  car.crashed = Math.max(0, car.crashed - dt);
  car.x = clamp(px, -290, 290);
  car.z = clamp(pz, -290, 330);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.angle;
  // Body roll and pitch sell the speed: lean into turns, dive on braking.
  car.mesh.rotation.z = -car.steer * 0.05 * speedFactor;
  car.mesh.rotation.x = clamp(-car.speed * 0.002, -0.05, 0.05);
  return car.speed;
}

// Find the closest parked car the player could steal, within 4 metres.
export function nearestParkedCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist || 4;
  for (const car of cars) {
    if (!car.parked) continue;
    const dx = car.x - x;
    const dz = car.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// Push two cars apart when their circles overlap; returns true on a bump.
export function bumpCars(a, b, minDist) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 0.001;
  const min = minDist || 4.2;
  if (d >= min) return false;
  const push = (min - d) / 2;
  const ux = dx / d;
  const uz = dz / d;
  a.x -= ux * push; a.z -= uz * push;
  b.x += ux * push; b.z += uz * push;
  a.mesh.position.x = a.x; a.mesh.position.z = a.z;
  b.mesh.position.x = b.x; b.mesh.position.z = b.z;
  return true;
}

// Soft bounce: exchange a little speed along the bump normal.
export function bounceCars(a, b) {
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg * 0.5;
  b.speed = avg * 0.5;
}
