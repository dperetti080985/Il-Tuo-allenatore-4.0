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

const emptyAthleteProfileMeta = {
  metabolicProfile: '',
  performanceProfile: ''
};

const emptyAthleteForm = {
  recordedAt: new Date().toISOString().slice(0, 10),
  thresholdPowerToWeight: '',
  heightCm: '',
  weightKg: '',
  restingHr: '',
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
  restingHr: 'FC a riposo',
  aerobicHr: 'FC aerobica',
  maxHr: 'FC max',
  thresholdHr: 'FC soglia',
  thresholdPowerW: 'Potenza soglia (W)',
  thresholdPowerToWeight: 'Watt/kg soglia',
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
  disciplineIds: [],
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

const zoneRules = [
  { zone: 'Z1', min: 0, max: 55 },
  { zone: 'Z2', min: 56, max: 75 },
  { zone: 'Z3', min: 76, max: 90 },
  { zone: 'Z4', min: 91, max: 105 },
  { zone: 'Z5', min: 106, max: 120 },
  { zone: 'Z6', min: 121, max: 150 },
  { zone: 'Z7', min: 151, max: null }
];

const metabolicProfiles = [
  { value: 'aerobico', label: 'Aerobico' },
  { value: 'glucolitico', label: 'Glucolitico' },
  { value: 'misto', label: 'Misto' }
];

const performanceProfiles = [
  { value: 'passista', label: 'Passista' },
  { value: 'scalatore', label: 'Scalatore' },
  { value: 'velocista', label: 'Velocista' },
  { value: 'all-rounder', label: 'All-rounder' }
];

const zoneStressWeights = { Z1: 1, Z2: 2, Z3: 3, Z4: 5, Z5: 7, Z6: 9, Z7: 11 };

const toRounded = (value) => Math.round(value);
const emptyZoneForm = zoneRules.reduce((acc, rule) => {
  acc[rule.zone] = { hr: { min: '', max: '' }, power: { min: '', max: '' } };
  return acc;
}, {});

const computeHeartRateZones = (thresholdHr, maxHr, restingHr) => {
  if (!thresholdHr) return null;

  const thresholdMaxByZone = Object.fromEntries(
    zoneRules.map((rule) => [rule.zone, rule.max === null ? null : toRounded((thresholdHr * rule.max) / 100)])
  );

  return zoneRules.map((rule, index) => {
    const prevZone = zoneRules[index - 1];
    const prevMax = prevZone ? thresholdMaxByZone[prevZone.zone] : null;
    const fallbackMin = toRounded((thresholdHr * rule.min) / 100);

    let min = index === 0
      ? (restingHr ? restingHr + 10 : fallbackMin)
      : (prevMax !== null ? prevMax + 1 : fallbackMin);

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

const computeAutoZones = (thresholdHr, thresholdPowerW, maxHr, restingHr) => {
  const hrZones = computeHeartRateZones(thresholdHr, maxHr, restingHr);
  return zoneRules.map((rule, index) => ({
    zone: rule.zone,
    hr: hrZones ? hrZones[index] : null,
    power: thresholdPowerW ? { min: toRounded((thresholdPowerW * rule.min) / 100), max: rule.max === null ? null : toRounded((thresholdPowerW * rule.max) / 100) } : null
  }));
};

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

const sortSnapshotsByDateDesc = (snapshots = []) => (
  [...snapshots].sort((a, b) => {
    const dateDiff = new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime();
    if (dateDiff !== 0) return dateDiff;
    return (b.id ?? 0) - (a.id ?? 0);
  })
);

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
  const [athleteCategories, setAthleteCategories] = useState([]);
  const [disciplines, setDisciplines] = useState([]);
  const [trainingMethods, setTrainingMethods] = useState([]);
  const [objectiveForm, setObjectiveForm] = useState({ name: '', macroArea: 'metabolico' });
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [athleteCategoryForm, setAthleteCategoryForm] = useState({ name: '' });
  const [disciplineForm, setDisciplineForm] = useState({ name: '' });
  const [trainingMethodForm, setTrainingMethodForm] = useState(emptyTrainingMethodForm);
  const [editingMethodId, setEditingMethodId] = useState(null);
  const [methodManagementMode, setMethodManagementMode] = useState('list');
  const [editingObjectiveId, setEditingObjectiveId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingAthleteCategoryId, setEditingAthleteCategoryId] = useState(null);
  const [editingDisciplineId, setEditingDisciplineId] = useState(null);
  const [athleteCategoryIds, setAthleteCategoryIds] = useState([]);
  const [athleteDisciplineIds, setAthleteDisciplineIds] = useState([]);
  const [athleteProfileMeta, setAthleteProfileMeta] = useState(emptyAthleteProfileMeta);
  const [coachZoneConfig, setCoachZoneConfig] = useState(zoneRules);
  const [zoneModalSnapshot, setZoneModalSnapshot] = useState(null);
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
    const [data, taxonomy, profileMeta, zoneConfig] = await Promise.all([
      api(`/api/athletes/${id}/profile-history`, {
        headers: { Authorization: `Bearer ${authToken}` }
      }),
      api(`/api/athletes/${id}/taxonomy`, { headers: { Authorization: `Bearer ${authToken}` } }),
      api(`/api/athletes/${id}/profile-meta`, { headers: { Authorization: `Bearer ${authToken}` } }),
      api(`/api/coaches/zone-config`, { headers: { Authorization: `Bearer ${authToken}` } })
    ]);
    const sortedHistory = sortSnapshotsByDateDesc(data);
    setAthleteHistory(sortedHistory);
    setAthleteCategoryIds(taxonomy.categoryIds || []);
    setAthleteDisciplineIds(taxonomy.disciplineIds || []);
    setAthleteProfileMeta({
      metabolicProfile: profileMeta.metabolicProfile || '',
      performanceProfile: profileMeta.performanceProfile || ''
    });
    setCoachZoneConfig(zoneConfig.zones || zoneRules);

    if (sortedHistory.length > 0) {
      const latest = sortedHistory[0];
      setAthleteForm({
        recordedAt: new Date().toISOString().slice(0, 10),
        heightCm: latest.heightCm ?? '',
        weightKg: latest.weightKg ?? '',
        restingHr: latest.restingHr ?? '',
        aerobicHr: latest.aerobicHr ?? '',
        maxHr: latest.maxHr ?? '',
        thresholdHr: latest.thresholdHr ?? '',
        thresholdPowerW: latest.thresholdPowerW ?? '',
        thresholdPowerToWeight: latest.powerToWeight ?? '',
        maxPowerW: latest.maxPowerW ?? '',
        cp2MinW: latest.cp2MinW ?? '',
        cp5MinW: latest.cp5MinW ?? '',
        cp20MinW: latest.cp20MinW ?? '',
        vo2Max: latest.vo2Max ?? '',
        vo2MaxPowerW: latest.vo2MaxPowerW ?? '',
        vo2MaxHr: latest.vo2MaxHr ?? ''
      });
      setZoneForm(formatZoneFormFromZones(latest.zones));
      setAutoZonesPreview(latest.zones?.length ? latest.zones : computeAutoZones(null, null));
    } else {
      setAthleteForm({ ...emptyAthleteForm, recordedAt: new Date().toISOString().slice(0, 10) });
      setZoneForm(emptyZoneForm);
      setAutoZonesPreview(computeAutoZones(null, null));
    }
  };


  const loadTrainingCatalog = async (authToken = token) => {
    const [details, categories, athleteCats, disciplineList, methods] = await Promise.all([
      api('/api/training-objective-details', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/training-categories', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/athlete-categories', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/disciplines', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/training-methods', { headers: { Authorization: `Bearer ${authToken}` } })
    ]);
    setTrainingObjectiveDetails(details);
    setTrainingCategories(categories);
    setAthleteCategories(athleteCats);
    setDisciplines(disciplineList);
    setTrainingMethods(methods);
  };

  const handleSaveObjectiveDetail = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const endpoint = editingObjectiveId ? `/api/training-objective-details/${editingObjectiveId}` : '/api/training-objective-details';
      const method = editingObjectiveId ? 'PUT' : 'POST';
      await api(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(objectiveForm)
      });
      setEditingObjectiveId(null);
      setObjectiveForm({ name: '', macroArea: objectiveForm.macroArea });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const startEditingObjectiveDetail = (detail) => {
    setEditingObjectiveId(detail.id);
    setObjectiveForm({ name: detail.name, macroArea: detail.macroArea });
  };

  const cancelObjectiveEditing = () => {
    setEditingObjectiveId(null);
    setObjectiveForm({ name: '', macroArea: objectiveForm.macroArea });
  };

  const duplicateObjectiveDetail = async (id) => {
    try {
      await api(`/api/training-objective-details/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const deleteObjectiveDetail = async (id) => {
    try {
      await api(`/api/training-objective-details/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (editingObjectiveId === id) {
        cancelObjectiveEditing();
      }
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const endpoint = editingCategoryId ? `/api/training-categories/${editingCategoryId}` : '/api/training-categories';
      const method = editingCategoryId ? 'PUT' : 'POST';
      await api(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(categoryForm)
      });
      setEditingCategoryId(null);
      setCategoryForm({ name: '' });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const startEditingCategory = (category) => {
    setEditingCategoryId(category.id);
    setCategoryForm({ name: category.name });
  };

  const cancelCategoryEditing = () => {
    setEditingCategoryId(null);
    setCategoryForm({ name: '' });
  };

  const duplicateCategory = async (id) => {
    try {
      await api(`/api/training-categories/${id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const deleteCategory = async (id) => {
    try {
      await api(`/api/training-categories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (editingCategoryId === id) {
        cancelCategoryEditing();
      }
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };


  const handleSaveAthleteCategory = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const endpoint = editingAthleteCategoryId ? `/api/athlete-categories/${editingAthleteCategoryId}` : '/api/athlete-categories';
      const method = editingAthleteCategoryId ? 'PUT' : 'POST';
      await api(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(athleteCategoryForm)
      });
      setEditingAthleteCategoryId(null);
      setAthleteCategoryForm({ name: '' });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const startEditingAthleteCategory = (category) => {
    setEditingAthleteCategoryId(category.id);
    setAthleteCategoryForm({ name: category.name });
  };

  const cancelAthleteCategoryEditing = () => {
    setEditingAthleteCategoryId(null);
    setAthleteCategoryForm({ name: '' });
  };

  const deleteAthleteCategory = async (id) => {
    try {
      await api(`/api/athlete-categories/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (editingAthleteCategoryId === id) {
        cancelAthleteCategoryEditing();
      }
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleSaveDiscipline = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const endpoint = editingDisciplineId ? `/api/disciplines/${editingDisciplineId}` : '/api/disciplines';
      const method = editingDisciplineId ? 'PUT' : 'POST';
      await api(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(disciplineForm)
      });
      setEditingDisciplineId(null);
      setDisciplineForm({ name: '' });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const startEditingDiscipline = (discipline) => {
    setEditingDisciplineId(discipline.id);
    setDisciplineForm({ name: discipline.name });
  };

  const cancelDisciplineEditing = () => {
    setEditingDisciplineId(null);
    setDisciplineForm({ name: '' });
  };

  const deleteDiscipline = async (id) => {
    try {
      await api(`/api/disciplines/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (editingDisciplineId === id) {
        cancelDisciplineEditing();
      }
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const saveAthleteTaxonomy = async () => {
    if (!athleteId || !isCoachUser) return;
    try {
      await api(`/api/athletes/${athleteId}/taxonomy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ categoryIds: athleteCategoryIds, disciplineIds: athleteDisciplineIds })
      });
      setMessage('Categorie e discipline atleta aggiornate');
    } catch (err) {
      setMessage(err.message);
    }
  };


  const saveAthleteProfileMeta = async () => {
    if (!athleteId || !isCoachUser) return;
    try {
      await api(`/api/athletes/${athleteId}/profile-meta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(athleteProfileMeta)
      });
      setMessage('Profilo atleta aggiornato');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const saveCoachZoneConfig = async () => {
    if (!isCoachUser) return;
    try {
      await api('/api/coaches/zone-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ zones: coachZoneConfig })
      });
      setMessage('Percentuali zone coach aggiornate');
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
        sets: trainingMethodForm.sets.map((set) => cloneSet(set))
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
      setMethodManagementMode('list');
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
      disciplineIds: method.disciplineIds || [],
      period: method.period,
      notes: method.notes || '',
      methodType: method.methodType,
      progressionIncrementPct: method.progressionIncrementPct ?? 5,
      progression: method.progression || emptyTrainingMethodForm.progression,
      sets: [cloneSet(firstSet)]
    });
    setMethodManagementMode('form');
  };

  const cancelTrainingMethodEditing = () => {
    setEditingMethodId(null);
    setTrainingMethodForm(emptyTrainingMethodForm);
    setMethodManagementMode('list');
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
    if (token && isCoachUser && ['training-methods', 'training-objective-details', 'training-categories', 'athlete-categories', 'disciplines', 'general-master-data', 'coach-zone-config'].includes(mode)) {
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
      restingHr: item.restingHr ?? '',
      aerobicHr: item.aerobicHr ?? '',
      maxHr: item.maxHr ?? '',
      thresholdHr: item.thresholdHr ?? '',
      thresholdPowerW: item.thresholdPowerW ?? '',
      thresholdPowerToWeight: item.powerToWeight ?? '',
      maxPowerW: item.maxPowerW ?? '',
      cp2MinW: item.cp2MinW ?? '',
      cp5MinW: item.cp5MinW ?? '',
      cp20MinW: item.cp20MinW ?? '',
      vo2Max: item.vo2Max ?? '',
      vo2MaxPowerW: item.vo2MaxPowerW ?? '',
      vo2MaxHr: item.vo2MaxHr ?? ''
    });
    setZoneForm(formatZoneFormFromZones(item.zones));
    setAutoZonesPreview(item.zones?.length ? item.zones : computeAutoZones(null, null));
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
    const normalizedRules = (coachZoneConfig || zoneRules).map((rule) => ({
      zone: rule.zone,
      min: Number(rule.min),
      max: rule.max === null ? null : Number(rule.max)
    }));

    const thresholdHr = toNullableNumber(athleteForm.thresholdHr);
    const thresholdPowerW = toNullableNumber(athleteForm.thresholdPowerW);
    const maxHr = toNullableNumber(athleteForm.maxHr);
    const restingHr = toNullableNumber(athleteForm.restingHr);

    const thresholdMaxByZone = Object.fromEntries(normalizedRules.map((rule) => [rule.zone, rule.max === null ? null : toRounded((thresholdHr * rule.max) / 100)]));
    const hrZones = thresholdHr ? normalizedRules.map((rule, index) => {
      const prevRule = normalizedRules[index - 1];
      const prevMax = prevRule ? thresholdMaxByZone[prevRule.zone] : null;
      const fallbackMin = toRounded((thresholdHr * rule.min) / 100);
      const min = index === 0 ? (restingHr ? restingHr + 10 : fallbackMin) : (prevMax !== null ? prevMax + 1 : fallbackMin);
      const rawMax = rule.max === null ? (maxHr ?? null) : thresholdMaxByZone[rule.zone];
      return { min: rawMax !== null && min > rawMax ? rawMax : min, max: rawMax };
    }) : null;

    const calculated = normalizedRules.map((rule, index) => ({
      zone: rule.zone,
      hr: hrZones ? hrZones[index] : null,
      power: thresholdPowerW ? { min: toRounded((thresholdPowerW * rule.min) / 100), max: rule.max === null ? null : toRounded((thresholdPowerW * rule.max) / 100) } : null
    }));

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

  const previewStressScore = useMemo(() => trainingMethodForm.sets.reduce((total, set) => {
    const series = Number(set.seriesCount || 0);
    const setStress = set.intervals.reduce((acc, interval) => {
      const duration = Number(interval.minutes || 0) * 60 + Number(interval.seconds || 0);
      const weight = zoneStressWeights[interval.intensityZone] || 1;
      return acc + duration * weight;
    }, 0);
    return total + setStress * series;
  }, 0), [trainingMethodForm.sets]);


  const handleAthleteFieldChange = (field, value) => {
    setAthleteForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'weightKg' && prev.thresholdPowerW && value) {
        const ratio = Number(prev.thresholdPowerW) / Number(value);
        next.thresholdPowerToWeight = Number.isFinite(ratio) ? ratio.toFixed(2) : '';
      }
      if (field === 'thresholdPowerW' && prev.weightKg && value) {
        const ratio = Number(value) / Number(prev.weightKg);
        next.thresholdPowerToWeight = Number.isFinite(ratio) ? ratio.toFixed(2) : '';
      }
      return next;
    });
  };

  const handlePowerToWeightChange = (value) => {
    setAthleteForm((prev) => {
      if (!prev.weightKg || !value) return { ...prev, thresholdPowerToWeight: value };
      const thresholdPowerW = (Number(value) * Number(prev.weightKg)).toFixed(0);
      return { ...prev, thresholdPowerToWeight: value, thresholdPowerW };
    });
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
              {isCoachUser && <button onClick={() => setMode('general-master-data')}>Anagrafiche campi generali</button>}
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
                <h2>Gestione metodi e anagrafiche</h2>
                <div className="actions">
                  <button type="button" onClick={() => { setMethodManagementMode('list'); cancelTrainingMethodEditing(); }}>Metodi</button>
                  <button type="button" onClick={() => setMode('training-objective-details')}>Dettagli obiettivi</button>
                  <button type="button" onClick={() => setMode('training-categories')}>Categorie metodi</button>
                  <button type="button" onClick={() => setMode('athlete-categories')}>Categorie atleti</button>
                  <button type="button" onClick={() => setMode('disciplines')}>Discipline</button>
                </div>
              </div>

              {methodManagementMode === 'form' ? (
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

                  <div className="table-wrap">
                    <h4>Seleziona discipline</h4>
                    <table>
                      <thead><tr><th>Seleziona</th><th>ID</th><th>Disciplina</th></tr></thead>
                      <tbody>
                        {disciplines.map((discipline) => (
                          <tr key={discipline.id}><td><input type="checkbox" checked={trainingMethodForm.disciplineIds.includes(discipline.id)} onChange={() => toggleMultiValue('disciplineIds', discipline.id)} /></td><td>{discipline.id}</td><td>{discipline.name}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {trainingMethodForm.sets.map((set, setIndex) => (
                    <div key={`set-${setIndex}`} className="edit-form">
                      <h4>Serie del metodo</h4>
                      <div className="set-grid">
                        <label className="compact-field">Numero serie<input className="short-input" type="number" min="1" value={set.seriesCount} onChange={(e) => updateSetField(setIndex, 'seriesCount', e.target.value)} /></label>
                        <label className="compact-field">Recupero minuti<input className="short-input" type="number" min="0" value={set.recoveryMinutes} onChange={(e) => updateSetField(setIndex, 'recoveryMinutes', e.target.value)} /></label>
                        <label className="compact-field">Recupero secondi<input className="short-input" type="number" min="0" max="59" value={set.recoverySeconds} onChange={(e) => updateSetField(setIndex, 'recoverySeconds', e.target.value)} /></label>
                      </div>
                      {set.intervals.map((interval, intervalIndex) => (
                        <div key={`interval-${intervalIndex}`} className="edit-form interval-grid">
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

                  <p>Punteggio stress stimato: <strong>{Math.round(previewStressScore)}</strong></p>
                  <div className="actions">
                    <button type="submit">{editingMethodId ? 'Aggiorna metodo' : 'Salva metodo'}</button>
                    <button type="button" className="secondary" onClick={cancelTrainingMethodEditing}>Annulla</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="row">
                    <h3>Metodi salvati</h3>
                    <button type="button" onClick={() => { setEditingMethodId(null); setTrainingMethodForm(emptyTrainingMethodForm); setMethodManagementMode('form'); }}>Nuovo metodo</button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Nome</th><th>Codice</th><th>Obiettivi</th><th>Categorie</th><th>Discipline</th><th>Stress</th><th>Dettaglio</th><th>Azioni</th></tr></thead>
                      <tbody>
                        {trainingMethods.map((method) => (
                          <tr key={method.id}>
                            <td>{method.name}</td>
                            <td>{method.code}</td>
                            <td>{(method.objectiveDetailNames || []).join(', ')}</td>
                            <td>{(method.categoryNames || []).join(', ')}</td>
                            <td>{(method.disciplineNames || []).join(', ')}</td>
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
                </>
              )}
            </section>
          )}


          {mode === 'general-master-data' && isCoachUser && (
            <section className="card">
              <h2>Anagrafiche campi generali</h2>
              <div className="actions">
                <button type="button" onClick={() => setMode('training-objective-details')}>Dettagli obiettivi</button>
                <button type="button" onClick={() => setMode('training-categories')}>Categorie metodi</button>
                <button type="button" onClick={() => setMode('athlete-categories')}>Categorie atleti</button>
                <button type="button" onClick={() => setMode('disciplines')}>Discipline</button>
                <button type="button" onClick={() => setMode('coach-zone-config')}>Zone coach (percentuali)</button>
              </div>
            </section>
          )}

          {mode === 'coach-zone-config' && isCoachUser && (
            <section className="card">
              <div className="row">
                <h2>Configurazione zone coach</h2>
                <button type="button" className="secondary" onClick={() => setMode('general-master-data')}>Torna anagrafiche</button>
              </div>
              <p>Percentuali usate per il calcolo automatico FC e Watt delle zone.</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Zona</th><th>% Min</th><th>% Max</th></tr></thead>
                  <tbody>
                    {coachZoneConfig.map((zone, index) => (
                      <tr key={`cfg-${zone.zone}`}>
                        <td>{zone.zone}</td>
                        <td><input type="number" value={zone.min} onChange={(e) => setCoachZoneConfig((prev) => prev.map((z, i) => i === index ? { ...z, min: e.target.value } : z))} /></td>
                        <td><input type="number" value={zone.max ?? ''} placeholder="+" onChange={(e) => setCoachZoneConfig((prev) => prev.map((z, i) => i === index ? { ...z, max: e.target.value === '' ? null : e.target.value } : z))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={saveCoachZoneConfig}>Salva percentuali zone coach</button>
            </section>
          )}

          {mode === 'training-objective-details' && isCoachUser && (
            <section className="card">
              <div className="row">
                <h2>Dettagli obiettivi</h2>
                <button type="button" className="secondary" onClick={() => setMode('general-master-data')}>Torna alle anagrafiche</button>
              </div>
              <form onSubmit={handleSaveObjectiveDetail} className="subcard">
                <h3>{editingObjectiveId ? `Modifica dettaglio #${editingObjectiveId}` : 'Nuovo dettaglio obiettivo'}</h3>
                <label>Nome dettaglio obiettivo<input value={objectiveForm.name} onChange={(e) => setObjectiveForm({ ...objectiveForm, name: e.target.value })} required /></label>
                <label>Macro area
                  <select value={objectiveForm.macroArea} onChange={(e) => setObjectiveForm({ ...objectiveForm, macroArea: e.target.value })}>
                    {macroAreas.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <div className="actions">
                  <button type="submit">{editingObjectiveId ? 'Salva modifica' : 'Aggiungi dettaglio obiettivo'}</button>
                  {editingObjectiveId && <button type="button" className="secondary" onClick={cancelObjectiveEditing}>Annulla</button>}
                </div>
              </form>

              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Dettaglio</th><th>Macro area</th><th>Azioni</th></tr></thead>
                  <tbody>
                    {trainingObjectiveDetails.map((detail) => (
                      <tr key={detail.id}>
                        <td>{detail.id}</td>
                        <td>{detail.name}</td>
                        <td>{detail.macroArea}</td>
                        <td>
                          <div className="actions">
                            <button type="button" onClick={() => startEditingObjectiveDetail(detail)}>Modifica</button>
                            <button type="button" className="danger" onClick={() => deleteObjectiveDetail(detail.id)}>Elimina</button>
                            <button type="button" onClick={() => duplicateObjectiveDetail(detail.id)}>Duplica</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {mode === 'training-categories' && isCoachUser && (
            <section className="card">
              <div className="row">
                <h2>Categorie metodi</h2>
                <button type="button" className="secondary" onClick={() => setMode('general-master-data')}>Torna alle anagrafiche</button>
              </div>
              <form onSubmit={handleSaveCategory} className="subcard">
                <h3>{editingCategoryId ? `Modifica categoria #${editingCategoryId}` : 'Nuova categoria metodo'}</h3>
                <label>Nome categoria<input value={categoryForm.name} onChange={(e) => setCategoryForm({ name: e.target.value })} required /></label>
                <div className="actions">
                  <button type="submit">{editingCategoryId ? 'Salva modifica' : 'Aggiungi categoria'}</button>
                  {editingCategoryId && <button type="button" className="secondary" onClick={cancelCategoryEditing}>Annulla</button>}
                </div>
              </form>

              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Nome</th><th>Azioni</th></tr></thead>
                  <tbody>
                    {trainingCategories.map((category) => (
                      <tr key={category.id}>
                        <td>{category.id}</td>
                        <td>{category.name}</td>
                        <td>
                          <div className="actions">
                            <button type="button" onClick={() => startEditingCategory(category)}>Modifica</button>
                            <button type="button" className="danger" onClick={() => deleteCategory(category.id)}>Elimina</button>
                            <button type="button" onClick={() => duplicateCategory(category.id)}>Duplica</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {mode === 'athlete-categories' && isCoachUser && (
            <section className="card">
              <div className="row">
                <h2>Categorie atleta</h2>
                <button type="button" className="secondary" onClick={() => setMode('general-master-data')}>Torna alle anagrafiche</button>
              </div>
              <form onSubmit={handleSaveAthleteCategory} className="subcard">
                <h3>{editingAthleteCategoryId ? `Modifica categoria atleta #${editingAthleteCategoryId}` : 'Nuova categoria atleta'}</h3>
                <label>Nome categoria atleta<input value={athleteCategoryForm.name} onChange={(e) => setAthleteCategoryForm({ name: e.target.value })} required /></label>
                <div className="actions">
                  <button type="submit">{editingAthleteCategoryId ? 'Salva modifica' : 'Aggiungi categoria atleta'}</button>
                  {editingAthleteCategoryId && <button type="button" className="secondary" onClick={cancelAthleteCategoryEditing}>Annulla</button>}
                </div>
              </form>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Nome</th><th>Azioni</th></tr></thead>
                  <tbody>
                    {athleteCategories.map((category) => (
                      <tr key={category.id}>
                        <td>{category.id}</td>
                        <td>{category.name}</td>
                        <td><div className="actions"><button type="button" onClick={() => startEditingAthleteCategory(category)}>Modifica</button><button type="button" className="danger" onClick={() => deleteAthleteCategory(category.id)}>Elimina</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {mode === 'disciplines' && isCoachUser && (
            <section className="card">
              <div className="row">
                <h2>Discipline</h2>
                <button type="button" className="secondary" onClick={() => setMode('general-master-data')}>Torna alle anagrafiche</button>
              </div>
              <form onSubmit={handleSaveDiscipline} className="subcard">
                <h3>{editingDisciplineId ? `Modifica disciplina #${editingDisciplineId}` : 'Nuova disciplina'}</h3>
                <label>Nome disciplina<input value={disciplineForm.name} onChange={(e) => setDisciplineForm({ name: e.target.value })} required /></label>
                <div className="actions">
                  <button type="submit">{editingDisciplineId ? 'Salva modifica' : 'Aggiungi disciplina'}</button>
                  {editingDisciplineId && <button type="button" className="secondary" onClick={cancelDisciplineEditing}>Annulla</button>}
                </div>
              </form>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Nome</th><th>Azioni</th></tr></thead>
                  <tbody>
                    {disciplines.map((discipline) => (
                      <tr key={discipline.id}>
                        <td>{discipline.id}</td>
                        <td>{discipline.name}</td>
                        <td><div className="actions"><button type="button" onClick={() => startEditingDiscipline(discipline)}>Modifica</button><button type="button" className="danger" onClick={() => deleteDiscipline(discipline.id)}>Elimina</button></div></td>
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
                    <h3>Snapshot fisiologico</h3>
                    {isCoachUser && (
                      <div className="split-panels">
                        <div className="subcard">
                          <h4>Profilo atleta (anagrafica)</h4>
                          <label>Profilo metabolico
                            <select value={athleteProfileMeta.metabolicProfile} onChange={(e) => setAthleteProfileMeta((prev) => ({ ...prev, metabolicProfile: e.target.value }))}>
                              <option value="">-</option>
                              {metabolicProfiles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <label>Profilo prestativo
                            <select value={athleteProfileMeta.performanceProfile} onChange={(e) => setAthleteProfileMeta((prev) => ({ ...prev, performanceProfile: e.target.value }))}>
                              <option value="">-</option>
                              {performanceProfiles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </label>
                          <button type="button" onClick={saveAthleteProfileMeta}>Salva profilo atleta</button>
                        </div>
                        <div className="subcard">
                          <h4>Categorie atleta</h4>
                          {athleteCategories.map((category) => (
                            <label key={`ath-cat-${category.id}`}><input type="checkbox" checked={athleteCategoryIds.includes(category.id)} onChange={() => setAthleteCategoryIds((prev) => prev.includes(category.id) ? prev.filter((id) => id !== category.id) : [...prev, category.id])} /> {category.name}</label>
                          ))}
                          <h4>Discipline atleta</h4>
                          {disciplines.map((discipline) => (
                            <label key={`ath-disc-${discipline.id}`}><input type="checkbox" checked={athleteDisciplineIds.includes(discipline.id)} onChange={() => setAthleteDisciplineIds((prev) => prev.includes(discipline.id) ? prev.filter((id) => id !== discipline.id) : [...prev, discipline.id])} /> {discipline.name}</label>
                          ))}
                          <button type="button" onClick={saveAthleteTaxonomy}>Salva categorie/discipline atleta</button>
                        </div>
                      </div>
                    )}
                    {Object.keys(emptyAthleteForm).map((field) => (
                      <label key={field}>
                        {athleteFieldLabels[field]}
                        <input type={field === 'recordedAt' ? 'date' : 'number'} step="any" value={athleteForm[field]} onChange={(e) => field === 'thresholdPowerToWeight' ? handlePowerToWeightChange(e.target.value) : handleAthleteFieldChange(field, e.target.value)} required={field === 'recordedAt'} />
                      </label>
                    ))}

                    <h4>Zone allenamento (premi il pulsante per il calcolo automatico)</h4>
                    <button type="button" onClick={handleAutoCalculateZones}>Calcola zone automatiche</button>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Zona</th><th>FC min</th><th>FC max</th><th>W min</th><th>W max</th></tr></thead>
                        <tbody>
                          {zoneRules.map((rule) => {
                            const zone = autoZonesPreview.find((current) => current.zone === rule.zone) || { zone: rule.zone, hr: null, power: null };
                            return (
                            <tr key={zone.zone}>
                              <td>{zone.zone}</td>
                              <td><input type="number" step="1" value={zoneForm[zone.zone].hr.min} onChange={(e) => setZoneForm({ ...zoneForm, [zone.zone]: { ...zoneForm[zone.zone], hr: { ...zoneForm[zone.zone].hr, min: e.target.value } } })} /></td>
                              <td><input type="number" step="1" value={zoneForm[zone.zone].hr.max} onChange={(e) => setZoneForm({ ...zoneForm, [zone.zone]: { ...zoneForm[zone.zone], hr: { ...zoneForm[zone.zone].hr, max: e.target.value } } })} placeholder={zone.hr?.max === null ? '+' : ''} /></td>
                              <td><input type="number" step="1" value={zoneForm[zone.zone].power.min} onChange={(e) => setZoneForm({ ...zoneForm, [zone.zone]: { ...zoneForm[zone.zone], power: { ...zoneForm[zone.zone].power, min: e.target.value } } })} /></td>
                              <td><input type="number" step="1" value={zoneForm[zone.zone].power.max} onChange={(e) => setZoneForm({ ...zoneForm, [zone.zone]: { ...zoneForm[zone.zone], power: { ...zoneForm[zone.zone].power, max: e.target.value } } })} placeholder={zone.power?.max === null ? '+' : ''} /></td>
                            </tr>
                          );})}
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
                      <thead><tr><th>Data</th><th>Peso</th><th>FC riposo</th><th>FC soglia</th><th>Potenza soglia</th><th>W/kg</th><th>Zone (FC / Watt)</th><th>Azioni</th></tr></thead>
                      <tbody>
                        {athleteHistory.map((item) => (
                          <tr key={item.id}><td>{item.recordedAt}</td><td>{item.weightKg ?? '-'}</td><td>{item.restingHr ?? '-'}</td><td>{item.thresholdHr ?? '-'}</td><td>{item.thresholdPowerW ?? '-'}</td><td>{item.powerToWeight ?? '-'}</td><td><button type="button" className="secondary" onClick={() => setZoneModalSnapshot(item)}>Visualizza</button></td><td><div className="actions"><button type="button" onClick={() => startSnapshotEditing(item)}>Modifica</button><button type="button" className="danger" onClick={() => deleteSnapshot(item.id)}>Elimina</button></div></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {zoneModalSnapshot && (
                    <div className="modal-backdrop" role="dialog" aria-modal="true">
                      <div className="modal-card">
                        <div className="row">
                          <h4>Zone snapshot del {zoneModalSnapshot.recordedAt}</h4>
                          <button type="button" className="secondary" onClick={() => setZoneModalSnapshot(null)}>Chiudi</button>
                        </div>
                        <div className="zones-grid modal-zones-grid">
                          {(zoneModalSnapshot.zones || []).map((zone) => (
                            <div key={`modal-zone-${zone.zone}`}>
                              <strong>{zone.zone}</strong>
                              <span>Frequenza: {zone.hr ? `${zone.hr.min}-${zone.hr.max ?? '+'}` : '-'}</span>
                              <span>BAT/Watt: {zone.power ? `${zone.power.min}-${zone.power.max ?? '+'}` : '-'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
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
