// main.js — Solmar: Streets of Solmar. Boots the renderer, builds the city,
// wires every system together, and runs the frame loop. The game is a
// complete open world: drive, steal, run from the police, fight, and finish
// Mara's four-job story — or just cruise the coast after the story ends.

import * as THREE from '../vendor/three.module.min.js';
import { clamp, dist2D, money, clockText, rand, pick } from './util.js';
import { buildCity } from './city.js';
import { createPlayer, walkPlayer, updateCamera, snapCameraBehindCar, hurtPlayer } from './player.js';
import { spawnParkedCars, driveCar, nearestParkedCar, makeCar } from './vehicles.js';
import { spawnTrafficCars, updateTrafficCars, spawnPedestrians, updatePedestrians, carHitsPeds } from './traffic.js';
import { createWanted, addWanted, clearWanted, updateWanted, syncPoliceCount, updatePolice, CRIME_HEAT } from './police.js';
import { createMissions, startMission, updateMissions, startCourier, checkCourier } from './missions.js';
import { createCombat, spawnThugs, tryPunch, tryShoot, updateThugs, updateTracers } from './combat.js';
import { bindHUD, updateHUD, drawMinimap, showToast } from './hud.js';
import { saveGame, loadGame, hasSave, saveSummary } from './save.js';
import { audio } from './audio.js';

// --- boot ------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc3e8);
scene.fog = new THREE.Fog(0x9fc8e8, 140, 480);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 12, -18);

const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
sun.position.set(120, 180, 60);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 0.75));

// --- world -----------------------------------------------------------------
const city = buildCity(scene);
const player = createPlayer(scene, 8, -14);
const parkedCars = spawnParkedCars(scene, city.parkSpots, 22);
const trafficCars = spawnTrafficCars(scene, city.roadLines, 14, city.bounds);
const peds = spawnPedestrians(scene, city.roadLines, 26, city.bounds);
const policeCars = [];
const wanted = createWanted();
const missions = createMissions(scene, city);
const combat = createCombat();
const hud = bindHUD();

// Cash pickups scattered around the city: small green stacks worth $50-150.
const pickups = [];
{
  const mat = new THREE.MeshLambertMaterial({ color: 0x2a9a4a, emissive: 0x0a4a1a });
  for (let i = 0; i < 14; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), mat);
    const x = pick(city.roadLines) + rand(-4, 4);
    const z = pick(city.roadLines) + rand(-4, 4);
    mesh.position.set(x, 0.6, z);
    scene.add(mesh);
    pickups.push({ mesh, x, z, amount: pick([50, 75, 100, 150]), taken: false, phase: rand(0, 6) });
  }
}

// --- game state ------------------------------------------------------------
const G = {
  mode: 'menu', // menu | play | paused | dead
  cash: 150,
  time: 0,
  deadReason: '',
  interactPressed: false,
  mouseDown: false,
  lastDrag: 0,
  muted: false,
};

const input = {
  forward: false, back: false, left: false, right: false,
  run: false, jump: false, handbrake: false,
};

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump', KeyX: 'handbrake',
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  const name = KEYMAP[e.code];
  if (name) input[name] = true;
  if (e.repeat) return;
  if (e.code === 'KeyE') G.interactPressed = true;
  if (e.code === 'KeyF' && G.mode === 'play' && player.onFoot) doPunch();
  if (e.code === 'KeyR' && G.mode === 'play' && player.onFoot) doReload();
  if (e.code === 'KeyJ' && G.mode === 'play') doCourier();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
window.addEventListener('keyup', (e) => {
  const name = KEYMAP[e.code];
  if (name) input[name] = false;
});

