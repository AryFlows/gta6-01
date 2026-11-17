// Vellora Bay — missions and story. A four-job story chain (steal a car, grab
// a package at the Docks under guard, lose the heat, drop it at a cafe), then
// a rival-gang turf chain, then repeatable timed courier runs. A light pillar
// and a pulsing ground ring mark the target; the HUD narrates each job.
import { dist2, clamp } from './util.js';
import { writeSave } from './save.js';
import { ROAD_LINES } from './city.js';

const STORY = [
  {
    id: 'borrowed-wheels', title: 'Job 1 — Borrowed Wheels',
    brief: 'You are new in Vellora Bay and broke. Your fixer Mara needs wheels — take any parked car on the street.',
    hint: 'Walk up to a parked car and press E. The owner will not mind. Much.',
    target: null, reward: 150,
  },
  {
    id: 'dockside-pickup', title: 'Job 2 — Dockside Pickup',
    brief: 'Mara stashed a package at the Docks pier. The Red Tide crew is guarding it — clear them out, then grab the package.',
    hint: 'Deal with the thugs at the pier first, then walk into the ring and press E.',
    target: null, reward: 400,
  },
  {
    id: 'cool-off', title: 'Job 3 — Cool Off',
    brief: 'The pickup put heat on you. Lose the VBPD — break line of sight and stay quiet until the stars fade.',
    hint: 'Drive away from the cruisers. The stars drop once nobody is close for a while.',
    target: null, reward: 250,
  },
  {
    id: 'cafe-drop', title: 'Job 4 — Cafe Drop',
    brief: 'Take the package to the cafe on Neon Row. Walk it in on foot — Mara hates tire marks on her patio.',
    hint: 'Head for the marker. Step into the ring on foot to hand it over.',
    target: null, reward: 600,
  },
];

const TURF = [
  {
    id: 'turf-pier', title: 'Turf 1 — Pier Pressure',
    brief: 'The Red Tide crew wants the pier back. Hold it: clear their four enforcers off the docks.',
    hint: 'Four thugs on the pier. Use cover, use the pistol, use your fists.',
    target: null, reward: 800,
  },
  {
    id: 'turf-neon', title: 'Turf 2 — Neon Row',
    brief: 'Their runners deal on Neon Row now. Four more thugs — send them a message the whole block can hear.',
    hint: 'Clear the four rivals on Neon Row, east of the plaza.',
    target: null, reward: 1000,
  },
  {
    id: 'turf-king', title: 'Turf 3 — King of the Bay',
    brief: 'One last run: carry the turf papers to the plaza fountain while the VBPD hunts you at three stars. Make it loud, make it count.',
    hint: 'Reach the plaza fountain with the papers. You start this job hot.',
    target: null, reward: 1500,
  },
];

