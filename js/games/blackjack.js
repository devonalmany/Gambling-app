import { state } from '../state.js';
import { el, qs, qsa, fmtMoney, toast, tierGateBanner } from '../ui.js';
import { BLACKJACK_TABLES } from '../data.js';
import { createShoe, cardHtml, blackjackTotal, isBlackjack } from '../cards.js';
import { checkBankruptcy } from '../main.js';

let ctx = null; // active table session
let container = null;

function newSession(table) {
  return {
    table,
    shoe: createShoe(table.id === 'vip' ? 4 : 2),
    bet: table.min,
    phase: 'betting', // betting -> playing -> dealer -> result
    hands: [], // {cards, bet, done, result, isSplit}
    activeHand: 0,
    dealer: [],
  };
}

function draw(session) {
  if (session.shoe.length < 15) session.shoe = createShoe(session.table.id === 'vip' ? 4 : 2);
  return session.shoe.pop();
}

export function render(rootContainer) {
  container = rootContainer;
  renderTable();
}

function renderTable() {
  container.innerHTML = '';
  container.appendChild(el(`<h2>🂡 Blackjack</h2>`));

  if (!ctx) {
    container.appendChild(renderTableSelect());
    return;
  }

  const t = ctx.table;
  const felt = el(`<div class="table-felt"></div>`);

  // Dealer row
  const dealerBlock = el(`<div></div>`);
  dealerBlock.appendChild(el(`<h3>Dealer ${ctx.phase === 'result' || ctx.phase === 'dealer' ? `— ${blackjackTotal(ctx.dealer).total}` : ''}</h3>`));
  const dealerRow = el(`<div class="card-row"></div>`);
  ctx.dealer.forEach((c, i) => {
    const hidden = ctx.phase === 'playing' && i === 1;
    dealerRow.appendChild(el(cardHtml(c, hidden)));
  });
  dealerBlock.appendChild(dealerRow);
  felt.appendChild(dealerBlock);

  // Player hands
  ctx.hands.forEach((h, idx) => {
    const bjTotal = blackjackTotal(h.cards);
    const block = el(`<div style="margin-top:18px"></div>`);
    const label = h.result ? resultLabel(h) :
      `Your Hand ${ctx.hands.length > 1 ? `#${idx + 1}` : ''} — ${bjTotal.total}${bjTotal.soft ? ' (soft)' : ''} ${idx === ctx.activeHand && ctx.phase === 'playing' ? '▶' : ''}`;
    block.appendChild(el(`<h3>${label}</h3>`));
    const row = el(`<div class="card-row"></div>`);
    h.cards.forEach(c => row.appendChild(el(cardHtml(c))));
    block.appendChild(row);
    block.appendChild(el(`<div class="subtle">Bet: ${fmtMoney(h.bet)}</div>`));
    felt.appendChild(block);
  });

  container.appendChild(felt);

  if (ctx.phase === 'betting') {
    container.appendChild(renderBetControls());
  } else if (ctx.phase === 'playing') {
    container.appendChild(renderActionControls());
  } else if (ctx.phase === 'result') {
    const totalDelta = ctx.hands.reduce((s, h) => s + h.netDelta, 0);
    container.appendChild(el(`
      <div>
        <div class="result-banner ${totalDelta > 0 ? 'win' : totalDelta < 0 ? 'lose' : 'push'}">
          ${totalDelta > 0 ? `+${fmtMoney(totalDelta)}` : totalDelta < 0 ? fmtMoney(totalDelta) : 'Push'}
        </div>
        <div style="text-align:center"><button class="btn" id="next-hand">Next Hand</button>
        <button class="btn secondary" id="leave-table">Leave Table</button></div>
      </div>
    `));
    qs('#next-hand', container).addEventListener('click', () => {
      ctx.phase = 'betting';
      ctx.hands = [];
      ctx.dealer = [];
      renderTable();
    });
    qs('#leave-table', container).addEventListener('click', () => { ctx = null; renderTable(); });
  }
}

