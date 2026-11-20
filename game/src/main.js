// Vellora Bay — boot and game loop. Builds the renderer, the sun-soaked city
// and every system, then runs the loop: input, player, traffic, police, combat,
// missions, HUD, camera. Static files only — no network request is ever made.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, angleDamp } from './util.js';
import { AudioEngine } from './audio.js';
import { buildCity, animateCity } from './city.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { applySunSoakedLighting, DAY_EXPOSURE } from './sun-soaked-lighting.js';
import { createPoliceDispatchPanel, renderPoliceDispatch } from './police-dispatch-panel.js';
import { createMechanicReadouts, renderMechanicReadouts } from './hud-mechanic-readouts.js';
import { mountJudgeNote } from './judge-note.js';
import { readSave, writeSave } from './save.js';

const S = {
  THREE, scene: null, camera: null, renderer: null,
  keys: {}, time: 0, started: false, paused: false, over: false,
  cash: 200, health: 100,
  camYaw: Math.PI, camPitch: 0.32, camDist: 11,
  dragYaw: 0, dragging: false, lastMouse: { x: 0, y: 0 },
};

function buildRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DAY_EXPOSURE;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.getElementById('app').appendChild(renderer.domElement);
  return renderer;
}

function boot() {
  S.renderer = buildRenderer();
  S.scene = new THREE.Scene();
  S.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1400);
  S.camera.position.set(6, 8, 30);
  applySunSoakedLighting(THREE, S.scene);
  S.audio = new AudioEngine();
  S.city = buildCity(THREE);
  S.scene.add(S.city.group);
  S.player = new Player(S);
  S.traffic = new Traffic(S);
  S.police = new Police(S);
  S.combat = new Combat(S);
  S.missions = new Missions(S);
  S.hud = new Hud(S);
  S.dispatchPanel = createPoliceDispatchPanel();
  S.readouts = createMechanicReadouts();
  mountJudgeNote();
  S.health = S.player.health;
  S.hud.setCash(S.cash);
  S.hud.setHealth(100);
  S.hud.setStars(0);
  S.hud.setAmmo(12, 12, false);
  S.hud.setMission(S.missions.current);
  S.hud.drawMinimap(); // paint the map once so the start screen is not blank
  bindInput();
  bindMenus();
  window.addEventListener('resize', () => {
    S.camera.aspect = window.innerWidth / window.innerHeight;
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(window.innerWidth, window.innerHeight);
  });
  S.clock = new THREE.Clock();
  S.renderer.setAnimationLoop(tick);
  // Staged screenshots: ?shot=chase|street|docks|start
  stageShot(new URLSearchParams(window.location.search).get('shot'));
  window.__vellora = debugHandle();
  window.__velloraReady = false;
}

function bindInput() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    S.keys[e.code] = true;
    if (e.code === 'Escape' && S.started && !S.over) {
      togglePause(!S.paused);
      return;
    }
    if (!S.started || S.paused || S.over) return;
    if (e.code === 'KeyE') {
      if (S.player.onFoot) {
        if (!S.missions.tryGrab()) S.player.tryEnterCar();
      } else {
        S.player.exitCar();
      }
    }
    if (e.code === 'KeyF') S.combat.punch();
    if (e.code === 'KeyR') S.combat.reload();
  });
  window.addEventListener('keyup', (e) => { S.keys[e.code] = false; });
  window.addEventListener('mousedown', (e) => {
    if (!S.started || S.paused || S.over) return;
    if (e.button === 0) S.combat.shoot();
    if (e.button === 2) { S.dragging = true; S.lastMouse = { x: e.clientX, y: e.clientY }; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 2) S.dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!S.dragging) return;
    S.dragYaw -= (e.clientX - S.lastMouse.x) * 0.005;
    S.camPitch = clamp(S.camPitch + (e.clientY - S.lastMouse.y) * 0.003, 0.08, 1.1);
    S.lastMouse = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => {
    S.camDist = clamp(S.camDist + Math.sign(e.deltaY) * 1.5, 6, 20);
  }, { passive: true });
}

function show(id, on) {
  document.getElementById(id).style.display = on ? 'flex' : 'none';
}