export class Missions {
  constructor(S) {
    this.S = S;
    this.storyIndex = 0;
    this.turfIndex = 0;
    this.turfUnlocked = false;
    this.storyDone = false;
    this.turfDone = false;
    this.couriersDone = 0;
    this.packageHeld = false;
    this.courier = null; // {target, deadline, reward}
    this.thugsNeeded = 0;
    this.thugsDown = 0;
    this.current = null;
    // Beacon: a light pillar and a pulsing ring at the target.
    const THREE = S.THREE;
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 20, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd94d', transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.beacon.position.y = 10;
    S.scene.add(this.beacon);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.3, 3.2, 28),
      new THREE.MeshBasicMaterial({ color: '#ffd94d', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.12;
    S.scene.add(this.ring);
    this.beacon.visible = false;
    this.ring.visible = false;
    this.setJob(this.storyJob());
  }

  get target() {
    return this.current && this.current.target ? this.current.target : null;
  }

  storyJob() {
    const def = STORY[this.storyIndex];
    if (!def) return null;
    const job = Object.assign({}, def);
    if (job.id === 'borrowed-wheels') {
      const spot = this.S.city.carSpawns[0];
      job.target = { x: spot.x, z: spot.z, label: 'a parked car' };
    } else if (job.id === 'dockside-pickup' || job.id === 'turf-pier') {
      job.target = { x: this.S.city.docks.x, z: this.S.city.docks.z, y: 1.1, label: 'the Docks pier' };
    } else if (job.id === 'cafe-drop') {
      job.target = { x: this.S.city.cafe.x, z: this.S.city.cafe.z, label: 'the cafe' };
    } else if (job.id === 'cool-off') {
      job.target = null;
    }
    return job;
  }

  turfJob() {
    const def = TURF[this.turfIndex];
    if (!def) return null;
    const job = Object.assign({}, def);
    if (job.id === 'turf-pier') job.target = { x: this.S.city.docks.x, z: this.S.city.docks.z, y: 1.1, label: 'the Docks pier' };
    else if (job.id === 'turf-neon') job.target = { x: 38, z: 38, label: 'Neon Row' };
    else if (job.id === 'turf-king') job.target = { x: 0, z: 0, label: 'the plaza fountain' };
    return job;
  }

  setJob(job) {
    this.current = job;
    this.packageHeld = false;
    this.thugsDown = 0;
    this.thugsNeeded = 0;
    if (job && (job.id === 'dockside-pickup' || job.id === 'turf-pier')) {
      this.spawnGuardSquad(this.S.city.docks.x, this.S.city.docks.z, job.id === 'turf-pier' ? 4 : 3);
    } else if (job && job.id === 'turf-neon') {
      this.spawnGuardSquad(38, 38, 4);
    }
    if (job && job.id === 'turf-king') {
      this.S.police.wanted = 3;
      if (this.S.hud) this.S.hud.setStars(3);
      this.packageHeld = true;
    }
    if (job && this.S.hud) this.S.hud.setMission(job);
    this.placeBeacon();
  }

  spawnGuardSquad(x, z, n) {
    this.S.combat.clearThugs();
    this.thugsNeeded = n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.S.combat.spawnThug(x + Math.cos(a) * 6, z + Math.sin(a) * 6);
    }
  }

  placeBeacon() {
    const t = this.target;
    if (t) {
      const gy = t.y || 0;
      this.beacon.position.x = t.x;
      this.beacon.position.z = t.z;
      this.beacon.position.y = gy + 10;
      this.ring.position.x = t.x;
      this.ring.position.z = t.z;
      this.ring.position.y = gy + 0.15;
      this.beacon.visible = true;
      this.ring.visible = true;
    } else {
      this.beacon.visible = false;
      this.ring.visible = false;
    }
  }

  onCarStolen(car) {
    if (this.current && this.current.id === 'borrowed-wheels') {
      this.completeJob('Nice — clean lift. Mara is impressed.');
    }
  }

  onThugDown(thug) {
    if (!this.current) return;
    const guardJobs = ['dockside-pickup', 'turf-pier', 'turf-neon'];
    if (guardJobs.includes(this.current.id)) {
      this.thugsDown++;
      const left = this.thugsNeeded - this.thugsDown;
      if (left > 0) {
        this.S.hud.toast(left + (left === 1 ? ' thug' : ' thugs') + ' left.');
      } else {
        this.S.hud.toast('Area clear. Grab the package in the ring.');
        if (this.current.id === 'turf-pier' || this.current.id === 'turf-neon') {
          this.completeJob('Turf taken. The block is yours.');
        }
      }
    }
  }

  onArrested() {
    // An arrest drops the package and restarts the current job from its start.
    this.packageHeld = false;
    this.courier = null;
    if (!this.storyDone) this.setJob(this.storyJob());
    else if (this.turfUnlocked && !this.turfDone) this.setJob(this.turfJob());
    else this.startCourier();
  }

  tryGrab() {
    const S = this.S;
    const job = this.current;
    if (!job || !job.target) return false;
    const p = S.player;
    if (dist2(p.x, p.z, job.target.x, job.target.z) > 4.5) return false;
    if (job.id === 'dockside-pickup') {
      if (this.thugsDown < this.thugsNeeded) {
        S.hud.toast('Clear the thugs first — the package is guarded.');
        return false;
      }
      this.packageHeld = true;
      S.police.addHeat(2, 'grabbed the package');
      S.audio.pickup();
      this.completeJob('Package secured. Now lose the heat.');
      return true;
    }
    if (job.id === 'cafe-drop') {
      if (!p.onFoot) {
        S.hud.toast('Mara wants this on foot — park the car and walk in.');
        return false;
      }
      this.completeJob('Delivered. Mara pays in cash, like always.');
      return true;
    }
    if (job.id === 'turf-king') {
      this.completeJob('King of the Bay. Vellora is yours tonight.');
      return true;
    }
    if (job.id === 'courier-run') return this.finishCourier();
    return false;
  }

