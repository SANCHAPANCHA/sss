const listeners = new Set();

export const state = { user: null };

export function setUser(user) {
  state.user = user;
  for (const fn of listeners) fn(user);
}

export function onUser(fn) {
  listeners.add(fn);
}
