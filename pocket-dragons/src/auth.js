import { api } from './api.js';
import { state, setUser, onUser } from './state.js';
import { h, avatar, toast, busy } from './dom.js';
import { ELEMENTS } from './config.js';
import { socket } from './socket.js';

let modal;
let card;
let lastFocus;
let email = '';
let resendTimer;

export function initAuth() {
  card = h('div', { class: 'modal-card' });
  modal = h(
    'div',
    { class: 'modal', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'authTitle' },
    h('div', { class: 'modal-backdrop', onclick: closeModal }),
    card,
  );
  document.body.append(modal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="join"]')) {
      e.preventDefault();
      requireMember();
    }
  });
  onUser(renderSlot);
}

/** Opens the right step if the visitor can't act as a member yet. */
export function requireMember() {
  if (!state.user) {
    openAuth();
    return false;
  }
  if (!state.user.nickname) {
    openProfile(true);
    return false;
  }
  return true;
}

function renderSlot(user) {
  const slot = document.getElementById('authSlot');
  document.body.classList.toggle('is-member', Boolean(user?.nickname));
  if (!user) {
    slot.replaceChildren(h('button', { class: 'btn btn-primary btn-sm', 'data-action': 'join' }, 'Join with email'));
    return;
  }
  slot.replaceChildren(
    h(
      'div',
      { class: 'user-chip' },
      h(
        'button',
        { class: 'chip-btn', title: 'Edit Keeper profile', onclick: () => openProfile(!user.nickname) },
        avatar(user, 30),
        h('span', {}, user.nickname || 'Finish profile'),
      ),
      h('button', { class: 'icon-btn', title: 'Log out', 'aria-label': 'Log out', onclick: logout }, '⏻'),
    ),
  );
}

function showModal() {
  if (modal.hidden) lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove('modal-open');
  clearInterval(resendTimer);
  lastFocus?.focus?.();
}

function render(icon, title, subtitle, ...content) {
  card.replaceChildren(
    h('button', { class: 'modal-close', onclick: closeModal, 'aria-label': 'Close' }, '×'),
    h('div', { class: 'modal-icon' }, icon),
    h('h2', { id: 'authTitle' }, title),
    subtitle && h('p', { class: 'modal-sub' }, subtitle),
    ...content,
  );
  requestAnimationFrame(() => card.querySelector('input')?.focus());
}

export function openAuth() {
  showModal();
  renderEmailStep();
}

function renderEmailStep() {
  const input = h('input', {
    type: 'email',
    name: 'email',
    required: true,
    placeholder: 'you@example.com',
    autocomplete: 'email',
    value: email,
  });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Send login code');
  const form = h(
    'form',
    {
      class: 'form',
      onsubmit: (e) => {
        e.preventDefault();
        err.textContent = '';
        busy(btn, async () => {
          try {
            email = input.value.trim();
            const res = await api('/auth/request-code', { method: 'POST', body: { email } });
            renderCodeStep(res.devCode);
          } catch (ex) {
            err.textContent = ex.message;
          }
        });
      },
    },
    h('label', { class: 'field' }, h('span', {}, 'Email'), input),
    err,
    btn,
    h('p', { class: 'form-hint' }, 'No password needed: we email you a 6-digit code. New here? The same code creates your Keeper account.'),
  );
  render('🥚', 'Join the Keepers', 'Sign in or register with your email', form);
}

