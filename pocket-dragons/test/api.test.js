import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { openDb } from '../server/db.js';
import { createApp, parseTweetUrl, normalizeXHandle } from '../server/app.js';

let server;
let base;
const sent = [];

before(async () => {
  const { app, attach } = createApp({
    db: openDb(':memory:'),
    sendMail: async ({ to, code }) => {
      sent.push({ to, code });
      return {};
    },
    config: { adminEmails: ['admin@example.com'], codeRequestsPerHour: 1000, verifyPerHour: 1000 },
    lookupTweet: async (url) => (url.includes('/999999') ? { exists: false } : { exists: true, handle: null }),
  });
  server = http.createServer(app);
  attach(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

async function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
}

async function login(email, nickname) {
  const req = await call('/api/auth/request-code', { method: 'POST', body: { email } });
  assert.equal(req.status, 200);
  const { code } = sent.findLast((s) => s.to === email);
  const verify = await call('/api/auth/verify', { method: 'POST', body: { email, code } });
  assert.equal(verify.status, 200);
  const cookie = verify.headers.get('set-cookie').split(';')[0];
  if (nickname) {
    const r = await call('/api/me', { method: 'PUT', cookie, body: { nickname, element: 'water', xHandle: '@keeper_x' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  return { cookie, verify };
}

function openSocket(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws`, cookie ? { headers: { cookie } } : {});
    const inbox = [];
    ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
    ws.once('open', () => resolve({ ws, inbox }));
    ws.once('error', reject);
  });
}

const waitFor = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out');
};

test('parses X status links', () => {
  assert.deepEqual(parseTweetUrl('https://x.com/Pocket_Dragons_/status/1234567890?s=20'), {
    id: '1234567890',
    author: 'Pocket_Dragons_',
    url: 'https://x.com/Pocket_Dragons_/status/1234567890',
  });
  assert.equal(parseTweetUrl('https://twitter.com/i/web/status/1234567890').url, 'https://x.com/i/status/1234567890');
  assert.equal(parseTweetUrl('https://evil.com/x.com/a/status/1234567890'), null);
  assert.equal(parseTweetUrl('javascript:alert(1)'), null);
  assert.equal(normalizeXHandle('https://x.com/djsamwithers'), 'djsamwithers');
  assert.equal(normalizeXHandle('@bad handle'), null);
});

test('email code login, profile and logout', async () => {
  assert.equal((await call('/api/auth/request-code', { method: 'POST', body: { email: 'nope' } })).status, 400);

  await call('/api/auth/request-code', { method: 'POST', body: { email: 'Keeper@Example.com' } });
  const again = await call('/api/auth/request-code', { method: 'POST', body: { email: 'keeper@example.com' } });
  assert.equal(again.status, 429, 'cooldown between codes');

  const bad = await call('/api/auth/verify', { method: 'POST', body: { email: 'keeper@example.com', code: '000000' } });
  const { code } = sent.findLast((s) => s.to === 'keeper@example.com');
  if (code !== '000000') assert.equal(bad.status, 400);

  const ok = await call('/api/auth/verify', { method: 'POST', body: { email: 'keeper@example.com', code } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.needsProfile, true);
  const setCookie = ok.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  const cookie = setCookie.split(';')[0];

  const reuse = await call('/api/auth/verify', { method: 'POST', body: { email: 'keeper@example.com', code } });
  assert.equal(reuse.status, 400, 'codes are single use');

  const me = await call('/api/me', { cookie });
  assert.equal(me.data.user.email, 'keeper@example.com');

  assert.equal((await call('/api/me', { method: 'PUT', cookie, body: { nickname: 'x' } })).status, 400);
  const saved = await call('/api/me', { method: 'PUT', cookie, body: { nickname: 'Ember', xHandle: 'x.com/ember', element: 'fire' } });
  assert.equal(saved.data.user.nickname, 'Ember');
  assert.equal(saved.data.user.xHandle, 'ember');

  const other = await login('other@example.com');
  const taken = await call('/api/me', { method: 'PUT', cookie: other.cookie, body: { nickname: 'ember', element: 'air' } });
  assert.equal(taken.status, 409);

  await call('/api/auth/logout', { method: 'POST', cookie });
  assert.equal((await call('/api/me', { cookie })).data.user, null);
});

test('wrong codes are limited', async () => {
  const email = 'brute@example.com';
  await call('/api/auth/request-code', { method: 'POST', body: { email } });
  const { code } = sent.findLast((s) => s.to === email);
  const wrong = code === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) await call('/api/auth/verify', { method: 'POST', body: { email, code: wrong } });
  const r = await call('/api/auth/verify', { method: 'POST', body: { email, code } });
  assert.equal(r.status, 429);
});

test('sharing X posts, fires, leaderboard and moderation', async () => {
  const alice = await login('alice@example.com', 'alice');
  const bob = await login('bob@example.com', 'bob');
  const admin = await login('admin@example.com', 'admin');

  const guest = await call('/api/posts', { method: 'POST', body: { url: 'https://x.com/a/status/1111111' } });
  assert.equal(guest.status, 401);

  const invalid = await call('/api/posts', { method: 'POST', cookie: alice.cookie, body: { url: 'https://example.com' } });
  assert.equal(invalid.status, 400);

  const missing = await call('/api/posts', { method: 'POST', cookie: alice.cookie, body: { url: 'https://x.com/a/status/999999' } });
  assert.equal(missing.status, 400);

  const created = await call('/api/posts', {
    method: 'POST',
    cookie: alice.cookie,
    body: { url: 'https://twitter.com/alice_x/status/1111111?s=20', category: 'art', note: 'My first dragon' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.post.url, 'https://x.com/alice_x/status/1111111');

  const dup = await call('/api/posts', { method: 'POST', cookie: bob.cookie, body: { url: 'https://x.com/alice_x/status/1111111' } });
  assert.equal(dup.status, 409);

  const id = created.data.post.id;
  const fire = await call(`/api/posts/${id}/fire`, { method: 'POST', cookie: bob.cookie });
  assert.deepEqual(fire.data, { fires: 1, fired: true });

  const list = await call('/api/posts?category=art', { cookie: bob.cookie });
  assert.equal(list.data.posts[0].fired, true);
  assert.equal((await call('/api/posts?category=meme')).data.posts.length, 0);

  const board = await call('/api/leaderboard', { cookie: alice.cookie });
  assert.equal(board.data.top[0].user.nickname, 'alice');
  assert.equal(board.data.me.score, 15);

  assert.equal((await call(`/api/posts/${id}`, { method: 'DELETE', cookie: bob.cookie })).status, 403);
  assert.equal((await call(`/api/posts/${id}`, { method: 'DELETE', cookie: admin.cookie })).status, 200);
});

test('cross-origin writes are rejected', async () => {
  const r = await call('/api/auth/request-code', {
    method: 'POST',
    body: { email: 'csrf@example.com' },
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(r.status, 403);
});

test('realtime chat over websocket', async () => {
  const carol = await login('carol@example.com', 'carol');
  const member = await openSocket(carol.cookie);
  const guest = await openSocket();

  await waitFor(() => guest.inbox.find((m) => m.type === 'hello'));
  guest.ws.send(JSON.stringify({ type: 'send', channel: 'general', body: 'hi' }));
  const err = await waitFor(() => guest.inbox.find((m) => m.type === 'error'));
  assert.match(err.error, /Join/);

  member.ws.send(JSON.stringify({ type: 'send', channel: 'hatchery', body: '  gm Keepers 🐉  ' }));
  const got = await waitFor(() => guest.inbox.find((m) => m.type === 'message'));
  assert.equal(got.message.body, 'gm Keepers 🐉');
  assert.equal(got.message.user.nickname, 'carol');

  const history = await call('/api/messages?channel=hatchery');
  assert.equal(history.data.messages.at(-1).body, 'gm Keepers 🐉');

  const del = await call(`/api/messages/${got.message.id}`, { method: 'DELETE', cookie: carol.cookie });
  assert.equal(del.status, 200);
  await waitFor(() => guest.inbox.find((m) => m.type === 'deleted'));

  member.ws.close();
  guest.ws.close();
});
