import { state } from '../state.js';
import { el, qs, qsa, fmtMoney, toast, showModal, closeModal } from '../ui.js';
import { POKER_ROOMS } from '../data.js';
import { freshDeck, shuffle, cardHtml, evaluateHand, compareScore, rankValue } from '../cards.js';
import { checkBankruptcy } from '../main.js';

let ctx = null; // active session
let container = null;

function cardKey(c) { return `${c.rank}${c.suit}`; }

// -------------------------------------------------------------- AI equity
function estimatePreflopStrength(hole) {
  const [a, b] = hole.map(c => rankValue(c.rank)).sort((x, y) => y - x);
  const isPair = a === b;
  const isSuited = hole[0].suit === hole[1].suit;
  const gap = a - b;
  let strength = (a + b) / 28 * 0.6;
  if (isPair) strength += 0.25 + (a - 2) / 46;
  if (isSuited) strength += 0.05;
  if (!isPair && gap <= 1) strength += 0.05;
  else if (!isPair && gap <= 3) strength += 0.02;
  return Math.max(0.05, Math.min(0.97, strength));
}

function estimateEquity(hole, board, iterations = 100) {
  const known = new Set([...hole, ...board].map(cardKey));
  const baseDeck = freshDeck().filter(c => !known.has(cardKey(c)));
  let wins = 0, ties = 0;
  for (let i = 0; i < iterations; i++) {
    const d = shuffle(baseDeck);
    const oppHole = [d[0], d[1]];
    const need = 5 - board.length;
    const fullBoard = board.concat(d.slice(2, 2 + need));
    const me = evaluateHand(hole.concat(fullBoard));
    const opp = evaluateHand(oppHole.concat(fullBoard));
    const cmp = compareScore(me, opp);
    if (cmp > 0) wins++; else if (cmp === 0) ties++;
  }
  return (wins + ties * 0.5) / iterations;
}

function aiDecide(opponent, { equity, toCall, pot, stack, myBet, bb }) {
  const bluff = Math.random() < opponent.bluff;
  const effEquity = bluff ? Math.max(equity, 0.8) : equity;
  const willShowTell = bluff && Math.random() < 0.4;

  if (toCall === 0) {
    const betChance = opponent.aggro * (0.35 + effEquity * 0.6);
    if (Math.random() < betChance && stack > 0) {
      const size = Math.min(stack, Math.round(pot * (0.5 + opponent.aggro * 0.6)) || bb);
      return { action: 'bet', amount: myBet + Math.max(bb, size), tell: willShowTell };
    }
    return { action: 'check', tell: false };
  }
  const potOdds = toCall / (pot + toCall);
  const requiredEquity = potOdds + opponent.tight * 0.18 - opponent.aggro * 0.05;
  if (effEquity < requiredEquity) return { action: 'fold', tell: false };
  if (effEquity > requiredEquity + 0.22 && Math.random() < opponent.aggro && stack > toCall) {
    const extra = Math.max(bb, Math.round((pot + toCall) * (0.5 + opponent.aggro * 0.5)));
    const put = Math.min(stack, toCall + extra);
    return { action: 'raise', amount: myBet + put, tell: willShowTell };
  }
  return { action: 'call', tell: willShowTell };
}

// -------------------------------------------------------------- Session
function startSession(room, buyIn) {
  // Note: we deliberately don't run the bankruptcy check right after the buy-in —
  // the buy-in amount is still "in play" as the player's table stack, not lost.
  // Bankruptcy is assessed for real cash when they leave the table (see leaveTable()).
  state.spendCash(buyIn);
  ctx = {
    room,
    opponent: { ...room.opponent },
    playerStack: buyIn,
    aiStack: buyIn,
    buyIn,
    buttonIsPlayer: true,
    hand: null,
    history: { actions: 0, folds: 0, raises: 0 },
    log: [],
  };
  renderAll();
}

function newHand() {
  if (ctx.aiStack <= 0) { ctx.aiStack = ctx.buyIn; toast(`${ctx.opponent.name} reloads their stack.`, 'info'); }
  const deck = shuffle(freshDeck());
  const bb = ctx.room.bb, sb = ctx.room.sb;
  ctx.hand = {
    deck, board: [],
    playerHole: [deck.pop(), deck.pop()],
    aiHole: [deck.pop(), deck.pop()],
    pot: 0,
    streetBets: { player: 0, ai: 0 },
    streetActed: { player: false, ai: false },
    folded: { player: false, ai: false },
    allIn: { player: false, ai: false },
    phase: 'preflop',
    toAct: null,
    lastRaiseSize: bb,
    tellText: '',
    revealAi: false,
  };
  const h = ctx.hand;
  const btnIsPlayer = ctx.buttonIsPlayer;
  postBet(btnIsPlayer ? 'player' : 'ai', sb);
  postBet(btnIsPlayer ? 'ai' : 'player', bb);
  h.streetActed.player = false; h.streetActed.ai = false;
  h.toAct = btnIsPlayer ? 'player' : 'ai';
  renderAll();
  if (h.toAct === 'ai') setTimeout(aiTurn, 700);
}

