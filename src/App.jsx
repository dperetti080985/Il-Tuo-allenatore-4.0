import { useEffect, useState } from 'react';

const api = async (url, options = {}) => {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Errore richiesta');
  }
  return data;
};

function App() {
  const [status, setStatus] = useState({ loading: true, hasUsers: false });
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [mode, setMode] = useState('home');
  const [users, setUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [createForm, setCreateForm] = useState({ username: '', password: '' });

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
      setToken(data.token);
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
      await api('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });
      setCreateForm({ username: '', password: '' });
      const newStatus = await api('/api/status');
      setStatus({ loading: false, hasUsers: newStatus.hasUsers });

      if (!token && newStatus.hasUsers) {
        setMessage('Utente creato. Ora effettua il login dalla home.');
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

  const deleteUser = async (id) => {
    try {
      await api(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadUsers();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUsers([]);
    setMode('home');
  };

  if (status.loading) return <main className="container">Caricamento...</main>;

  return (
    <main className="container">
      <h1>Piattaforma gestione utenti</h1>
      <p className="subtitle">Home con login, oppure accesso diretto alla gestione utenti se il database è vuoto.</p>
      {message && <p className="message">{message}</p>}

      {mode === 'home' && (
        <section className="card">
          <h2>Home</h2>
          {!status.hasUsers ? (
            <>
              <p>Non ci sono utenti registrati: puoi entrare subito nella gestione utenti.</p>
              <button onClick={() => setMode('users')}>Vai alla gestione utenti</button>
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

          <form onSubmit={handleCreateUser}>
            <label>
              Nuovo username
              <input value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required />
            </label>
            <label>
              Nuova password
              <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required />
            </label>
            <button type="submit">Crea utente</button>
          </form>

          {token ? (
            <ul>
              {users.map((u) => (
                <li key={u.id}>
                  <span>{u.username}</span>
                  <button onClick={() => deleteUser(u.id)}>Elimina</button>
                </li>
              ))}
            </ul>
          ) : (
            <p>Per vedere o eliminare utenti esistenti effettua il login dalla home.</p>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
