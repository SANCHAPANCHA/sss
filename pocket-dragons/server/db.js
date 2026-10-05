import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      nickname TEXT UNIQUE COLLATE NOCASE,
      x_handle TEXT,
      element TEXT NOT NULL DEFAULT 'fire',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      channel TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_by_channel ON messages(channel, id);

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tweet_id TEXT NOT NULL UNIQUE,
      tweet_url TEXT NOT NULL,
      x_author TEXT,
      category TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_fires (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (post_id, user_id)
    );
  `);
  return db;
}
