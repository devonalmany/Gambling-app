import { state } from './state.js';
import { el, qs, qsa, fmtMoney, toast } from './ui.js';
import { PERSONAL_SHOP_ITEMS, TEAMMATES, HOME_TIERS, STATUS_TIERS } from './data.js';

// ============================================================ Personal Shop
let personalTab = 'outfit';
const TABS = [
  { id: 'outfit', label: 'Outfits' },
  { id: 'jewelry', label: 'Watches & Jewelry' },
  { id: 'hair', label: 'Hair & Face' },
  { id: 'emote', label: 'Emotes' },
  { id: 'crew', label: 'Crew' },
];

export const personalShopScreen = {
  render(container) {
    container.appendChild(el(`<h2>👔 Style Shop</h2>`));
    container.appendChild(el(`<p class="subtle">Spend cash or Style Points (earned from wins) on cosmetics. Some items grant a small flavor bonus at the tables.</p>`));

    const tabsWrap = el(`<div class="shop-tabs"></div>`);
    TABS.forEach(t => {
      const btn = el(`<button class="btn small ${personalTab === t.id ? '' : 'secondary'}">${t.label}</button>`);
      btn.addEventListener('click', () => { personalTab = t.id; rerender(container); });
      tabsWrap.appendChild(btn);
    });
    container.appendChild(tabsWrap);

    const panel = el(`<div class="panel"></div>`);
    if (personalTab === 'crew') {
      panel.appendChild(renderCrewGrid());
    } else {
      panel.appendChild(renderItemGrid(personalTab));
    }
    container.appendChild(panel);
  },
};

function rerender(container) {
  container.innerHTML = '';
  personalShopScreen.render(container);
}

function renderItemGrid(slot) {
  const grid = el(`<div class="shop-grid"></div>`);
  PERSONAL_SHOP_ITEMS.filter(i => i.slot === slot).forEach(item => {
    const owned = state.ownsCosmetic(item.id);
    const equipped = state.run.equipped[item.slot] === item.id;
    const locked = !state.meetsTier(item.reqTier);
    const card = el(`
      <div class="shop-item ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}">
        ${equipped ? '<span class="tag">EQUIPPED</span>' : ''}
        <div class="icon">${item.icon}</div>
        <div class="name">${item.name}</div>
        <div class="price">${item.price === 0 ? 'Free' : `${item.currency === 'style' ? '⭐' : '$'}${item.price.toLocaleString()}`}</div>
      </div>
    `);
    if (locked) {
      card.appendChild(el(`<div class="subtle">🔒 ${STATUS_TIERS.find(t => t.id === item.reqTier).name}+</div>`));
    } else if (owned) {
      if (!equipped) {
        const btn = el(`<button class="btn small secondary">Equip</button>`);
        btn.addEventListener('click', () => { state.equipCosmetic(item); rerenderCurrent(); });
        card.appendChild(btn);
      }
    } else {
      const btn = el(`<button class="btn small">Buy</button>`);
      btn.addEventListener('click', () => {
        const res = state.buyCosmetic(item);
        if (res.ok) toast(`Bought ${item.name}!`, 'win');
        else toast(res.reason, 'lose');
        rerenderCurrent();
      });
      card.appendChild(btn);
    }
    grid.appendChild(card);
  });
  return grid;
}

function renderCrewGrid() {
  const grid = el(`<div class="shop-grid"></div>`);
  TEAMMATES.forEach(tm => {
    const owned = state.run.ownedTeammates.includes(tm.id);
    const locked = !state.meetsTier(tm.reqTier);
    const card = el(`
      <div class="shop-item ${owned ? 'owned' : ''} ${locked ? 'locked' : ''}">
        ${owned ? '<span class="tag">RECRUITED</span>' : ''}
        <div class="icon">${tm.icon}</div>
        <div class="name">${tm.name}</div>
        <div class="subtle">${tm.role}</div>
        <div class="price">${tm.currency === 'style' ? '⭐' : '$'}${tm.price.toLocaleString()}</div>
        <div class="subtle" style="margin-bottom:8px">${tm.desc}</div>
      </div>
    `);
    if (locked) {
      card.appendChild(el(`<div class="subtle">🔒 ${STATUS_TIERS.find(t => t.id === tm.reqTier).name}+</div>`));
    } else if (!owned) {
      const btn = el(`<button class="btn small">Recruit</button>`);
      btn.addEventListener('click', () => {
        const res = state.buyTeammate(tm);
        if (res.ok) toast(`${tm.name} joined your crew!`, 'win');
        else toast(res.reason, 'lose');
        rerenderCurrent();
      });
      card.appendChild(btn);
    }
    grid.appendChild(card);
  });
  return grid;
}

function rerenderCurrent() {
  const container = qs('.screen[data-screen="personal-shop"]');
  if (container) rerender(container);
}

// ================================================================ Home Shop
export const homeShopScreen = {
  render(container) {
    container.appendChild(el(`<h2>🏠 Home Shop</h2>`));
    container.appendChild(el(`<p class="subtle">Better homes grant a daily login bonus and, at higher tiers, boosted payouts when you host private games.</p>`));

    const list = el(`<div class="home-list"></div>`);
    HOME_TIERS.forEach(home => {
      const current = state.run.homeId === home.id;
      const locked = !state.meetsTier(home.reqTier);
      const row = el(`
        <div class="home-item ${current ? 'current' : ''}">
          <div class="info">
            <div class="icon">${home.icon}</div>
            <div>
              <div><strong>${home.name}</strong> ${current ? '<span class="tag" style="position:static">CURRENT</span>' : ''}</div>
              <div class="perk">${home.perk}</div>
              <div class="subtle">${home.price === 0 ? 'Free' : fmtMoney(home.price)}</div>
            </div>
          </div>
        </div>
      `);
      if (!current) {
        if (locked) {
          row.appendChild(el(`<div class="subtle">🔒 ${STATUS_TIERS.find(t => t.id === home.reqTier).name}+</div>`));
        } else {
          const btn = el(`<button class="btn small">Move In</button>`);
          btn.addEventListener('click', () => {
            const res = state.buyHome(home);
            if (res.ok) toast(`Welcome to your new ${home.name}!`, 'win');
            else toast(res.reason, 'lose');
            rerenderHome(container);
          });
          row.appendChild(btn);
        }
      }
      list.appendChild(row);
    });
    container.appendChild(list);
  },
};

function rerenderHome(container) {
  container.innerHTML = '';
  homeShopScreen.render(container);
}
