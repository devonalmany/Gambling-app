// The entire 3D presentation layer, built on a locally vendored Three.js
// (js/vendor/three.module.min.js — no CDN dependency, no build step).
//
// Everything upstream of this file (player.js, enemies.js, weapons.js,
// abilities.js, waves.js, ...) is pure simulation state in a flat
// screen-pixel-ish coordinate space (player.x/y, z.x/y, ...) and knows
// nothing about rendering. This module maps that 2D coordinate space onto
// a 3D ground plane (world X = game x, world Z = game y, world Y = height)
// and is the only thing that touches Three.js. main.js calls `sync(state)`
// once a frame with the live game state, then `render()`.
//
// Low-poly primitive shapes stand in for characters/zombies (no modeling
// pipeline here), but real lighting, shadows, and fog carry the "3D" look.

import * as THREE from "./vendor/three.module.min.js";

let renderer, scene, camera;
let canvasEl;
let boundsW = 0;
let boundsH = 0;

let sunLight, ambientLight, hemiLight, playerLight;
let groundMesh, groundTex;
let cornerPylons = [];

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _proj = new THREE.Vector3();

// Camera framing: a fixed, angled orthographic camera so the whole arena
// is always visible with no perspective distortion — same "see everything,
// camera never pans" feel as the old 2D canvas, just no longer flat.
const CAM_ELEV = (58 * Math.PI) / 180;
const CAM_DIST = 1400;

let shakeMag = 0;

// ---- Generic pool: diffs a live-state array against pooled 3D/DOM
// objects keyed by the array items' own identity, so callers never need
// to hand-manage add/remove bookkeeping. ---------------------------------
class ItemPool {
  constructor(createFn, updateFn, removeFn) {
    this.map = new Map();
    this.createFn = createFn;
    this.updateFn = updateFn;
    this.removeFn = removeFn;
    this._seen = new Set();
  }
  sync(items, extra) {
    this._seen.clear();
    for (const item of items) {
      this._seen.add(item);
      let obj = this.map.get(item);
      if (!obj) {
        obj = this.createFn(item, extra);
        this.map.set(item, obj);
      }
      this.updateFn(obj, item, extra);
    }
    for (const [item, obj] of this.map) {
      if (!this._seen.has(item)) {
        this.removeFn(obj);
        this.map.delete(item);
      }
    }
  }
  clear() {
    for (const obj of this.map.values()) this.removeFn(obj);
    this.map.clear();
  }
}

function addRemove(obj) {
  scene.remove(obj);
}
function domRemove(el) {
  el.remove();
}

// ---- Shared geometry / material caches ---------------------------------
const geo = {
  sphere: new THREE.SphereGeometry(1, 12, 9),
  sphereLo: new THREE.SphereGeometry(1, 7, 6),
  cone: new THREE.ConeGeometry(1, 1, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  octa: new THREE.OctahedronGeometry(1, 0),
  ico: new THREE.IcosahedronGeometry(1, 0),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 8),
  ring: new THREE.RingGeometry(0.85, 1, 24),
  disc: new THREE.CircleGeometry(1, 16),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
  plane: new THREE.PlaneGeometry(1, 1),
};
geo.ring.rotateX(-Math.PI / 2);
geo.disc.rotateX(-Math.PI / 2);

const matCache = new Map();
function stdMat(color, opts = {}) {
  const key = "std:" + color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.65,
      metalness: 0.08,
      ...opts,
    });
    matCache.set(key, m);
  }
  return m;
}
function glowMat(color, opts = {}) {
  const key = "glow:" + color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      ...opts,
    });
    matCache.set(key, m);
  }
  return m;
}
function lineMat(color, opts = {}) {
  const key = "line:" + color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...opts });
    matCache.set(key, m);
  }
  return m;
}

function setPos(obj, gx, gy, h = 0) {
  obj.position.set(gx, h, gy);
}
function setFacing(obj, angle) {
  obj.rotation.y = -angle;
}
function mkMesh(g, m) {
  const mesh = new THREE.Mesh(g, m);
  return mesh;
}

// ---- Init / resize -------------------------------------------------------
export function init(canvas) {
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // The map palettes (maps.js) are deliberately dark — they were painted
  // for direct, unlit 2D canvas display. Under real PBR lighting the same
  // pixels come out badly under-exposed, so light levels and exposure here
  // run well above "physically plausible" to bring them back up to a
  // similar on-screen brightness while still getting real shading/shadows.
  renderer.toneMappingExposure = 2.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);

  ambientLight = new THREE.AmbientLight(0xffffff, 2.1);
  scene.add(ambientLight);
  hemiLight = new THREE.HemisphereLight(0x8fb0c8, 0x352f22, 1.5);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff3d6, 3.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1536, 1536);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 4000;
  sunLight.shadow.bias = -0.0018;
  scene.add(sunLight);
  scene.add(sunLight.target);

  playerLight = new THREE.PointLight(0xbfe8ff, 0.9, 420, 2);
  playerLight.position.set(0, 90, 0);
  scene.add(playerLight);

  cornerPylons = Array.from({ length: 4 }, () => {
    const m = mkMesh(geo.cylinder, glowMat(0xea4b4f, { opacity: 0.85 }));
    m.scale.set(4, 60, 4);
    scene.add(m);
    return m;
  });

  buildPlayerMesh();
  buildShieldMesh();
}