function postBet(who, amount) {
  const h = ctx.hand;
  const stackKey = who === 'player' ? 'playerStack' : 'aiStack';
  const put = Math.min(amount, ctx[stackKey]);
  ctx[stackKey] -= put;
  h.streetBets[who] += put;
  h.pot += put;
  if (ctx[stackKey] === 0) h.allIn[who] = true;
}

function drawCards(h, n) { for (let i = 0; i < n; i++) h.board.push(h.deck.pop()); }

function applyAction(actor, action, amount) {
  const h = ctx.hand;
  const other = actor === 'player' ? 'ai' : 'player';
  const stackKey = actor === 'player' ? 'playerStack' : 'aiStack';
  ctx.history.actions++;

  if (action === 'fold') {
    h.folded[actor] = true;
    ctx.history.folds += actor === 'player' ? 1 : 0;
    endHand(other);
    return;
  }
  if (action === 'check') {
    h.streetActed[actor] = true;
  } else if (action === 'call') {
    const toCall = h.streetBets[other] - h.streetBets[actor];
    const put = Math.min(toCall, ctx[stackKey]);
    ctx[stackKey] -= put; h.streetBets[actor] += put; h.pot += put;
    if (ctx[stackKey] === 0) h.allIn[actor] = true;
    h.streetActed[actor] = true;
  } else if (action === 'bet' || action === 'raise') {
    let put = amount - h.streetBets[actor];
    put = Math.min(put, ctx[stackKey]);
    ctx[stackKey] -= put; h.streetBets[actor] += put; h.pot += put;
    if (ctx[stackKey] === 0) h.allIn[actor] = true;
    h.lastRaiseSize = Math.max(ctx.room.bb, h.streetBets[actor] - h.streetBets[other]);
    h.streetActed[actor] = true; h.streetActed[other] = false;
    ctx.history.raises += actor === 'player' ? 1 : 0;
  }

  if (h.folded.player || h.folded.ai) return; // already handled above

  // A call that leaves the caller all-in (even for less than the bet) ends the
  // street immediately — they have no more decisions left to make.
  const isAllInCall = action === 'call' && h.allIn[actor];
  const betsEqual = h.streetBets.player === h.streetBets.ai;
  const streetDone = isAllInCall || (h.streetActed.player && h.streetActed.ai && betsEqual);

  if (streetDone) {
    if (isAllInCall) reconcileAllIn();
    advanceStreet();
  } else {
    h.toAct = other;
    renderAll();
    if (other === 'ai') setTimeout(aiTurn, 700 + Math.random() * 500);
  }
}

// Refunds any wager that was never actually matched (a short all-in call)
// back to the player who put in more, so nobody is charged for chips their
// opponent couldn't cover.
function reconcileAllIn() {
  const h = ctx.hand;
  const diff = h.streetBets.player - h.streetBets.ai;
  if (diff === 0) return;
  if (diff > 0) { ctx.playerStack += diff; h.pot -= diff; h.streetBets.player -= diff; }
  else { const d = -diff; ctx.aiStack += d; h.pot -= d; h.streetBets.ai -= d; }
}

function advanceStreet() {
  const h = ctx.hand;
  h.streetBets = { player: 0, ai: 0 };
  h.streetActed = { player: false, ai: false };
  if (h.phase === 'preflop') { drawCards(h, 3); h.phase = 'flop'; }
  else if (h.phase === 'flop') { drawCards(h, 1); h.phase = 'turn'; }
  else if (h.phase === 'turn') { drawCards(h, 1); h.phase = 'river'; }
  else { showdown(); return; }

  if (h.allIn.player || h.allIn.ai) { renderAll(); setTimeout(runOutBoard, 900); return; }

  h.toAct = ctx.buttonIsPlayer ? 'ai' : 'player'; // non-button acts first postflop
  renderAll();
  if (h.toAct === 'ai') setTimeout(aiTurn, 800);
}

