# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/AryFlows/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/AryFlows/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Vellora Bay v5 — a complete open-world crime game in the spirit of GTA 6, running in a desktop browser from static files. A sun-soaked coastal city to explore on foot and by car, with traffic, pedestrians, a 5-star wanted system, and a story told through jobs.

## What is in the game

v5 adds the depth the leaders show: respect ranks with weapon unlocks, VBPD roadblocks, a 3-person crew with abilities, named districts on the HUD, a 5-slot weapon wheel, and a larger minimap — plus a re-staged chase screenshot with the pursuit in frame.

- **Open world:** drive or walk seven named districts — Downtown Vellora, Harbor Docks, Palm Shores, Central Plaza, North Park, Northside, West End — with traffic, pedestrians, and a minimap that tracks the pursuit and the mission target.
- **Wanted system:** 5-star VBPD heat. Cruisers chase and ram, AIR-1 tracks you with a searchlight from 3 stars, and at 3 stars the dispatch sets roadblocks across the road ahead (BULWARK units, shown live in the dispatch panel).
- **Missions and story:** 4 story jobs and 3 turf jobs with multi-stage objectives, an objectives checklist, and a MISSION COMPLETE banner — plus endless courier runs. Progress autosaves.
- **Progression:** jobs pay respect points toward six ranks, ROOKIE to KING OF THE BAY. Each rank unlocks a weapon.
- **Combat:** a 5-slot weapon wheel (keys 1–5) — fists, pistol, SMG, rifle, shotgun — each with its own magazine and behaviour.
- **Crew:** Mara (SWAP PLATES, drops a star), Lio (PATCH UP, +50 health), and Kiki (EYES OUT, spots the pursuit) on keys Z/X/C, each with a cooldown.
- **Feel:** chase camera with drag orbit, engine audio, radio (BAY FM 101.2), a HUD with minimap, dispatch panel, vehicle card, and reactive fixer dialogue.

## Run it

```sh
node serve.ts --port 8901
```

Then open http://localhost:8901/index.html in desktop Chrome. No build step, no network: every script, image, and sound is a file under `game/` or a `data:` URI.

## Controls

- **WASD / arrows** — drive or walk · **Space** — handbrake · **Mouse drag** — orbit camera · **Wheel** — zoom
- **E** — get in / out of a car · **Click** — shoot (or punch with fists) · **F** — punch · **R** — reload
- **1–5** — draw a weapon · **Z / X / C** — crew abilities · **Esc** — pause · **M** — mute

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
