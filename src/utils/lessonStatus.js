// src/utils/lessonStatus.js
//
// Estado de una lección práctica para un estudiante, a partir de:
//  - lesson.dueDate           fecha límite general (opcional)
//  - access (lessonAccess)    excepción del profesor para ESTE estudiante:
//                               dueDate       → nueva fecha límite
//                               extraAttempts → intentos adicionales (reabrir)
//  - recordings               envíos del estudiante para la lección
//
// Es una función pura (sin Firebase) para poder probarla y reutilizarla
// tanto en la vista del estudiante como en la del profesor.

export const STATUS_META = {
  pending:   { label: 'Pendiente',   tone: 'neutral', icon: 'fa-circle-dot' },
  reopened:  { label: 'Reabierta',   tone: 'info',    icon: 'fa-rotate-right' },
  submitted: { label: 'Enviada',     tone: 'warn',    icon: 'fa-hourglass-half' },
  graded:    { label: 'Calificada',  tone: 'ok',      icon: 'fa-circle-check' },
  overdue:   { label: 'Vencida',     tone: 'danger',  icon: 'fa-circle-xmark' },
};

const DUE_SOON_MS = 48 * 60 * 60 * 1000;

export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hasScore(rec) {
  return rec && rec.score !== undefined && rec.score !== null && rec.score !== '' && rec.score !== '—';
}

export function sortRecordings(recordings = []) {
  return [...recordings].sort((a, b) => {
    const aa = a.attempt ?? 1;
    const bb = b.attempt ?? 1;
    if (aa !== bb) return aa - bb;
    return (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0);
  });
}

export function formatDue(date) {
  if (!date) return '';
  return date.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Texto corto relativo: "Vence en 2 días", "Vence hoy", "Venció hace 3 días" */
export function relativeDue(due, now = new Date()) {
  if (!due) return '';
  const diff = due.getTime() - now.getTime();
  const days = Math.round(Math.abs(diff) / (24 * 60 * 60 * 1000));
  const hours = Math.round(Math.abs(diff) / (60 * 60 * 1000));
  if (diff >= 0) {
    if (hours < 1) return 'Vence en menos de 1 hora';
    if (hours < 24) return `Vence en ${hours} h`;
    return days === 1 ? 'Vence mañana' : `Vence en ${days} días`;
  }
  if (hours < 24) return `Venció hace ${Math.max(1, hours)} h`;
  return days === 1 ? 'Venció ayer' : `Venció hace ${days} días`;
}

export function computeLessonStatus({ lesson, access, recordings = [], now = new Date() }) {
  const baseDue = toDate(lesson?.dueDate);
  const extendedDue = toDate(access?.dueDate);
  const due = extendedDue || baseDue;

  const sorted = sortRecordings(recordings);
  const attemptsUsed = sorted.length;
  const attemptsAllowed = 1 + Math.max(0, Number(access?.extraAttempts) || 0);
  const latest = sorted[attemptsUsed - 1] || null;
  const graded = hasScore(latest);
  const overdue = !!due && now.getTime() > due.getTime();
  const attemptsLeft = Math.max(0, attemptsAllowed - attemptsUsed);
  const canSubmit = attemptsLeft > 0 && !overdue;

  let status;
  if (canSubmit) status = attemptsUsed > 0 ? 'reopened' : 'pending';
  else if (attemptsUsed === 0) status = 'overdue';
  else status = graded ? 'graded' : 'submitted';

  let reason = '';
  if (!canSubmit) {
    if (attemptsLeft === 0) {
      reason = graded
        ? 'Esta lección ya fue calificada. Si necesitas repetirla, pídele a tu profesor que la reabra.'
        : 'Ya enviaste esta lección y está esperando calificación.';
    } else {
      reason = `El plazo terminó el ${formatDue(due)}. Tu profesor puede ampliarlo.`;
    }
  }

  return {
    status,
    ...STATUS_META[status],
    canSubmit,
    reason,
    due,
    dueSoon: canSubmit && !!due && due.getTime() - now.getTime() < DUE_SOON_MS,
    extended: !!extendedDue,
    attemptsUsed,
    attemptsAllowed,
    attemptNumber: attemptsUsed + 1,
    latest,
    score: graded ? latest.score : null,
    feedback: latest?.feedback || '',
  };
}

/** Resumen de progreso de un curso a partir de los estados de sus lecciones. */
export function summarizeProgress(statuses) {
  const total = statuses.length;
  const count = (s) => statuses.filter(x => x.status === s).length;
  const graded = count('graded');
  const submitted = count('submitted');
  const done = graded + submitted;
  const validScores = statuses.filter(s => s.score !== null).map(s => Number(s.score)).filter(n => !Number.isNaN(n));
  return {
    total,
    done,
    graded,
    submitted,
    pending: count('pending') + count('reopened'),
    overdue: count('overdue'),
    percent: total ? Math.round((done / total) * 100) : 0,
    average: validScores.length ? (validScores.reduce((a, b) => a + b, 0) / validScores.length) : null,
  };
}

/** Id del documento de excepciones (lessonAccess) para un estudiante. */
export const accessDocId = (lessonId, studentId) => `${lessonId}_${studentId}`;

/** Id determinista de cada envío: permite validar el nº de intento en las reglas. */
export const recordingDocId = (lessonId, studentId, attempt) => `${lessonId}_${studentId}_${attempt}`;
