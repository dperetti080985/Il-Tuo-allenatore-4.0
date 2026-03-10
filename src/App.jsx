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

const parseStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
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

  const isEditing = useMemo(() => editingUserId !== null, [editingUserId]);
  const isCoachUser = currentUser?.userType === 'coach';

  useEffect(() => {
    api('/api/status')
      .then((data) => {
        setStatus({ loading: false, hasUsers: data.hasUsers });
        if (!data.hasUsers) {
          setMode('users');
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

  useEffect(() => {
    if (mode === 'users' && token) {
      loadUsers().catch((err) => setMessage(err.message));
    }
  }, [mode, token]);

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
      setMode('users');
      await loadUsers(data.token);
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

      setCreateForm({ ...emptyUserForm, userType: isCoachUser ? 'athlete' : 'coach' });
      const newStatus = await api('/api/status');
      setStatus({ loading: false, hasUsers: newStatus.hasUsers });

      if (!token && newStatus.hasUsers) {
        setMessage('Coach iniziale creato. Ora effettua il login dalla home.');
        setMode('home');
        return;
      }

      if (token) {
        await loadUsers();
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

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setCurrentUser(null);
    setUsers([]);
    cancelEditing();
    setMode('home');
  };

  if (status.loading) return <main className="container">Caricamento...</main>;

  return (
    <main className="container">
      <h1>Piattaforma gestione utenti</h1>
      <p className="subtitle">Solo il coach crea/modifica utenti. L'atleta vede/modifica solo il proprio profilo (senza username).</p>
      {message && <p className="message">{message}</p>}

      {mode === 'home' && (
        <section className="card">
          <h2>Home</h2>
          {!status.hasUsers ? (
            <>
              <p>Non ci sono utenti registrati: crea il primo utente coach.</p>
              <button onClick={() => setMode('users')}>Configura utente iniziale</button>
            </>
          ) : (
            <form onSubmit={handleLogin}>
              <label>
                Username
                <input value={loginForm.username} onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })} required />
              </label>
              <label>
                Password
                <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} required />
              </label>
              <button type="submit">Accedi</button>
            </form>
          )}
        </section>
      )}

      {mode === 'users' && (
        <section className="card">
          <div className="row">
            <h2>Gestione utenti</h2>
            {token ? <button onClick={logout}>Logout</button> : <button onClick={() => setMode('home')}>Torna alla home</button>}
          </div>

          {!status.hasUsers && (
            <form onSubmit={handleCreateUser}>
              <h3>Crea coach iniziale</h3>
              <label>
                Username
                <input value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required />
              </label>
              <label>
                Password
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
              </label>
              <label>
                Nome
                <input value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} required />
              </label>
              <label>
                Cognome
                <input value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} required />
              </label>
              <label>
                Email
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
              </label>
              <label>
                Cellulare
                <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} required />
              </label>
              <button type="submit">Crea coach iniziale</button>
            </form>
          )}

          {token && isCoachUser && (
            <form onSubmit={handleCreateUser}>
              <h3>Crea utente</h3>
              <label>
                Username
                <input value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required />
              </label>
              <label>
                Password
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
              </label>
              <label>
                Nome
                <input value={createForm.firstName} onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })} required />
              </label>
              <label>
                Cognome
                <input value={createForm.lastName} onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })} required />
              </label>
              <label>
                Email
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />
              </label>
              <label>
                Cellulare
                <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} required />
              </label>
              <label>
                Tipologia utente
                <select value={createForm.userType} onChange={(e) => setCreateForm({ ...createForm, userType: e.target.value })}>
                  <option value="athlete">Atleta</option>
                  <option value="coach">Coach</option>
                </select>
              </label>
              <button type="submit">Crea utente</button>
            </form>
          )}

          {token ? (
            <>
              {isEditing && (
                <form onSubmit={handleUpdateUser} className="edit-form">
                  <h3>Modifica utente #{editingUserId}</h3>
                  <label>
                    Username
                    <input
                      value={editForm.username}
                      onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                      required
                      disabled={!isCoachUser}
                    />
                  </label>
                  <label>
                    Nuova password (opzionale)
                    <input type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
                  </label>
                  <label>
                    Nome
                    <input value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} required />
                  </label>
                  <label>
                    Cognome
                    <input value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} required />
                  </label>
                  <label>
                    Email
                    <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
                  </label>
                  <label>
                    Cellulare
                    <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} required />
                  </label>
                  {isCoachUser && (
                    <label>
                      Tipologia utente
                      <select value={editForm.userType} onChange={(e) => setEditForm({ ...editForm, userType: e.target.value })}>
                        <option value="athlete">Atleta</option>
                        <option value="coach">Coach</option>
                      </select>
                    </label>
                  )}
                  <div className="actions">
                    <button type="submit">Salva modifiche</button>
                    <button type="button" onClick={cancelEditing} className="secondary">Annulla</button>
                  </div>
                </form>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Username</th>
                      <th>Nome</th>
                      <th>Cognome</th>
                      <th>Email</th>
                      <th>Cellulare</th>
                      <th>Tipologia</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.id}</td>
                        <td>{u.username}</td>
                        <td>{u.firstName}</td>
                        <td>{u.lastName}</td>
                        <td>{u.email}</td>
                        <td>{u.phone}</td>
                        <td>{u.userType === 'coach' ? 'Coach' : 'Atleta'}</td>
                        <td>
                          <div className="actions">
                            <button type="button" onClick={() => startEditing(u)}>
                              Modifica
                            </button>
                            {isCoachUser && (
                              <button type="button" onClick={() => deleteUser(u.id)} className="danger">
                                Elimina
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p>Effettua il login per vedere i dati utente.</p>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
