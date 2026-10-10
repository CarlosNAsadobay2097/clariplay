import { describe, it, expect } from 'vitest';
import { buildTimeline, findStepIndex, findMeasureAt, formatTime } from './scoreTimeline';

// 120 bpm: negra = 0.5 s, redonda = 2 s
const meta = [
  { number: 1, beats: 4, beatUnit: 4, lengthWholes: 1 },
  { number: 2, beats: 4, beatUnit: 4, lengthWholes: 1 },
];

describe('buildTimeline', () => {
  it('convierte redondas a segundos según el tempo (acordes, silencios y cambio de tempo)', () => {
    const { steps, duration, measures, beats } = buildTimeline([
      { wholes: 0, rel: 0, bpm: 120, measureIndex: 0, notes: [{ midi: 60, wholes: 0.25 }] },
      { wholes: 0.25, rel: 0.25, bpm: 120, measureIndex: 0, notes: [{ midi: 64, wholes: 0.25 }, { midi: 67, wholes: 0.25 }] },
      { wholes: 0.5, rel: 0.5, bpm: 120, measureIndex: 0, notes: [] },
      { wholes: 1, rel: 0, bpm: 60, measureIndex: 1, notes: [{ midi: 72, wholes: 0.25 }] },
    ], meta);
    expect(steps.map(s => s.time)).toEqual([0, 0.5, 1, 2]);
    expect(steps[1].notes).toHaveLength(2);
    expect(steps[3].notes[0].duration).toBe(1); // negra a 60 bpm
    expect(measures.map(m => [m.number, m.startTime])).toEqual([[1, 0], [2, 2]]);
    expect(measures[1].endTime).toBe(6); // compás de 4/4 a 60 bpm = 4 s
    expect(duration).toBe(6);
    expect(beats.filter(b => b.downbeat).map(b => b.time)).toEqual([0, 2]);
    expect(beats).toHaveLength(8);
  });

  it('detecta la repetición de un mismo compás como dos ocurrencias', () => {
    const { measures } = buildTimeline([
      { wholes: 0, rel: 0, bpm: 120, measureIndex: 0, notes: [{ midi: 60, wholes: 1 }] },
      { wholes: 1, rel: 0, bpm: 120, measureIndex: 0, notes: [{ midi: 60, wholes: 1 }] },
    ], meta);
    expect(measures).toHaveLength(2);
    expect(measures[1].startTime).toBe(2);
  });
});

describe('findStepIndex', () => {
  const times = [0, 0.5, 1, 1.5];
  it('encuentra el paso que suena en cada instante', () => {
    expect(findStepIndex(times, -0.2)).toBe(0);
    expect(findStepIndex(times, 0)).toBe(0);
    expect(findStepIndex(times, 0.74)).toBe(1);
    expect(findStepIndex(times, 1)).toBe(2);
    expect(findStepIndex(times, 99)).toBe(3);
  });
  it('salta directo tras estar en segundo plano', () => {
    const many = Array.from({ length: 1000 }, (_, i) => i * 0.25);
    expect(findStepIndex(many, 10.1)).toBe(40);
  });
});

describe('utilidades', () => {
  it('findMeasureAt y formatTime', () => {
    const measures = [{ startTime: 0, number: 1 }, { startTime: 2, number: 2 }];
    expect(findMeasureAt(measures, 2.5)).toMatchObject({ number: 2, occurrence: 1 });
    expect(formatTime(75.4)).toBe('1:15');
  });
});
