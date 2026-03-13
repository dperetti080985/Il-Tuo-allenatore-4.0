import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import db from './db.js';

const app = express();
const PORT = 3001;
const JWT_SECRET = 'local-dev-secret-change-me';
const USER_TYPES = new Set(['coach', 'athlete']);
const ATHLETE_METABOLIC_PROFILES = new Set(['aerobico', 'glucolitico', 'misto']);
const ATHLETE_PERFORMANCE_PROFILES = new Set(['passista', 'scalatore', 'velocista', 'all-rounder']);

const TRAINING_MACRO_AREAS = new Set(['metabolico', 'neuromuscolare']);
const TRAINING_PERIODS = new Set(['costruzione', 'specialistico', 'pre-gara', 'gara']);
const TRAINING_METHOD_TYPES = new Set(['single', 'monthly_weekly', 'monthly_biweekly']);
const TRAINING_MODES = new Set(['in_bici', 'in_palestra', 'a_corpo_libero']);
const ZONE_STRESS_WEIGHTS = { Z1: 1, Z2: 2, Z3: 3, Z4: 5, Z5: 7, Z6: 9, Z7: 11 };

app.use(cors());
app.use(express.json());

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Token mancante' });
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token non valido' });
  }
};

const normalizeUserPayload = (payload) => ({
  username: payload.username?.trim(),
  password: payload.password,
  firstName: payload.firstName?.trim(),
  lastName: payload.lastName?.trim(),
  email: payload.email?.trim().toLowerCase() || null,
  phone: payload.phone?.trim(),
  userType: payload.userType?.trim().toLowerCase(),
  athleteMetabolicProfile: payload.athleteMetabolicProfile?.trim().toLowerCase() || null,
  athletePerformanceProfile: payload.athletePerformanceProfile?.trim().toLowerCase() || null
});

const validateRequiredUserFields = (user) => {
  if (!user.username || !user.password || !user.firstName || !user.lastName || !user.email || !user.phone || !user.userType) {
    return 'Tutti i campi utente sono obbligatori';
  }

  if (!USER_TYPES.has(user.userType)) {
    return 'Tipologia utente non valida';
  }

  if (user.athleteMetabolicProfile && !ATHLETE_METABOLIC_PROFILES.has(user.athleteMetabolicProfile)) {
    return 'Profilo metabolico atleta non valido';
  }

  if (user.athletePerformanceProfile && !ATHLETE_PERFORMANCE_PROFILES.has(user.athletePerformanceProfile)) {
    return 'Profilo prestativo atleta non valido';
  }

  return null;
};

const isCoach = (user) => user?.userType === 'coach';


const uniqueIds = (items = []) => [...new Set(items.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];

const loadAthleteAssignments = (athleteId) => {
  const categoryRows = db.prepare(`
    SELECT c.id, c.name
    FROM athlete_category_assignments a
    JOIN athlete_categories c ON c.id = a.category_id
    WHERE a.athlete_id = ?
    ORDER BY c.name ASC
  `).all(athleteId);

  const disciplineRows = db.prepare(`
    SELECT d.id, d.name
    FROM athlete_discipline_assignments a
    JOIN disciplines d ON d.id = a.discipline_id
    WHERE a.athlete_id = ?
    ORDER BY d.name ASC
  `).all(athleteId);

  return {
    categoryIds: categoryRows.map((row) => row.id),
    categoryNames: categoryRows.map((row) => row.name),
    disciplineIds: disciplineRows.map((row) => row.id),
    disciplineNames: disciplineRows.map((row) => row.name)
  };
};

const ZONE_RULES = [
  { zone: 'Z1', min: 0, max: 55 },
  { zone: 'Z2', min: 56, max: 75 },
  { zone: 'Z3', min: 76, max: 90 },
  { zone: 'Z4', min: 91, max: 105 },
  { zone: 'Z5', min: 106, max: 120 },
  { zone: 'Z6', min: 121, max: 150 },
  { zone: 'Z7', min: 151, max: null }
];

const toRounded = (value) => Math.round(value);

const loadCoachZoneRules = (coachId) => {
  if (!coachId) return ZONE_RULES;

  const rows = db.prepare('SELECT metric, zone, min_pct AS minPct, max_pct AS maxPct FROM coach_zone_configs WHERE coach_id = ?').all(coachId);
  if (rows.length === 0) return ZONE_RULES;

  const hrRowsByZone = new Map(rows.filter((row) => row.metric === 'hr').map((row) => [row.zone, row]));
  const powerRowsByZone = new Map(rows.filter((row) => row.metric === 'power').map((row) => [row.zone, row]));

  return ZONE_RULES.map((rule) => {
    const hr = hrRowsByZone.get(rule.zone);
    const power = powerRowsByZone.get(rule.zone);
    const source = hr || power;
    return {
      zone: rule.zone,
      min: source ? Number(source.minPct) : rule.min,
      max: source ? (source.maxPct === null ? null : Number(source.maxPct)) : rule.max
    };
  });
};


const computeHeartRateZones = (thresholdHr, maxHr, restingHr, rules = ZONE_RULES) => {
  if (!thresholdHr) return null;

  const thresholdMaxByZone = Object.fromEntries(
    rules.map((rule) => [rule.zone, rule.max === null ? null : toRounded((thresholdHr * rule.max) / 100)])
  );

  return rules.map((rule, index) => {
    const previousRule = rules[index - 1];
    const previousMax = previousRule ? thresholdMaxByZone[previousRule.zone] : null;
    const fallbackMin = toRounded((thresholdHr * rule.min) / 100);

    let min = index === 0
      ? (restingHr ? restingHr + 10 : fallbackMin)
      : (previousMax !== null ? previousMax + 1 : fallbackMin);

    let max = rule.max === null ? (maxHr ?? null) : thresholdMaxByZone[rule.zone];
    if (maxHr && max !== null) {
      max = Math.min(max, maxHr);
    }

    if (max !== null && min > max) {
      min = max;
    }

    return { min, max };
  });
};

const computeZones = (thresholdHr, thresholdPower, maxHr, restingHr, rules = ZONE_RULES) => {
  const hrZones = computeHeartRateZones(thresholdHr, maxHr, restingHr, rules);

  return rules.map((rule, index) => {
    const hr = hrZones ? hrZones[index] : null;

    const power = thresholdPower
      ? {
          min: toRounded((thresholdPower * rule.min) / 100),
          max: rule.max === null ? null : toRounded((thresholdPower * rule.max) / 100)
        }
      : null;

    return { zone: rule.zone, hr, power };
  });
};

const parsePositiveNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Number.NaN;
  }

  return numeric;
};

const parseNonNegativeNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return Number.NaN;
  }

  return numeric;
};

const normalizeZoneOverride = (payload) => {
  if (!payload) return null;

  const result = {};
  for (const zoneRule of ZONE_RULES) {
    const zonePayload = payload[zoneRule.zone];
    if (!zonePayload || typeof zonePayload !== 'object') continue;

    result[zoneRule.zone] = {};

    if (zonePayload.hr) {
      const hrMin = parseNonNegativeNumber(zonePayload.hr.min);
      const hrMax = parseNonNegativeNumber(zonePayload.hr.max);
      if (Number.isNaN(hrMin) || (zonePayload.hr.max !== null && Number.isNaN(hrMax))) {
        return { error: `Override FC non valido per ${zoneRule.zone}` };
      }
      result[zoneRule.zone].hr = {
        min: hrMin,
        max: zonePayload.hr.max === null ? null : hrMax
      };
    }

    if (zonePayload.power) {
      const powerMin = parseNonNegativeNumber(zonePayload.power.min);
      const powerMax = parseNonNegativeNumber(zonePayload.power.max);
      if (Number.isNaN(powerMin) || (zonePayload.power.max !== null && Number.isNaN(powerMax))) {
        return { error: `Override potenza non valido per ${zoneRule.zone}` };
      }
      result[zoneRule.zone].power = {
        min: powerMin,
        max: zonePayload.power.max === null ? null : powerMax
      };
    }
  }

  return { data: result };
};

const getReferenceCoachId = (requestUser) => {
  if (isCoach(requestUser)) return requestUser.id;
  const firstCoach = db.prepare("SELECT id FROM users WHERE user_type = 'coach' ORDER BY id ASC LIMIT 1").get();
  return firstCoach?.id ?? null;
};

const buildProfileResponse = (row, coachId = null) => {
  const zoneOverrides = row.zones_override_json ? JSON.parse(row.zones_override_json) : {};
  const zoneRules = loadCoachZoneRules(coachId);
  const autoZones = computeZones(row.threshold_hr, row.threshold_power_w, row.max_hr, row.resting_hr, zoneRules);
  const zones = autoZones.map((z) => ({
    ...z,
    hr: zoneOverrides?.[z.zone]?.hr || z.hr,
    power: zoneOverrides?.[z.zone]?.power || z.power
  }));

  return {
    id: row.id,
    userId: row.user_id,
    recordedAt: row.recorded_at,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    restingHr: row.resting_hr,
    aerobicHr: row.aerobic_hr,
    maxHr: row.max_hr,
    thresholdHr: row.threshold_hr,
    thresholdPowerW: row.threshold_power_w,
    maxPowerW: row.max_power_w,
    cp2MinW: row.cp_2_min_w,
    cp5MinW: row.cp_5_min_w,
    cp20MinW: row.cp_20_min_w,
    vo2Max: row.vo2_max,
    vo2MaxPowerW: row.vo2_max_power_w,
    vo2MaxHr: row.vo2_max_hr,
    powerToWeight: row.threshold_power_w && row.weight_kg ? Number((row.threshold_power_w / row.weight_kg).toFixed(2)) : null,
    zones,
    zonesOverride: zoneOverrides,
    createdAt: row.created_at
  };
};

