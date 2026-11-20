// Vellora Bay — the city. A procedural grid of blocks with real streets between
// them, a plaza with a fountain at the centre, a park, a pier district on the
// east edge and a beach with an ocean to the south. Everything is drawn from
// canvas textures and plain geometry; the layout is seeded so it is identical
// on every load. No building ever sits on a road.
import { makeRng, pick, range, rangeInt, chance, paintTexture, clamp } from './util.js';
import {
  makeDaySkyTexture, DAYLIGHT_FACADE_PALETTES, DAY_GROUND_COLOR,
  DAY_SIDEWALK_COLORS, DAY_PLAZA_COLOR, DAY_WINDOW_DARK,
  DAY_WINDOW_LIT_RATIO, DAY_SUN_SPRITE, DAY_SUN_GLOW_INNER,
  DAY_SUN_GLOW_OUTER,
} from './sun-soaked-lighting.js';

export const PITCH = 38; // block (26) + road (12)
export const GRID_HALF = 3;
export const ROAD_LINES = [-133, -95, -57, -19, 19, 57, 95, 133];
export const CITY_BOUND = 150;

const PALETTES = DAYLIGHT_FACADE_PALETTES;
const NEON_WORDS = ['BAR', 'HOTEL', 'TACOS', '24H', 'PIER', 'CLUB', 'CAFE', 'NEON'];

function facadeTexture(THREE, rng, base, litRatio) {
  return paintTexture(THREE, 128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // Subtle vertical grime streaks.
    for (let i = 0; i < 26; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (0.03 + rng() * 0.08).toFixed(2) + ')';
      const x = rng() * w;
      g.fillRect(x, 0, 2 + rng() * 5, h);
    }
    // Window grid; most panes reflect the pale sky, a few glow warm.
    const cols = 5;
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng() < litRatio;
        g.fillStyle = lit ? (rng() < 0.7 ? '#ffd489' : '#9fd8ff') : DAY_WINDOW_DARK;
        const x = 8 + c * 23;
        const y = 10 + r * 26;
        g.fillRect(x, y, 15, 17);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x, y, 15, 3);
      }
    }
    // Ground-floor shopfront band.
    g.fillStyle = 'rgba(20,20,26,0.85)';
    g.fillRect(0, h - 26, w, 26);
    g.fillStyle = '#e8d9a0';
    g.fillRect(6, h - 20, w - 12, 12);
  });
}

function dashTexture(THREE) {
  return paintTexture(THREE, 64, 16, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#d8c25a';
    g.fillRect(4, h / 2 - 2, 34, 4);
  });
}

