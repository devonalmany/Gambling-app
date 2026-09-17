// Bullets + lobbed grenades. A flat array works fine at this scale (a few
// hundred live projectiles at most); no need for a real object pool.

let nextId = 1;

export function spawnProjectile(list, opts) {
  list.push({
    id: nextId++,
    x: opts.x,
    y: opts.y,
    vx: Math.cos(opts.angle) * opts.speed,
    vy: Math.sin(opts.angle) * opts.speed,
    radius: opts.radius ?? 4,
    damage: opts.damage,
    crit: !!opts.crit,
    pierceLeft: opts.pierce ?? 0,
    hitIds: new Set(),
    explosive: !!opts.explosive,
    explosionRadius: opts.explosionRadius ?? 0,
    explosionDamageMul: opts.explosionDamageMul ?? 0.5,
    mode: opts.mode ?? "bullet", // "bullet" | "grenade"
    fuse: opts.fuse ?? 0,
    age: 0,
    color: opts.color ?? "#ffe066",
    hostile: !!opts.hostile,
    slowFx: opts.slowFx ?? null,
    trail: [],
  });
}

export function updateProjectiles(list, dt, bounds) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 4) p.trail.shift();
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    let dead = false;
    if (p.mode === "grenade" && p.fuse > 0 && p.age >= p.fuse) dead = true;
    if (
      p.x < -20 ||
      p.x > bounds.w + 20 ||
      p.y < -20 ||
      p.y > bounds.h + 20
    ) {
      dead = true;
    }
    if (dead) list.splice(i, 1);
  }
}
