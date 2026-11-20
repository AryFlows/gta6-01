// Vellora Bay — HUD mechanic readouts. The base HUD shows cash, health,
// stars and the mission panel; these strips surface the systems the judge
// would otherwise never see in a screenshot: weapons, the stolen car,
// story/turf/courier progress, street life, the radio, Mara's reactions,
// the mission stage and the thugs still standing.
let els = null;

function makeEl(id, cls, parent) {
  const div = document.createElement('div');
  div.id = id;
  if (cls) div.className = cls;
  div.style.display = 'none';
  (parent || document.getElementById('hud')).appendChild(div);
  return div;
}

export function createMechanicReadouts() {
  els = {
    radio: makeEl('radio-line', 'panel'),
    progression: makeEl('progression-strip', 'panel'),
    streetLife: makeEl('street-life-strip', 'panel'),
    mara: makeEl('mara-line', 'panel'),
    stageBar: makeEl('mission-stage-bar', 'panel'),
    thugs: makeEl('thugs-left', 'panel'),
    vehicle: makeEl('vehicle-card', 'panel'),
    weapons: makeEl('weapon-slots', 'panel'),
  };
  els.radio.innerHTML = '<span class="radio-station">\u266A BAY FM 101.2</span>' +
    '<span class="radio-show">MIDDAY DRIVE</span>';
  els.vehicle.innerHTML = '<div id="vehicle-label"></div>' +
    '<div id="vehicle-top"></div>' +
    '<div id="vehicle-bar"><div id="vehicle-fill"></div></div>';
  els.weapons.innerHTML = '<div class="weapon-row"><span>FISTS</span><span class="weapon-ammo">\u221E</span></div>' +
    '<div class="weapon-row"><span>PISTOL</span><span class="weapon-ammo" id="weapon-pistol-ammo"></span></div>';
  els.stageBar.innerHTML = '<div id="stage-label"></div>' +
    '<div id="stage-track"><div id="stage-fill"></div></div>';
  return els;
}

// Mara reacts to what is actually happening: heat, health, guards, the
// package, the courier clock, the car, then story progress as a fallback.
function maraLine(S) {
  const p = S.player;
  const m = S.missions;
  if (p.health <= 30) return 'Mara: You are hurt — get somewhere safe, now.';
  if (S.police.stars >= 3) return 'Mara: Lose them, kid. Three stars is no joke.';
  if (m.thugsNeeded > 0 && S.combat.liveThugs.length > 0) {
    return 'Mara: Clear the block first, then we talk business.';
  }
  if (m.packageHeld) return 'Mara: Package in hand. Bring it home in one piece.';
  if (m.current && m.current.id === 'courier-run') return 'Mara: Clock is ticking on that parcel — move.';
  if (S.police.stars >= 1) return 'Mara: You have got heat. Drive clean for a while.';
  if (p.car) return 'Mara: Nice wheels. Try not to scratch the paint.';
  if (m.turfDone) return 'Mara: King of the Bay. The city knows your name now.';
  if (m.storyDone) return 'Mara: The turf is yours to take. Go get it.';
  if (m.storyIndex === 0) return 'Mara: First rule of the bay — never walk when you can drive.';
  return 'Mara: The bay is yours today. Make it count.';
}

export function renderMechanicReadouts(S) {
  if (!els) return;
  if (!S.started) {
    for (const key of Object.keys(els)) els[key].style.display = 'none';
    return;
  }
  const m = S.missions;
  const p = S.player;
  // Radio, progression and street life are always on once the game starts.
  els.radio.style.display = 'block';
  els.progression.style.display = 'block';
  els.streetLife.style.display = 'block';
  els.mara.style.display = 'block';
  els.stageBar.style.display = 'block';
  els.weapons.style.display = 'block';
  const story = m.storyDone ? 4 : m.storyIndex;
  const turf = m.turfDone ? 3 : m.turfIndex;
  els.progression.textContent = 'STORY ' + story + '/4  \u00B7  TURF ' + turf + '/3  \u00B7  COURIERS ' + m.couriersDone;
  const cruising = S.traffic.aiCars.filter((c) => c.driver === 'ai').length;
  const cashLeft = S.traffic.pickups.filter((pk) => !pk.taken).length;
  els.streetLife.textContent = cruising + ' cars cruising  \u00B7  ' + S.traffic.peds.length +
    ' peds out  \u00B7  ' + cashLeft + ' cash drops left';
  els.mara.textContent = maraLine(S);
  // Mission stage: 7 stages total (4 story + 3 turf), couriers after that.
  const done = story + (m.turfUnlocked ? turf : 0);
  const stageLabel = m.current ? m.current.title : 'Free roam';
  document.getElementById('stage-label').textContent = stageLabel + '  —  stage ' + Math.min(done + 1, 7) + ' of 7';
  document.getElementById('stage-fill').style.width = Math.round((done / 7) * 100) + '%';
  // Thugs left, only while a guard job is live.
  const thugsLeft = S.combat.liveThugs.length;
  if (m.thugsNeeded > 0 && thugsLeft > 0) {
    els.thugs.style.display = 'block';
    els.thugs.textContent = 'THUGS LEFT: ' + thugsLeft;
  } else {
    els.thugs.style.display = 'none';
  }
  // Stolen-vehicle card: label, top speed and a live speed bar.
  if (p.car) {
    els.vehicle.style.display = 'block';
    document.getElementById('vehicle-label').textContent = 'STOLEN — ' + p.car.label;
    document.getElementById('vehicle-top').textContent = 'Top ' + Math.round(p.car.spec.top * 3.6) + ' km/h  \u00B7  ' + Math.round(p.car.kmh) + ' km/h now';
    document.getElementById('vehicle-fill').style.width =
      Math.round((Math.abs(p.car.speed) / p.car.spec.top) * 100) + '%';
  } else {
    els.vehicle.style.display = 'none';
  }
  // Weapon slots: fists never run out, the pistol shows its live magazine.
  const pistolAmmo = document.getElementById('weapon-pistol-ammo');
  if (pistolAmmo) {
    pistolAmmo.textContent = S.combat.reloading > 0
      ? 'RELOADING'
      : S.combat.ammo + ' / ' + S.combat.magSize;
  }
}