const canAccessAthlete = (requestUser, athleteId) => isCoach(requestUser) || requestUser.id === athleteId;

const getAthleteLastProfileId = (athleteId) => {
  const row = db
    .prepare('SELECT id FROM athlete_profiles WHERE user_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1')
    .get(athleteId);
  return row?.id ?? null;
};

const getCoachUnreadMap = (coachId) => {
  const athletes = db.prepare("SELECT id FROM users WHERE user_type = 'athlete'").all();
  const viewedRows = db.prepare('SELECT athlete_id AS athleteId, last_seen_profile_id AS lastSeenProfileId FROM coach_athlete_views WHERE coach_id = ?').all(coachId);
  const viewedByAthlete = new Map(viewedRows.map((row) => [row.athleteId, row.lastSeenProfileId]));

  const unreadMap = {};
  for (const athlete of athletes) {
    const latestProfileId = getAthleteLastProfileId(athlete.id);
    const lastSeenProfileId = viewedByAthlete.get(athlete.id) ?? null;
    unreadMap[athlete.id] = latestProfileId !== null && latestProfileId !== lastSeenProfileId;
  }

  return unreadMap;
};


const secondsFromParts = (minutes, seconds) => {
  const m = Number(minutes ?? 0);
  const sec = Number(seconds ?? 0);
  if (!Number.isFinite(m) || !Number.isFinite(sec) || m < 0 || sec < 0 || sec >= 60) return Number.NaN;
  return Math.round(m * 60 + sec);
};


const buildMethodCompactDetail = (method) => {
  if (!method) return '';

  const parts = [];
  method.sets?.forEach((set, setIndex) => {
    const intervalParts = (set.intervals || []).map((interval) => {
      if ((method.trainingMode || 'in_bici') === 'in_bici') {
        const zone = interval.intensityZone || '-';
        return `${interval.minutes || 0}m${interval.seconds || 0}s ${zone}`;
      }

      const exerciseName = interval.exerciseName || 'Esercizio';
      return `${interval.minutes || 0}x ${exerciseName}`;
    });

    parts.push(`S${setIndex + 1}: ${set.seriesCount} serie · ${intervalParts.join(' | ')}`);
  });

  return parts.join(' • ');
};

