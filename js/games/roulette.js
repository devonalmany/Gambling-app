import { state } from '../state.js';
import { el, qs, qsa, fmtMoney, toast } from '../ui.js';
import { ROULETTE_TABLES } from '../data.js';
import { checkBankruptcy } from '../main.js';

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const POCKETS = [0, '00', ...Array.from({ length: 36 }, (_, i) => i + 1)];

function colorOf(n) {
  if (n === 0 || n === '00') return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

let ctx = null; // { table, bets: Map, chipUnit, spinning, lastResult }
let container = null;

export function render(rootContainer) {
  container = rootContainer;
  if (!ctx) ctx = null;
  renderAll();
}

function renderAll() {
  container.innerHTML = '';
  container.appendChild(el(`<h2>🎡 Roulette</h2>`));
  if (!ctx) { container.appendChild(renderTableSelect()); return; }

  const t = ctx.table;
  const wrap = el(`<div class="roulette-wrap"></div>`);

  const wheelCol = el(`<div style="text-align:center"></div>`);
  const wheel = el(`<div class="wheel-outer"><div class="wheel-pointer">▼</div></div>`);
  wheelCol.appendChild(wheel);
  if (ctx.lastResult != null) {
    const c = colorOf(ctx.lastResult);
    wheelCol.appendChild(el(`<div class="wheel-result" style="color:${c === 'red' ? '#e8455a' : c === 'black' ? '#eee' : '#4ad991'}">${ctx.lastResult}</div>`));
  }
  wheelCol.appendChild(renderChipSelector());
  wrap.appendChild(wheelCol);

  const boardCol = el(`<div></div>`);
  boardCol.appendChild(renderBoard());
  boardCol.appendChild(renderActiveBets());
  wrap.appendChild(boardCol);

  container.appendChild(wrap);

  const controls = el(`
    <div class="panel bet-controls">
      <button class="btn" id="spin-btn" ${ctx.spinning ? 'disabled' : ''}>${ctx.spinning ? 'Spinning…' : 'Spin'}</button>
      <button class="btn secondary" id="clear-bets">Clear Bets</button>
      <button class="btn secondary" id="leave-table">Leave Table</button>
      <div class="subtle" style="width:100%">Table limits ${fmtMoney(t.min)} – ${fmtMoney(t.max)} · Total wagered: ${fmtMoney(totalWagered())} · Cash: ${fmtMoney(state.netWorth)}</div>
    </div>
  `);
  qs('#spin-btn', controls).addEventListener('click', spin);
  qs('#clear-bets', controls).addEventListener('click', () => { ctx.bets.clear(); renderAll(); });
  qs('#leave-table', controls).addEventListener('click', () => { ctx = null; renderAll(); });
  container.appendChild(controls);
}

function renderTableSelect() {
  const wrap = el(`<div class="panel"></div>`);
  wrap.appendChild(el(`<h3>Choose a Table</h3>`));
  const grid = el(`<div class="game-grid"></div>`);
  ROULETTE_TABLES.forEach(t => {
    const locked = !state.meetsTier(t.reqTier);
    const card = el(`
      <div class="game-card" style="${locked ? 'opacity:.45;cursor:not-allowed' : ''}">
        <h3>${t.name}</h3>
        <p class="subtle">Bets ${fmtMoney(t.min)} – ${fmtMoney(t.max)}</p>
        ${locked ? `<p class="subtle">🔒 Requires higher status</p>` : ''}
      </div>
    `);
    if (!locked) card.addEventListener('click', () => {
      ctx = { table: t, bets: new Map(), chipUnit: t.min, spinning: false, lastResult: null };
      renderAll();
    });
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  return wrap;
}

function renderChipSelector() {
  const units = [1, 5, 25, 100, 500].filter(u => u <= ctx.table.max);
  const wrap = el(`<div class="bet-controls" style="justify-content:center"></div>`);
  units.forEach(u => {
    const btn = el(`<button class="btn small ${ctx.chipUnit === u ? '' : 'secondary'}">${fmtMoney(u)}</button>`);
    btn.addEventListener('click', () => { ctx.chipUnit = u; renderAll(); });
    wrap.appendChild(btn);
  });
  return wrap;
}

function addBet(key) {
  if (ctx.spinning) return;
  const current = ctx.bets.get(key) || 0;
  if (totalWagered() + ctx.chipUnit > Math.min(ctx.table.max, state.netWorth)) {
    toast('That exceeds the table max or your cash.', 'lose');
    return;
  }
  ctx.bets.set(key, current + ctx.chipUnit);
  renderAll();
}

function totalWagered() {
  let sum = 0;
  ctx.bets.forEach(v => sum += v);
  return sum;
}

function renderBoard() {
  const wrap = el(`<div></div>`);
  const numGrid = el(`<div class="bet-board"></div>`);
  ['0', '00', ...Array.from({ length: 36 }, (_, i) => String(i + 1))].forEach(label => {
    const n = label === '00' ? '00' : parseInt(label, 10);
    const c = colorOf(n);
    const key = `num:${label}`;
    const selected = ctx.bets.has(key) ? 'selected' : '';
    const cell = el(`<div class="board-cell ${c} ${selected}">${label}${ctx.bets.has(key) ? `<br><small>${fmtMoney(ctx.bets.get(key))}</small>` : ''}</div>`);
    cell.addEventListener('click', () => addBet(key));
    numGrid.appendChild(cell);
  });
  wrap.appendChild(numGrid);

  const outside = el(`<div class="bet-board" style="margin-top:8px"></div>`);
  const outsideBets = [
    ['color:red', 'Red', 'red'], ['color:black', 'Black', 'black'],
    ['parity:odd', 'Odd', ''], ['parity:even', 'Even', ''],
    ['range:low', '1–18', ''], ['range:high', '19–36', ''],
    ['dozen:1', '1st 12', ''], ['dozen:2', '2nd 12', ''], ['dozen:3', '3rd 12', ''],
    ['column:1', 'Col 1', ''], ['column:2', 'Col 2', ''], ['column:3', 'Col 3', ''],
  ];
  outsideBets.forEach(([key, label, cls]) => {
    const selected = ctx.bets.has(key) ? 'selected' : '';
    const cell = el(`<div class="board-cell outside ${cls} ${selected}">${label}${ctx.bets.has(key) ? ` (${fmtMoney(ctx.bets.get(key))})` : ''}</div>`);
    cell.addEventListener('click', () => addBet(key));
    outside.appendChild(cell);
  });
  wrap.appendChild(outside);
  return wrap;
}

function renderActiveBets() {
  if (ctx.bets.size === 0) return el(`<div class="active-bets-list">No bets placed yet — click the board.</div>`);
  const items = [...ctx.bets.entries()].map(([k, v]) => `<div>${describeBet(k)}: ${fmtMoney(v)}</div>`).join('');
  return el(`<div class="active-bets-list">${items}</div>`);
}

function describeBet(key) {
  const [type, val] = key.split(':');
  if (type === 'num') return `Straight-up ${val}`;
  if (type === 'color') return val[0].toUpperCase() + val.slice(1);
  if (type === 'parity') return val[0].toUpperCase() + val.slice(1);
  if (type === 'range') return val === 'low' ? '1–18' : '19–36';
  if (type === 'dozen') return `Dozen ${val}`;
  if (type === 'column') return `Column ${val}`;
  return key;
}

function spin() {
  if (ctx.bets.size === 0) { toast('Place at least one bet first.', 'lose'); return; }
  const total = totalWagered();
  if (!state.spendCash(total)) { toast('Not enough cash for these bets.', 'lose'); return; }
  ctx.spinning = true;
  renderAll();
  const wheelEl = qs('.wheel-outer', container);
  const winIdx = Math.floor(Math.random() * POCKETS.length);
  const winning = POCKETS[winIdx];
  if (wheelEl) {
    const spins = 6 + Math.floor(Math.random() * 3);
    const currentRotation = ctx._rotation || 0;
    const newRotation = currentRotation + spins * 360 + Math.floor(Math.random() * 360);
    ctx._rotation = newRotation % 360;
    wheelEl.style.transform = `rotate(${newRotation}deg)`;
  }
  setTimeout(() => resolveSpin(winning), 3300);
  state.recordHandPlayed();
}

function resolveSpin(winning) {
  ctx.spinning = false;
  ctx.lastResult = winning;
  const color = colorOf(winning);
  let payout = 0;
  ctx.bets.forEach((amount, key) => {
    const [type, val] = key.split(':');
    let win = false, mult = 0;
    if (type === 'num') { win = String(winning) === val; mult = 35; }
    else if (winning === 0 || winning === '00') { win = false; }
    else if (type === 'color') { win = color === val; mult = 1; }
    else if (type === 'parity') { win = (val === 'odd') === (winning % 2 === 1); mult = 1; }
    else if (type === 'range') { win = (val === 'low') ? winning <= 18 : winning >= 19; mult = 1; }
    else if (type === 'dozen') {
      const d = parseInt(val, 10);
      win = winning > (d - 1) * 12 && winning <= d * 12; mult = 2;
    } else if (type === 'column') {
      const c = parseInt(val, 10);
      win = winning > 0 && winning % 3 === (c % 3);
      mult = 2;
    }
    if (win) payout += amount + amount * mult;
  });
  ctx.bets.clear();
  if (payout > 0) {
    state.addCash(payout);
    state.recordWin(payout);
    toast(`Number ${winning} (${color})! You won ${fmtMoney(payout)}.`, 'win');
  } else {
    toast(`Number ${winning} (${color}). No winning bets.`, 'lose');
  }
  renderAll();
  checkBankruptcy();
}