// Mouse: drag orbits the camera; a clean click on foot fires the pistol.
let dragStart = null;
let dragMoved = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragStart = { x: e.clientX, y: e.clientY };
  dragMoved = 0;
  G.mouseDown = true;
});
window.addEventListener('pointermove', (e) => {
  if (!dragStart) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  dragMoved += Math.abs(dx) + Math.abs(dy);
  dragStart = { x: e.clientX, y: e.clientY };
  player.camAngle -= dx * 0.005;
  player.camPitch = clamp(player.camPitch + dy * 0.003, 0.12, 1.1);
  G.lastDrag = G.time;
});
window.addEventListener('pointerup', () => {
  if (dragStart && dragMoved < 6 && G.mode === 'play' && player.onFoot) doShoot();
  dragStart = null;
  G.mouseDown = false;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- actions ---------------------------------------------------------------
function doPunch() {
  const hitPed = (ped) => {
    addWanted(wanted, CRIME_HEAT.punchPed);
    showToast(hud, 'That was assault — the cops noticed.');
  };
  tryPunch(player, combat, peds, hitPed);
}

function doShoot() {
  const result = tryShoot(player, camera, combat, city.colliders, [...parkedCars, ...trafficCars, ...policeCars]);
  if (result === 'empty') {
    if (player.ammo <= 0) showToast(hud, 'Out of ammo — press R to reload.');
    return;
  }
  if (result !== 'none') {
    addWanted(wanted, CRIME_HEAT.shoot);
  } else {
    // Even a missed shot in public draws attention.
    addWanted(wanted, CRIME_HEAT.shoot);
  }
}

function doReload() {
  if (player.ammo < 12) {
    player.ammo = 12;
    audio.blip(520, 0.1, 'square', 0.15);
    showToast(hud, 'Reloaded.');
  }
}

function doCourier() {
  if (!missions.storyDone) {
    showToast(hud, 'Finish Mara’s story first — courier runs unlock after The Drop.');
    return;
  }
  const job = startCourier(missions, { player });
  if (job) showToast(hud, 'Courier run: reach the yellow marker in ' + clockText(missions.sideTimer) + ' for $' + job.reward + '.');
  else showToast(hud, 'A courier run is already active.');
}

function toggleMute() {
  G.muted = !G.muted;
  if (audio.master) audio.master.gain.value = G.muted ? 0 : 0.55;
  showToast(hud, G.muted ? 'Sound muted (M to unmute).' : 'Sound on.');
}

function togglePause() {
  if (G.mode === 'play') {
    G.mode = 'paused';
    showScreen('pause');
  } else if (G.mode === 'paused') {
    G.mode = 'play';
    showScreen(null);
  }
}

// --- entering and leaving cars ---------------------------------------------
function tryEnterCar() {
  const car = nearestParkedCar(parkedCars, player.x, player.z, 4.2);
  if (!car) return false;
  player.car = car;
  player.onFoot = false;
  car.parked = false;
  player.mesh.visible = false;
  snapCameraBehindCar(player, camera);
  audio.carDoor();
  if (!car.stolenByPlayer) {
    car.stolenByPlayer = true;
    addWanted(wanted, CRIME_HEAT.stealCar);
    showToast(hud, 'Car stolen — 1 star. The Solmar PD is watching.');
  } else {
    showToast(hud, 'Back behind the wheel.');
  }
  return true;
}

function exitCar() {
  const car = player.car;
  if (!car) return;
  car.speed = 0;
  const sideX = car.x + Math.cos(car.angle) * 2.6;
  const sideZ = car.z - Math.sin(car.angle) * 2.6;
  player.x = sideX;
  player.z = sideZ;
  player.y = 0;
  player.vy = 0;
  player.angle = car.angle;
  player.camAngle = car.angle;
  player.car = null;
  player.onFoot = true;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  audio.carDoor();
}

// --- mission hooks ---------------------------------------------------------
const missionHooks = {
  addCash: (n) => { G.cash += n; },
  onComplete: (m) => {
    audio.missionDone();
    showToast(hud, m.title + ' complete — ' + money(m.reward) + ' earned.');
    saveGame({ cash: G.cash, missions, player });
  },
  onPickupStart: () => {
    // The rival crew waits on open ground east of the pier, not on the deck.
    combat.thugs = spawnThugs(scene, [
      { x: city.docksPos.x + 20, z: city.docksPos.z - 8 },
      { x: city.docksPos.x + 24, z: city.docksPos.z + 6 },
      { x: city.docksPos.x + 18, z: city.docksPos.z + 14 },
    ]);
    showToast(hud, 'Rival crew at the Docks — watch yourself.');
  },
  onHeatStart: () => {
    addWanted(wanted, 2);
    showToast(hud, 'Two stars! Lose the cops.');
  },
  onStoryDone: () => {
    showToast(hud, 'The Solmar Job is done. Mara owes you one — courier runs (J) now pay.');
    saveGame({ cash: G.cash, missions, player });
  },
};

// --- screens ----------------------------------------------------------------
function showScreen(name) {
  for (const id of ['screen-start', 'screen-pause', 'screen-dead']) {
    document.getElementById(id).classList.toggle('hidden', id !== 'screen-' + name);
  }
  // The HUD only shows while actually playing.
  document.getElementById('hud').classList.toggle('hidden', !!name);
}

function startGame(fromSave) {
  audio.unlock();
  G.mode = 'play';
  showScreen(null);
  if (fromSave) {
    const data = loadGame();
    if (data) {
      G.cash = data.cash;
      player.health = data.health;
      player.ammo = data.ammo;
      player.x = data.playerX;
      player.z = data.playerZ;
      player.angle = data.playerAngle;
      player.mesh.position.set(player.x, 0, player.z);
      missions.index = data.missionIndex;
      missions.storyDone = data.storyDone;
      missions.courierCount = data.courierCount || 0;
      if (!data.storyDone) startMission(missions, data.missionIndex, missionHooks);
      showToast(hud, 'Welcome back to Solmar.');
      return;
    }
  }
  startMission(missions, 0, missionHooks);
}

document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-save').addEventListener('click', () => {
  if (saveGame({ cash: G.cash, missions, player })) showToast(hud, 'Game saved.');
  else showToast(hud, 'Save failed — browser storage is blocked.');
});
document.getElementById('btn-restart').addEventListener('click', () => {
  window.location.href = window.location.pathname;
});
document.getElementById('btn-respawn').addEventListener('click', respawn);
document.getElementById('btn-howto').addEventListener('click', () => {
  document.getElementById('howto').classList.toggle('hidden');
});

