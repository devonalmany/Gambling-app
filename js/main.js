import { state } from './state.js';
import { qs, qsa, showScreen, renderHUD, showModal, closeModal } from './ui.js';
import './screens/city.js';
import './screens/phone.js';
import './screens/character.js';
import './screens/housing.js';
import './screens/shop.js';
import './screens/progress.js';

function wireNav() {
  qsa('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
  window.addEventListener('nav', (e) => showScreen(e.detail));
}

function showIntro() {
  if (state.run.introSeen) return;
  showModal(`
    <div class="intro-modal">
      <h2>Day One</h2>
      <p>You wake up under a bridge. Backpack, a thin blanket, a phone at 5% battery, and $8 in loose change. That's everything.</p>
      <p>An older man in a faded army jacket nods at you from a few feet away. "Rough spot to start," he says. "Name's Ray. Old Ray. You'll figure the rest out — food bank's a few blocks that way, library's warm and free, and there's always somebody hiring for the day if you show up early enough."</p>
      <p class="subtle">Manage your Hunger, Energy, Hygiene, and Warmth. Work gigs and jobs to earn money. Train your skills. Climb from the street to a place of your own — and eventually, further than that.</p>
      <button class="btn primary big" id="intro-ok">Let's get to work</button>
    </div>
  `, { closable: false });
  qs('#intro-ok').addEventListener('click', () => { state.markIntroSeen(); closeModal(); });
}

function init() {
  wireNav();
  renderHUD();
  showScreen('city');
  showIntro();
}

init();