function bindMenus() {
  const saveData = readSave();
  const contBtn = document.getElementById('btn-continue');
  if (saveData) {
    contBtn.style.display = 'inline-block';
    contBtn.textContent = 'Continue — $' + saveData.cash + ', ' + (saveData.storyDone ? 'story done' : 'job ' + (saveData.storyIndex + 1) + ' of 4');
  }
  document.getElementById('btn-start').addEventListener('click', () => startGame(false));
  contBtn.addEventListener('click', () => startGame(true));
  document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
  document.getElementById('btn-save').addEventListener('click', () => {
    writeSave(S);
    S.hud.toast('Progress saved.');
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    S.cash = 200;
    S.player.health = 100;
    S.player.reset(6, 14, Math.PI);
    S.police.clearHeat(true);
    S.combat.clearThugs();
    S.combat.ammo = 12;
    S.missions.storyIndex = 0;
    S.missions.turfIndex = 0;
    S.missions.turfUnlocked = false;
    S.missions.storyDone = false;
    S.missions.turfDone = false;
    S.missions.couriersDone = 0;
    S.missions.courier = null;
    S.missions.setJob(S.missions.storyJob());
    S.over = false;
    show('end-screen', false);
    togglePause(false);
    S.hud.toast('Fresh start. Mara is waiting.');
  });
  document.getElementById('btn-again').addEventListener('click', () => {
    S.over = false;
    show('end-screen', false);
    S.hud.toast('Back on the streets.');
  });
}

function startGame(fromSave) {
  S.audio.unlock();
  if (fromSave) {
    const data = readSave();
    if (data) {
      S.cash = data.cash;
      S.player.health = data.health;
      S.player.reset(data.px || 6, data.pz || 14, Math.PI);
      S.missions.applySave(data);
    }
  }
  S.started = true;
  show('start-screen', false);
  S.hud.toast('Welcome to Vellora Bay. Mara has work for you — check the mission panel.');
}

function togglePause(on) {
  if (!S.started || S.over) return;
  S.paused = on;
  show('pause-screen', on);
  if (on) writeSave(S);
}

function showEnd(title, line) {
  S.over = true;
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-line').textContent = line;
  show('end-screen', true);
  // The player keeps the world behind the overlay and resumes on foot.
  setTimeout(() => { S.over = false; show('end-screen', false); }, 4500);
}

function updateCamera(dt) {
  const p = S.player;
  const focus = p.car ? { x: p.car.x, z: p.car.z, h: p.car.heading } : { x: p.x, z: p.z, h: p.heading };
  const baseYaw = p.car || p.speed > 0.5 ? focus.h : S.camYaw;
  S.camYaw = angleDamp(S.camYaw, baseYaw + S.dragYaw * 0.4, 3.2, dt);
  const dist = p.car ? S.camDist + 3 : S.camDist;
  const height = 3.2 + Math.sin(S.camPitch) * dist * 0.7;
  const back = Math.cos(S.camPitch) * dist;
  const tx = focus.x + Math.sin(S.camYaw) * back;
  const tz = focus.z + Math.cos(S.camYaw) * back;
  const want = new THREE.Vector3(tx, height, tz);
  if (S.snapCamera) {
    // Staged screenshots start on the framed shot instead of lerping in.
    S.camera.position.copy(want);
    S.snapCamera = false;
  } else {
    S.camera.position.lerp(want, 1 - Math.exp(-6 * dt));
  }
  S.camera.lookAt(focus.x, 1.6, focus.z);
}