  completeJob(line) {
    const S = this.S;
    const job = this.current;
    if (!job) return;
    S.cash += job.reward;
    S.hud.toast(line + '  +$' + job.reward);
    S.audio.jingle(true);
    S.audio.cash();
    if (job.id === 'courier-run') {
      this.couriersDone++;
      this.courier = null;
    } else if (STORY.some((d) => d.id === job.id)) {
      this.storyIndex++;
      if (this.storyIndex >= STORY.length) {
        this.storyDone = true;
        this.turfUnlocked = true;
        S.hud.toast('Story complete! A rival crew is moving on your turf — new jobs open.');
      }
    } else if (TURF.some((d) => d.id === job.id)) {
      this.turfIndex++;
      if (this.turfIndex >= TURF.length) this.turfDone = true;
    }
    writeSave(S);
    this.advance();
  }

  advance() {
    if (!this.storyDone) this.setJob(this.storyJob());
    else if (this.turfUnlocked && !this.turfDone) this.setJob(this.turfJob());
    else this.startCourier();
  }

  startCourier() {
    const S = this.S;
    const ix = Math.floor(S.traffic.rng() * ROAD_LINES.length);
    const iz = Math.floor(S.traffic.rng() * ROAD_LINES.length);
    const tx = ROAD_LINES[ix];
    const tz = ROAD_LINES[iz];
    const p = S.player;
    if (dist2(p.x, p.z, tx, tz) < 30) {
      // Too close to be a run — pick the far corner instead.
      this.courier = { target: { x: -tx, z: -tz, label: 'the courier drop' }, deadline: 75, reward: 200 };
    } else {
      this.courier = { target: { x: tx, z: tz, label: 'the courier drop' }, deadline: 75, reward: 200 };
    }
    this.current = {
      id: 'courier-run', title: 'Courier Run — $' + this.courier.reward + ' (+time bonus)',
      brief: 'A paying customer needs a parcel across town, fast. Beat the clock.',
      hint: 'Reach the ring before the timer runs out. Faster pays more.',
      target: this.courier.target, reward: this.courier.reward,
    };
    this.thugsNeeded = 0;
    this.thugsDown = 0;
    S.hud.setMission(this.current);
    this.placeBeacon();
  }

  finishCourier() {
    const S = this.S;
    const timeLeft = this.courier ? Math.max(0, this.courier.deadline) : 0;
    const bonus = Math.round(timeLeft * 2);
    this.current.reward = this.courier.reward + bonus;
    this.completeJob('Parcel delivered with ' + Math.round(timeLeft) + 's to spare. Bonus +$' + bonus + '.');
    return true;
  }

  applySave(data) {
    this.storyIndex = clamp(data.storyIndex || 0, 0, STORY.length);
    this.turfIndex = clamp(data.turfIndex || 0, 0, TURF.length);
    this.turfUnlocked = !!data.turfUnlocked;
    this.couriersDone = data.couriersDone || 0;
    this.storyDone = !!data.storyDone;
    this.turfDone = !!data.turfDone;
    this.advance();
  }

  update(dt) {
    const S = this.S;
    if (!S.started || S.paused || S.over) return;
    // Beacon pulse.
    if (this.ring.visible) {
      const pulse = 1 + Math.sin(S.time * 3.2) * 0.14;
      this.ring.scale.set(pulse, pulse, 1);
      this.ring.material.opacity = 0.6 + Math.sin(S.time * 3.2) * 0.25;
    }
    if (!this.current) return;
    const job = this.current;
    // Job 3 completes the moment the heat is gone.
    if (job.id === 'cool-off' && S.police.stars === 0) {
      this.completeJob('Clean. Not a cruiser in sight.');
      return;
    }
    // Courier countdown.
    if (job.id === 'courier-run' && this.courier) {
      this.courier.deadline -= dt;
      if (this.courier.deadline <= 0) {
        S.hud.toast('Too slow — the customer cancelled. Another run is ready.');
        S.audio.bad();
        this.startCourier();
        return;
      }
      S.hud.setCourierTime(Math.max(0, this.courier.deadline));
    }
  }
}
