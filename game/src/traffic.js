// Vellora Bay — street life. AI cars cruise the road grid with lane discipline
// (right-hand lanes, turns at intersections, yielding to the car ahead) and
// pedestrians stroll the sidewalks — and run when a gun goes off or a car
// comes at them too fast. Cash pickups spin on sidewalks and the beach.
import { makeRng, pick, range, clamp, dist2, headingToward, angleDamp } from './util.js';
import { ROAD_LINES, PITCH } from './city.js';
import { DriveCar } from './vehicles.js';
import { makeHumanoid } from './player.js';

const PED_SHIRTS = ['#d8a24a', '#4a8a5a', '#8a4a6b', '#5a6a8a', '#c9c9c9', '#7a4ad8', '#3a9a9a'];

export class Traffic {
  constructor(S) {
    this.S = S;
    this.rng = makeRng(99);
    this.aiCars = [];
    this.peds = [];
    this.pickups = [];
    this.spawnCars();
    this.spawnPeds();
    this.spawnPickups();
  }

  allCars() {
    return this.aiCars;
  }

  spawnCars() {
    // Parked cars from the city layout, plus a fleet of cruising AI cars.
    for (const spot of this.S.city.carSpawns) {
      const car = new DriveCar(this.S, spot.type, spot.x, spot.z, spot.rot);
      car.parked = true;
      this.aiCars.push(car);
    }
    const cruiseTypes = ['sedan', 'taxi', 'van', 'sedan', 'sports', 'taxi', 'sedan', 'van', 'sedan', 'taxi', 'sports', 'sedan'];
    for (let i = 0; i < 12; i++) {
      const line = pick(this.rng, ROAD_LINES);
      const along = range(this.rng, -120, 120);
      const horizontal = i % 2 === 0;
      const x = horizontal ? along : line + 3;
      const z = horizontal ? line + 3 : along;
      const heading = horizontal ? (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (this.rng() < 0.5 ? 0 : Math.PI);
      const car = new DriveCar(this.S, cruiseTypes[i % cruiseTypes.length], x, z, heading);
      car.driver = 'ai';
      car.parked = false;
      car.ai = { node: this.nearestNode(x, z), target: null, wait: 0, cruise: range(this.rng, 8, 13) };
      car.ai.target = this.pickNextNode(car.ai.node, car.heading);
      this.aiCars.push(car);
    }
  }

  nearestNode(x, z) {
    let best = { ix: 0, iz: 0 };
    let bestD = Infinity;
    for (let ix = 0; ix < ROAD_LINES.length; ix++) {
      for (let iz = 0; iz < ROAD_LINES.length; iz++) {
        const d = dist2(x, z, ROAD_LINES[ix], ROAD_LINES[iz]);
        if (d < bestD) {
          bestD = d;
          best = { ix, iz };
        }
      }
    }
    return best;
  }

  pickNextNode(node, heading) {
    // At an intersection, keep going, turn left or turn right — never reverse.
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    const options = [];
    const N = ROAD_LINES.length;
    if (Math.abs(fz) > 0.5) {
      const dir = fz < 0 ? -1 : 1;
      if (node.iz + dir >= 0 && node.iz + dir < N) options.push({ ix: node.ix, iz: node.iz + dir });
      if (node.ix + 1 < N) options.push({ ix: node.ix + 1, iz: node.iz });
      if (node.ix - 1 >= 0) options.push({ ix: node.ix - 1, iz: node.iz });
    } else {
      const dir = fx < 0 ? -1 : 1;
      if (node.ix + dir >= 0 && node.ix + dir < N) options.push({ ix: node.ix + dir, iz: node.iz });
      if (node.iz + 1 < N) options.push({ ix: node.ix, iz: node.iz + 1 });
      if (node.iz - 1 >= 0) options.push({ ix: node.ix, iz: node.iz - 1 });
    }
    if (!options.length) return { ix: (node.ix + 1) % N, iz: node.iz };
    return pick(this.rng, options);
  }

  driveAi(car, dt) {
    const ai = car.ai;
    if (!ai) return;
    const tx = ROAD_LINES[ai.target.ix];
    const tz = ROAD_LINES[ai.target.iz];
    // Right-hand lane: offset 3 m to the right of the direction of travel.
    const fx = -Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    const rx = -fz;
    const rz = fx;
    const goalX = tx + rx * 3;
    const goalZ = tz + rz * 3;
    const d = dist2(car.x, car.z, goalX, goalZ);
    if (d < 4) {
      ai.node = ai.target;
      ai.target = this.pickNextNode(ai.node, car.heading);
      return;
    }
    const want = headingToward(car.x, car.z, goalX, goalZ);
    const diff = Math.abs(((want - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    // Yield: someone slow right ahead in our lane.
    let blocked = false;
    for (const other of this.aiCars) {
      if (other === car || other.driver === null) continue;
      const od = dist2(car.x, car.z, other.x, other.z);
      if (od < 9) {
        const ox = other.x - car.x;
        const oz = other.z - car.z;
        const ahead = ox * fx + oz * fz;
        if (ahead > 0 && Math.abs(ox * rz + oz * rx) < 3) {
          blocked = true;
          break;
        }
      }
    }
    const p = this.S.player;
    if (p.car === car) blocked = false;
    const targetSpeed = blocked ? 0 : ai.cruise;
    const input = { up: car.speed < targetSpeed, down: car.speed > targetSpeed + 1, left: false, right: false, hand: false };
    // Steer toward the goal: cross>0 means the goal is to our right.
    const cross = fx * (goalZ - car.z) - fz * (goalX - car.x);
    input.left = cross < -0.4;
    input.right = cross > 0.4;
    if (diff > 2.4) input.up = false; // do not plough through a U-turn
    car.drive(dt, input);
  }

  spawnPeds() {
    for (let i = 0; i < 24; i++) {
      const rig = makeHumanoid(this.S.THREE, {
        shirt: pick(this.rng, PED_SHIRTS),
        pants: pick(this.rng, ['#2c3240', '#3a2c24', '#4a4a4a', '#24303a']),
        skin: pick(this.rng, ['#c98d64', '#8a5a3a', '#e8b88a', '#6b4530']),
        hair: pick(this.rng, ['#241a12', '#3a2a1a', '#101010', '#6a6a6a']),
        scale: range(this.rng, 0.92, 1.06),
      });
      const x = range(this.rng, -130, 130);
      const z = range(this.rng, -130, 130);
      rig.group.position.set(x, 0, z);
      this.S.scene.add(rig.group);
      this.peds.push({
        rig, x, z, heading: range(this.rng, 0, Math.PI * 2),
        speed: range(this.rng, 1.1, 1.9), phase: range(this.rng, 0, 6),
        tx: x, tz: z, state: 'stroll', fleeT: 0, retarget: 0,
      });
    }
  }

  spawnPickups() {
    const gold = new this.S.THREE.MeshStandardMaterial({ color: '#e8b92a', emissive: '#a87800', emissiveIntensity: 0.7, metalness: 0.8, roughness: 0.25 });
    for (const spot of this.S.city.cashSpots) {
      const mesh = new this.S.THREE.Mesh(new this.S.THREE.CylinderGeometry(0.55, 0.55, 0.12, 14), gold);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(spot.x, 1, spot.z);
      mesh.castShadow = true;
      this.S.scene.add(mesh);
      this.pickups.push({ mesh, x: spot.x, z: spot.z, taken: false, spin: this.rng() * 6 });
    }
  }

  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (dist2(ped.x, ped.z, x, z) < radius) {
        ped.state = 'flee';
        ped.fleeT = 2.5 + this.rng() * 2;
      }
    }
  }

  update(dt) {
    const S = this.S;
    if (!S.started || S.paused || S.over) return;
    // AI cars drive; parked cars sit still.
    for (const car of this.aiCars) {
      if (car.driver === 'ai') this.driveAi(car, dt);
    }
    // Car-car bumps (cheap O(n^2), n is small).
    for (let i = 0; i < this.aiCars.length; i++) {
      for (let j = i + 1; j < this.aiCars.length; j++) {
        const a = this.aiCars[i];
        const b = this.aiCars[j];
        if (a.driver === null && b.driver === null) continue;
        a.bump(b);
      }
    }
    // Player car bumps traffic.
    const pc = S.player.car;
    if (pc) {
      for (const car of this.aiCars) {
        if (car === pc) continue;
        if (pc.bump(car)) {
          if (Math.abs(pc.speed) > 9) {
            S.police.addHeat(0.4, 'hit traffic');
            S.hud.toast('You smashed into traffic!');
          }
          if (car.driver === 'ai') car.ai.wait = 0.6;
        }
      }
    }
    // Pedestrians.
    const p = S.player;
    for (const ped of this.peds) {
      ped.retarget -= dt;
      // Danger nearby: player car speeding close, or a recent gunshot.
      const dangerX = pc ? pc.x : p.x;
      const dangerZ = pc ? pc.z : p.z;
      const dangerSpeed = pc ? Math.abs(pc.speed) : p.speed;
      if (ped.state === 'stroll' && dist2(ped.x, ped.z, dangerX, dangerZ) < (pc ? 9 : 4) && dangerSpeed > 3) {
        ped.state = 'flee';
        ped.fleeT = 2 + this.rng() * 1.5;
      }
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        const away = Math.atan2(-(ped.x - dangerX), -(ped.z - dangerZ));
        ped.heading = away;
        ped.speed = 4.6;
        if (ped.fleeT <= 0) ped.state = 'stroll';
      } else {
        ped.speed = 1.5;
        if (ped.retarget <= 0 || dist2(ped.x, ped.z, ped.tx, ped.tz) < 2) {
          ped.tx = clamp(ped.x + range(this.rng, -30, 30), -138, 138);
          ped.tz = clamp(ped.z + range(this.rng, -30, 30), -138, 150);
          ped.retarget = range(this.rng, 6, 14);
        }
        ped.heading = angleDamp(ped.heading, headingToward(ped.x, ped.z, ped.tx, ped.tz), 4, dt);
      }
      ped.x += -Math.sin(ped.heading) * ped.speed * dt;
      ped.z += -Math.cos(ped.heading) * ped.speed * dt;
      ped.x = clamp(ped.x, -142, 185);
      ped.z = clamp(ped.z, -142, 172);
      ped.phase += dt * ped.speed * 2.2;
      const swing = Math.sin(ped.phase) * 0.6;
      ped.rig.legL.rotation.x = swing;
      ped.rig.legR.rotation.x = -swing;
      ped.rig.armL.rotation.x = -swing * 0.7;
      ped.rig.armR.rotation.x = swing * 0.7;
      ped.rig.group.position.set(ped.x, 0, ped.z);
      ped.rig.group.rotation.y = ped.heading;
      // Running someone over is a crime — and it hurts.
      if (pc && dist2(ped.x, ped.z, pc.x, pc.z) < 2 && Math.abs(pc.speed) > 4) {
        ped.state = 'flee';
        ped.fleeT = 3;
        ped.x += -Math.sin(pc.heading) * 6;
        ped.z += -Math.cos(pc.heading) * 6;
        S.police.addHeat(1, 'hit a pedestrian');
        S.hud.toast('You hit a pedestrian! The city saw that.');
        S.audio.bad();
      }
    }
    // Cash pickups spin; collecting one pays out.
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.spin += dt * 3;
      pk.mesh.rotation.y = pk.spin;
      pk.mesh.position.y = 1 + Math.sin(pk.spin * 0.7) * 0.15;
      if (dist2(p.x, p.z, pk.x, pk.z) < 2.2) {
        pk.taken = true;
        pk.mesh.visible = false;
        const amount = 25 + Math.floor(this.rng() * 26);
        S.cash += amount;
        S.hud.toast('Picked up $' + amount + ' in street cash.');
        S.audio.pickup();
      }
    }
  }
}
