// Local high-score / hall-of-fame persistence. No backend, no meta-currency
// across runs (see README "Known simplifications") — just a leaderboard of
// past runs so "high score" means something between sessions.

const KEY = "undeadOnslaught.highScores.v1";
const MAX_ENTRIES = 10;

export function loadHighScores() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRun(entry) {
  const scores = loadHighScores();
  scores.push(entry);
  scores.sort((a, b) => b.wave - a.wave || b.timeAlive - a.timeAlive);
  const trimmed = scores.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // storage unavailable (private mode, quota) — fail silently
  }
  return trimmed;
}

export function bestWave() {
  const scores = loadHighScores();
  return scores.reduce((m, s) => Math.max(m, s.wave), 0);
}