const sanitizeMonthlyPlanGrid = (grid) => {
  if (!Array.isArray(grid)) return null;
  if (grid.length !== 4) return null;

  const normalized = [];
  for (const week of grid) {
    if (!Array.isArray(week) || week.length !== 7) return null;
    const weekDays = week.map((day) => {
      if (!Array.isArray(day)) return [];
      return [...new Set(day.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
    });
    normalized.push(weekDays);
  }

  return normalized;
};

const mapMonthlyPlan = (planRow, athleteAssignment = null) => {
  const basePlan = JSON.parse(planRow.plan_json);
  const plan = athleteAssignment?.custom_plan_json ? JSON.parse(athleteAssignment.custom_plan_json) : basePlan;

  return {
    id: planRow.id,
    coachId: planRow.coach_id,
    name: planRow.name,
    plan,
    basePlan,
    isCustomized: Boolean(athleteAssignment?.custom_plan_json),
    updatedAt: athleteAssignment?.updated_at || planRow.updated_at,
    createdAt: planRow.created_at
  };
};

const mapTrainingMethod = (methodRow) => {
  const objectiveRows = db
    .prepare(`
      SELECT d.id, d.name, d.macro_area AS macroArea
      FROM training_method_objective_details m
      JOIN training_objective_details d ON d.id = m.objective_detail_id
      WHERE m.training_method_id = ?
      ORDER BY d.name ASC
    `)
    .all(methodRow.id);

  const categoryRows = db
    .prepare(`
      SELECT c.id, c.name
      FROM training_method_categories m
      JOIN training_categories c ON c.id = m.category_id
      WHERE m.training_method_id = ?
      ORDER BY c.name ASC
    `)
    .all(methodRow.id);

  const disciplineRows = db
    .prepare(`
      SELECT d.id, d.name
      FROM training_method_disciplines m
      JOIN disciplines d ON d.id = m.discipline_id
      WHERE m.training_method_id = ?
      ORDER BY d.name ASC
    `)
    .all(methodRow.id);

  const sets = db
    .prepare('SELECT id, set_order AS setOrder, series_count AS seriesCount, recovery_seconds AS recoverySeconds FROM training_method_sets WHERE training_method_id = ? ORDER BY set_order ASC')
    .all(methodRow.id)
    .map((setRow) => {
      const intervals = db
        .prepare(`
          SELECT i.id, i.interval_order AS intervalOrder, i.duration_seconds AS durationSeconds, i.intensity_zone AS intensityZone, i.rpm, i.rpe,
            i.exercise_id AS exerciseId, i.recovery_seconds AS recoverySeconds, i.description, i.overload_pct AS overloadPct,
            e.name AS exerciseName
          FROM training_method_intervals i
          LEFT JOIN training_exercises e ON e.id = i.exercise_id
          WHERE i.set_id = ?
          ORDER BY i.interval_order ASC
        `)
        .all(setRow.id)
        .map((i) => ({
          ...i,
          minutes: Math.floor(i.durationSeconds / 60),
          seconds: i.durationSeconds % 60
        }));

      return { ...setRow, intervals };
    });

  const stressScore = sets.reduce((total, set) => {
    const perSetStress = set.intervals.reduce((acc, interval) => {
      const weight = ZONE_STRESS_WEIGHTS[interval.intensityZone] || 1;
      return acc + interval.durationSeconds * weight;
    }, 0);
    return total + perSetStress * set.seriesCount;
  }, 0);

  return {
    id: methodRow.id,
    coachId: methodRow.coach_id,
    name: methodRow.name,
    code: methodRow.code,
    macroArea: methodRow.macro_area,
    objectiveDetailId: methodRow.objective_detail_id,
    objectiveDetailIds: objectiveRows.map((row) => row.id),
    objectiveDetailNames: objectiveRows.map((row) => row.name),
    category: methodRow.category,
    categoryIds: categoryRows.map((row) => row.id),
    categoryNames: categoryRows.map((row) => row.name),
    disciplineIds: disciplineRows.map((row) => row.id),
    disciplineNames: disciplineRows.map((row) => row.name),
    period: methodRow.period,
    notes: methodRow.notes,
    methodType: methodRow.method_type,
    trainingMode: methodRow.training_mode || 'in_bici',
    progressionIncrementPct: methodRow.progression_increment_pct,
    progression: methodRow.progression_json ? JSON.parse(methodRow.progression_json) : null,
    sets,
    stressScore,
    createdAt: methodRow.created_at,
    updatedAt: methodRow.updated_at
  };
};

const validateTrainingMethodPayload = (payload) => {
  const required = ['name', 'code', 'macroArea', 'period', 'methodType'];
  for (const field of required) {
    if (!payload[field] && payload[field] !== 0) return `${field} è obbligatorio`;
  }

  if (!Array.isArray(payload.objectiveDetailIds) || payload.objectiveDetailIds.length === 0) {
    return 'Selezionare almeno un dettaglio obiettivo';
  }
  if (!Array.isArray(payload.categoryIds) || payload.categoryIds.length === 0) {
    return 'Selezionare almeno una categoria';
  }
  if (!Array.isArray(payload.disciplineIds) || payload.disciplineIds.length === 0) {
    return 'Selezionare almeno una disciplina';
  }

  if (!TRAINING_MACRO_AREAS.has(payload.macroArea)) return 'Macro area non valida';
  if (!TRAINING_PERIODS.has(payload.period)) return 'Periodo non valido';
  if (!TRAINING_METHOD_TYPES.has(payload.methodType)) return 'Tipologia metodo non valida';
  if (!TRAINING_MODES.has(payload.trainingMode)) return 'Modalità allenamento non valida';

  if (!Array.isArray(payload.sets) || payload.sets.length === 0) {
    return 'Inserire almeno un blocco di serie';
  }

  for (const set of payload.sets) {
    const seriesCount = Number(set.seriesCount);
    const recoveryMinutes = Number(set.recoveryMinutes ?? 0);
    const recoverySeconds = Number(set.recoverySeconds ?? 0);
    if (!Number.isInteger(seriesCount) || seriesCount <= 0) return 'Numero serie non valido';
    if (!Number.isFinite(recoveryMinutes) || !Number.isFinite(recoverySeconds) || recoveryMinutes < 0 || recoverySeconds < 0 || recoverySeconds >= 60) {
      return 'Recupero non valido';
    }

    if (!Array.isArray(set.intervals) || set.intervals.length === 0) return 'Ogni blocco deve avere almeno una ripetuta';
    for (const interval of set.intervals) {
      const durationSeconds = secondsFromParts(interval.minutes, interval.seconds);
      if (Number.isNaN(durationSeconds) || durationSeconds <= 0) return 'Durata ripetuta non valida';

      if (payload.trainingMode === 'in_bici') {
        if (interval.rpm !== null && interval.rpm !== undefined && interval.rpm !== '' && (!Number.isFinite(Number(interval.rpm)) || Number(interval.rpm) < 0)) {
          return 'RPM non valide';
        }
        if (interval.rpe !== null && interval.rpe !== undefined && interval.rpe !== '' && (!Number.isFinite(Number(interval.rpe)) || Number(interval.rpe) < 0)) {
          return 'RPE non valido';
        }
      } else {
        const exerciseId = Number(interval.exerciseId);
        if (!Number.isInteger(exerciseId) || exerciseId <= 0) return 'Esercizio intervallo non valido';
        const recMinutes = Number(interval.intervalRecoveryMinutes ?? 0);
        const recSeconds = Number(interval.intervalRecoverySeconds ?? 0);
        if (!Number.isFinite(recMinutes) || !Number.isFinite(recSeconds) || recMinutes < 0 || recSeconds < 0 || recSeconds >= 60) {
          return 'Recupero intervallo non valido';
        }
        if (interval.overloadPct !== null && interval.overloadPct !== undefined && interval.overloadPct !== '' && (!Number.isFinite(Number(interval.overloadPct)) || Number(interval.overloadPct) < 0)) {
          return 'Sovraccarico non valido';
        }
      }
    }
  }

  return null;
};

app.get('/api/status', (_req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  res.json({ hasUsers: row.count > 0, usersCount: row.count });
});

app.post('/api/users', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const user = normalizeUserPayload(req.body);
  const validationError = validateRequiredUserFields(user);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const authHeader = req.headers.authorization;

  if (totalUsers === 0) {
    if (user.userType !== 'coach') {
      return res.status(400).json({ message: 'Il primo utente deve essere un coach' });
    }
  } else {
    if (!authHeader) {
      return res.status(401).json({ message: 'Solo un coach autenticato può creare utenti' });
    }

    const token = authHeader.replace('Bearer ', '');
    let loggedUser;

    try {
      loggedUser = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Token non valido' });
    }

    if (!isCoach(loggedUser)) {
      return res.status(403).json({ message: 'Solo un coach può creare utenti' });
    }
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO users (username, password, first_name, last_name, email, phone, user_type, athlete_metabolic_profile, athlete_performance_profile)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(user.username, user.password, user.firstName, user.lastName, user.email, user.phone, user.userType, user.athleteMetabolicProfile, user.athletePerformanceProfile);

    res.status(201).json({
      id: info.lastInsertRowid,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      userType: user.userType,
      athleteMetabolicProfile: user.athleteMetabolicProfile,
      athletePerformanceProfile: user.athletePerformanceProfile
    });
  } catch {
    res.status(409).json({ message: 'Username o email già esistente' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Credenziali obbligatorie' });
  }

  const user = db
    .prepare('SELECT id, username, first_name AS firstName, last_name AS lastName, email, phone, user_type AS userType, athlete_metabolic_profile AS athleteMetabolicProfile, athlete_performance_profile AS athletePerformanceProfile FROM users WHERE username = ? AND password = ?')
    .get(username.trim(), password);

  if (!user) {
    return res.status(401).json({ message: 'Credenziali non valide' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, userType: user.userType }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user });
});

app.get('/api/users', auth, (req, res) => {
  if (isCoach(req.user)) {
    const users = db
      .prepare(`
        SELECT
          id,
          username,
          first_name AS firstName,
          last_name AS lastName,
          email,
          phone,
          user_type AS userType,
          athlete_metabolic_profile AS athleteMetabolicProfile,
          athlete_performance_profile AS athletePerformanceProfile,
          created_at AS createdAt
        FROM users
        ORDER BY id DESC
      `)
      .all();

    const unreadMap = getCoachUnreadMap(req.user.id);
    const usersWithUpdates = users.map((user) => ({
      ...user,
      hasUnreadSnapshot: user.userType === 'athlete' ? Boolean(unreadMap[user.id]) : false
    }));

    return res.json(usersWithUpdates);
  }

  const currentUser = db
    .prepare(`
      SELECT
        id,
        username,
        first_name AS firstName,
        last_name AS lastName,
        email,
        phone,
        user_type AS userType,
        created_at AS createdAt
      FROM users
      WHERE id = ?
    `)
    .get(req.user.id);

  if (!currentUser) {
    return res.status(404).json({ message: 'Utente non trovato' });
  }

  return res.json([currentUser]);
});

app.put('/api/users/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const existingUser = db
    .prepare('SELECT id, username, password, first_name AS firstName, last_name AS lastName, email, phone, user_type AS userType, athlete_metabolic_profile AS athleteMetabolicProfile, athlete_performance_profile AS athletePerformanceProfile FROM users WHERE id = ?')
    .get(id);

  if (!existingUser) {
    return res.status(404).json({ message: 'Utente non trovato' });
  }

  const requesterIsCoach = isCoach(req.user);
  const requesterIsOwner = req.user.id === id;

  if (!requesterIsCoach && !requesterIsOwner) {
    return res.status(403).json({ message: 'Puoi modificare solo il tuo profilo' });
  }

  const payload = normalizeUserPayload(req.body);

  if (!requesterIsCoach && payload.username && payload.username !== existingUser.username) {
    return res.status(403).json({ message: 'Un atleta non può modificare la username' });
  }

  const updatedUser = {
    username: requesterIsCoach ? payload.username : existingUser.username,
    password: payload.password || existingUser.password,
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    phone: payload.phone,
    userType: requesterIsCoach ? payload.userType : existingUser.userType,
    athleteMetabolicProfile: payload.athleteMetabolicProfile ?? existingUser.athleteMetabolicProfile,
    athletePerformanceProfile: payload.athletePerformanceProfile ?? existingUser.athletePerformanceProfile
  };

  const validationError = validateRequiredUserFields(updatedUser);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const info = db
      .prepare(`
        UPDATE users
        SET username = ?, password = ?, first_name = ?, last_name = ?, email = ?, phone = ?, user_type = ?, athlete_metabolic_profile = ?, athlete_performance_profile = ?
        WHERE id = ?
      `)
      .run(updatedUser.username, updatedUser.password, updatedUser.firstName, updatedUser.lastName, updatedUser.email, updatedUser.phone, updatedUser.userType, updatedUser.athleteMetabolicProfile, updatedUser.athletePerformanceProfile, id);

    if (info.changes === 0) {
      return res.status(404).json({ message: 'Utente non trovato' });
    }

    return res.json({ ok: true });
  } catch {
    return res.status(409).json({ message: 'Username o email già esistente' });
  }
});

app.get('/api/athletes/:id/profile-history', auth, (req, res) => {
  const athleteId = Number(req.params.id);

  if (!canAccessAthlete(req.user, athleteId)) {
    return res.status(403).json({ message: 'Non autorizzato' });
  }

  const athlete = db.prepare('SELECT id, user_type AS userType FROM users WHERE id = ?').get(athleteId);
  if (!athlete) {
    return res.status(404).json({ message: 'Utente non trovato' });
  }

  if (athlete.userType !== 'athlete') {
    return res.status(400).json({ message: 'Il profilo atletico è disponibile solo per utenti atleta' });
  }

  const history = db
    .prepare('SELECT * FROM athlete_profiles WHERE user_id = ? ORDER BY recorded_at DESC, id DESC')
    .all(athleteId)
    .map((row) => buildProfileResponse(row, getReferenceCoachId(req.user)));

  return res.json(history);
});

app.post('/api/athletes/:id/profile-history', auth, (req, res) => {
  const athleteId = Number(req.params.id);

  if (!canAccessAthlete(req.user, athleteId)) {
    return res.status(403).json({ message: 'Non autorizzato' });
  }

  const athlete = db.prepare('SELECT id, user_type AS userType FROM users WHERE id = ?').get(athleteId);
  if (!athlete) {
    return res.status(404).json({ message: 'Utente non trovato' });
  }

  if (athlete.userType !== 'athlete') {
    return res.status(400).json({ message: 'Il profilo atletico è disponibile solo per utenti atleta' });
  }

  const payload = req.body || {};
  const recordedAt = payload.recordedAt?.trim();
  if (!recordedAt) {
    return res.status(400).json({ message: 'La data di inserimento è obbligatoria' });
  }

  const numericFields = {
    heightCm: parsePositiveNumber(payload.heightCm),
    weightKg: parsePositiveNumber(payload.weightKg),
    restingHr: parsePositiveNumber(payload.restingHr),
    aerobicHr: parsePositiveNumber(payload.aerobicHr),
    maxHr: parsePositiveNumber(payload.maxHr),
    thresholdHr: parsePositiveNumber(payload.thresholdHr),
    thresholdPowerW: parsePositiveNumber(payload.thresholdPowerW),
    maxPowerW: parsePositiveNumber(payload.maxPowerW),
    cp2MinW: parsePositiveNumber(payload.cp2MinW),
    cp5MinW: parsePositiveNumber(payload.cp5MinW),
    cp20MinW: parsePositiveNumber(payload.cp20MinW),
    vo2Max: parsePositiveNumber(payload.vo2Max),
    vo2MaxPowerW: parsePositiveNumber(payload.vo2MaxPowerW),
    vo2MaxHr: parsePositiveNumber(payload.vo2MaxHr)
  };

  const invalidField = Object.entries(numericFields).find(([, value]) => Number.isNaN(value));
  if (invalidField) {
    return res.status(400).json({ message: `Valore non valido per ${invalidField[0]}` });
  }

  const zonesOverrideResult = normalizeZoneOverride(payload.zonesOverride);
  if (zonesOverrideResult?.error) {
    return res.status(400).json({ message: zonesOverrideResult.error });
  }

  const info = db
    .prepare(`
      INSERT INTO athlete_profiles (
        user_id,
        recorded_at,
        height_cm,
        weight_kg,
        resting_hr,
        aerobic_hr,
        max_hr,
        threshold_hr,
        threshold_power_w,
        max_power_w,
        cp_2_min_w,
        cp_5_min_w,
        cp_20_min_w,
        vo2_max,
        vo2_max_power_w,
        vo2_max_hr,
        zones_override_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      athleteId,
      recordedAt,
      numericFields.heightCm,
      numericFields.weightKg,
      numericFields.restingHr,
      numericFields.aerobicHr,
      numericFields.maxHr,
      numericFields.thresholdHr,
      numericFields.thresholdPowerW,
      numericFields.maxPowerW,
      numericFields.cp2MinW,
      numericFields.cp5MinW,
      numericFields.cp20MinW,
      numericFields.vo2Max,
      numericFields.vo2MaxPowerW,
      numericFields.vo2MaxHr,
      JSON.stringify(zonesOverrideResult?.data || {})
    );

  const created = db.prepare('SELECT * FROM athlete_profiles WHERE id = ?').get(info.lastInsertRowid);
  return res.status(201).json(buildProfileResponse(created, getReferenceCoachId(req.user)));
});



app.put('/api/athletes/:id/profile-history/:snapshotId', auth, (req, res) => {
  const athleteId = Number(req.params.id);
  const snapshotId = Number(req.params.snapshotId);

  if (!canAccessAthlete(req.user, athleteId)) {
    return res.status(403).json({ message: 'Non autorizzato' });
  }

  const athlete = db.prepare('SELECT id, user_type AS userType FROM users WHERE id = ?').get(athleteId);
  if (!athlete) {
    return res.status(404).json({ message: 'Utente non trovato' });
  }

  if (athlete.userType !== 'athlete') {
    return res.status(400).json({ message: 'Il profilo atletico è disponibile solo per utenti atleta' });
  }

  const existing = db.prepare('SELECT * FROM athlete_profiles WHERE id = ? AND user_id = ?').get(snapshotId, athleteId);
  if (!existing) {
    return res.status(404).json({ message: 'Snapshot non trovato' });
  }

  const payload = req.body || {};
  const recordedAt = payload.recordedAt?.trim();
  if (!recordedAt) {
    return res.status(400).json({ message: 'La data di inserimento è obbligatoria' });
  }

  const numericFields = {
    heightCm: parsePositiveNumber(payload.heightCm),
    weightKg: parsePositiveNumber(payload.weightKg),
    restingHr: parsePositiveNumber(payload.restingHr),
    aerobicHr: parsePositiveNumber(payload.aerobicHr),
    maxHr: parsePositiveNumber(payload.maxHr),
    thresholdHr: parsePositiveNumber(payload.thresholdHr),
    thresholdPowerW: parsePositiveNumber(payload.thresholdPowerW),
    maxPowerW: parsePositiveNumber(payload.maxPowerW),
    cp2MinW: parsePositiveNumber(payload.cp2MinW),
    cp5MinW: parsePositiveNumber(payload.cp5MinW),
    cp20MinW: parsePositiveNumber(payload.cp20MinW),
    vo2Max: parsePositiveNumber(payload.vo2Max),
    vo2MaxPowerW: parsePositiveNumber(payload.vo2MaxPowerW),
    vo2MaxHr: parsePositiveNumber(payload.vo2MaxHr)
  };

  const invalidField = Object.entries(numericFields).find(([, value]) => Number.isNaN(value));
  if (invalidField) {
    return res.status(400).json({ message: `Valore non valido per ${invalidField[0]}` });
  }

  const zonesOverrideResult = normalizeZoneOverride(payload.zonesOverride);
  if (zonesOverrideResult?.error) {
    return res.status(400).json({ message: zonesOverrideResult.error });
  }

  db.prepare(`
    UPDATE athlete_profiles
    SET
      recorded_at = ?,
      height_cm = ?,
      weight_kg = ?,
      resting_hr = ?,
      aerobic_hr = ?,
      max_hr = ?,
      threshold_hr = ?,
      threshold_power_w = ?,
      max_power_w = ?,
      cp_2_min_w = ?,
      cp_5_min_w = ?,
      cp_20_min_w = ?,
      vo2_max = ?,
      vo2_max_power_w = ?,
      vo2_max_hr = ?,
      zones_override_json = ?
    WHERE id = ? AND user_id = ?
  `).run(
    recordedAt,
    numericFields.heightCm,
    numericFields.weightKg,
    numericFields.restingHr,
    numericFields.aerobicHr,
    numericFields.maxHr,
    numericFields.thresholdHr,
    numericFields.thresholdPowerW,
    numericFields.maxPowerW,
    numericFields.cp2MinW,
    numericFields.cp5MinW,
    numericFields.cp20MinW,
    numericFields.vo2Max,
    numericFields.vo2MaxPowerW,
    numericFields.vo2MaxHr,
    JSON.stringify(zonesOverrideResult?.data || {}),
    snapshotId,
    athleteId
  );

  const updated = db.prepare('SELECT * FROM athlete_profiles WHERE id = ?').get(snapshotId);
  return res.json(buildProfileResponse(updated, getReferenceCoachId(req.user)));
});

app.delete('/api/athletes/:id/profile-history/:snapshotId', auth, (req, res) => {
  const athleteId = Number(req.params.id);
  const snapshotId = Number(req.params.snapshotId);

  if (!canAccessAthlete(req.user, athleteId)) {
    return res.status(403).json({ message: 'Non autorizzato' });
  }

  const info = db.prepare('DELETE FROM athlete_profiles WHERE id = ? AND user_id = ?').run(snapshotId, athleteId);
  if (info.changes === 0) {
    return res.status(404).json({ message: 'Snapshot non trovato' });
  }

  return res.json({ ok: true });
});

app.patch('/api/athletes/:id/profile-history/seen', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo un coach può confermare la visualizzazione' });
  }

  const athleteId = Number(req.params.id);
  const athlete = db.prepare('SELECT id, user_type AS userType FROM users WHERE id = ?').get(athleteId);
  if (!athlete) {
    return res.status(404).json({ message: 'Utente non trovato' });
  }

  if (athlete.userType !== 'athlete') {
    return res.status(400).json({ message: 'Operazione disponibile solo per utenti atleta' });
  }

  const lastProfileId = getAthleteLastProfileId(athleteId);

  db.prepare(`
    INSERT INTO coach_athlete_views (coach_id, athlete_id, last_seen_profile_id, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(coach_id, athlete_id)
    DO UPDATE SET
      last_seen_profile_id = excluded.last_seen_profile_id,
      updated_at = CURRENT_TIMESTAMP
  `).run(req.user.id, athleteId, lastProfileId);

  return res.json({ ok: true, athleteId, lastSeenProfileId: lastProfileId });
});


app.get('/api/training-objective-details', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono accedere all\'anagrafica obiettivi' });
  }

  const rows = db
    .prepare('SELECT id, name, macro_area AS macroArea, created_at AS createdAt FROM training_objective_details ORDER BY macro_area ASC, name ASC')
    .all();
  return res.json(rows);
});

app.post('/api/training-objective-details', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono creare obiettivi' });
  }

  const name = req.body?.name?.trim();
  const macroArea = req.body?.macroArea?.trim().toLowerCase();
  if (!name || !macroArea) {
    return res.status(400).json({ message: 'name e macroArea sono obbligatori' });
  }
  if (!TRAINING_MACRO_AREAS.has(macroArea)) {
    return res.status(400).json({ message: 'Macro area non valida' });
  }

  try {
    const info = db.prepare('INSERT INTO training_objective_details (name, macro_area) VALUES (?, ?)').run(name, macroArea);
    const created = db.prepare('SELECT id, name, macro_area AS macroArea, created_at AS createdAt FROM training_objective_details WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json(created);
  } catch {
    return res.status(409).json({ message: 'Dettaglio obiettivo già esistente' });
  }
});

app.put('/api/training-objective-details/:id', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono modificare obiettivi' });
  }

  const objectiveId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM training_objective_details WHERE id = ?').get(objectiveId);
  if (!existing) return res.status(404).json({ message: 'Dettaglio obiettivo non trovato' });

  const name = req.body?.name?.trim();
  const macroArea = req.body?.macroArea?.trim().toLowerCase();
  if (!name || !macroArea) {
    return res.status(400).json({ message: 'name e macroArea sono obbligatori' });
  }
  if (!TRAINING_MACRO_AREAS.has(macroArea)) {
    return res.status(400).json({ message: 'Macro area non valida' });
  }

  try {
    db.prepare('UPDATE training_objective_details SET name = ?, macro_area = ? WHERE id = ?').run(name, macroArea, objectiveId);
    const updated = db.prepare('SELECT id, name, macro_area AS macroArea, created_at AS createdAt FROM training_objective_details WHERE id = ?').get(objectiveId);
    return res.json(updated);
  } catch {
    return res.status(409).json({ message: 'Dettaglio obiettivo già esistente' });
  }
});

app.post('/api/training-objective-details/:id/duplicate', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono duplicare obiettivi' });
  }

  const objectiveId = Number(req.params.id);
  const existing = db.prepare('SELECT id, name, macro_area AS macroArea FROM training_objective_details WHERE id = ?').get(objectiveId);
  if (!existing) return res.status(404).json({ message: 'Dettaglio obiettivo non trovato' });

  let candidateName = `${existing.name} (copia)`;
  let suffix = 2;
  while (db.prepare('SELECT id FROM training_objective_details WHERE name = ? AND macro_area = ?').get(candidateName, existing.macroArea)) {
    candidateName = `${existing.name} (copia ${suffix})`;
    suffix += 1;
  }

  const info = db.prepare('INSERT INTO training_objective_details (name, macro_area) VALUES (?, ?)').run(candidateName, existing.macroArea);
  const duplicated = db.prepare('SELECT id, name, macro_area AS macroArea, created_at AS createdAt FROM training_objective_details WHERE id = ?').get(info.lastInsertRowid);
  return res.status(201).json(duplicated);
});

app.delete('/api/training-objective-details/:id', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono eliminare obiettivi' });
  }

  const objectiveId = Number(req.params.id);
  const linked = db.prepare('SELECT id FROM training_method_objective_details WHERE objective_detail_id = ? LIMIT 1').get(objectiveId);
  if (linked) {
    return res.status(409).json({ message: 'Impossibile eliminare: dettaglio obiettivo già associato a metodi esistenti' });
  }

  const info = db.prepare('DELETE FROM training_objective_details WHERE id = ?').run(objectiveId);
  if (info.changes === 0) return res.status(404).json({ message: 'Dettaglio obiettivo non trovato' });
  return res.json({ ok: true });
});


app.get('/api/training-categories', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono accedere alle categorie' });
  }

  const rows = db
    .prepare('SELECT id, name, created_at AS createdAt FROM training_categories ORDER BY name ASC')
    .all();
  return res.json(rows);
});

app.post('/api/training-categories', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono creare categorie' });
  }

  const name = req.body?.name?.trim();
  if (!name) {
    return res.status(400).json({ message: 'name è obbligatorio' });
  }

  try {
    const info = db.prepare('INSERT INTO training_categories (name) VALUES (?)').run(name);
    const created = db.prepare('SELECT id, name, created_at AS createdAt FROM training_categories WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json(created);
  } catch {
    return res.status(409).json({ message: 'Categoria già esistente' });
  }
});

app.put('/api/training-categories/:id', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono modificare categorie' });
  }

  const categoryId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM training_categories WHERE id = ?').get(categoryId);
  if (!existing) return res.status(404).json({ message: 'Categoria non trovata' });

  const name = req.body?.name?.trim();
  if (!name) {
    return res.status(400).json({ message: 'name è obbligatorio' });
  }

  try {
    db.prepare('UPDATE training_categories SET name = ? WHERE id = ?').run(name, categoryId);
    const updated = db.prepare('SELECT id, name, created_at AS createdAt FROM training_categories WHERE id = ?').get(categoryId);
    return res.json(updated);
  } catch {
    return res.status(409).json({ message: 'Categoria già esistente' });
  }
});

app.post('/api/training-categories/:id/duplicate', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono duplicare categorie' });
  }

  const categoryId = Number(req.params.id);
  const existing = db.prepare('SELECT id, name FROM training_categories WHERE id = ?').get(categoryId);
  if (!existing) return res.status(404).json({ message: 'Categoria non trovata' });

  let candidateName = `${existing.name} (copia)`;
  let suffix = 2;
  while (db.prepare('SELECT id FROM training_categories WHERE name = ?').get(candidateName)) {
    candidateName = `${existing.name} (copia ${suffix})`;
    suffix += 1;
  }

  const info = db.prepare('INSERT INTO training_categories (name) VALUES (?)').run(candidateName);
  const duplicated = db.prepare('SELECT id, name, created_at AS createdAt FROM training_categories WHERE id = ?').get(info.lastInsertRowid);
  return res.status(201).json(duplicated);
});

app.delete('/api/training-categories/:id', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono eliminare categorie' });
  }

  const categoryId = Number(req.params.id);
  const linked = db.prepare('SELECT id FROM training_method_categories WHERE category_id = ? LIMIT 1').get(categoryId);
  if (linked) {
    return res.status(409).json({ message: 'Impossibile eliminare: categoria già associata a metodi esistenti' });
  }

  const info = db.prepare('DELETE FROM training_categories WHERE id = ?').run(categoryId);
  if (info.changes === 0) return res.status(404).json({ message: 'Categoria non trovata' });
  return res.json({ ok: true });
});


app.get('/api/athlete-categories', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono accedere alle categorie atleta' });
  }

  const rows = db.prepare('SELECT id, name, created_at AS createdAt FROM athlete_categories ORDER BY name ASC').all();
  return res.json(rows);
});

app.post('/api/athlete-categories', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono creare categorie atleta' });
  }

  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ message: 'name è obbligatorio' });

  try {
    const info = db.prepare('INSERT INTO athlete_categories (name) VALUES (?)').run(name);
    const created = db.prepare('SELECT id, name, created_at AS createdAt FROM athlete_categories WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json(created);
  } catch {
    return res.status(409).json({ message: 'Categoria atleta già esistente' });
  }
});

app.put('/api/athlete-categories/:id', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono modificare categorie atleta' });
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM athlete_categories WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ message: 'Categoria atleta non trovata' });
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ message: 'name è obbligatorio' });
  try {
    db.prepare('UPDATE athlete_categories SET name = ? WHERE id = ?').run(name, id);
    return res.json(db.prepare('SELECT id, name, created_at AS createdAt FROM athlete_categories WHERE id = ?').get(id));
  } catch {
    return res.status(409).json({ message: 'Categoria atleta già esistente' });
  }
});

app.delete('/api/athlete-categories/:id', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono eliminare categorie atleta' });
  const id = Number(req.params.id);
  const linked = db.prepare('SELECT athlete_id FROM athlete_category_assignments WHERE category_id = ? LIMIT 1').get(id);
  if (linked) return res.status(409).json({ message: 'Categoria atleta associata ad atleti esistenti' });
  const info = db.prepare('DELETE FROM athlete_categories WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ message: 'Categoria atleta non trovata' });
  return res.json({ ok: true });
});

app.get('/api/disciplines', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono accedere alle discipline' });
  }

  const rows = db.prepare('SELECT id, name, created_at AS createdAt FROM disciplines ORDER BY name ASC').all();
  return res.json(rows);
});

app.post('/api/disciplines', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono creare discipline' });
  }

  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ message: 'name è obbligatorio' });

  try {
    const info = db.prepare('INSERT INTO disciplines (name) VALUES (?)').run(name);
    const created = db.prepare('SELECT id, name, created_at AS createdAt FROM disciplines WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json(created);
  } catch {
    return res.status(409).json({ message: 'Disciplina già esistente' });
  }
});

app.put('/api/disciplines/:id', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono modificare discipline' });
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM disciplines WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ message: 'Disciplina non trovata' });
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ message: 'name è obbligatorio' });
  try {
    db.prepare('UPDATE disciplines SET name = ? WHERE id = ?').run(name, id);
    return res.json(db.prepare('SELECT id, name, created_at AS createdAt FROM disciplines WHERE id = ?').get(id));
  } catch {
    return res.status(409).json({ message: 'Disciplina già esistente' });
  }
});

app.delete('/api/disciplines/:id', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono eliminare discipline' });
  const id = Number(req.params.id);
  const linkedAthlete = db.prepare('SELECT athlete_id FROM athlete_discipline_assignments WHERE discipline_id = ? LIMIT 1').get(id);
  const linkedMethod = db.prepare('SELECT training_method_id FROM training_method_disciplines WHERE discipline_id = ? LIMIT 1').get(id);
  if (linkedAthlete || linkedMethod) return res.status(409).json({ message: 'Disciplina associata a record esistenti' });
  const info = db.prepare('DELETE FROM disciplines WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ message: 'Disciplina non trovata' });
  return res.json({ ok: true });
});


app.get('/api/athletes/:id/profile-meta', auth, (req, res) => {
  const athleteId = Number(req.params.id);
  if (!canAccessAthlete(req.user, athleteId)) return res.status(403).json({ message: 'Non autorizzato' });
  const athlete = db.prepare(`
    SELECT id, user_type AS userType, athlete_metabolic_profile AS metabolicProfile, athlete_performance_profile AS performanceProfile
    FROM users
    WHERE id = ?
  `).get(athleteId);
  if (!athlete) return res.status(404).json({ message: 'Utente non trovato' });
  if (athlete.userType !== 'athlete') return res.status(400).json({ message: 'Utente non atleta' });
  return res.json({ metabolicProfile: athlete.metabolicProfile, performanceProfile: athlete.performanceProfile });
});

app.put('/api/athletes/:id/profile-meta', auth, (req, res) => {
  const athleteId = Number(req.params.id);
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono aggiornare il profilo atleta' });
  const athlete = db.prepare("SELECT id, user_type AS userType FROM users WHERE id = ?").get(athleteId);
  if (!athlete) return res.status(404).json({ message: 'Utente non trovato' });
  if (athlete.userType !== 'athlete') return res.status(400).json({ message: 'Utente non atleta' });

  const metabolicProfile = req.body?.metabolicProfile?.trim().toLowerCase() || null;
  const performanceProfile = req.body?.performanceProfile?.trim().toLowerCase() || null;
  if (metabolicProfile && !ATHLETE_METABOLIC_PROFILES.has(metabolicProfile)) return res.status(400).json({ message: 'Profilo metabolico non valido' });
  if (performanceProfile && !ATHLETE_PERFORMANCE_PROFILES.has(performanceProfile)) return res.status(400).json({ message: 'Profilo prestativo non valido' });

  db.prepare('UPDATE users SET athlete_metabolic_profile = ?, athlete_performance_profile = ? WHERE id = ?').run(metabolicProfile, performanceProfile, athleteId);
  return res.json({ metabolicProfile, performanceProfile });
});

app.get('/api/coaches/zone-config', auth, (req, res) => {
  const coachId = getReferenceCoachId(req.user);
  return res.json({ zones: loadCoachZoneRules(coachId) });
});

app.put('/api/coaches/zone-config', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono aggiornare le zone' });

  const zones = Array.isArray(req.body?.zones) ? req.body.zones : [];
  if (zones.length !== ZONE_RULES.length) return res.status(400).json({ message: 'Configurazione zone incompleta' });

  const normalized = zones.map((zone) => ({
    zone: zone.zone,
    min: Number(zone.min),
    max: zone.max === null || zone.max === '' ? null : Number(zone.max)
  }));

  for (const zone of normalized) {
    if (!zone.zone || Number.isNaN(zone.min) || (zone.max !== null && Number.isNaN(zone.max))) {
      return res.status(400).json({ message: `Valori non validi per ${zone.zone || 'zona'}` });
    }
  }

  db.prepare('DELETE FROM coach_zone_configs WHERE coach_id = ?').run(req.user.id);
  normalized.forEach((zone) => {
    db.prepare('INSERT INTO coach_zone_configs (coach_id, metric, zone, min_pct, max_pct) VALUES (?, ?, ?, ?, ?)').run(req.user.id, 'hr', zone.zone, zone.min, zone.max);
    db.prepare('INSERT INTO coach_zone_configs (coach_id, metric, zone, min_pct, max_pct) VALUES (?, ?, ?, ?, ?)').run(req.user.id, 'power', zone.zone, zone.min, zone.max);
  });

  return res.json({ zones: loadCoachZoneRules(req.user.id) });
});

app.get('/api/athletes/:id/taxonomy', auth, (req, res) => {
  const athleteId = Number(req.params.id);
  if (!canAccessAthlete(req.user, athleteId)) return res.status(403).json({ message: 'Non autorizzato' });
  const athlete = db.prepare("SELECT id, user_type AS userType FROM users WHERE id = ?").get(athleteId);
  if (!athlete) return res.status(404).json({ message: 'Utente non trovato' });
  if (athlete.userType !== 'athlete') return res.status(400).json({ message: 'Utente non atleta' });
  return res.json(loadAthleteAssignments(athleteId));
});

app.put('/api/athletes/:id/taxonomy', auth, (req, res) => {
  const athleteId = Number(req.params.id);
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono aggiornare categorie e discipline atleta' });
  const athlete = db.prepare("SELECT id, user_type AS userType FROM users WHERE id = ?").get(athleteId);
  if (!athlete) return res.status(404).json({ message: 'Utente non trovato' });
  if (athlete.userType !== 'athlete') return res.status(400).json({ message: 'Utente non atleta' });

  const categoryIds = uniqueIds(req.body?.categoryIds || []);
  const disciplineIds = uniqueIds(req.body?.disciplineIds || []);

  db.prepare('DELETE FROM athlete_category_assignments WHERE athlete_id = ?').run(athleteId);
  db.prepare('DELETE FROM athlete_discipline_assignments WHERE athlete_id = ?').run(athleteId);

  categoryIds.forEach((id) => db.prepare('INSERT INTO athlete_category_assignments (athlete_id, category_id) VALUES (?, ?)').run(athleteId, id));
  disciplineIds.forEach((id) => db.prepare('INSERT INTO athlete_discipline_assignments (athlete_id, discipline_id) VALUES (?, ?)').run(athleteId, id));

  return res.json(loadAthleteAssignments(athleteId));
});


app.get('/api/training-exercises', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono accedere agli esercizi' });
  const rows = db.prepare('SELECT id, name, created_at AS createdAt FROM training_exercises ORDER BY name ASC').all();
  return res.json(rows);
});

app.post('/api/training-exercises', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono creare esercizi' });
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ message: 'name è obbligatorio' });
  try {
    const info = db.prepare('INSERT INTO training_exercises (name) VALUES (?)').run(name);
    const created = db.prepare('SELECT id, name, created_at AS createdAt FROM training_exercises WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json(created);
  } catch {
    return res.status(409).json({ message: 'Esercizio già esistente' });
  }
});

app.put('/api/training-exercises/:id', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono modificare esercizi' });
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM training_exercises WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ message: 'Esercizio non trovato' });
  const name = req.body?.name?.trim();
  if (!name) return res.status(400).json({ message: 'name è obbligatorio' });
  try {
    db.prepare('UPDATE training_exercises SET name = ? WHERE id = ?').run(name, id);
    return res.json(db.prepare('SELECT id, name, created_at AS createdAt FROM training_exercises WHERE id = ?').get(id));
  } catch {
    return res.status(409).json({ message: 'Esercizio già esistente' });
  }
});

app.delete('/api/training-exercises/:id', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo i coach possono eliminare esercizi' });
  const id = Number(req.params.id);
  const linked = db.prepare('SELECT id FROM training_method_intervals WHERE exercise_id = ? LIMIT 1').get(id);
  if (linked) return res.status(409).json({ message: 'Esercizio associato a metodi esistenti' });
  const info = db.prepare('DELETE FROM training_exercises WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ message: 'Esercizio non trovato' });
  return res.json({ ok: true });
});

app.get('/api/training-methods', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono accedere ai metodi' });
  }

  const rows = db.prepare('SELECT * FROM training_methods WHERE coach_id = ? ORDER BY created_at DESC, id DESC').all(req.user.id);
  return res.json(rows.map(mapTrainingMethod));
});

app.post('/api/training-methods', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono creare metodi' });
  }

  const payload = req.body || {};
  const validationError = validateTrainingMethodPayload(payload);
  if (validationError) return res.status(400).json({ message: validationError });

  const objectiveIds = uniqueIds(payload.objectiveDetailIds);
  const categoryIds = uniqueIds(payload.categoryIds);
  const disciplineIds = uniqueIds(payload.disciplineIds);
  if (objectiveIds.length === 0) return res.status(400).json({ message: 'Dettagli obiettivo non validi' });
  if (categoryIds.length === 0) return res.status(400).json({ message: 'Categorie non valide' });
  if (disciplineIds.length === 0) return res.status(400).json({ message: 'Discipline non valide' });

  const foundObjectiveCount = db.prepare(`SELECT COUNT(*) AS count FROM training_objective_details WHERE id IN (${objectiveIds.map(() => '?').join(',')})`).get(...objectiveIds).count;
  if (foundObjectiveCount !== objectiveIds.length) return res.status(400).json({ message: 'Dettaglio obiettivo non trovato' });
  const foundCategoryCount = db.prepare(`SELECT COUNT(*) AS count FROM training_categories WHERE id IN (${categoryIds.map(() => '?').join(',')})`).get(...categoryIds).count;
  if (foundCategoryCount !== categoryIds.length) return res.status(400).json({ message: 'Categoria non trovata' });
  const foundDisciplineCount = db.prepare(`SELECT COUNT(*) AS count FROM disciplines WHERE id IN (${disciplineIds.map(() => '?').join(',')})`).get(...disciplineIds).count;
  if (foundDisciplineCount !== disciplineIds.length) return res.status(400).json({ message: 'Disciplina non trovata' });

  if (payload.trainingMode !== 'in_bici') {
    const exerciseIds = uniqueIds(payload.sets.flatMap((set) => (set.intervals || []).map((interval) => interval.exerciseId)));
    const foundExerciseCount = exerciseIds.length > 0
      ? db.prepare(`SELECT COUNT(*) AS count FROM training_exercises WHERE id IN (${exerciseIds.map(() => '?').join(',')})`).get(...exerciseIds).count
      : 0;
    if (foundExerciseCount !== exerciseIds.length) return res.status(400).json({ message: 'Esercizio non trovato' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO training_methods (coach_id, name, code, macro_area, objective_detail_id, category, period, notes, method_type, training_mode, progression_increment_pct, progression_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      payload.name.trim(),
      payload.code.trim(),
      payload.macroArea,
      objectiveIds[0],
      categoryIds.join(','),
      payload.period,
      payload.notes?.trim() || null,
      payload.methodType,
      payload.trainingMode,
      payload.progressionIncrementPct ? Number(payload.progressionIncrementPct) : null,
      payload.progression ? JSON.stringify(payload.progression) : null
    );

    objectiveIds.forEach((objectiveId) => {
      db.prepare('INSERT INTO training_method_objective_details (training_method_id, objective_detail_id) VALUES (?, ?)').run(info.lastInsertRowid, objectiveId);
    });

    categoryIds.forEach((categoryId) => {
      db.prepare('INSERT INTO training_method_categories (training_method_id, category_id) VALUES (?, ?)').run(info.lastInsertRowid, categoryId);
    });

    disciplineIds.forEach((disciplineId) => {
      db.prepare('INSERT INTO training_method_disciplines (training_method_id, discipline_id) VALUES (?, ?)').run(info.lastInsertRowid, disciplineId);
    });

    for (let setIndex = 0; setIndex < payload.sets.length; setIndex += 1) {
      const set = payload.sets[setIndex];
      const recovery = secondsFromParts(set.recoveryMinutes, set.recoverySeconds);
      const setInfo = db.prepare('INSERT INTO training_method_sets (training_method_id, set_order, series_count, recovery_seconds) VALUES (?, ?, ?, ?)').run(
        info.lastInsertRowid,
        setIndex + 1,
        Number(set.seriesCount),
        recovery
      );

      for (let intervalIndex = 0; intervalIndex < set.intervals.length; intervalIndex += 1) {
        const interval = set.intervals[intervalIndex];
        db.prepare(`
          INSERT INTO training_method_intervals (set_id, interval_order, duration_seconds, intensity_zone, rpm, rpe, exercise_id, recovery_seconds, description, overload_pct)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          setInfo.lastInsertRowid,
          intervalIndex + 1,
          secondsFromParts(interval.minutes, interval.seconds),
          payload.trainingMode === 'in_bici' ? interval.intensityZone?.trim() || null : null,
          payload.trainingMode === 'in_bici' ? (interval.rpm === '' || interval.rpm === null || interval.rpm === undefined ? null : Number(interval.rpm)) : null,
          payload.trainingMode === 'in_bici' ? (interval.rpe === '' || interval.rpe === null || interval.rpe === undefined ? null : Number(interval.rpe)) : null,
          payload.trainingMode === 'in_bici' ? null : Number(interval.exerciseId),
          payload.trainingMode === 'in_bici' ? null : secondsFromParts(interval.intervalRecoveryMinutes, interval.intervalRecoverySeconds),
          payload.trainingMode === 'in_bici' ? null : (interval.description?.trim() || null),
          payload.trainingMode === 'in_bici' ? null : (interval.overloadPct === '' || interval.overloadPct === null || interval.overloadPct === undefined ? null : Number(interval.overloadPct))
        );
      }
    }

    const created = db.prepare('SELECT * FROM training_methods WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json(mapTrainingMethod(created));
  } catch {
    return res.status(409).json({ message: 'Codice metodo già esistente per questo coach' });
  }
});

