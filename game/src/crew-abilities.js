// Crew abilities: Mara (Z), Lio (X), Kiki (C), each with a cooldown.
const CREW = [
  { id: 'mara', key: 'Z', name: 'MARA', role: 'FIXER', ability: 'SWAP PLATES', cd: 60, color: '#ff9a3d' },
  { id: 'lio', key: 'X', name: 'LIO', role: 'MECHANIC', ability: 'PATCH UP', cd: 45, color: '#46c25a' },
  { id: 'kiki', key: 'C', name: 'KIKI', role: 'LOOKOUT', ability: 'EYES OUT', cd: 30, color: '#8fd8ff' },
];

function bearing(dx, dz) {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'EAST' : 'WEST';
  return dz > 0 ? 'SOUTH' : 'NORTH';
}

export class CrewAbilities {
  constructor(S) {
    this.S = S;
    this.left = { mara: 0, lio: 0, kiki: 0 };
    const el = document.createElement('div');
    el.id = 'crew-panel';
    el.className = 'panel';
    el.style.display = 'none';
    document.getElementById('hud').appendChild(el);
    this.el = el;
    window.addEventListener('keydown', (e) => {
      if (!S.started || S.paused || S.over) return;
      const m = CREW.find((c) => e.code === 'Key' + c.key);
      if (m) this.use(m.id);
    });
  }

  member(id) {
    return CREW.find((c) => c.id === id);
  }

  use(id) {
    const S = this.S;
    const m = this.member(id);
    if (!m) return;
    if (this.left[id] > 0) {
      S.hud.toast(m.name + ' is not ready yet — ' + Math.ceil(this.left[id]) + 's.');
      return;
    }
    if (id === 'mara') {
      if (S.police.stars === 0) {
        S.hud.toast('No heat to lose — Mara keeps the plates.');
        return;
      }
      S.police.wanted = Math.max(0, S.police.wanted - 1);
      S.hud.setStars(S.police.stars);
      S.hud.toast('Mara swapped the plates — heat down a star.');
    } else if (id === 'lio') {
      S.player.heal(50);
      S.hud.toast('Lio patched you up. +50 health.');
    } else {
      const cs = S.police.cruisers;
      if (cs.length === 0) {
        S.hud.toast('Kiki: clear skies — no cruisers on you.');
      } else {
        const p = S.player;
        const px = p.car ? p.car.x : p.x;
        const pz = p.car ? p.car.z : p.z;
        let best = cs[0];
        let bd = Infinity;
        for (const c of cs) {
          const d = Math.hypot(c.x - px, c.z - pz);
          if (d < bd) { bd = d; best = c; }
        }
        S.hud.toast('Kiki: ' + cs.length + ' cruisers — nearest ' + Math.round(bd) +
          'm ' + bearing(best.x - px, best.z - pz) + '.');
      }
    }
    this.left[id] = m.cd;
  }

  update(dt) {
    if (!this.S.started) { this.el.style.display = 'none'; return; }
    this.el.style.display = 'flex';
    for (const m of CREW) this.left[m.id] = Math.max(0, this.left[m.id] - dt);
    let html = '<div id="crew-header">CREW</div>';
    for (const m of CREW) {
      const ready = this.left[m.id] <= 0;
      const pct = Math.round((1 - this.left[m.id] / m.cd) * 100);
      html += '<div class="crew-row"><span class="crew-chip" style="background:' + m.color + '">' +
        m.name[0] + '</span><span class="crew-name">' + m.name + '</span>' +
        '<span class="crew-ability">' + m.ability + '</span>' +
        '<span class="crew-key">' + m.key + '</span>' +
        '<span class="crew-cd">' + (ready ? 'READY' : Math.ceil(this.left[m.id]) + 's') + '</span>' +
        '<span class="crew-track"><span class="crew-fill" style="width:' + pct + '%;background:' +
        m.color + '"></span></span></div>';
    }
    this.el.innerHTML = html;
  }
}
