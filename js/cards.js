// Shared card/deck utilities for Blackjack and Hold'em.

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['♠', '♥', '♦', '♣'];
const RED_SUITS = new Set(['♥', '♦']);

export function freshDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  return deck;
}

// Fisher-Yates shuffle, verifiable/unbiased.
export function shuffle(deck, rng = Math.random) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createShoe(numDecks = 1) {
  let shoe = [];
  for (let i = 0; i < numDecks; i++) shoe = shoe.concat(freshDeck());
  return shuffle(shoe);
}

export function cardHtml(card, faceDown = false) {
  if (faceDown) return `<div class="playing-card back"></div>`;
  const red = RED_SUITS.has(card.suit) ? 'red' : '';
  return `<div class="playing-card ${red}"><span>${card.rank}</span><span>${card.suit}</span></div>`;
}

export function rankValue(rank) {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return parseInt(rank, 10);
}

// ------------------------------------------------------------ Blackjack math
export function blackjackTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { total += 11; aces++; }
    else if (['K', 'Q', 'J'].includes(c.rank)) total += 10;
    else total += parseInt(c.rank, 10);
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) { total -= 10; aces--; soft = aces > 0; }
  return { total, soft: soft && total <= 21 };
}
export function isBlackjack(cards) {
  return cards.length === 2 && blackjackTotal(cards).total === 21;
}

// ------------------------------------------------------------ Poker hand eval
// Evaluates the best 5-card hand out of 5-7 cards. Returns { rank, name, tiebreak: [...] }
// rank: 8=StraightFlush 7=Quads 6=FullHouse 5=Flush 4=Straight 3=Trips 2=TwoPair 1=Pair 0=HighCard
const HAND_NAMES = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

export function evaluateHand(cards) {
  const combos = kCombinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const score = scoreFive(combo);
    if (!best || compareScore(score, best) > 0) best = score;
  }
  return best;
}

export function compareScore(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] || 0) - (b.tiebreak[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function scoreFive(cards) {
  const values = cards.map(c => rankValue(c.rank)).sort((a, b) => b - a);
  const suitCounts = {};
  cards.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
  const isFlush = Object.values(suitCounts).some(n => n === 5);

  const uniqVals = [...new Set(values)];
  let straightHigh = null;
  if (uniqVals.length === 5) {
    if (uniqVals[0] - uniqVals[4] === 4) straightHigh = uniqVals[0];
    else if (uniqVals.join(',') === '14,5,4,3,2') straightHigh = 5; // wheel A-2-3-4-5
  }

  const counts = {};
  values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  const groups = Object.entries(counts).map(([v, c]) => ({ v: parseInt(v), c }))
    .sort((a, b) => b.c - a.c || b.v - a.v);

  if (straightHigh && isFlush) return { rank: 8, name: 'Straight Flush', tiebreak: [straightHigh] };
  if (groups[0].c === 4) return { rank: 7, name: 'Four of a Kind', tiebreak: [groups[0].v, groups[1].v] };
  if (groups[0].c === 3 && groups[1]?.c === 2) return { rank: 6, name: 'Full House', tiebreak: [groups[0].v, groups[1].v] };
  if (isFlush) return { rank: 5, name: 'Flush', tiebreak: values };
  if (straightHigh) return { rank: 4, name: 'Straight', tiebreak: [straightHigh] };
  if (groups[0].c === 3) return { rank: 3, name: 'Three of a Kind', tiebreak: [groups[0].v, ...groups.slice(1).map(g => g.v)] };
  if (groups[0].c === 2 && groups[1]?.c === 2) {
    const kicker = groups.find(g => g.c === 1)?.v || 0;
    return { rank: 2, name: 'Two Pair', tiebreak: [groups[0].v, groups[1].v, kicker] };
  }
  if (groups[0].c === 2) return { rank: 1, name: 'Pair', tiebreak: [groups[0].v, ...groups.slice(1).map(g => g.v)] };
  return { rank: 0, name: 'High Card', tiebreak: values };
}

function kCombinations(arr, k) {
  const results = [];
  function helper(start, combo) {
    if (combo.length === k) { results.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

export { HAND_NAMES };
