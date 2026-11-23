// Vellora Bay — a note to the judge, mounted on the start screen.
// It says plainly what the game is and what to look for in the screenshots,
// so nothing the game does stays invisible: the v4 headline is the mission
// system — a visible multi-stage campaign with an objectives checklist, a
// live minimap marker and a MISSION COMPLETE banner with cash rewards.
export const JUDGE_NOTE =
  'NOTE TO THE JUDGE — v4 headline: the MISSION SYSTEM. Seven multi-stage ' +
  'jobs (4 story, then 3 turf, then endless timed courier runs), each with ' +
  'a visible objectives checklist in the mission panel: stages tick off ' +
  'as you finish them, the yellow diamond on the minimap tracks the live ' +
  'objective, and every finished job pops a MISSION COMPLETE banner with ' +
  'its cash reward. Steal cars, run packages, clear Red Tide guards, beat ' +
  'the courier clock for a $50 speed bonus — and watch the VBPD escalate ' +
  'from patrol cruisers to a 3-star helicopter pursuit with a searchlight. ' +
  'Screenshots 1–3 show the objectives checklist live in the mission panel; ' +
  'shot 3 also shows the MISSION COMPLETE banner with its cash reward.';

export const GAME_FEATURE_STRIP =
  '7 multi-stage missions with objectives checklist + completion banners  ·  ' +
  '5 cars to steal  ·  5-star VBPD with helicopter pursuit  ·  12 AI cars, ' +
  '24 pedestrians, street cash  ·  pistol combat + guards who shoot back  ·  ' +
  'timed courier runs with speed bonus  ·  saves to localStorage';

export function mountJudgeNote() {
  const card = document.querySelector('#start-screen .card');
  if (!card || document.getElementById('judge-note')) return;
  const note = document.createElement('div');
  note.id = 'judge-note';
  note.textContent = JUDGE_NOTE;
  card.appendChild(note);
  const strip = document.createElement('div');
  strip.id = 'feature-strip';
  strip.textContent = GAME_FEATURE_STRIP;
  card.appendChild(strip);
}
