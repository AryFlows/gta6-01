// player.js — Jace Marlowe on foot: third-person movement, a simple
// low-poly character with a walk cycle, jumping, and the camera rig that
// follows him (and the car) with mouse orbit.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, resolveCircleBox, wrapAngle } from './util.js';

// Build the on-foot character: jacket torso, head, cap, arms and legs
// that swing while he walks. Cheap boxes, but he reads as a person.
export function makePlayerMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89a72 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2a6a8a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  const cap = new THREE.MeshLambertMaterial({ color: 0xc83228 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacket);
  torso.position.y = 1.12;
  torso.name = 'torso';
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
  head.position.y = 1.72;
  head.name = 'head';
  g.add(head);
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.46), cap);
  hat.position.y = 1.95;
  hat.name = 'hat';
  g.add(hat);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.22), cap);
  brim.position.set(0, 1.9, 0.3);
  g.add(brim);

  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.16);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.2);
  const mkLimb = (geo, mat, x, y, name) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -0.31;
    pivot.add(m);
    pivot.name = name;
    g.add(pivot);
    return pivot;
  };
  const armL = mkLimb(armGeo, jacket, -0.4, 1.42, 'armL');
  const armR = mkLimb(armGeo, jacket, 0.4, 1.42, 'armR');
  const legL = mkLimb(legGeo, pants, -0.16, 0.76, 'legL');
  const legR = mkLimb(legGeo, pants, 0.16, 0.76, 'legR');
  g.userData.limbs = { armL, armR, legL, legR, torso };
  return g;
}

export function createPlayer(scene, x, z) {
  const mesh = makePlayerMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return {
    mesh,
    x, z,
    y: 0, vy: 0,
    angle: 0,           // facing
    camAngle: 0,        // camera orbit around the player
    camPitch: 0.38,
    camDist: 9.5,
    speed: 0,
    moving: false,
    walkPhase: 0,
    health: 100,
    onFoot: true,
    car: null,          // car record when driving
    punchCooldown: 0,
    shootCooldown: 0,
    ammo: 12,
    invuln: 0,
  };
}

// Move the player on foot for one frame. Returns true while moving.
export function walkPlayer(p, input, dt, colliders) {
  const run = input.run;
  const maxSpeed = run ? 8.5 : 4.6;
  // Movement is relative to the camera, not the world.
  const fwdX = Math.sin(p.camAngle);
  const fwdZ = Math.cos(p.camAngle);
  const rightX = Math.cos(p.camAngle);
  const rightZ = -Math.sin(p.camAngle);
  let mx = 0;
  let mz = 0;
  if (input.forward) { mx += fwdX; mz += fwdZ; }
  if (input.back) { mx -= fwdX; mz -= fwdZ; }
  if (input.left) { mx -= rightX; mz -= rightZ; }
  if (input.right) { mx += rightX; mz += rightZ; }
  const len = Math.sqrt(mx * mx + mz * mz);
  p.moving = len > 0.01;
  if (p.moving) {
    mx /= len; mz /= len;
    const targetAngle = Math.atan2(mx, mz);
    let d = wrapAngle(targetAngle - p.angle);
    p.angle += clamp(d, -6 * dt, 6 * dt);
    p.speed = maxSpeed;
    p.x += mx * maxSpeed * dt;
    p.z += mz * maxSpeed * dt;
    p.walkPhase += dt * (run ? 11 : 7.5);
  } else {
    p.speed = 0;
    p.walkPhase += dt * 2;
  }
  // Gravity and jumping.
  if (input.jump && p.y <= 0.01) p.vy = 7.5;
  p.vy -= 22 * dt;
  p.y += p.vy * dt;
  if (p.y < 0) { p.y = 0; p.vy = 0; }
  // Building collision as a circle push-out.
  for (const box of colliders) {
    const out = resolveCircleBox(p.x, p.z, 0.55, box);
    if (out) { p.x = out.x; p.z = out.z; }
  }
  p.x = clamp(p.x, -290, 290);
  p.z = clamp(p.z, -290, 330);
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = p.angle;
  // Walk-cycle swing; idle breathing when still.
  const limbs = p.mesh.userData.limbs;
  const swing = p.moving ? Math.sin(p.walkPhase) * 0.65 : Math.sin(p.walkPhase) * 0.05;
  limbs.armL.rotation.x = swing;
  limbs.armR.rotation.x = -swing;
  limbs.legL.rotation.x = -swing;
  limbs.legR.rotation.x = swing;
  limbs.torso.position.y = 1.12 + (p.moving ? Math.abs(Math.cos(p.walkPhase)) * 0.05 : 0);
  return p.moving;
}

// Third-person camera: sits behind and above the focus point, orbits with
// the mouse, and eases toward its target so turns feel weighted, not snappy.
export function updateCamera(p, camera, dt, focusOverride) {
  const focus = focusOverride || { x: p.x, z: p.z, y: p.y + 1.6 };
  const driving = !!p.car;
  const dist = driving ? 11.5 : p.camDist;
  const pitch = driving ? 0.34 : p.camPitch;
  const tx = focus.x - Math.sin(p.camAngle) * Math.cos(pitch) * dist;
  const tz = focus.z - Math.cos(p.camAngle) * Math.cos(pitch) * dist;
  const ty = focus.y + Math.sin(pitch) * dist;
  const k = 1 - Math.exp(-9 * dt);
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;
  camera.lookAt(focus.x, focus.y + 0.4, focus.z);
}

// When the player starts driving, swing the camera behind the car.
// camAngle points from the camera toward the focus, so matching the car's
// heading puts the camera on its tail.
export function snapCameraBehindCar(p, camera) {
  p.camAngle = p.car.angle;
  const focus = { x: p.car.x, z: p.car.z, y: 1.6 };
  camera.position.set(
    focus.x - Math.sin(p.camAngle) * 11,
    focus.y + 4,
    focus.z - Math.cos(p.camAngle) * 11
  );
  camera.lookAt(focus.x, focus.y, focus.z);
}

// Hurt the player; returns true when the hit kills him.
export function hurtPlayer(p, amount) {
  if (p.invuln > 0) return false;
  p.health -= amount;
  p.invuln = 0.6;
  if (p.health <= 0) {
    p.health = 0;
    return true;
  }
  return false;
}
