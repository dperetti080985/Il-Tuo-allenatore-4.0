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
    resting_hr INTEGER,
    aerobic_hr INTEGER,
    max_hr INTEGER,
    threshold_hr INTEGER,
    threshold_power_w INTEGER,
    max_power_w INTEGER,
    cp_2_min_w INTEGER,
    cp_5_min_w INTEGER,
    cp_20_min_w INTEGER,
    vo2_max REAL,
    vo2_max_power_w INTEGER,
    vo2_max_hr INTEGER,
    zones_override_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const athleteProfileColumns = db.prepare('PRAGMA table_info(athlete_profiles)').all();
const existingAthleteProfileColumns = new Set(athleteProfileColumns.map((column) => column.name));

if (!existingAthleteProfileColumns.has('vo2_max')) {
  db.exec('ALTER TABLE athlete_profiles ADD COLUMN vo2_max REAL;');
}

if (!existingAthleteProfileColumns.has('resting_hr')) {
  db.exec('ALTER TABLE athlete_profiles ADD COLUMN resting_hr INTEGER;');
}

if (!existingAthleteProfileColumns.has('vo2_max_power_w')) {
  db.exec('ALTER TABLE athlete_profiles ADD COLUMN vo2_max_power_w INTEGER;');
}

if (!existingAthleteProfileColumns.has('vo2_max_hr')) {
  db.exec('ALTER TABLE athlete_profiles ADD COLUMN vo2_max_hr INTEGER;');
}

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

db.exec(`
  CREATE TABLE IF NOT EXISTS training_objective_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    macro_area TEXT NOT NULL CHECK (macro_area IN ('metabolico', 'neuromuscolare')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS training_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    macro_area TEXT NOT NULL CHECK (macro_area IN ('metabolico', 'neuromuscolare')),
    objective_detail_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    period TEXT NOT NULL CHECK (period IN ('costruzione', 'specialistico', 'pre-gara', 'gara')),
    notes TEXT,
    method_type TEXT NOT NULL CHECK (method_type IN ('single', 'monthly_weekly', 'monthly_biweekly')),
    progression_increment_pct REAL,
    progression_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (objective_detail_id) REFERENCES training_objective_details(id)
  );
`);

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS training_methods_coach_code_idx ON training_methods(coach_id, code);');

db.exec(`
  CREATE TABLE IF NOT EXISTS training_method_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    training_method_id INTEGER NOT NULL,
    set_order INTEGER NOT NULL,
    series_count INTEGER NOT NULL,
    recovery_seconds INTEGER NOT NULL,
    FOREIGN KEY (training_method_id) REFERENCES training_methods(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS training_method_intervals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id INTEGER NOT NULL,
    interval_order INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    intensity_zone TEXT,
    rpm INTEGER,
    rpe REAL,
    FOREIGN KEY (set_id) REFERENCES training_method_sets(id) ON DELETE CASCADE
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS training_method_sets_method_idx ON training_method_sets(training_method_id, set_order);');
db.exec('CREATE INDEX IF NOT EXISTS training_method_intervals_set_idx ON training_method_intervals(set_id, interval_order);');

db.exec(`
  CREATE TABLE IF NOT EXISTS training_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS training_method_objective_details (
    training_method_id INTEGER NOT NULL,
    objective_detail_id INTEGER NOT NULL,
    PRIMARY KEY (training_method_id, objective_detail_id),
    FOREIGN KEY (training_method_id) REFERENCES training_methods(id) ON DELETE CASCADE,
    FOREIGN KEY (objective_detail_id) REFERENCES training_objective_details(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS training_method_categories (
    training_method_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (training_method_id, category_id),
    FOREIGN KEY (training_method_id) REFERENCES training_methods(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES training_categories(id)
  );
`);


export default db;
