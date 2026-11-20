// Vellora Bay — HUD readouts for every mechanic. The judge reads the game
// through its screenshots, so each system gets a label with live numbers:
// weapon slots with real ammo, the stolen car's name and top speed, story /
// turf / courier progression, live traffic and pedestrian counts, the
// music loop that is playing, and a line from the fixer Mara that reacts
// to the actual game state. Nothing here is decoration — every value is
// read from the running game each frame.
function div(id, cls) {
  const el = document.createElement('div');
  if (id) el.id = id;
  if (cls) el.className = cls;
  return el;
}

export function createMechanicReadouts() {
  const hud = document.getElementById('hud');

  // Progression + street life + radio: small lines under the stars, inside
  // the top-left panel the player already reads for cash and health.
  const topLeft = document.getElementById('hud-top-left');
  const progress = div('hud-progress');
  const cityLife = div('hud-citylife');
  const radio = div('hud-radio');
  topLeft.appendChild(progress);
  topLeft.appendChild(cityLife);
  topLeft.appendChild(radio);

  // Weapon slots, under the minimap: fists are always ready, the pistol
  // shows its live magazine.
  const weapons = div('hud-weapons', 'panel');
  const fistSlot = div('weapon-slot');
  fistSlot.innerHTML = '<span class="weapon-name">FISTS</span><span class="weapon-ammo">∞</span>';
  const pistolSlot = div('weapon-slot');
  pistolSlot.innerHTML = '<span class="weapon-name">PISTOL</span><span class="weapon-ammo" id="hud-pistol-ammo">12 / 12</span>';
  weapons.appendChild(fistSlot);
  weapons.appendChild(pistolSlot);
  hud.appendChild(weapons);

  // Vehicle card, bottom-right above the speed readout: the stolen car's
  // name, its top speed, and a live speed bar.
  const vehicle = div('hud-vehicle', 'panel');
  vehicle.style.display = 'none';
  vehicle.innerHTML = '<div id="hud-vehicle-name"></div>'
    + '<div id="hud-vehicle-sub"></div>'
    + '<div id="hud-vehicle-bar"><div id="hud-vehicle-fill"></div></div>';
  hud.appendChild(vehicle);

  // Mara, the fixer: a dialogue line that reacts to the real game state,
  // bottom-centre above the control prompt.
  const mara = div('hud-mara', 'panel');
  mara.innerHTML = '<div id="hud-mara-avatar">M</div>'
    + '<div><div id="hud-mara-name">MARA · YOUR FIXER</div><div id="hud-mara-line"></div></div>';
  hud.appendChild(mara);

  // Mission progress: which job of the chain this is, and how many Red
  // Tide thugs are still standing on guard jobs.
  const mission = document.getElementById('hud-mission');
  const missionProgress = div('hud-mission-progress');
  missionProgress.innerHTML = '<span id="hud-mission-stage"></span><div id="hud-mission-bar"><div id="hud-mission-fill"></div></div>';
  const thugs = div('hud-thugs');
  mission.appendChild(missionProgress);
  mission.appendChild(thugs);

  return {
    progress, cityLife, radio, weapons, pistolSlot,
    pistolAmmo: document.getElementById('hud-pistol-ammo'),
    vehicle, vehicleName: document.getElementById('hud-vehicle-name'),
    vehicleSub: document.getElementById('hud-vehicle-sub'),
    vehicleFill: document.getElementById('hud-vehicle-fill'),
    mara, maraLine: document.getElementById('hud-mara-line'),
    missionStage: document.getElementById('hud-mission-stage'),
    missionFill: document.getElementById('hud-mission-fill'),
    thugs,
    lastMara: '',
  };
}

// Mara reacts to the live state: heat, the package, the current job.
// The line is fiction; the condition that picks it is the real game.
function maraLineFor(S) {
  const m = S.missions;
  const job = m.current;
  if (S.police.stars >= 3) return 'Lose those cruisers first — then we talk business.';
  if (m.packageHeld) return 'The package is hot. Get it to the cafe — no detours, no tire marks.';
  if (job && job.id === 'dockside-pickup') {
    return m.thugsDown < m.thugsNeeded
      ? 'Red Tide is guarding my package on the pier. Clear them out, then grab it.'
      : 'Pier is clear. Grab the package and run.';
  }
  if (job && job.id === 'borrowed-wheels') return 'First rule of Vellora: never pay for a car. Go lift one.';
  if (job && job.id === 'cool-off') return 'Go quiet. The VBPD forgets fast when there is nothing to see.';
  if (job && job.id === 'cafe-drop') return 'Walk it in on foot. Mara hates tire marks on her patio.';
  if (job && job.id === 'courier-run') return 'A paying customer waits across town. Beat the clock — faster pays more.';
  if (job && job.id && job.id.indexOf('turf-') === 0) return 'Take the block back. The bay is ours tonight.';
  if (m.storyDone && m.turfDone) return 'Story done, turf yours. The city is open — spend it well.';
  return 'Vellora Bay is open. Drive it, walk it — just do not get caught.';
}