function runOutBoard() {
  const h = ctx.hand;
  if (h.phase === 'river') { showdown(); return; }
  if (h.phase === 'preflop') drawCards(h, 3);
  else drawCards(h, 1);
  h.phase = h.phase === 'preflop' ? 'flop' : h.phase === 'flop' ? 'turn' : 'river';
  renderAll();
  setTimeout(runOutBoard, 900);
}

function aiTurn() {
  if (!ctx || !ctx.hand || ctx.hand.folded.player || ctx.hand.folded.ai) return;
  const h = ctx.hand;
  const equity = h.phase === 'preflop'
    ? estimatePreflopStrength(h.aiHole)
    : estimateEquity(h.aiHole, h.board, 90);
  const toCall = h.streetBets.player - h.streetBets.ai;
  if (ctx.opponent.adaptive) {
    const foldRate = ctx.history.folds / Math.max(1, ctx.history.actions);
    ctx.opponent.aggro = Math.max(0.25, Math.min(0.9, ctx.room.opponent.aggro + (foldRate - 0.35) * 0.4));
  }
  const decision = aiDecide(ctx.opponent, { equity, toCall, pot: h.pot, stack: ctx.aiStack, myBet: h.streetBets.ai, bb: ctx.room.bb });
  h.tellText = decision.tell ? tellPhrase(ctx.opponent) : '';
  if (decision.action === 'fold') applyAction('ai', 'fold');
  else if (decision.action === 'check') applyAction('ai', 'check');
  else if (decision.action === 'call') applyAction('ai', 'call');
  else applyAction('ai', decision.action, decision.amount);
}

