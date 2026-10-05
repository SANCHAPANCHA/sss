import './style.css';
import { categories, items, tagInfo } from './menu-data.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => `${n.toLocaleString('ru-RU')} ₽`;

// Table number comes from the QR code: ?table=5
const table = new URLSearchParams(location.search).get('table');
if (table) {
  const b = $('#tableBadge');
  b.textContent = `Стол №${table}`;
  b.hidden = false;
}

// 3D scene is loaded lazily so the menu stays usable even without WebGL
import('./burger3d.js')
  .then(({ initBurgerScene }) => initBurgerScene($('#scene')))
  .catch((err) => {
    console.warn('3D disabled:', err);
    document.body.classList.add('no-3d');
  })
  .finally(() => setTimeout(() => $('#loader').classList.add('hide'), 400));

// ---------- Menu rendering ----------
const tabs = $('#tabs');
const sections = $('#sections');

tabs.innerHTML = categories
  .map((c, i) => `<button class="tab${i === 0 ? ' active' : ''}" data-cat="${c.id}">${c.icon} ${c.title}</button>`)
  .join('');

const tagsHtml = (tags) =>
  tags.map((t) => `<span class="tag ${tagInfo[t].cls}">${tagInfo[t].icon} ${tagInfo[t].label}</span>`).join('');

sections.innerHTML = categories
  .map(
    (c) => `
  <section class="cat" id="cat-${c.id}" data-cat="${c.id}">
    <h2 class="cat-title"><span>${c.icon}</span>${c.title}</h2>
    <div class="grid">
      ${items
        .filter((it) => it.cat === c.id)
        .map(
          (it) => `
        <article class="card reveal" data-id="${it.id}" tabindex="0">
          <div class="card-shine"></div>
          <div class="card-emoji"><span>${it.emoji}</span></div>
          <div class="card-body">
            <div class="card-tags">${tagsHtml(it.tags)}</div>
            <h3>${it.name}</h3>
            <p>${it.desc}</p>
            <div class="card-foot">
              <span class="price">${fmt(it.price)}</span>
              <button class="add" data-add="${it.id}" aria-label="Добавить ${it.name}">+</button>
            </div>
          </div>
        </article>`
        )
        .join('')}
    </div>
  </section>`
  )
  .join('');

// Tab navigation + scroll spy
tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  const target = $(`#cat-${btn.dataset.cat}`);
  window.scrollTo({ top: target.offsetTop - 70, behavior: 'smooth' });
});
const spy = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      tabs.querySelectorAll('.tab').forEach((t) => {
        const on = t.dataset.cat === en.target.dataset.cat;
        t.classList.toggle('active', on);
        if (on) t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      });
    });
  },
  { rootMargin: '-45% 0px -50% 0px' }
);
document.querySelectorAll('.cat').forEach((s) => spy.observe(s));

// Reveal on scroll
const revealer = new IntersectionObserver(
  (entries) =>
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        revealer.unobserve(en.target);
      }
    }),
  { threshold: 0.15 }
);
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 80}ms`;
  revealer.observe(el);
});

// 3D tilt on cards (pointer devices)
if (window.matchMedia('(hover: hover)').matches) {
  document.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${px * 14}deg) rotateX(${-py * 14}deg) translateZ(10px)`;
      card.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
      card.style.setProperty('--my', `${(py + 0.5) * 100}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.transform = '';
    });
  });
}

// ---------- Cart ----------
const STORAGE_KEY = 'burgerlab-cart';
let cart = {};
try {
  cart = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
} catch {
  cart = {};
}
const byId = Object.fromEntries(items.map((i) => [i.id, i]));

function saveCart() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  renderCart();
}
function changeQty(id, delta) {
  cart[id] = (cart[id] || 0) + delta;
  if (cart[id] <= 0) delete cart[id];
  saveCart();
}
function cartTotals() {
  let count = 0, sum = 0;
  for (const [id, q] of Object.entries(cart)) {
    if (!byId[id]) continue;
    count += q;
    sum += byId[id].price * q;
  }
  return { count, sum };
}

function renderCart() {
  const { count, sum } = cartTotals();
  $('#cartCount').textContent = count;
  $('#cartTotal').textContent = fmt(sum);
  $('#cartSum').textContent = fmt(sum);
  $('#cartFab').classList.toggle('show', count > 0);
  const entries = Object.entries(cart).filter(([id]) => byId[id]);
  $('#cartList').innerHTML = entries.length
    ? entries
        .map(([id, q]) => {
          const it = byId[id];
          return `<div class="cart-row">
            <span class="cart-emoji">${it.emoji}</span>
            <div class="cart-info"><b>${it.name}</b><small>${fmt(it.price)}</small></div>
            <div class="qty">
              <button data-dec="${id}">−</button><span>${q}</span><button data-inc="${id}">+</button>
            </div>
          </div>`;
        })
        .join('')
    : '<p class="empty">Корзина пуста — добавьте что-нибудь вкусное 🍔</p>';
  $('#orderBtn').disabled = entries.length === 0;
}
renderCart();

function bumpFab() {
  const fab = $('#cartFab');
  fab.classList.remove('bump');
  void fab.offsetWidth;
  fab.classList.add('bump');
}

// Emoji flies from the card into the cart button
function flyToCart(fromEl, emoji) {
  const from = fromEl.getBoundingClientRect();
  const to = $('#cartFab').getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'fly';
  fly.textContent = emoji;
  fly.style.left = `${from.left + from.width / 2}px`;
  fly.style.top = `${from.top + from.height / 2}px`;
  document.body.appendChild(fly);
  const dx = to.left + 30 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  fly
    .animate(
      [
        { transform: 'translate(-50%,-50%) scale(1) rotate(0)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 120}px)) scale(1.6) rotate(180deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.3) rotate(360deg)`, opacity: 0.6 },
      ],
      { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)' }
    )
    .finished.then(() => {
      fly.remove();
      bumpFab();
    });
}

