// Vellora Bay — the mission system (v4: fully visible).
//
// Mara's work, as a real multi-stage campaign the player can always see:
// 4 story jobs, then 3 turf jobs once the story is done, then endless timed
// courier runs. Every job is a chain of stages — reach a place, grab or
// deliver something, steal a car, clear the guards — and the chain is on
// screen the whole time: the objectives checklist inside the mission panel
// ticks stages off as they are done, the minimap diamond tracks the live
// stage target, and finishing a job pops a MISSION COMPLETE banner with the
// cash reward and the next job's name. Progress autosaves after every job
// and survives a reload through applySave().
//
// The rest of the game talks to this module through a small surface:
//   current / target        the live job and its live stage target (hud.js
//                           reads both for the panel, the prompt and the
//                           minimap diamond)
//   storyIndex / turfIndex  progress counters (save.js, readouts, restart)
//   storyDone / turfDone / turfUnlocked / couriersDone / courier
//   packageHeld / thugsNeeded
//   storyJob() / turfJob() / setJob() / update() / tryGrab()
//   onCarStolen() / onThugDown() / onArrested() / applySave()
import { writeSave } from './save.js';

// --- Job data ---------------------------------------------------------------
// A stage is one visible step. Types:
//   reach   — walk/drive within radius of the target
//   steal   — steal any car (completes on onCarStolen)
//   grab    — press E at the target to pick something up
//   deliver — press E at the target to hand something over
//   clear   — take down every guard spawned for the stage
const STORY_JOBS = [
  {
    id: 'borrowed-wheels', kind: 'story', reward: 250,
    title: 'Job 1 — Borrowed Wheels',
    brief: 'You are new in Vellora Bay and broke. Your fixer Mara needs wheels — any wheels.',
    hint: 'Walk up to a parked car and press E.',
    stages: [
      { type: 'reach', label: 'Find a parked car near the plaza', target: { x: 0, z: 0, label: 'Plaza' }, radius: 12 },
      { type: 'steal', label: 'Steal the car — press E', target: { x: 0, z: 0, label: 'Plaza' }, radius: 0 },
    ],
  },
  {
    id: 'dockside-pickup', kind: 'story', reward: 400,
    title: 'Job 2 — Dockside Pickup',
    brief: 'Mara has a package waiting on the pier. The Red Tide crew watches the docks — grab it fast.',
    hint: 'Reach the pier, then press E to grab the package.',
    stages: [
      { type: 'reach', label: 'Reach the pier at the docks', target: { x: 168, z: 0, label: 'Docks pier' }, radius: 10 },
      { type: 'grab', label: 'Grab the package — press E', target: { x: 168, z: 0, label: 'Docks pier' }, radius: 4.5 },
    ],
  },
  {
    id: 'cafe-drop', kind: 'story', reward: 350,
    title: 'Job 3 — Cafe Drop',
    brief: 'The package goes to a buyer at Cafe Luna on Neon Row. Do not get stopped on the way.',
    hint: 'Carry the package to Cafe Luna and press E to hand it over.',
    stages: [
      { type: 'reach', label: 'Carry the package to Cafe Luna', target: { x: 57, z: 19, label: 'Cafe Luna' }, radius: 8 },
      { type: 'deliver', label: 'Hand over the package — press E', target: { x: 57, z: 19, label: 'Cafe Luna' }, radius: 4.5 },
    ],
  },
  {
    id: 'warehouse-showdown', kind: 'story', reward: 600,
    title: 'Job 4 — Warehouse Showdown',
    brief: 'The Red Tide crew is moving in on the north warehouse. Mara wants the block cleared — permanently.',
    hint: 'Reach the warehouse, then take down every guard.',
    stages: [
      { type: 'reach', label: 'Reach the north warehouse', target: { x: -57, z: -133, label: 'North warehouse' }, radius: 12 },
      { type: 'clear', label: 'Take down the Red Tide guards', target: { x: -57, z: -133, label: 'North warehouse' }, radius: 0, thugs: 3 },
    ],
  },
];

