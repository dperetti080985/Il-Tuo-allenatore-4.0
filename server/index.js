import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import db from './db.js';

const app = express();
const PORT = 3001;
const JWT_SECRET = 'local-dev-secret-change-me';
const USER_TYPES = new Set(['coach', 'athlete']);

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
  userType: payload.userType?.trim().toLowerCase()
});

const validateRequiredUserFields = (user) => {
  if (!user.username || !user.password || !user.firstName || !user.lastName || !user.email || !user.phone || !user.userType) {
    return 'Tutti i campi utente sono obbligatori';
  }

  if (!USER_TYPES.has(user.userType)) {
    return 'Tipologia utente non valida';
  }

  return null;
};

const isCoach = (user) => user?.userType === 'coach';

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

const computeZones = (thresholdHr, thresholdPower) =>
  ZONE_RULES.map((rule) => {
    const hr = thresholdHr
      ? {
          min: toRounded((thresholdHr * rule.min) / 100),
          max: rule.max === null ? null : toRounded((thresholdHr * rule.max) / 100)
        }
      : null;

    const power = thresholdPower
      ? {
          min: toRounded((thresholdPower * rule.min) / 100),
          max: rule.max === null ? null : toRounded((thresholdPower * rule.max) / 100)
        }
      : null;

    return { zone: rule.zone, hr, power };
  });

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

const normalizeZoneOverride = (payload) => {
  if (!payload) return null;

  const result = {};
  for (const zoneRule of ZONE_RULES) {
    const zonePayload = payload[zoneRule.zone];
    if (!zonePayload || typeof zonePayload !== 'object') continue;

    result[zoneRule.zone] = {};

    if (zonePayload.hr) {
      const hrMin = parsePositiveNumber(zonePayload.hr.min);
      const hrMax = parsePositiveNumber(zonePayload.hr.max);
      if (Number.isNaN(hrMin) || (zonePayload.hr.max !== null && Number.isNaN(hrMax))) {
        return { error: `Override FC non valido per ${zoneRule.zone}` };
      }
      result[zoneRule.zone].hr = {
        min: hrMin,
        max: zonePayload.hr.max === null ? null : hrMax
      };
    }

    if (zonePayload.power) {
      const powerMin = parsePositiveNumber(zonePayload.power.min);
      const powerMax = parsePositiveNumber(zonePayload.power.max);
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

const buildProfileResponse = (row) => {
  const zoneOverrides = row.zones_override_json ? JSON.parse(row.zones_override_json) : {};
  const autoZones = computeZones(row.threshold_hr, row.threshold_power_w);
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
    aerobicHr: row.aerobic_hr,
    maxHr: row.max_hr,
    thresholdHr: row.threshold_hr,
    thresholdPowerW: row.threshold_power_w,
    maxPowerW: row.max_power_w,
    cp2MinW: row.cp_2_min_w,
    cp5MinW: row.cp_5_min_w,
    cp20MinW: row.cp_20_min_w,
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
      INSERT INTO users (username, password, first_name, last_name, email, phone, user_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(user.username, user.password, user.firstName, user.lastName, user.email, user.phone, user.userType);

    res.status(201).json({
      id: info.lastInsertRowid,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      userType: user.userType
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
    .prepare('SELECT id, username, first_name AS firstName, last_name AS lastName, email, phone, user_type AS userType FROM users WHERE username = ? AND password = ?')
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
    .prepare('SELECT id, username, password, first_name AS firstName, last_name AS lastName, email, phone, user_type AS userType FROM users WHERE id = ?')
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
    userType: requesterIsCoach ? payload.userType : existingUser.userType
  };

  const validationError = validateRequiredUserFields(updatedUser);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const info = db
      .prepare(`
        UPDATE users
        SET username = ?, password = ?, first_name = ?, last_name = ?, email = ?, phone = ?, user_type = ?
        WHERE id = ?
      `)
      .run(updatedUser.username, updatedUser.password, updatedUser.firstName, updatedUser.lastName, updatedUser.email, updatedUser.phone, updatedUser.userType, id);

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
    .map(buildProfileResponse);

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
    aerobicHr: parsePositiveNumber(payload.aerobicHr),
    maxHr: parsePositiveNumber(payload.maxHr),
    thresholdHr: parsePositiveNumber(payload.thresholdHr),
    thresholdPowerW: parsePositiveNumber(payload.thresholdPowerW),
    maxPowerW: parsePositiveNumber(payload.maxPowerW),
    cp2MinW: parsePositiveNumber(payload.cp2MinW),
    cp5MinW: parsePositiveNumber(payload.cp5MinW),
    cp20MinW: parsePositiveNumber(payload.cp20MinW)
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
        aerobic_hr,
        max_hr,
        threshold_hr,
        threshold_power_w,
        max_power_w,
        cp_2_min_w,
        cp_5_min_w,
        cp_20_min_w,
        zones_override_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      athleteId,
      recordedAt,
      numericFields.heightCm,
      numericFields.weightKg,
      numericFields.aerobicHr,
      numericFields.maxHr,
      numericFields.thresholdHr,
      numericFields.thresholdPowerW,
      numericFields.maxPowerW,
      numericFields.cp2MinW,
      numericFields.cp5MinW,
      numericFields.cp20MinW,
      JSON.stringify(zonesOverrideResult?.data || {})
    );

  const created = db.prepare('SELECT * FROM athlete_profiles WHERE id = ?').get(info.lastInsertRowid);
  return res.status(201).json(buildProfileResponse(created));
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
