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
    email TEXT,
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
  db.exec('ALTER TABLE users ADD COLUMN email TEXT;');
}

if (!existingColumns.has('phone')) {
  db.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT '';");
}

if (!existingColumns.has('user_type')) {
  db.exec("ALTER TABLE users ADD COLUMN user_type TEXT NOT NULL DEFAULT 'athlete' CHECK (user_type IN ('coach', 'athlete'));");
}

// Migrazione non distruttiva: converte email vuote in NULL per evitare conflitti su indice unico.
db.exec("UPDATE users SET email = NULL WHERE email = '';");

// Unicità email solo quando presente.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email) WHERE email IS NOT NULL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS athlete_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,
    height_cm REAL,
    weight_kg REAL,
    aerobic_hr INTEGER,
    max_hr INTEGER,
    threshold_hr INTEGER,
    threshold_power_w INTEGER,
    max_power_w INTEGER,
    cp_2_min_w INTEGER,
    cp_5_min_w INTEGER,
    cp_20_min_w INTEGER,
    zones_override_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS athlete_profiles_user_idx ON athlete_profiles(user_id, recorded_at DESC, id DESC);');

db.exec(`
  CREATE TABLE IF NOT EXISTS coach_athlete_views (
    coach_id INTEGER NOT NULL,
    athlete_id INTEGER NOT NULL,
    last_seen_profile_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (coach_id, athlete_id),
    FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (athlete_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

export default db;
