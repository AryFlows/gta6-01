// Vellora Bay — VBPD dispatch panel. While the heat is on, a live panel
// lists every cruiser in the pursuit with its call sign, distance to the
// player and speed, so the chase reads as a system in screenshots instead
// of a couple of blue dots on the minimap.
import { dist2 } from './util.js';

let panelEl = null;
let listEl = null;
let headerEl = null;

export function createPoliceDispatchPanel() {
  const panel = document.createElement('div');
  panel.id = 'police-dispatch';
  panel.className = 'panel';
  panel.style.display = 'none';

  const header = document.createElement('div');
  header.id = 'police-dispatch-header';
  header.textContent = 'VBPD DISPATCH';
  panel.appendChild(header);

  const list = document.createElement('div');
  list.id = 'police-dispatch-list';
  panel.appendChild(list);

  document.getElementById('hud').appendChild(panel);
  panelEl = panel;
  listEl = list;
  headerEl = header;
  return panel;
}

// Status from the live gap: close enough to ram, closing, chasing, or
// too far away to see the player (the heat is cooling off).
function statusFor(distance) {
  if (distance < 6) return { text: 'RAMMING', cls: 'ramming' };
  if (distance < 25) return { text: 'CLOSING IN', cls: 'closing' };
  if (distance < 48) return { text: 'CHASING', cls: 'chasing' };
  return { text: 'SEARCHING', cls: 'searching' };
}

export function renderPoliceDispatch(S) {
  if (!panelEl) return;
  const cruisers = S.police ? S.police.cruisers : [];
  if (!S.started || cruisers.length === 0) {
    panelEl.style.display = 'none';
    return;
  }
  panelEl.style.display = 'block';
  const p = S.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  const stars = S.police.stars;
  headerEl.textContent = 'VBPD DISPATCH — ' + stars + (stars === 1 ? ' STAR' : ' STARS');
  let html = '';
  for (let i = 0; i < cruisers.length; i++) {
    const c = cruisers[i];
    const d = dist2(c.x, c.z, px, pz);
    const st = statusFor(d);
    html += '<div class="dispatch-row"><span class="dispatch-unit">UNIT ' + (i + 1) + '</span>' +
      '<span class="dispatch-dist">' + Math.round(d) + ' m</span>' +
      '<span class="dispatch-speed">' + Math.round(c.kmh) + ' km/h</span>' +
      '<span class="dispatch-status ' + st.cls + '">' + st.text + '</span></div>';
  }
  listEl.innerHTML = html;
}
