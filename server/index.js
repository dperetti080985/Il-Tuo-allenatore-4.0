import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import db from './db.js';

const app = express();
const PORT = 3001;
const JWT_SECRET = 'local-dev-secret-change-me';

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

app.get('/api/status', (_req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get();
  res.json({ hasUsers: row.count > 0, usersCount: row.count });
});

app.post('/api/users', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username e password sono obbligatori' });
  }

  try {
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    const info = stmt.run(username.trim(), password);
    res.status(201).json({ id: info.lastInsertRowid, username: username.trim() });
  } catch {
    res.status(409).json({ message: 'Utente già esistente' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Credenziali obbligatorie' });
  }

  const user = db.prepare('SELECT id, username FROM users WHERE username = ? AND password = ?').get(username.trim(), password);

  if (!user) {
    return res.status(401).json({ message: 'Credenziali non valide' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user });
});

app.get('/api/users', auth, (_req, res) => {
  const users = db.prepare('SELECT id, username, created_at FROM users ORDER BY id DESC').all();
  res.json(users);
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
