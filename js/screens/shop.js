import { state } from '../state.js';
import { registerScreen, el, qs, qsa, toast, refreshCurrentScreen, fmtMoney } from '../ui.js';
import { SHOP_ITEMS } from '../data.js';

function render(container) {
  container.appendChild(el(`
    <div class="screen-inner">
      <div class="panel intro-panel"><h2>🛍️ Shop</h2><p class="subtle">Cash: ${fmtMoney(state.run.cash)} · Bank: ${fmtMoney(state.run.bank.balance)}</p></div>
      <div class="card-grid" id="shop-grid"></div>
    </div>
  `));
  const grid = qs('#shop-grid', container);
  for (const item of SHOP_ITEMS) {
    const owned = state.run.inventory[item.id];
    grid.appendChild(el(`
      <div class="panel loc-card">
        <h3>${item.icon} ${item.name}</h3>
        <p class="subtle">${item.desc}</p>
        <p class="subtle"><em>${item.effect}</em></p>
        ${owned ? '<span class="pill">Owned</span>' : `<button class="btn" data-buy="${item.id}">Buy — ${fmtMoney(item.price)}</button>`}
      </div>
    `));
  }
  qsa('[data-buy]', container).forEach(b => b.addEventListener('click', () => {
    const res = state.buyShopItem(b.dataset.buy);
    if (!res.ok) toast(res.reason, 'bad'); else toast('Purchased!', 'good');
    refreshCurrentScreen();
  }));
}

registerScreen('shop', { render });
