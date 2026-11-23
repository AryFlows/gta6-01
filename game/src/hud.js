// Vellora Bay — the HUD. Cash, health, wanted stars, the mission panel, speed
// and ammo readouts, prompts and toasts, and a player-centred minimap drawn on
// a 2D canvas: roads, the ocean, the mission marker and flashing police dots.
import { money, clamp } from './util.js';

export class Hud {
  constructor(S) {
    this.S = S;
    const $ = (id) => document.getElementById(id);
    this.el = {
      cash: $('hud-cash'), healthFill: $('hud-health-fill'), healthText: $('hud-health-text'),
      stars: $('hud-stars'), missionTitle: $('hud-mission-title'), missionBrief: $('hud-mission-brief'),
      missionHint: $('hud-mission-hint'), missionDist: $('hud-mission-dist'),
      speed: $('hud-speed'), ammo: $('hud-ammo'), prompt: $('hud-prompt'),
      toasts: $('hud-toasts'), minimap: $('hud-minimap'), damage: $('hud-damage'),
      crosshair: $('hud-crosshair'), courier: $('hud-courier'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimers = [];
    this.lastPrompt = '';
  }

  setCash(v) {
    this.el.cash.textContent = money(v);
  }

  setHealth(v) {
    const pct = clamp(v, 0, 100);
    this.el.healthFill.style.width = pct + '%';
    this.el.healthFill.style.background = pct > 55 ? '#46c25a' : pct > 25 ? '#e8a13a' : '#d83a3a';
    this.el.healthText.textContent = Math.round(pct);
  }

  setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.style.color = n === 0 ? '#8a929c' : n < 3 ? '#ffd94d' : '#ff5a4d';
  }

  setSpeed(kmh, driving) {
    this.el.speed.textContent = driving ? Math.round(kmh) + ' km/h' : '';
  }

  setAmmo(ammo, mag, reloading) {
    this.el.ammo.textContent = reloading ? 'RELOADING…' : ('◉ ' + ammo + ' / ' + mag);
  }

  setMission(job) {
    this.el.missionTitle.textContent = job.title;
    this.el.missionBrief.textContent = job.brief;
    this.el.missionHint.textContent = job.hint;
    this.el.courier.textContent = '';
    this.updateMissionDist();
  }

  setCourierTime(seconds) {
    this.el.courier.textContent = '⏱ ' + Math.ceil(seconds) + 's left';
    this.el.courier.style.color = seconds < 15 ? '#ff5a4d' : '#ffd94d';
  }

  updateMissionDist() {
    const S = this.S;
    const t = S.missions && S.missions.target;
    const p = S.player;
    if (!t || !p) {
      this.el.missionDist.textContent = '';
      return;
    }
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    const d = Math.hypot(px - t.x, pz - t.z);
    this.el.missionDist.textContent = t.label + ' — ' + Math.round(d) + ' m';
  }

  prompt(text) {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.el.prompt.textContent = text || '';
  }

  toast(text) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.el.toasts.appendChild(div);
    while (this.el.toasts.children.length > 3) this.el.toasts.removeChild(this.el.toasts.firstChild);
    const timer = setTimeout(() => {
      div.classList.add('fade');
      setTimeout(() => div.remove(), 600);
    }, 4200);
    this.toastTimers.push(timer);
  }

  flashDamage() {
    this.el.damage.style.opacity = '0.55';
    setTimeout(() => { this.el.damage.style.opacity = '0'; }, 130);
  }

