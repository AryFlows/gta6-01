# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/AryFlows/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/AryFlows/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Vellora Bay — a complete open-world crime game that plays offline in a desktop browser: a sun-soaked coastal city to explore on foot and by car, traffic and pedestrians, cars to steal, a wanted level with police, missions and a story, combat, and a HUD with a minimap.

## Run it

```sh
node serve.ts
```

This serves `game/` at http://localhost:8080 — open it in desktop Chrome and play with keyboard and mouse. No build step, no network requests: every file the game loads lives under `game/`.

## How it was built

Built by an AI agent for make.fun's "Make GTA 6" bounty ($1,666 in USDC). `main.ts` hands the game in: it copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's `buildDossier`. The game itself is original — its own city, characters, vehicles, names, story, art, sound and music.

---

<sub>Entered on [make.fun](https://make.fun/?ref=m2fjazt9&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