// Continue button only appears when a save exists.
if (hasSave()) {
  const btn = document.getElementById('btn-continue');
  btn.classList.remove('hidden');
  btn.textContent = 'Continue — ' + saveSummary();
}

// --- death and respawn -------------------------------------------------------
function die(reason) {
  G.mode = 'dead';
  G.deadReason = reason;
  const title = document.getElementById('dead-title');
  title.textContent = reason === 'busted' ? 'BUSTED' : 'WASTED';
  document.getElementById('dead-sub').textContent =
    reason === 'busted'
      ? 'The Solmar PD caught you. You post bail and walk free — minus a few hundred.'
      : 'You black out on the streets of Solmar. The clinic patches you up — for a fee.';
  showScreen('dead');
  audio.setSiren(false);
}

function respawn() {
  G.cash = Math.max(0, G.cash - 250);
  player.health = 100;
  player.ammo = 12;
  player.x = 8;
  player.z = -14;
  player.y = 0;
  player.vy = 0;
  player.angle = 0;
  if (player.car) {
    player.car.parked = true;
    player.car.speed = 0;
    player.car = null;
  }
  player.onFoot = true;
  player.mesh.visible = true;
  player.mesh.position.set(player.x, 0, player.z);
  clearWanted(wanted);
  for (const pc of policeCars.splice(0)) {
    pc.mesh.visible = false;
    scene.remove(pc.mesh);
  }
  G.mode = 'play';
  showScreen(null);
  showToast(hud, 'Back on your feet. $250 lighter.');
}

