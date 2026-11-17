// police.js — the wanted system and the Solmar PD response.
// Stars rise when the player steals, hits people or shoots; police cruisers
// spawn on the roads, chase, and ram. Stay out of sight and the heat cools
// one star at a time. Getting caught on foot at low health means BUSTED.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, rand, pick, dist2D, angleDelta } from './util.js';
import { makeCar, bumpCars, bounceCars } from './vehicles.js';
import { audio } from './audio.js';

export const MAX_WANTED = 5;

// Heat cost of each crime, in stars.
export const CRIME_HEAT = {
  stealCar: 1,
  hitPed: 1,
  shoot: 1,
  punchPed: 1,
  ramPolice: 1,
};

export function createWanted() {
  return {
    level: 0,
    heat: 0,          // 0..100 within the current star; cools while hidden
    hiddenTimer: 0,   // seconds since any cruiser last saw the player
    busted: false,
    wasted: false,
  };
}

export function addWanted(wanted, stars) {
  wanted.level = clamp(wanted.level + stars, 0, MAX_WANTED);
  wanted.heat = 100;
  wanted.hiddenTimer = 0;
  audio.setSiren(wanted.level > 0);
}

export function clearWanted(wanted) {
  wanted.level = 0;
  wanted.heat = 0;
  wanted.hiddenTimer = 0;
  audio.setSiren(false);
}

// One frame of the wanted clock: cool down while no cruiser is near.
export function updateWanted(wanted, dt, policeCars, playerX, playerZ) {
  if (wanted.level <= 0) return;
  let nearest = 9999;
  for (const pc of policeCars) nearest = Math.min(nearest, dist2D(pc.x, pc.z, playerX, playerZ));
  if (nearest > 70) {
    wanted.hiddenTimer += dt;
    wanted.heat -= dt * 9;
    if (wanted.heat <= 0) {
      wanted.level -= 1;
      wanted.heat = 100;
      if (wanted.level <= 0) {
        wanted.level = 0;
        wanted.heat = 0;
        audio.setSiren(false);
      }
    }
  } else {
    wanted.hiddenTimer = 0;
    wanted.heat = Math.min(100, wanted.heat + dt * 4);
  }
}

// Keep the right number of cruisers on the street for the wanted level.
export function syncPoliceCount(scene, policeCars, wanted, playerX, playerZ, roadLines) {
  const want = Math.min(wanted.level + 1, 6);
  while (policeCars.length < want) {
    const line = pick(roadLines);
    const vertical = Math.random() < 0.5;
    const along = (Math.random() < 0.5 ? -1 : 1) * rand(60, 110);
    const x = vertical ? line + 3.4 : playerX + along;
    const z = vertical ? playerZ + along : line + 3.4;
    const car = makeCar(scene, 'police', clamp(x, -280, 280), clamp(z, -280, 320), rand(0, Math.PI * 2));
    car.parked = false;
    car.speed = 0;
    car.cruise = 0;
    car.vertical = vertical;
    car.line = line;
    car.dir = 1;
    car.wait = 0;
    policeCars.push(car);
  }
  // Despawn the furthest cruisers when the heat drops.
  while (policeCars.length > want) {
    let far = 0;
    let farD = -1;
    policeCars.forEach((pc, i) => {
      const d = dist2D(pc.x, pc.z, playerX, playerZ);
      if (d > farD) { farD = d; far = i; }
    });
    const [gone] = policeCars.splice(far, 1);
    gone.mesh.visible = false;
    scene.remove(gone.mesh);
  }
}

// Chase AI: cruisers steer toward the player and ram. They drive off-road
// when they must, but prefer roads; a ram that lands hard hurts the player
// on foot and shakes the player's car.
export function updatePolice(policeCars, dt, player, colliders, onRam, onBust) {
  const px = player.car ? player.car.x : player.x;
  const pz = player.car ? player.car.z : player.z;
  for (const pc of policeCars) {
    const d = dist2D(pc.x, pc.z, px, pz);
    const targetAngle = Math.atan2(px - pc.x, pz - pc.z);
    const turn = clamp(angleDelta(pc.angle, targetAngle), -1, 1);
    const accel = d > 12 ? 17 : 10;
    pc.speed = clamp(pc.speed + accel * dt, 0, 30);
    pc.angle += turn * 2.1 * dt * clamp(pc.speed / 8, 0.3, 1);
    pc.x += Math.sin(pc.angle) * pc.speed * dt;
    pc.z += Math.cos(pc.angle) * pc.speed * dt;
    pc.x = clamp(pc.x, -290, 290);
    pc.z = clamp(pc.z, -290, 330);
    pc.mesh.position.set(pc.x, 0, pc.z);
    pc.mesh.rotation.y = pc.angle;
    pc.crashed = Math.max(0, pc.crashed - dt);
    // Ram: on foot the hit hurts; in a car it shoves and slows both.
    if (d < 3.6 && pc.speed > 5) {
      if (player.car) {
        if (pc.crashed <= 0) {
          pc.crashed = 1.0;
          player.car.speed *= 0.55;
          if (onRam) onRam(pc.speed);
        }
      } else if (onBust && pc.crashed <= 0) {
        pc.crashed = 1.2;
        onBust(pc.speed);
      }
    }
  }
  for (let i = 0; i < policeCars.length; i++) {
    for (let j = i + 1; j < policeCars.length; j++) {
      if (bumpCars(policeCars[i], policeCars[j], 4.4)) bounceCars(policeCars[i], policeCars[j]);
    }
    if (player.car && bumpCars(policeCars[i], player.car, 4.4)) {
      bounceCars(policeCars[i], player.car);
    }
  }
}

// A glowing beacon column marks a mission target from across the city.
export function makeBeacon(scene, color) {
  const geo = new THREE.CylinderGeometry(1.6, 1.6, 90, 12, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: color || 0xffd23c,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 45;
  scene.add(mesh);
  return mesh;
}

export function makeMarkerRing(scene, color) {
  const geo = new THREE.RingGeometry(2.2, 3.0, 24);
  const mat = new THREE.MeshBasicMaterial({
    color: color || 0xffd23c,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.08;
  scene.add(mesh);
  return mesh;
}