function tick() {
  const dt = Math.min(S.clock.getDelta(), 0.05);
  if (S.started && !S.paused) S.time += dt;
  const p = S.player;
  if (S.started && !S.paused && !S.over) {
    if (p.car) {
      const k = S.keys;
      p.car.drive(dt, {
        up: !!(k['KeyW'] || k['ArrowUp']),
        down: !!(k['KeyS'] || k['ArrowDown']),
        left: !!(k['KeyA'] || k['ArrowLeft']),
        right: !!(k['KeyD'] || k['ArrowRight']),
        hand: !!k['Space'],
      });
      S.audio.setEngine(true, Math.abs(p.car.speed) / p.car.spec.top);
    } else {
      p.update(dt);
      S.audio.setEngine(false, 0);
    }
    S.traffic.update(dt);
    S.police.update(dt);
    S.combat.update(dt);
    S.missions.update(dt);
    S.hud.update(dt);
    renderPoliceDispatch(S, S.dispatchPanel);
    renderMechanicReadouts(S, S.readouts);
    S.health = p.health;
    if (p.health <= 0 && !S.over) S.police.wasted();
  }
  if (!S.started) {
    // Slow orbit over the city behind the start screen.
    const t = S.time + performance.now() * 0.00004;
    S.camera.position.set(Math.sin(t) * 90, 42, Math.cos(t) * 90);
    S.camera.lookAt(0, 4, 20);
    S.time += dt;
  }
  animateCity(S.city, S.time);
  if (S.started) updateCamera(dt);
  S.renderer.render(S.scene, S.camera);
  if (!window.__velloraReady) window.__velloraReady = true;
}

function stageShot(kind) {
  if (!kind) return;
  const S2 = S;
  if (kind === 'start') return; // start screen over the orbiting city
  startGame(false);
  S2.snapCamera = true; // frame the staged shot from the first rendered frame
  if (kind === 'street') {
    S2.player.reset(-19, 60, Math.PI * 0.5);
    S2.camYaw = Math.PI * 0.5;
  } else if (kind === 'docks') {
    S2.missions.storyIndex = 1;
    S2.missions.setJob(S2.missions.storyJob());
    // Face the pier centre (168, 0) from the pier mouth: heading -1.14.
    S2.player.reset(144, 11, -1.14);
    S2.camYaw = -1.14;
    S2.camDist = 8;
  } else if (kind === 'chase') {
    // Player in a fast car, three stars, two cruisers closing in.
    const spot = S2.city.carSpawns.find((c) => c.type === 'sports') || S2.city.carSpawns[0];
    let car = S2.traffic.aiCars.find((c) => Math.abs(c.x - spot.x) < 1 && Math.abs(c.z - spot.z) < 1);
    if (!car) car = S2.traffic.aiCars.find((c) => c.parked);
    if (car) {
      car.driver = 'player';
      car.parked = false;
      S2.player.car = car;
      S2.player.onFoot = false;
      S2.player.mesh.visible = false;
      // A rolling start down a clear stretch of road, cruisers closing in.
      car.x = -75;
      car.z = 19;
      car.heading = Math.PI / 2;
      car.speed = 12;
      S2.missions.onCarStolen(car);
    }
    S2.police.wanted = 3;
    S2.hud.setStars(3);
    // Two cruisers close behind the player car, inside the camera frame.
    const behind = (dist, lane) => {
      const fx = -Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      return { x: car.x - fx * dist + (-fz) * lane, z: car.z - fz * dist + fx * lane };
    };
    const c1 = behind(8, -2.5);
    const c2 = behind(13, 2.5);
    S2.police.spawnCruiserNear(c1.x, c1.z, car.heading, 16);
    S2.police.spawnCruiserNear(c2.x, c2.z, car.heading, 15);
    S2.camYaw = Math.PI / 2;
    S2.camDist = 13;
    S2.camPitch = 0.6;
  }
}

function debugHandle() {
  return {
    S, player: S.player, missions: S.missions, police: S.police,
    traffic: S.traffic, combat: S.combat, hud: S.hud, city: S.city,
    cash: () => S.cash,
    state: () => ({
      cash: S.cash, health: S.player.health,
      mission: S.missions.current && S.missions.current.id,
      storyIndex: S.missions.storyIndex, turfIndex: S.missions.turfIndex,
      storyDone: S.missions.storyDone, turfDone: S.missions.turfDone,
      couriersDone: S.missions.couriersDone, wanted: S.police.wanted,
      stars: S.police.stars, thugs: S.combat.liveThugs.length,
      packageHeld: S.missions.packageHeld,
      inCar: !!S.player.car, onFoot: S.player.onFoot,
      save: readSave(),
    }),
  };
}

boot();
