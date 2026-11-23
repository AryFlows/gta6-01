// Weapon wheel: 5 slots on keys 1–5, gated by respect rank.
const SLOTS = [
  { id: 'fists', key: '1', label: 'FISTS', rank: 1 },
  { id: 'pistol', key: '2', label: 'PISTOL', rank: 1 },
  { id: 'smg', key: '3', label: 'SMG', rank: 2 },
  { id: 'rifle', key: '4', label: 'RIFLE', rank: 3 },
  { id: 'shotgun', key: '5', label: 'SHOTGUN', rank: 4 },
];

export class WeaponWheel {
  constructor(S) {
    this.S = S;
    const el = document.createElement('div');
    el.id = 'weapon-wheel';
    el.className = 'panel';
    el.style.display = 'none';
    document.getElementById('hud').appendChild(el);
    this.el = el;
    window.addEventListener('keydown', (e) => {
      if (!S.started || S.paused || S.over) return;
      const slot = SLOTS.find((s) => e.code === 'Digit' + s.key);
      if (slot) this.select(slot.id);
    });
  }

  rank() {
    return this.S.respect ? this.S.respect.rank + 1 : 1;
  }

  unlocked(slot) {
    return this.rank() >= slot.rank;
  }

  select(id) {
    const slot = SLOTS.find((s) => s.id === id);
    if (!slot) return;
    if (!this.unlocked(slot)) {
      this.S.hud.toast('Reach RANK ' + slot.rank + ' to unlock the ' + slot.label + '.');
      return;
    }
    this.S.combat.setWeapon(id);
  }

  slotAmmo(slot, current) {
    if (!this.unlocked(slot)) return 'R' + slot.rank;
    if (slot.id === 'fists') return '∞';
    const w = this.S.combat.weapons[slot.id];
    if (!w) return '—';
    return slot.id === current ? w.ammo + ' / ' + w.mag : String(w.ammo);
  }

  update() {
    if (!this.S.started) { this.el.style.display = 'none'; return; }
    this.el.style.display = 'flex';
    const current = this.S.combat.weaponId;
    let html = '<div id="wheel-header">WEAPONS</div>';
    for (const s of SLOTS) {
      const cls = 'wheel-slot' + (s.id === current ? ' selected' : '') + (this.unlocked(s) ? '' : ' locked');
      html += '<div class="' + cls + '"><span class="wheel-key">' + s.key + '</span>' +
        '<span class="wheel-name">' + s.label + '</span>' +
        '<span class="wheel-ammo">' + this.slotAmmo(s, current) + '</span></div>';
    }
    this.el.innerHTML = html;
  }
}
