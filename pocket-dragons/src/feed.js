import { api } from './api.js';
import { state, onUser } from './state.js';
import { h, avatar, timeAgo, toast, busy } from './dom.js';
import { CATEGORIES } from './config.js';
import { requireMember } from './auth.js';
import { socket } from './socket.js';
import { embedTweet } from './twitter.js';

const PAGE = 12;
const feed = { sort: 'new', category: 'all', offset: 0, loading: false, ids: new Set(), token: 0 };
let root, grid, moreBtn, emptyEl, formSlot, observer;

const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES.at(-1);
const matchesFilter = (post) => feed.sort === 'new' && (feed.category === 'all' || feed.category === post.category);

export function initFeed() {
  root = document.getElementById('content');
  grid = root.querySelector('.feed-grid');
  moreBtn = root.querySelector('.feed-more');
  emptyEl = root.querySelector('.feed-empty');
  formSlot = root.querySelector('[data-slot="submit"]');

  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        observer.unobserve(e.target);
        embedTweet(e.target);
      }
    },
    { rootMargin: '400px 0px' },
  );

  const chips = root.querySelector('[data-filter="category"]');
  chips.append(
    ...[{ id: 'all', label: 'All', emoji: '🌐' }, ...CATEGORIES].map((c) =>
      h('button', { class: `chip${c.id === 'all' ? ' is-on' : ''}`, role: 'tab', dataset: { category: c.id } }, `${c.emoji} ${c.label}`),
    ),
  );
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === btn));
    feed.category = btn.dataset.category;
    reload();
  });
  root.querySelector('.seg').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    root.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('is-on', b === btn));
    feed.sort = btn.dataset.sort;
    reload();
  });
  moreBtn.addEventListener('click', () => loadPage());

  onUser(() => {
    renderForm();
    reload();
  });

  socket.on('post', ({ post }) => {
    if (matchesFilter(post) && !feed.ids.has(post.id)) prepend(post);
  });
  socket.on('post-deleted', ({ id }) => {
    grid.querySelector(`[data-post="${id}"]`)?.remove();
    feed.ids.delete(id);
    updateEmpty();
  });
  socket.on('post-fires', ({ id, fires }) => {
    const count = grid.querySelector(`[data-post="${id}"] .fire-count`);
    if (count) count.textContent = String(fires);
  });
}

function prepend(post) {
  grid.prepend(renderCard(post));
  feed.offset += 1;
  updateEmpty();
}

function updateEmpty() {
  emptyEl.hidden = feed.loading || grid.children.length > 0;
}

function reload() {
  feed.token += 1;
  feed.offset = 0;
  feed.ids.clear();
  grid.replaceChildren(...Array.from({ length: 3 }, () => h('div', { class: 'post-card is-skeleton' })));
  loadPage(true);
}

async function loadPage(replace = false) {
  const token = feed.token;
  feed.loading = true;
  moreBtn.disabled = true;
  try {
    const params = new URLSearchParams({ sort: feed.sort, category: feed.category, offset: feed.offset, limit: PAGE });
    const { posts, hasMore } = await api(`/posts?${params}`);
    if (token !== feed.token) return;
    if (replace) grid.replaceChildren();
    for (const p of posts) if (!feed.ids.has(p.id)) grid.append(renderCard(p));
    feed.offset += posts.length;
    moreBtn.hidden = !hasMore;
  } catch (ex) {
    if (token !== feed.token) return;
    if (replace) grid.replaceChildren();
    toast(ex.message, 'error');
  } finally {
    if (token === feed.token) {
      feed.loading = false;
      moreBtn.disabled = false;
      updateEmpty();
    }
  }
}

