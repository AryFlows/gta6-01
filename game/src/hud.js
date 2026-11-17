// hud.js — the on-screen readouts: cash, health, wanted stars, mission
// objective, speed, prompts, toasts, and the live minimap drawn on a small
// canvas in the corner. All of it is DOM plus 2D canvas, no extra 3D cost.

import { money, clamp } from './util.js';

const STAR_ON = '★';
const STAR_OFF = '☆';

// Grab every HUD element once; the game calls updateHUD each frame.
export function bindHUD() {
  const $ = (id) => document.getElementById(id);
  return {
    cash: $('hud-cash'),
    healthFill: $('hud-health-fill'),
    healthText: $('hud-health-text'),
    wanted: $('hud-wanted'),
    missionTitle: $('hud-mission-title'),
    missionBrief: $('hud-mission-brief'),
    objective: $('hud-objective'),
    speed: $('hud-speed'),
    prompt: $('hud-prompt'),
    toast: $('hud-toast'),
    minimap: $('minimap'),
    crosshair: $('crosshair'),
    hint: $('hud-hint'),
    ammo: $('hud-ammo'),
  };
}

export function updateHUD(el, s) {
  if (!el.cash) return;
  el.cash.textContent = money(s.cash);
  const hp = clamp(s.health, 0, 100);
  el.healthFill.style.width = hp + '%';
  el.healthFill.style.background = hp > 50 ? '#4ac84a' : hp > 25 ? '#e8a83c' : '#e83c3c';
  el.healthText.textContent = Math.round(hp);
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < s.wanted ? STAR_ON : STAR_OFF;
  el.wanted.textContent = stars;
  el.wanted.style.color = s.wanted > 0 ? '#ffd23c' : '#888888';
  el.wanted.style.textShadow = s.wanted > 0 ? '0 0 8px rgba(255,210,60,0.8)' : 'none';
  if (s.mission) {
    el.missionTitle.textContent = s.mission.title;
    el.missionBrief.textContent = s.mission.brief;
  } else if (s.storyDone) {
    el.missionTitle.textContent = 'Free Roam';
    el.missionBrief.textContent = s.side
      ? 'Courier run: reach the yellow marker before the clock runs out.'
      : 'Story complete. Press J to start a courier run, or just enjoy Solmar.';
  } else {
    el.missionTitle.textContent = 'Solmar';
    el.missionBrief.textContent = '';
  }
  el.objective.textContent = s.objective || '';
  el.objective.style.display = s.objective ? 'block' : 'none';
  if (s.driving) {
    el.speed.style.display = 'block';
    el.speed.textContent = Math.round(Math.abs(s.speedKmh)) + ' km/h';
    el.ammo.style.display = 'none';
  } else {
    el.speed.style.display = 'none';
    el.ammo.style.display = 'block';
    el.ammo.textContent = 'Ammo ' + s.ammo + ' / 12 — F punch, Click shoot, R reload';
  }
  el.prompt.textContent = s.prompt || '';
  el.prompt.style.display = s.prompt ? 'block' : 'none';
  el.crosshair.style.display = s.driving ? 'none' : 'block';
  if (s.toast) showToast(el, s.toast);
}

let toastTimer = null;
export function showToast(el, text) {
  el.toast.textContent = text;
  el.toast.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.style.opacity = '0'; }, 3400);
}

// --- Minimap ---------------------------------------------------------------
// Top-down view CENTRED ON THE PLAYER: roads as grey lines, the beach and
// ocean when they are nearby, the player as a white arrow in the middle,
// police as flashing blue/red dots, the mission marker as a pulsing
// yellow diamond.
export function drawMinimap(canvas, view) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const span = view.span; // world units across the map
  const toMap = (x, z) => [
    ((x - view.playerX + span / 2) / span) * W,
    ((z - view.playerZ + span / 2) / span) * H,
  ];
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#20262b';
  ctx.fillRect(0, 0, W, H);
  // Ocean band at the bottom (south).
  const [, oceanY] = toMap(0, view.oceanZ);
  ctx.fillStyle = '#2a7fa8';
  ctx.fillRect(0, oceanY, W, H - oceanY);
  // Beach strip.
  ctx.fillStyle = '#e8d49a';
  ctx.fillRect(0, oceanY - 4, W, 4);
  // Roads.
  ctx.strokeStyle = '#555a60';
  ctx.lineWidth = 4;
  for (const line of view.roadLines) {
    const [x1] = toMap(line, 0);
    ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, H); ctx.stroke();
    const [, z1] = toMap(0, line);
    ctx.beginPath(); ctx.moveTo(0, z1); ctx.lineTo(W, z1); ctx.stroke();
  }
  // Mission marker: pulsing yellow diamond.
  if (view.target) {
    const [tx, ty] = toMap(view.target.x, view.target.z);
    const pulse = 5 + Math.sin(view.time * 5) * 1.5;
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.moveTo(tx, ty - pulse - 3);
    ctx.lineTo(tx + pulse, ty);
    ctx.lineTo(tx, ty + pulse + 3);
    ctx.lineTo(tx - pulse, ty);
    ctx.closePath();
    ctx.fill();
  }
  // Traffic as faint dots, police as flashing dots.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const c of view.traffic || []) {
    const [x, y] = toMap(c.x, c.z);
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
  const flash = Math.floor(view.time * 3) % 2 === 0;
  ctx.fillStyle = flash ? '#ff4040' : '#4080ff';
  for (const pc of view.police || []) {
    const [x, y] = toMap(pc.x, pc.z);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow, rotated to face the heading (map y grows with world z,
  // so heading 0 = south = down on the map).
  const [px, py] = toMap(view.playerX, view.playerZ);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI - view.playerAngle);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // North tick.
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('N', W - 12, 12);
}