function resultLabel(h) {
  const map = { win: '✅ Win', lose: '❌ Bust/Lose', push: '➖ Push', blackjack: '🃏 Blackjack!', surrender: '🏳️ Surrendered' };
  return map[h.result] || '';
}

function renderTableSelect() {
  const wrap = el(`<div class="panel"></div>`);
  wrap.appendChild(el(`<h3>Choose a Table</h3>`));
  const grid = el(`<div class="game-grid"></div>`);
  BLACKJACK_TABLES.forEach(t => {
    const locked = !state.meetsTier(t.reqTier);
    const card = el(`
      <div class="game-card ${locked ? 'locked' : ''}" style="${locked ? 'opacity:.45;cursor:not-allowed' : ''}">
        <h3>${t.name}</h3>
        <p class="subtle">Bets ${fmtMoney(t.min)} – ${fmtMoney(t.max)}${t.surrender ? ' · Surrender allowed' : ''}</p>
        ${locked ? `<p class="subtle">🔒 Requires higher status</p>` : ''}
      </div>
    `);
    if (!locked) card.addEventListener('click', () => { ctx = newSession(t); renderTable(); });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderBetControls() {
  const t = ctx.table;
  const max = Math.min(t.max, Math.floor(state.netWorth));
  const wrap = el(`
    <div class="panel bet-controls">
      <label>Bet: </label>
      <input type="number" id="bet-input" min="${t.min}" max="${Math.max(t.min, max)}" step="1" value="${Math.min(ctx.bet, Math.max(t.min, max))}" />
      <button class="btn" id="deal-btn">Deal</button>
      <button class="btn secondary" id="leave-btn">Leave Table</button>
      <div class="subtle" style="width:100%">Table limits ${fmtMoney(t.min)} – ${fmtMoney(t.max)}. Your cash: ${fmtMoney(state.netWorth)}</div>
    </div>
  `);
  qs('#leave-btn', wrap).addEventListener('click', () => { ctx = null; renderTable(); });
  qs('#deal-btn', wrap).addEventListener('click', () => {
    const val = Math.floor(parseFloat(qs('#bet-input', wrap).value) || t.min);
    const bet = Math.min(Math.max(val, t.min), Math.min(t.max, state.netWorth));
    if (bet < t.min || state.netWorth < bet) { toast('Invalid bet amount.', 'lose'); return; }
    startHand(bet);
  });
  return wrap;
}

function startHand(bet) {
  state.spendCash(bet);
  ctx.bet = bet;
  ctx.hands = [{ cards: [draw(ctx), draw(ctx)], bet, done: false, isSplit: false }];
  ctx.dealer = [draw(ctx), draw(ctx)];
  ctx.activeHand = 0;
  ctx.phase = 'playing';
  state.recordHandPlayed();

  const playerBJ = isBlackjack(ctx.hands[0].cards);
  const dealerBJ = isBlackjack(ctx.dealer);
  if (playerBJ || dealerBJ) {
    finishHand();
  } else {
    renderTable();
  }
}

function renderActionControls() {
  const hand = ctx.hands[ctx.activeHand];
  const t = ctx.table;
  const canDouble = hand.cards.length === 2 && state.netWorth >= hand.bet;
  const canSplit = hand.cards.length === 2 && hand.cards[0].rank === hand.cards[1].rank && !hand.isSplit && state.netWorth >= hand.bet && ctx.hands.length < 2;
  const canSurrender = t.surrender && hand.cards.length === 2;
  const wrap = el(`
    <div class="panel bet-controls">
      <button class="btn" id="hit-btn">Hit</button>
      <button class="btn" id="stand-btn">Stand</button>
      ${canDouble ? `<button class="btn secondary" id="double-btn">Double</button>` : ''}
      ${canSplit ? `<button class="btn secondary" id="split-btn">Split</button>` : ''}
      ${canSurrender ? `<button class="btn danger small" id="surrender-btn">Surrender</button>` : ''}
    </div>
  `);
  qs('#hit-btn', wrap).addEventListener('click', () => playerHit());
  qs('#stand-btn', wrap).addEventListener('click', () => playerStand());
  if (canDouble) qs('#double-btn', wrap).addEventListener('click', () => playerDouble());
  if (canSplit) qs('#split-btn', wrap).addEventListener('click', () => playerSplit());
  if (canSurrender) qs('#surrender-btn', wrap).addEventListener('click', () => playerSurrender());
  return wrap;
}

function playerHit() {
  const hand = ctx.hands[ctx.activeHand];
  hand.cards.push(draw(ctx));
  if (blackjackTotal(hand.cards).total > 21) advanceHand();
  else renderTable();
}
function playerStand() { advanceHand(); }
function playerDouble() {
  const hand = ctx.hands[ctx.activeHand];
  state.spendCash(hand.bet);
  hand.bet *= 2;
  hand.cards.push(draw(ctx));
  advanceHand();
}
function playerSplit() {
  const hand = ctx.hands[ctx.activeHand];
  state.spendCash(hand.bet);
  const newHand = { cards: [hand.cards.pop()], bet: hand.bet, done: false, isSplit: true };
  hand.isSplit = true;
  hand.cards.push(draw(ctx));
  newHand.cards.push(draw(ctx));
  ctx.hands.push(newHand);
  renderTable();
}
function playerSurrender() {
  const hand = ctx.hands[ctx.activeHand];
  hand.result = 'surrender';
  hand.netDelta = -hand.bet / 2;
  state.addCash(hand.bet / 2);
  advanceHand();
}

function advanceHand() {
  if (ctx.activeHand < ctx.hands.length - 1) {
    ctx.activeHand++;
    renderTable();
  } else {
    finishHand();
  }
}

function finishHand() {
  ctx.phase = 'dealer';
  // Resolve any hand not yet resolved (surrender already resolved)
  const anyLive = ctx.hands.some(h => !h.result && blackjackTotal(h.cards).total <= 21);
  const dealerBJ = isBlackjack(ctx.dealer);

  if (anyLive) {
    while (blackjackTotal(ctx.dealer).total < 17) ctx.dealer.push(draw(ctx));
  }
  const dealerTotal = blackjackTotal(ctx.dealer).total;
  const dealerBust = dealerTotal > 21;

  ctx.hands.forEach(h => {
    if (h.result) return; // surrender already set
    const pTotal = blackjackTotal(h.cards).total;
    const pBJ = isBlackjack(h.cards) && !h.isSplit;
    if (pTotal > 21) { h.result = 'lose'; h.netDelta = -h.bet; return; }
    if (pBJ && dealerBJ) { h.result = 'push'; h.netDelta = 0; state.addCash(h.bet); return; }
    if (pBJ) { h.result = 'blackjack'; h.netDelta = h.bet * 1.5; state.addCash(h.bet + h.bet * 1.5); state.unlockAchievement('first_blackjack'); return; }
    if (dealerBJ) { h.result = 'lose'; h.netDelta = -h.bet; return; }
    if (dealerBust || pTotal > dealerTotal) { h.result = 'win'; h.netDelta = h.bet; state.addCash(h.bet * 2); return; }
    if (pTotal === dealerTotal) { h.result = 'push'; h.netDelta = 0; state.addCash(h.bet); return; }
    h.result = 'lose'; h.netDelta = -h.bet;
  });

  const totalDelta = ctx.hands.reduce((s, h) => s + h.netDelta, 0);
  if (totalDelta > 0) state.recordWin(totalDelta);
  if (totalDelta > 0) toast(`You won ${fmtMoney(totalDelta)}!`, 'win');
  else if (totalDelta < 0) toast(`You lost ${fmtMoney(-totalDelta)}.`, 'lose');

  ctx.phase = 'result';
  renderTable();
  checkBankruptcy();
}
