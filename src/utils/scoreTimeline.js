// src/utils/scoreTimeline.js
//
// Construye la línea de tiempo de reproducción a partir del MISMO cursor de
// OpenSheetMusicDisplay que se ve en pantalla. Así cada paso del audio
// corresponde exactamente a una posición del cursor (acordes, silencios,
// ligaduras, repeticiones y cambios de tempo incluidos).
//
// Todos los tiempos están en segundos "de partitura" (velocidad 100 %).
// El reproductor aplica luego la velocidad elegida por el usuario.

const DEFAULT_BPM = 120;
const GRACE_NOTE_WHOLES = 1 / 32;
const MAX_STEPS = 20000;

/**
 * Recorre la partitura con el cursor de OSMD y devuelve los pasos crudos:
 * [{ wholes, rel, bpm, measureIndex, notes: [{ midi, wholes }] }]
 * "wholes" está en redondas (1 = redonda, 0.25 = negra).
 * Las notas se devuelven en sonido real: se aplica la transposición del
 * instrumento (p. ej. clarinete en Si♭ suena una 2ª mayor más grave).
 */
export function collectCursorSteps(osmd) {
  const cursor = osmd?.cursor;
  if (!cursor) return [];

  const defaultBpm =
    osmd.Sheet?.userStartTempoInBPM ||
    osmd.Sheet?.DefaultStartTempoInBpm ||
    DEFAULT_BPM;

  const steps = [];
  cursor.reset();
  let guard = 0;

  while (!cursor.Iterator.EndReached && guard++ < MAX_STEPS) {
    const it = cursor.Iterator;
    const notes = [];

    for (const voiceEntry of cursor.VoicesUnderCursor()) {
      for (const note of voiceEntry.Notes) {
        if (note.isRest() || !note.Pitch) continue;
        // Notas que continúan una ligadura: ya suenan desde la nota inicial
        if (note.NoteTie && note.NoteTie.StartNote !== note) continue;

        const wholes = note.IsGraceNote
          ? GRACE_NOTE_WHOLES
          : note.NoteTie
            ? note.NoteTie.Duration.RealValue
            : note.Length.RealValue;

        const transpose = note.ParentStaffEntry?.ParentStaff?.ParentInstrument?.PlaybackTranspose || 0;
        notes.push({ midi: note.Pitch.getHalfTone() + 12 + transpose, wholes });
      }
    }

    steps.push({
      wholes: it.CurrentEnrolledTimestamp.RealValue,
      rel: it.CurrentRelativeInMeasureTimestamp?.RealValue ?? 0,
      bpm: it.CurrentBpm > 0 ? it.CurrentBpm : defaultBpm,
      measureIndex: it.CurrentMeasureIndex ?? 0,
      notes,
    });

    // Avanza igual que cursor.next() pero sin redibujar en cada paso
    it.moveToNextVisibleVoiceEntry(false);
  }

  cursor.reset();
  return steps;
}

/** Información de cada compás de la partitura (número impreso y compás). */
export function collectMeasureMeta(osmd) {
  const measures = osmd?.Sheet?.SourceMeasures || [];
  return measures.map((m, i) => {
    const ts = m.ActiveTimeSignature;
    return {
      number: m.MeasureNumber ?? i + 1,
      beats: ts?.Numerator || 4,
      beatUnit: ts?.Denominator || 4,
      lengthWholes: m.Duration?.RealValue || (ts ? ts.Numerator / ts.Denominator : 1),
    };
  });
}

function secondsPerWhole(bpm) {
  return (4 * 60) / (bpm > 0 ? bpm : DEFAULT_BPM);
}

/**
 * Convierte los pasos crudos en segundos.
 * Devuelve:
 *  - steps:    [{ time, measureIndex, notes: [{ midi, duration }] }]
 *  - times:    tiempos de cada paso (para búsqueda binaria)
 *  - duration: duración total
 *  - measures: ocurrencias de compás en orden de reproducción (con repeticiones)
 *              [{ index, number, startTime, endTime, firstStep, beats, beatUnit, bpm }]
 *  - beats:    pulsos del metrónomo [{ time, downbeat }]
 */
export function buildTimeline(rawSteps, measureMeta = []) {
  const steps = [];
  let time = 0;
  let end = 0;

  rawSteps.forEach((step, i) => {
    if (i > 0) {
      const prev = rawSteps[i - 1];
      const deltaWholes = Math.max(0, step.wholes - prev.wholes);
      time += deltaWholes * secondsPerWhole(prev.bpm);
    }
    const spw = secondsPerWhole(step.bpm);
    const notes = step.notes.map(n => ({
      midi: n.midi,
      duration: Math.max(0.05, n.wholes * spw),
    }));
    notes.forEach(n => { end = Math.max(end, time + n.duration); });
    end = Math.max(end, time);
    steps.push({ time, notes, measureIndex: step.measureIndex ?? 0 });
  });

  // Ocurrencias de compás (una por cada vez que suena, repeticiones incluidas)
  const measures = [];
  rawSteps.forEach((step, i) => {
    const mi = step.measureIndex ?? 0;
    const before = rawSteps[i - 1];
    // Mismo compás y avanzando dentro de él → no es una nueva ocurrencia
    // (si el tiempo relativo vuelve atrás, es una repetición del mismo compás)
    if (before && before.measureIndex === mi && (step.rel || 0) > (before.rel || 0)) return;
    const meta = measureMeta[mi] || {};
    const start = Math.max(0, steps[i].time - (step.rel || 0) * secondsPerWhole(step.bpm));
    measures.push({
      index: mi,
      number: meta.number ?? mi + 1,
      startTime: start,
      endTime: null,
      firstStep: i,
      beats: meta.beats || 4,
      beatUnit: meta.beatUnit || 4,
      lengthWholes: meta.lengthWholes || 1,
      bpm: step.bpm,
    });
  });
  measures.forEach((m, i) => {
    const next = measures[i + 1];
    const natural = m.startTime + m.lengthWholes * secondsPerWhole(m.bpm);
    m.endTime = next ? next.startTime : Math.max(end, natural);
  });
  const duration = measures.length ? Math.max(end, measures[measures.length - 1].endTime) : end;

  // Pulsos de metrónomo
  const beats = [];
  measures.forEach(m => {
    const beatSec = (1 / m.beatUnit) * secondsPerWhole(m.bpm);
    for (let b = 0; b < m.beats; b++) {
      const t = m.startTime + b * beatSec;
      if (t >= m.endTime - 1e-6) break;
      beats.push({ time: t, downbeat: b === 0 });
    }
  });

  return { steps, times: steps.map(s => s.time), duration, measures, beats };
}

/** Índice del último elemento cuyo tiempo es <= t (búsqueda binaria). */
export function findStepIndex(times, t) {
  if (!times.length || t < times[0]) return 0;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Ocurrencia de compás que suena en el instante t. */
export function findMeasureAt(measures, t) {
  if (!measures?.length) return null;
  const idx = findStepIndex(measures.map(m => m.startTime), t);
  return { ...measures[idx], occurrence: idx };
}

/** Formatea segundos como m:ss */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