function renderForm() {
  const u = state.user;
  if (!u?.nickname) {
    formSlot.replaceChildren(
      h(
        'div',
        { class: 'submit-locked' },
        h('span', { class: 'lock-ico' }, '🔒'),
        h('p', {}, u ? 'Finish your Keeper profile to share your posts.' : 'Join with email to share your Pocket Dragons posts from X.'),
        h('button', { class: 'btn btn-primary btn-sm', 'data-action': 'join' }, u ? 'Finish profile' : 'Join'),
      ),
    );
    return;
  }
  const url = h('input', { type: 'url', required: true, placeholder: 'Paste your post link: https://x.com/you/status/…', 'aria-label': 'Link to your X post' });
  const category = h('select', { 'aria-label': 'Category' }, CATEGORIES.map((c) => h('option', { value: c.id }, `${c.emoji} ${c.label}`)));
  const note = h('input', { type: 'text', maxlength: '280', placeholder: 'Add a note for the Keepers (optional)', 'aria-label': 'Note' });
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Share 🔥');
  const err = h('p', { class: 'form-error', role: 'alert' });
  const form = h(
    'form',
    {
      class: 'submit-form',
      onsubmit: (e) => {
        e.preventDefault();
        err.textContent = '';
        busy(btn, async () => {
          try {
            const { post } = await api('/posts', {
              method: 'POST',
              body: { url: url.value.trim(), category: category.value, note: note.value.trim() },
            });
            form.reset();
            toast('Shared with the Keepers! 🔥');
            if (matchesFilter(post) && !feed.ids.has(post.id)) prepend(post);
          } catch (ex) {
            err.textContent = ex.message;
          }
        });
      },
    },
    h('div', { class: 'submit-row' }, url, category, btn),
    note,
    err,
  );
  formSlot.replaceChildren(form);
}

function renderCard(post) {
  feed.ids.add(post.id);
  const cat = catOf(post.category);
  const me = state.user;
  const canDelete = me && (me.id === post.user.id || me.isAdmin);
  const fireBtn = h(
    'button',
    { class: `fire-btn${post.fired ? ' is-on' : ''}`, 'aria-pressed': String(post.fired), title: 'Give fire' },
    h('span', { class: 'fire-ico' }, '🔥'),
    h('span', { class: 'fire-count' }, String(post.fires)),
  );
  fireBtn.addEventListener('click', () => toggleFire(post, fireBtn));
  const slot = h(
    'div',
    { class: 'tweet-slot', dataset: { tweetId: post.tweetId, url: post.url } },
    h('div', { class: 'tweet-skeleton' }, h('span'), h('span'), h('span')),
  );
  const card = h(
    'article',
    { class: 'post-card', dataset: { post: post.id } },
    h(
      'header',
      { class: 'post-head' },
      avatar(post.user, 36),
      h(
        'div',
        { class: 'post-meta' },
        h('strong', {}, post.user.nickname),
        h('span', {}, timeAgo(post.createdAt)),
      ),
      h('span', { class: 'cat-badge' }, `${cat.emoji} ${cat.label}`),
      canDelete && h('button', { class: 'icon-btn icon-danger', title: 'Remove post', 'aria-label': 'Remove post', onclick: () => removePost(post) }, '×'),
    ),
    post.note && h('p', { class: 'post-note' }, post.note),
    slot,
    h(
      'footer',
      { class: 'post-foot' },
      fireBtn,
      h('a', { class: 'post-link', href: post.url, target: '_blank', rel: 'noopener noreferrer' }, post.xAuthor ? `@${post.xAuthor} on 𝕏 ↗` : 'Open on 𝕏 ↗'),
    ),
  );
  observer.observe(slot);
  return card;
}

async function toggleFire(post, btn) {
  if (!requireMember()) return;
  try {
    const { fires, fired } = await api(`/posts/${post.id}/fire`, { method: 'POST' });
    btn.classList.toggle('is-on', fired);
    btn.setAttribute('aria-pressed', String(fired));
    btn.querySelector('.fire-count').textContent = String(fires);
    if (fired) {
      btn.classList.remove('pop');
      void btn.offsetWidth;
      btn.classList.add('pop');
    }
  } catch (ex) {
    toast(ex.message, 'error');
  }
}

async function removePost(post) {
  if (!confirm('Remove this post from the Lair?')) return;
  try {
    await api(`/posts/${post.id}`, { method: 'DELETE' });
    grid.querySelector(`[data-post="${post.id}"]`)?.remove();
    feed.ids.delete(post.id);
    updateEmpty();
  } catch (ex) {
    toast(ex.message, 'error');
  }
}