function tellPhrase(opponent) {
  const phrases = ['🕶️ sunglasses glint', '🤏 taps chips twice', '🍸 sips their drink slowly', '👀 avoids eye contact', '🫳 stacks chips a little too neatly'];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function endHand(winner) {
  const h = ctx.hand;
  const potWon = h.pot;
  if (winner === 'player') { ctx.playerStack += potWon; state.recordWin(potWon); }
  else { ctx.aiStack += potWon; }
  h.result = { winner, potWon, showdown: false };
  finishHandBookkeeping();
}

function showdown() {
  const h = ctx.hand;
  const meScore = evaluateHand(h.playerHole.concat(h.board));
  const oppScore = evaluateHand(h.aiHole.concat(h.board));
  const cmp = compareScore(meScore, oppScore);
  h.revealAi = true;
  let winner;
  if (cmp > 0) { winner = 'player'; ctx.playerStack += h.pot; state.recordWin(h.pot); }
  else if (cmp < 0) { winner = 'ai'; ctx.aiStack += h.pot; }
  else { winner = 'push'; ctx.playerStack += h.pot / 2; ctx.aiStack += h.pot / 2; }
  h.result = { winner, potWon: h.pot, showdown: true, meScore, oppScore };
  if (meScore.rank === 8 && meScore.tiebreak[0] === 14) state.unlockAchievement('royal_flush');
  if (winner === 'player' && ctx.room.id === 'nosebleed') state.unlockAchievement('shark_beat');
  finishHandBookkeeping();
}

function finishHandBookkeeping() {
  state.recordHandPlayed();
  ctx.buttonIsPlayer = !ctx.buttonIsPlayer;
  renderAll();
}

// -------------------------------------------------------------- Rendering
export function render(rootContainer) {
  container = rootContainer;
  renderAll();
}

function renderAll() {
  container.innerHTML = '';
  container.appendChild(el(`<h2>🃏 Texas Hold'em</h2>`));
  if (!ctx) { container.appendChild(renderRoomSelect()); return; }
  if (!ctx.hand) { container.appendChild(renderPreHandPanel()); return; }
  container.appendChild(renderTable());
}

function renderRoomSelect() {
  const wrap = el(`<div class="panel"></div>`);
  wrap.appendChild(el(`<h3>Choose a Room</h3>`));
  const grid = el(`<div class="game-grid"></div>`);
  POKER_ROOMS.forEach(r => {
    const locked = !state.meetsTier(r.reqTier);
    const card = el(`
      <div class="game-card" style="${locked ? 'opacity:.45;cursor:not-allowed' : ''}">
        <div class="emoji">${r.opponent.icon}</div>
        <h3>${r.name}</h3>
        <p class="subtle">Blinds ${fmtMoney(r.sb)}/${fmtMoney(r.bb)} vs ${r.opponent.name} (${r.opponent.style})</p>
        ${locked ? `<p class="subtle">🔒 Requires higher status</p>` : ''}
      </div>
    `);
    if (!locked) card.addEventListener('click', () => openBuyIn(r));
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  return wrap;
}

function openBuyIn(room) {
  const suggested = Math.min(Math.floor(state.netWorth), room.bb * 100);
  const minBuy = Math.min(room.bb * 20, Math.floor(state.netWorth));
  showModal(`
    <h2>${room.opponent.icon} ${room.name}</h2>
    <p class="subtle">Buy in against ${room.opponent.name} — a ${room.opponent.style} player.</p>
    <div class="bet-controls" style="justify-content:center">
      <input type="number" id="buyin-input" min="${minBuy}" max="${Math.floor(state.netWorth)}" value="${Math.max(minBuy, suggested)}" />
      <button class="btn" id="buyin-confirm">Sit Down</button>
      <button class="btn secondary" id="buyin-cancel">Cancel</button>
    </div>
    <p class="subtle">Your cash: ${fmtMoney(state.netWorth)}</p>
  `);
  qs('#buyin-cancel').addEventListener('click', closeModal);
  qs('#buyin-confirm').addEventListener('click', () => {
    const val = Math.floor(parseFloat(qs('#buyin-input').value) || minBuy);
    if (val <= 0 || val > state.netWorth) { toast('Invalid buy-in amount.', 'lose'); return; }
    closeModal();
    startSession(room, val);
  });
}

function renderPreHandPanel() {
  const wrap = el(`<div class="panel"></div>`);
  wrap.appendChild(el(`
    <div class="flex-between">
      <h3>${ctx.opponent.icon} vs ${ctx.opponent.name} — ${ctx.room.name}</h3>
      <div>Your stack: <strong>${fmtMoney(ctx.playerStack)}</strong> · Their stack: <strong>${fmtMoney(ctx.aiStack)}</strong></div>
    </div>
  `));
  if (ctx.playerStack <= 0) {
    wrap.appendChild(el(`<p class="subtle">You're out of chips at this table.</p>`));
    const leaveBtn = el(`<button class="btn secondary" id="leave-poker">Leave Table</button>`);
    leaveBtn.addEventListener('click', leaveTable);
    wrap.appendChild(leaveBtn);
  } else {
    const startBtn = el(`<button class="btn">Deal Next Hand</button>`);
    startBtn.addEventListener('click', newHand);
    const leaveBtn = el(`<button class="btn secondary" style="margin-left:10px">Leave Table (Cash Out)</button>`);
    leaveBtn.addEventListener('click', leaveTable);
    wrap.appendChild(startBtn); wrap.appendChild(leaveBtn);
  }
  return wrap;
}

function leaveTable() {
  if (ctx.playerStack > 0) state.addCash(ctx.playerStack);
  ctx = null;
  renderAll();
  checkBankruptcy();
}

function renderTable() {
  const h = ctx.hand;
  const wrap = el(`<div></div>`);
  const felt = el(`<div class="table-felt red-felt"></div>`);

  const seatRow = el(`<div class="seat-row"></div>`);
  const aiSeat = el(`
    <div class="seat ${h.folded.ai ? 'folded' : ''} ${h.toAct === 'ai' && !h.result ? 'acting' : ''}">
      <div class="avatar">${ctx.opponent.icon}</div>
      <div class="name">${ctx.opponent.name}</div>
      <div class="stack">${fmtMoney(ctx.aiStack)}</div>
      <div class="tell">${h.tellText || ''}</div>
      <div class="card-row" style="justify-content:center">${h.aiHole.map(c => cardHtml(c, !h.revealAi)).join('')}</div>
    </div>
  `);
  seatRow.appendChild(aiSeat);
  felt.appendChild(seatRow);

  felt.appendChild(el(`<h3 style="text-align:center">Pot: ${fmtMoney(h.pot)}</h3>`));
  const board = el(`<div class="card-row" style="justify-content:center"></div>`);
  h.board.forEach(c => board.appendChild(el(cardHtml(c))));
  for (let i = h.board.length; i < 5; i++) board.appendChild(el(`<div class="playing-card back" style="opacity:.25"></div>`));
  felt.appendChild(board);

  const playerSeat = el(`
    <div class="seat ${h.folded.player ? 'folded' : ''} ${h.toAct === 'player' && !h.result ? 'acting' : ''}" style="margin-top:16px">
      <div class="name">You</div>
      <div class="stack">${fmtMoney(ctx.playerStack)}</div>
      <div class="card-row" style="justify-content:center">${h.playerHole.map(c => cardHtml(c)).join('')}</div>
    </div>
  `);
  felt.appendChild(playerSeat);
  wrap.appendChild(felt);

  if (h.result) {
    wrap.appendChild(renderResult());
  } else if (h.toAct === 'player') {
    wrap.appendChild(renderActionControls());
  } else {
    wrap.appendChild(el(`<div class="panel subtle" style="text-align:center">${ctx.opponent.name} is thinking…</div>`));
  }
  return wrap;
}

function renderActionControls() {
  const h = ctx.hand;
  const toCall = h.streetBets.ai - h.streetBets.player;
  const wrap = el(`<div class="panel bet-controls"></div>`);
  const foldBtn = el(`<button class="btn danger">Fold</button>`);
  foldBtn.addEventListener('click', () => applyAction('player', 'fold'));
  wrap.appendChild(foldBtn);

  if (toCall <= 0) {
    const checkBtn = el(`<button class="btn secondary">Check</button>`);
    checkBtn.addEventListener('click', () => applyAction('player', 'check'));
    wrap.appendChild(checkBtn);
  } else {
    const callBtn = el(`<button class="btn secondary">Call ${fmtMoney(Math.min(toCall, ctx.playerStack))}</button>`);
    callBtn.addEventListener('click', () => applyAction('player', 'call'));
    wrap.appendChild(callBtn);
  }

  if (ctx.playerStack > toCall) {
    const minRaiseTo = h.streetBets.player + toCall + Math.max(ctx.room.bb, h.lastRaiseSize);
    const maxRaiseTo = h.streetBets.player + ctx.playerStack;
    const input = el(`<input type="number" id="raise-input" min="${Math.min(minRaiseTo, maxRaiseTo)}" max="${maxRaiseTo}" value="${Math.min(minRaiseTo, maxRaiseTo)}" style="width:100px" />`);
    const raiseBtn = el(`<button class="btn">${toCall > 0 ? 'Raise To' : 'Bet'}</button>`);
    raiseBtn.addEventListener('click', () => {
      const val = Math.floor(parseFloat(input.value) || minRaiseTo);
      applyAction('player', toCall > 0 ? 'raise' : 'bet', Math.min(Math.max(val, 1), maxRaiseTo));
    });
    const allInBtn = el(`<button class="btn secondary small">All In</button>`);
    allInBtn.addEventListener('click', () => applyAction('player', toCall > 0 ? 'raise' : 'bet', maxRaiseTo));
    wrap.appendChild(input); wrap.appendChild(raiseBtn); wrap.appendChild(allInBtn);
  }
  return wrap;
}

function renderResult() {
  const h = ctx.hand;
  const wrap = el(`<div class="panel" style="text-align:center"></div>`);
  let text;
  if (h.result.winner === 'player') text = `You win ${fmtMoney(h.result.potWon)}${h.result.showdown ? ` with ${h.result.meScore.name}` : ' (opponent folded)'}!`;
  else if (h.result.winner === 'ai') text = `${ctx.opponent.name} wins ${fmtMoney(h.result.potWon)}${h.result.showdown ? ` with ${h.result.oppScore.name}` : ' (you folded)'}.`;
  else text = `Split pot — both showed ${h.result.meScore.name}.`;
  wrap.appendChild(el(`<div class="result-banner ${h.result.winner === 'player' ? 'win' : h.result.winner === 'ai' ? 'lose' : 'push'}">${text}</div>`));

  if (state.run.ownedTeammates.includes('shark_reader')) {
    wrap.appendChild(el(`<p class="subtle">🐟 Miko's Tip: ${randomPokerTip()}</p>`));
  }

  if (ctx.playerStack <= 0) {
    wrap.appendChild(el(`<p class="subtle">You're out of chips at this table.</p>`));
    const leaveBtn = el(`<button class="btn secondary" id="leave-poker">Leave Table</button>`);
    leaveBtn.addEventListener('click', leaveTable);
    wrap.appendChild(leaveBtn);
  } else {
    const nextBtn = el(`<button class="btn">Next Hand</button>`);
    nextBtn.addEventListener('click', () => { ctx.hand = null; renderAll(); });
    const leaveBtn = el(`<button class="btn secondary" style="margin-left:10px">Leave Table (Cash Out)</button>`);
    leaveBtn.addEventListener('click', leaveTable);
    wrap.appendChild(nextBtn); wrap.appendChild(leaveBtn);
  }
  return wrap;
}

function randomPokerTip() {
  const tips = [
    'You could have sized that bet bigger for value.',
    'Nice fold — you saved chips with a marginal hand.',
    'Watch for the tell next time they bet big on the river.',
    'Consider calling wider in position against aggressive opponents.',
  ];
  return tips[Math.floor(Math.random() * tips.length)];
}