export function resize(w, h) {
  boundsW = w;
  boundsH = h;
  renderer.setSize(w, h, false);

  const cx = w / 2;
  const cz = h / 2;
  camera.position.set(cx, CAM_DIST * Math.sin(CAM_ELEV), cz + CAM_DIST * Math.cos(CAM_ELEV));
  camera.lookAt(cx, 0, cz);

  const halfW = (w / 2) * 1.06;
  const halfH = (h / 2) * Math.sin(CAM_ELEV) * 1.18;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.near = 1;
  camera.far = 6000;
  camera.updateProjectionMatrix();

  sunLight.position.set(cx - w * 0.25, 900, cz - h * 0.15);
  sunLight.target.position.set(cx, 0, cz);
  sunLight.shadow.camera.left = -Math.max(w, h) * 0.7;
  sunLight.shadow.camera.right = Math.max(w, h) * 0.7;
  sunLight.shadow.camera.top = Math.max(w, h) * 0.7;
  sunLight.shadow.camera.bottom = -Math.max(w, h) * 0.7;
  sunLight.shadow.camera.updateProjectionMatrix();

  const m = 34;
  const corners = [
    [m, m],
    [w - m, m],
    [m, h - m],
    [w - m, h - m],
  ];
  corners.forEach(([x, z], i) => setPos(cornerPylons[i], x, z, 30));

  if (groundMesh) {
    groundMesh.scale.set(w, h, 1);
    groundMesh.position.set(w / 2, 0, h / 2);
  }
}

// ---- Ground plane, rebuilt per map/resize from the same procedurally
// painted canvas texture main.js already builds (buildGroundTexture) ----
export function setGround(offscreenCanvas, mapDef) {
  if (groundTex) groundTex.dispose();
  groundTex = new THREE.CanvasTexture(offscreenCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  if (groundMesh) {
    scene.remove(groundMesh);
    groundMesh.geometry.dispose();
  }
  groundMesh = mkMesh(geo.plane, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 }));
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  groundMesh.scale.set(boundsW || 1, boundsH || 1, 1);
  groundMesh.position.set((boundsW || 1) / 2, 0, (boundsH || 1) / 2);
  scene.add(groundMesh);

  const mood = MAP_MOODS[mapDef.id] ?? MAP_MOODS.default;
  hemiLight.color.setHex(mood.sky);
  hemiLight.groundColor.setHex(mood.ground);
  sunLight.color.setHex(mood.sun);
  ambientLight.color.setHex(mood.ambient);
}

const MAP_MOODS = {
  compound: { sky: 0x7fae8f, ground: 0x141a10, sun: 0xfff3d6, ambient: 0xaad4b0 },
  suburbia: { sky: 0xb59a63, ground: 0x211f14, sun: 0xffdca0, ambient: 0xc9b487 },
  boneyard: { sky: 0x6c7a82, ground: 0x0f1412, sun: 0xc9d8e0, ambient: 0x8f9ba0 },
  foundry: { sky: 0xc98a5a, ground: 0x1a130d, sun: 0xffb060, ambient: 0xd6a06a },
  default: { sky: 0x8fb0c8, ground: 0x1a1a14, sun: 0xfff3d6, ambient: 0xffffff },
};

export function setFogActive(active) {
  if (!active) {
    scene.fog = null;
    return;
  }
  // Fog distance is measured from the camera, not the player — and this
  // camera sits CAM_DIST away from the arena at all times (it never
  // follows the player), so the range has to be centered on that offset
  // or the entire ground plane ends up past the fog's far distance.
  scene.fog = new THREE.Fog(0x05070a, CAM_DIST - 550, CAM_DIST + 1100);
}

