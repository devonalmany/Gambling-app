import { dist, randRange } from "./utils.js";

export function spawnCurrencyDrop(list, x, y, amount) {
  list.push({
    kind: "currency",
    x: x + randRange(-6, 6),
    y: y + randRange(-6, 6),
    amount,
    vx: randRange(-40, 40),
    vy: randRange(-40, 40),
    life: 12,
    bob: Math.random() * Math.PI * 2,
  });
}

export function maybeSpawnHealthDrop(list, x, y, chance = 0.045) {
  if (Math.random() < chance) {
    list.push({
      kind: "health",
      x,
      y,
      amount: 18,
      vx: 0,
      vy: 0,
      life: 14,
      bob: Math.random() * Math.PI * 2,
    });
  }
}

export function updatePickups(list, dt, player, pickupRadius, magnetActive, onCollect) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    p.bob += dt * 4;
    // brief outward pop, then settle
    p.vx *= 0.9;
    p.vy *= 0.9;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const d = dist(p.x, p.y, player.x, player.y);
    const radius = magnetActive ? 9999 : pickupRadius;
    if (d <= radius) {
      const pullSpeed = magnetActive ? 900 : 420;
      const t = Math.min(1, (pullSpeed * dt) / Math.max(d, 1));
      p.x += (player.x - p.x) * t;
      p.y += (player.y - p.y) * t;
    }
    if (d <= player.radius + 8) {
      onCollect(p);
      list.splice(i, 1);
    } else if (p.life <= 0) {
      list.splice(i, 1);
    }
  }
}
