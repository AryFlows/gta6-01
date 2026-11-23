// VBPD roadblocks: at 3+ stars, two cruisers park nose-to-nose ahead.
import { clamp } from './util.js';

const ROAD_LINES = [-133, -95, -57, -19, 19, 57, 95, 133];
const AHEAD = 40;
const BREAK_DIST = 14;
const REARM = 25;

export class Roadblocks {
  constructor(S) {
    this.S = S;
    this.units = [];
    this.cooldown = 0;
  }

  get active() {
    return this.units.length > 0;
  }

  nearestLine(v) {
    let best = ROAD_LINES[0];
    for (const l of ROAD_LINES) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
    return best;
  }

  deployAt(x, z, heading) {
    const S = this.S;
    const px = -Math.cos(heading);
    const pz = Math.sin(heading);
    const a = S.police.spawnCruiserNear(x + px * 3.5, z + pz * 3.5, heading + Math.PI / 2, 0);
    const b = S.police.spawnCruiserNear(x - px * 3.5, z - pz * 3.5, heading - Math.PI / 2, 0);
    for (const c of [a, b]) {
      c.blockade = true;
      c.speed = 0;
    }
    this.units = [a, b];
  }

  // Place a roadblock at exact coordinates, regardless of heat. Used to
  // stage the chase screenshot with the blockade in frame ahead.
  stage(x, z, heading) {
    this.deployAt(x, z, heading);
  }

  clear() {
    for (const c of this.units) c.blockade = false;
    this.units = [];
    this.cooldown = REARM;
  }

  center() {
    if (!this.active) return null;
    return {
      x: (this.units[0].x + this.units[1].x) / 2,
      z: (this.units[0].z + this.units[1].z) / 2,
    };
  }

  update(dt) {
    const S = this.S;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!S.started || S.paused || S.over) return;
    this.units = this.units.filter((c) => S.police.cruisers.includes(c));
    if (this.units.length === 1) {
      this.units[0].blockade = false;
      this.units = [];
    }
    const p = S.player;
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    if (this.active) {
      const c = this.center();
      if (S.police.stars < 3) { this.clear(); return; }
      if (Math.hypot(px - c.x, pz - c.z) < BREAK_DIST) {
        this.clear();
        S.hud.toast('You smashed through the roadblock!');
      }
      return;
    }
    if (S.police.stars < 3 || !p.car || this.cooldown > 0) return;
    const h = p.car.heading;
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    let ax = px + fx * AHEAD;
    let az = pz + fz * AHEAD;
    if (Math.abs(fx) > Math.abs(fz)) az = this.nearestLine(az);
    else ax = this.nearestLine(ax);
    ax = clamp(ax, -140, 140);
    az = clamp(az, -140, 140);
    this.deployAt(ax, az, h);
    S.hud.toast('VBPD set a roadblock ahead — BULWARK units holding the road.');
  }
}