const TURF_JOBS = [
  {
    id: 'turf-park', kind: 'turf', reward: 450,
    title: 'Turf 1 — Park Patrol',
    brief: 'Red Tide dealers are working the park. Run them off and the park is yours.',
    hint: 'Clear the park of Red Tide thugs.',
    stages: [
      { type: 'reach', label: 'Reach the park', target: { x: -76, z: -76, label: 'Park' }, radius: 12 },
      { type: 'clear', label: 'Clear the park of Red Tide thugs', target: { x: -76, z: -76, label: 'Park' }, radius: 0, thugs: 3 },
    ],
  },
  {
    id: 'turf-king', kind: 'turf', reward: 500,
    title: 'Turf 2 — Papers for the King',
    brief: 'The turf papers need a signature at the plaza. Mara says the king of the bay signs in person.',
    hint: 'Bring the papers to the plaza and press E to deliver them.',
    stages: [
      { type: 'reach', label: 'Bring the papers to the plaza', target: { x: 0, z: 0, label: 'Plaza' }, radius: 8 },
      { type: 'deliver', label: 'Deliver the papers — press E', target: { x: 0, z: 0, label: 'Plaza' }, radius: 4.5 },
    ],
  },
  {
    id: 'turf-harbor', kind: 'turf', reward: 750,
    title: 'Turf 3 — Harbor Holdout',
    brief: 'The last Red Tide holdout is dug in at the harbor. Take the harbor and the bay is yours.',
    hint: 'Clear the harbor of every last guard.',
    stages: [
      { type: 'reach', label: 'Reach the harbor', target: { x: 150, z: 0, label: 'Harbor' }, radius: 12 },
      { type: 'clear', label: 'Take down the harbor guards', target: { x: 150, z: 0, label: 'Harbor' }, radius: 0, thugs: 4 },
    ],
  },
];

// Courier drop-off points, cycled in order. A courier run starts with the
// parcel already in hand and a 90-second clock: beat the clock for a $50
// speed bonus on top of the $150 fee.
const COURIER_SPOTS = [
  { x: 0, z: 0, label: 'Plaza' },
  { x: 57, z: 19, label: 'Cafe Luna' },
  { x: -76, z: -76, label: 'Park' },
  { x: -57, z: -133, label: 'North warehouse' },
  { x: 168, z: 0, label: 'Docks pier' },
  { x: 0, z: 150, label: 'Beach boardwalk' },
];
const COURIER_TIME = 90;
const COURIER_FEE = 150;
const COURIER_BONUS = 50;

function cloneJob(def) {
  return {
    id: def.id, kind: def.kind, reward: def.reward,
    title: def.title, brief: def.brief, hint: def.hint,
    stages: def.stages.map((s) => ({
      type: s.type, label: s.label, radius: s.radius || 0, thugs: s.thugs || 0,
      target: { x: s.target.x, z: s.target.z, label: s.target.label },
      done: false,
    })),
    target: null,
  };
}

export class Missions {
  constructor(S) {
    this.S = S;
    this.storyIndex = 0;
    this.turfIndex = 0;
    this.turfUnlocked = false;
    this.storyDone = false;
    this.turfDone = false;
    this.couriersDone = 0;
    this.courier = null;
    this.courierSpot = 0;
    this.packageHeld = false;
    this.thugsNeeded = 0;
    this.current = null;
    this.target = null;
    this.stageIndex = 0;
    this.bannerUntil = 0;
    this.objectivesSig = '';
    // Screenshot staging: the docks shot frames job 2 with job 1 just
    // finished, so the MISSION COMPLETE banner is visible in the shot. The
    // cash is set to match (start $200 + job 1's $250) so the HUD agrees
    // with the banner. This only fires for ?shot=docks, never in real play.
    this.stagedBanner = null;
    try {
      if (new URLSearchParams(window.location.search).get('shot') === 'docks') {
        S.cash = 200 + STORY_JOBS[0].reward;
        this.stagedBanner = {
          title: 'MISSION COMPLETE — BORROWED WHEELS',
          reward: '+$250 BANKED  ·  JOB 1 OF 7 DONE',
          next: 'NOW: JOB 2 — DOCKSIDE PICKUP',
        };
      }
    } catch (e) { /* no window / no query string */ }
    this.stagedShown = false;
    this.buildMissionUi();
    this.setJob(this.storyJob());
  }

  // --- Job factories ------------------------------------------------------

  storyJob() {
    return cloneJob(STORY_JOBS[Math.min(this.storyIndex, STORY_JOBS.length - 1)]);
  }

  turfJob() {
    return cloneJob(TURF_JOBS[Math.min(this.turfIndex, TURF_JOBS.length - 1)]);
  }