app.put('/api/training-methods/:id', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono modificare metodi' });
  }

  const methodId = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM training_methods WHERE id = ? AND coach_id = ?').get(methodId, req.user.id);
  if (!existing) return res.status(404).json({ message: 'Metodo non trovato' });

  const payload = req.body || {};
  const validationError = validateTrainingMethodPayload(payload);
  if (validationError) return res.status(400).json({ message: validationError });

  const objectiveIds = uniqueIds(payload.objectiveDetailIds);
  const categoryIds = uniqueIds(payload.categoryIds);
  const disciplineIds = uniqueIds(payload.disciplineIds);
  if (objectiveIds.length === 0) return res.status(400).json({ message: 'Dettagli obiettivo non validi' });
  if (categoryIds.length === 0) return res.status(400).json({ message: 'Categorie non valide' });
  if (disciplineIds.length === 0) return res.status(400).json({ message: 'Discipline non valide' });

  if (payload.trainingMode !== 'in_bici') {
    const exerciseIds = uniqueIds(payload.sets.flatMap((set) => (set.intervals || []).map((interval) => interval.exerciseId)));
    const foundExerciseCount = exerciseIds.length > 0
      ? db.prepare(`SELECT COUNT(*) AS count FROM training_exercises WHERE id IN (${exerciseIds.map(() => '?').join(',')})`).get(...exerciseIds).count
      : 0;
    if (foundExerciseCount !== exerciseIds.length) return res.status(400).json({ message: 'Esercizio non trovato' });
  }

  try {
    db.prepare(`
      UPDATE training_methods
      SET name = ?, code = ?, macro_area = ?, objective_detail_id = ?, category = ?, period = ?, notes = ?, method_type = ?, training_mode = ?, progression_increment_pct = ?, progression_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND coach_id = ?
    `).run(
      payload.name.trim(),
      payload.code.trim(),
      payload.macroArea,
      objectiveIds[0],
      categoryIds.join(','),
      payload.period,
      payload.notes?.trim() || null,
      payload.methodType,
      payload.trainingMode,
      payload.progressionIncrementPct ? Number(payload.progressionIncrementPct) : null,
      payload.progression ? JSON.stringify(payload.progression) : null,
      methodId,
      req.user.id
    );

    db.prepare('DELETE FROM training_method_objective_details WHERE training_method_id = ?').run(methodId);
    db.prepare('DELETE FROM training_method_categories WHERE training_method_id = ?').run(methodId);
    db.prepare('DELETE FROM training_method_disciplines WHERE training_method_id = ?').run(methodId);
    db.prepare('DELETE FROM training_method_intervals WHERE set_id IN (SELECT id FROM training_method_sets WHERE training_method_id = ?)').run(methodId);
    db.prepare('DELETE FROM training_method_sets WHERE training_method_id = ?').run(methodId);

    objectiveIds.forEach((objectiveId) => {
      db.prepare('INSERT INTO training_method_objective_details (training_method_id, objective_detail_id) VALUES (?, ?)').run(methodId, objectiveId);
    });

    categoryIds.forEach((categoryId) => {
      db.prepare('INSERT INTO training_method_categories (training_method_id, category_id) VALUES (?, ?)').run(methodId, categoryId);
    });

    disciplineIds.forEach((disciplineId) => {
      db.prepare('INSERT INTO training_method_disciplines (training_method_id, discipline_id) VALUES (?, ?)').run(methodId, disciplineId);
    });

    for (let setIndex = 0; setIndex < payload.sets.length; setIndex += 1) {
      const set = payload.sets[setIndex];
      const recovery = secondsFromParts(set.recoveryMinutes, set.recoverySeconds);
      const setInfo = db.prepare('INSERT INTO training_method_sets (training_method_id, set_order, series_count, recovery_seconds) VALUES (?, ?, ?, ?)').run(
        methodId,
        setIndex + 1,
        Number(set.seriesCount),
        recovery
      );

      for (let intervalIndex = 0; intervalIndex < set.intervals.length; intervalIndex += 1) {
        const interval = set.intervals[intervalIndex];
        db.prepare('INSERT INTO training_method_intervals (set_id, interval_order, duration_seconds, intensity_zone, rpm, rpe, exercise_id, recovery_seconds, description, overload_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          setInfo.lastInsertRowid,
          intervalIndex + 1,
          secondsFromParts(interval.minutes, interval.seconds),
          payload.trainingMode === 'in_bici' ? interval.intensityZone?.trim() || null : null,
          payload.trainingMode === 'in_bici' ? (interval.rpm === '' || interval.rpm === null || interval.rpm === undefined ? null : Number(interval.rpm)) : null,
          payload.trainingMode === 'in_bici' ? (interval.rpe === '' || interval.rpe === null || interval.rpe === undefined ? null : Number(interval.rpe)) : null,
          payload.trainingMode === 'in_bici' ? null : Number(interval.exerciseId),
          payload.trainingMode === 'in_bici' ? null : secondsFromParts(interval.intervalRecoveryMinutes, interval.intervalRecoverySeconds),
          payload.trainingMode === 'in_bici' ? null : (interval.description?.trim() || null),
          payload.trainingMode === 'in_bici' ? null : (interval.overloadPct === '' || interval.overloadPct === null || interval.overloadPct === undefined ? null : Number(interval.overloadPct))
        );
      }
    }

    const updated = db.prepare('SELECT * FROM training_methods WHERE id = ?').get(methodId);
    return res.json(mapTrainingMethod(updated));
  } catch {
    return res.status(409).json({ message: 'Codice metodo già esistente per questo coach' });
  }
});

