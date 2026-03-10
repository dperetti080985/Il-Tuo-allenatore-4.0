import Database from 'better-sqlite3';

const db = new Database('app.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    email TEXT UNIQUE NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    user_type TEXT NOT NULL DEFAULT 'athlete' CHECK (user_type IN ('coach', 'athlete')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const columns = db.prepare('PRAGMA table_info(users)').all();
const existingColumns = new Set(columns.map((column) => column.name));

if (!existingColumns.has('first_name')) {
  db.exec("ALTER TABLE users ADD COLUMN first_name TEXT NOT NULL DEFAULT '';");
}

if (!existingColumns.has('last_name')) {
  db.exec("ALTER TABLE users ADD COLUMN last_name TEXT NOT NULL DEFAULT '';");
}

if (!existingColumns.has('email')) {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT '';");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email);');
}

if (!existingColumns.has('phone')) {
  db.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT '';");
}

if (!existingColumns.has('user_type')) {
  db.exec("ALTER TABLE users ADD COLUMN user_type TEXT NOT NULL DEFAULT 'athlete' CHECK (user_type IN ('coach', 'athlete'));");
}

if (existingColumns.has('email')) {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email);');
}

export default db;