// ---- Mouse aim: raycast the pointer against the ground plane -----------
export function screenToGround(mouseX, mouseY) {
  if (!boundsW || !boundsH) return null;
  _ndc.set((mouseX / boundsW) * 2 - 1, -(mouseY / boundsH) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  const ok = raycaster.ray.intersectPlane(groundPlane, _hit);
  if (!ok) return null;
  return { x: _hit.x, y: _hit.z };
}

export function setShake(mag) {
  shakeMag = mag;
}

function projectToScreen(gx, gy, h) {
  _proj.set(gx, h, gy);
  _proj.project(camera);
  return {
    x: (_proj.x * 0.5 + 0.5) * boundsW,
    y: (-_proj.y * 0.5 + 0.5) * boundsH,
  };
}

// ---- Player: a small low-poly humanoid (head, torso, two arms, two legs,
// a backpack for a recognizable silhouette from behind, and a gun in the
// lead hand) instead of a single capsule. Built in unit-relative local
// coordinates (forward = local +X, up = +Y, left/right = Z) and scaled as
// a whole by the player's radius, the same convention enemies use. -------
let playerGroup, playerRing, playerGun, shieldMesh;
let playerHead, playerVisor, playerTorso, playerArmL, playerArmR, playerLegL, playerLegR;
let playerLimbMats = [];
function buildPlayerMesh() {
  playerGroup = new THREE.Group();

  const legGeo = geo.capsule;
  playerLegL = mkMesh(legGeo, stdMat(0x1a2430).clone());
  playerLegR = mkMesh(legGeo, stdMat(0x1a2430).clone());
  for (const leg of [playerLegL, playerLegR]) {
    leg.scale.set(0.19, 0.26, 0.19);
    leg.castShadow = true;
    playerGroup.add(leg);
  }
  playerLegL.position.set(-0.04, -0.52, 0.2);
  playerLegR.position.set(-0.04, -0.52, -0.2);

  playerTorso = mkMesh(geo.capsule, stdMat(0xffffff).clone());
  playerTorso.scale.set(0.36, 0.3, 0.3);
  playerTorso.position.set(0, 0.04, 0);
  playerTorso.castShadow = true;
  playerGroup.add(playerTorso);

  const backpack = mkMesh(geo.box, stdMat(0x14181c));
  backpack.scale.set(0.18, 0.42, 0.42);
  backpack.position.set(-0.32, 0.08, 0);
  playerGroup.add(backpack);

  const armGeo = geo.capsule;
  playerArmL = mkMesh(armGeo, stdMat(0xffffff).clone());
  playerArmR = mkMesh(armGeo, stdMat(0xffffff).clone());
  for (const arm of [playerArmL, playerArmR]) {
    arm.scale.set(0.15, 0.24, 0.15);
    playerGroup.add(arm);
  }
  playerArmL.position.set(0, 0.24, 0.4);
  playerArmR.position.set(0.08, 0.2, -0.38);
  playerArmR.rotation.z = -0.35;

  playerHead = mkMesh(geo.sphere, stdMat(0xffffff).clone());
  playerHead.scale.setScalar(0.32);
  playerHead.position.set(0.03, 0.8, 0);
  playerHead.castShadow = true;
  playerGroup.add(playerHead);

  playerVisor = mkMesh(geo.sphereLo, glowMat(0xe2f2ff, { opacity: 0.95 }));
  playerVisor.scale.set(0.1, 0.07, 0.24);
  playerVisor.position.set(0.29, 0.81, 0);
  playerGroup.add(playerVisor);

  playerGun = mkMesh(geo.box, stdMat(0x1a2430));
  playerGun.scale.set(1.0, 0.18, 0.18);
  playerGun.position.set(0.62, 0.2, -0.4);
  playerGroup.add(playerGun);

  playerRing = mkMesh(geo.ring, glowMat(0x8fe13f, { opacity: 0.4, side: THREE.DoubleSide }));
  playerRing.rotation.x = -Math.PI / 2;
  playerRing.position.y = -0.98;
  playerGroup.add(playerRing);

  playerLimbMats = [playerTorso.material, playerArmL.material, playerArmR.material, playerHead.material];

  scene.add(playerGroup);
}
function buildShieldMesh() {
  shieldMesh = mkMesh(geo.sphere, glowMat(0x60a5fa, { opacity: 0.28, wireframe: true }));
  shieldMesh.visible = false;
  scene.add(shieldMesh);
}
let lastPlayerX = null;
let lastPlayerY = null;
let walkPhase = 0;
function updatePlayer(player, now) {
  const r = player.radius;
  // The visible character is drawn noticeably bigger than the hit-radius
  // (a common game trick for legibility) — position height is derived from
  // that same visual scale, not r, so the feet still land on the ground.
  const visualScale = r * 1.3;
  setPos(playerGroup, player.x, player.y, visualScale * 0.9);
  playerGroup.scale.setScalar(visualScale);
  setFacing(playerGroup, player.facing);

  // Leg/arm swing driven by distance actually traveled since last frame,
  // not elapsed time, so the walk cycle speeds up and stops with movement
  // instead of animating in place while standing still.
  if (lastPlayerX !== null) {
    const stepDist = Math.hypot(player.x - lastPlayerX, player.y - lastPlayerY);
    walkPhase += Math.min(stepDist, 40) * 0.09;
  }
  lastPlayerX = player.x;
  lastPlayerY = player.y;
  const swing = player.dashing ? 0 : Math.sin(walkPhase) * 0.5;
  playerLegL.rotation.z = swing;
  playerLegR.rotation.z = -swing;
  playerArmL.rotation.z = -swing * 0.6;

  const col = player.characterColor;
  const flashing = player.invulnMs > 0 && Math.floor(now / 60) % 2 === 0;
  const bodyMat = stdMat(col.primary, { emissive: new THREE.Color(col.accent), emissiveIntensity: player.dashing ? 0.55 : 0.15 });
  for (const m of playerLimbMats) {
    m.color.copy(bodyMat.color);
    m.emissive.copy(bodyMat.emissive);
    m.emissiveIntensity = bodyMat.emissiveIntensity;
    m.opacity = flashing ? 0.4 : 1;
    m.transparent = flashing;
  }
  playerRing.material.color.set(col.accent);
  playerRing.scale.setScalar(1.55 + Math.sin(now / 320) * 0.04);

  playerLight.position.set(player.x, 140, player.y);
  playerLight.color.set(col.accent);

  shieldMesh.visible = player.shieldHp > 0;
  if (shieldMesh.visible) {
    setPos(shieldMesh, player.x, player.y, visualScale * 0.9);
    shieldMesh.scale.setScalar(visualScale * 1.5 * (1 + Math.sin(now / 300) * 0.03));
  }
}

// ---- Enemies ---------------------------------------------------------------
function buildEnemyMesh(z) {
  const group = new THREE.Group();
  const color = z.color;
  // Body material is per-instance (cloned off the cache) because
  // updateEnemyMesh mutates its emissive/opacity for hit-flash, burn, and
  // buff glow — sharing the cached material would make every enemy of the
  // same type/color flash in lockstep.
  let body;
  if (z.isBoss) {
    body = mkMesh(geo.ico, stdMat(0x6b6b8f, { emissive: 0xf43f5e, emissiveIntensity: 0.25 }).clone());
    body.castShadow = true;
    group.add(body);
    const blades = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const b = mkMesh(geo.cone, stdMat(0x14141f));
      b.rotation.z = Math.PI / 2;
      b.scale.set(0.55, 1.5, 0.55);
      const a = (i / 6) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95);
      b.rotation.y = -a;
      blades.add(b);
    }
    group.add(blades);
    group.userData.blades = blades;
    const core = mkMesh(geo.sphereLo, glowMat(0xf43f5e, { opacity: 0.6 }).clone());
    core.scale.setScalar(0.45);
    group.add(core);
    group.userData.core = core;
  } else if (z.type === "brute") {
    body = mkMesh(geo.ico, stdMat(color).clone());
    body.castShadow = true;
    group.add(body);
  } else if (z.type === "runner") {
    body = mkMesh(geo.capsule, stdMat(color).clone());
    body.rotation.z = Math.PI / 2;
    group.add(body);
  } else if (z.type === "spitter") {
    body = mkMesh(geo.sphere, stdMat(color).clone());
    group.add(body);
    const core = mkMesh(geo.sphereLo, glowMat(0x96ff78, { opacity: 0.7 }).clone());
    core.scale.setScalar(0.42);
    group.add(core);
    group.userData.core = core;
  } else if (z.type === "screamer") {
    body = mkMesh(geo.sphere, stdMat(color).clone());
    group.add(body);
    const mouth = mkMesh(geo.cone, stdMat(0x0a0510));
    mouth.rotation.z = -Math.PI / 2;
    mouth.scale.set(0.4, 0.5, 0.4);
    mouth.position.set(0.65, 0, 0);
    group.add(mouth);
    group.userData.mouth = mouth;
  } else {
    body = mkMesh(geo.sphere, stdMat(color).clone());
    group.add(body);
  }
  group.userData.body = body;

  const eyes = mkMesh(geo.sphereLo, glowMat(0xff3b3b, { opacity: 0.9 }));
  eyes.scale.set(0.14, 0.14, 0.14);
  group.add(eyes);
  group.userData.eyes = eyes;

  scene.add(group);
  return group;
}
function updateEnemyMesh(group, z, now) {
  setPos(group, z.x, z.y, z.radius);

  // Every geometry here is built at unit size, so scaling the whole group
  // by z.radius scales body + eyes + any per-type extras (blades, core,
  // mouth) together consistently — they're all positioned/sized in
  // unit-relative (fractions of 1) local coordinates.
  if (z.type === "runner") {
    group.scale.set(z.radius * 0.85, z.radius * 0.85, z.radius * 1.3);
  } else {
    group.scale.setScalar(z.radius);
  }

  if (z.isBoss) {
    group.userData.blades.rotation.y += 0.02;
    const pulse = 0.5 + Math.sin(now / 250) * 0.5;
    group.userData.core.material.opacity = 0.4 + pulse * 0.4;
  } else if (z.type === "runner") {
    const toPlayerAngle = Math.atan2(playerRefY - z.y, playerRefX - z.x);
    setFacing(group, toPlayerAngle);
  } else if (z.type === "spitter") {
    const pulse = 0.5 + Math.sin(now / 260 + z.uid) * 0.5;
    group.userData.core.material.opacity = 0.4 + pulse * 0.5;
  } else if (z.type === "screamer") {
    const toPlayerAngle = Math.atan2(playerRefY - z.y, playerRefX - z.x);
    setFacing(group, toPlayerAngle);
    const mouthOpen = 0.35 + Math.abs(Math.sin(now / 130)) * 0.35;
    group.userData.mouth.scale.set(0.35 + mouthOpen * 0.3, 0.5, 0.35 + mouthOpen * 0.3);
  }

  const toPlayerAngle = Math.atan2(playerRefY - z.y, playerRefX - z.x);
  const eyeDist = 0.62;
  group.userData.eyes.position.set(Math.cos(toPlayerAngle) * eyeDist, 0.15, Math.sin(toPlayerAngle) * eyeDist);
  group.userData.eyes.scale.setScalar(0.13);

  const buffed = z.buffedUntil > now;
  const burning = z.burnUntil > now;
  const hitFlash = z.hitFlashUntil > now;
  const body = group.userData.body;
  if (body.material.emissiveIntensity !== undefined) {
    body.material.emissiveIntensity = hitFlash ? 1.4 : burning ? 0.55 : buffed ? 0.4 : z.isBoss ? 0.25 : 0;
    body.material.emissive.set(hitFlash ? 0xffffff : burning ? 0xff7a1f : buffed ? 0xe879f9 : z.isBoss ? 0xf43f5e : 0x000000);
  }
}

