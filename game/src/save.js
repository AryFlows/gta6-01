// save.js — Solmar saves to localStorage: cash, story progress, courier
// runs, health and where the player was standing. Loading restores the
// open world exactly where the player left it, minus the heat.

const SAVE_KEY = 'solmar-save-v1';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      cash: state.cash,
      missionIndex: state.missions.index,
      storyDone: state.missions.storyDone,
      courierCount: state.missions.courierCount,
      health: state.player.health,
      playerX: state.player.car ? state.player.car.x : state.player.x,
      playerZ: state.player.car ? state.player.car.z : state.player.z,
      playerAngle: state.player.angle,
      ammo: state.player.ammo,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage blocked */ }
}

// Describe a save in one human line for the start screen's Continue button.
export function saveSummary() {
  const data = loadGame();
  if (!data) return '';
  const when = new Date(data.savedAt);
  const day = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const progress = data.storyDone
    ? 'Story complete'
    : 'Mission ' + (data.missionIndex + 1) + ' of 4';
  return progress + ' · $' + Math.round(data.cash).toLocaleString() + ' · ' + day + ' ' + time;
}
