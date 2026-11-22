// Vellora Bay — the VBPD air unit. At three wanted stars and above, the
// AIR-1 helicopter joins the pursuit: it climbs above the player, holds
// station over them as they drive, and keeps its searchlight on them until
// the heat clears. It is built to read in a still frame too: a white
// airframe with dark-blue VBPD markings, a spinning rotor with a blur disc,
// a visible searchlight cone and a bright pool where the beam lands.
import { angleDamp, clamp, damp } from './util.js';

const AIR_ALTITUDE = 24; // metres above the street while tracking
const ACTIVATE_STARS = 3; // the air unit joins at three stars

export class Helicopter {
  constructor(S) {
    this.S = S;
    this.active = false;
    this.staged = false;
    this.x = 0;
    this.z = 0;
    this.altitude = 0;
    this.heading = 0;
    this.status = 'STANDBY';
    this.bobPhase = 0;
    this.group = null;
    this.rotor = null;
    this.tailRotor = null;
    this.spot = null;
    this.spotTarget = null;
    this.cone = null;
    this.pool = null;
  }

  playerPos() {
    const p = this.S.player;
    if (p.car) return { x: p.car.x, z: p.car.z };
    return { x: p.x, z: p.z };
  }

  ensureBuilt() {
    if (this.group) return;
    const THREE = this.S.THREE;
    const white = new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.4, metalness: 0.35 });
    const navy = new THREE.MeshStandardMaterial({ color: '#1d2f6b', roughness: 0.45, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.6, metalness: 0.3 });
    const glass = new THREE.MeshStandardMaterial({ color: '#0e1a24', roughness: 0.15, metalness: 0.7 });
    const g = new THREE.Group();
    // Fuselage: a white body with a dark-blue VBPD band around it.
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 3.6), white);
    fuselage.position.y = 0.1;
    fuselage.castShadow = true;
    g.add(fuselage);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.5, 3.2), navy);
    band.position.y = 0.35;
    g.add(band);
    // Windshield and cabin glass up front.
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.4), glass);
    shield.position.set(0, 0.45, -1.1);
    g.add(shield);
    // Tail boom and fin.
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 3.4), white);
    boom.position.set(0, 0.35, 3.2);
    g.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.7), navy);
    fin.position.set(0, 0.8, 4.7);
    g.add(fin);
    // Tail rotor: a small cross on the side of the tail, spinning fast.
    this.tailRotor = new THREE.Group();
    const trUp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.16), dark);
    this.tailRotor.add(trUp);
    const trFlat = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 1.5), dark);
    this.tailRotor.add(trFlat);
    this.tailRotor.position.set(0.3, 0.7, 4.7);
    g.add(this.tailRotor);
    // Main rotor: mast, two crossed blades, and a translucent blur disc so
    // the spin reads even in a still screenshot.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), dark);
    mast.position.y = 1.15;
    g.add(mast);
    this.rotor = new THREE.Group();
    this.rotor.position.y = 1.55;
    const bladeA = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.06, 0.3), dark);
    this.rotor.add(bladeA);
    const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 9.0), dark);
    this.rotor.add(bladeB);
    const blur = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 32),
      new THREE.MeshBasicMaterial({ color: '#dfe6ee', transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
    );
    blur.rotation.x = -Math.PI / 2;
    this.rotor.add(blur);
    g.add(this.rotor);
    // Landing skids with struts.
    for (const s of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.0), dark);
      skid.position.set(s * 0.95, -0.95, 0);
      g.add(skid);
      for (const zs of [-0.9, 0.9]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), dark);
        strut.position.set(s * 0.95, -0.65, zs);
        g.add(strut);
      }
    }
    // Searchlight housing under the nose.
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.4, 12), dark);
    lamp.position.set(0, -0.75, -1.5);
    g.add(lamp);
    // Red-and-blue light bar on the roof, matching the VBPD cruisers.
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.42), dark);
    barBase.position.set(0, 0.95, -0.4);
    g.add(barBase);
    for (const [off, col] of [[-0.32, '#ff2020'], [0.32, '#2040ff']]) {
      const domeMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6 });
      const dome = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.36), domeMat);
      dome.position.set(off, 1.08, -0.4);
      g.add(dome);
    }
    this.group = g;
    this.S.scene.add(g);
    // The real spotlight, aimed at the player every tick. Kept modest so
    // the pool reads in daylight without blowing the street out white.
    this.spot = new THREE.SpotLight(0xfff2b0, 2.5, 90, 0.32, 0.5, 1);
    this.spotTarget = new THREE.Object3D();
    this.S.scene.add(this.spotTarget);
    this.spot.target = this.spotTarget;
    this.S.scene.add(this.spot);
    // The visible beam: a faint translucent cone, apex at the helicopter.
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 24, 1, true), coneMat);
    this.S.scene.add(this.cone);
    // The bright pool where the beam lands on the street.
    const poolMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 24), poolMat);
    this.pool.rotation.x = -Math.PI / 2;
    this.S.scene.add(this.pool);
  }

  // Join the pursuit: climb in above the player at patrol altitude.
  activate() {
    const p = this.playerPos();
    this.ensureBuilt();
    this.x = p.x;
    this.z = p.z;
    this.altitude = AIR_ALTITUDE;
    this.group.position.set(this.x, this.altitude, this.z);
    this.active = true;
    this.staged = false;
    this.status = 'TRACKING';
    this.aimLight();
    this.S.hud.toast('AIR-1 is overhead — the VBPD helicopter has you in its searchlight.');
  }

  // Place the helicopter at exact coordinates with the searchlight on,
  // regardless of the wanted level. Used to stage the chase screenshot.
  stage(x, z, altitude) {
    this.ensureBuilt();
    this.x = x;
    this.z = z;
    this.altitude = clamp(altitude, 6, 40);
    this.group.position.set(x, this.altitude, z);
    this.active = true;
    this.staged = true;
    this.status = 'TRACKING';
    this.aimLight();
  }

  // Stand the air unit down and take its meshes and light out of the scene.
  clear() {
    if (!this.group) {
      this.active = false;
      this.staged = false;
      this.status = 'STANDBY';
      return;
    }
    const S = this.S;
    S.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
    if (this.spot) S.scene.remove(this.spot);
    if (this.spotTarget) S.scene.remove(this.spotTarget);
    if (this.cone) {
      S.scene.remove(this.cone);
      this.cone.geometry.dispose();
      this.cone.material.dispose();
    }
    if (this.pool) {
      S.scene.remove(this.pool);
      this.pool.geometry.dispose();
      this.pool.material.dispose();
    }
    this.group = null;
    this.rotor = null;
    this.tailRotor = null;
    this.spot = null;
    this.spotTarget = null;
    this.cone = null;
    this.pool = null;
    this.active = false;
    this.staged = false;
    this.status = 'STANDBY';
  }

  // Point the spotlight, the cone and the ground pool at the player.
  aimLight() {
    const THREE = this.S.THREE;
    const p = this.playerPos();
    const hx = this.group.position.x;
    const hy = this.group.position.y;
    const hz = this.group.position.z;
    this.spot.position.set(hx, hy - 0.8, hz);
    this.spotTarget.position.set(p.x, 0, p.z);
    const dx = p.x - hx;
    const dy = 0 - hy;
    const dz = p.z - hz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return;
    const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
    this.cone.position.set((hx + p.x) / 2, hy / 2, (hz + p.z) / 2);
    this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const base = 1.8 + len * 0.07;
    this.cone.scale.set(base, len, base);
    this.pool.position.set(p.x, 0.06, p.z);
    this.pool.scale.setScalar(2.2 + len * 0.04);
  }

  update(dt) {
    const S = this.S;
    // Heat cleared, busted or wasted: the air unit stands down.
    if (this.active && !this.staged && (S.over || (S.police && S.police.stars === 0))) {
      this.clear();
      return;
    }
    if (!S.started || S.paused || S.over) return;
    if (!this.active && S.police && S.police.stars >= ACTIVATE_STARS) this.activate();
    if (!this.active) return;
    const p = this.playerPos();
    // Hold station above the player, easing toward them as they drive.
    // A staged helicopter holds its framed position instead.
    if (!this.staged) {
      this.x = damp(this.x, p.x, 1.6, dt);
      this.z = damp(this.z, p.z, 1.6, dt);
    }
    this.bobPhase += dt * 1.6;
    this.altitude = clamp(damp(this.altitude, this.staged ? this.altitude : AIR_ALTITUDE, 1.2, dt), 6, 40);
    const y = this.altitude + Math.sin(this.bobPhase) * 0.5;
    this.group.position.set(this.x, y, this.z);
    // Face the player's direction of travel.
    const heading = S.player.car ? S.player.car.heading : S.player.heading;
    this.heading = angleDamp(this.heading, heading, 2.5, dt);
    this.group.rotation.y = this.heading;
    // Rotors spin; the tail rotor spins faster than the main rotor.
    this.rotor.rotation.y += dt * 28;
    this.tailRotor.rotation.x += dt * 45;
    this.aimLight();
  }
}