const enemyPool = new ItemPool(
  (z) => buildEnemyMesh(z),
  (obj, z) => updateEnemyMesh(obj, z, nowRef),
  addRemove
);

let playerRefX = 0;
let playerRefY = 0;
let nowRef = 0;

// ---- Projectiles -----------------------------------------------------------
function buildProjectileMesh(p) {
  const group = new THREE.Group();
  const s = p.mode === "grenade" ? 1.4 : 1;
  const body = mkMesh(geo.sphere, glowMat(p.hostile ? 0x8fe36b : p.color, { opacity: 1 }));
  body.scale.setScalar((p.radius || 4) * s);
  group.add(body);
  group.userData.body = body;
  scene.add(group);
  return group;
}
function updateProjectileMesh(group, p) {
  const height = p.mode === "grenade" && p.fuse > 0 ? Math.sin(Math.min(1, p.age / p.fuse) * Math.PI) * 60 + 6 : 6;
  setPos(group, p.x, p.y, height);
}
const friendlyProjPool = new ItemPool(buildProjectileMesh, updateProjectileMesh, addRemove);
const enemyProjPool = new ItemPool(buildProjectileMesh, updateProjectileMesh, addRemove);

// ---- Pickups -----------------------------------------------------------
function buildPickupMesh(p) {
  const m = p.kind === "currency" ? mkMesh(geo.octa, glowMat(0xffd23f, { opacity: 1 })) : mkMesh(geo.box, glowMat(0x4ade80, { opacity: 1 }));
  m.scale.setScalar(p.kind === "currency" ? 7 : 8);
  scene.add(m);
  return m;
}
function updatePickupMesh(m, p) {
  const bob = Math.sin(p.bob) * 5;
  setPos(m, p.x, p.y, 10 + bob);
  m.rotation.y += 0.05;
}
const pickupPool = new ItemPool(buildPickupMesh, updatePickupMesh, addRemove);

