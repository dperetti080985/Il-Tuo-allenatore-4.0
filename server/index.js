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
  email: payload.email?.trim().toLowerCase(),
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

app.get('/api/status', (_req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  res.json({ hasUsers: row.count > 0, usersCount: row.count });
});

app.post('/api/users', (req, res) => {
  const user = normalizeUserPayload(req.body);
  const validationError = validateRequiredUserFields(user);

  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO users (username, password, first_name, last_name, email, phone, user_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      user.username,
      user.password,
      user.firstName,
      user.lastName,
      user.email,
      user.phone,
      user.userType
    );

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

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user });
});

app.get('/api/users', auth, (_req, res) => {
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
  res.json(users);
});

app.put('/api/users/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const existingUser = db.prepare('SELECT id, password FROM users WHERE id = ?').get(id);

  if (!existingUser) {
    return res.status(404).json({ message: 'Utente non trovato' });
  }

  const payload = normalizeUserPayload(req.body);
  const updatedUser = {
    ...payload,
    password: payload.password || existingUser.password
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
      .run(
        updatedUser.username,
        updatedUser.password,
        updatedUser.firstName,
        updatedUser.lastName,
        updatedUser.email,
        updatedUser.phone,
        updatedUser.userType,
        id
      );

    if (info.changes === 0) {
      return res.status(404).json({ message: 'Utente non trovato' });
    }

    return res.json({ ok: true });
  } catch {
    return res.status(409).json({ message: 'Username o email già esistente' });
  }
});

app.delete('/api/users/:id', auth, (req, res) => {
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