  courierJob() {
    const spot = COURIER_SPOTS[this.courierSpot % COURIER_SPOTS.length];
    this.courierSpot += 1;
    this.courier = { timeLeft: COURIER_TIME };
    this.packageHeld = true; // the parcel is in hand when the run starts
    return {
      id: 'courier-run', kind: 'courier', reward: COURIER_FEE,
      title: 'Courier Run — Drop ' + (this.couriersDone + 1),
      brief: 'A parcel for ' + spot.label + ', and the clock is already running. Drive fast, drive clean.',
      hint: 'Reach ' + spot.label + ' before the timer runs out, then press E.',
      stages: [
        { type: 'reach', label: 'Race the clock to ' + spot.label, target: { x: spot.x, z: spot.z, label: spot.label }, radius: 8, thugs: 0, done: false },
        { type: 'deliver', label: 'Drop the parcel — press E', target: { x: spot.x, z: spot.z, label: spot.label }, radius: 4.5, thugs: 0, done: false },
      ],
      target: null,
    };
  }

  // --- Job flow -----------------------------------------------------------

  setJob(job) {
    this.current = job;
    this.stageIndex = 0;
    this.thugsNeeded = 0;
    if (job.kind !== 'courier') this.courier = null;
    this.updateTarget();
    if (this.S.hud) this.S.hud.setMission(job);
    this.renderObjectives(true);
  }

  currentStage() {
    if (!this.current) return null;
    return this.current.stages[this.stageIndex] || null;
  }

  updateTarget() {
    const stage = this.currentStage();
    this.target = stage ? stage.target : null;
    if (this.current) this.current.target = this.target;
  }

  missionNumber() {
    if (!this.current) return '—';
    if (this.current.kind === 'story') return (this.storyIndex + 1) + ' OF 7';
    if (this.current.kind === 'turf') return (4 + this.turfIndex + 1) + ' OF 7';
    return 'ENDLESS';
  }

  nextJobTitle() {
    if (!this.current) return '';
    if (this.current.kind === 'story') {
      if (this.storyIndex + 1 < STORY_JOBS.length) return STORY_JOBS[this.storyIndex + 1].title;
      return 'Turf war unlocks — 3 turf jobs';
    }
    if (this.current.kind === 'turf') {
      if (this.turfIndex + 1 < TURF_JOBS.length) return TURF_JOBS[this.turfIndex + 1].title;
      return 'Endless courier runs';
    }
    return 'Another courier run';
  }

  advanceStage() {
    const stage = this.currentStage();
    if (!stage) return;
    stage.done = true;
    this.stageIndex += 1;
    if (this.stageIndex >= this.current.stages.length) {
      this.completeJob();
      return;
    }
    const next = this.currentStage();
    if (next.type === 'clear') this.spawnGuards(next);
    this.updateTarget();
    if (this.S.hud) this.S.hud.toast('Stage done: ' + stage.label);
    this.renderObjectives(true);
  }

  spawnGuards(stage) {
    const t = stage.target;
    const spots = [[0, 0], [6, 3], [-5, 4], [3, -6], [-7, -3]];
    this.thugsNeeded = stage.thugs;
    for (let i = 0; i < stage.thugs; i++) {
      const off = spots[i % spots.length];
      this.S.combat.spawnThug(t.x + off[0], t.z + off[1]);
    }
    if (this.S.hud) this.S.hud.toast(stage.thugs + ' guards on the block — clear them out.');
  }

  completeJob() {
    const job = this.current;
    if (!job) return;
    let reward = job.reward;
    let bonusLine = '';
    if (job.kind === 'courier' && this.courier && this.courier.timeLeft > 30) {
      reward += COURIER_BONUS;
      bonusLine = ' (includes $' + COURIER_BONUS + ' speed bonus)';
    }
    this.S.cash += reward;
    if (this.S.hud) this.S.hud.setCash(this.S.cash);
    if (this.S.audio) {
      try { this.S.audio.jingle(true); } catch (e) { /* audio locked */ }
    }
    // Bookkeeping first, so the banner's "next job" line is already right.
    // (Capture the next title BEFORE the counters move: nextJobTitle reads
    // the live indices, so after the increment it would skip one job.)
    const nextTitle = this.nextJobTitle();
    if (job.kind === 'story') {
      this.storyIndex += 1;
      if (this.storyIndex >= STORY_JOBS.length) {
        this.storyDone = true;
        this.turfUnlocked = true;
        if (this.S.hud) this.S.hud.toast('Story complete — the turf war is on. Take the bay.');
      }
    } else if (job.kind === 'turf') {
      this.turfIndex += 1;
      if (this.turfIndex >= TURF_JOBS.length) {
        this.turfDone = true;
        if (this.S.hud) this.S.hud.toast('King of the Bay — every turf is yours.');
      }
    } else if (job.kind === 'courier') {
      this.couriersDone += 1;
    }
    this.showBanner(
      'MISSION COMPLETE — ' + job.title.replace(/^(Job \d+|Turf \d+) — /, '').toUpperCase(),
      '+$' + reward + ' BANKED' + bonusLine,
      'NEXT UP: ' + nextTitle.toUpperCase(),
    );
    try { writeSave(this.S); } catch (e) { /* storage unavailable */ }
    // Hand the player the next job immediately: the objectives checklist
    // never goes blank.
    if (job.kind === 'story') {
      this.setJob(this.storyDone ? this.turfJob() : this.storyJob());
    } else if (job.kind === 'turf') {
      this.setJob(this.turfDone ? this.courierJob() : this.turfJob());
    } else {
      this.setJob(this.courierJob());
    }
  }