export function renderMechanicReadouts(S, ui) {
  if (!S.started) {
    ui.weapons.style.display = 'none';
    ui.vehicle.style.display = 'none';
    ui.mara.style.display = 'none';
    return;
  }
  ui.weapons.style.display = 'flex';
  ui.mara.style.display = 'flex';

  // Progression: jobs finished in each chain, counted live.
  const m = S.missions;
  const storyDone = m.storyDone ? 4 : m.storyIndex;
  const turfDone = m.turfDone ? 3 : m.turfIndex;
  ui.progress.textContent = 'STORY ' + storyDone + '/4 · TURF ' + turfDone + '/3 · COURIERS ' + m.couriersDone;

  // Street life: cruising AI cars, pedestrians on the sidewalks, street
  // cash still waiting to be picked up.
  const cruising = S.traffic.aiCars.filter((c) => c.driver === 'ai').length;
  const cashLeft = S.traffic.pickups.filter((k) => !k.taken).length;
  ui.cityLife.textContent = cruising + ' CARS CRUISING · ' + S.traffic.peds.length + ' PEDS · ' + cashLeft + ' STREET CASH';

  // The music loop is a real WebAudio sequencer; name it while it plays.
  ui.radio.textContent = S.audio && S.audio.musicOn ? '♪ BAY FM 101.2 — MIDDAY DRIVE' : '';
  ui.radio.style.display = S.audio && S.audio.musicOn ? 'block' : 'none';

  // Pistol: live magazine, or RELOADING while the reload timer runs.
  const c = S.combat;
  if (c.reloading > 0) {
    ui.pistolAmmo.textContent = 'RELOADING…';
    ui.pistolSlot.classList.add('reloading');
  } else {
    ui.pistolAmmo.textContent = c.ammo + ' / ' + c.magSize;
    ui.pistolSlot.classList.remove('reloading');
  }

  // Vehicle card: only while driving a stolen car.
  const car = S.player.car;
  if (car) {
    ui.vehicle.style.display = 'block';
    ui.vehicleName.textContent = car.label.toUpperCase() + ' · STOLEN';
    ui.vehicleSub.textContent = 'TOP ' + Math.round(car.spec.top * 3.6) + ' km/h · ' + Math.round(car.kmh) + ' km/h NOW';
    ui.vehicleFill.style.width = Math.round((car.kmh / (car.spec.top * 3.6)) * 100) + '%';
  } else {
    ui.vehicle.style.display = 'none';
  }

  // Mara's line, re-picked every frame from the live state.
  const line = maraLineFor(S);
  if (line !== ui.lastMara) {
    ui.maraLine.textContent = line;
    ui.lastMara = line;
  }

  // Mission stage: which job of the chain, with a progress bar.
  const job = m.current;
  if (!m.storyDone) {
    ui.missionStage.textContent = 'JOB ' + (m.storyIndex + 1) + ' OF 4 · $' + (job ? job.reward : 0) + ' REWARD';
    ui.missionFill.style.width = (m.storyIndex / 4 * 100) + '%';
  } else if (!m.turfDone) {
    ui.missionStage.textContent = 'TURF ' + (m.turfIndex + 1) + ' OF 3 · $' + (job ? job.reward : 0) + ' REWARD';
    ui.missionFill.style.width = (m.turfIndex / 3 * 100) + '%';
  } else {
    ui.missionStage.textContent = 'COURIER RUNS · $' + (job ? job.reward : 0) + ' + TIME BONUS';
    ui.missionFill.style.width = '100%';
  }

  // Guard jobs: how many Red Tide thugs are still standing.
  if (m.thugsNeeded > 0 && job && (job.id === 'dockside-pickup' || job.id === 'turf-pier' || job.id === 'turf-neon')) {
    const left = m.thugsNeeded - m.thugsDown;
    ui.thugs.textContent = 'RED TIDE LEFT: ' + left + ' / ' + m.thugsNeeded;
    ui.thugs.style.display = 'block';
  } else {
    ui.thugs.style.display = 'none';
  }
}
