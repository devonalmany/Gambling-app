// DOM overlay management: HUD readouts, level-up cards, the between-wave
// shop, wave banners, and start/game-over screens. The canvas (in main.js)
// only ever draws the game world; every menu/readout below is real DOM so
// buttons and text stay crisp and trivially clickable.
import { WEAPON_ORDER, WEAPON_DEFS, UPGRADE_TRACKS, upgradeCost } from "./weapons.js";
import { SHOP_PERKS, perkCost } from "./shop.js";
import { ABILITY_DEFS, abilityLevelStats } from "./abilities.js";
import { CHARACTER_DEFS } from "./characters.js";
import { MAP_DEFS } from "./maps.js";
import { fmtTime, clamp } from "./utils.js";

const el = (id) => document.getElementById(id);

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  if (id) el(id).classList.remove("hidden");
}

export function setHudVisible(visible) {
  el("hud").classList.toggle("hidden", !visible);
}

export function renderLoadoutScreen(selection, handlers) {
  const charRow = el("characterRow");
  charRow.innerHTML = "";
  for (const c of CHARACTER_DEFS) {
    const card = document.createElement("button");
    card.className = "loadout-card" + (c.id === selection.characterId ? " selected" : "");
    card.style.setProperty("--accent", c.accent);
    card.innerHTML = `
      <div class="loadout-swatch" style="background:linear-gradient(135deg, ${c.colorPrimary}, ${c.colorSecondary})">${c.icon}</div>
      <div class="loadout-name">${c.name}</div>
      <div class="loadout-tagline">${c.tagline}</div>
      <ul class="loadout-passives">${c.passives.map((p) => `<li>${p}</li>`).join("")}</ul>
    `;
    card.addEventListener("click", () => handlers.onSelectCharacter(c.id));
    charRow.appendChild(card);
  }

  const mapRow = el("mapRow");
  mapRow.innerHTML = "";
  for (const m of MAP_DEFS) {
    const [c1, c2, c3] = m.palette.base;
    const card = document.createElement("button");
    card.className = "loadout-card" + (m.id === selection.mapId ? " selected" : "");
    card.style.setProperty("--accent", "#8fe13f");
    card.innerHTML = `
      <div class="loadout-swatch map-swatch" style="background:linear-gradient(135deg, ${c1}, ${c2} 55%, ${c3})">${m.icon}</div>
      <div class="loadout-name">${m.name}</div>
      <div class="loadout-tagline">${m.tagline}</div>
      <div class="loadout-modifier">${m.modifierLabel}</div>
    `;
    card.addEventListener("click", () => handlers.onSelectMap(m.id));
    mapRow.appendChild(card);
  }
}

export function updateHud(player, wave, elapsed) {
  const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
  el("hpFill").style.width = `${hpPct}%`;
  el("hpFill").classList.toggle("low", hpPct < 30);
  el("hpLabel").textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;

  const xpPct = Math.max(0, Math.min(100, (player.xp / player.xpToNext) * 100));
  el("xpFill").style.width = `${xpPct}%`;
  el("levelLabel").textContent = `Lv ${player.level}`;

  el("waveLabel").textContent = `Wave ${wave}`;
  el("currencyLabel").textContent = player.currency;
  el("killsLabel").textContent = player.kills;
  el("timeLabel").textContent = fmtTime(elapsed);

  const def = WEAPON_DEFS[player.currentWeapon];
  el("weaponName").textContent = def.name;
  el("ammoLabel").textContent = "∞";

  const dashPct = player.dashCooldownLeft <= 0 ? 100 : 100 * (1 - player.dashCooldownLeft / 2.4);
  el("dashFill").style.width = `${Math.max(0, Math.min(100, dashPct))}%`;

  el("autoAimTag").classList.toggle("hidden", !player.autoAim);
  el("autoFireTag").classList.toggle("hidden", !player.autoFire);

  renderAbilityIcons(player);
}

function renderAbilityIcons(player) {
  const container = el("abilityIcons");
  const wanted = player.abilities.length;
  if (container.childElementCount !== wanted) {
    container.innerHTML = "";
    for (const ab of player.abilities) {
      const wrap = document.createElement("div");
      wrap.className = "ability-icon";
      wrap.innerHTML = `<span class="glyph"></span><span class="lvl"></span>`;
      container.appendChild(wrap);
    }
  }
  player.abilities.forEach((ab, i) => {
    const def = ABILITY_DEFS[ab.id];
    const wrap = container.children[i];
    wrap.querySelector(".glyph").textContent = def.icon;
    wrap.querySelector(".glyph").style.color = def.color;
    wrap.querySelector(".lvl").textContent = ab.level;
    wrap.title = `${def.name} Lv.${ab.level} — ${def.desc(ab.level)}`;

    const stats = abilityLevelStats(ab.id, ab.level);
    const cd = stats.interval ?? stats.tick;
    const pct = cd ? clamp(1 - ab.timer / cd, 0, 1) : 1;
    wrap.style.setProperty("--pct", pct.toFixed(3));
    wrap.style.setProperty("--ring-color", def.color);
  });
}

export function renderWaveBanner(wave, cleared, bonus) {
  const banner = el("waveBanner");
  banner.classList.remove("hidden");
  if (cleared) {
    banner.querySelector(".big").textContent = `Wave ${wave} Cleared!`;
    banner.querySelector(".small").textContent = bonus ? `+${bonus} bonus scrap` : "";
  } else {
    banner.querySelector(".big").textContent = `Wave ${wave}`;
    banner.querySelector(".small").textContent = wave % 5 === 0 ? "Boss incoming" : "";
  }
}

export function hideWaveBanner() {
  el("waveBanner").classList.add("hidden");
}

