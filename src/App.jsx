import { useEffect, useMemo, useState } from 'react';

const api = async (url, options = {}) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Errore richiesta');
  }
  return data;
};

const emptyUserForm = {
  username: '',
  password: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  userType: 'athlete'
};

const emptyAthleteForm = {
  recordedAt: new Date().toISOString().slice(0, 10),
  heightCm: '',
  weightKg: '',
  aerobicHr: '',
  maxHr: '',
  thresholdHr: '',
  thresholdPowerW: '',
  maxPowerW: '',
  cp2MinW: '',
  cp5MinW: '',
  cp20MinW: ''
};

const parseStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const toNullableNumber = (value) => (value === '' ? null : Number(value));

const TrainingChart = ({ history, metricKey, title, color }) => {
  if (history.length < 2) return <p>Dati insufficienti per il grafico {title.toLowerCase()}.</p>;

  const points = [...history].reverse().map((item) => ({ x: item.recordedAt, y: item[metricKey] })).filter((item) => item.y != null);
  if (points.length < 2) return <p>Dati insufficienti per il grafico {title.toLowerCase()}.</p>;

  const min = Math.min(...points.map((p) => p.y));
  const max = Math.max(...points.map((p) => p.y));
  const spread = max - min || 1;
  const width = 480;
  const height = 180;
  const polyline = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * (width - 20) + 10;
      const y = height - ((point.y - min) / spread) * (height - 20) - 10;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div>
      <h4>{title}</h4>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart">
        <polyline fill="none" stroke={color} strokeWidth="3" points={polyline} />
      </svg>
      <small>
        Min: {min} | Max: {max}
      </small>
    </div>
  );
};

