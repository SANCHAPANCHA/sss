import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './db.js';
import { createMailer } from './mail.js';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

const db = openDb(path.resolve(root, env.DATABASE_PATH || 'data/pocket-dragons.db'));
const sendMail = createMailer({
  smtpUrl: env.SMTP_URL,
  from: env.MAIL_FROM || "Keepers' Lair <no-reply@localhost>",
  siteName: "Keepers' Lair",
  isProd,
});

const { app, attach } = createApp({
  db,
  sendMail,
  config: {
    adminEmails: list(env.ADMIN_EMAILS),
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    secureCookies: isProd && env.COOKIE_SECURE !== 'false',
    trustProxy: env.TRUST_PROXY,
  },
});

const server = http.createServer(app);
attach(server);

if (isProd) {
  app.use(express.static(path.join(root, 'dist'), { maxAge: '1h' }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);
}

const port = Number(env.PORT) || 3000;
server.listen(port, env.HOST || '0.0.0.0', () => {
  console.log(`🐉 Keepers' Lair running on http://localhost:${port} (${isProd ? 'production' : 'dev'})`);
});