export function renderLevelUpCards(cards, onPick) {
  const container = el("cardRow");
  container.innerHTML = "";
  cards.forEach((card, idx) => {
    const btn = document.createElement("button");
    btn.className = "levelup-card";
    btn.style.setProperty("--accent", card.color);
    btn.innerHTML = `
      <div class="card-key">${idx + 1}</div>
      <div class="card-icon" style="color:${card.color}">${card.icon}</div>
      <div class="card-title">${card.title}</div>
      <div class="card-desc">${card.desc}</div>
    `;
    btn.addEventListener("click", () => onPick(card));
    container.appendChild(btn);
  });
  showScreen("levelUpScreen");
}

export function renderShop(player, wave, handlers) {
  const perkList = el("shopPerks");
  perkList.innerHTML = "";
  for (const perk of SHOP_PERKS) {
    const level = player.shopLevels[perk.id] ?? 0;
    const owned = perk.maxLevel && level >= perk.maxLevel;
    const cost = perkCost(perk, level);
    perkList.appendChild(
      shopRow({
        title: perk.maxLevel ? perk.name : `${perk.name} (Lv.${level})`,
        desc: perk.desc,
        cost,
        owned,
        affordable: player.currency >= cost,
        onBuy: () => handlers.onBuyPerk(perk.id),
      })
    );
  }

  const weaponList = el("shopWeapons");
  weaponList.innerHTML = "";
  for (const id of WEAPON_ORDER) {
    const def = WEAPON_DEFS[id];
    const w = player.weapons[id];
    const group = document.createElement("div");
    group.className = "shop-weapon-group";
    const header = document.createElement("div");
    header.className = "shop-weapon-header";
    if (!w.unlocked) {
      header.innerHTML = `<span>${def.name}</span>`;
      const btn = buyButton(def.unlockCost, player.currency >= def.unlockCost, () => handlers.onBuyUnlock(id));
      btn.textContent = `Unlock — ⚙${def.unlockCost}`;
      header.appendChild(btn);
      group.appendChild(header);
    } else {
      header.innerHTML = `<span>${def.name}${id === player.currentWeapon ? " (equipped)" : ""}</span>`;
      group.appendChild(header);
      const tracks = document.createElement("div");
      tracks.className = "shop-tracks";
      for (const track of visibleTracks(def)) {
        const level = w.upgrades[track.id];
        const maxed = level >= track.max;
        const cost = maxed ? 0 : upgradeCost(track.id, level);
        const row = document.createElement("button");
        row.className = "shop-track";
        row.disabled = maxed || player.currency < cost;
        row.innerHTML = `<span>${track.label}</span><span class="track-level">${level}/${track.max}</span><span class="track-cost">${maxed ? "MAX" : `⚙${cost}`}</span>`;
        if (!maxed) row.addEventListener("click", () => handlers.onBuyUpgrade(id, track.id));
        tracks.appendChild(row);
      }
      group.appendChild(tracks);
    }
    weaponList.appendChild(group);
  }

  el("shopCurrency").textContent = `⚙ ${player.currency}`;
  el("shopNextWaveBtn").textContent = `Start Wave ${wave}`;
  showScreen("shopScreen");
}

function visibleTracks(def) {
  // "range" (Extended Range) only exists for the Flamethrower's cone.
  const tracks = def.mode === "cone" ? UPGRADE_TRACKS : UPGRADE_TRACKS.filter((t) => t.id !== "range");
  if (def.mode === "cone") return tracks.filter((t) => t.id !== "pierce" && t.id !== "explosive");
  if (def.mode === "lob") return tracks.filter((t) => t.id !== "pierce");
  if (def.mode === "beam") return tracks.filter((t) => t.id !== "pierce" && t.id !== "explosive");
  return tracks;
}

function shopRow({ title, desc, cost, affordable, owned, onBuy }) {
  const row = document.createElement("div");
  row.className = "shop-perk-row";
  const btn = owned ? ownedButton() : buyButton(cost, affordable, onBuy);
  row.innerHTML = `<div><div class="shop-perk-title">${title}</div><div class="shop-perk-desc">${desc}</div></div>`;
  row.appendChild(btn);
  return row;
}

function buyButton(cost, affordable, onBuy) {
  const btn = document.createElement("button");
  btn.className = "buy-btn";
  btn.textContent = `⚙${cost}`;
  btn.disabled = !affordable;
  btn.addEventListener("click", onBuy);
  return btn;
}

function ownedButton() {
  const btn = document.createElement("button");
  btn.className = "buy-btn owned";
  btn.textContent = "OWNED";
  btn.disabled = true;
  return btn;
}

export function renderGameOver(stats, highScores) {
  el("goWave").textContent = stats.wave;
  el("goKills").textContent = stats.kills;
  el("goTime").textContent = fmtTime(stats.timeAlive);
  el("goCurrency").textContent = stats.currency;

  const list = el("highScoreList");
  list.innerHTML = "";
  if (!highScores.length) {
    list.innerHTML = "<li class='empty'>No runs yet.</li>";
  } else {
    highScores.forEach((s, i) => {
      const li = document.createElement("li");
      li.textContent = `#${i + 1} — Wave ${s.wave} · ${s.kills} kills · ${fmtTime(s.timeAlive)}`;
      list.appendChild(li);
    });
  }
  showScreen("gameOverScreen");
}

export function renderStartHighScores(highScores) {
  const list = el("startHighScoreList");
  list.innerHTML = "";
  if (!highScores.length) {
    list.innerHTML = "<li class='empty'>No runs yet — be the first survivor.</li>";
    return;
  }
  highScores.slice(0, 5).forEach((s, i) => {
    const li = document.createElement("li");
    li.textContent = `#${i + 1} — Wave ${s.wave} · ${s.kills} kills`;
    list.appendChild(li);
  });
}