  drawMinimap() {
    const S = this.S;
    const ctx = this.mapCtx;
    const W = 200;
    const H = 200;
    const scale = W / 420; // world -210..210 maps onto the canvas
    const toX = (x) => W / 2 + x * scale;
    const toY = (z) => H / 2 + z * scale;
    ctx.clearRect(0, 0, W, H);
    // Land, beach, ocean.
    ctx.fillStyle = '#2c3138';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(0, toY(140), W, toY(179) - toY(140));
    ctx.fillStyle = '#1c6f9e';
    ctx.fillRect(0, toY(179), W, H - toY(179));
    // Park + plaza.
    ctx.fillStyle = '#3f7a33';
    ctx.fillRect(toX(-89), toY(-89), 26 * scale, 26 * scale);
    ctx.fillStyle = '#7d7468';
    ctx.beginPath();
    ctx.arc(toX(0), toY(0), 13 * scale, 0, Math.PI * 2);
    ctx.fill();
    // Roads.
    ctx.strokeStyle = '#565d66';
    ctx.lineWidth = 9 * scale;
    for (const line of [ -133, -95, -57, -19, 19, 57, 95, 133 ]) {
      ctx.beginPath(); ctx.moveTo(toX(-150), toY(line)); ctx.lineTo(toX(195), toY(line)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(line), toY(-150)); ctx.lineTo(toX(line), toY(179)); ctx.stroke();
    }
    // Docks pier.
    ctx.fillStyle = '#7a5c38';
    ctx.fillRect(toX(140), toY(-15), (192 - 140) * scale, 30 * scale);
    // Traffic cars as faint dots, thugs as red dots.
    ctx.fillStyle = '#9aa2ac';
    for (const car of S.traffic.aiCars) {
      if (car.driver === 'ai') ctx.fillRect(toX(car.x) - 1, toY(car.z) - 1, 2, 2);
    }
    ctx.fillStyle = '#ff4d4d';
    for (const thug of S.combat.liveThugs) {
      ctx.beginPath();
      ctx.arc(toX(thug.x), toY(thug.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mission marker: pulsing yellow diamond.
    const t = S.missions && S.missions.target;
    if (t) {
      const pulse = 4 + Math.sin(S.time * 4) * 1.6;
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath();
      ctx.moveTo(toX(t.x), toY(t.z) - pulse - 2);
      ctx.lineTo(toX(t.x) + pulse, toY(t.z));
      ctx.lineTo(toX(t.x), toY(t.z) + pulse + 2);
      ctx.lineTo(toX(t.x) - pulse, toY(t.z));
      ctx.closePath();
      ctx.fill();
    }
    // Police: flashing blue dots.
    if (S.police.cruisers.length && Math.floor(S.time * 2.4) % 2 === 0) {
      ctx.fillStyle = '#4d8dff';
      for (const c of S.police.cruisers) {
        ctx.beginPath();
        ctx.arc(toX(c.x), toY(c.z), 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Player: white arrow, rotated to the heading.
    const p = S.player;
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    const heading = p.car ? p.car.heading : p.heading;
    ctx.save();
    ctx.translate(toX(px), toY(pz));
    ctx.rotate(Math.atan2(-Math.sin(heading), -Math.cos(heading)) + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Frame.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  update(dt) {
    const S = this.S;
    if (!S.started) return;
    this.setCash(S.cash);
    this.setHealth(S.player.health);
    this.setSpeed(S.player.car ? S.player.car.kmh : 0, !!S.player.car);
    this.updateMissionDist();
    this.drawMinimap();
    // Context prompt: what E does right now.
    const p = S.player;
    if (p.onFoot) {
      const near = p.nearestCar(4.2);
      const job = S.missions.current;
      const atTarget = job && job.target && Math.hypot(p.x - job.target.x, p.z - job.target.z) < 4.5;
      if (atTarget && (job.id === 'dockside-pickup' || job.id === 'cafe-drop' || job.id === 'turf-king' || job.id === 'courier-run')) {
        this.prompt('[E] ' + (job.id === 'dockside-pickup' ? 'Grab the package' : job.id === 'cafe-drop' ? 'Hand over the package' : job.id === 'turf-king' ? 'Deliver the papers' : 'Drop the parcel'));
      } else if (near) {
        this.prompt('[E] Steal the ' + near.label + '   •   [F] Punch   •   Click to shoot   •   [R] Reload');
      } else {
        this.prompt('[WASD] Move   •   [Space] Jump   •   [F] Punch   •   Click to shoot   •   [Esc] Pause');
      }
    } else {
      this.prompt('[WASD] Drive   •   [Space] Handbrake   •   [E] Get out   •   [Esc] Pause');
    }
    this.el.crosshair.style.display = p.onFoot ? 'block' : 'none';
  }
}
