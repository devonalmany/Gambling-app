import { WAVE } from "./constants.js";
import { weightedChoice } from "./utils.js";
import { spawnZombie, spawnBoss, weightedTypesForWave } from "./enemies.js";

export function createWaveManager() {
  return {
    wave: 0,
    toSpawn: 0,
    spawned: 0,
    spawnTimer: 0,
    spawnInterval: WAVE.spawnIntervalStart,
    isBossWave: false,
    active: false,
  };
}

export function startWave(state, wave, enemies, bounds) {
  state.wave = wave;
  state.spawned = 0;
  state.spawnTimer = 0.4;
  state.spawnInterval = Math.max(
    WAVE.spawnIntervalMin,
    WAVE.spawnIntervalStart - wave * 0.028
  );
  state.isBossWave = wave > 0 && wave % WAVE.bossEvery === 0;
  state.active = true;

  const baseCount = WAVE.baseZombies + (wave - 1) * WAVE.perWaveGrowth;
  state.toSpawn = state.isBossWave ? Math.round(baseCount * 0.45) : baseCount;

  if (state.isBossWave) {
    spawnBoss(enemies, wave, bounds);
  }
}

export function updateWaveManager(state, dt, enemies, bounds) {
  if (!state.active) return;
  if (state.toSpawn > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && enemies.length < WAVE.maxAlive) {
      state.spawnTimer = state.spawnInterval;
      const type = weightedChoice(weightedTypesForWave(state.wave));
      spawnZombie(enemies, type, state.wave, bounds);
      state.toSpawn -= 1;
      state.spawned += 1;
    }
  }
}

export function isWaveClear(state, enemies) {
  return state.active && state.toSpawn <= 0 && enemies.length === 0;
}
