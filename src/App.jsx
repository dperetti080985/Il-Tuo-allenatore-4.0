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
  cp20MinW: '',
  vo2Max: '',
  vo2MaxPowerW: '',
  vo2MaxHr: ''
};


const athleteFieldLabels = {
  recordedAt: 'Data rilevazione',
  heightCm: 'Altezza (cm)',
  weightKg: 'Peso (kg)',
  aerobicHr: 'FC aerobica',
  maxHr: 'FC max',
  thresholdHr: 'FC soglia',
  thresholdPowerW: 'Potenza soglia (W)',
  maxPowerW: 'Potenza max (W)',
  cp2MinW: 'CP 2 min (W)',
  cp5MinW: 'CP 5 min (W)',
  cp20MinW: 'CP 20 min (W)',
  vo2Max: 'VO2 max (ml/kg/min)',
  vo2MaxPowerW: 'Potenza al VO2 max (W)',
  vo2MaxHr: 'Frequenza cardiaca al VO2 max'
};


const macroAreas = [
  { value: 'metabolico', label: 'Metabolico' },
  { value: 'neuromuscolare', label: 'Neuromuscolare' }
];

const trainingPeriods = [
  { value: 'costruzione', label: 'Costruzione' },
  { value: 'specialistico', label: 'Periodo specialistico' },
  { value: 'pre-gara', label: 'Periodo pre-gara' },
  { value: 'gara', label: 'Periodo gara' }
];

const trainingMethodTypes = [
  { value: 'single', label: 'Singolo allenamento' },
  { value: 'monthly_weekly', label: 'Progressione mensile (1 volta/settimana)' },
  { value: 'monthly_biweekly', label: 'Progressione mensile (settimana sì/no)' }
];

const emptyMethodSet = {
  seriesCount: 4,
  recoveryMinutes: 4,
  recoverySeconds: 0,
  intervals: [{ minutes: 1, seconds: 0, intensityZone: 'Z3', rpm: 90, rpe: '' }]
};

const emptyTrainingMethodForm = {
  name: '',
  code: '',
  macroArea: 'metabolico',
  objectiveDetailIds: [],
  categoryIds: [],
  period: 'costruzione',
  notes: '',
  methodType: 'single',
  progressionIncrementPct: 5,
  progression: { baseWeekLoadPct: 100, week2Pct: 105, week3Pct: 110, week4DeloadPct: 95 },
  sets: [emptyMethodSet]
};

const cloneSet = (set = emptyMethodSet) => ({
  seriesCount: Number(set.seriesCount ?? emptyMethodSet.seriesCount),
  recoveryMinutes: Number(set.recoveryMinutes ?? emptyMethodSet.recoveryMinutes),
  recoverySeconds: Number(set.recoverySeconds ?? emptyMethodSet.recoverySeconds),
  intervals: (set.intervals || emptyMethodSet.intervals).map((interval) => ({ ...interval }))
});

const getProgressionMultipliers = (methodType, incrementPct) => {
  const increment = Number(incrementPct || 0) / 100;
  if (methodType === 'single') return [1];
  if (methodType === 'monthly_weekly') return [1, 1 + increment, 1 + increment * 2, Math.max(0.5, 1 - increment)];
  if (methodType === 'monthly_biweekly') return [1, 1 + increment];
  return [1];
};

const buildAutoSets = (baseSet, methodType, incrementPct) => {
  const normalizedSet = cloneSet(baseSet);
  const baseSeries = Math.max(1, Number(normalizedSet.seriesCount || 1));
  return getProgressionMultipliers(methodType, incrementPct).map((multiplier) => ({
    ...cloneSet(normalizedSet),
    seriesCount: Math.max(1, Math.round(baseSeries * multiplier))
  }));
};

const zoneRules = [
  { zone: 'Z1', min: 0, max: 55 },
  { zone: 'Z2', min: 56, max: 75 },
  { zone: 'Z3', min: 76, max: 90 },
  { zone: 'Z4', min: 91, max: 105 },
  { zone: 'Z5', min: 106, max: 120 },
  { zone: 'Z6', min: 121, max: 150 },
  { zone: 'Z7', min: 151, max: null }
];

