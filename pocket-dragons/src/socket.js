const handlers = new Map();
let ws;
let retry = 0;
let timer;

function emit(type, data) {
  for (const fn of handlers.get(type) || []) fn(data);
}

function open() {
  clearTimeout(timer);
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws = sock;
  sock.onopen = () => {
    retry = 0;
    emit('status', true);
  };
  sock.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    emit(msg.type, msg);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    emit('status', false);
    timer = setTimeout(open, Math.min(1000 * 2 ** retry++, 15000));
  };
}

export const socket = {
  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
  },
  connect: open,
  /** Reconnect so the server picks up a new session cookie. */
  reconnect() {
    const old = ws;
    ws = null;
    old?.close();
    retry = 0;
    open();
  },
  send(obj) {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(obj));
    return true;
  },
};
