// Vellora Bay — the wanted system and the VBPD. Heat runs 0–5 stars: stealing,
// crashing and shooting raise it, and cruisers spawn to chase and ram. Lose
// them, stay out of sight, and the heat cools. Get caught on foot and you are
// busted; lose all your health and you are wasted. Either way it costs cash.
import { clamp, dist2, headingToward, makeRng, pick } from './util.js';
import { ROAD_LINES } from './city.js';
import { DriveCar } from './vehicles.js';

const STAR_NAMES = ['', 'One star', 'Two stars', 'Three stars', 'Four stars', 'Five stars'];

export class Police {
  constructor(S) {
    this.S = S;
    this.rng = makeRng(31337);
    this.wanted = 0; // float; HUD shows the ceiling as stars
    this.cruisers = [];
    this.coolTimer = 0;
    this.nearTimer = 0;
    this.bustedTimer = 0;
    this.sirenOn = false;
  }

  get stars() {
    return clamp(Math.ceil(this.wanted - 0.001), 0, 5);
  }

  addHeat(amount, reason) {
    if (this.S.over) return;
    const before = this.stars;
    this.wanted = clamp(this.wanted + amount, 0, 5);
    if (this.stars > before) {
      this.S.hud.setStars(this.stars);
      this.S.hud.toast(STAR_NAMES[this.stars] + ' wanted — the VBPD is coming for you.' + (reason ? ' (' + reason + ')' : ''));
      if (this.S.audio) this.S.audio.bad();
    }
    this.coolTimer = 0;
  }

  clearHeat(silent) {
    this.wanted = 0;
    this.S.hud.setStars(0);
    for (const c of this.cruisers) c.dispose();
    this.cruisers = [];
    this.setSiren(false);
    if (!silent) this.S.hud.toast('Heat is off. Vellora forgets quickly — for a price.');
  }

  setSiren(on) {
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (this.S.audio) this.S.audio.setSiren(on);
  }

  spawnCruiser() {
    const S = this.S;
    const p = S.player;
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    // Spawn on a road 45–70 m away, roughly in the player's direction of travel.
    const line = pick(this.rng, ROAD_LINES);
    const along = pick(this.rng, [-1, 1]) * (45 + this.rng() * 25);
    const horizontal = this.rng() < 0.5;
    const x = horizontal ? px + along : line;
    const z = horizontal ? line : pz + along;
    const cx = clamp(x, -140, 140);
    const cz = clamp(z, -140, 140);
    const car = new DriveCar(S, 'police', cx, cz, headingToward(cx, cz, px, pz));
    car.driver = 'ai';
    car.parked = false;
    car.ai = { node: null, target: null, wait: 0, cruise: 20, chase: true };
    this.cruisers.push(car);
    return car;
  }

  // Drop a cruiser at an exact spot — used to stage the chase screenshot with
  // the pursuit already in frame behind the player.
  spawnCruiserNear(x, z, heading, speed) {
    const car = new DriveCar(this.S, 'police', x, z, heading);
    car.driver = 'ai';
    car.parked = false;
    car.speed = speed || 18;
    car.ai = { node: null, target: null, wait: 0, cruise: 24, chase: true };
    this.cruisers.push(car);
    return car;
  }

  update(dt) {
    const S = this.S;
    if (!S.started || S.paused || S.over) {
      this.setSiren(false);
      return;
    }
    const p = S.player;
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    // Keep the cruiser count matched to the wanted level.
    const wantCount = this.stars;
    while (this.cruisers.length < wantCount) this.spawnCruiser();
    while (this.cruisers.length > wantCount) {
      const c = this.cruisers.pop();
      c.dispose();
    }
    this.setSiren(this.cruisers.length > 0);
    // Chase: steer straight at the player, ramming on contact.
    let nearest = Infinity;
    for (const cruiser of this.cruisers) {
      const d = dist2(cruiser.x, cruiser.z, px, pz);
      nearest = Math.min(nearest, d);
      const wantHeading = headingToward(cruiser.x, cruiser.z, px, pz);
      const diff = ((wantHeading - cruiser.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const input = { up: d > 6, down: false, left: diff > 0.18, right: diff < -0.18, hand: false };
      // Back off a touch when about to ram, so the chase reads as driving.
      if (d < 5) input.up = true;
      cruiser.drive(dt, input);
      // Ram the player's car (or the player on foot).
      if (p.car && d < 3.1) {
        const push = 2.2;
        p.car.x += (p.car.x - cruiser.x) / Math.max(d, 0.5) * push * dt * 4;
        p.car.z += (p.car.z - cruiser.z) / Math.max(d, 0.5) * push * dt * 4;
        p.car.speed *= 0.985;
        if (Math.abs(cruiser.speed) > 8 && S.time - (this.lastRamAt || 0) > 0.8) {
          this.lastRamAt = S.time;
          p.hurt(4, cruiser.x, cruiser.z);
          S.hud.flashDamage();
        }
      } else if (!p.car && d < 2.2) {
        p.hurt(7, cruiser.x, cruiser.z);
      }
      // Cruiser bumps into traffic cars.
      for (const car of S.traffic.aiCars) {
        if (car !== cruiser && car.driver === 'ai') cruiser.bump(car);
      }
    }
    // Busted: a cruiser sits on top of the on-foot player for a while.
    if (this.stars > 0 && !p.car && nearest < 3.4) {
      this.bustedTimer += dt;
      if (this.bustedTimer > 2.2) {
        this.bustedTimer = 0;
        this.busted();
        return;
      }
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - dt * 2);
    }
    // Heat cools when no cruiser is close for a while.
    if (this.stars > 0) {
      if (nearest > 48) {
        this.coolTimer += dt;
        if (this.coolTimer > 7) {
          this.wanted = Math.max(0, this.wanted - dt * 0.35);
          S.hud.setStars(this.stars);
        }
      } else {
        this.coolTimer = 0;
      }
    }
  }

  busted() {
    const S = this.S;
    const fine = Math.min(S.cash, 200);
    S.cash -= fine;
    S.hud.toast('BUSTED! The VBPD took $' + fine + ' in fines.');
    this.finishArrest('BUSTED', 'The VBPD caught you on foot and fined you $' + fine + '.');
  }

  wasted() {
    const S = this.S;
    const cost = Math.min(S.cash, 300);
    S.cash -= cost;
    S.hud.toast('WASTED! The hospital bill was $' + cost + '.');
    this.finishArrest('WASTED', 'You went down in Vellora Bay. The hospital took $' + cost + '.');
  }

  finishArrest(title, line) {
    const S = this.S;
    this.wanted = 0;
    S.hud.setStars(0);
    for (const c of this.cruisers) c.dispose();
    this.cruisers = [];
    this.setSiren(false);
    if (S.player.car) {
      const car = S.player.car;
      car.driver = null;
      car.parked = true;
      car.speed = 0;
      S.player.car = null;
      S.player.onFoot = true;
      S.player.mesh.visible = true;
    }
    S.player.health = 100;
    S.player.reset(6, 14, Math.PI);
    S.missions.onArrested();
    S.audio.jingle(false);
    S.showEnd(title, line);
  }
}
