import { state } from '../state.js';
import { el, qs, qsa, fmtMoney, toast, showModal, closeModal } from '../ui.js';
import { SLOT_MACHINES } from '../data.js';
import { checkBankruptcy } from '../main.js';

const LINES = [
  [[0, 0], [1, 0], [2, 0]], // top row
  [[0, 1], [1, 1], [2, 1]], // middle row
  [[0, 2], [1, 2], [2, 2]], // bottom row
  [[0, 0], [1, 1], [2, 2]], // diagonal down
  [[0, 2], [1, 1], [2, 0]], // diagonal up
];
const JACKPOT_BASE = 2500;
const JACKPOT_CONTRIBUTION_RATE = 0.02;

let ctx = null; // { machine, betPerLine, grid, lastWinCells }
let container = null;

function pickSymbol(machine) {
  const totalW = machine.weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalW;
  for (let i = 0; i < machine.symbols.length; i++) {
    r -= machine.weights[i];
    if (r <= 0) return machine.symbols[i];
  }
  return machine.symbols[machine.symbols.length - 1];
}

function spinGrid(machine) {
  // grid[reel][row]
  const grid = [];
  for (let reel = 0; reel < 3; reel++) {
    grid.push([pickSymbol(machine), pickSymbol(machine), pickSymbol(machine)]);
  }
  return grid;
}

function evaluateLine(symbols3, wildSymbol) {
  let target = symbols3.find(s => s !== wildSymbol);
  if (!target) target = wildSymbol;
  let count = 0;
  for (const s of symbols3) {
    if (s === target || s === wildSymbol) count++;
    else break;
  }
  return { symbol: target, count };
}

export function render(rootContainer) {
  container = rootContainer;
  if (!ctx) {
    const first = SLOT_MACHINES.find(m => state.meetsTier(m.reqTier)) || SLOT_MACHINES[0];
    ctx = { machine: first, betPerLine: 1, grid: spinGrid(first), lastWinLines: [], spinning: false };
  }
  renderAll();
}

function renderAll() {
  container.innerHTML = '';
  container.appendChild(el(`<h2>🎰 Slot Machines</h2>`));

  const select = el(`<div class="machine-select"></div>`);
  SLOT_MACHINES.forEach(m => {
    const locked = !state.meetsTier(m.reqTier);
    const btn = el(`<button class="machine-btn ${ctx.machine.id === m.id ? 'active' : ''}" ${locked ? 'disabled style="opacity:.4"' : ''}>${m.icon} ${m.name} <small>(${m.variance})</small></button>`);
    if (!locked) btn.addEventListener('click', () => { ctx.machine = m; ctx.grid = spinGrid(m); ctx.lastWinLines = []; renderAll(); });
    select.appendChild(btn);
  });
  container.appendChild(select);

  const panel = el(`<div class="panel"></div>`);
  const machineWrap = el(`<div class="slot-machine"></div>`);
  machineWrap.appendChild(el(`<div class="jackpot-meter">💰 Progressive Jackpot: ${fmtMoney(state.run.jackpot)}</div>`));

  const reels = el(`<div class="reels"></div>`);
  for (let reel = 0; reel < 3; reel++) {
    const col = el(`<div class="reel-col"></div>`);
    for (let row = 0; row < 3; row++) {
      const isWin = ctx.lastWinLines.some(line => line.cells.some(([r, w]) => r === reel && w === row));
      const cell = el(`<div class="symbol-cell ${isWin ? 'win' : ''}">${ctx.grid[reel][row]}</div>`);
      col.appendChild(cell);
    }
    reels.appendChild(col);
  }
  machineWrap.appendChild(reels);

  const totalBet = ctx.betPerLine * LINES.length;
  machineWrap.appendChild(el(`
    <div class="bet-controls">
      <label>Bet/Line:</label>
      <input type="number" id="bet-line" min="0.20" step="0.20" value="${ctx.betPerLine}" style="width:80px" />
      <span class="subtle">Total bet: ${fmtMoney(totalBet)} (5 lines)</span>
      <button class="btn" id="spin-btn" ${ctx.spinning ? 'disabled' : ''}>${ctx.spinning ? 'Spinning…' : 'Spin'}</button>
    </div>
  `));
  machineWrap.appendChild(el(`<div class="paylines">Wild: ${ctx.machine.wild} substitutes any symbol. Scatter: ${ctx.machine.scatter} pays anywhere &amp; 3+ triggers a bonus pick. 5 paylines: top, middle, bottom row + both diagonals.</div>`));

  panel.appendChild(machineWrap);
  container.appendChild(panel);

  qs('#bet-line', panel).addEventListener('change', (e) => {
    ctx.betPerLine = Math.max(0.2, parseFloat(e.target.value) || 1);
  });
  qs('#spin-btn', panel).addEventListener('click', doSpin);
}