function renderCodeStep(devCode) {
  const input = h('input', {
    class: 'code-input',
    name: 'code',
    inputmode: 'numeric',
    autocomplete: 'one-time-code',
    pattern: '\\d{6}',
    maxlength: '6',
    required: true,
    placeholder: '••••••',
    'aria-label': '6-digit code',
  });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Verify & enter');
  const resend = h('button', { class: 'link-btn', type: 'button' });
  const form = h(
    'form',
    {
      class: 'form',
      onsubmit: (e) => {
        e.preventDefault();
        err.textContent = '';
        busy(btn, async () => {
          try {
            const res = await api('/auth/verify', { method: 'POST', body: { email, code: input.value.trim() } });
            setUser(res.user);
            socket.reconnect();
            if (res.needsProfile) openProfile(true);
            else {
              closeModal();
              toast(`Welcome back, ${res.user.nickname}! 🐉`);
            }
          } catch (ex) {
            err.textContent = ex.message;
            input.select();
          }
        });
      },
    },
    input,
    devCode &&
      h('p', { class: 'dev-note' }, 'Dev mode: email sending is not configured, so here is your code: ', h('b', {}, devCode)),
    err,
    btn,
    h(
      'div',
      { class: 'form-row' },
      h('button', { class: 'link-btn', type: 'button', onclick: renderEmailStep }, '← Use another email'),
      resend,
    ),
  );
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value.length === 6) form.requestSubmit();
  });

  let left = 60;
  const tick = () => {
    resend.disabled = left > 0;
    resend.textContent = left > 0 ? `Resend in ${left}s` : 'Resend code';
    left -= 1;
    if (left < -1) clearInterval(resendTimer);
  };
  clearInterval(resendTimer);
  tick();
  resendTimer = setInterval(tick, 1000);
  resend.addEventListener('click', async () => {
    try {
      const res = await api('/auth/request-code', { method: 'POST', body: { email } });
      toast('New code sent');
      renderCodeStep(res.devCode);
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  render('✉️', 'Check your inbox', `We sent a 6-digit code to ${email}`, form);
}

export function openProfile(isNew = false) {
  if (!state.user) return openAuth();
  showModal();
  const u = state.user;
  const nickname = h('input', {
    name: 'nickname',
    required: true,
    minlength: '3',
    maxlength: '20',
    placeholder: 'e.g. EmberKeeper',
    autocomplete: 'nickname',
    value: u.nickname || '',
  });
  const xHandle = h('input', { name: 'xHandle', placeholder: '@yourhandle', maxlength: '40', value: u.xHandle ? `@${u.xHandle}` : '' });
  const current = u.element || 'fire';
  const elements = h(
    'div',
    { class: 'element-grid', role: 'radiogroup', 'aria-label': 'Dragon element' },
    Object.entries(ELEMENTS).map(([id, el]) =>
      h(
        'label',
        { class: 'element-opt', style: `--c:${el.color}` },
        h('input', { type: 'radio', name: 'element', value: id, checked: id === current }),
        h('span', { class: 'element-emoji' }, el.emoji),
        h('span', {}, el.label),
      ),
    ),
  );
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, isNew ? 'Hatch my profile' : 'Save profile');
  const form = h(
    'form',
    {
      class: 'form',
      onsubmit: (e) => {
        e.preventDefault();
        err.textContent = '';
        busy(btn, async () => {
          try {
            const res = await api('/me', {
              method: 'PUT',
              body: {
                nickname: nickname.value.trim(),
                xHandle: xHandle.value.trim(),
                element: form.querySelector('input[name="element"]:checked')?.value,
              },
            });
            setUser(res.user);
            socket.reconnect();
            closeModal();
            toast(isNew ? `Welcome to the Lair, ${res.user.nickname}! 🐉` : 'Profile saved');
          } catch (ex) {
            err.textContent = ex.message;
          }
        });
      },
    },
    h('label', { class: 'field' }, h('span', {}, 'Nickname'), nickname),
    h('label', { class: 'field' }, h('span', {}, 'X handle ', h('em', {}, '(optional)')), xHandle),
    h('div', { class: 'field' }, h('span', {}, 'Your dragon element'), elements),
    err,
    btn,
  );
  render(isNew ? '🐣' : '🐉', isNew ? 'Hatch your Keeper profile' : 'Keeper profile', isNew ? 'This is how other Keepers will see you' : u.email, form);
}

async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    setUser(null);
    socket.reconnect();
    toast('Logged out. See you soon, Keeper!');
  }
}
