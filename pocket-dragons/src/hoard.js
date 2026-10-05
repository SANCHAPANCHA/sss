import { api } from './api.js';
import { state, onUser } from './state.js';
import { h, avatar, elementOf } from './dom.js';
import { socket } from './socket.js';
import { openProfile } from './auth.js';

let board, meCard, timer;
const MEDALS = ['🥇', '🥈', '🥉'];

export function initHoard() {
  board = document.querySelector('[data-hoard="board"]');
  meCard = document.querySelector('[data-hoard="me"]');
  onUser(() => {
    load();
    loadStats();
  });
  setInterval(load, 60_000);
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(load, 1500);
  };
  ['post', 'post-fires', 'post-deleted'].forEach((t) => socket.on(t, soon));

  setInterval(loadStats, 30_000);
  socket.on('message', () => bumpStat('messages'));
  socket.on('post', () => bumpStat('posts'));
  const online = ({ online: n }) => setStat('online', n);
  socket.on('hello', online);
  socket.on('presence', online);
}

const fmt = (n) => new Intl.NumberFormat(undefined, { notation: n > 9999 ? 'compact' : 'standard' }).format(n);

function setStat(name, value) {
  const el = document.querySelector(`[data-stat="${name}"]`);
  if (el) {
    el.dataset.value = value;
    el.textContent = fmt(value);
  }
}

function bumpStat(name) {
  const el = document.querySelector(`[data-stat="${name}"]`);
  if (el?.dataset.value) setStat(name, Number(el.dataset.value) + 1);
}

async function loadStats() {
  try {
    const s = await api('/stats');
    for (const k of ['members', 'posts', 'messages', 'online']) setStat(k, s[k]);
  } catch {
    /* stats are decorative */
  }
}

async function load() {
  try {
    const { top, me } = await api('/leaderboard');
    renderBoard(top);
    renderMe(me);
  } catch {
    /* keep previous render */
  }
}

function renderBoard(top) {
  if (!top.length) {
    board.replaceChildren(h('li', { class: 'board-empty' }, 'The hoard is empty. Share a post or say gm to claim the first spot!'));
    return;
  }
  board.replaceChildren(
    ...top.map((r) =>
      h(
        'li',
        { class: `board-row${r.user.id === state.user?.id ? ' is-me' : ''}${r.rank <= 3 ? ' is-podium' : ''}` },
        h('span', { class: 'board-rank' }, MEDALS[r.rank - 1] || `#${r.rank}`),
        avatar(r.user, 36),
        h(
          'div',
          { class: 'board-who' },
          h('strong', {}, r.user.nickname),
          r.user.xHandle
            ? h('a', { href: `https://x.com/${r.user.xHandle}`, target: '_blank', rel: 'noopener noreferrer' }, `@${r.user.xHandle}`)
            : h('span', {}, elementOf(r.user).label),
        ),
        h('div', { class: 'board-stats' }, h('span', { title: 'Posts shared' }, `🖼 ${r.posts}`), h('span', { title: 'Fires received' }, `🔥 ${r.fires}`)),
        h('b', { class: 'board-score' }, fmt(r.score)),
      ),
    ),
  );
}

function renderMe(me) {
  const u = state.user;
  if (!u?.nickname) {
    meCard.className = 'keeper-card is-guest';
    meCard.replaceChildren(
      h('div', { class: 'keeper-egg' }, '🥚'),
      h('h3', {}, 'Your Keeper card awaits'),
      h('p', { class: 'muted' }, 'Join to get your card, pick a dragon element and start climbing the hoard.'),
      h('button', { class: 'btn btn-primary', 'data-action': 'join' }, u ? 'Finish profile' : 'Join with email'),
    );
    return;
  }
  const el = elementOf(u);
  meCard.className = 'keeper-card';
  meCard.style.setProperty('--c', el.color);
  meCard.replaceChildren(
    h('div', { class: 'keeper-top' }, h('span', { class: 'keeper-label' }, 'Keeper card'), h('span', { class: 'keeper-el' }, `${el.emoji} ${el.label}`)),
    avatar(u, 76),
    h('h3', {}, u.nickname),
    u.xHandle
      ? h('a', { class: 'keeper-x', href: `https://x.com/${u.xHandle}`, target: '_blank', rel: 'noopener noreferrer' }, `@${u.xHandle}`)
      : h('span', { class: 'keeper-x muted' }, 'No X handle yet'),
    h(
      'div',
      { class: 'keeper-stats' },
      h('div', {}, h('b', {}, me ? `#${me.rank}` : '–'), h('span', {}, 'Rank')),
      h('div', {}, h('b', {}, me ? fmt(me.score) : '0'), h('span', {}, 'Score')),
      h('div', {}, h('b', {}, me ? me.posts : 0), h('span', {}, 'Posts')),
      h('div', {}, h('b', {}, me ? me.fires : 0), h('span', {}, 'Fires')),
    ),
    h('button', { class: 'btn btn-ghost btn-block', onclick: () => openProfile() }, 'Edit profile'),
  );
}
