// Respect ranks (jobs pay RP; ranks unlock weapons) + district nameplate.
const RANKS = [
  { at: 0, name: 'ROOKIE' },
  { at: 100, name: 'DOCK HAND' },
  { at: 300, name: 'HUSTLER' },
  { at: 600, name: 'FIXER' },
  { at: 1000, name: 'SHOT-CALLER' },
  { at: 1500, name: 'KING OF THE BAY' },
];
const DISTRICTS = [
  { name: 'HARBOR DOCKS', test: (x, z) => x > 120 },
  { name: 'PALM SHORES', test: (x, z) => z > 130 },
  { name: 'NORTH PARK', test: (x, z) => x < -70 && z < -60 },
  { name: 'CENTRAL PLAZA', test: (x, z) => Math.abs(x) < 30 && Math.abs(z) < 30 },
  { name: 'NORTHSIDE', test: (x, z) => z < -90 },
  { name: 'WEST END', test: (x, z) => x < -60 },
  { name: 'DOWNTOWN VELLORA', test: () => true },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (d.test(x, z)) return d.name;
  return 'DOWNTOWN VELLORA';
}

export class RespectRanks {
  constructor(S) {
    this.S = S;
    this.rp = 0;
    this.rank = 0;
    const el = document.createElement('div');
    el.id = 'respect-strip';
    el.className = 'panel';
    el.style.display = 'none';
    el.innerHTML = '<div id="district-name">DOWNTOWN VELLORA</div>' +
      '<div id="respect-row"><span id="respect-badge">1</span>' +
      '<span id="respect-name">ROOKIE</span><span id="respect-num">0 / 100 RP</span></div>' +
      '<div id="respect-track"><div id="respect-fill"></div></div>';
    document.getElementById('hud').appendChild(el);
    this.el = el;
    this.districtEl = el.querySelector('#district-name');
    this.badgeEl = el.querySelector('#respect-badge');
    this.nameEl = el.querySelector('#respect-name');
    this.numEl = el.querySelector('#respect-num');
    this.fillEl = el.querySelector('#respect-fill');
  }

  rpFromJobs() {
    const m = this.S.missions;
    return m.storyIndex * 150 + m.turfIndex * 200 + m.couriersDone * 50;
  }

  rankFor(rp) {
    let r = 0;
    for (let i = 0; i < RANKS.length; i++) if (rp >= RANKS[i].at) r = i;
    return r;
  }

  // Fraction of the way to the next rank, 0–1 (1 at the top rank).
  progress(rp, rank) {
    const next = RANKS[rank + 1];
    if (!next) return 1;
    return Math.min(1, Math.max(0, (rp - RANKS[rank].at) / (next.at - RANKS[rank].at)));
  }

  update() {
    if (!this.S.started) { this.el.style.display = 'none'; return; }
    this.el.style.display = 'block';
    const rp = this.rpFromJobs();
    const rank = this.rankFor(rp);
    if (rank > this.rank) {
      this.S.hud.toast('RANK UP — you are now ' + RANKS[rank].name + '.');
      if (rank === 1) this.S.hud.toast('SMG unlocked — press 3 to draw it.');
      if (rank === 2) this.S.hud.toast('RIFLE unlocked — press 4 to draw it.');
      if (rank === 3) this.S.hud.toast('SHOTGUN unlocked — press 5 to draw it.');
    }
    this.rp = rp;
    this.rank = rank;
    const p = this.S.player;
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    this.districtEl.textContent = districtAt(px, pz);
    this.badgeEl.textContent = String(rank + 1);
    this.nameEl.textContent = RANKS[rank].name;
    const next = RANKS[rank + 1];
    this.numEl.textContent = next ? rp + ' / ' + next.at + ' RP' : rp + ' RP · MAX';
    this.fillEl.style.width = (this.progress(rp, rank) * 100) + '%';
  }
}
