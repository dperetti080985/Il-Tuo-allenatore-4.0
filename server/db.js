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

if (!existingColumns.has('athlete_metabolic_profile')) {
  db.exec('ALTER TABLE users ADD COLUMN athlete_metabolic_profile TEXT;');
}

if (!existingColumns.has('athlete_performance_profile')) {
  db.exec('ALTER TABLE users ADD COLUMN athlete_performance_profile TEXT;');
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
    training_mode TEXT NOT NULL DEFAULT 'in_bici' CHECK (training_mode IN ('in_bici', 'in_palestra', 'a_corpo_libero')),
    progression_increment_pct REAL,
    progression_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (objective_detail_id) REFERENCES training_objective_details(id)
  );
`);

const trainingMethodColumns = db.prepare('PRAGMA table_info(training_methods)').all();
const existingTrainingMethodColumns = new Set(trainingMethodColumns.map((column) => column.name));

if (!existingTrainingMethodColumns.has('training_mode')) {
  db.exec("ALTER TABLE training_methods ADD COLUMN training_mode TEXT NOT NULL DEFAULT 'in_bici';");
}

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
    exercise_id INTEGER,
    recovery_seconds INTEGER,
    description TEXT,
    overload_pct REAL,
    FOREIGN KEY (set_id) REFERENCES training_method_sets(id) ON DELETE CASCADE
  );
`);

const trainingIntervalColumns = db.prepare('PRAGMA table_info(training_method_intervals)').all();
const existingTrainingIntervalColumns = new Set(trainingIntervalColumns.map((column) => column.name));

if (!existingTrainingIntervalColumns.has('exercise_id')) {
  db.exec('ALTER TABLE training_method_intervals ADD COLUMN exercise_id INTEGER;');
}

if (!existingTrainingIntervalColumns.has('recovery_seconds')) {
  db.exec('ALTER TABLE training_method_intervals ADD COLUMN recovery_seconds INTEGER;');
}

if (!existingTrainingIntervalColumns.has('description')) {
  db.exec('ALTER TABLE training_method_intervals ADD COLUMN description TEXT;');
}

if (!existingTrainingIntervalColumns.has('overload_pct')) {
  db.exec('ALTER TABLE training_method_intervals ADD COLUMN overload_pct REAL;');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS training_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  CREATE TABLE IF NOT EXISTS athlete_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS disciplines (
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

db.exec(`
  CREATE TABLE IF NOT EXISTS training_method_disciplines (
    training_method_id INTEGER NOT NULL,
    discipline_id INTEGER NOT NULL,
    PRIMARY KEY (training_method_id, discipline_id),
    FOREIGN KEY (training_method_id) REFERENCES training_methods(id) ON DELETE CASCADE,
    FOREIGN KEY (discipline_id) REFERENCES disciplines(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS athlete_category_assignments (
    athlete_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (athlete_id, category_id),
    FOREIGN KEY (athlete_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES athlete_categories(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS athlete_discipline_assignments (
    athlete_id INTEGER NOT NULL,
    discipline_id INTEGER NOT NULL,
    PRIMARY KEY (athlete_id, discipline_id),
    FOREIGN KEY (athlete_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (discipline_id) REFERENCES disciplines(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS coach_zone_configs (
    coach_id INTEGER NOT NULL,
    metric TEXT NOT NULL CHECK (metric IN ('hr', 'power')),
    zone TEXT NOT NULL,
    min_pct REAL NOT NULL,
    max_pct REAL,
    PRIMARY KEY (coach_id, metric, zone),
    FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS monthly_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coach_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    plan_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (coach_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS monthly_plan_assignments (
    plan_id INTEGER NOT NULL,
    athlete_id INTEGER NOT NULL,
    custom_plan_json TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (plan_id, athlete_id),
    FOREIGN KEY (plan_id) REFERENCES monthly_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (athlete_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS monthly_plans_coach_idx ON monthly_plans(coach_id, updated_at DESC, id DESC);');
db.exec('CREATE INDEX IF NOT EXISTS monthly_plan_assignments_athlete_idx ON monthly_plan_assignments(athlete_id, updated_at DESC);');

db.exec(`
  CREATE TABLE IF NOT EXISTS athlete_method_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL,
    athlete_id INTEGER NOT NULL,
    week_index INTEGER NOT NULL,
    day_index INTEGER NOT NULL,
    method_id INTEGER NOT NULL,
    performed_at TEXT NOT NULL,
    liking INTEGER NOT NULL,
    difficulty INTEGER NOT NULL,
    perceived_fatigue INTEGER NOT NULL,
    evening_recovery INTEGER NOT NULL,
    next_day_recovery INTEGER NOT NULL,
    completion_pct REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id, athlete_id) REFERENCES monthly_plan_assignments(plan_id, athlete_id) ON DELETE CASCADE,
    FOREIGN KEY (method_id) REFERENCES training_methods(id) ON DELETE CASCADE
  );
`);

db.exec('CREATE INDEX IF NOT EXISTS athlete_method_eval_lookup_idx ON athlete_method_evaluations(plan_id, athlete_id, week_index, day_index, method_id);');

const athleteMethodEvaluationColumns = db.prepare('PRAGMA table_info(athlete_method_evaluations)').all();
const existingAthleteMethodEvaluationColumns = new Set(athleteMethodEvaluationColumns.map((column) => column.name));

if (!existingAthleteMethodEvaluationColumns.has('was_completed')) {
  db.exec('ALTER TABLE athlete_method_evaluations ADD COLUMN was_completed INTEGER NOT NULL DEFAULT 1;');
}

if (!existingAthleteMethodEvaluationColumns.has('coach_message')) {
  db.exec('ALTER TABLE athlete_method_evaluations ADD COLUMN coach_message TEXT;');
}

if (!existingAthleteMethodEvaluationColumns.has('coach_message_updated_at')) {
  db.exec('ALTER TABLE athlete_method_evaluations ADD COLUMN coach_message_updated_at TEXT;');
}


export default db;
