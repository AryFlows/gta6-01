// Vellora Bay — combat. A pistol with a magazine and a reload, a punch for
// close quarters, and thugs who shoot back. Shots are camera-centre raycasts
// with a visible tracer so the player can see where the bullet went.
import { clamp, dist2, makeRng, range } from './util.js';
import { makeHumanoid } from './player.js';

export class Combat {
  constructor(S) {
    this.S = S;
    this.rng = makeRng(555);
    this.ammo = 12;
    this.magSize = 12;
    // Five weapons, each with its own magazine; the wheel gates by rank.
    this.weapons = {
      fists: { name: 'FISTS', damage: 26, cooldown: 0.45, mag: Infinity, pellets: 1, rank: 1, ammo: Infinity },
      pistol: { name: 'PISTOL', damage: 34, cooldown: 0.22, mag: 12, pellets: 1, rank: 1, ammo: 12 },
      smg: { name: 'SMG', damage: 18, cooldown: 0.1, mag: 30, pellets: 1, rank: 2, ammo: 30 },
      rifle: { name: 'RIFLE', damage: 55, cooldown: 0.5, mag: 24, pellets: 1, rank: 3, ammo: 24 },
      shotgun: { name: 'SHOTGUN', damage: 16, cooldown: 0.8, mag: 6, pellets: 5, rank: 4, ammo: 6 },
    };
    this.weaponId = 'pistol';
    this.reloading = 0;
    this.shotCooldown = 0;
    this.punchCooldown = 0;
    this.thugs = [];
    this.tracers = [];
    this.raycaster = new S.THREE.Raycaster();
  }

  get canShoot() {
    return this.ammo > 0 && this.reloading <= 0 && this.shotCooldown <= 0;
  }

