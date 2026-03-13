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

const trainingModes = [
  { value: 'in_bici', label: 'In bici' },
  { value: 'in_palestra', label: 'In palestra' },
  { value: 'a_corpo_libero', label: 'A corpo libero' }
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
  intervals: [{ minutes: 1, seconds: 0, intensityZone: 'Z3', rpm: 90, rpe: '', exerciseId: '', intervalRecoveryMinutes: 0, intervalRecoverySeconds: 0, description: '', overloadPct: '' }]
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
  trainingMode: 'in_bici',
  progressionIncrementPct: 5,
  progression: { baseWeekLoadPct: 100, week2Pct: 105, week3Pct: 110, week4DeloadPct: 95 },
  sets: [emptyMethodSet]
};

const cloneSet = (set = emptyMethodSet) => ({
  seriesCount: Number(set.seriesCount ?? emptyMethodSet.seriesCount),
  recoveryMinutes: Number(set.recoveryMinutes ?? emptyMethodSet.recoveryMinutes),
  recoverySeconds: Number(set.recoverySeconds ?? emptyMethodSet.recoverySeconds),
  intervals: (set.intervals || emptyMethodSet.intervals).map((interval) => ({
    ...interval,
    exerciseId: interval.exerciseId ?? '',
    intervalRecoveryMinutes: Number(interval.intervalRecoveryMinutes ?? 0),
    intervalRecoverySeconds: Number(interval.intervalRecoverySeconds ?? 0),
    description: interval.description ?? '',
    overloadPct: interval.overloadPct ?? ''
  }))
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
const weekDays = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

const createEmptyMonthlyPlan = () => (
  Array.from({ length: 4 }, () => Array.from({ length: 7 }, () => []))
);

const normalizeDayEntry = (entry) => ({
  methodId: typeof entry === 'object' && entry !== null ? Number(entry.methodId) : Number(entry),
  evaluation: typeof entry === 'object' && entry !== null && entry.evaluation ? entry.evaluation : null
});

const toTimeInputValue = (minutes, seconds) => {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return `00:${String(safeMinutes).padStart(2, '0')}:${String(safeSeconds).padStart(2, '0')}`;
};

const fromTimeInputValue = (value) => {
  if (!value) return { minutes: 0, seconds: 0 };
  const parts = value.split(':').map((item) => Number(item));
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part) || part < 0)) return { minutes: 0, seconds: 0 };
  const seconds = parts.length === 3 ? parts[2] : 0;
  return { minutes: parts[1], seconds };
};

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
  const [trainingExercises, setTrainingExercises] = useState([]);
  const [trainingMethods, setTrainingMethods] = useState([]);
  const [objectiveForm, setObjectiveForm] = useState({ name: '', macroArea: 'metabolico' });
  const [categoryForm, setCategoryForm] = useState({ name: '' });
  const [athleteCategoryForm, setAthleteCategoryForm] = useState({ name: '' });
  const [disciplineForm, setDisciplineForm] = useState({ name: '' });
  const [exerciseForm, setExerciseForm] = useState({ name: '' });
  const [trainingMethodForm, setTrainingMethodForm] = useState(emptyTrainingMethodForm);
  const [editingMethodId, setEditingMethodId] = useState(null);
  const [methodManagementMode, setMethodManagementMode] = useState('list');
  const [editingObjectiveId, setEditingObjectiveId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingAthleteCategoryId, setEditingAthleteCategoryId] = useState(null);
  const [editingDisciplineId, setEditingDisciplineId] = useState(null);
  const [editingExerciseId, setEditingExerciseId] = useState(null);
  const [athleteCategoryIds, setAthleteCategoryIds] = useState([]);
  const [athleteDisciplineIds, setAthleteDisciplineIds] = useState([]);
  const [athleteProfileMeta, setAthleteProfileMeta] = useState(emptyAthleteProfileMeta);
  const [coachZoneConfig, setCoachZoneConfig] = useState(zoneRules);
  const [zoneModalSnapshot, setZoneModalSnapshot] = useState(null);
  const [autoZonesPreview, setAutoZonesPreview] = useState(computeAutoZones(null, null));
  const [monthlyPlanAthleteIds, setMonthlyPlanAthleteIds] = useState([]);
  const [monthlyPlan, setMonthlyPlan] = useState(createEmptyMonthlyPlan);
  const [monthlyPlanName, setMonthlyPlanName] = useState('');
  const [savedMonthlyPlans, setSavedMonthlyPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [isMonthlyPlanEditorOpen, setIsMonthlyPlanEditorOpen] = useState(false);
  const [expandedAthletePlanId, setExpandedAthletePlanId] = useState(null);
  const [activeAthleteProfilePlanId, setActiveAthleteProfilePlanId] = useState(null);
  const [athleteEditingId, setAthleteEditingId] = useState('');
  const [athleteCustomPlan, setAthleteCustomPlan] = useState(null);
  const [draggingMethodId, setDraggingMethodId] = useState(null);
  const [draggingFromCell, setDraggingFromCell] = useState(null);
  const [methodSearchTerm, setMethodSearchTerm] = useState('');
  const [methodMacroAreaFilter, setMethodMacroAreaFilter] = useState('all');
  const [methodPeriodFilter, setMethodPeriodFilter] = useState('all');
  const [methodTypeFilter, setMethodTypeFilter] = useState('all');
  const [methodModeFilter, setMethodModeFilter] = useState('all');
  const [methodObjectiveFilter, setMethodObjectiveFilter] = useState('all');
  const [methodCategoryFilter, setMethodCategoryFilter] = useState('all');
  const [methodDisciplineFilter, setMethodDisciplineFilter] = useState('all');
  const [isMethodFilterModalOpen, setIsMethodFilterModalOpen] = useState(false);
  const [dayInsertModal, setDayInsertModal] = useState(null);
  const [evaluationModal, setEvaluationModal] = useState(null);
  const [coachEvaluations, setCoachEvaluations] = useState([]);
  const [coachMessageDraftByEvaluation, setCoachMessageDraftByEvaluation] = useState({});

  const isEditing = useMemo(() => editingUserId !== null, [editingUserId]);
  const isCoachUser = currentUser?.userType === 'coach';
  const athleteId = isCoachUser ? selectedAthleteId : currentUser?.id;
  const athleteUsers = useMemo(() => users.filter((u) => u.userType === 'athlete'), [users]);
  const assignedAthletes = useMemo(() => athleteUsers.filter((ath) => monthlyPlanAthleteIds.includes(ath.id)), [athleteUsers, monthlyPlanAthleteIds]);
  const athleteFullNameById = useMemo(() => Object.fromEntries(athleteUsers.map((athlete) => [athlete.id, `${athlete.firstName} ${athlete.lastName}`.trim()])), [athleteUsers]);
  const athleteAssignedPlans = useMemo(() => {
    if (!athleteId) return [];
    if (!isCoachUser) return savedMonthlyPlans;
    return savedMonthlyPlans.filter((plan) => (plan.assignments || []).some((assignment) => assignment.athleteId === athleteId));
  }, [athleteId, isCoachUser, savedMonthlyPlans]);
  const athleteCoachMessages = useMemo(() => (
    savedMonthlyPlans
      .flatMap((plan) => Object.values(plan.evaluationMap || {}).map((evaluation) => ({
        ...evaluation,
        planId: plan.id,
        planName: plan.name
      })))
      .filter((evaluation) => evaluation?.coachMessage)
      .sort((a, b) => new Date(b.coachMessageUpdatedAt || b.updatedAt || 0).getTime() - new Date(a.coachMessageUpdatedAt || a.updatedAt || 0).getTime())
  ), [savedMonthlyPlans]);

  const filteredTrainingMethods = useMemo(() => {
    const term = methodSearchTerm.trim().toLowerCase();

    return trainingMethods.filter((method) => {
      const matchesSearch = !term
        || method.name?.toLowerCase().includes(term)
        || method.code?.toLowerCase().includes(term);
      const matchesMacroArea = methodMacroAreaFilter === 'all' || method.macroArea === methodMacroAreaFilter;
      const matchesPeriod = methodPeriodFilter === 'all' || method.period === methodPeriodFilter;
      const matchesType = methodTypeFilter === 'all' || method.methodType === methodTypeFilter;
      const matchesMode = methodModeFilter === 'all' || method.trainingMode === methodModeFilter;
      const matchesObjective = methodObjectiveFilter === 'all' || (method.objectiveDetailIds || []).includes(Number(methodObjectiveFilter));
      const matchesCategory = methodCategoryFilter === 'all' || (method.categoryIds || []).includes(Number(methodCategoryFilter));
      const matchesDiscipline = methodDisciplineFilter === 'all' || (method.disciplineIds || []).includes(Number(methodDisciplineFilter));

      return matchesSearch
        && matchesMacroArea
        && matchesPeriod
        && matchesType
        && matchesMode
        && matchesObjective
        && matchesCategory
        && matchesDiscipline;
    });
  }, [
    trainingMethods,
    methodSearchTerm,
    methodMacroAreaFilter,
    methodPeriodFilter,
    methodTypeFilter,
    methodModeFilter,
    methodObjectiveFilter,
    methodCategoryFilter,
    methodDisciplineFilter
  ]);

  const toggleMonthlyPlanAthlete = (athleteUserId) => {
    setMonthlyPlanAthleteIds((prev) => (
      prev.includes(athleteUserId) ? prev.filter((id) => id !== athleteUserId) : [...prev, athleteUserId]
    ));
  };

  const clearMonthlyPlanCell = (weekIndex, dayIndex, methodId, useCustom = false) => {
    const updater = (prev) => prev.map((week, wIdx) => week.map((day, dIdx) => {
      if (wIdx !== weekIndex || dIdx !== dayIndex) return day;
      return day.filter((item) => normalizeDayEntry(item).methodId !== methodId);
    }));

    if (useCustom) {
      setAthleteCustomPlan((prev) => (prev ? updater(prev) : prev));
      return;
    }
    setMonthlyPlan((prev) => updater(prev));
  };

  const onMonthlyPlanDrop = (weekIndex, dayIndex, useCustom = false) => {
    if (!draggingMethodId) return;

    const updater = (prev) => {
      const base = prev.map((week) => week.map((day) => [...day]));

      if (draggingFromCell) {
        const { weekIndex: fromWeek, dayIndex: fromDay, methodId } = draggingFromCell;
        base[fromWeek][fromDay] = base[fromWeek][fromDay].filter((id) => id !== methodId);
      }

      if (!base[weekIndex][dayIndex].some((item) => normalizeDayEntry(item).methodId === draggingMethodId)) {
        base[weekIndex][dayIndex].push({ methodId: draggingMethodId });
      }
      return base;
    };

    if (useCustom) {
      setAthleteCustomPlan((prev) => (prev ? updater(prev) : prev));
    } else {
      setMonthlyPlan((prev) => updater(prev));
    }

    setDraggingMethodId(null);
    setDraggingFromCell(null);
  };


  const saveMonthlyPlan = async () => {
    if (!monthlyPlanName.trim()) {
      setMessage('Inserisci un nome tabella, es. Preparazione febbraio 2026');
      return;
    }

    try {
      const payload = { name: monthlyPlanName.trim(), plan: monthlyPlan, athleteIds: monthlyPlanAthleteIds };
      const endpoint = selectedPlanId ? `/api/monthly-plans/${selectedPlanId}` : '/api/monthly-plans';
      const method = selectedPlanId ? 'PUT' : 'POST';
      const saved = await api(endpoint, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setSelectedPlanId(saved.id);
      setMessage('Tabella mensile salvata e assegnata.');
      await loadMonthlyPlans();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const loadPlanForEditing = (plan) => {
    setSelectedPlanId(plan.id);
    setIsMonthlyPlanEditorOpen(true);
    setMonthlyPlanName(plan.name || '');
    setMonthlyPlan((plan.plan || createEmptyMonthlyPlan()).map((week) => week.map((day) => day.map((item) => normalizeDayEntry(item)))));
    setMonthlyPlanAthleteIds(plan.athleteIds || []);
    setAthleteEditingId('');
    setAthleteCustomPlan(null);
  };

  const openPlanForAthleteCustomization = async (planId, targetAthleteId = null) => {
    const plan = savedMonthlyPlans.find((item) => item.id === planId);
    if (!plan) return;
    loadPlanForEditing(plan);
    setMode('monthly-plans');
    if (!targetAthleteId) return;
    await loadAthleteCustomization(String(targetAthleteId), planId);
  };

  const openAthleteProfilePlanCustomization = async (planId, targetAthleteId) => {
    setSelectedPlanId(planId);
    setActiveAthleteProfilePlanId(planId);
    await loadAthleteCustomization(String(targetAthleteId), planId);
  };

  const loadAthleteCustomization = async (athleteIdValue, planIdOverride = null) => {
    setAthleteEditingId(athleteIdValue);
    const planIdToLoad = planIdOverride || selectedPlanId;
    if (!athleteIdValue || !planIdToLoad) {
      setAthleteCustomPlan(null);
      return;
    }
    try {
      const data = await api(`/api/monthly-plans/${planIdToLoad}/athletes/${athleteIdValue}`, { headers: { Authorization: `Bearer ${token}` } });
      setAthleteCustomPlan((data.plan || null)?.map((week) => week.map((day) => day.map((item) => normalizeDayEntry(item)))) || null);
    } catch (err) {
      setMessage(err.message);
      setAthleteCustomPlan(null);
    }
  };

  const addMethodToDay = (weekIndex, dayIndex, methodId, useCustom = false) => {
    if (!methodId && methodId !== 0) return;
    const id = Number(methodId);
    if (!Number.isInteger(id) || id <= 0) return;
    const updater = (prev) => prev.map((week, wIdx) => week.map((day, dIdx) => {
      if (wIdx !== weekIndex || dIdx !== dayIndex) return day;
      if (day.some((item) => normalizeDayEntry(item).methodId === id)) return day;
      return [...day, { methodId: id }];
    }));

    if (useCustom) {
      setAthleteCustomPlan((prev) => (prev ? updater(prev) : prev));
    } else {
      setMonthlyPlan((prev) => updater(prev));
    }
  };

  const submitMethodEvaluation = async (payload) => {
    if (!payload?.planId || !currentUser?.id) return;
    const targetAthleteId = payload.athleteId || currentUser.id;
    try {
      const result = await api(`/api/monthly-plans/${payload.planId}/athletes/${targetAthleteId}/evaluations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setSavedMonthlyPlans((prev) => prev.map((plan) => (
        plan.id === payload.planId ? { ...plan, evaluationMap: result.evaluationMap || plan.evaluationMap } : plan
      )));
      setMessage('Valutazione salvata.');
      if (isCoachUser) await loadCoachEvaluations();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const deleteMethodEvaluation = async (payload) => {
    if (!payload?.planId || !payload?.athleteId || !payload?.evaluationId) return;
    try {
      const result = await api(`/api/monthly-plans/${payload.planId}/athletes/${payload.athleteId}/evaluations/${payload.evaluationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      setSavedMonthlyPlans((prev) => prev.map((plan) => (
        plan.id === payload.planId ? { ...plan, evaluationMap: result.evaluationMap || {} } : plan
      )));
      setMessage('Valutazione eliminata.');
      if (isCoachUser) await loadCoachEvaluations();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const saveCoachMessage = async (evaluationId) => {
    try {
      const updated = await api(`/api/coach/evaluations/${evaluationId}/message`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachMessage: coachMessageDraftByEvaluation[evaluationId] || '' })
      });
      setCoachEvaluations((prev) => prev.map((item) => item.id === evaluationId ? { ...item, coachMessage: updated.coachMessage, coachMessageUpdatedAt: updated.coachMessageUpdatedAt } : item));
      setMessage('Messaggio coach salvato.');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const saveAthleteCustomization = async () => {
    if (!selectedPlanId || !athleteEditingId || !athleteCustomPlan) return;
    try {
      await api(`/api/monthly-plans/${selectedPlanId}/athletes/${athleteEditingId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: athleteCustomPlan })
      });
      setMessage('Personalizzazione atleta salvata.');
      await loadMonthlyPlans();
    } catch (err) {
      setMessage(err.message);
    }
  };


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
    const [details, categories, athleteCats, disciplineList, exercises, methods] = await Promise.all([
      api('/api/training-objective-details', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/training-categories', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/athlete-categories', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/disciplines', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/training-exercises', { headers: { Authorization: `Bearer ${authToken}` } }),
      api('/api/training-methods', { headers: { Authorization: `Bearer ${authToken}` } })
    ]);
    setTrainingObjectiveDetails(details);
    setTrainingCategories(categories);
    setAthleteCategories(athleteCats);
    setDisciplines(disciplineList);
    setTrainingExercises(exercises);
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


  const handleSaveExercise = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const endpoint = editingExerciseId ? `/api/training-exercises/${editingExerciseId}` : '/api/training-exercises';
      const method = editingExerciseId ? 'PUT' : 'POST';
      await api(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(exerciseForm)
      });
      setEditingExerciseId(null);
      setExerciseForm({ name: '' });
      await loadTrainingCatalog();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const startEditingExercise = (exercise) => {
    setEditingExerciseId(exercise.id);
    setExerciseForm({ name: exercise.name });
  };

  const cancelExerciseEditing = () => {
    setEditingExerciseId(null);
    setExerciseForm({ name: '' });
  };

  const deleteExercise = async (id) => {
    try {
      await api(`/api/training-exercises/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (editingExerciseId === id) {
        cancelExerciseEditing();
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
      trainingMode: method.trainingMode || 'in_bici',
      progressionIncrementPct: method.progressionIncrementPct ?? 5,
      progression: method.progression || emptyTrainingMethodForm.progression,
      sets: [{ ...cloneSet(firstSet), intervals: (firstSet.intervals || []).map((interval) => ({ ...interval, intervalRecoveryMinutes: Math.floor((interval.recoverySeconds || 0) / 60), intervalRecoverySeconds: (interval.recoverySeconds || 0) % 60 })) }]
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
    if (token && (mode === 'users-list' || mode === 'profile' || (isCoachUser && mode === 'monthly-plans'))) {
      loadUsers().catch((err) => setMessage(err.message));
    }
  }, [mode, token, isCoachUser]);

  useEffect(() => {
    if (mode !== 'monthly-plans') return;
    setIsMonthlyPlanEditorOpen(false);
    setSelectedPlanId(null);
    setExpandedAthletePlanId(null);
  }, [mode]);

  useEffect(() => {
    if (token && mode === 'athlete-profile' && athleteId) {
      loadAthleteHistory().catch((err) => setMessage(err.message));
    }
  }, [mode, token, athleteId]);

  useEffect(() => {
    if (token && isCoachUser && ['training-methods', 'training-objective-details', 'training-categories', 'athlete-categories', 'disciplines', 'training-exercises', 'general-master-data', 'coach-zone-config', 'monthly-plans', 'athlete-profile'].includes(mode)) {
      loadTrainingCatalog().catch((err) => setMessage(err.message));
    }
  }, [mode, token, isCoachUser]);


  useEffect(() => {
    if (token && (mode === 'monthly-plans' || mode === 'athlete-profile')) {
      loadMonthlyPlans().catch((err) => setMessage(err.message));
    }
  }, [mode, token]);

  useEffect(() => {
    if (token && isCoachUser && mode === 'dashboard') {
      loadCoachEvaluations().catch((err) => setMessage(err.message));
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

  const selectedNames = (items, ids) => items.filter((item) => ids.includes(item.id)).map((item) => item.name).join(', ');

  const getMethodById = (id) => trainingMethods.find((item) => item.id === id);

  const compactMethodDetail = (method) => {
    if (!method) return '';
    const blocks = (method.sets || []).map((set, setIndex) => {
      const intervals = (set.intervals || []).map((interval) => {
        if ((method.trainingMode || 'in_bici') === 'in_bici') {
          return `${interval.minutes || 0}m${interval.seconds || 0}s ${interval.intensityZone || '-'}`;
        }
        return `${interval.minutes || 0}x ${interval.exerciseName || 'esercizio'}`;
      });
      return `S${setIndex + 1} ${set.seriesCount} serie · ${intervals.join(' | ')}`;
    });
    return blocks.join(' • ');
  };

  const loadMonthlyPlans = async (authToken = token) => {
    const data = await api('/api/monthly-plans', { headers: { Authorization: `Bearer ${authToken}` } });
    setSavedMonthlyPlans(data || []);
  };

  const loadCoachEvaluations = async (authToken = token) => {
    if (!isCoachUser) return;
    const data = await api('/api/coach/evaluations', { headers: { Authorization: `Bearer ${authToken}` } });
    setCoachEvaluations(data || []);
    setCoachMessageDraftByEvaluation((data || []).reduce((acc, item) => {
      acc[item.id] = item.coachMessage || '';
      return acc;
    }, {}));
  };

  const formatIntervalSummary = (interval, trainingMode) => {
    if (trainingMode === 'in_bici') {
      return `${interval.minutes}m${interval.seconds}s ${interval.intensityZone || '-'} rpm ${interval.rpm || '-'} rpe ${interval.rpe || '-'}`;
    }

    const details = [
      String(interval.minutes || 0),
      interval.exerciseName || '-'
    ];
    const recoverySeconds = Number(interval.recoverySeconds || 0);
    if (recoverySeconds > 0) {
      details.push(`rec ${Math.floor(recoverySeconds / 60)}:${String(recoverySeconds % 60).padStart(2, '0')}`);
    }
    if (interval.overloadPct !== null && interval.overloadPct !== undefined && interval.overloadPct !== '') {
      details.push(`sovr. ${interval.overloadPct}%`);
    }
    return details.join(' ');
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
    const interval = { minutes: 1, seconds: 0, intensityZone: 'Z3', rpm: 90, rpe: '', exerciseId: '', intervalRecoveryMinutes: 0, intervalRecoverySeconds: 0, description: '', overloadPct: '' };
    setTrainingMethodForm((prev) => ({
      ...prev,
      sets: [{ ...prev.sets[0], intervals: [...prev.sets[0].intervals, interval] }]
    }));
  };
  const removeInterval = (_setIndex, intervalIndex) => setTrainingMethodForm((prev) => ({
    ...prev,
    sets: [{ ...prev.sets[0], intervals: prev.sets[0].intervals.filter((_, iIndex) => iIndex !== intervalIndex) }]
  }));

  const previewStressScore = useMemo(() => {
    if (trainingMethodForm.trainingMode !== 'in_bici') return 0;
    return trainingMethodForm.sets.reduce((total, set) => {
    const series = Number(set.seriesCount || 0);
    const setStress = set.intervals.reduce((acc, interval) => {
      const duration = Number(interval.minutes || 0) * 60 + Number(interval.seconds || 0);
      const weight = zoneStressWeights[interval.intensityZone] || 1;
      return acc + duration * weight;
    }, 0);
    return total + setStress * series;
    }, 0);
  }, [trainingMethodForm.sets, trainingMethodForm.trainingMode]);


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
              {!isCoachUser && <button onClick={() => setMode('monthly-plans')}>Le mie tabelle</button>}
              {isCoachUser && <button onClick={() => setMode('training-methods')}>Metodi allenamento</button>}
              {isCoachUser && <button onClick={() => setMode('monthly-plans')}>Tabelle mensili</button>}
              {isCoachUser && <button onClick={() => setMode('general-master-data')}>Anagrafiche campi generali</button>}
            </div>
          </section>

          {mode === 'dashboard' && (
            <section className="card">
              <h2>Home</h2>
              {isCoachUser ? (
                <>
                  <h3>Valutazioni atleti</h3>
                  {coachEvaluations.length === 0 && <p>Nessuna valutazione inserita dagli atleti.</p>}
                  <div className="coach-evaluation-list">
                    {coachEvaluations.map((item) => (
                      <div key={`coach-eval-${item.id}`} className="subcard">
                        <div className="row"><strong>{item.athleteName || `Atleta #${item.athleteId}`}</strong><small>{item.planName}</small></div>
                        <small>{weekDays[item.dayIndex]} · Settimana {item.weekIndex + 1} · {item.methodCode} · {item.methodName}</small>
                        <small>{item.wasCompleted ? '✅ Effettuato' : '❌ Non effettuato'} · Completamento {item.completionPct}%</small>
                        {item.notes && <small>Note atleta: {item.notes}</small>}
                        <label>Messaggio coach
                          <textarea value={coachMessageDraftByEvaluation[item.id] || ''} onChange={(e) => setCoachMessageDraftByEvaluation((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                        </label>
                        <button type="button" onClick={() => saveCoachMessage(item.id)}>Salva messaggio</button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p>Benvenuto! Consulta le tue tabelle mensili e le eventuali note del coach.</p>
                  <h3>Messaggi del coach</h3>
                  {athleteCoachMessages.length === 0 && <p>Nessun messaggio disponibile.</p>}
                  {athleteCoachMessages.slice(0, 8).map((item) => (
                    <div key={`dash-coach-message-${item.id}`} className="subcard">
                      <div className="row"><strong>{item.planName}</strong><small>Settimana {item.weekIndex + 1} · {weekDays[item.dayIndex]}</small></div>
                      <small>{item.methodCode || `Metodo #${item.methodId}`}</small>
                      <p>💬 {item.coachMessage}</p>
                    </div>
                  ))}
                </>
              )}
            </section>
          )}

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
                <button type="button" onClick={() => setMode('training-exercises')}>Esercizi</button>
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
                  <label>Modalità<select value={trainingMethodForm.trainingMode} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, trainingMode: e.target.value })}>{trainingModes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label>Incremento settimanale (%)<input type="number" min="0" max="100" step="0.5" value={trainingMethodForm.progressionIncrementPct} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, progressionIncrementPct: e.target.value })} /></label>
                  <label>Note<textarea value={trainingMethodForm.notes} onChange={(e) => setTrainingMethodForm({ ...trainingMethodForm, notes: e.target.value })} /></label>

                  <div className="compact-selector-grid">
                    <div className="compact-selector">
                      <h4>Dettagli obiettivo</h4>
                      <small>Selezionati: {trainingMethodForm.objectiveDetailIds.length} {selectedNames(trainingObjectiveDetails, trainingMethodForm.objectiveDetailIds)}</small>
                      <div className="check-list">{trainingObjectiveDetails.map((detail) => (
                        <label key={detail.id} className="check-item"><input type="checkbox" checked={trainingMethodForm.objectiveDetailIds.includes(detail.id)} onChange={() => toggleMultiValue('objectiveDetailIds', detail.id)} /> {detail.name}</label>
                      ))}</div>
                    </div>
                    <div className="compact-selector">
                      <h4>Categorie</h4>
                      <small>Selezionate: {trainingMethodForm.categoryIds.length} {selectedNames(trainingCategories, trainingMethodForm.categoryIds)}</small>
                      <div className="check-list">{trainingCategories.map((category) => (
                        <label key={category.id} className="check-item"><input type="checkbox" checked={trainingMethodForm.categoryIds.includes(category.id)} onChange={() => toggleMultiValue('categoryIds', category.id)} /> {category.name}</label>
                      ))}</div>
                    </div>
                    <div className="compact-selector">
                      <h4>Discipline</h4>
                      <small>Selezionate: {trainingMethodForm.disciplineIds.length} {selectedNames(disciplines, trainingMethodForm.disciplineIds)}</small>
                      <div className="check-list">{disciplines.map((discipline) => (
                        <label key={discipline.id} className="check-item"><input type="checkbox" checked={trainingMethodForm.disciplineIds.includes(discipline.id)} onChange={() => toggleMultiValue('disciplineIds', discipline.id)} /> {discipline.name}</label>
                      ))}</div>
                    </div>
                  </div>

                  {trainingMethodForm.sets.map((set, setIndex) => (
                    <div key={`set-${setIndex}`} className="edit-form">
                      <h4>Serie del metodo</h4>
                      <div className="set-grid">
                        <label className="compact-field">Numero serie<input className="short-input" type="number" min="1" value={set.seriesCount} onChange={(e) => updateSetField(setIndex, 'seriesCount', e.target.value)} /></label>
                        {trainingMethodForm.trainingMode === 'in_bici' ? (
                          <>
                            <label className="compact-field">Recupero minuti<input className="short-input" type="number" min="0" value={set.recoveryMinutes} onChange={(e) => updateSetField(setIndex, 'recoveryMinutes', e.target.value)} /></label>
                            <label className="compact-field">Recupero secondi<input className="short-input" type="number" min="0" max="59" value={set.recoverySeconds} onChange={(e) => updateSetField(setIndex, 'recoverySeconds', e.target.value)} /></label>
                          </>
                        ) : (
                          <label className="compact-field">Recupero
                            <input
                              className="short-input"
                              type="time"
                              step="1"
                              value={toTimeInputValue(set.recoveryMinutes, set.recoverySeconds)}
                              onChange={(e) => {
                                const { minutes, seconds } = fromTimeInputValue(e.target.value);
                                updateSetField(setIndex, 'recoveryMinutes', minutes);
                                updateSetField(setIndex, 'recoverySeconds', seconds);
                              }}
                            />
                          </label>
                        )}
                      </div>
                      {set.intervals.map((interval, intervalIndex) => (
                        <div key={`interval-${intervalIndex}`} className="edit-form interval-grid">
                          <h5>Intervallo #{intervalIndex + 1}</h5>
                          {trainingMethodForm.trainingMode === 'in_bici' ? (
                            <>
                              <label>Minuti<input type="number" min="0" value={interval.minutes} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'minutes', e.target.value)} /></label>
                              <label>Secondi<input type="number" min="0" max="59" value={interval.seconds} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'seconds', e.target.value)} /></label>
                              <label>Zona<select value={interval.intensityZone} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'intensityZone', e.target.value)}>{zoneRules.map((rule) => <option key={rule.zone} value={rule.zone}>{rule.zone}</option>)}</select></label>
                              <label>RPM<input type="number" min="0" value={interval.rpm} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'rpm', e.target.value)} /></label>
                              <label>RPE<input type="number" min="0" step="0.5" value={interval.rpe} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'rpe', e.target.value)} /></label>
                            </>
                          ) : (
                            <>
                              <label>Numero<input type="number" min="1" value={interval.minutes} onChange={(e) => { updateIntervalField(setIndex, intervalIndex, 'minutes', e.target.value); updateIntervalField(setIndex, intervalIndex, 'seconds', 0); }} /></label>
                              <label>Esercizio<select value={interval.exerciseId} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'exerciseId', e.target.value)}><option value="">Seleziona</option>{trainingExercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label>
                              <label>Recupero intervallo
                                <input
                                  type="time"
                                  step="1"
                                  value={toTimeInputValue(interval.intervalRecoveryMinutes, interval.intervalRecoverySeconds)}
                                  onChange={(e) => {
                                    const { minutes, seconds } = fromTimeInputValue(e.target.value);
                                    updateIntervalField(setIndex, intervalIndex, 'intervalRecoveryMinutes', minutes);
                                    updateIntervalField(setIndex, intervalIndex, 'intervalRecoverySeconds', seconds);
                                  }}
                                />
                              </label>
                              <label>Sovraccarico (% max)<input type="number" min="0" step="0.5" value={interval.overloadPct} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'overloadPct', e.target.value)} /></label>
                              <label className="interval-description">Descrizione intervallo<textarea value={interval.description || ''} onChange={(e) => updateIntervalField(setIndex, intervalIndex, 'description', e.target.value)} /></label>
                            </>
                          )}
                          {set.intervals.length > 1 && <button type="button" className="danger" onClick={() => removeInterval(setIndex, intervalIndex)}>Rimuovi intervallo</button>}
                        </div>
                      ))}
                      <div className="actions">
                        <button type="button" onClick={() => addInterval(setIndex)}>Aggiungi intervallo</button>
                      </div>
                    </div>
                  ))}

                  {trainingMethodForm.trainingMode === 'in_bici' && <p>Punteggio stress stimato: <strong>{Math.round(previewStressScore)}</strong></p>}
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
                      <thead><tr><th>Nome</th><th>Codice</th><th>Modalità</th><th>Obiettivi</th><th>Categorie</th><th>Discipline</th><th>Stress</th><th>Dettaglio</th><th>Azioni</th></tr></thead>
                      <tbody>
                        {trainingMethods.map((method) => (
                          <tr key={method.id}>
                            <td>{method.name}</td>
                            <td>{method.code}</td>
                            <td>{(trainingModes.find((m) => m.value === method.trainingMode)?.label) || method.trainingMode}</td>
                            <td>{(method.objectiveDetailNames || []).join(', ')}</td>
                            <td>{(method.categoryNames || []).join(', ')}</td>
                            <td>{(method.disciplineNames || []).join(', ')}</td>
                            <td>{method.stressScore ?? '-'}</td>
                            <td>
                              {method.sets.map((set) => (
                                <div key={set.id}>{set.seriesCount} serie, rec {Math.floor(set.recoverySeconds / 60)}:{String(set.recoverySeconds % 60).padStart(2, '0')} - {set.intervals.map((i) => formatIntervalSummary(i, method.trainingMode)).join(' | ')}</div>
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


          {mode === 'monthly-plans' && (
            <section className="card">
              <div className="row">
                <h2>Tabelle mensili allenamenti</h2>
                {isCoachUser && <button type="button" className="secondary" onClick={() => { setMonthlyPlan(createEmptyMonthlyPlan()); setMonthlyPlanAthleteIds([]); setMonthlyPlanName(''); setSelectedPlanId(null); setAthleteEditingId(''); setAthleteCustomPlan(null); setIsMonthlyPlanEditorOpen(true); }}>Nuova tabella</button>}
              </div>

              {isCoachUser && (
                <>
                  <p>La lista metodi resta sempre visibile durante lo scroll. Puoi trascinare dal catalogo e anche da un giorno all'altro.</p>

                  <div className="monthly-plan-saved-list subcard">
                    <h3>Tabelle salvate</h3>
                    {savedMonthlyPlans.length === 0 && <small>Nessuna tabella salvata</small>}
                    {savedMonthlyPlans.map((plan) => (
                      <button key={`saved-plan-${plan.id}`} type="button" className={`plan-list-row ${selectedPlanId === plan.id ? 'active' : ''}`} onClick={() => loadPlanForEditing(plan)}>
                        <span className="plan-list-name">{plan.name}</span>
                        <span className="plan-list-athletes">
                          {(plan.assignments || []).length === 0 && <small>Nessun atleta assegnato</small>}
                          {(plan.assignments || []).map((assignment) => (
                            <span key={`plan-assignment-${plan.id}-${assignment.athleteId}`} className="plan-athlete-pill">
                              {assignment.hasCustomPlan ? '★ ' : ''}{assignment.athleteName || athleteFullNameById[assignment.athleteId] || `Atleta #${assignment.athleteId}`}
                            </span>
                          ))}
                        </span>
                      </button>
                    ))}
                  </div>

                  {isMonthlyPlanEditorOpen && <div className="monthly-plan-builder-layout">
                    <div className="subcard monthly-plan-editor-scroll">
                      <label>Nome tabella
                        <input value={monthlyPlanName} onChange={(e) => setMonthlyPlanName(e.target.value)} placeholder="Es. Preparazione febbraio 2026" />
                      </label>

                      <h3>Atleti assegnati</h3>
                      <div className="check-list">
                        {athleteUsers.map((athlete) => (
                          <label key={`plan-athlete-${athlete.id}`} className="check-item">
                            <input type="checkbox" checked={monthlyPlanAthleteIds.includes(athlete.id)} onChange={() => toggleMonthlyPlanAthlete(athlete.id)} />
                            {athlete.firstName} {athlete.lastName}
                          </label>
                        ))}
                      </div>

                      <div className="monthly-plan-grid">
                        {monthlyPlan.map((week, weekIndex) => (
                          <div key={`week-${weekIndex}`} className="subcard">
                            <h3>Settimana {weekIndex + 1}</h3>
                            <div className="week-grid">
                              {week.map((methodEntries, dayIndex) => (
                                <div key={`day-${weekIndex}-${dayIndex}`} className="week-day-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={() => onMonthlyPlanDrop(weekIndex, dayIndex)}>
                                  <div className="row">
                                    <strong>{weekDays[dayIndex]}</strong>
                                    <button type="button" className="secondary" onClick={() => setDayInsertModal({ weekIndex, dayIndex, useCustom: false, selectedMethodId: '' })}>+</button>
                                  </div>
                                  <div className="day-methods">
                                    {methodEntries.length === 0 && <small>Nessun metodo</small>}
                                    {methodEntries.map((entry) => {
                                      const methodId = normalizeDayEntry(entry).methodId;
                                      const method = getMethodById(methodId);
                                      if (!method) return null;
                                      return (
                                        <div key={`placed-${weekIndex}-${dayIndex}-${methodId}`} className="placed-method" draggable onDragStart={() => { setDraggingMethodId(methodId); setDraggingFromCell({ weekIndex, dayIndex, methodId }); }} onDragEnd={() => { setDraggingMethodId(null); setDraggingFromCell(null); }} title={`${compactMethodDetail(method)}${method.notes ? `

Note: ${method.notes}` : ''}`}>
                                          <span>{method.code} · {method.name}<small>{compactMethodDetail(method)}</small></span>
                                          <button type="button" className="danger" onClick={() => clearMonthlyPlanCell(weekIndex, dayIndex, methodId)}>x</button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={saveMonthlyPlan}>Salva/Assegna tabella</button>

                      <div className="subcard">
                        <h3>Personalizzazione singolo atleta</h3>
                        <label>Atleta da personalizzare
                          <select value={athleteEditingId} onChange={(e) => loadAthleteCustomization(e.target.value)}>
                            <option value="">Seleziona atleta</option>
                            {assignedAthletes.map((athlete) => <option key={`edit-ath-${athlete.id}`} value={athlete.id}>{athlete.firstName} {athlete.lastName}</option>)}
                          </select>
                        </label>

                        {athleteCustomPlan && (
                          <>
                            <div className="monthly-plan-grid">
                              {athleteCustomPlan.map((week, weekIndex) => (
                                <div key={`custom-week-${weekIndex}`} className="subcard">
                                  <h4>Settimana {weekIndex + 1}</h4>
                                  <div className="week-grid">
                                    {week.map((methodEntries, dayIndex) => (
                                      <div key={`custom-day-${weekIndex}-${dayIndex}`} className="week-day-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={() => onMonthlyPlanDrop(weekIndex, dayIndex, true)}>
                                        <div className="row">
                                          <strong>{weekDays[dayIndex]}</strong>
                                          <button type="button" className="secondary" onClick={() => setDayInsertModal({ weekIndex, dayIndex, useCustom: true, selectedMethodId: '' })}>+</button>
                                        </div>
                                        <div className="day-methods">
                                          {methodEntries.length === 0 && <small>Nessun metodo</small>}
                                          {methodEntries.map((entry) => {
                                            const methodId = normalizeDayEntry(entry).methodId;
                                            const method = getMethodById(methodId);
                                            if (!method) return null;
                                            return <div key={`custom-m-${weekIndex}-${dayIndex}-${methodId}`} className="placed-method"><span>{method.code} · {method.name}</span><button type="button" className="danger" onClick={() => clearMonthlyPlanCell(weekIndex, dayIndex, methodId, true)}>x</button></div>;
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button type="button" onClick={saveAthleteCustomization}>Salva personalizzazione atleta</button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="subcard sticky-panel monthly-method-panel">
                      <div className="row"><h3>Metodi disponibili (drag)</h3><button type="button" className="secondary" onClick={() => setIsMethodFilterModalOpen(true)}>Filtri</button></div>
                      {isMethodFilterModalOpen && <div className="modal-backdrop" role="dialog" aria-modal="true"><div className="modal-card"><div className="row"><h4>Filtri metodi</h4><button type="button" className="secondary" onClick={() => setIsMethodFilterModalOpen(false)}>Chiudi</button></div><div className="edit-form">
                        <label>Ricerca per nome/codice
                          <input value={methodSearchTerm} onChange={(e) => setMethodSearchTerm(e.target.value)} placeholder="Cerca metodo..." />
                        </label>
                        <label>Macroarea
                          <select value={methodMacroAreaFilter} onChange={(e) => setMethodMacroAreaFilter(e.target.value)}>
                            <option value="all">Tutte</option>
                            {macroAreas.map((item) => <option key={`mf-macro-${item.value}`} value={item.value}>{item.label}</option>)}
                          </select>
                        </label>
                        <label>Periodo
                          <select value={methodPeriodFilter} onChange={(e) => setMethodPeriodFilter(e.target.value)}>
                            <option value="all">Tutti</option>
                            {trainingPeriods.map((item) => <option key={`mf-period-${item.value}`} value={item.value}>{item.label}</option>)}
                          </select>
                        </label>
                        <label>Tipologia
                          <select value={methodTypeFilter} onChange={(e) => setMethodTypeFilter(e.target.value)}>
                            <option value="all">Tutte</option>
                            {trainingMethodTypes.map((item) => <option key={`mf-type-${item.value}`} value={item.value}>{item.label}</option>)}
                          </select>
                        </label>
                        <label>Modalità
                          <select value={methodModeFilter} onChange={(e) => setMethodModeFilter(e.target.value)}>
                            <option value="all">Tutte</option>
                            {trainingModes.map((item) => <option key={`mf-mode-${item.value}`} value={item.value}>{item.label}</option>)}
                          </select>
                        </label>
                        <label>Dettaglio obiettivo
                          <select value={methodObjectiveFilter} onChange={(e) => setMethodObjectiveFilter(e.target.value)}>
                            <option value="all">Tutti</option>
                            {trainingObjectiveDetails.map((item) => <option key={`mf-obj-${item.id}`} value={item.id}>{item.name}</option>)}
                          </select>
                        </label>
                        <label>Categoria
                          <select value={methodCategoryFilter} onChange={(e) => setMethodCategoryFilter(e.target.value)}>
                            <option value="all">Tutte</option>
                            {trainingCategories.map((item) => <option key={`mf-cat-${item.id}`} value={item.id}>{item.name}</option>)}
                          </select>
                        </label>
                        <label>Disciplina
                          <select value={methodDisciplineFilter} onChange={(e) => setMethodDisciplineFilter(e.target.value)}>
                            <option value="all">Tutte</option>
                            {disciplines.map((item) => <option key={`mf-disc-${item.id}`} value={item.id}>{item.name}</option>)}
                          </select>
                        </label>
                      </div></div></div>}
                      <div className="method-drag-list">
                        {filteredTrainingMethods.map((method) => (
                          <button
                            key={`drag-method-${method.id}`}
                            type="button"
                            className="method-chip"
                            draggable
                            title={`${compactMethodDetail(method)}${method.notes ? `

Note: ${method.notes}` : ''}`}
                            onDragStart={() => { setDraggingMethodId(method.id); setDraggingFromCell(null); }}
                            onDragEnd={() => { setDraggingMethodId(null); setDraggingFromCell(null); }}
                          >
                            <strong>{method.code} · {method.name}</strong>
                            <small>{compactMethodDetail(method)}</small>
                          </button>
                        ))}
                        {filteredTrainingMethods.length === 0 && <small>Nessun metodo corrisponde ai filtri selezionati.</small>}
                      </div>
                    </div>
                  </div>}
                  {!isMonthlyPlanEditorOpen && <p>Seleziona una tabella salvata oppure clicca su <strong>Nuova tabella</strong> per vedere il dettaglio.</p>}
                </>
              )}

              {!isCoachUser && (
                <div>
                  <h3>Le tue tabelle assegnate</h3>
                  {savedMonthlyPlans.length === 0 && <p>Non hai ancora tabelle assegnate.</p>}
                  {savedMonthlyPlans.map((plan) => {
                    const isExpanded = expandedAthletePlanId === plan.id;
                    return (
                    <div key={`ath-plan-${plan.id}`} className="subcard">
                      <div className="row">
                        <h4>{plan.name}</h4>
                        <button type="button" className="secondary" onClick={() => setExpandedAthletePlanId(isExpanded ? null : plan.id)}>
                          {isExpanded ? 'Nascondi dettaglio' : 'Apri dettaglio'}
                        </button>
                      </div>
                      {isExpanded && <div className="monthly-plan-grid">
                        {plan.plan.map((week, weekIndex) => (
                          <div key={`ath-week-${plan.id}-${weekIndex}`} className="subcard">
                            <strong>Settimana {weekIndex + 1}</strong>
                            <div className="week-grid">
                              {week.map((methodEntries, dayIndex) => (
                                <div key={`ath-day-${plan.id}-${weekIndex}-${dayIndex}`} className="week-day-dropzone">
                                  <strong>{weekDays[dayIndex]}</strong>
                                  <div className="day-methods">
                                    {methodEntries.length === 0 && <small>Nessun metodo</small>}
                                    {methodEntries.map((entry) => {
                                      const methodId = normalizeDayEntry(entry).methodId;
                                      const method = getMethodById(methodId);
                                      if (!method) return null;
                                      const evalKey = `${weekIndex}-${dayIndex}-${methodId}`;
                                      const methodEval = plan.evaluationMap?.[evalKey];
                                      return <div key={`ath-method-${plan.id}-${weekIndex}-${dayIndex}-${methodId}`} className="placed-method"><span>{method.code} · {method.name}<small>{compactMethodDetail(method)}</small>{methodEval && <small>✅ Valutato: {methodEval.completionPct}% · {methodEval.wasCompleted ? 'effettuato' : 'non effettuato'}</small>}{methodEval?.coachMessage && <small>💬 Coach: {methodEval.coachMessage}</small>}</span><div className="actions"><button type="button" className={methodEval ? 'success' : 'secondary'} onClick={() => setEvaluationModal({ planId: plan.id, athleteId: currentUser.id, weekIndex, dayIndex, methodId, methodName: `${method.code} · ${method.name}`, performedAt: methodEval?.performedAt || new Date().toISOString().slice(0, 10), liking: methodEval?.liking || 3, difficulty: methodEval?.difficulty || 3, perceivedFatigue: methodEval?.perceivedFatigue || 3, eveningRecovery: methodEval?.eveningRecovery || 3, nextDayRecovery: methodEval?.nextDayRecovery || 3, completionPct: methodEval?.completionPct ?? 100, wasCompleted: methodEval?.wasCompleted ?? true, notes: methodEval?.notes || '', evaluationId: methodEval?.id || null })}>{methodEval ? 'Visualizza valutazione' : 'Aggiungi valutazione'}</button>{methodEval && <button type="button" className="danger" onClick={() => deleteMethodEvaluation({ planId: plan.id, athleteId: currentUser.id, evaluationId: methodEval.id })}>Elimina</button>}</div></div>;
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>}
                    </div>
                  );
                  })}
                </div>
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
                <button type="button" onClick={() => setMode('training-exercises')}>Esercizi</button>
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



          {mode === 'training-exercises' && isCoachUser && (
            <section className="card">
              <div className="row">
                <h2>Esercizi</h2>
                <button type="button" className="secondary" onClick={() => setMode('general-master-data')}>Torna alle anagrafiche</button>
              </div>
              <form onSubmit={handleSaveExercise} className="subcard">
                <h3>{editingExerciseId ? `Modifica esercizio #${editingExerciseId}` : 'Nuovo esercizio'}</h3>
                <label>Nome esercizio<input value={exerciseForm.name} onChange={(e) => setExerciseForm({ name: e.target.value })} required /></label>
                <div className="actions">
                  <button type="submit">{editingExerciseId ? 'Salva modifica' : 'Aggiungi esercizio'}</button>
                  {editingExerciseId && <button type="button" className="secondary" onClick={cancelExerciseEditing}>Annulla</button>}
                </div>
              </form>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Nome</th><th>Azioni</th></tr></thead>
                  <tbody>
                    {trainingExercises.map((exercise) => (
                      <tr key={exercise.id}>
                        <td>{exercise.id}</td>
                        <td>{exercise.name}</td>
                        <td><div className="actions"><button type="button" onClick={() => startEditingExercise(exercise)}>Modifica</button><button type="button" className="danger" onClick={() => deleteExercise(exercise.id)}>Elimina</button></div></td>
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


                  <div className="subcard">
                    <h3>Tabelle assegnate atleta</h3>
                    {athleteAssignedPlans.length === 0 && <p>Nessuna tabella assegnata.</p>}
                    {athleteAssignedPlans.map((plan) => (
                      <div key={`profile-plan-${plan.id}`} className="profile-plan-row">
                        <div>
                          <strong>{plan.name}</strong>
                          {isCoachUser && <small>{plan.customPlanApplied ? ' · personalizzata' : ' · base'}</small>}
                        </div>
                        {isCoachUser ? (
                          <div className="actions">
                            <button type="button" className="secondary" onClick={() => openAthleteProfilePlanCustomization(plan.id, athleteId)}>
                              Personalizza qui
                            </button>
                            <button type="button" className="secondary" onClick={() => openPlanForAthleteCustomization(plan.id, athleteId)}>
                              Apri editor completo
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}

                    {isCoachUser && athleteCustomPlan && activeAthleteProfilePlanId && selectedPlanId === activeAthleteProfilePlanId && (
                      <div className="subcard">
                        <div className="row">
                          <h4>Personalizzazione tabella atleta (modifica singola)</h4>
                          <button type="button" className="secondary" onClick={() => { setActiveAthleteProfilePlanId(null); setAthleteEditingId(''); setAthleteCustomPlan(null); }}>Chiudi</button>
                        </div>
                        <div className="monthly-plan-grid">
                          {athleteCustomPlan.map((week, weekIndex) => (
                            <div key={`profile-custom-week-${weekIndex}`} className="subcard">
                              <strong>Settimana {weekIndex + 1}</strong>
                              <div className="week-grid">
                                {week.map((methodEntries, dayIndex) => (
                                  <div key={`profile-custom-day-${weekIndex}-${dayIndex}`} className="week-day-dropzone">
                                    <div className="row">
                                      <strong>{weekDays[dayIndex]}</strong>
                                      <button type="button" className="secondary" onClick={() => setDayInsertModal({ weekIndex, dayIndex, useCustom: true, selectedMethodId: '' })}>+</button>
                                    </div>
                                    <div className="day-methods">
                                      {methodEntries.length === 0 && <small>Nessun metodo</small>}
                                      {methodEntries.map((entry) => {
                                        const methodId = normalizeDayEntry(entry).methodId;
                                        const method = getMethodById(methodId);
                                        if (!method) return null;
                                        return (
                                          <div key={`profile-custom-method-${weekIndex}-${dayIndex}-${methodId}`} className="placed-method">
                                            <span>{method.code} · {method.name}<small>{compactMethodDetail(method)}</small></span>
                                            <button type="button" className="danger" onClick={() => clearMonthlyPlanCell(weekIndex, dayIndex, methodId, true)}>x</button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button type="button" onClick={saveAthleteCustomization}>Salva personalizzazione atleta</button>
                      </div>
                    )}
                  </div>

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

      {dayInsertModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="row">
              <h4>Aggiungi metodo a {weekDays[dayInsertModal.dayIndex]}</h4>
              <button type="button" className="secondary" onClick={() => setDayInsertModal(null)}>Chiudi</button>
            </div>
            <label>Metodo
              <select value={dayInsertModal.selectedMethodId} onChange={(e) => setDayInsertModal((prev) => ({ ...prev, selectedMethodId: e.target.value }))}>
                <option value="">Seleziona</option>
                {filteredTrainingMethods.map((method) => <option key={`ins-${method.id}`} value={method.id}>{method.code} · {method.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => { addMethodToDay(dayInsertModal.weekIndex, dayInsertModal.dayIndex, dayInsertModal.selectedMethodId, dayInsertModal.useCustom); setDayInsertModal(null); }}>Inserisci metodo</button>
          </div>
        </div>
      )}

      {evaluationModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="row">
              <h4>Valutazione metodo: {evaluationModal.methodName}</h4>
              <button type="button" className="secondary" onClick={() => setEvaluationModal(null)}>Chiudi</button>
            </div>
            <div className="edit-form">
              <label>Data effettuazione<input type="date" value={evaluationModal.performedAt} onChange={(e) => setEvaluationModal((prev) => ({ ...prev, performedAt: e.target.value }))} /></label>
              <label>Gradimento (1-5)<input type="number" min="1" max="5" value={evaluationModal.liking} onChange={(e) => setEvaluationModal((prev) => ({ ...prev, liking: Number(e.target.value) }))} /></label>
              <label>Difficoltà (1-5)<input type="number" min="1" max="5" value={evaluationModal.difficulty} onChange={(e) => setEvaluationModal((prev) => ({ ...prev, difficulty: Number(e.target.value) }))} /></label>
              <label>Percezione fatica (1-5)<input type="number" min="1" max="5" value={evaluationModal.perceivedFatigue} onChange={(e) => setEvaluationModal((prev) => ({ ...prev, perceivedFatigue: Number(e.target.value) }))} /></label>
              <label>Recupero sera (1-5)<input type="number" min="1" max="5" value={evaluationModal.eveningRecovery} onChange={(e) => setEvaluationModal((prev) => ({ ...prev, eveningRecovery: Number(e.target.value) }))} /></label>
              <label>Recupero giorno successivo (1-5)<input type="number" min="1" max="5" value={evaluationModal.nextDayRecovery} onChange={(e) => setEvaluationModal((prev) => ({ ...prev, nextDayRecovery: Number(e.target.value) }))} /></label>
              <label><input type="checkbox" checked={Boolean(evaluationModal.wasCompleted)} onChange={(e) => setEvaluationModal((prev) => ({ ...prev, wasCompleted: e.target.checked }))} /> Allenamento effettuato</label>
              <label>% svolgimento<input type="number" min="0" max="100" value={evaluationModal.completionPct} onChange={(e) => setEvaluationModal((prev) => ({ ...prev, completionPct: Number(e.target.value) }))} /></label>
              <label>Note<textarea value={evaluationModal.notes} onChange={(e) => setEvaluationModal((prev) => ({ ...prev, notes: e.target.value }))} /></label>
              <button type="button" onClick={async () => { await submitMethodEvaluation(evaluationModal); setEvaluationModal(null); }}>Salva valutazione</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
