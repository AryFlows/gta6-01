// traffic.js — the city breathing: cars that cruise the road grid and
// pedestrians who stroll the sidewalks, cross streets, and run when scared.
// Traffic keeps to the right side of its road and yields at random, so the
// streets feel alive instead of scripted.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, rand, pick, dist2D } from './util.js';
import { makeCar, bumpCars, bounceCars } from './vehicles.js';

const PED_SHIRTS = [0xd8a03c, 0x4a7a9a, 0x9a4a5a, 0x5a8a4a, 0x8a6a9a, 0xd8d8d8, 0x3a3a3a];

// A traffic car drives along one road line, turns at intersections onto a
// new line, and slows when something is ahead of it.
export function spawnTrafficCars(scene, roadLines, count, bounds) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const vertical = Math.random() < 0.5;
    const line = pick(roadLines);
    const along = rand(-bounds, bounds);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const type = Math.random() < 0.12 ? 'taxi' : Math.random() < 0.1 ? 'van' : 'sedan';
    const car = makeCar(scene, type, vertical ? line + 3.4 * dir : along, vertical ? along : line + 3.4 * dir,
      vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
    car.parked = false;
    car.vertical = vertical;
    car.line = line;
    car.dir = dir;
    car.cruise = rand(8, 13);
    car.speed = car.cruise;
    car.wait = 0;
    cars.push(car);
  }
  return cars;
}

export function updateTrafficCars(cars, roadLines, bounds, dt, playerCar, policeCars) {
  for (const car of cars) {
    // Slow for the car ahead on the same lane.
    let blocked = false;
    for (const other of cars) {
      if (other === car || other.vertical !== car.vertical || other.line !== car.line) continue;
      const ahead = car.vertical
        ? (other.z - car.z) * car.dir
        : (other.x - car.x) * car.dir;
      const lateral = car.vertical ? Math.abs(other.x - car.x) : Math.abs(other.z - car.z);
      if (ahead > 0 && ahead < 9 && lateral < 4) { blocked = true; break; }
    }
    if (playerCar && playerCar.x !== undefined) {
      const ahead = car.vertical
        ? (playerCar.z - car.z) * car.dir
        : (playerCar.x - car.x) * car.dir;
      const lateral = car.vertical ? Math.abs(playerCar.x - car.x) : Math.abs(playerCar.z - car.z);
      if (ahead > 0 && ahead < 10 && lateral < 4) blocked = true;
    }
    if (car.wait > 0) {
      car.wait -= dt;
      car.speed = 0;
    } else if (blocked) {
      car.speed = Math.max(0, car.speed - 14 * dt);
    } else {
      car.speed += (car.cruise - car.speed) * Math.min(1, dt);
    }
    // Advance along the current road line.
    if (car.vertical) car.z += car.dir * car.speed * dt;
    else car.x += car.dir * car.speed * dt;
    // At the grid edge or a random intersection, turn onto a new road.
    const along = car.vertical ? car.z : car.x;
    const nearLine = roadLines.some((l) => Math.abs(along - l) < 1.2);
    if (Math.abs(along) > bounds + 6 || (nearLine && Math.random() < 0.004)) {
      turnTrafficCar(car, roadLines, bounds);
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.angle;
  }
  // Soft bumps between traffic cars so they never overlap.
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      if (bumpCars(cars[i], cars[j], 4.4)) bounceCars(cars[i], cars[j]);
    }
    if (playerCar) {
      if (bumpCars(cars[i], playerCar, 4.4)) {
        bounceCars(cars[i], playerCar);
        playerCar.crashed = Math.max(playerCar.crashed, 0.3);
      }
    }
    for (const pc of policeCars || []) {
      if (bumpCars(cars[i], pc, 4.4)) bounceCars(cars[i], pc);
    }
  }
}