// ---- Small glow-sprite particle systems (muzzle flash, sparks, flames,
// death gibs, ambient) — all share the same billboard-ish primitive: a
// small additive-blended sphere that fades with age. Each pooled mesh
// gets its own cloned material since opacity fades per-instance. --------
function buildGlowParticle(color) {
  return mkMesh(geo.sphereLo, glowMat(color, { opacity: 1 }));
}
function makeParticlePoolWithColor(colorFn, sizeFn) {
  return new ItemPool(
    (item) => {
      const m = buildGlowParticle(colorFn(item));
      m.material = m.material.clone();
      scene.add(m);
      return m;
    },
    (m, item) => {
      const t = item.life ? Math.min(1, item.age / item.life) : 0;
      const x = item.x + (item.vx ?? 0) * item.age;
      const y = item.y + (item.vy ?? 0) * item.age;
      setPos(m, x, y, 16);
      m.material.opacity = Math.max(0, 1 - t);
      m.scale.setScalar(Math.max(0.5, sizeFn(item) * (1 - t * 0.3)));
    },
    addRemove
  );
}
const sparkPool = makeParticlePoolWithColor((s) => s.color ?? "#ffd666", () => 3);
const muzzlePool = makeParticlePoolWithColor((m) => m.color ?? "#ffe066", () => 10);
const flamePool = new ItemPool(
  (f) => {
    const m = buildGlowParticle(f.smoke ? 0x2a2620 : 0xff9a3c);
    m.material = m.material.clone();
    scene.add(m);
    return m;
  },
  (m, f) => {
    const t = Math.min(1, f.age / f.life);
    const x = f.x + f.vx * f.age;
    const y = f.y + f.vy * f.age;
    setPos(m, x, y, 14 + (f.smoke ? t * 30 : 0));
    m.material.opacity = f.smoke ? 0.28 * (1 - t) : 1 - t * 0.8;
    m.scale.setScalar(Math.max(0.5, f.size * (f.smoke ? 0.6 + t * 0.8 : 1 - t * 0.5)));
  },
  addRemove
);

