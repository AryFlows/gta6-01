// Vellora Bay — localStorage save. The game autosaves after every finished
// job and when the player pauses; Continue on the start screen resumes it.
export const SAVE_KEY = 'vellora-save-v1';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (typeof data.cash !== 'number') return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return readSave() !== null;
}

export function writeSave(S) {
  const data = {
    version: 1,
    savedAt: new Date().toISOString(),
    cash: Math.round(S.cash),
    health: Math.round(S.health),
    storyIndex: S.missions ? S.missions.storyIndex : 0,
    turfIndex: S.missions ? S.missions.turfIndex : 0,
    turfUnlocked: S.missions ? !!S.missions.turfUnlocked : false,
    couriersDone: S.missions ? S.missions.couriersDone : 0,
    storyDone: S.missions ? !!S.missions.storyDone : false,
    turfDone: S.missions ? !!S.missions.turfDone : false,
    px: S.player ? +S.player.x.toFixed(1) : 0,
    pz: S.player ? +S.player.z.toFixed(1) : 0,
  };
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function wipeSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* storage unavailable */ }
}