// --- staged screenshot modes -----------------------------------------------
// ?shot=street | chase | mission | start stages a scene for screenshots.
// These are real renders of the live game, not composites.
function stageShot(shot) {
  startGame(false);
  if (shot === 'start') {
    G.mode = 'menu';
    showScreen('start');
    return;
  }
  if (shot === 'street') {
    // On foot on Palm Row (road x=87), facing north down the street.
    player.x = 87; player.z = 30;
    player.angle = Math.PI * 0.95;
    player.camAngle = Math.PI * 0.95;
    player.mesh.position.set(player.x, 0, player.z);
    // Pull a few traffic cars onto this road so the shot shows the city alive.
    for (let i = 0; i < 4 && i < trafficCars.length; i++) {
      const tc = trafficCars[i];
      tc.vertical = true;
      tc.line = 87;
      tc.dir = i % 2 ? 1 : -1;
      tc.x = 87 + 3.4 * tc.dir;
      tc.z = 30 + (i - 1.5) * 22;
      tc.angle = tc.dir > 0 ? 0 : Math.PI;
      tc.speed = tc.cruise;
    }
    camera.position.set(player.x - 6, 5, player.z - 8);
    return;
  }
  if (shot === 'chase') {
    const car = makeCar(scene, 'sports', 87, 87, Math.PI / 2);
    parkedCars.push(car);
    player.x = 87; player.z = 87;
    tryEnterCar();
    player.car.speed = 16;
    startMission(missions, 2, missionHooks);
    // Stage the chase at 3 stars (the mission's hook adds 2, so set it after).
    wanted.level = 3;
    wanted.heat = 100;
    audio.setSiren(true);
    // Two cruisers ahead on the same road, charging at the player, so the
    // chase reads in the frame instead of only on the minimap.
    for (const [ox, oz] of [[30, 5], [46, -5]]) {
      const pc = makeCar(scene, 'police', 87 + ox, 87 + oz, Math.PI / 2);
      pc.parked = false;
      pc.speed = 12;
      pc.cruise = 12;
      pc.vertical = false;
      pc.line = 87;
      pc.dir = 1;
      pc.wait = 0;
      policeCars.push(pc);
    }
    // Keep the car rolling for the screenshot: hold the throttle, capped.
    G.autoDrive = true;
    player.camAngle = player.car.angle;
    camera.position.set(87, 6, 69);
    return;
  }
  if (shot === 'mission') {
    startMission(missions, 1, missionHooks);
    // Stand south-east of the pier, facing the yellow beacon and the thugs.
    const tx = city.docksPos.x;
    const tz = city.docksPos.z;
    player.x = tx + 30;
    player.z = tz - 30;
    player.angle = Math.atan2(tx - player.x, tz - player.z);
    player.camAngle = player.angle;
    player.mesh.position.set(player.x, 0, player.z);
    addWanted(wanted, 1);
    camera.position.set(player.x - 7, 5, player.z - 9);
    return;
  }
}

// --- frame loop --------------------------------------------------------------
const clock = new THREE.Clock();
let hudAccum = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  if (G.mode === 'play') {
    stepGame(dt);
  }
  // The menu still renders the city behind the title, slowly orbiting.
  if (G.mode === 'menu') {
    const a = G.time * 0.05;
    camera.position.set(Math.sin(a) * 90, 42, Math.cos(a) * 90);
    camera.lookAt(0, 8, 20);
  }
  renderer.render(scene, camera);
}

