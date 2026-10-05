import { api } from './api.js';
import { state, onUser } from './state.js';
import { h, avatar, clock, linkify, elementOf, toast } from './dom.js';
import { CHANNELS } from './config.js';
import { socket } from './socket.js';

const GROUP_MS = 5 * 60 * 1000;
const chat = { channel: 'general', messages: [], hasMore: false, token: 0 };
let list, tabs, composer, topic, onlineEl, membersEl, statusEl, input;

export function initChat() {
  const root = document.getElementById('chat');
  const $ = (name) => root.querySelector(`[data-chat="${name}"]`);
  list = $('list');
  composer = $('composer');
  topic = $('topic');
  onlineEl = $('online');
  membersEl = $('members');
  statusEl = $('status');
  tabs = root.querySelector('.chat-tabs');

  tabs.append(
    ...CHANNELS.map((c) =>
      h('button', { class: 'chat-tab', role: 'tab', dataset: { channel: c.id } }, `#${c.id}`, h('i', { class: 'unread' })),
    ),
  );
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-channel]');
    if (btn && btn.dataset.channel !== chat.channel) loadChannel(btn.dataset.channel);
  });

  socket.on('message', ({ message }) => {
    if (message.channel === chat.channel) append(message);
    else tabs.querySelector(`[data-channel="${message.channel}"]`)?.classList.add('has-unread');
  });
  socket.on('deleted', ({ id }) => {
    chat.messages = chat.messages.filter((m) => m.id !== id);
    list.querySelector(`[data-msg="${id}"]`)?.remove();
  });
  socket.on('hello', renderPresence);
  socket.on('presence', renderPresence);
  socket.on('status', (ok) => {
    statusEl.hidden = ok;
  });
  socket.on('error', ({ error }) => toast(error, 'error'));

  onUser((user) => {
    renderComposer(user);
    loadChannel(chat.channel);
  });
}

function renderPresence({ online, members = [] }) {
  onlineEl.textContent = String(online);
  const shown = members.slice(0, 8);
  membersEl.replaceChildren(
    ...shown.map((m) => avatar(m, 26)),
    members.length > shown.length ? h('span', { class: 'members-more' }, `+${members.length - shown.length}`) : '',
  );
  membersEl.hidden = members.length === 0;
}

async function loadChannel(channel) {
  chat.channel = channel;
  const token = ++chat.token;
  const info = CHANNELS.find((c) => c.id === channel);
  topic.textContent = info?.topic || '';
  tabs.querySelectorAll('.chat-tab').forEach((t) => {
    const on = t.dataset.channel === channel;
    t.classList.toggle('is-on', on);
    t.setAttribute('aria-selected', String(on));
    if (on) t.classList.remove('has-unread');
  });
  if (input) input.placeholder = `Message #${channel}`;
  list.replaceChildren(h('div', { class: 'chat-loading' }, 'Loading messages…'));
  try {
    const { messages, hasMore } = await api(`/messages?channel=${encodeURIComponent(channel)}`);
    if (token !== chat.token) return;
    chat.messages = messages;
    chat.hasMore = hasMore;
    renderAll();
    list.scrollTop = list.scrollHeight;
  } catch (ex) {
    if (token === chat.token) list.replaceChildren(h('div', { class: 'chat-loading' }, ex.message));
  }
}

async function loadOlder(btn) {
  const token = chat.token;
  btn.disabled = true;
  try {
    const { messages, hasMore } = await api(
      `/messages?channel=${encodeURIComponent(chat.channel)}&before=${chat.messages[0].id}`,
    );
    if (token !== chat.token) return;
    const prevHeight = list.scrollHeight;
    chat.messages = [...messages, ...chat.messages];
    chat.hasMore = hasMore;
    renderAll();
    list.scrollTop = list.scrollHeight - prevHeight;
  } catch (ex) {
    toast(ex.message, 'error');
    btn.disabled = false;
  }
}

function renderAll() {
  if (!chat.messages.length) {
    list.replaceChildren(
      h('div', { class: 'chat-empty' }, h('div', { class: 'empty-egg' }, '💬'), h('p', {}, `No messages in #${chat.channel} yet. Say gm!`)),
    );
    return;
  }
  const nodes = chat.messages.map((m, i) => renderMessage(m, chat.messages[i - 1]));
  if (chat.hasMore) {
    const btn = h('button', { class: 'link-btn chat-older' }, 'Load older messages');
    btn.addEventListener('click', () => loadOlder(btn));
    nodes.unshift(btn);
  }
  list.replaceChildren(...nodes);
}

function append(message) {
  if (chat.messages.some((m) => m.id === message.id)) return;
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  const prev = chat.messages.at(-1);
  chat.messages.push(message);
  if (chat.messages.length === 1) list.replaceChildren();
  list.append(renderMessage(message, prev));
  if (nearBottom || message.user.id === state.user?.id) list.scrollTop = list.scrollHeight;
}

function renderMessage(m, prev) {
  const grouped = prev && prev.user.id === m.user.id && m.createdAt - prev.createdAt < GROUP_MS;
  const me = state.user;
  const mine = me?.id === m.user.id;
  const canDelete = me && (mine || me.isAdmin);
  return h(
    'div',
    { class: `msg${grouped ? ' is-grouped' : ''}${mine ? ' is-mine' : ''}`, dataset: { msg: m.id } },
    grouped ? h('span', { class: 'msg-gutter' }) : avatar(m.user, 34),
    h(
      'div',
      { class: 'msg-main' },
      !grouped &&
        h(
          'div',
          { class: 'msg-head' },
          h('strong', { style: `color:${elementOf(m.user).color}` }, m.user.nickname),
          m.user.xHandle &&
            h('a', { class: 'msg-x', href: `https://x.com/${m.user.xHandle}`, target: '_blank', rel: 'noopener noreferrer' }, `@${m.user.xHandle}`),
          h('time', { datetime: new Date(m.createdAt).toISOString(), title: new Date(m.createdAt).toLocaleString() }, clock(m.createdAt)),
        ),
      h('p', { class: 'msg-body' }, linkify(m.body)),
    ),
    canDelete && h('button', { class: 'msg-del', title: 'Delete message', 'aria-label': 'Delete message', onclick: () => remove(m.id) }, '×'),
  );
}

async function remove(id) {
  try {
    await api(`/messages/${id}`, { method: 'DELETE' });
  } catch (ex) {
    toast(ex.message, 'error');
  }
}

function renderComposer(user) {
  input = null;
  if (!user?.nickname) {
    composer.replaceChildren(
      h(
        'div',
        { class: 'chat-locked' },
        h('span', {}, user ? 'Finish your Keeper profile to chat' : 'Reading as a guest — join to chat'),
        h('button', { class: 'btn btn-primary btn-sm', 'data-action': 'join' }, user ? 'Finish profile' : 'Join'),
      ),
    );
    return;
  }
  input = h('input', { maxlength: '500', placeholder: `Message #${chat.channel}`, autocomplete: 'off', 'aria-label': 'Message' });
  const form = h(
    'form',
    {
      class: 'chat-form',
      onsubmit: (e) => {
        e.preventDefault();
        const body = input.value.trim();
        if (!body) return;
        if (socket.send({ type: 'send', channel: chat.channel, body })) input.value = '';
        else toast('Reconnecting to chat, try again in a moment', 'error');
      },
    },
    input,
    h('button', { class: 'btn btn-primary btn-send', type: 'submit', 'aria-label': 'Send' }, '➤'),
  );
  composer.replaceChildren(form);
}