app.post('/api/training-methods/:id/duplicate', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono duplicare metodi' });
  }

  const methodId = Number(req.params.id);
  const source = db.prepare('SELECT * FROM training_methods WHERE id = ? AND coach_id = ?').get(methodId, req.user.id);
  if (!source) return res.status(404).json({ message: 'Metodo non trovato' });

  const sourceMapped = mapTrainingMethod(source);
  const newCode = `${source.code}-copy-${Date.now()}`;
  const copyInfo = db.prepare(`
    INSERT INTO training_methods (coach_id, name, code, macro_area, objective_detail_id, category, period, notes, method_type, training_mode, progression_increment_pct, progression_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    `${source.name} (Copia)`,
    newCode,
    source.macro_area,
    source.objective_detail_id,
    source.category,
    source.period,
    source.notes,
    source.method_type,
    source.training_mode || 'in_bici',
    source.progression_increment_pct,
    source.progression_json
  );

  sourceMapped.objectiveDetailIds.forEach((objectiveId) => {
    db.prepare('INSERT INTO training_method_objective_details (training_method_id, objective_detail_id) VALUES (?, ?)').run(copyInfo.lastInsertRowid, objectiveId);
  });

  sourceMapped.categoryIds.forEach((categoryId) => {
    db.prepare('INSERT INTO training_method_categories (training_method_id, category_id) VALUES (?, ?)').run(copyInfo.lastInsertRowid, categoryId);
  });

  sourceMapped.disciplineIds.forEach((disciplineId) => {
    db.prepare('INSERT INTO training_method_disciplines (training_method_id, discipline_id) VALUES (?, ?)').run(copyInfo.lastInsertRowid, disciplineId);
  });

  sourceMapped.sets.forEach((set, setIndex) => {
    const setInfo = db.prepare('INSERT INTO training_method_sets (training_method_id, set_order, series_count, recovery_seconds) VALUES (?, ?, ?, ?)').run(
      copyInfo.lastInsertRowid,
      setIndex + 1,
      set.seriesCount,
      set.recoverySeconds
    );

    set.intervals.forEach((interval, intervalIndex) => {
      db.prepare('INSERT INTO training_method_intervals (set_id, interval_order, duration_seconds, intensity_zone, rpm, rpe, exercise_id, recovery_seconds, description, overload_pct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        setInfo.lastInsertRowid,
        intervalIndex + 1,
        interval.durationSeconds,
        interval.intensityZone,
        interval.rpm,
        interval.rpe,
        interval.exerciseId || null,
        interval.recoverySeconds || null,
        interval.description || null,
        interval.overloadPct || null
      );
    });
  });

  const created = db.prepare('SELECT * FROM training_methods WHERE id = ?').get(copyInfo.lastInsertRowid);
  return res.status(201).json(mapTrainingMethod(created));
});

app.delete('/api/training-methods/:id', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo i coach possono eliminare metodi' });
  }

  const methodId = Number(req.params.id);
  const info = db.prepare('DELETE FROM training_methods WHERE id = ? AND coach_id = ?').run(methodId, req.user.id);
  if (info.changes === 0) return res.status(404).json({ message: 'Metodo non trovato' });
  return res.json({ ok: true });
});


app.get('/api/monthly-plans', auth, (req, res) => {
  try {
    if (isCoach(req.user)) {
      const rows = db.prepare('SELECT * FROM monthly_plans WHERE coach_id = ? ORDER BY updated_at DESC, id DESC').all(req.user.id);
      const assignments = db.prepare('SELECT plan_id AS planId, athlete_id AS athleteId FROM monthly_plan_assignments WHERE plan_id IN (SELECT id FROM monthly_plans WHERE coach_id = ?)').all(req.user.id);
      const athleteMapByPlan = assignments.reduce((acc, row) => {
        acc[row.planId] = acc[row.planId] || [];
        acc[row.planId].push(row.athleteId);
        return acc;
      }, {});

      return res.json(rows.map((row) => ({ ...mapMonthlyPlan(row), athleteIds: athleteMapByPlan[row.id] || [] })));
    }

    const assignmentRows = db.prepare(`
      SELECT p.*, a.custom_plan_json AS customPlanJson, a.updated_at AS assignmentUpdatedAt
      FROM monthly_plan_assignments a
      JOIN monthly_plans p ON p.id = a.plan_id
      WHERE a.athlete_id = ?
      ORDER BY a.updated_at DESC
    `).all(req.user.id);

    return res.json(assignmentRows.map((row) => mapMonthlyPlan(
      row,
      { custom_plan_json: row.customPlanJson, updated_at: row.assignmentUpdatedAt }
    )));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post('/api/monthly-plans', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo coach' });

  const name = req.body?.name?.trim();
  const normalizedPlan = sanitizeMonthlyPlanGrid(req.body?.plan);
  const athleteIds = uniqueIds(req.body?.athleteIds || []);

  if (!name) return res.status(400).json({ message: 'Nome tabella obbligatorio' });
  if (!normalizedPlan) return res.status(400).json({ message: 'Formato tabella non valido' });

  try {
    const now = new Date().toISOString();
    const insert = db.prepare('INSERT INTO monthly_plans (coach_id, name, plan_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
      req.user.id,
      name,
      JSON.stringify(normalizedPlan),
      now,
      now
    );

    const planId = insert.lastInsertRowid;
    const assignmentStmt = db.prepare('INSERT OR REPLACE INTO monthly_plan_assignments (plan_id, athlete_id, custom_plan_json, updated_at) VALUES (?, ?, COALESCE((SELECT custom_plan_json FROM monthly_plan_assignments WHERE plan_id = ? AND athlete_id = ?), NULL), ?)');

    const tx = db.transaction(() => {
      athleteIds.forEach((athleteId) => assignmentStmt.run(planId, athleteId, planId, athleteId, now));
    });
    tx();

    const row = db.prepare('SELECT * FROM monthly_plans WHERE id = ?').get(planId);
    return res.status(201).json({ ...mapMonthlyPlan(row), athleteIds });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put('/api/monthly-plans/:id', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo coach' });

  const planId = Number(req.params.id);
  if (!Number.isInteger(planId) || planId <= 0) return res.status(400).json({ message: 'Piano non valido' });

  const current = db.prepare('SELECT * FROM monthly_plans WHERE id = ? AND coach_id = ?').get(planId, req.user.id);
  if (!current) return res.status(404).json({ message: 'Tabella non trovata' });

  const name = req.body?.name?.trim();
  const normalizedPlan = sanitizeMonthlyPlanGrid(req.body?.plan);
  const athleteIds = uniqueIds(req.body?.athleteIds || []);

  if (!name) return res.status(400).json({ message: 'Nome tabella obbligatorio' });
  if (!normalizedPlan) return res.status(400).json({ message: 'Formato tabella non valido' });

  try {
    const now = new Date().toISOString();
    db.prepare('UPDATE monthly_plans SET name = ?, plan_json = ?, updated_at = ? WHERE id = ?').run(name, JSON.stringify(normalizedPlan), now, planId);

    const existing = db.prepare('SELECT athlete_id AS athleteId FROM monthly_plan_assignments WHERE plan_id = ?').all(planId).map((row) => row.athleteId);
    const toDelete = existing.filter((id) => !athleteIds.includes(id));
    const toUpsert = athleteIds;

    const upsertStmt = db.prepare('INSERT INTO monthly_plan_assignments (plan_id, athlete_id, custom_plan_json, updated_at) VALUES (?, ?, NULL, ?) ON CONFLICT(plan_id, athlete_id) DO UPDATE SET updated_at = excluded.updated_at');
    const deleteStmt = db.prepare('DELETE FROM monthly_plan_assignments WHERE plan_id = ? AND athlete_id = ?');

    const tx = db.transaction(() => {
      toUpsert.forEach((athleteId) => upsertStmt.run(planId, athleteId, now));
      toDelete.forEach((athleteId) => deleteStmt.run(planId, athleteId));
    });
    tx();

    const row = db.prepare('SELECT * FROM monthly_plans WHERE id = ?').get(planId);
    return res.json({ ...mapMonthlyPlan(row), athleteIds });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.put('/api/monthly-plans/:id/athletes/:athleteId', auth, (req, res) => {
  if (!isCoach(req.user)) return res.status(403).json({ message: 'Solo coach' });

  const planId = Number(req.params.id);
  const athleteId = Number(req.params.athleteId);
  if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(athleteId) || athleteId <= 0) {
    return res.status(400).json({ message: 'Parametri non validi' });
  }

  const plan = db.prepare('SELECT * FROM monthly_plans WHERE id = ? AND coach_id = ?').get(planId, req.user.id);
  if (!plan) return res.status(404).json({ message: 'Tabella non trovata' });

  const assignment = db.prepare('SELECT * FROM monthly_plan_assignments WHERE plan_id = ? AND athlete_id = ?').get(planId, athleteId);
  if (!assignment) return res.status(404).json({ message: 'Atleta non assegnato a questa tabella' });

  const normalizedPlan = sanitizeMonthlyPlanGrid(req.body?.plan);
  if (!normalizedPlan) return res.status(400).json({ message: 'Formato tabella non valido' });

  try {
    const now = new Date().toISOString();
    db.prepare('UPDATE monthly_plan_assignments SET custom_plan_json = ?, updated_at = ? WHERE plan_id = ? AND athlete_id = ?').run(JSON.stringify(normalizedPlan), now, planId, athleteId);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get('/api/monthly-plans/:id/athletes/:athleteId', auth, (req, res) => {
  const planId = Number(req.params.id);
  const athleteId = Number(req.params.athleteId);
  if (!Number.isInteger(planId) || planId <= 0 || !Number.isInteger(athleteId) || athleteId <= 0) {
    return res.status(400).json({ message: 'Parametri non validi' });
  }

  const plan = db.prepare('SELECT * FROM monthly_plans WHERE id = ?').get(planId);
  if (!plan) return res.status(404).json({ message: 'Tabella non trovata' });

  if (!isCoach(req.user) && req.user.id !== athleteId) {
    return res.status(403).json({ message: 'Non autorizzato' });
  }

  if (isCoach(req.user) && plan.coach_id !== req.user.id) {
    return res.status(403).json({ message: 'Non autorizzato' });
  }

  const assignment = db.prepare('SELECT * FROM monthly_plan_assignments WHERE plan_id = ? AND athlete_id = ?').get(planId, athleteId);
  if (!assignment) return res.status(404).json({ message: 'Assegnazione non trovata' });

  return res.json({
    ...mapMonthlyPlan(plan, assignment),
    athleteId,
    compactDetails: JSON.parse(JSON.stringify((db.prepare('SELECT * FROM training_methods WHERE coach_id = ?').all(plan.coach_id).map((m) => {
      const full = mapTrainingMethod(m);
      return { id: full.id, compactDetail: buildMethodCompactDetail(full), notes: full.notes || '' };
    }))))
  });
});

app.delete('/api/users/:id', auth, (req, res) => {
  if (!isCoach(req.user)) {
    return res.status(403).json({ message: 'Solo un coach può eliminare utenti' });
  }

  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(id);

  if (info.changes === 0) {
    return res.status(404).json({ message: 'Utente non trovato' });
  }

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`API avviata su http://localhost:${PORT}`);
});