const zoneStressWeights = { Z1: 1, Z2: 2, Z3: 3, Z4: 5, Z5: 7, Z6: 9, Z7: 11 };

const toRounded = (value) => Math.round(value);
const emptyZoneForm = zoneRules.reduce((acc, rule) => {
  acc[rule.zone] = { hr: { min: '', max: '' }, power: { min: '', max: '' } };
  return acc;
}, {});

const computeAutoZones = (thresholdHr, thresholdPowerW) =>
  zoneRules.map((rule) => ({
    zone: rule.zone,
    hr: thresholdHr ? { min: toRounded((thresholdHr * rule.min) / 100), max: rule.max === null ? null : toRounded((thresholdHr * rule.max) / 100) } : null,
    power: thresholdPowerW ? { min: toRounded((thresholdPowerW * rule.min) / 100), max: rule.max === null ? null : toRounded((thresholdPowerW * rule.max) / 100) } : null
  }));

const formatZoneFormFromZones = (zones = []) => {
  const next = JSON.parse(JSON.stringify(emptyZoneForm));
  zones.forEach((zone) => {
    if (!next[zone.zone]) return;
    if (zone.hr) {
      next[zone.zone].hr.min = zone.hr.min ?? '';
      next[zone.zone].hr.max = zone.hr.max ?? '';
    }
    if (zone.power) {
      next[zone.zone].power.min = zone.power.min ?? '';
      next[zone.zone].power.max = zone.power.max ?? '';
    }
  });
  return next;
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
  const [zoneForm, setZoneForm] = useState(emptyZoneForm);
  const [athleteHistory, setAthleteHistory] = useState([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const [editingSnapshotId, setEditingSnapshotId] = useState(null);
  const [trainingObjectiveDetails, setTrainingObjectiveDetails] = useState([]);
  const [trainingCategories, setTrainingCategories] = useState([]);
  const [trainingMethods, setTrainingMethods] = useState([]);
  const [objectiveForm, setObjectiveForm] = useState({ name: '', macroArea: 'metabolico' });
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [trainingMethodForm, setTrainingMethodForm] = useState(emptyTrainingMethodForm);
  const [editingMethodId, setEditingMethodId] = useState(null);
  const [trainingConfigView, setTrainingConfigView] = useState('method');
  const [autoZonesPreview, setAutoZonesPreview] = useState(computeAutoZones(null, null));

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

    if (data.length > 0) {
      const latest = data[0];
      setAthleteForm({
        recordedAt: new Date().toISOString().slice(0, 10),
        heightCm: latest.heightCm ?? '',
        weightKg: latest.weightKg ?? '',
        aerobicHr: latest.aerobicHr ?? '',
        maxHr: latest.maxHr ?? '',
        thresholdHr: latest.thresholdHr ?? '',
        thresholdPowerW: latest.thresholdPowerW ?? '',
        maxPowerW: latest.maxPowerW ?? '',
        cp2MinW: latest.cp2MinW ?? '',
        cp5MinW: latest.cp5MinW ?? '',
        cp20MinW: latest.cp20MinW ?? '',
        vo2Max: latest.vo2Max ?? '',
        vo2MaxPowerW: latest.vo2MaxPowerW ?? '',
        vo2MaxHr: latest.vo2MaxHr ?? ''
      });
      setZoneForm(formatZoneFormFromZones(latest.zones));
    } else {
      setAthleteForm({ ...emptyAthleteForm, recordedAt: new Date().toISOString().slice(0, 10) });
      setZoneForm(emptyZoneForm);
    }
  };


  const loadTrainingCatalog = async (authToken = token) => {
    const [details, categories, methods] = await Promise.all([
      api('/api/training-objective-details', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/training-categories', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/training-methods', { headers: { Authorization: `Bearer ${authToken}` } })
    ]);
    setTrainingObjectiveDetails(details);
    setTrainingCategories(categories);
    setTrainingMethods(methods);
  };

  const handleCreateObjectiveDetail = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await api('/api/training-objective-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(objectiveForm)
      });
      setObjectiveForm({ name: '', macroArea: objectiveForm.macroArea });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };


  const handleCreateCategory = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await api('/api/training-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(categoryForm)
      });
      setCategoryForm({ name: '' });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleCreateTrainingMethod = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const payload = {
        ...trainingMethodForm,
        sets: buildAutoSets(trainingMethodForm.sets[0], trainingMethodForm.methodType, trainingMethodForm.progressionIncrementPct)
      };
      if (editingMethodId) {
        await api(`/api/training-methods/${editingMethodId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
      } else {
        await api('/api/training-methods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
      }
      setEditingMethodId(null);
      setTrainingMethodForm({ ...emptyTrainingMethodForm, objectiveDetailIds: trainingMethodForm.objectiveDetailIds });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const startEditingMethod = (method) => {
    const firstSet = method.sets?.[0] || emptyMethodSet;
    setEditingMethodId(method.id);
    setTrainingMethodForm({
      name: method.name,
      code: method.code,
      macroArea: method.macroArea,
      objectiveDetailIds: method.objectiveDetailIds || [],
      categoryIds: method.categoryIds || [],
      period: method.period,
      notes: method.notes || '',
      methodType: method.methodType,
      progressionIncrementPct: method.progressionIncrementPct ?? 5,
      progression: method.progression || emptyTrainingMethodForm.progression,
      sets: [cloneSet(firstSet)]
    });
    setTrainingConfigView('method');
  };

  const cancelTrainingMethodEditing = () => {
    setEditingMethodId(null);
    setTrainingMethodForm(emptyTrainingMethodForm);
  };

  const deleteTrainingMethod = async (id) => {
    try {
      await api(`/api/training-methods/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (editingMethodId === id) {
        cancelTrainingMethodEditing();
      }
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const duplicateTrainingMethod = async (id) => {
    try {
      await api(`/api/training-methods/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
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

  useEffect(() => {
    if (token && isCoachUser && mode === 'training-methods') {
      loadTrainingCatalog().catch((err) => setMessage(err.message));
    }
  }, [mode, token, isCoachUser]);

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

    const payload = Object.fromEntries(Object.entries(athleteForm).map(([key, value]) => [key, key === 'recordedAt' ? value : toNullableNumber(value)]));
    const zonesOverride = Object.fromEntries(zoneRules.map((rule) => {
      const current = zoneForm[rule.zone];
      return [rule.zone, {
        hr: { min: toNullableNumber(current.hr.min), max: toNullableNumber(current.hr.max) },
        power: { min: toNullableNumber(current.power.min), max: toNullableNumber(current.power.max) }
      }];
    }));

    try {
      const method = editingSnapshotId ? 'PUT' : 'POST';
      const endpoint = editingSnapshotId
        ? `/api/athletes/${athleteId}/profile-history/${editingSnapshotId}`
        : `/api/athletes/${athleteId}/profile-history`;

      await api(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...payload, zonesOverride })
      });
      await loadAthleteHistory(athleteId);
      setEditingSnapshotId(null);
      setMessage(editingSnapshotId ? 'Snapshot atletico aggiornato.' : 'Snapshot atletico salvato.');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const startSnapshotEditing = (item) => {
    setEditingSnapshotId(item.id);
    setAthleteForm({
      recordedAt: item.recordedAt,
      heightCm: item.heightCm ?? '',
      weightKg: item.weightKg ?? '',
      aerobicHr: item.aerobicHr ?? '',
      maxHr: item.maxHr ?? '',
      thresholdHr: item.thresholdHr ?? '',
      thresholdPowerW: item.thresholdPowerW ?? '',
      maxPowerW: item.maxPowerW ?? '',
      cp2MinW: item.cp2MinW ?? '',
      cp5MinW: item.cp5MinW ?? '',
      cp20MinW: item.cp20MinW ?? '',
      vo2Max: item.vo2Max ?? '',
      vo2MaxPowerW: item.vo2MaxPowerW ?? '',
      vo2MaxHr: item.vo2MaxHr ?? ''
    });
    setZoneForm(formatZoneFormFromZones(item.zones));
  };

  const cancelSnapshotEditing = () => {
    setEditingSnapshotId(null);
    loadAthleteHistory(athleteId).catch((err) => setMessage(err.message));
  };

  const deleteSnapshot = async (snapshotId) => {
    try {
      await api(`/api/athletes/${athleteId}/profile-history/${snapshotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (editingSnapshotId === snapshotId) {
        setEditingSnapshotId(null);
      }
      await loadAthleteHistory(athleteId);
      setMessage('Snapshot eliminato.');
    } catch (err) {
      setMessage(err.message);
    }
  };



  const handleAutoCalculateZones = () => {
    const calculated = computeAutoZones(toNullableNumber(athleteForm.thresholdHr), toNullableNumber(athleteForm.thresholdPowerW));
    setAutoZonesPreview(calculated);
    setZoneForm(formatZoneFormFromZones(calculated));
  };

  const toggleMultiValue = (field, value) => {
    setTrainingMethodForm((prev) => {
      const has = prev[field].includes(value);
      return { ...prev, [field]: has ? prev[field].filter((v) => v !== value) : [...prev[field], value] };
    });
  };

  const updateSetField = (_setIndex, key, value) => {
    setTrainingMethodForm((prev) => ({
      ...prev,
      sets: [{ ...prev.sets[0], [key]: value }]
    }));
  };

  const updateIntervalField = (_setIndex, intervalIndex, key, value) => {
    setTrainingMethodForm((prev) => ({
      ...prev,
      sets: [{
        ...prev.sets[0],
        intervals: prev.sets[0].intervals.map((interval, iIndex) => (iIndex === intervalIndex ? { ...interval, [key]: value } : interval))
      }]
    }));
  };

  const addInterval = () => {
    const interval = { minutes: 1, seconds: 0, intensityZone: 'Z3', rpm: 90, rpe: '' };
    setTrainingMethodForm((prev) => ({
      ...prev,
      sets: [{ ...prev.sets[0], intervals: [...prev.sets[0].intervals, interval] }]
    }));
  };
  const removeInterval = (_setIndex, intervalIndex) => setTrainingMethodForm((prev) => ({
    ...prev,
    sets: [{ ...prev.sets[0], intervals: prev.sets[0].intervals.filter((_, iIndex) => iIndex !== intervalIndex) }]
  }));

  const autoCalculatedSets = useMemo(
    () => buildAutoSets(trainingMethodForm.sets[0], trainingMethodForm.methodType, trainingMethodForm.progressionIncrementPct),
    [trainingMethodForm]
  );

  const previewStressScore = useMemo(() => autoCalculatedSets.reduce((total, set) => {
    const series = Number(set.seriesCount || 0);
    const setStress = set.intervals.reduce((acc, interval) => {
      const duration = Number(interval.minutes || 0) * 60 + Number(interval.seconds || 0);
      const weight = zoneStressWeights[interval.intensityZone] || 1;
      return acc + duration * weight;
    }, 0);
    return total + setStress * series;
  }, 0), [autoCalculatedSets]);

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
    if (isCoachUser) {
      await api(`/api/athletes/${id}/profile-history/seen`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadUsers();
    }
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
  const currentPowerToWeight = toNullableNumber(athleteForm.thresholdPowerW) && toNullableNumber(athleteForm.weightKg)
    ? (toNullableNumber(athleteForm.thresholdPowerW) / toNullableNumber(athleteForm.weightKg)).toFixed(2)
    : '';

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
              {isCoachUser && <button onClick={() => setMode('training-methods')}>Metodi allenamento</button>}
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
                            <td>{u.id}</td><td>{u.username} {u.hasUnreadSnapshot && <span title="Nuovo snapshot non ancora visualizzato">✅</span>}</td><td>{u.firstName}</td><td>{u.lastName}</td><td>{u.email}</td><td>{u.phone}</td><td>{u.userType === 'coach' ? 'Coach' : 'Atleta'}</td>
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


          {mode === 'training-methods' && isCoachUser && (
            <section className="card">
              <div className="row">
                <h2>Metodi di allenamento</h2>
                <div className="actions">
                  <button type="button" className={trainingConfigView === 'method' ? '' : 'secondary'} onClick={() => setTrainingConfigView('method')}>Metodo</button>
                  <button type="button" className={trainingConfigView === 'registry' ? '' : 'secondary'} onClick={() => setTrainingConfigView('registry')}>Anagrafiche</button>
                </div>
              </div>

              {trainingConfigView === 'registry' && (
                <div className="split-panels">
                  <form onSubmit={handleCreateObjectiveDetail} className="subcard">
                    <h3>Dettaglio obiettivo</h3>
                    <label>Nome dettaglio obiettivo<input value={objectiveForm.name} onChange={(e) => setObjectiveForm({ ...objectiveForm, name: e.target.value })} required /></label>
                    <label>Macro area
                      <select value={objectiveForm.macroArea} onChange={(e) => setObjectiveForm({ ...objectiveForm, macroArea: e.target.value })}>
                        {macroAreas.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <button type="submit">Aggiungi dettaglio obiettivo</button>
                  </form>

                  <form onSubmit={handleCreateCategory} className="subcard">
                    <h3>Categorie metodo</h3>
                    <label>Nome categoria<input value={categoryForm.name} onChange={(e) => setCategoryForm({ name: e.target.value })} required /></label>
                    <button type="submit">Aggiungi categoria</button>
                  </form>

                  <div className="table-wrap subcard">
                    <h3>Dettagli obiettivo</h3>
                    <table>
                      <thead><tr><th>ID</th><th>Dettaglio</th><th>Macro area</th></tr></thead>
                      <tbody>
                        {trainingObjectiveDetails.map((detail) => (
                          <tr key={detail.id}><td>{detail.id}</td><td>{detail.name}</td><td>{detail.macroArea}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="table-wrap subcard">
                    <h3>Categorie</h3>
                    <table>
                      <thead><tr><th>ID</th><th>Nome</th></tr></thead>
                      <tbody>
                        {trainingCategories.map((category) => (
                          <tr key={category.id}><td>{category.id}</td><td>{category.name}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {trainingConfigView === 'method' && (
                <form onSubmit={handleCreateTrainingMethod}>
                  <h3>{editingMethodId ? `Modifica metodo #${editingMethodId}` : 'Nuovo metodo'}</h3>
                  <label>Nome metodo<input value={trainingMethodForm.name} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, name: e.target.value })} required /></label>
                  <label>Codice metodo<input value={trainingMethodForm.code} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, code: e.target.value })} required /></label>
                  <label>Macro area<select value={trainingMethodForm.macroArea} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, macroArea: e.target.value })}>{macroAreas.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label>Periodo<select value={trainingMethodForm.period} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, period: e.target.value })}>{trainingPeriods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label>Tipologia metodo<select value={trainingMethodForm.methodType} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, methodType: e.target.value })}>{trainingMethodTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label>Incremento settimanale (%)<input type="number" min="0" max="100" step="0.5" value={trainingMethodForm.progressionIncrementPct} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, progressionIncrementPct: e.target.value })} /></label>
                  <label>Note<textarea value={trainingMethodForm.notes} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, notes: e.target.value })} /></label>

                  <div className="table-wrap">
                    <h4>Seleziona dettagli obiettivo</h4>
                    <table>
                      <thead><tr><th>Seleziona</th><th>ID</th><th>Dettaglio</th><th>Macro area</th></tr></thead>
                      <tbody>
                        {trainingObjectiveDetails.map((detail) => (
                          <tr key={detail.id}><td><input type="checkbox" checked={trainingMethodForm.objectiveDetailIds.includes(detail.id)} onChange={() => toggleMultiValue('objectiveDetailIds', detail.id)} /></td><td>{detail.id}</td><td>{detail.name}</td><td>{detail.macroArea}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="table-wrap">
                    <h4>Seleziona categorie</h4>
                    <table>
                      <thead><tr><th>Seleziona</th><th>ID</th><th>Categoria</th></tr></thead>
                      <tbody>
                        {trainingCategories.map((category) => (
                          <tr key={category.id}><td><input type="checkbox" checked={trainingMethodForm.categoryIds.includes(category.id)} onChange={() => toggleMultiValue('categoryIds', category.id)} /></td><td>{category.id}</td><td>{category.name}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {trainingMethodForm.sets.map((set, setIndex) => (
                    <div key={`set-${setIndex}`} className="edit-form">
                      <h4>Serie base (le successive sono calcolate automaticamente)</h4>
                      <div className="set-grid">
                        <label className="compact-field">Numero serie<input className="short-input" type="number" min="1" value={set.seriesCount} onChange={(e) => updateSetField(setIndex, 'seriesCount', e.target.value)} /></label>
                        <label className="compact-field">Recupero minuti<input className="short-input" type="number" min="0" value={set.recoveryMinutes} onChange={(e) => updateSetField(setIndex, 'recoveryMinutes', e.target.value)} /></label>
                        <label className="compact-field">Recupero secondi<input className="short-input" type="number" min="0" max="59" value={set.recoverySeconds} onChange={(e) => updateSetField(setIndex, 'recoverySeconds', e.target.value)} /></label>
                      </div>
                      {set.intervals.map((interval, intervalIndex) => (
                        <div key={`interval-${intervalIndex}`} className="edit-form">
                          <h5>Intervallo #{intervalIndex + 1}</h5>
                          <label>Minuti<input type="number" min="0" value={interval.minutes} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'minutes', e.target.value)} /></label>
                          <label>Secondi<input type="number" min="0" max="59" value={interval.seconds} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'seconds', e.target.value)} /></label>
                          <label>Zona<select value={interval.intensityZone} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'intensityZone', e.target.value)}>{zoneRules.map((rule) => <option key={rule.zone} value={rule.zone}>{rule.zone}</option>)}</select></label>
                          <label>RPM<input type="number" min="0" value={interval.rpm} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'rpm', e.target.value)} /></label>
                          <label>RPE<input type="number" min="0" step="0.5" value={interval.rpe} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'rpe', e.target.value)} /></label>
                          {set.intervals.length > 1 && <button type="button" className="danger" onClick={() => removeInterval(setIndex, intervalIndex)}>Rimuovi intervallo</button>}
                        </div>
                      ))}
                      <div className="actions">
                        <button type="button" onClick={() => addInterval(setIndex)}>Aggiungi intervallo</button>
                      </div>
                    </div>
                  ))}

                  <div className="table-wrap">
                    <h4>Serie generate automaticamente</h4>
                    <table>
                      <thead><tr><th>Settimana</th><th>Serie</th><th>Recupero</th></tr></thead>
                      <tbody>
                        {autoCalculatedSets.map((set, index) => (
                          <tr key={`auto-${index}`}><td>{index + 1}</td><td>{set.seriesCount}</td><td>{set.recoveryMinutes}m {set.recoverySeconds}s</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p>Punteggio stress stimato: <strong>{Math.round(previewStressScore)}</strong></p>
                  <div className="actions">
                    <button type="submit">{editingMethodId ? 'Aggiorna metodo' : 'Salva metodo'}</button>
                    {editingMethodId && <button type="button" className="secondary" onClick={cancelTrainingMethodEditing}>Annulla modifica</button>}
                  </div>
                </form>
              )}

              <h3>Metodi salvati</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Nome</th><th>Codice</th><th>Obiettivi</th><th>Categorie</th><th>Stress</th><th>Dettaglio</th><th>Azioni</th></tr></thead>
                  <tbody>
                    {trainingMethods.map((method) => (
                      <tr key={method.id}>
                        <td>{method.name}</td>
                        <td>{method.code}</td>
                        <td>{(method.objectiveDetailNames || []).join(', ')}</td>
                        <td>{(method.categoryNames || []).join(', ')}</td>
                        <td>{method.stressScore ?? '-'}</td>
                        <td>
                          {method.sets.map((set) => (
                            <div key={set.id}>{set.seriesCount} serie, rec {Math.floor(set.recoverySeconds / 60)}:{String(set.recoverySeconds % 60).padStart(2, '0')} - {set.intervals.map((i) => `${i.minutes}m${i.seconds}s ${i.intensityZone || '-'} rpm ${i.rpm || '-'} rpe ${i.rpe || '-'}`).join(' | ')}</div>
                          ))}
                        </td>
                        <td>
                          <div className="actions">
                            <button type="button" onClick={() => startEditingMethod(method)}>Modifica</button>
                            <button type="button" className="danger" onClick={() => deleteTrainingMethod(method.id)}>Elimina</button>
                            <button type="button" onClick={() => duplicateTrainingMethod(method.id)}>Duplica</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                    {Object.keys(emptyAthleteForm).map((field) => (
                      <label key={field}>
                        {athleteFieldLabels[field]}
                        <input type={field === 'recordedAt' ? 'date' : 'number'} step="any" value={athleteForm[field]} onChange={(e) => setAthleteForm({ ...athleteForm, [field]: e.target.value })} required={field === 'recordedAt'} />
                      </label>
                    ))}

                    <label>
                      Watt/kg (calcolato in automatico da peso e potenza soglia)
                      <input type="number" step="0.01" value={currentPowerToWeight} readOnly />
                    </label>

                    <h4>Zone allenamento (premi il pulsante per il calcolo automatico)</h4>
                    <button type="button" onClick={handleAutoCalculateZones}>Calcola zone automatiche</button>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Zona</th><th>FC min</th><th>FC max</th><th>W min</th><th>W max</th></tr></thead>
                        <tbody>
                          {autoZonesPreview.map((zone) => (
                            <tr key={zone.zone}>
                              <td>{zone.zone}</td>
                              <td><input type="number" step="1" value={zoneForm[zone.zone].hr.min} onChange={(e) => setZoneForm({ ...zoneForm, [zone.zone]: { ...zoneForm[zone.zone], hr: { ...zoneForm[zone.zone].hr, min: e.target.value } } })} disabled={!zone.hr} /></td>
                              <td><input type="number" step="1" value={zoneForm[zone.zone].hr.max} onChange={(e) => setZoneForm({ ...zoneForm, [zone.zone]: { ...zoneForm[zone.zone], hr: { ...zoneForm[zone.zone].hr, max: e.target.value } } })} disabled={!zone.hr || zone.hr.max === null} placeholder={zone.hr?.max === null ? '+' : ''} /></td>
                              <td><input type="number" step="1" value={zoneForm[zone.zone].power.min} onChange={(e) => setZoneForm({ ...zoneForm, [zone.zone]: { ...zoneForm[zone.zone], power: { ...zoneForm[zone.zone].power, min: e.target.value } } })} disabled={!zone.power} /></td>
                              <td><input type="number" step="1" value={zoneForm[zone.zone].power.max} onChange={(e) => setZoneForm({ ...zoneForm, [zone.zone]: { ...zoneForm[zone.zone], power: { ...zoneForm[zone.zone].power, max: e.target.value } } })} disabled={!zone.power || zone.power.max === null} placeholder={zone.power?.max === null ? '+' : ''} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="actions">
                      <button type="submit">{editingSnapshotId ? 'Aggiorna snapshot' : 'Salva snapshot'}</button>
                      {editingSnapshotId && <button type="button" className="secondary" onClick={cancelSnapshotEditing}>Annulla modifica</button>}
                    </div>
                  </form>

                  <h3>Storico inserimenti</h3>
                  <TrainingChart history={athleteHistory} metricKey="weightKg" title="Andamento peso" color="#0ea5e9" />
                  <TrainingChart history={athleteHistory} metricKey="thresholdPowerW" title="Andamento potenza soglia" color="#ef4444" />
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Data</th><th>Altezza</th><th>Peso</th><th>FC Soglia</th><th>Potenza Soglia</th><th>W/kg</th><th>VO2 max</th><th>Potenza VO2 max</th><th>FC VO2 max</th><th>Zone</th><th>Azioni</th></tr></thead>
                      <tbody>
                        {athleteHistory.map((item) => (
                          <tr key={item.id}><td>{item.recordedAt}</td><td>{item.heightCm ?? '-'}</td><td>{item.weightKg ?? '-'}</td><td>{item.thresholdHr ?? '-'}</td><td>{item.thresholdPowerW ?? '-'}</td><td>{item.powerToWeight ?? '-'}</td><td>{item.vo2Max ?? '-'}</td><td>{item.vo2MaxPowerW ?? '-'}</td><td>{item.vo2MaxHr ?? '-'}</td><td>{item.zones.map((zone) => <div key={zone.zone}>{zone.zone}: FC {zone.hr ? `${zone.hr.min}-${zone.hr.max ?? '+'}` : '-'} | W {zone.power ? `${zone.power.min}-${zone.power.max ?? '+'}` : '-'}</div>)}</td><td><div className="actions"><button type="button" onClick={() => startSnapshotEditing(item)}>Modifica</button><button type="button" className="danger" onClick={() => deleteSnapshot(item.id)}>Elimina</button></div></td></tr>
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