function turnTrafficCar(car, roadLines, bounds) {
  const wasVertical = car.vertical;
  car.vertical = !wasVertical;
  car.line = pick(roadLines);
  car.dir = Math.random() < 0.5 ? 1 : -1;
  if (car.vertical) {
    car.x = car.line + 3.4 * car.dir;
    car.z = clamp(car.z, -bounds, bounds);
    car.angle = car.dir > 0 ? 0 : Math.PI;
  } else {
    car.z = car.line + 3.4 * car.dir;
    car.x = clamp(car.x, -bounds, bounds);
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
  car.wait = Math.random() < 0.25 ? rand(1, 3) : 0;
}

// --- Pedestrians -----------------------------------------------------------

function makePedMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(PED_SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick([0xc89a72, 0x8a5a3a, 0xe8c49a, 0x6a4a2a]) });
  const pants = new THREE.MeshLambertMaterial({ color: pick([0x2a2a33, 0x4a4a55, 0x6a5a4a]) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirt);
  torso.position.y = 1.05;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.34), skin);
  head.position.y = 1.58;
  g.add(head);
  const armGeo = new THREE.BoxGeometry(0.13, 0.55, 0.13);
  const legGeo = new THREE.BoxGeometry(0.17, 0.65, 0.17);
  const mkLimb = (geo, mat, x, y, name) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -0.27;
    pivot.add(m);
    pivot.name = name;
    g.add(pivot);
    return pivot;
  };
  const armL = mkLimb(armGeo, shirt, -0.34, 1.32, 'armL');
  const armR = mkLimb(armGeo, shirt, 0.34, 1.32, 'armR');
  const legL = mkLimb(legGeo, pants, -0.14, 0.7, 'legL');
  const legR = mkLimb(legGeo, pants, 0.14, 0.7, 'legR');
  g.userData.limbs = { armL, armR, legL, legR };
  return g;
}

export function spawnPedestrians(scene, roadLines, count, bounds) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const mesh = makePedMesh();
    const x = rand(-bounds, bounds);
    const z = rand(-bounds, bounds);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    peds.push({
      mesh, x, z,
      angle: rand(0, Math.PI * 2),
      speed: rand(1.1, 2.0),
      phase: rand(0, 6),
      scared: 0,
      targetX: x, targetZ: z,
      retarget: rand(1, 5),
    });
  }
  return peds;
}

export function updatePedestrians(peds, dt, playerPos, dangerPos, colliders) {
  for (const ped of peds) {
    ped.retarget -= dt;
    // Flee from gunfire, crashes and the player's car.
    const threat = dangerPos || playerPos;
    const dThreat = threat ? dist2D(ped.x, ped.z, threat.x, threat.z) : 999;
    if (dThreat < 14) {
      ped.scared = 2.5;
      ped.targetX = ped.x + (ped.x - threat.x) * 2;
      ped.targetZ = ped.z + (ped.z - threat.z) * 2;
    }
    if (ped.scared > 0) ped.scared -= dt;
    if (ped.retarget <= 0) {
      ped.retarget = rand(3, 9);
      const a = rand(0, Math.PI * 2);
      const r = rand(6, 26);
      ped.targetX = ped.x + Math.cos(a) * r;
      ped.targetZ = ped.z + Math.sin(a) * r;
    }
    const dx = ped.targetX - ped.x;
    const dz = ped.targetZ - ped.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.4) {
      const sp = ped.scared > 0 ? ped.speed * 3.2 : ped.speed;
      const step = Math.min(d, sp * dt);
      ped.x += (dx / d) * step;
      ped.z += (dz / d) * step;
      ped.angle = Math.atan2(dx, dz);
      ped.phase += dt * (ped.scared > 0 ? 13 : 7);
    } else {
      ped.phase += dt * 2;
    }
    ped.x = clamp(ped.x, -290, 290);
    ped.z = clamp(ped.z, -290, 330);
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.angle;
    const limbs = ped.mesh.userData.limbs;
    const swing = Math.sin(ped.phase) * (d > 0.4 ? 0.55 : 0.04);
    limbs.armL.rotation.x = swing;
    limbs.armR.rotation.x = -swing;
    limbs.legL.rotation.x = -swing;
    limbs.legR.rotation.x = swing;
  }
}

// Pedestrians the player's car just hit: scatter them and report the count.
export function carHitsPeds(car, peds) {
  let hits = 0;
  for (const ped of peds) {
    if (dist2D(car.x, car.z, ped.x, ped.z) < 2.4 && Math.abs(car.speed) > 4) {
      ped.scared = 4;
      ped.targetX = ped.x + (ped.x - car.x) * 4;
      ped.targetZ = ped.z + (ped.z - car.z) * 4;
      hits++;
    }
  }
  return hits;
}