function addItem(id, sourceEl) {
  const it = byId[id];
  const wasHidden = !$('#cartFab').classList.contains('show');
  changeQty(id, 1);
  if (sourceEl && !wasHidden) flyToCart(sourceEl, it.emoji);
  else bumpFab();
  if (navigator.vibrate) navigator.vibrate(15);
  toast(`${it.emoji} ${it.name} в корзине`);
}

// ---------- Sheets ----------
const backdrop = $('#backdrop');
let openSheetEl = null;
function openSheet(el) {
  closeSheet();
  openSheetEl = el;
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('open');
  document.body.classList.add('locked');
}
function closeSheet() {
  if (!openSheetEl) return;
  openSheetEl.classList.remove('open');
  openSheetEl.setAttribute('aria-hidden', 'true');
  openSheetEl = null;
  backdrop.classList.remove('open');
  document.body.classList.remove('locked');
}
backdrop.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());

function openItem(id) {
  const it = byId[id];
  $('#itemSheetBody').innerHTML = `
    <div class="detail-emoji"><span>${it.emoji}</span></div>
    <div class="card-tags">${tagsHtml(it.tags)}</div>
    <h2 class="detail-title">${it.name}</h2>
    <p class="detail-desc">${it.desc}</p>
    <div class="detail-meta"><span>⚖️ ${it.weight} ${it.cat === 'drinks' ? 'мл' : 'г'}</span><span>⚡ ${it.kcal} ккал</span></div>
    <button class="btn-primary" data-add="${it.id}">Добавить · ${fmt(it.price)}</button>`;
  openSheet($('#itemSheet'));
}

document.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) {
    e.stopPropagation();
    const card = add.closest('.card');
    addItem(add.dataset.add, card ? card.querySelector('.card-emoji') : add);
    add.classList.remove('pop');
    void add.offsetWidth;
    add.classList.add('pop');
    if (add.closest('#itemSheet')) setTimeout(closeSheet, 250);
    return;
  }
  const inc = e.target.closest('[data-inc]');
  if (inc) return changeQty(inc.dataset.inc, 1);
  const dec = e.target.closest('[data-dec]');
  if (dec) return changeQty(dec.dataset.dec, -1);
  const card = e.target.closest('.card');
  if (card) openItem(card.dataset.id);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList?.contains('card')) openItem(e.target.dataset.id);
});

$('#cartFab').addEventListener('click', () => openSheet($('#cartSheet')));

// No backend: the order is shown as a summary for the guest to present to the waiter.
$('#orderBtn').addEventListener('click', () => {
  const { sum } = cartTotals();
  const num = Math.floor(100 + Math.random() * 900);
  const lines = Object.entries(cart)
    .filter(([id]) => byId[id])
    .map(([id, q]) => `<li><span>${byId[id].emoji} ${byId[id].name} × ${q}</span><b>${fmt(byId[id].price * q)}</b></li>`)
    .join('');
  $('#itemSheetBody').innerHTML = `
    <div class="done">
      <div class="done-check">✓</div>
      <h2>Заказ №${num}</h2>
      <p>${table ? `Стол №${table}. ` : ''}Покажите этот экран официанту — и мы начнём готовить!</p>
      <ul class="done-list">${lines}</ul>
      <div class="row total"><span>Итого</span><b>${fmt(sum)}</b></div>
      <button class="btn-primary" id="newOrder">Готово</button>
    </div>`;
  openSheet($('#itemSheet'));
  confetti();
  $('#newOrder').addEventListener('click', () => {
    cart = {};
    saveCart();
    closeSheet();
  });
});

// ---------- FX helpers ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

function confetti() {
  const emojis = ['🍔', '🍟', '🔥', '🧀', '🥤', '✨'];
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.textContent = emojis[i % emojis.length];
    el.style.left = `${Math.random() * 100}vw`;
    document.body.appendChild(el);
    el.animate(
      [
        { transform: 'translateY(-10vh) rotate(0)', opacity: 1 },
        { transform: `translateY(110vh) rotate(${Math.random() * 720 - 360}deg)`, opacity: 0.8 },
      ],
      { duration: 1800 + Math.random() * 1400, delay: Math.random() * 400, easing: 'cubic-bezier(.3,.1,.6,1)' }
    ).finished.then(() => el.remove());
  }
}