function App() {
  const [status, setStatus] = useState({ loading: true, hasUsers: false });
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [currentUser, setCurrentUser] = useState(parseStoredUser());
  const [mode, setMode] = useState('home');
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [createForm, setCreateForm] = useState({ ...emptyUserForm, userType: 'coach' });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState(emptyUserForm);
  const [athleteForm, setAthleteForm] = useState(emptyAthleteForm);
  const [athleteHistory, setAthleteHistory] = useState([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);

  const isEditing = useMemo(() => editingUserId !== null, [editingUserId]);
  const isCoachUser = currentUser?.userType === 'coach';
  const athleteId = isCoachUser ? selectedAthleteId : currentUser?.id;

  useEffect(() => {
    api('/api/status')
      .then((data) => {
        setStatus({ loading: false, hasUsers: data.hasUsers });
        if (!data.hasUsers) {
          setMode('setup');
        }
      })
      .catch((err) => setMessage(err.message));
  }, []);

  const loadUsers = async (authToken = token) => {
    const data = await api('/api/users', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    setUsers(data);
  };

  const loadAthleteHistory = async (id = athleteId, authToken = token) => {
    if (!id) return;
    const data = await api(`/api/athletes/${id}/profile-history`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    setAthleteHistory(data);
  };

  useEffect(() => {
    if (token && (mode === 'users-list' || mode === 'profile')) {
      loadUsers().catch((err) => setMessage(err.message));
    }
  }, [mode, token]);

  useEffect(() => {
    if (token && mode === 'athlete-profile' && athleteId) {
      loadAthleteHistory().catch((err) => setMessage(err.message));
    }
  }, [mode, token, athleteId]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const data = await api('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      setToken(data.token);
      setCurrentUser(data.user);
      setMode('dashboard');
      if (data.user.userType === 'coach') {
        setSelectedAthleteId(null);
      }
      setLoginForm({ username: '', password: '' });
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      await api('/api/users', {
        method: 'POST',
        headers,
        body: JSON.stringify(createForm)
      });

      const nextType = status.hasUsers && isCoachUser ? 'athlete' : 'coach';
      setCreateForm({ ...emptyUserForm, userType: nextType });

      const newStatus = await api('/api/status');
      setStatus({ loading: false, hasUsers: newStatus.hasUsers });

      if (!token && newStatus.hasUsers) {
        setMessage('Coach iniziale creato. Ora effettua il login dalla home.');
        setMode('home');
        return;
      }

      if (token) {
        await loadUsers();
        setMode(isCoachUser ? 'users-list' : 'profile');
      }
    } catch (err) {
      setMessage(err.message);
    }
  };

  const startEditing = (user) => {
    setEditingUserId(user.id);
    setEditForm({
      username: user.username,
      password: '',
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email || '',
      phone: user.phone,
      userType: user.userType
    });
    setMessage('');
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditForm(emptyUserForm);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!isEditing) return;

    setMessage('');
    try {
      await api(`/api/users/${editingUserId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      });
      await loadUsers();
      cancelEditing();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleSaveAthleteSnapshot = async (e) => {
    e.preventDefault();
    if (!athleteId) return;

    try {
      await api(`/api/athletes/${athleteId}/profile-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...Object.fromEntries(Object.entries(athleteForm).map(([key, value]) => [key, key === 'recordedAt' ? value : toNullableNumber(value)]))
        })
      });
      await loadAthleteHistory(athleteId);
      setAthleteForm({ ...emptyAthleteForm, recordedAt: new Date().toISOString().slice(0, 10) });
      setMessage('Snapshot atletico salvato.');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const deleteUser = async (id) => {
    try {
      await api(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (editingUserId === id) {
        cancelEditing();
      }

      await loadUsers();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const openAthleteProfile = async (id) => {
    setSelectedAthleteId(id);
    setMode('athlete-profile');
    await loadAthleteHistory(id);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setCurrentUser(null);
    setUsers([]);
    setAthleteHistory([]);
    setSelectedAthleteId(null);
    cancelEditing();
    setMode('home');
  };

  const usersTitle = isCoachUser ? 'Gestione utenti' : 'Gestione profilo';

  if (status.loading) return <main className="container">Caricamento...</main>;

  return (
    <main className="container">
      <h1>Piattaforma gestione utenti</h1>
      {message && <p className="message">{message}</p>}

      {!token && mode === 'home' && (
        <section className="card">
          <h2>Home</h2>
          {!status.hasUsers ? (
            <>
              <p>Non ci sono utenti registrati: crea il primo utente coach.</p>
              <button onClick={() => setMode('setup')}>Configura utente iniziale</button>
            </>
          ) : (
            <form onSubmit={handleLogin}>
              <label>Username<input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} required /></label>
              <label>Password<input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} required /></label>
              <button type="submit">Login</button>
            </form>
          )}
        </section>
      )}

      {!token && mode === 'setup' && (
        <section className="card">
          <h2>Setup iniziale</h2>
          <form onSubmit={handleCreateUser}>
            <label>Username<input value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required /></label>
            <label>Password<input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required /></label>
            <label>Nome<input value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} required /></label>
            <label>Cognome<input value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} required /></label>
            <label>Email<input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required /></label>
            <label>Cellulare<input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} required /></label>
            <button type="submit">Crea coach iniziale</button>
          </form>
        </section>
      )}

      {token && (
        <>
          <section className="card menu-card">
            <div className="row"><h2>Menu</h2><button onClick={logout}>Logout</button></div>
            <div className="actions">
              <button onClick={() => setMode('dashboard')}>Home</button>
              <button onClick={() => setMode(isCoachUser ? 'users-list' : 'profile')}>{isCoachUser ? 'Gestione utenti' : 'Gestione mio utente'}</button>
              {!isCoachUser && <button onClick={() => setMode('athlete-profile')}>Profilo atleta</button>}
            </div>
          </section>

          {mode === 'dashboard' && <section className="card"><h2>Home</h2><p>Pagina momentaneamente vuota.</p></section>}

          {(mode === 'users-list' || mode === 'profile' || mode === 'users-create') && (
            <section className="card">
              <div className="row"><h2>{usersTitle}</h2>{isCoachUser && mode !== 'users-create' && <button onClick={() => setMode('users-create')}>Nuovo utente</button>}</div>
              {isCoachUser && mode === 'users-create' && (
                <form onSubmit={handleCreateUser}>
                  <h3>Creazione nuovo utente</h3>
                  <label>Username<input value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required /></label>
                  <label>Password<input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required /></label>
                  <label>Nome<input value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} required /></label>
                  <label>Cognome<input value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} required /></label>
                  <label>Email<input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required /></label>
                  <label>Cellulare<input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} required /></label>
                  <label>Tipologia utente<select value={createForm.userType} onChange={(e) => setCreateForm({ ...createForm, userType: e.target.value })}><option value="athlete">Atleta</option><option value="coach">Coach</option></select></label>
                  <div className="actions"><button type="submit">Crea utente</button><button type="button" onClick={() => setMode('users-list')} className="secondary">Annulla</button></div>
                </form>
              )}

              {(mode === 'users-list' || mode === 'profile') && (
                <>
                  {isEditing && (
                    <form onSubmit={handleUpdateUser} className="edit-form">
                      <h3>Modifica utente #{editingUserId}</h3>
                      <label>Username<input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} required disabled={!isCoachUser} /></label>
                      <label>Nuova password (opzionale)<input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} /></label>
                      <label>Nome<input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} required /></label>
                      <label>Cognome<input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} required /></label>
                      <label>Email<input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required /></label>
                      <label>Cellulare<input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} required /></label>
                      {isCoachUser && <label>Tipologia utente<select value={editForm.userType} onChange={(e) => setEditForm({ ...editForm, userType: e.target.value })}><option value="athlete">Atleta</option><option value="coach">Coach</option></select></label>}
                      <div className="actions"><button type="submit">Salva modifiche</button><button type="button" onClick={cancelEditing} className="secondary">Annulla</button></div>
                    </form>
                  )}

                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>ID</th><th>Username</th><th>Nome</th><th>Cognome</th><th>Email</th><th>Cellulare</th><th>Tipologia</th><th>Azioni</th></tr></thead>
                      <tbody>
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td>{u.id}</td><td>{u.username}</td><td>{u.firstName}</td><td>{u.lastName}</td><td>{u.email}</td><td>{u.phone}</td><td>{u.userType === 'coach' ? 'Coach' : 'Atleta'}</td>
                            <td><div className="actions"><button type="button" onClick={() => startEditing(u)}>Modifica</button>{u.userType === 'athlete' && isCoachUser && <button type="button" onClick={() => openAthleteProfile(u.id)}>Profilo atleta</button>}{isCoachUser && <button type="button" onClick={() => deleteUser(u.id)} className="danger">Elimina</button>}</div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}

          {mode === 'athlete-profile' && (
            <section className="card">
              <div className="row">
                <h2>Profilo atleta</h2>
                {isCoachUser && <button onClick={() => setMode('users-list')} className="secondary">Torna utenti</button>}
              </div>
              {!athleteId ? <p>Seleziona un atleta dalla lista utenti.</p> : (
                <>
                  <form onSubmit={handleSaveAthleteSnapshot}>
                    <h3>Nuovo inserimento dati</h3>
                    {Object.entries(emptyAthleteForm).map(([field]) => (
                      <label key={field}>
                        {field}
                        <input type={field === 'recordedAt' ? 'date' : 'number'} step="any" value={athleteForm[field]} onChange={(e) => setAthleteForm({ ...athleteForm, [field]: e.target.value })} required={field === 'recordedAt'} />
                      </label>
                    ))}
                    <button type="submit">Salva snapshot</button>
                  </form>

                  <h3>Storico inserimenti</h3>
                  <TrainingChart history={athleteHistory} metricKey="weightKg" title="Andamento peso" color="#0ea5e9" />
                  <TrainingChart history={athleteHistory} metricKey="thresholdPowerW" title="Andamento potenza soglia" color="#ef4444" />
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Data</th><th>Altezza</th><th>Peso</th><th>FC Soglia</th><th>Potenza Soglia</th><th>Zone</th></tr></thead>
                      <tbody>
                        {athleteHistory.map((item) => (
                          <tr key={item.id}><td>{item.recordedAt}</td><td>{item.heightCm ?? '-'}</td><td>{item.weightKg ?? '-'}</td><td>{item.thresholdHr ?? '-'}</td><td>{item.thresholdPowerW ?? '-'}</td><td>{item.zones.map((zone) => <div key={zone.zone}>{zone.zone}: FC {zone.hr ? `${zone.hr.min}-${zone.hr.max ?? '+'}` : '-'} | W {zone.power ? `${zone.power.min}-${zone.power.max ?? '+'}` : '-'}</div>)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default App;
