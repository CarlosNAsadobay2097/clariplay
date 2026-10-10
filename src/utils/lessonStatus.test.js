import { describe, it, expect } from 'vitest';
import { computeLessonStatus, summarizeProgress, relativeDue } from './lessonStatus';

const now = new Date('2026-10-10T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const lesson = (dueOffsetDays) => ({ id: 'L1', dueDate: dueOffsetDays == null ? null : new Date(now.getTime() + dueOffsetDays * day) });

describe('computeLessonStatus', () => {
  it('pendiente sin envíos y con plazo vigente', () => {
    const s = computeLessonStatus({ lesson: lesson(3), recordings: [], now });
    expect(s.status).toBe('pending');
    expect(s.canSubmit).toBe(true);
    expect(s.dueSoon).toBe(false);
  });

  it('marca "vence pronto" con menos de 48 h', () => {
    expect(computeLessonStatus({ lesson: lesson(1), now }).dueSoon).toBe(true);
  });

  it('sin fecha límite nunca vence', () => {
    expect(computeLessonStatus({ lesson: lesson(null), now }).canSubmit).toBe(true);
  });

  it('enviada y esperando nota → no puede reenviar', () => {
    const s = computeLessonStatus({ lesson: lesson(3), recordings: [{ attempt: 1 }], now });
    expect(s.status).toBe('submitted');
    expect(s.canSubmit).toBe(false);
    expect(s.reason).toMatch(/esperando/);
  });

  it('calificada muestra la nota del último intento', () => {
    const s = computeLessonStatus({ lesson: lesson(3), recordings: [{ attempt: 1, score: 9 }], now });
    expect(s.status).toBe('graded');
    expect(s.score).toBe(9);
  });

  it('vencida sin envío', () => {
    const s = computeLessonStatus({ lesson: lesson(-1), now });
    expect(s.status).toBe('overdue');
    expect(s.canSubmit).toBe(false);
    expect(s.reason).toMatch(/plazo terminó/);
  });

  it('el profesor amplía el plazo a un estudiante', () => {
    const access = { dueDate: new Date(now.getTime() + 2 * day) };
    const s = computeLessonStatus({ lesson: lesson(-1), access, now });
    expect(s.status).toBe('pending');
    expect(s.canSubmit).toBe(true);
    expect(s.extended).toBe(true);
  });

  it('el profesor reabre la lección (intento extra)', () => {
    const access = { extraAttempts: 1 };
    const s = computeLessonStatus({ lesson: lesson(3), access, recordings: [{ attempt: 1, score: 5 }], now });
    expect(s.status).toBe('reopened');
    expect(s.canSubmit).toBe(true);
    expect(s.attemptNumber).toBe(2);
    expect(s.attemptsAllowed).toBe(2);
  });

  it('reabierta pero ya vencida → no puede enviar', () => {
    const access = { extraAttempts: 1 };
    const s = computeLessonStatus({ lesson: lesson(-1), access, recordings: [{ attempt: 1, score: 5 }], now });
    expect(s.canSubmit).toBe(false);
    expect(s.status).toBe('graded');
  });

  it('usa el último intento para la nota', () => {
    const recs = [{ attempt: 2, score: 9 }, { attempt: 1, score: 5 }];
    const s = computeLessonStatus({ lesson: lesson(3), access: { extraAttempts: 1 }, recordings: recs, now });
    expect(s.score).toBe(9);
  });
});

describe('summarizeProgress', () => {
  it('cuenta entregadas, pendientes y promedio', () => {
    const r = summarizeProgress([
      { status: 'graded', score: 8 }, { status: 'graded', score: 10 },
      { status: 'submitted', score: null }, { status: 'pending', score: null },
    ]);
    expect(r).toMatchObject({ total: 4, done: 3, pending: 1, percent: 75, average: 9 });
  });
});

describe('relativeDue', () => {
  it('textos relativos', () => {
    expect(relativeDue(new Date(now.getTime() + 3 * day), now)).toBe('Vence en 3 días');
    expect(relativeDue(new Date(now.getTime() - day), now)).toBe('Venció ayer');
  });
});