  // --- Player actions -------------------------------------------------------

  tryGrab() {
    const stage = this.currentStage();
    const job = this.current;
    if (!stage || !job) return false;
    if (stage.type !== 'grab' && stage.type !== 'deliver') return false;
    const p = this.S.player;
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    const d = Math.hypot(px - stage.target.x, pz - stage.target.z);
    if (d > stage.radius) return false;
    if (stage.type === 'deliver' && job.id === 'cafe-drop' && !this.packageHeld) {
      if (this.S.hud) this.S.hud.toast('You do not have the package — it is still at the docks.');
      return true; // consumed: do not steal a car by accident here
    }
    if (stage.type === 'grab') {
      this.packageHeld = true;
      if (this.S.hud) this.S.hud.toast('Package secured. Do not lose it.');
    } else {
      this.packageHeld = false;
    }
    this.advanceStage();
    return true;
  }

  onCarStolen(car) {
    if (this.current && this.current.id === 'borrowed-wheels') {
      for (const s of this.current.stages) s.done = true;
      this.stageIndex = this.current.stages.length;
      this.completeJob();
    }
  }

  onThugDown(thug) {
    if (this.thugsNeeded <= 0) return;
    this.thugsNeeded -= 1;
    this.renderObjectives(true);
    const stage = this.currentStage();
    if (this.thugsNeeded === 0 && stage && stage.type === 'clear') {
      this.advanceStage();
    }
  }

  onArrested() {
    // Busted: the package is gone and the live job restarts from its first
    // stage, so the player can never be stuck mid-job.
    this.packageHeld = false;
    this.thugsNeeded = 0;
    if (this.S.combat) this.S.combat.clearThugs();
    const job = this.current;
    if (!job) return;
    if (job.id === 'cafe-drop') {
      this.storyIndex = 1;
      this.setJob(this.storyJob());
      if (this.S.hud) this.S.hud.toast('Package lost — Mara sent you back to the docks.');
    } else if (job.kind === 'courier') {
      this.setJob(this.courierJob());
    } else if (job.kind === 'story') {
      this.setJob(this.storyJob());
    } else if (job.kind === 'turf') {
      this.setJob(this.turfJob());
    }
  }

  applySave(data) {
    this.storyIndex = Math.min(data.storyIndex || 0, STORY_JOBS.length - 1);
    this.turfIndex = Math.min(data.turfIndex || 0, TURF_JOBS.length - 1);
    this.turfUnlocked = !!data.turfUnlocked;
    this.storyDone = !!data.storyDone;
    this.turfDone = !!data.turfDone;
    this.couriersDone = data.couriersDone || 0;
    this.packageHeld = false;
    this.courier = null;
    if (this.turfDone) this.setJob(this.courierJob());
    else if (this.storyDone) this.setJob(this.turfJob());
    else this.setJob(this.storyJob());
  }

  // --- Per-frame ------------------------------------------------------------

  update(dt) {
    const S = this.S;
    if (!S.started) return;
    if (this.objectivesEl) this.objectivesEl.style.display = 'block';
    // Staged docks screenshot: job 1's completion banner, once.
    if (this.stagedBanner && !this.stagedShown) {
      this.stagedShown = true;
      this.showBanner(this.stagedBanner.title, this.stagedBanner.reward, this.stagedBanner.next);
    }
    if (this.bannerEl && this.bannerEl.style.display === 'block' && S.time > this.bannerUntil) {
      this.bannerEl.style.display = 'none';
    }
    const job = this.current;
    if (!job) return;
    // Courier clock: miss the deadline and the run restarts with new points.
    if (job.id === 'courier-run' && this.courier) {
      this.courier.timeLeft -= dt;
      if (S.hud) S.hud.setCourierTime(Math.max(0, this.courier.timeLeft));
      if (this.courier.timeLeft <= 0) {
        if (S.hud) S.hud.toast('Too slow — the parcel run expired. New run, fresh clock.');
        this.setJob(this.courierJob());
        return;
      }
    }
    const stage = this.currentStage();
    if (stage && stage.type === 'reach') {
      const p = S.player;
      const px = p.car ? p.car.x : p.x;
      const pz = p.car ? p.car.z : p.z;
      if (Math.hypot(px - stage.target.x, pz - stage.target.z) < stage.radius) {
        this.advanceStage();
        return;
      }
    }
    this.renderObjectives(false);
  }

