import { ELEMENTS } from './config.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export const elementOf = (user) => ELEMENTS[user?.element] || ELEMENTS.fire;

export function avatar(user, size = 32) {
  const el = elementOf(user);
  const letter = (user?.nickname || '?').slice(0, 1).toUpperCase();
  return h(
    'span',
    { class: 'avatar', style: `--c:${el.color};--s:${size}px`, title: user?.nickname ? `${user.nickname} · ${el.label}` : '' },
    letter,
    h('i', { class: 'avatar-el' }, el.emoji),
  );
}

export function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const clock = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const URL_RE = /(https?:\/\/[^\s<>"]+)/g;
export function linkify(text) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 ? h('a', { href: part, target: '_blank', rel: 'noopener noreferrer nofollow' }, part) : part,
  );
}

export function toast(message, kind = 'ok') {
  const wrap = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  wrap.append(el);
  setTimeout(() => el.classList.add('is-out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

export async function busy(btn, fn) {
  btn.disabled = true;
  btn.classList.add('is-busy');
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.classList.remove('is-busy');
  }
}
