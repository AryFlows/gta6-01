// Vellora Bay — the on-foot player. A low-poly humanoid with a walk cycle and
// a jump, driven camera-relative with WASD. The same builder makes pedestrians
// and thugs with different palettes, so the whole crowd shares one rig.
import { clamp, damp, angleDamp, dist2 } from './util.js';
import { resolveCollision } from './city.js';

// Build a simple articulated person. Returns the group plus named limbs so
// walk cycles can swing them, and a torso mesh for outfit colour changes.
export function makeHumanoid(THREE, opts) {
  const o = Object.assign({ skin: '#c98d64', shirt: '#3d6fb5', pants: '#2c3240', hair: '#241a12', scale: 1 }, opts || {});
  const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02 });
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), mat(o.shirt));
  torso.position.y = 1.18;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.38), mat(o.skin));
  head.position.y = 1.78;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.42), mat(o.hair));
  hair.position.y = 2.0;
  g.add(hair);
  const mkLimb = (w, h, d, material, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    pivot.add(mesh);
    g.add(pivot);
    return pivot;
  };
  const armL = mkLimb(0.2, 0.62, 0.2, mat(o.skin), -0.42, 1.48);
  const armR = mkLimb(0.2, 0.62, 0.2, mat(o.skin), 0.42, 1.48);
  const legL = mkLimb(0.26, 0.72, 0.26, mat(o.pants), -0.17, 0.82);
  const legR = mkLimb(0.26, 0.72, 0.26, mat(o.pants), 0.17, 0.82);
  g.scale.setScalar(o.scale);
  return { group: g, torso, head, armL, armR, legL, legR };
}

export class Player {
  constructor(S) {
    this.S = S;
    this.x = 6;
    this.z = 14;
    this.y = 0; // height above ground while jumping
    this.vy = 0;
    this.heading = Math.PI;
    this.speed = 0;
    this.walkPhase = 0;
    this.onFoot = true;
    this.car = null;
    this.health = 100;
    this.lastHurtAt = -99;
    this.hurtFlash = 0;
    this.rig = makeHumanoid(S.THREE, { shirt: '#c94f2e', pants: '#232a3a', hair: '#14100c' });
    this.mesh = this.rig.group;
    S.scene.add(this.mesh);
    this.syncMesh();
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.heading = heading === undefined ? Math.PI : heading;
    this.speed = 0;
    this.onFoot = true;
    this.car = null;
    this.mesh.visible = true;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
  }

  get pos() {
    return { x: this.x, z: this.z };
  }

  hurt(amount, fromX, fromZ) {
    if (this.S.time - this.lastHurtAt < 0.25) return;
    this.lastHurtAt = this.S.time;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 1;
    if (fromX !== undefined) {
      // Small knockback away from the hit.
      const d = Math.max(0.001, dist2(this.x, this.z, fromX, fromZ));
      this.x += ((this.x - fromX) / d) * 0.6;
      this.z += ((this.z - fromZ) / d) * 0.6;
    }
    if (this.S.audio) this.S.audio.punch();
    if (this.health <= 0) this.S.police.wasted();
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.S.traffic.allCars()) {
      if (car.driver) continue;
      const d = dist2(this.x, this.z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  tryEnterCar() {
    const car = this.nearestCar(4.2);
    if (!car) return false;
    car.driver = 'player';
    car.parked = false;
    this.car = car;
    this.onFoot = false;
    this.mesh.visible = false;
    this.S.audio.click();
    this.S.hud.toast('You took the ' + car.label + ' — that is grand theft, friend.');
    this.S.police.addHeat(1, 'stole a car');
    this.S.missions.onCarStolen(car);
    return true;
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    car.driver = null;
    car.parked = true;
    car.speed = 0;
    const side = 2.4;
    this.x = car.x + Math.cos(car.heading + Math.PI / 2) * side;
    this.z = car.z + Math.sin(car.heading + Math.PI / 2) * side;
    this.heading = car.heading;
    this.car = null;
    this.onFoot = true;
    this.mesh.visible = true;
    this.syncMesh();
    this.S.audio.click();
  }

  update(dt) {
    const S = this.S;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.4);
    if (!S.started || S.paused || S.over) return;
    // Slow regen once the heat is off and nobody has hit us lately.
    if (S.police.wanted === 0 && S.time - this.lastHurtAt > 6) this.heal(2.5 * dt);
    if (!this.onFoot) return;
    const k = S.keys;
    const camYaw = S.camYaw;
    let ix = 0;
    let iz = 0;
    if (k['KeyW'] || k['ArrowUp']) iz -= 1;
    if (k['KeyS'] || k['ArrowDown']) iz += 1;
    if (k['KeyA'] || k['ArrowLeft']) ix -= 1;
    if (k['KeyD'] || k['ArrowRight']) ix += 1;
    const moving = ix !== 0 || iz !== 0;
    const sprint = !!(k['ShiftLeft'] || k['ShiftRight']);
    const topSpeed = sprint ? 9.5 : 5.4;
    if (moving) {
      // Camera-relative movement: forward is where the camera looks.
      // f = (-sin yaw, -cos yaw), r = (cos yaw, -sin yaw); W pushes along f.
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const wx = ix * cos + iz * sin;
      const wz = -ix * sin + iz * cos;
      const len = Math.hypot(wx, wz) || 1;
      const targetHeading = Math.atan2(-wx / len, -wz / len);
      this.heading = angleDamp(this.heading, targetHeading, 12, dt);
      this.speed = damp(this.speed, topSpeed, 8, dt);
      const nx = this.x + (-Math.sin(this.heading)) * this.speed * dt;
      const nz = this.z + (-Math.cos(this.heading)) * this.speed * dt;
      const probe = { x: nx, z: nz };
      resolveCollision(S.city, probe, 0.55);
      this.x = clamp(probe.x, -S.city.bound, 192);
      this.z = clamp(probe.z, -S.city.bound, 176);
      this.walkPhase += dt * this.speed * 1.7;
    } else {
      this.speed = damp(this.speed, 0, 10, dt);
      this.walkPhase = damp(this.walkPhase, Math.round(this.walkPhase / Math.PI) * Math.PI, 10, dt);
    }
    // Jump.
    if ((k['Space']) && this.y === 0) {
      this.vy = 7.2;
      this.y = 0.01;
    }
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
    // Walk-cycle limb swing, scaled by speed.
    const swing = Math.sin(this.walkPhase) * clamp(this.speed / 5.4, 0, 1.4) * 0.75;
    this.rig.legL.rotation.x = swing;
    this.rig.legR.rotation.x = -swing;
    this.rig.armL.rotation.x = -swing * 0.8;
    this.rig.armR.rotation.x = swing * 0.8;
    this.rig.torso.position.y = 1.18 + Math.abs(Math.sin(this.walkPhase)) * 0.05 * clamp(this.speed / 5.4, 0, 1);
    this.syncMesh();
  }
}
