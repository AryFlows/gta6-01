// combat.js — fists and a pistol, plus the rival crew that guards the
// Docks during the Pickup. Shots are hitscan raycasts from the camera;
// thugs are simple state machines that shoot back when the player is near.

import * as THREE from '../vendor/three.module.min.js';
import { dist2D, rand, pick } from './util.js';
import { audio } from './audio.js';

export function createCombat() {
  return {
    thugs: [],
    tracers: [],
    muzzleFlash: 0,
  };
}

// A rival thug: dark hoodie, armed, guards a spot until provoked.
export function spawnThugs(scene, positions) {
  const thugs = [];
  for (const pos of positions) {
    const g = new THREE.Group();
    const hoodie = new THREE.MeshLambertMaterial({ color: 0x3a2a3a });
    const skin = new THREE.MeshLambertMaterial({ color: 0x8a5a3a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), hoodie);
    torso.position.y = 1.12;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skin);
    head.position.y = 1.72;
    g.add(head);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.46), hoodie);
    hood.position.y = 1.95;
    g.add(hood);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.3, 1.15, 0.3);
    g.add(gun);
    const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.2);
    for (const sx of [-0.16, 0.16]) {
      const leg = new THREE.Mesh(legGeo, pants);
      leg.position.set(sx, 0.36, 0);
      g.add(leg);
    }
    g.position.set(pos.x, 0, pos.z);
    scene.add(g);
    thugs.push({
      mesh: g, x: pos.x, z: pos.z,
      health: 60, angle: rand(0, Math.PI * 2),
      shootTimer: rand(1, 2.5), state: 'guard',
    });
  }
  return thugs;
}

// Fist fight: damage the nearest thug or pedestrian within 2.2 metres.
export function tryPunch(player, combat, peds, onHitPed) {
  if (player.punchCooldown > 0) return false;
  player.punchCooldown = 0.45;
  audio.punch();
  const px = player.x;
  const pz = player.z;
  let hitAnything = false;
  for (const thug of combat.thugs) {
    if (thug.health > 0 && dist2D(px, pz, thug.x, thug.z) < 2.4) {
      thug.health -= 25;
      hitAnything = true;
      if (thug.health <= 0) thug.mesh.visible = false;
    }
  }
  for (const ped of peds) {
    if (dist2D(px, pz, ped.x, ped.z) < 2.2) {
      ped.scared = 4;
      ped.targetX = ped.x + (ped.x - px) * 5;
      ped.targetZ = ped.z + (ped.z - pz) * 5;
      hitAnything = true;
      if (onHitPed) onHitPed(ped);
    }
  }
  return hitAnything;
}

// Fire the pistol from the camera toward the crosshair. Returns the name
// of what was hit ('thug', 'car', 'building', 'none') for feedback.
export function tryShoot(player, camera, combat, colliders, cars) {
  if (player.shootCooldown > 0 || player.ammo <= 0) return 'empty';
  player.shootCooldown = 0.32;
  player.ammo -= 1;
  audio.gunshot();
  combat.muzzleFlash = 0.08;
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: 0, y: 0 }, camera);
  ray.far = 90;
  const targets = [];
  for (const thug of combat.thugs) {
    if (thug.health > 0) targets.push(thug.mesh);
  }
  for (const car of cars) targets.push(car.mesh);
  const hits = ray.intersectObjects(targets, true);
  if (hits.length) {
    // Walk up from the hit mesh to the car/thug group that owns it.
    let node = hits[0].object;
    while (node.parent && node.parent.type === 'Group') node = node.parent;
    for (const thug of combat.thugs) {
      if (thug.mesh === node && thug.health > 0) {
        thug.health -= 34;
        thug.state = 'fight';
        if (thug.health <= 0) thug.mesh.visible = false;
        return 'thug';
      }
    }
    for (const car of cars) {
      if (car.mesh === node) return 'car';
    }
  }
  return 'none';
}

// Thugs shoot back when the player is within 26 metres and in the open.
// Their shots are deliberately inaccurate so a fair fight is winnable.
export function updateThugs(combat, dt, player, onPlayerShot) {
  const px = player.car ? player.car.x : player.x;
  const pz = player.car ? player.car.z : player.z;
  for (const thug of combat.thugs) {
    if (thug.health <= 0) continue;
    const d = dist2D(thug.x, thug.z, px, pz);
    if (d < 26) {
      thug.state = 'fight';
      thug.angle = Math.atan2(px - thug.x, pz - thug.z);
      thug.mesh.rotation.y = thug.angle;
      thug.shootTimer -= dt;
      if (thug.shootTimer <= 0) {
        thug.shootTimer = rand(0.9, 1.7);
        audio.gunshot();
        // One in three shots lands, for 6 damage.
        if (Math.random() < 0.33 && onPlayerShot) onPlayerShot(6);
      }
    } else if (thug.state === 'fight') {
      thug.state = 'guard';
    }
  }
}

// Short-lived tracer lines so shots read on screen. Call each frame.
export function spawnTracer(scene, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from.x, from.y, from.z),
    new THREE.Vector3(to.x, to.y, to.z),
  ]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8 }));
  scene.add(line);
  return { line, life: 0.09 };
}

export function updateTracers(combat, dt) {
  for (let i = combat.tracers.length - 1; i >= 0; i--) {
    const t = combat.tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      t.line.parent.remove(t.line);
      combat.tracers.splice(i, 1);
    }
  }
}
