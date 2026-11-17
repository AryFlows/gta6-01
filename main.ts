// Vellora Bay — the entrypoint (Node 22, standard library only).
//
// This program hands the game in. It copies the playable static game in game/
// and the screenshots in screenshots/ from beside this file into the output
// directory (/output in the grader, MAKEFUN_OUTPUT_DIR anywhere else), then
// writes /output/dossier.json with the kit library's buildDossier, so the
// judge reads exactly the game that is on disk. Before writing the dossier it
// sanity-checks the hand-in the way the scorer will: the game tree fits its
// caps, every screenshot is a PNG or JPEG inside its size cap, and the entry
// point the page loads actually exists.
//
// Run it from the repository root with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// and serve the game locally with `node serve.ts` (http://localhost:8080).
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// The scorer's own caps, from the kit's gate: the dossier text is capped at
// 160 KiB, screenshots at 4 files of 256 KiB, game/ at 993 entries / 48 MiB.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  throw new Error('vellora entry: ' + message);
}

function countTree(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      const sub = countTree(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

function checkShots(dir) {
  if (!existsSync(dir)) fail('screenshots/ is missing from the repository');
  const shots = readdirSync(dir).filter((n) => !n.startsWith('.'));
  if (shots.length < 3 || shots.length > DOSSIER_CAPS.screenshots.max) {
    fail('expected 3 or 4 screenshots, found ' + shots.length);
  }
  for (const name of shots) {
    const full = join(dir, name);
    const st = statSync(full);
    if (!st.isFile()) fail('screenshot ' + name + ' is not a regular file');
    if (!/\.(png|jpe?g)$/i.test(name)) fail('screenshot ' + name + ' is not a PNG or JPEG');
    if (st.size > DOSSIER_CAPS.screenshots.max_bytes) {
      fail('screenshot ' + name + ' is ' + st.size + ' bytes, over the 256 KiB cap');
    }
  }
  return shots;
}

function checkGame(dir) {
  if (!existsSync(join(dir, 'index.html'))) fail('game/index.html is missing');
  const tree = countTree(dir);
  if (tree.files > DOSSIER_CAPS.game_max_files) {
    fail('game/ has ' + tree.files + ' files, over the 993 cap');
  }
  if (tree.bytes > DOSSIER_CAPS.game_max_bytes) {
    fail('game/ is ' + tree.bytes + ' bytes, over the 48 MiB cap');
  }
  return tree;
}

function handIn() {
  const gameDir = join(repoRoot, 'game');
  const shotsDir = join(repoRoot, 'screenshots');
  const tree = checkGame(gameDir);
  const shots = checkShots(shotsDir);
  mkdirSync(outputDir, { recursive: true });
  cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
  const dossier = buildDossier(outputDir, DOSSIER_CAPS);
  writeFileSync(join(outputDir, 'dossier.json'), dossier);
  const dossierBytes = Buffer.byteLength(dossier, 'utf8');
  if (dossierBytes > 1572864) fail('dossier.json is ' + dossierBytes + ' bytes, over the 1.5 MiB cap');
  console.log('Vellora Bay handed in: ' + tree.files + ' game files (' + tree.bytes + ' bytes), '
    + shots.length + ' screenshots, dossier.json ' + dossierBytes + ' bytes -> ' + outputDir);
}

handIn();
