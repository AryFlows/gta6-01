// city.js — builds Solmar, a sun-soaked coastal city, from scratch.
// A 9x9 grid of blocks split by roads, with procedural tower facades,
// a beach and ocean to the south, a marina, docks, parks and plazas.
// Nothing here is copied from any real place: Solmar is invented.

import * as THREE from '../vendor/three.module.min.js';
import { rand, randInt, pick, makeBox } from './util.js';

export const PITCH = 58;      // block (44) + road (14)
export const ROAD_W = 14;
export const GRID = 4;        // blocks run from -4 to +4
export const WORLD_R = (GRID + 0.5) * PITCH + ROAD_W / 2; // half-extent incl. outer roads

// Facade palettes: warm stucco, glass towers, brick, pastel art-deco.
const PALETTES = [
  ['#e8c9a0', '#d9a86c', '#f2ddc0'],
  ['#9db8c8', '#7fa3b8', '#b8ccd8'],
  ['#c98f6b', '#a96f4e', '#e0aa84'],
  ['#f0d9a8', '#e8b878', '#ffe9b8'],
  ['#b8a8c8', '#9a88b8', '#d0c0e0'],
  ['#8fb8a0', '#6f9a80', '#a8c8b0'],
];

// Paved ground texture: speckled concrete with paving joints, tiled across
// the whole city slab so open ground never reads as flat colour.
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a8f7a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.10)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 28);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function facadeTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so towers read as solid volumes.
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);
  // Window grid; a few windows glow warm, most are dark glass.
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 10 + col * 19;
      const y = 12 + row * 20;
      const warm = Math.random() < lit;
      g.fillStyle = warm ? '#ffd98a' : '#2a3542';
      g.fillRect(x, y, 12, 12);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x, y, 12, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const colliders = [];
  const parkSpots = [];   // {x, z, angle} places a parked car can sit
  // Roads run BETWEEN the blocks (half-pitch offsets), so towers sit in the
  // middle of their blocks and the streets stay clear for traffic.
  const roadLines = [];   // x or z coordinates of road centre lines
  for (let k = -GRID - 1; k <= GRID; k++) roadLines.push((k + 0.5) * PITCH);

  // --- ground: city slab with a paved texture, sand beach to the south, ocean beyond it ---
  const groundMat = new THREE.MeshLambertMaterial({ map: groundTexture() });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_R * 2 + 220, WORLD_R * 2 + 220), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_R * 2 + 220, 90),
    new THREE.MeshLambertMaterial({ color: 0xe8d49a })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, WORLD_R + 45);
  scene.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_R * 2 + 400, 400),
    new THREE.MeshLambertMaterial({ color: 0x2a7fa8 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.01, WORLD_R + 90 + 200);
  scene.add(ocean);

  // --- roads: dark strips with pale sidewalks and dashed centre lines ---
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9a938a });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8d2a8 });
  for (const line of roadLines) {
    for (const vertical of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, WORLD_R * 2 + ROAD_W), roadMat);
      road.rotation.x = -Math.PI / 2;
      if (!vertical) road.rotation.z = Math.PI / 2;
      road.position.set(vertical ? line : 0, 0.03, vertical ? 0 : line);
      scene.add(road);
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 6, WORLD_R * 2 + ROAD_W + 6), walkMat);
      walk.rotation.x = -Math.PI / 2;
      if (!vertical) walk.rotation.z = Math.PI / 2;
      walk.position.set(vertical ? line : 0, 0.02, vertical ? 0 : line);
      scene.add(walk);
      for (let d = -WORLD_R; d <= WORLD_R; d += 16) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 5), dashMat);
        dash.rotation.x = -Math.PI / 2;
        if (!vertical) dash.rotation.z = Math.PI / 2;
        dash.position.set(vertical ? line : d, 0.05, vertical ? d : line);
        scene.add(dash);
      }
    }
  }

  // --- buildings: one to four towers per block, skipping special blocks ---
  const special = new Set(['0,0', '-4,4', '4,-4', '4,4', '-4,-4', '0,4']);
  const facadeMats = PALETTES.map(([base]) => new THREE.MeshLambertMaterial({
    map: facadeTexture(base, 0.22),
  }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a58 });
  for (let bx = -GRID; bx <= GRID; bx++) {
    for (let bz = -GRID; bz <= GRID; bz++) {
      const key = bx + ',' + bz;
      if (special.has(key)) continue;
      const cx = bx * PITCH;
      const cz = bz * PITCH;
      const count = randInt(1, 3);
      for (let i = 0; i < count; i++) {
        const w = rand(14, 26);
        const d = rand(14, 26);
        const h = rand(10, 46);
        const ox = (i % 2 === 0 ? -1 : 1) * rand(2, 9);
        const oz = (i < 2 ? -1 : 1) * rand(2, 9);
        const x = cx + ox;
        const z = cz + oz;
        const mat = pick(facadeMats);
        const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        tower.position.set(x, h / 2, z);
        scene.add(tower);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.2, d + 1), roofMat);
        roof.position.set(x, h + 0.6, z);
        scene.add(roof);
        // Rooftop box (AC unit / stair house) for skyline variety.
        if (Math.random() < 0.6) {
          const unit = new THREE.Mesh(new THREE.BoxGeometry(rand(3, 6), rand(2, 4), rand(3, 6)), roofMat);
          unit.position.set(x + rand(-4, 4), h + 2, z + rand(-4, 4));
          scene.add(unit);
        }
        colliders.push(makeBox(x, z, w / 2 + 0.4, d / 2 + 0.4));
      }
    }
  }

  // --- central plaza (0,0): fountain, palms, benches, open space ---
  const plazaMat = new THREE.MeshLambertMaterial({ color: 0xb8a88a });
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.04, 0);
  scene.add(plaza);
  const fountain = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 1.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x7a7a78 })
  );
  fountain.position.set(0, 0.7, 0);
  scene.add(fountain);
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(6.2, 6.2, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: 0x4aa8d8 })
  );
  water.position.set(0, 1.3, 0);
  scene.add(water);
  colliders.push(makeBox(0, 0, 8, 8));

  // --- palm trees: rings around the plaza, rows along the beach ---
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  function palm(x, z, lean) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 9, 7), trunkMat);
    trunk.position.y = 4.5;
    trunk.rotation.z = lean || 0;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5, 4), frondMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 1.8, 9.4, Math.sin(a) * 1.8);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      g.add(frond);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    colliders.push(makeBox(x, z, 0.7, 0.7));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    palm(Math.cos(a) * 17, Math.sin(a) * 17, rand(-0.06, 0.06));
  }
  for (let x = -WORLD_R + 20; x <= WORLD_R - 20; x += 34) {
    palm(x + rand(-4, 4), WORLD_R - 16, rand(-0.08, 0.08));
  }

  // --- streetlights at every other intersection, on the sidewalk corner ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2f3336 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xcc9933 });
  const lightLines = roadLines.filter((_, i) => i % 2 === 0);
  for (const lx of lightLines) {
    for (const lz of lightLines) {
      const x = lx + 8;
      const z = lz + 8;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
      pole.position.set(x, 3.5, z);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lampMat);
      lamp.position.set(x, 7.1, z);
      scene.add(lamp);
      colliders.push(makeBox(x, z, 0.3, 0.3));
    }
  }

  // --- the Docks (south-west, block -4,4): pier, crates, containers ---
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(30, 1.2, 46), pierMat);
  pier.position.set(-4 * PITCH, 0.6, 4 * PITCH + 8);
  scene.add(pier);
  colliders.push(makeBox(-4 * PITCH, 4 * PITCH + 8, 15, 23));
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xb07830 });
  const contMat = new THREE.MeshLambertMaterial({ color: 0x2f6a8a });
  for (let i = 0; i < 7; i++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), i % 2 ? crateMat : contMat);
    // Stacked on the pier deck (top at y=1.2), not sunk into it.
    crate.position.set(-4 * PITCH + rand(-12, 12), 2.7 + (i % 3) * 3, 4 * PITCH + rand(-12, 16));
    crate.rotation.y = rand(0, Math.PI);
    scene.add(crate);
  }

  // --- park (north-east, block 4,-4): lawn, trees, pond ---
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(44, 44),
    new THREE.MeshLambertMaterial({ color: 0x5a9a4a })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.set(4 * PITCH, 0.04, -4 * PITCH);
  scene.add(lawn);
  const pond = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.5, 18),
    new THREE.MeshLambertMaterial({ color: 0x3a8ab8 })
  );
  pond.position.set(4 * PITCH + 6, 0.3, -4 * PITCH - 4);
  scene.add(pond);
  for (let i = 0; i < 6; i++) palm(4 * PITCH + rand(-18, 18), -4 * PITCH + rand(-18, 18), rand(-0.1, 0.1));

  // --- parked-car spots: along road edges near intersections ---
  for (const line of roadLines) {
    for (const other of [-2, 0, 2]) {
      const along = other * PITCH;
      parkSpots.push({ x: line + 5.4, z: along, angle: 0 });
      parkSpots.push({ x: line - 5.4, z: along + 29, angle: Math.PI });
      parkSpots.push({ x: along, z: line + 5.4, angle: Math.PI / 2 });
      parkSpots.push({ x: along + 29, z: line - 5.4, angle: -Math.PI / 2 });
    }
  }

  // --- street props: benches, bins and hydrants along the sidewalks ---
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const binMat = new THREE.MeshLambertMaterial({ color: 0x3a4a3a });
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xc83228 });
  for (const line of roadLines) {
    for (let k = 0; k < 3; k++) {
      const along = rand(-WORLD_R + 30, WORLD_R - 30);
      const side = Math.random() < 0.5 ? 1 : -1;
      const kind = Math.random();
      if (kind < 0.4) {
        // Bench: seat plus backrest, facing the road.
        const bench = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 0.6), benchMat);
        seat.position.y = 0.55;
        bench.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.12), benchMat);
        back.position.set(0, 0.9, -0.28);
        bench.add(back);
        bench.position.set(line + side * 9.5, 0, along);
        bench.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(bench);
        colliders.push(makeBox(line + side * 9.5, along, 1.1, 0.5));
      } else if (kind < 0.75) {
        const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 1.0, 8), binMat);
        bin.position.set(line + side * 9.5, 0.5, along);
        scene.add(bin);
      } else {
        const hyd = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.9, 8), hydMat);
        hyd.position.set(line + side * 9.5, 0.45, along);
        scene.add(hyd);
      }
      // Mirror a matching prop on the cross street so both orientations live.
      const along2 = rand(-WORLD_R + 30, WORLD_R - 30);
      const bin2 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 1.0, 8), binMat);
      bin2.position.set(along2, 0.5, line + side * 9.5);
      scene.add(bin2);
    }
  }

  return {
    colliders,
    parkSpots,
    roadLines,
    ocean,
    bounds: WORLD_R,
    docksPos: { x: -4 * PITCH, z: 4 * PITCH + 8 },
    // Sunset Cafe sits on the corner where Palm Row meets 2nd Avenue, so
    // the Drop marker is on open street, never inside a tower.
    cafePos: { x: 3.5 * PITCH, z: -1.5 * PITCH },
    plazaPos: { x: 0, z: 0 },
    parkPos: { x: 4 * PITCH, z: -4 * PITCH },
  };
}