const deathPool = new ItemPool(
  (d) => {
    if (d.ring) {
      const m = mkMesh(geo.ring, glowMat(d.color, { opacity: 0.6, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      scene.add(m);
      return m;
    }
    const m = mkMesh(geo.box, glowMat(d.color, { opacity: 1 }));
    m.material = m.material.clone();
    m.scale.setScalar(d.size);
    scene.add(m);
    return m;
  },
  (m, d) => {
    const t = Math.min(1, d.age / d.life);
    if (d.ring) {
      setPos(m, d.x, d.y, 4);
      m.scale.setScalar(Math.max(0.1, d.maxR * t));
      m.material.opacity = 0.6 * (1 - t);
      return;
    }
    const x = d.x + d.vx * d.age;
    const y = d.y + d.vy * d.age;
    setPos(m, x, y, 12 + d.age * 30);
    m.rotation.set(d.rot, d.rot * 0.7, d.vr * d.age);
    m.material.opacity = 1 - t;
  },
  addRemove
);

function buildBeam(color) {
  const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geom, lineMat(color, { opacity: 1, linewidth: 2 }));
  line.material = line.material.clone();
  scene.add(line);
  return line;
}
function updateBeam(line, b, height) {
  const t = Math.min(1, b.age / b.life);
  const positions = line.geometry.attributes.position;
  positions.setXYZ(0, b.x1, height, b.y1);
  positions.setXYZ(1, b.x2, height, b.y2);
  positions.needsUpdate = true;
  line.material.opacity = 1 - t;
}
const railPool = new ItemPool(
  () => buildBeam(0x78beff),
  (l, b) => updateBeam(l, b, 20),
  addRemove
);
const laserPool = new ItemPool(
  () => buildBeam(0x86efac),
  (l, b) => updateBeam(l, b, 18),
  addRemove
);

// ---- Ambient particles (per-map atmosphere) -------------------------------
function buildAmbientMesh(p) {
  let m;
  if (p.kind === "leaf") {
    m = mkMesh(geo.disc, stdMat(p.color, { side: THREE.DoubleSide, emissive: p.color, emissiveIntensity: 0.15 }));
  } else if (p.kind === "fog") {
    m = mkMesh(geo.sphereLo, glowMat(p.color, { opacity: 0.06 }));
  } else {
    m = mkMesh(geo.sphereLo, glowMat(p.color, { opacity: p.a ?? 0.3 }));
  }
  m.material = m.material.clone();
  scene.add(m);
  return m;
}
function updateAmbientMesh(m, p) {
  const h = p.kind === "fog" ? 40 + (p.hOff ?? 0) : p.kind === "leaf" ? 30 + (p.hOff ?? 0) : 60 + (p.hOff ?? 0);
  setPos(m, p.x, p.y, h);
  m.scale.setScalar(p.r ?? 2);
  if (p.kind === "leaf") m.rotation.y = p.rot ?? 0;
}
const ambientPool = new ItemPool(buildAmbientMesh, updateAmbientMesh, addRemove);

// ---- Hazards (Foundry steam vents) ----------------------------------------
function buildHazardMesh() {
  const group = new THREE.Group();
  // Multiple vents can be active at once, each with its own charge cycle,
  // so their materials must be per-instance (cloned), not shared.
  const ring = mkMesh(geo.ring, glowMat(0xff7828, { opacity: 0.5, side: THREE.DoubleSide }).clone());
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const disc = mkMesh(geo.disc, glowMat(0xff9660, { opacity: 0 }).clone());
  group.add(disc);
  group.userData.ring = ring;
  group.userData.disc = disc;
  scene.add(group);
  return group;
}
function updateHazardMesh(group, hz) {
  const chargeT = Math.min(1, Math.max(0, 1 - hz.timer / hz.cycle));
  setPos(group, hz.x, hz.y, 2);
  group.userData.ring.scale.setScalar(hz.radius * (0.5 + chargeT * 0.5));
  group.userData.ring.material.opacity = 0.25 + chargeT * 0.4;
  group.userData.disc.scale.setScalar(hz.radius);
  group.userData.disc.material.opacity = chargeT > 0.8 ? (chargeT - 0.8) * 5 * 0.35 : 0;
}
const hazardPool = new ItemPool(buildHazardMesh, updateHazardMesh, addRemove);

// ---- Ability visuals -------------------------------------------------------
// One small pool per ability id (some abilities need more than one, e.g. a
// projectile-list pool plus a bolt-line pool).
const abilityPools = {
  orbitingBlades: new ItemPool(
    () => {
      const m = mkMesh(geo.cone, glowMat(0xdfe8f0, { opacity: 0.95 }));
      m.rotation.z = -Math.PI / 2;
      m.scale.set(0.6, 1.3, 0.6);
      scene.add(m);
      return m;
    },
    (m, pos) => {
      setPos(m, pos.x, pos.y, 22);
      m.rotation.y += 0.25;
    },
    addRemove
  ),
  homingShards: makeParticlePoolWithColor(() => "#8fd3ff", () => 5),
  landmine: new ItemPool(
    () => {
      const m = mkMesh(geo.cylinder, glowMat(0xf97316, { opacity: 0.9 }).clone());
      m.scale.set(9, 3, 9);
      scene.add(m);
      return m;
    },
    (m, mine, now) => {
      setPos(m, mine.x, mine.y, 3);
      const ready = mine.armed <= 0;
      const blink = ready ? 0.5 + Math.sin((now ?? 0) / 100) * 0.5 : 1;
      m.material.opacity = ready ? 0.6 + blink * 0.35 : 0.4;
    },
    addRemove
  ),
  swarmBots: new ItemPool(
    () => {
      const m = mkMesh(geo.cone, glowMat(0xa3e635, { opacity: 0.95 }));
      m.rotation.z = -Math.PI / 2;
      m.scale.set(0.6, 1.1, 0.6);
      scene.add(m);
      return m;
    },
    (m, bot) => {
      setPos(m, bot.x, bot.y, 20);
      setFacing(m, Math.atan2(bot.vy, bot.vx));
    },
    addRemove
  ),
  boomerangBlade: new ItemPool(
    () => {
      const m = mkMesh(geo.box, glowMat(0xcbd5e1, { opacity: 0.9 }));
      m.scale.set(16, 2, 6);
      scene.add(m);
      return m;
    },
    (m, b, now) => {
      setPos(m, b.x, b.y, 22);
      m.rotation.y = (now ?? 0) / 60;
    },
    addRemove
  ),
  throwingKnives: new ItemPool(
    () => {
      const m = mkMesh(geo.cone, glowMat(0xfca5a5, { opacity: 0.95 }));
      m.rotation.z = -Math.PI / 2;
      m.scale.set(0.4, 1.4, 0.4);
      scene.add(m);
      return m;
    },
    (m, k) => {
      setPos(m, k.x, k.y, 18);
      setFacing(m, Math.atan2(k.vy, k.vx));
    },
    addRemove
  ),
  fireVolcano: new ItemPool(
    () => {
      const m = mkMesh(geo.disc, glowMat(0xdc2626, { opacity: 0.5, side: THREE.DoubleSide }).clone());
      scene.add(m);
      return m;
    },
    (m, v, now) => {
      const flicker = 0.6 + Math.sin((now ?? 0) / 65 + v.x) * 0.4;
      setPos(m, v.x, v.y, 3);
      m.scale.setScalar(55);
      m.material.opacity = 0.45 * flicker;
    },
    addRemove
  ),
  ricochetRound: makeParticlePoolWithColor(() => "#fb7185", () => 5.5),
  guardianDrone: new ItemPool(
    () => {
      const m = mkMesh(geo.octa, glowMat(0x38bdf8, { opacity: 0.95 }));
      m.scale.setScalar(9);
      scene.add(m);
      return m;
    },
    (m, pos, now) => {
      setPos(m, pos.x, pos.y, 34);
      m.rotation.y += 0.08;
    },
    addRemove
  ),
};

const staticFieldPool = new ItemPool(
  () => {
    const m = mkMesh(geo.ring, glowMat(0xc084fc, { opacity: 0.3, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    scene.add(m);
    return m;
  },
  (m, ab, now) => {
    const t = ((now ?? 0) % 1000) / 1000;
    setPos(m, ab._px, ab._py, 1.5);
    m.scale.setScalar(ab.extra.radius * (0.7 + t * 0.3));
    m.material.opacity = 0.35 * (1 - t);
  },
  addRemove
);
const frostTrailPool = new ItemPool(
  () => {
    const m = mkMesh(geo.disc, glowMat(0x93c5fd, { opacity: 0.3, side: THREE.DoubleSide }).clone());
    scene.add(m);
    return m;
  },
  (m, seg, extra) => {
    const t = Math.min(1, seg.age / extra.frostLife);
    setPos(m, seg.x, seg.y, 1.5);
    m.scale.setScalar(22 * (1 - t * 0.3));
    m.material.opacity = 0.32 * (1 - t);
  },
  addRemove
);
const boltPools = {}; // one line-array pool per ability id that emits transient jagged bolts
function syncBolts(id, bolts, color, segments = 4, jitter = 6) {
  let pool = boltPools[id];
  if (!pool) {
    pool = new ItemPool(
      () => {
        const points = Array.from({ length: segments + 1 }, () => new THREE.Vector3());
        const g = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(g, lineMat(color, { opacity: 1 }));
        line.material = line.material.clone();
        scene.add(line);
        return line;
      },
      (line, b) => {
        const pos = line.geometry.attributes.position;
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const jx = i === 0 || i === segments ? 0 : (Math.random() - 0.5) * jitter;
          const jy = i === 0 || i === segments ? 0 : (Math.random() - 0.5) * jitter;
          pos.setXYZ(i, b.x1 + (b.x2 - b.x1) * t + jx, 20, b.y1 + (b.y2 - b.y1) * t + jy);
        }
        pos.needsUpdate = true;
        line.material.opacity = Math.max(0, b.ttl / 0.15);
      },
      addRemove
    );
    boltPools[id] = pool;
  }
  pool.sync(bolts);
}
const pulsePools = {}; // expanding-ring pulses (shockwave, holy nova)
function syncPulse(id, ab, now, color, maxDuration) {
  let mesh = pulsePools[id];
  if (!mesh) {
    mesh = mkMesh(geo.ring, glowMat(color, { opacity: 0, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    pulsePools[id] = mesh;
  }
  const age = (now - (ab.extra.pulseAt ?? -Infinity)) / 1000;
  if (age >= 0 && age < maxDuration) {
    const t = age / maxDuration;
    mesh.visible = true;
    setPos(mesh, ab._px, ab._py, 2);
    mesh.scale.setScalar(Math.max(0.1, ab.extra.radius * t));
    mesh.material.opacity = 0.55 * (1 - t);
  } else {
    mesh.visible = false;
  }
}
let magnetPulseMesh = null;
function syncMagnetPulse(ab, player, now) {
  if (!magnetPulseMesh) {
    magnetPulseMesh = mkMesh(geo.ring, glowMat(0xfbbf24, { opacity: 0, side: THREE.DoubleSide }));
    magnetPulseMesh.rotation.x = -Math.PI / 2;
    scene.add(magnetPulseMesh);
  }
  if (ab.extra.activeLeft > 0) {
    const t = (now % 500) / 500;
    magnetPulseMesh.visible = true;
    setPos(magnetPulseMesh, player.x, player.y, 2);
    magnetPulseMesh.scale.setScalar(30 + t * 260);
    magnetPulseMesh.material.opacity = 0.5 * (1 - t);
  } else {
    magnetPulseMesh.visible = false;
  }
}

function syncAbilities(player, now) {
  playerRefX = player.x;
  playerRefY = player.y;
  const active = new Set(player.abilities.map((a) => a.id));

  for (const ab of player.abilities) {
    ab._px = player.x;
    ab._py = player.y;
    if (ab.id === "orbitingBlades") abilityPools.orbitingBlades.sync(ab.extra.positions ?? []);
    else if (ab.id === "homingShards") abilityPools.homingShards.sync(ab.extra.list ?? []);
    else if (ab.id === "staticField") staticFieldPool.sync([ab], now);
    else if (ab.id === "landmine") abilityPools.landmine.sync(ab.extra.list ?? [], now);
    else if (ab.id === "chainLightning") syncBolts("chainLightning", ab.extra.bolts ?? [], 0xfacc15);
    else if (ab.id === "shockwaveStomp") syncPulse("shockwaveStomp", ab, now, 0x34d399, 0.4);
    else if (ab.id === "guardianDrone") {
      abilityPools.guardianDrone.sync(ab.extra.pos ? [ab.extra.pos] : []);
      syncBolts("guardianDrone", ab.extra.bolts ?? [], 0x38bdf8, 3, 2);
    } else if (ab.id === "frostTrail") frostTrailPool.sync(ab.extra.list ?? [], { frostLife: FROST_LIFE(ab.level) });
    else if (ab.id === "magnetPulse") syncMagnetPulse(ab, player, now);
    else if (ab.id === "swarmBots") abilityPools.swarmBots.sync(ab.extra.list ?? []);
    else if (ab.id === "boomerangBlade") abilityPools.boomerangBlade.sync(ab.extra.list ?? [], now);
    else if (ab.id === "throwingKnives") abilityPools.throwingKnives.sync(ab.extra.list ?? []);
    else if (ab.id === "fireVolcano") abilityPools.fireVolcano.sync(ab.extra.list ?? [], now);
    else if (ab.id === "holyNova") syncPulse("holyNova", ab, now, 0xfde68a, 0.45);
    else if (ab.id === "ricochetRound") abilityPools.ricochetRound.sync(ab.extra.list ?? []);
  }

  // Clear pools for abilities the player no longer has (slot replaced).
  for (const id of Object.keys(abilityPools)) {
    if (!active.has(id)) abilityPools[id].sync([]);
  }
  if (!active.has("staticField")) staticFieldPool.sync([]);
  if (!active.has("frostTrail")) frostTrailPool.sync([]);
  if (!active.has("magnetPulse") && magnetPulseMesh) magnetPulseMesh.visible = false;
  for (const key of ["chainLightning", "guardianDrone"]) {
    if (!active.has(key) && boltPools[key]) boltPools[key].sync([]);
  }
  for (const key of ["shockwaveStomp", "holyNova"]) {
    if (!active.has(key) && pulsePools[key]) pulsePools[key].visible = false;
  }
}

// abilityLevelStats' frost `life` needs the ability's level; main.js passes
// the level via ability objects already, so recompute the same formula
// locally to avoid a circular import back into abilities.js.
function FROST_LIFE(lvl) {
  return 1.6 + lvl * 0.15;
}

// ---- World-space DOM overlay: damage popups + boss/tough-enemy HP bars --
let worldUIEl = null;
export function initWorldUI(el) {
  worldUIEl = el;
}
const popupPool = new ItemPool(
  () => {
    const el = document.createElement("div");
    el.className = "world-popup";
    worldUIEl.appendChild(el);
    return el;
  },
  (el, p) => {
    const t = Math.min(1, p.age / p.life);
    const s = projectToScreen(p.x, p.y - 20, 30);
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y - p.age * 20}px`;
    el.style.opacity = String(Math.max(0, 1 - t));
    el.style.color = p.color;
    el.textContent = p.text;
  },
  domRemove
);
const hpBarPool = new ItemPool(
  (z) => {
    const wrap = document.createElement("div");
    wrap.className = "world-hpbar" + (z.isBoss ? " boss" : "");
    const fill = document.createElement("div");
    fill.className = "fill";
    wrap.appendChild(fill);
    worldUIEl.appendChild(wrap);
    return wrap;
  },
  (wrap, z) => {
    const s = projectToScreen(z.x, z.y, z.radius * 2 + 26);
    wrap.style.left = `${s.x}px`;
    wrap.style.top = `${s.y}px`;
    const pct = Math.max(0, Math.min(1, z.hp / z.maxHp));
    wrap.querySelector(".fill").style.width = `${pct * 100}%`;
  },
  domRemove
);
const nameLabelPool = new ItemPool(
  () => {
    const el = document.createElement("div");
    el.className = "world-name";
    worldUIEl.appendChild(el);
    return el;
  },
  (el, z) => {
    const s = projectToScreen(z.x, z.y, z.radius * 2 + 34);
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    el.textContent = z.name;
  },
  domRemove
);

// ---- Master per-frame sync -------------------------------------------------
export function sync(state) {
  const { player, enemies, friendlyProjectiles, enemyProjectiles, pickups, popups, hazards, ambientParticles, muzzleFlashes, railBeams, laserBeams, sparkParticles, flameParticles, deathParticles, now } = state;

  nowRef = now;
  playerRefX = player.x;
  playerRefY = player.y;

  updatePlayer(player, now);
  enemyPool.sync(enemies);
  friendlyProjPool.sync(friendlyProjectiles);
  enemyProjPool.sync(enemyProjectiles);
  pickupPool.sync(pickups);
  hazardPool.sync(hazards);
  ambientPool.sync(ambientParticles);
  muzzlePool.sync(muzzleFlashes);
  railPool.sync(railBeams);
  laserPool.sync(laserBeams);
  sparkPool.sync(sparkParticles);
  flamePool.sync(flameParticles);
  deathPool.sync(deathParticles);
  syncAbilities(player, now);

  const toughEnemies = enemies.filter((z) => z.isBoss || z.maxHp > 40);
  hpBarPool.sync(toughEnemies);
  nameLabelPool.sync(enemies.filter((z) => z.isBoss));
  popupPool.sync(popups);

  const shakeX = shakeMag > 0.05 ? (Math.random() - 0.5) * shakeMag * 2 : 0;
  const shakeZ = shakeMag > 0.05 ? (Math.random() - 0.5) * shakeMag * 2 : 0;
  camera.position.x = boundsW / 2 + shakeX;
  camera.position.z = boundsH / 2 + CAM_DIST * Math.cos(CAM_ELEV) + shakeZ;
}

export function render() {
  renderer.render(scene, camera);
}

// Debug-only: exposed so QA tooling can introspect renderer/scene state.
window.__r3dDebug = () => ({
  boundsW,
  boundsH,
  cameraPos: camera.position.toArray(),
  cameraLeft: camera.left,
  cameraRight: camera.right,
  cameraTop: camera.top,
  cameraBottom: camera.bottom,
  sceneChildren: scene.children.length,
  groundExists: !!groundMesh,
  groundPos: groundMesh ? groundMesh.position.toArray() : null,
  groundScale: groundMesh ? groundMesh.scale.toArray() : null,
  rendererSize: renderer.getSize(new THREE.Vector2()).toArray(),
  glContextLost: renderer.getContext().isContextLost(),
});