function doSpin() {
  const totalBet = round2(ctx.betPerLine * LINES.length);
  if (totalBet <= 0) { toast('Set a bet amount first.', 'lose'); return; }
  if (!state.spendCash(totalBet)) { toast('Not enough cash for that bet.', 'lose'); return; }

  state.run.jackpot = round2(state.run.jackpot + totalBet * JACKPOT_CONTRIBUTION_RATE);
  ctx.grid = spinGrid(ctx.machine);
  ctx.spinning = true;
  renderAll();
  state.recordHandPlayed();

  setTimeout(() => resolveSpin(totalBet), 900);
}

function round2(n) { return Math.round(n * 100) / 100; }

function resolveSpin(totalBet) {
  ctx.spinning = false;
  const m = ctx.machine;
  let totalWin = 0;
  const winLines = [];

  LINES.forEach((cells, idx) => {
    const symbols3 = cells.map(([reel, row]) => ctx.grid[reel][row]);
    const { symbol, count } = evaluateLine(symbols3, m.wild);
    if (symbol === m.scatter) return; // scatters resolved separately
    const payTable = m.pays[symbol];
    if (!payTable || count < 2) return;
    const mult = payTable[count - 1] || 0;
    if (mult > 0) {
      const win = round2(mult * ctx.betPerLine);
      totalWin += win;
      winLines.push({ cells, symbol, count, win });
    }
  });

  // Scatter anywhere on the grid
  let scatterCount = 0;
  ctx.grid.forEach(reel => reel.forEach(sym => { if (sym === m.scatter) scatterCount++; }));
  const scatterPay = m.pays[m.scatter];
  if (scatterPay && scatterCount >= 2 && scatterPay[scatterCount - 1] > 0) {
    totalWin += round2(scatterPay[scatterCount - 1] * totalBet);
  }

  // Jackpot: 3-in-a-row of the machine's top symbol (last in list) on any line, then a rarity roll.
  const topSymbol = m.symbols[m.symbols.length - 1];
  const hitTop3 = winLines.some(l => l.symbol === topSymbol && l.count === 3);
  let jackpotHit = false;
  if (hitTop3 && Math.random() < 0.15) {
    jackpotHit = true;
    totalWin += state.run.jackpot;
    state.run.jackpot = JACKPOT_BASE;
    state.unlockAchievement('jackpot');
  }

  ctx.lastWinLines = winLines;

  if (totalWin > 0) {
    state.addCash(totalWin);
    state.recordWin(totalWin);
  }
  state.save();
  renderAll();

  if (jackpotHit) {
    showModal(`
      <h2>💰 JACKPOT!!! 💰</h2>
      <p>The reels aligned and the whole progressive pool is yours.</p>
      <div class="modal-stats"><div><span>Jackpot Won</span><strong>${fmtMoney(totalWin)}</strong></div></div>
      <button class="btn" id="close-jp">Nice!</button>
    `);
    qs('#close-jp').addEventListener('click', closeModal);
  } else if (scatterCount >= 3) {
    runBonusPick(scatterCount, totalBet);
    return; // bonus flow handles its own bankruptcy check afterward
  } else if (totalWin > 0) {
    toast(`Winning spin! +${fmtMoney(totalWin)}`, 'win');
  } else {
    toast('No win this spin.', 'lose');
  }
  checkBankruptcy();
}

function runBonusPick(scatterCount, totalBet) {
  const options = [2, 5, 10, 0.5].sort(() => Math.random() - 0.5);
  showModal(`
    <h2>🎁 Bonus Round! ${scatterCount} Scatters</h2>
    <p class="subtle">Pick a box to reveal your bonus multiplier.</p>
    <div style="display:flex; gap:14px; justify-content:center; margin:18px 0;">
      <button class="btn" data-i="0" style="font-size:1.6rem;padding:20px 26px">🎁</button>
      <button class="btn" data-i="1" style="font-size:1.6rem;padding:20px 26px">🎁</button>
      <button class="btn" data-i="2" style="font-size:1.6rem;padding:20px 26px">🎁</button>
    </div>
  `, { closable: false });
  qsa('[data-i]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mult = options[parseInt(btn.dataset.i, 10)];
      const win = round2(mult * totalBet * 5);
      state.addCash(win);
      state.recordWin(win);
      showModal(`
        <h2>🎁 You Revealed x${mult}!</h2>
        <div class="modal-stats"><div><span>Bonus Win</span><strong>${fmtMoney(win)}</strong></div></div>
        <button class="btn" id="close-bonus">Collect</button>
      `);
      qs('#close-bonus').addEventListener('click', () => { closeModal(); checkBankruptcy(); });
    }, { once: true });
  });
}
