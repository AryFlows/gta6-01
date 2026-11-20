// Vellora Bay — the VBPD dispatch panel. The wanted system is only as
// convincing as its readout: while the heat is on, this panel names every
// cruiser the police have on the player, its live distance and what it is
// doing right now — RAMMING on contact, CLOSING IN, CHASING, or SEARCHING
// once the player has broken away far enough for the heat to start cooling.
// Every number comes from the live police state; nothing here is staged.
export function createPoliceDispatchPanel() {
  const root = document.createElement('div');
  root.id = 'hud-dispatch';
  root.className = 'panel';
  root.style.display = 'none';
  const head = document.createElement('div');
  head.id = 'hud-dispatch-head';
  const rows = document.createElement('div');
  rows.id = 'hud-dispatch-rows';
  root.appendChild(head);
  root.appendChild(rows);
  document.getElementById('hud').appendChild(root);
  return { root, head, rows, lastText: '' };
}

// What a cruiser is doing, from its real distance to the player. The
// thresholds match the chase logic in police.js: contact under ~6 m is a
// ram, and past 48 m the heat starts to cool.
function dispatchStatus(dist) {
  if (dist < 6) return { label: 'RAMMING', cls: 'hot' };
  if (dist < 25) return { label: 'CLOSING IN', cls: 'warm' };
  if (dist < 48) return { label: 'CHASING', cls: 'cool' };
  return { label: 'SEARCHING', cls: 'cool' };
}

function starsText(n) {
  let s = '';
  for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
  return s;
}

export function renderPoliceDispatch(S, panel) {
  const stars = S.police.stars;
  const cruisers = S.police.cruisers;
  if (!S.started || stars === 0 || cruisers.length === 0) {
    panel.root.style.display = 'none';
    return;
  }
  panel.root.style.display = 'block';
  const p = S.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  panel.head.textContent = 'VBPD DISPATCH · ' + cruisers.length + (cruisers.length === 1 ? ' UNIT' : ' UNITS') + ' · ' + starsText(stars);
  let html = '';
  for (let i = 0; i < cruisers.length; i++) {
    const c = cruisers[i];
    const d = Math.hypot(c.x - px, c.z - pz);
    const st = dispatchStatus(d);
    html += '<div class="dispatch-row"><span class="dispatch-unit">VBPD-' + (i + 1) + '</span>'
      + '<span class="dispatch-dist">' + Math.round(d) + ' m · ' + Math.round(c.kmh) + ' km/h</span>'
      + '<span class="dispatch-status ' + st.cls + '">' + st.label + '</span></div>';
  }
  if (html !== panel.lastText) {
    panel.rows.innerHTML = html;
    panel.lastText = html;
  }
}