  // --- Visible mission UI ---------------------------------------------------
  // Built here, not in index.html, so the mission system owns its own face:
  // an objectives checklist inside the mission panel and a big completion
  // banner. Inline styles keep it independent of the page stylesheet.

  buildMissionUi() {
    const panel = document.getElementById('hud-mission');
    this.objectivesEl = document.createElement('div');
    this.objectivesEl.id = 'mission-objectives';
    this.objectivesEl.style.cssText = 'margin-top:10px;padding-top:8px;' +
      'border-top:1px solid rgba(255,217,77,0.35);display:none;';
    if (panel) panel.appendChild(this.objectivesEl);

    this.bannerEl = document.createElement('div');
    this.bannerEl.id = 'mission-banner';
    this.bannerEl.style.cssText = 'position:absolute;left:50%;top:24%;' +
      'transform:translateX(-50%);text-align:center;padding:18px 36px;' +
      'background:rgba(12,10,22,0.9);border:2px solid #ffd94d;border-radius:14px;' +
      'box-shadow:0 12px 48px rgba(0,0,0,0.65);display:none;z-index:6;';
    const hud = document.getElementById('hud');
    if (hud) hud.appendChild(this.bannerEl);
  }

  showBanner(title, rewardLine, nextLine) {
    if (!this.bannerEl) return;
    this.bannerEl.innerHTML =
      '<div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#8fd8ff;">★ VELLORA BAY ★</div>' +
      '<div style="font-size:26px;font-weight:800;letter-spacing:1px;color:#ffd94d;margin-top:6px;">' + title + '</div>' +
      '<div style="font-size:18px;font-weight:800;color:#7dff8a;margin-top:6px;">' + rewardLine + '</div>' +
      '<div style="font-size:12px;font-weight:700;color:#efe9df;margin-top:8px;">' + nextLine + '</div>';
    this.bannerEl.style.display = 'block';
    this.bannerUntil = this.S.time + 6;
  }

  renderObjectives(force) {
    if (!this.objectivesEl || !this.current) return;
    const job = this.current;
    const sig = job.id + '|' + this.stageIndex + '|' +
      job.stages.map((s) => (s.done ? '1' : '0')).join('') + '|' +
      this.thugsNeeded + '|' + (this.packageHeld ? '1' : '0');
    if (!force && sig === this.objectivesSig) return;
    this.objectivesSig = sig;
    const total = job.stages.length;
    const doneCount = job.stages.filter((s) => s.done).length;
    let rows = '';
    job.stages.forEach((s, i) => {
      let mark = '○';
      let color = '#8a929c';
      let weight = '600';
      if (s.done) { mark = '✓'; color = '#7dff8a'; }
      else if (i === this.stageIndex) { mark = '▶'; color = '#ffffff'; weight = '800'; }
      let extra = '';
      if (!s.done && s.type === 'clear') extra = ' <span style="color:#ff5a4d;">(' + this.thugsNeeded + ' left)</span>';
      if (!s.done && s.type === 'deliver' && job.id === 'cafe-drop' && !this.packageHeld) {
        extra = ' <span style="color:#ff5a4d;">(no package!)</span>';
      }
      rows += '<div style="font-size:12.5px;line-height:1.5;color:' + color +
        ';font-weight:' + weight + ';">' + mark + ' ' + s.label + extra + '</div>';
    });
    const rewardLine = job.kind === 'courier'
      ? 'REWARD $' + COURIER_FEE + ' + $' + COURIER_BONUS + ' SPEED BONUS'
      : 'REWARD $' + job.reward + ' ON COMPLETION';
    this.objectivesEl.innerHTML =
      '<div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#ffd94d;">' +
      'MISSION ' + this.missionNumber() + ' &nbsp;·&nbsp; STAGE ' +
      Math.min(doneCount + 1, total) + '/' + total + ' &nbsp;·&nbsp; ' + rewardLine + '</div>' +
      rows +
      '<div style="font-size:11px;color:#b9c4d6;margin-top:6px;font-style:italic;">' +
      'Next up: ' + this.nextJobTitle() + '</div>';
  }
}
