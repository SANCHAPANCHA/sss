import express from 'express';
import { WebSocketServer } from 'ws';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const CHANNELS = ['general', 'hatchery', 'fan-art', 'off-topic'];
export const CATEGORIES = ['art', 'meme', 'guide', 'lore', 'video', 'other'];
export const ELEMENTS = ['fire', 'water', 'earth', 'air', 'shadow', 'light'];

const SESSION_COOKIE = 'pd_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_MESSAGE_LEN = 500;
const MAX_NOTE_LEN = 280;
const HISTORY_PAGE = 50;

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const NICK_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const TWEET_RE =
  /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:([A-Za-z0-9_]{1,15})|i(?:\/web)?)\/status(?:es)?\/(\d{5,25})(?:[/?#].*)?$/i;

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const now = () => Date.now();

export function parseTweetUrl(input) {
  const m = TWEET_RE.exec(String(input ?? '').trim());
  if (!m) return null;
  const author = m[1] && m[1].toLowerCase() !== 'i' ? m[1] : null;
  const id = m[2];
  return { id, author, url: author ? `https://x.com/${author}/status/${id}` : `https://x.com/i/status/${id}` };
}

/** Returns '' for empty input, null for an invalid handle. */
export function normalizeXHandle(input) {
  let s = String(input ?? '').trim();
  if (!s) return '';
  s = s
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];
  return X_HANDLE_RE.test(s) ? s : null;
}

async function defaultTweetLookup(url) {
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.status === 404 || res.status === 403) return { exists: false };
    if (!res.ok) return { exists: null };
    const data = await res.json();
    const handle = /(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i.exec(data.author_url || '')?.[1] ?? null;
    return { exists: true, handle };
  } catch {
    // X is unreachable or rate limiting: accept the link rather than block the user.
    return { exists: null };
  }
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

function rateLimiter(max, windowMs) {
  const hits = new Map();
  const sweep = setInterval(() => {
    const t = now();
    for (const [k, arr] of hits) if (!arr.some((x) => t - x < windowMs)) hits.delete(k);
  }, windowMs);
  sweep.unref();
  return (key) => {
    const t = now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    const ok = arr.length < max;
    if (ok) arr.push(t);
    hits.set(key, arr);
    return ok;
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const MSG_SELECT = `SELECT m.id, m.channel, m.body, m.created_at,
  u.id AS user_id, u.nickname, u.element, u.x_handle
  FROM messages m JOIN users u ON u.id = m.user_id`;

const POST_SELECT = `SELECT p.id, p.tweet_id, p.tweet_url, p.x_author, p.category, p.note, p.created_at,
  u.id AS user_id, u.nickname, u.element, u.x_handle,
  (SELECT COUNT(*) FROM post_fires f WHERE f.post_id = p.id) AS fires,
  EXISTS (SELECT 1 FROM post_fires f WHERE f.post_id = p.id AND f.user_id = $viewer) AS fired
  FROM posts p JOIN users u ON u.id = p.user_id`;

// Community score: posts and fires from others weigh most; chat is capped so spam doesn't pay.
const LEADERBOARD_SQL = `SELECT * FROM (
  SELECT u.id AS user_id, u.nickname, u.element, u.x_handle,
    (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) AS posts,
    (SELECT COUNT(*) FROM post_fires f JOIN posts p ON p.id = f.post_id
       WHERE p.user_id = u.id AND f.user_id <> u.id) AS fires,
    (SELECT COUNT(*) FROM messages m WHERE m.user_id = u.id) AS messages
  FROM users u WHERE u.nickname IS NOT NULL
) ORDER BY (posts * 10 + fires * 5 + MIN(messages, 300) / 5) DESC, fires DESC, user_id ASC`;

const toUser = (row) => ({ id: row.user_id, nickname: row.nickname, element: row.element, xHandle: row.x_handle || null });

const serializeMessage = (row) => ({
  id: row.id,
  channel: row.channel,
  body: row.body,
  createdAt: row.created_at,
  user: toUser(row),
});

const serializePost = (row) => ({
  id: row.id,
  tweetId: row.tweet_id,
  url: row.tweet_url,
  xAuthor: row.x_author,
  category: row.category,
  note: row.note,
  createdAt: row.created_at,
  fires: row.fires,
  fired: Boolean(row.fired),
  user: toUser(row),
});

export function createApp({ db, sendMail, config = {}, lookupTweet = defaultTweetLookup }) {
  const adminEmails = new Set((config.adminEmails || []).map((e) => e.toLowerCase()));
  const allowedOrigins = config.allowedOrigins || [];

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    insertUser: db.prepare('INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)'),
    updateProfile: db.prepare('UPDATE users SET nickname = ?, x_handle = ?, element = ? WHERE id = ?'),
    getCode: db.prepare('SELECT * FROM login_codes WHERE email = ?'),
    putCode: db.prepare(`INSERT INTO login_codes (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
      attempts = 0, sent_at = excluded.sent_at`),
    bumpAttempts: db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?'),
    deleteCode: db.prepare('DELETE FROM login_codes WHERE email = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionUser: db.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    purgeCodes: db.prepare('DELETE FROM login_codes WHERE expires_at <= ?'),

    insertMessage: db.prepare('INSERT INTO messages (channel, user_id, body, created_at) VALUES (?, ?, ?, ?)'),
    messageById: db.prepare(`${MSG_SELECT} WHERE m.id = ?`),
    latestMessages: db.prepare(`${MSG_SELECT} WHERE m.channel = ? ORDER BY m.id DESC LIMIT ${HISTORY_PAGE}`),
    olderMessages: db.prepare(
      `${MSG_SELECT} WHERE m.channel = ? AND m.id < ? ORDER BY m.id DESC LIMIT ${HISTORY_PAGE}`,
    ),
    deleteMessage: db.prepare('DELETE FROM messages WHERE id = ?'),

    insertPost: db.prepare(
      'INSERT INTO posts (user_id, tweet_id, tweet_url, x_author, category, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    postByTweet: db.prepare('SELECT id FROM posts WHERE tweet_id = ?'),
    postById: db.prepare(`${POST_SELECT} WHERE p.id = $id`),
    postsNew: db.prepare(
      `${POST_SELECT} WHERE ($category = 'all' OR p.category = $category) ORDER BY p.id DESC LIMIT $limit OFFSET $offset`,
    ),
    postsTop: db.prepare(
      `${POST_SELECT} WHERE ($category = 'all' OR p.category = $category) ORDER BY fires DESC, p.id DESC LIMIT $limit OFFSET $offset`,
    ),
    deletePost: db.prepare('DELETE FROM posts WHERE id = ?'),
    addFire: db.prepare('INSERT OR IGNORE INTO post_fires (post_id, user_id, created_at) VALUES (?, ?, ?)'),
    removeFire: db.prepare('DELETE FROM post_fires WHERE post_id = ? AND user_id = ?'),
    fireCount: db.prepare('SELECT COUNT(*) AS n FROM post_fires WHERE post_id = ?'),

    leaderboard: db.prepare(LEADERBOARD_SQL),
    stats: db.prepare(`SELECT
      (SELECT COUNT(*) FROM users WHERE nickname IS NOT NULL) AS members,
      (SELECT COUNT(*) FROM posts) AS posts,
      (SELECT COUNT(*) FROM messages) AS messages`),
  };

  const isAdmin = (user) => Boolean(user && adminEmails.has(user.email));
  const publicUser = (u) => ({ id: u.id, nickname: u.nickname, element: u.element, xHandle: u.x_handle || null });
  const meJson = (u) => (u ? { ...publicUser(u), email: u.email, isAdmin: isAdmin(u) } : null);

  function userFromRequest(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    return q.sessionUser.get(sha256(token), now()) || null;
  }

  function isSameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (allowedOrigins.includes(origin)) return true;
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      return false;
    }
    const hosts = [req.headers.host, ...String(req.headers['x-forwarded-host'] || '').split(',')]
      .map((s) => s && s.trim())
      .filter(Boolean);
    return hosts.includes(host);
  }

  function setSessionCookie(res, token, maxAgeMs) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: Boolean(config.secureCookies),
      maxAge: maxAgeMs,
      path: '/',
    });
  }

  const codeIpLimit = rateLimiter(config.codeRequestsPerHour ?? 20, 60 * 60 * 1000);
  const verifyIpLimit = rateLimiter(config.verifyPerHour ?? 60, 60 * 60 * 1000);
  const postLimit = rateLimiter(10, 60 * 60 * 1000);
  const msgBurst = rateLimiter(8, 10 * 1000);

  const housekeeping = setInterval(() => {
    q.purgeSessions.run(now());
    q.purgeCodes.run(now());
  }, 60 * 60 * 1000);
  housekeeping.unref();

  // ---- realtime hub ----
  const clients = new Set();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const c of clients) if (c.ws.readyState === 1) c.ws.send(data);
  }

  function presence() {
    const members = new Map();
    let guests = 0;
    for (const c of clients) {
      if (c.user?.nickname) members.set(c.user.id, publicUser(c.user));
      else guests += 1;
    }
    return { online: members.size + guests, members: [...members.values()].slice(0, 40) };
  }

  let presenceTimer;
  function schedulePresence() {
    clearTimeout(presenceTimer);
    presenceTimer = setTimeout(() => broadcast({ type: 'presence', ...presence() }), 250);
  }

  function handleSocketMessage(client, raw) {
    const fail = (error) => client.ws.send(JSON.stringify({ type: 'error', error }));
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return fail('Malformed message');
    }
    if (msg?.type !== 'send') return;
    // Re-read the user so profile edits and deletions take effect without reconnecting.
    const user = client.user && q.userById.get(client.user.id);
    if (!user) return fail('Join with email to chat');
    if (!user.nickname) return fail('Finish your Keeper profile to chat');
    if (!CHANNELS.includes(msg.channel)) return fail('Unknown channel');
    const body = String(msg.body ?? '').trim();
    if (!body) return;
    if (body.length > MAX_MESSAGE_LEN) return fail(`Messages are limited to ${MAX_MESSAGE_LEN} characters`);
    if (!msgBurst(user.id)) return fail('Slow down a little 🐢');
    const { lastInsertRowid } = q.insertMessage.run(msg.channel, user.id, body, now());
    broadcast({ type: 'message', message: serializeMessage(q.messageById.get(lastInsertRowid)) });
  }

  wss.on('connection', (ws, req, user) => {
    const client = { ws, user, alive: true };
    clients.add(client);
    ws.send(JSON.stringify({ type: 'hello', user: user ? publicUser(user) : null, ...presence() }));
    schedulePresence();
    ws.on('pong', () => {
      client.alive = true;
    });
    ws.on('message', (raw) => handleSocketMessage(client, raw));
    ws.on('close', () => {
      clients.delete(client);
      schedulePresence();
    });
    ws.on('error', () => {});
  });

  // ---- HTTP API ----
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ?? 'loopback, linklocal, uniquelocal');
  app.use('/api', express.json({ limit: '16kb' }));

  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !isSameOrigin(req)) {
      return res.status(403).json({ error: 'Cross-origin request blocked' });
    }
    req.user = userFromRequest(req);
    next();
  });

  const requireUser = (req) => {
    if (!req.user) throw new HttpError(401, 'Join with email first');
    return req.user;
  };
  const requireMember = (req) => {
    const user = requireUser(req);
    if (!user.nickname) throw new HttpError(403, 'Finish your Keeper profile first');
    return user;
  };

  app.post('/api/auth/request-code', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address');
    const existing = q.getCode.get(email);
    if (existing && now() - existing.sent_at < CODE_COOLDOWN_MS) {
      const retryIn = Math.ceil((CODE_COOLDOWN_MS - (now() - existing.sent_at)) / 1000);
      return res.status(429).json({ error: `Please wait ${retryIn}s before requesting a new code`, retryIn });
    }
    if (!codeIpLimit(req.ip)) throw new HttpError(429, 'Too many code requests, try again later');

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    q.putCode.run(email, sha256(`${email}:${code}`), now() + CODE_TTL_MS, now());
    let result;
    try {
      result = (await sendMail({ to: email, code })) || {};
    } catch (err) {
      console.error('[mail] send failed:', err.message);
      q.deleteCode.run(email);
      throw new HttpError(502, 'Could not send the email, please try again');
    }
    res.json({ ok: true, ...(result.devCode ? { devCode: result.devCode } : {}) });
  });

  app.post('/api/auth/verify', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '').trim();
    if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'The code has 6 digits');
    if (!verifyIpLimit(req.ip)) throw new HttpError(429, 'Too many attempts, try again later');
    const row = q.getCode.get(email);
    if (!row || row.expires_at < now()) throw new HttpError(400, 'The code has expired, request a new one');
    if (row.attempts >= MAX_CODE_ATTEMPTS) throw new HttpError(429, 'Too many wrong attempts, request a new code');
    const ok = timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(sha256(`${email}:${code}`), 'hex'));
    if (!ok) {
      q.bumpAttempts.run(email);
      throw new HttpError(400, 'Wrong code');
    }
    q.deleteCode.run(email);
    q.insertUser.run(email, now());
    const user = q.userByEmail.get(email);
    const token = randomBytes(32).toString('base64url');
    q.insertSession.run(sha256(token), user.id, now() + SESSION_TTL_MS);
    setSessionCookie(res, token, SESSION_TTL_MS);
    res.json({ user: meJson(user), needsProfile: !user.nickname });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) q.deleteSession.run(sha256(token));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/me', (req, res) => res.json({ user: meJson(req.user) }));

  app.put('/api/me', (req, res) => {
    const user = requireUser(req);
    const nickname = String(req.body?.nickname ?? '').trim();
    const xHandle = normalizeXHandle(req.body?.xHandle);
    const element = String(req.body?.element ?? 'fire');
    if (!NICK_RE.test(nickname)) {
      throw new HttpError(400, 'Nickname: 3–20 letters, digits, dots, dashes or underscores');
    }
    if (xHandle === null) throw new HttpError(400, 'That X handle looks wrong');
    if (!ELEMENTS.includes(element)) throw new HttpError(400, 'Pick an element');
    try {
      q.updateProfile.run(nickname, xHandle || null, element, user.id);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'That nickname is already taken');
      throw err;
    }
    res.json({ user: meJson(q.userById.get(user.id)) });
  });

  app.get('/api/messages', (req, res) => {
    const channel = String(req.query.channel || 'general');
    if (!CHANNELS.includes(channel)) throw new HttpError(400, 'Unknown channel');
    const before = Number.parseInt(req.query.before, 10);
    const rows = Number.isFinite(before) ? q.olderMessages.all(channel, before) : q.latestMessages.all(channel);
    res.json({ messages: rows.reverse().map(serializeMessage), hasMore: rows.length === HISTORY_PAGE });
  });

  app.delete('/api/messages/:id', (req, res) => {
    const user = requireUser(req);
    const row = q.messageById.get(Number(req.params.id));
    if (!row) throw new HttpError(404, 'Message not found');
    if (row.user_id !== user.id && !isAdmin(user)) throw new HttpError(403, 'You can only delete your own messages');
    q.deleteMessage.run(row.id);
    broadcast({ type: 'deleted', id: row.id, channel: row.channel });
    res.json({ ok: true });
  });

  app.get('/api/posts', (req, res) => {
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : 'all';
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 30);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const stmt = req.query.sort === 'top' ? q.postsTop : q.postsNew;
    const rows = stmt.all({ viewer: req.user?.id ?? 0, category, limit: limit + 1, offset });
    res.json({ posts: rows.slice(0, limit).map(serializePost), hasMore: rows.length > limit });
  });

  app.post('/api/posts', async (req, res) => {
    const user = requireMember(req);
    const parsed = parseTweetUrl(req.body?.url);
    if (!parsed) throw new HttpError(400, 'Paste a link to a post on X, like https://x.com/you/status/123…');
    const category = String(req.body?.category ?? 'other');
    if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Pick a category');
    const note = String(req.body?.note ?? '').trim().slice(0, MAX_NOTE_LEN) || null;
    if (q.postByTweet.get(parsed.id)) throw new HttpError(409, 'This post has already been shared');
    if (!postLimit(user.id)) throw new HttpError(429, 'You have shared a lot this hour, take a breather');

    const info = await lookupTweet(parsed.url);
    if (info.exists === false) throw new HttpError(400, "We couldn't find that post on X. Is it public?");
    const author = info.handle || parsed.author;
    const url = author ? `https://x.com/${author}/status/${parsed.id}` : parsed.url;
    let id;
    try {
      ({ lastInsertRowid: id } = q.insertPost.run(user.id, parsed.id, url, author, category, note, now()));
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'This post has already been shared');
      throw err;
    }
    const post = serializePost(q.postById.get({ id, viewer: user.id }));
    broadcast({ type: 'post', post: { ...post, fired: false } });
    res.status(201).json({ post });
  });

  app.post('/api/posts/:id/fire', (req, res) => {
    const user = requireMember(req);
    const id = Number(req.params.id);
    const post = q.postById.get({ id, viewer: user.id });
    if (!post) throw new HttpError(404, 'Post not found');
    if (post.fired) q.removeFire.run(id, user.id);
    else q.addFire.run(id, user.id, now());
    const fires = q.fireCount.get(id).n;
    broadcast({ type: 'post-fires', id, fires });
    res.json({ fires, fired: !post.fired });
  });

  app.delete('/api/posts/:id', (req, res) => {
    const user = requireUser(req);
    const id = Number(req.params.id);
    const post = q.postById.get({ id, viewer: user.id });
    if (!post) throw new HttpError(404, 'Post not found');
    if (post.user_id !== user.id && !isAdmin(user)) throw new HttpError(403, 'You can only remove your own posts');
    q.deletePost.run(id);
    broadcast({ type: 'post-deleted', id });
    res.json({ ok: true });
  });

  app.get('/api/leaderboard', (req, res) => {
    const rows = q.leaderboard.all().map((r, i) => ({
      rank: i + 1,
      user: toUser(r),
      posts: r.posts,
      fires: r.fires,
      messages: r.messages,
      score: r.posts * 10 + r.fires * 5 + Math.floor(Math.min(r.messages, 300) / 5),
    }));
    const me = req.user ? rows.find((r) => r.user.id === req.user.id) || null : null;
    res.json({ top: rows.slice(0, 20), me });
  });

  app.get('/api/stats', (req, res) => {
    res.json({ ...q.stats.get(), online: presence().online });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use('/api', (err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return {
    app,
    attach(server) {
      server.on('upgrade', (req, socket, head) => {
        let pathname;
        try {
          pathname = new URL(req.url, 'http://localhost').pathname;
        } catch {
          return;
        }
        if (pathname !== '/ws') return;
        // Cross-origin sockets may connect but only as read-only guests.
        const user = isSameOrigin(req) ? userFromRequest(req) : null;
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, user));
      });
      const heartbeat = setInterval(() => {
        for (const c of clients) {
          if (!c.alive) {
            c.ws.terminate();
            continue;
          }
          c.alive = false;
          c.ws.ping();
        }
      }, 30_000);
      heartbeat.unref();
      server.on('close', () => {
        clearInterval(heartbeat);
        for (const c of clients) c.ws.terminate();
      });
    },
  };
}