function glowTexture(THREE, inner, outer) {
  return paintTexture(THREE, 128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

export function buildCity(THREE) {
  const rng = makeRng(20261117);
  const group = new THREE.Group();
  const colliders = [];
  const animated = { ocean: null, fountainWater: null, sunSprite: null };

  const mat = (color, opts) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0.02 }, opts || {}));
  const box = (w, h, d, material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.castShadow = h > 2;
    m.receiveShadow = true;
    return m;
  };

  // --- Sky dome + high noon sun -------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(640, 24, 14),
    new THREE.MeshBasicMaterial({ map: makeDaySkyTexture(THREE), side: THREE.BackSide, fog: false }),
  );
  group.add(sky);
  const sunTex = glowTexture(THREE, DAY_SUN_GLOW_INNER, DAY_SUN_GLOW_OUTER);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false }));
  sun.position.set(DAY_SUN_SPRITE.x, DAY_SUN_SPRITE.y, DAY_SUN_SPRITE.z);
  sun.scale.set(DAY_SUN_SPRITE.scale, DAY_SUN_SPRITE.scale, 1);
  group.add(sun);
  animated.sunSprite = sun;

  // --- Ground, roads, sidewalks -----------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(760, 760), mat(DAY_GROUND_COLOR));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 90);
  ground.receiveShadow = true;
  group.add(ground);

  const dashTex = dashTexture(THREE);
  dashTex.wrapS = THREE.RepeatWrapping;
  for (const line of ROAD_LINES) {
    for (const horizontal of [true, false]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(300, 0.55), new THREE.MeshBasicMaterial({ map: dashTex }));
      strip.material.map = dashTex.clone();
      strip.material.map.needsUpdate = true;
      strip.material.map.repeat.set(46, 1);
      strip.material.map.wrapS = THREE.RepeatWrapping;
      strip.rotation.x = -Math.PI / 2;
      strip.position.y = 0.02;
      if (horizontal) {
        strip.position.set(0, 0.02, line);
      } else {
        strip.rotation.z = Math.PI / 2;
        strip.position.set(line, 0.02, 0);
      }
      group.add(strip);
    }
  }

  const PLAZA_BLOCK = { x: 0, z: 0 };
  const PARK_BLOCK = { x: -2, z: -2 };
  const isSpecial = (bx, bz) =>
    (bx === PLAZA_BLOCK.x && bz === PLAZA_BLOCK.z) || (bx === PARK_BLOCK.x && bz === PARK_BLOCK.z);

  // Sidewalk slabs + buildings, one block at a time.
  const facadeCache = {};
  const facadeFor = (base) => {
    if (!facadeCache[base]) facadeCache[base] = facadeTexture(THREE, makeRng(base.length * 977 + base.charCodeAt(1)), base, DAY_WINDOW_LIT_RATIO);
    return facadeCache[base];
  };

  for (let bx = -GRID_HALF; bx <= GRID_HALF; bx++) {
    for (let bz = -GRID_HALF; bz <= GRID_HALF; bz++) {
      const cx = bx * PITCH;
      const cz = bz * PITCH;
      if (bx === PLAZA_BLOCK.x && bz === PLAZA_BLOCK.z) continue;
      if (bx === PARK_BLOCK.x && bz === PARK_BLOCK.z) continue;
      // Sidewalk slab.
      const slab = box(26.6, 0.5, 26.6, mat(pick(rng, DAY_SIDEWALK_COLORS)));
      slab.position.set(cx, 0.2, cz);
      slab.castShadow = false;
      group.add(slab);
      // 1–3 buildings per block, varied heights and footprints.
      const count = chance(rng, 0.45) ? 2 : chance(rng, 0.3) ? 3 : 1;
      const spots = count === 1 ? [[0, 0, 20, 20]] :
        count === 2 ? [[-5, 0, 12, 18], [6, 0, 11, 18]] :
        [[-7, -6, 10, 10], [6, -6, 10, 10], [0, 7, 16, 9]];
      for (const [ox, oz, w, d] of spots) {
        const distC = Math.hypot(cx, cz);
        const tall = distC < 60 ? 0.5 : 0.2;
        const h = chance(rng, tall) ? range(rng, 26, 44) : range(rng, 8, 22);
        const base = pick(rng, PALETTES[rangeInt(rng, 0, 1)]);
        const tex = facadeFor(base);
        const walls = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }),
        );
        walls.position.set(cx + ox, h / 2 + 0.4, cz + oz);
        walls.castShadow = true;
        walls.receiveShadow = true;
        group.add(walls);
        // Roof cap + rooftop clutter: AC boxes, water tank, antenna on towers.
        const cap = box(w + 0.4, 0.5, d + 0.4, mat('#3c3f45'));
        cap.position.set(cx + ox, h + 0.65, cz + oz);
        group.add(cap);
        if (chance(rng, 0.8)) {
          const ac = box(range(rng, 1.6, 3), 1, range(rng, 1.6, 2.6), mat('#7a7d80'));
          ac.position.set(cx + ox + range(rng, -w / 4, w / 4), h + 1.4, cz + oz + range(rng, -d / 4, d / 4));
          group.add(ac);
        }
        if (chance(rng, 0.5)) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10), mat('#8a6f4d'));
          tank.position.set(cx + ox - w / 4, h + 1.8, cz + oz - d / 4);
          tank.castShadow = true;
          group.add(tank);
        }
        if (h > 30 && chance(rng, 0.6)) {
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 7, 6), mat('#c0c4c8'));
          mast.position.set(cx + ox + w / 4, h + 4, cz + oz + d / 4);
          group.add(mast);
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: '#ff4444' }));
          tip.position.set(cx + ox + w / 4, h + 7.6, cz + oz + d / 4);
          group.add(tip);
        }
        // Neon Row: glowing signs on the blocks just east of the plaza.
        if (bx === 1 && bz === 1 && chance(rng, 0.75)) {
          const word = pick(rng, NEON_WORDS);
          const signTex = paintTexture(THREE, 256, 64, (g, w2, h2) => {
            g.fillStyle = '#14081c';
            g.fillRect(0, 0, w2, h2);
            g.font = 'bold 40px sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = pick(rng, ['#ff5ad0', '#4de8ff', '#ffe14d', '#7dff6a']);
            g.fillText(word, w2 / 2, h2 / 2 + 2);
          });
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(7, 1.75),
            new THREE.MeshBasicMaterial({ map: signTex }),
          );
          sign.position.set(cx + ox, Math.min(h - 2, 12), cz + oz + d / 2 + 0.08);
          group.add(sign);
        }
        colliders.push({ x: cx + ox, z: cz + oz, hx: w / 2, hz: d / 2 });
      }
    }
  }

  // --- Plaza: round pavement, fountain, benches --------------------------
  const plazaDisc = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 0.5, 28), mat(DAY_PLAZA_COLOR));
  plazaDisc.position.set(0, 0.2, 0);
  plazaDisc.receiveShadow = true;
  group.add(plazaDisc);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1.1, 20), mat('#9aa0a4'));
  basin.position.set(0, 0.9, 0);
  basin.castShadow = true;
  group.add(basin);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 3.1, 0.25, 20),
    new THREE.MeshStandardMaterial({ color: '#3fb7d9', roughness: 0.15, metalness: 0.4 }),
  );
  water.position.set(0, 1.35, 0);
  group.add(water);
  animated.fountainWater = water;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 2.6, 10), mat('#c8c2b2'));
  column.position.set(0, 2.4, 0);
  column.castShadow = true;
  group.add(column);
  colliders.push({ x: 0, z: 0, hx: 3.6, hz: 3.6 });

  // --- Park: lawn, trees, paths ------------------------------------------
  const parkCx = PARK_BLOCK.x * PITCH;
  const parkCz = PARK_BLOCK.z * PITCH;
  const lawn = box(26, 0.4, 26, mat('#4d7a3f'));
  lawn.position.set(parkCx, 0.2, parkCz);
  lawn.castShadow = false;
  group.add(lawn);
  const treeSpots = [[-8, -7], [7, -8], [-7, 8], [8, 7], [0, -9], [-9, 0], [9, 1], [0, 9]];
  for (const [ox, oz] of treeSpots) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 3.4, 7), mat('#6b4a2e'));
    trunk.position.set(parkCx + ox, 2, parkCz + oz);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(range(rng, 2.2, 3.2), 0), mat(pick(rng, ['#3f7a33', '#5a8a35', '#2f6b2e'])));
    crown.position.set(parkCx + ox, 5.2, parkCz + oz);
    crown.castShadow = true;
    group.add(crown);
    colliders.push({ x: parkCx + ox, z: parkCz + oz, hx: 0.7, hz: 0.7 });
  }

  // --- Docks: wooden pier, crates, containers -----------------------------
  const pier = box(52, 1.2, 30, mat('#7a5c38'));
  pier.position.set(166, 0.4, 0);
  pier.castShadow = false;
  pier.receiveShadow = true;
  group.add(pier);
  for (let i = 0; i < 6; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.6, 8), mat('#5d4630'));
    post.position.set(142 + i * 9, 0.6, i % 2 === 0 ? -14.4 : 14.4);
    group.add(post);
  }
  const crateCols = ['#b5672a', '#2a7ab5', '#7ab52a', '#b52a4d'];
  const crateSpots = [[150, -8], [156, -9], [153, -8.5], [172, 8], [178, 9], [176, 7.5], [160, 10], [146, 9]];
  for (const [cx, cz] of crateSpots) {
    const s = range(rng, 1.8, 2.8);
    const crate = box(s, s, s, mat(pick(rng, crateCols)));
    crate.position.set(cx, 1 + s / 2, cz);
    group.add(crate);
    colliders.push({ x: cx, z: cz, hx: s / 2, hz: s / 2 });
  }
  const contSpots = [[158, -12, '#c94f2e'], [170, -12, '#2e7ac9'], [182, -11, '#c9a52e']];
  for (const [cx, cz, col] of contSpots) {
    const cont = box(9, 3, 3.4, mat(col));
    cont.position.set(cx, 2.6, cz);
    cont.castShadow = true;
    group.add(cont);
    colliders.push({ x: cx, z: cz, hx: 4.5, hz: 1.7 });
  }

  // --- Beach + ocean -------------------------------------------------------
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(330, 42), mat('#d9c08a'));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, 158);
  sand.receiveShadow = true;
  group.add(sand);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 300),
    new THREE.MeshStandardMaterial({ color: '#1c6f9e', roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.94 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.12, 330);
  group.add(ocean);
  animated.ocean = ocean;
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(330, 2.2), new THREE.MeshBasicMaterial({ color: '#dfeef5', transparent: true, opacity: 0.7 }));
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.16, 179);
  group.add(foam);

  // Palms along the beach and around the plaza.
  const palm = (x, z, lean) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 6.5, 7), mat('#7a5c38'));
    trunk.position.set(x, 3.2, z);
    trunk.rotation.z = lean;
    trunk.castShadow = true;
    group.add(trunk);
    const topX = x - Math.sin(lean) * 3.1;
    const topZ = z;
    for (let i = 0; i < 6; i++) {
      const frond = box(3.2, 0.1, 0.7, mat('#3f8a3a'));
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(topX + Math.cos(a) * 1.3, 6.3, topZ + Math.sin(a) * 1.3);
      frond.rotation.y = -a;
      frond.rotation.z = 0.6;
      group.add(frond);
    }
    colliders.push({ x, z, hx: 0.6, hz: 0.6 });
  };
  for (let i = 0; i < 9; i++) palm(-130 + i * 32 + range(rng, -4, 4), 146 + range(rng, -2, 6), range(rng, -0.12, 0.12));
  palm(-16, -16, 0.08);
  palm(16, -16, -0.08);
  palm(-16, 16, -0.06);
  palm(16, 16, 0.06);

  // --- Street props: lamps, benches, bins, hydrants -----------------------
  const lampMat = mat('#2f3336');
  const lampGlow = new THREE.MeshBasicMaterial({ color: '#ffd9a0' });
  for (const line of ROAD_LINES) {
    for (let k = -3; k <= 3; k++) {
      const along = k * PITCH + (k % 2 === 0 ? 6 : -6);
      for (const [lx, lz] of [[line + 6.4, along], [along, line + 6.4]]) {
        if (Math.abs(lx) > 140 || Math.abs(lz) > 140) continue;
        if (Math.hypot(lx, lz) < 16) continue; // keep the plaza clear
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.4, 6), lampMat);
        pole.position.set(lx, 3.2, lz);
        group.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), lampGlow);
        bulb.position.set(lx, 6.5, lz);
        group.add(bulb);
      }
    }
  }
  const bench = (x, z, rot) => {
    const b = box(3, 0.5, 1, mat('#8a5a2e'));
    b.position.set(x, 0.8, z);
    b.rotation.y = rot;
    group.add(b);
    for (const s of [-1.2, 1.2]) {
      const leg = box(0.25, 0.6, 0.9, mat('#333333'));
      leg.position.set(x + Math.cos(rot) * s, 0.3, z - Math.sin(rot) * s);
      group.add(leg);
    }
  };
  bench(-10, 10, 0.6);
  bench(10, -10, -0.6);
  bench(parkCx - 4, parkCz + 11, 0);
  bench(parkCx + 5, parkCz - 11, Math.PI);
  for (const [hx, hz] of [[-8, -8], [9, 9], [parkCx + 10, parkCz + 10], [150, -13], [170, 12]]) {
    const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1, 8), mat('#c22e2e'));
    hyd.position.set(hx, 0.9, hz);
    hyd.castShadow = true;
    group.add(hyd);
    colliders.push({ x: hx, z: hz, hx: 0.5, hz: 0.5 });
  }
  for (const [bx2, bz2] of [[-11, 11], [11, 11], [-11, -11], [parkCx - 10, parkCz - 10]]) {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 1.1, 8), mat('#3d5a3a'));
    bin.position.set(bx2, 0.95, bz2);
    group.add(bin);
  }

  // --- Parked cars + cash spots (deterministic) ----------------------------
  const carSpawns = [];
  const carTypes = ['sedan', 'sedan', 'taxi', 'sports', 'van', 'sedan', 'taxi', 'sports', 'van', 'sedan', 'sedan', 'taxi', 'sports', 'van'];
  const parkRng = makeRng(777);
  for (let i = 0; i < 14; i++) {
    const line = pick(parkRng, ROAD_LINES);
    const along = range(parkRng, -120, 120);
    const horizontal = chance(parkRng, 0.5);
    const edge = chance(parkRng, 0.5) ? 4.6 : -4.6;
    const x = horizontal ? along : line + edge;
    const z = horizontal ? line + edge : along;
    if (Math.hypot(x, z) < 18) continue;
    carSpawns.push({ x, z, rot: horizontal ? (edge > 0 ? Math.PI / 2 : -Math.PI / 2) : (edge > 0 ? 0 : Math.PI), type: carTypes[i % carTypes.length] });
  }
  const cashSpots = [];
  const cashRng = makeRng(4242);
  const cashAreas = [[0, 0, 11], [parkCx, parkCz, 10], [166, 0, 12], [0, 152, 60], [57, 57, 8], [-57, 57, 8], [95, -57, 8]];
  for (const [ax, az, r] of cashAreas) {
    for (let i = 0; i < 2; i++) {
      cashSpots.push({ x: ax + range(cashRng, -r, r), z: az + range(cashRng, -r, r) });
    }
  }

  return {
    group, colliders, animated, carSpawns, cashSpots,
    plaza: { x: 0, z: 0 },
    park: { x: parkCx, z: parkCz },
    docks: { x: 168, z: 0 },
    cafe: { x: 2 * PITCH + 6, z: 0 },
    beach: { x: 0, z: 156 },
    oceanZ: 179,
    bound: CITY_BOUND,
  };
}

// Push a circle (x, z, radius) out of every building collider it overlaps.
// Returns true when a collision happened.
export function resolveCollision(city, pos, r) {
  let hit = false;
  for (const c of city.colliders) {
    const nx = clamp(pos.x, c.x - c.hx, c.x + c.hx);
    const nz = clamp(pos.z, c.z - c.hz, c.z + c.hz);
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.z = nz + (dz / d) * r;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const px = c.hx + r - Math.abs(pos.x - c.x);
        const pz = c.hz + r - Math.abs(pos.z - c.z);
        if (px < pz) pos.x = c.x + (pos.x >= c.x ? c.hx + r : -(c.hx + r));
        else pos.z = c.z + (pos.z >= c.z ? c.hz + r : -(c.hz + r));
      }
    }
  }
  return hit;
}

export function animateCity(city, t) {
  if (city.animated.ocean) city.animated.ocean.position.y = 0.12 + Math.sin(t * 0.7) * 0.08;
  if (city.animated.fountainWater) {
    city.animated.fountainWater.rotation.y = t * 0.4;
    const s = 1 + Math.sin(t * 2.2) * 0.02;
    city.animated.fountainWater.scale.set(s, 1, s);
  }
}