  punch() {
    const S = this.S;
    if (this.punchCooldown > 0 || !S.player.onFoot) return;
    this.punchCooldown = 0.45;
    S.audio.punch();
    const p = S.player;
    const fx = -Math.sin(p.heading);
    const fz = -Math.cos(p.heading);
    for (const thug of this.thugs) {
      if (thug.hp <= 0) continue;
      const dx = thug.x - p.x;
      const dz = thug.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.6 && (dx * fx + dz * fz) > 0) {
        this.damageThug(thug, 26, p.x, p.z);
        S.hud.toast('You landed a punch.');
      }
    }
    // Punching a pedestrian is also a crime. Vellora has witnesses.
    for (const ped of S.traffic.peds) {
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      if (Math.hypot(dx, dz) < 2.4 && (dx * fx + dz * fz) > 0) {
        ped.state = 'flee';
        ped.fleeT = 4;
        S.police.addHeat(1, 'assaulted a pedestrian');
      }
    }
  }

  // Draw a weapon: park the current magazine, load the new weapon's own.
  setWeapon(id) {
    const w = this.weapons[id];
    if (!w || id === this.weaponId) return;
    this.weapons[this.weaponId].ammo = this.ammo;
    this.weaponId = id;
    this.ammo = w.ammo;
    this.magSize = w.mag;
    this.reloading = 0;
    const inf = w.mag === Infinity;
    this.S.hud.setAmmo(inf ? '∞' : this.ammo, inf ? '∞' : this.magSize, false);
    this.S.hud.toast(w.name + ' drawn.');
  }

  shoot() {
    const S = this.S;
    if (this.weaponId === 'fists') { this.punch(); return; }
    if (!this.canShoot || !S.player.onFoot) return;
    if (this.ammo <= 0) {
      S.audio.click();
      S.hud.toast('Click — empty. Press R to reload.');
      return;
    }
    const w = this.weapons[this.weaponId];
    this.ammo--;
    this.weapons[this.weaponId].ammo = this.ammo;
    this.shotCooldown = w.cooldown;
    S.audio.shot();
    S.traffic.scare(S.player.x, S.player.z, 26);
    S.police.addHeat(0.5, 'fired a shot');
    for (let p = 0; p < w.pellets; p++) this.firePellet(w);
    S.hud.setAmmo(this.ammo, this.magSize, this.reloading > 0);
  }

  // One raycast from the camera through the crosshair (jittered when the
  // weapon fires a spread), damaging the first thug it hits, one tracer.
  firePellet(w) {
    const S = this.S;
    const jx = w.pellets > 1 ? (this.rng() - 0.5) * 0.06 : 0;
    const jy = w.pellets > 1 ? (this.rng() - 0.5) * 0.06 : 0;
    this.raycaster.setFromCamera({ x: jx, y: jy }, S.camera);
    const targets = [];
    for (const thug of this.thugs) {
      if (thug.hp > 0) targets.push(thug.rig.group);
    }
    for (const car of S.traffic.aiCars) targets.push(car.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = null;
    if (hits.length) {
      const hit = hits[0];
      end = hit.point;
      let obj = hit.object;
      while (obj && !obj.userData.thug && !obj.userData.car) obj = obj.parent;
      if (obj && obj.userData.thug) {
        this.damageThug(obj.userData.thug, w.damage, S.player.x, S.player.z);
      } else if (obj && obj.userData.car) {
        S.hud.toast('You shot a car — the owner will remember that.');
        S.police.addHeat(0.5, 'shot a car');
      }
    }
    if (!end) {
      end = this.raycaster.ray.origin.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(90));
    }
    this.spawnTracer(S.camera.position.clone(), end);
    S.hud.setAmmo(this.ammo, this.magSize, this.reloading > 0);
  }

  reload() {
    if (this.reloading > 0 || this.ammo === this.magSize) return;
    this.reloading = 1.1;
    this.S.audio.click();
    this.S.hud.setAmmo(this.ammo, this.magSize, true);
  }

  spawnTracer(from, to) {
    const S = this.S;
    const geo = new S.THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new S.THREE.Line(geo, new S.THREE.LineBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: 0.95 }));
    S.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  spawnThug(x, z) {
    const S = this.S;
    const rig = makeHumanoid(S.THREE, {
      shirt: '#1c1c22', pants: '#3a2a20', skin: '#a87850', hair: '#0c0c0c', scale: 1.04,
    });
    rig.group.position.set(x, 0, z);
    // A dark jacket marker so the player reads them as hostile at a glance.
    const jacket = new S.THREE.Mesh(
      new S.THREE.BoxGeometry(0.68, 0.3, 0.4),
      new S.THREE.MeshStandardMaterial({ color: '#8a1a1a', roughness: 0.7 }),
    );
    jacket.position.y = 1.45;
    rig.group.add(jacket);
    S.scene.add(rig.group);
    const thug = { rig, x, z, hp: 70, heading: 0, shootT: 1 + this.rng() * 1.5, phase: 0, dead: false };
    rig.group.userData.thug = thug;
    this.thugs.push(thug);
    return thug;
  }

  clearThugs() {
    for (const thug of this.thugs) this.S.scene.remove(thug.rig.group);
    this.thugs = [];
  }

  get liveThugs() {
    return this.thugs.filter((t) => t.hp > 0);
  }

  damageThug(thug, amount, fromX, fromZ) {
    thug.hp -= amount;
    const d = Math.max(0.001, dist2(thug.x, thug.z, fromX, fromZ));
    thug.x += ((thug.x - fromX) / d) * 0.7;
    thug.z += ((thug.z - fromZ) / d) * 0.7;
    if (thug.hp <= 0) {
      thug.dead = true;
      thug.rig.group.rotation.x = -Math.PI / 2;
      thug.rig.group.position.y = 0.35;
      this.S.audio.bad();
      this.S.hud.toast('Thug down.');
      this.S.missions.onThugDown(thug);
    }
  }

  update(dt) {
    const S = this.S;
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.ammo = this.magSize;
        this.weapons[this.weaponId].ammo = this.ammo;
        S.hud.setAmmo(this.ammo, this.magSize, false);
        S.audio.click();
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        S.scene.remove(tr.line);
        tr.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    if (!S.started || S.paused || S.over) return;
    // Thugs stand their ground and shoot at the player when close.
    const p = S.player;
    for (const thug of this.thugs) {
      if (thug.hp <= 0) continue;
      const d = dist2(thug.x, thug.z, p.x, p.z);
      thug.heading = Math.atan2(-(p.x - thug.x), -(p.z - thug.z));
      thug.rig.group.rotation.y = thug.heading;
      thug.rig.group.position.set(thug.x, 0, thug.z);
      thug.phase += dt * 4;
      thug.rig.armR.rotation.x = -0.9 + Math.sin(thug.phase) * 0.08;
      if (d < 42 && p.onFoot) {
        thug.shootT -= dt;
        if (thug.shootT <= 0) {
          thug.shootT = range(this.rng, 1.1, 2.1);
          S.audio.shot();
          this.spawnTracer(
            new S.THREE.Vector3(thug.x, 1.5, thug.z),
            new S.THREE.Vector3(p.x + range(this.rng, -2.5, 2.5), 1.2, p.z + range(this.rng, -2.5, 2.5)),
          );
          // Thugs are bad shots at range; closer is scarier.
          if (this.rng() < clamp(0.55 - d * 0.008, 0.08, 0.5)) {
            p.hurt(6 + Math.floor(this.rng() * 5), thug.x, thug.z);
            S.hud.flashDamage();
          }
        }
      }
    }
  }
}