function stepGame(dt) {
  player.invuln = Math.max(0, player.invuln - dt);
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);

  // Enter / exit cars. Keep the press for the mission check below, so
  // pressing E at a mission marker still collects the package.
  const interact = G.interactPressed;
  if (interact) {
    if (player.onFoot) tryEnterCar();
    else exitCar();
  }
  G.interactPressed = false;

  // Move the player or the car.
  let speedKmh = 0;
  if (player.car) {
    const car = player.car;
    // Staged chase mode holds the throttle and cruises at ~15 m/s so the
    // screenshot shows the car moving with the police closing in.
    if (G.autoDrive) {
      input.forward = car.speed < 15;
      input.back = false;
    }
    const spd = driveCar(car, input, dt, city.colliders, () => {
      audio.crash();
    });
    speedKmh = spd * 3.6;
    audio.setEngine(Math.abs(spd) / 30, true);
    // Camera eases back behind the car when the mouse is idle.
    if (G.time - G.lastDrag > 1.6) {
      const diff = ((car.angle - player.camAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      player.camAngle += diff * Math.min(1, dt * 1.4);
    }
    player.x = car.x;
    player.z = car.z;
    player.angle = car.angle;
    const hits = carHitsPeds(car, peds);
    if (hits > 0) {
      addWanted(wanted, CRIME_HEAT.hitPed * hits);
      audio.crash();
      showToast(hud, 'You hit a pedestrian — the city saw it.');
    }
  } else {
    walkPlayer(player, input, dt, city.colliders);
    audio.setEngine(0, false);
  }

  updateTrafficCars(trafficCars, city.roadLines, city.bounds, dt, player.car, policeCars);
  updatePedestrians(peds, dt, player.car || player, null, city.colliders);
  updateWanted(wanted, dt, policeCars, player.x, player.z);
  syncPoliceCount(scene, policeCars, wanted, player.x, player.z, city.roadLines);
  updatePolice(policeCars, dt, player, city.colliders,
    (s) => { audio.crash(); },
    (s) => {
      if (hurtPlayer(player, 12)) die(player.car ? 'wasted' : 'busted');
    });
  updateThugs(combat, dt, player, (dmg) => {
    if (hurtPlayer(player, dmg)) die('wasted');
  });
  updateTracers(combat, dt);

  // Cash pickups bob, spin, and pay out on foot.
  for (const pk of pickups) {
    if (pk.taken) continue;
    pk.phase += dt;
    pk.mesh.rotation.y += dt * 2;
    pk.mesh.position.y = 0.6 + Math.sin(pk.phase * 3) * 0.15;
    if (player.onFoot && dist2D(player.x, player.z, pk.x, pk.z) < 2.2) {
      pk.taken = true;
      pk.mesh.visible = false;
      G.cash += pk.amount;
      audio.pickup();
      showToast(hud, 'Found $' + pk.amount + ' stashed on the street.');
    }
  }

  // Missions and courier jobs.
  const missionStatus = updateMissions(missions, {
    player, wanted, interactPressed: interact, hooks: missionHooks,
    toast: (t) => showToast(hud, t),
  }, dt);
  if (missionStatus && missionStatus.startsWith('Press E')) {
    G.missionPrompt = missionStatus;
  } else {
    G.missionPrompt = null;
  }
  if (missions.storyDone && missions.side) {
    checkCourier(missions, { player, hooks: missionHooks, toast: (t) => showToast(hud, t) });
  }

  // Ocean shimmer: a slow drift so the coast never looks frozen.
  city.ocean.position.z = city.bounds + 290 + Math.sin(G.time * 0.2) * 2;

  updateCamera(player, camera, dt);

  // HUD, throttled to every other frame for the minimap.
  hudAccum += dt;
  if (hudAccum > 0.05) {
    hudAccum = 0;
    updateHUD(hud, {
      cash: G.cash,
      health: player.health,
      wanted: wanted.level,
      mission: missions.current,
      storyDone: missions.storyDone,
      side: missions.side,
      objective: missions.side
        ? 'Courier: reach the marker — ' + clockText(missions.sideTimer) + ' left'
        : G.missionPrompt || (missions.current ? missions.current.hint : ''),
      driving: !!player.car,
      speedKmh,
      ammo: player.ammo,
      prompt: promptText(),
      toast: null,
    });
    drawMinimap(hud.minimap, {
      span: 240,
      roadLines: city.roadLines,
      oceanZ: city.bounds + 40,
      target: missions.target,
      traffic: trafficCars,
      police: policeCars,
      playerX: player.x,
      playerZ: player.z,
      playerAngle: player.angle,
      time: G.time,
    });
  }
}

function promptText() {
  if (!player.onFoot) return 'E — Exit car · X — Handbrake';
  const car = nearestParkedCar(parkedCars, player.x, player.z, 4.2);
  if (car) return 'E — Steal the ' + car.type;
  return 'WASD — Move · Shift — Run · Space — Jump · F — Punch · Click — Shoot';
}

// --- boot --------------------------------------------------------------------
{
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    stageShot(shot);
    window.__shotReady = true;
  } else {
    showScreen('start');
  }
  // Debug handle for play-testing: read the live game state from the console.
  window.__solmar = {
    player, wanted, missions, policeCars, trafficCars, parkedCars, peds,
    get cash() { return G.cash; },
    get mode() { return G.mode; },
  };
  frame();
}
