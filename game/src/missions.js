// missions.js — "The Solmar Job": a four-job story arc from Mara Reyes,
// then repeatable courier runs that pay by the delivery. Each mission has
// a title, plain-language instructions, a target on the map, and a payout.
// The manager owns the beacon and ground ring that mark the target.

import { dist2D, rand, pick, money } from './util.js';
import { makeBeacon, makeMarkerRing } from './police.js';

export const STORY = [
  {
    id: 'wheels',
    title: 'Hot Wheels',
    brief: 'Mara needs wheels. Walk up to any parked car and press E to take it.',
    hint: 'Parked cars line the roads — any of them will do.',
    reward: 200,
  },
  {
    id: 'pickup',
    title: 'The Pickup',
    brief: 'Drive to the Docks and grab the package. Press E at the marker.',
    hint: 'Follow the yellow beacon to the pier, south-west.',
    reward: 300,
  },
  {
    id: 'heat',
    title: 'Heat Wave',
    brief: 'The cops saw the handoff. Lose them — stay out of sight until the stars clear.',
    hint: 'Break line of sight and keep moving. The stars fade while hidden.',
    reward: 500,
  },
  {
    id: 'drop',
    title: 'The Drop',
    brief: 'Deliver the package to Mara at the Sunset Cafe. Press E at the marker.',
    hint: 'The cafe sits on the north-east side of town.',
    reward: 2500,
  },
];

export function createMissions(scene, city) {
  const beacon = makeBeacon(scene, 0xffd23c);
  const ring = makeMarkerRing(scene, 0xffd23c);
  beacon.visible = false;
  ring.visible = false;
  return {
    scene,
    city,
    index: 0,            // next story mission to run
    current: null,       // active mission record
    beacon,
    ring,
    target: null,        // {x, z, label}
    packageHeld: false,
    storyDone: false,
    side: null,          // active courier job
    sideTimer: 0,
    courierCount: 0,
    thugsSpawned: false,
  };
}

export function startMission(M, idx, hooks) {
  const def = STORY[idx];
  if (!def) return null;
  const mission = {
    id: def.id,
    title: def.title,
    brief: def.brief,
    hint: def.hint,
    reward: def.reward,
    state: 'active',
  };
  M.current = mission;
  M.index = idx;
  if (def.id === 'pickup') {
    // The package waits at the pier's east edge: on open ground the player
    // can reach on foot (the pier deck itself is fenced by its own bulk).
    M.target = { x: M.city.docksPos.x + 17, z: M.city.docksPos.z, label: 'The Docks' };
    if (hooks && hooks.onPickupStart) hooks.onPickupStart();
  } else if (def.id === 'heat') {
    M.target = null;
    if (hooks && hooks.onHeatStart) hooks.onHeatStart();
  } else if (def.id === 'drop') {
    M.target = { x: M.city.cafePos.x, z: M.city.cafePos.z, label: 'Sunset Cafe' };
  } else {
    M.target = null;
  }
  updateMarker(M);
  return mission;
}

export function updateMarker(M) {
  if (M.target) {
    M.beacon.visible = true;
    M.ring.visible = true;
    M.beacon.position.set(M.target.x, 45, M.target.z);
    M.ring.position.set(M.target.x, 0.08, M.target.z);
  } else {
    M.beacon.visible = false;
    M.ring.visible = false;
  }
}

export function completeMission(M, hooks) {
  const m = M.current;
  if (!m) return;
  m.state = 'done';
  M.current = null;
  M.target = null;
  updateMarker(M);
  // Advance first, then tell the hooks: the autosave in onComplete must
  // record the NEXT mission, not the one just finished.
  const next = M.index + 1;
  if (next < STORY.length) {
    startMission(M, next, hooks);
  } else {
    M.storyDone = true;
    if (hooks && hooks.onStoryDone) hooks.onStoryDone();
  }
  if (hooks) {
    // Pay first: the autosave inside onComplete must include the reward.
    if (hooks.addCash) hooks.addCash(m.reward);
    if (hooks.onComplete) hooks.onComplete(m);
  }
}

// Check the active mission's completion condition. Call once a frame with
// the live game state; returns a short status string for the HUD when the
// player is near a target, else null.
export function updateMissions(M, ctx, dt) {
  const p = ctx.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  // Courier side jobs tick down while the story is finished.
  if (M.storyDone && M.side) {
    M.sideTimer -= dt;
    if (M.sideTimer <= 0) {
      M.side = null;
      M.target = null;
      updateMarker(M);
      if (ctx.toast) ctx.toast('Courier run failed — the client walked away.');
    }
  }
  if (!M.current) return null;
  const m = M.current;
  if (m.id === 'wheels') {
    if (p.car) {
      completeMission(M, ctx.hooks);
      return 'stolen';
    }
    return null;
  }
  if (m.id === 'pickup') {
    if (M.target && dist2D(px, pz, M.target.x, M.target.z) < 6) {
      if (!p.car) {
        if (ctx.interactPressed) {
          M.packageHeld = true;
          completeMission(M, ctx.hooks);
          return 'picked-up';
        }
        return 'Press E — Grab the package';
      }
      return 'Get out of the car to grab the package';
    }
    return null;
  }
  if (m.id === 'heat') {
    if (ctx.wanted.level === 0) {
      completeMission(M, ctx.hooks);
      return 'clean';
    }
    return null;
  }
  if (m.id === 'drop') {
    if (M.target && dist2D(px, pz, M.target.x, M.target.z) < 6) {
      if (!p.car) {
        if (ctx.interactPressed) {
          M.packageHeld = false;
          completeMission(M, ctx.hooks);
          return 'delivered';
        }
        return 'Press E — Hand Mara the package';
      }
      return 'Get out of the car to make the drop';
    }
    return null;
  }
  return null;
}

// Start a repeatable courier run after the story ends: a random drop
// point, a countdown, and a payout that scales with the distance.
export function startCourier(M, ctx) {
  if (!M.storyDone || M.side) return null;
  const lines = M.city.roadLines;
  const tx = pick(lines) + (Math.random() < 0.5 ? -3 : 3);
  const tz = pick(lines);
  const px = ctx.player.car ? ctx.player.car.x : ctx.player.x;
  const pz = ctx.player.car ? ctx.player.car.z : ctx.player.z;
  const d = dist2D(px, pz, tx, tz);
  const reward = Math.round(300 + d * 1.2);
  M.side = { x: tx, z: tz, reward };
  M.sideTimer = Math.max(45, d / 9 + 30);
  M.target = { x: tx, z: tz, label: 'Courier drop' };
  updateMarker(M);
  return M.side;
}

// Finish a courier run when the player reaches the marker on foot or by car.
export function checkCourier(M, ctx) {
  if (!M.side) return false;
  const p = ctx.player;
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;
  if (dist2D(px, pz, M.side.x, M.side.z) < 6) {
    if (ctx.hooks && ctx.hooks.addCash) ctx.hooks.addCash(M.side.reward);
    if (ctx.toast) ctx.toast('Courier run complete — ' + money(M.side.reward) + ' earned.');
    M.courierCount++;
    M.side = null;
    M.target = null;
    updateMarker(M);
    return true;
  }
  return false;
}
