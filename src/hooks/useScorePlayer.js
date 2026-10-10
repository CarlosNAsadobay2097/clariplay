// src/hooks/useScorePlayer.js
//
// Reproductor de partituras (OSMD + Tone.js) al estilo MuseScore:
// play / pausa / stop, barra de progreso con saltos, velocidad, metrónomo,
// cuenta de entrada, repetición de un tramo (loop A-B), volumen e instrumento.
//
// Sincronía: el cursor visual NUNCA cuenta pasos por su cuenta. En cada frame
// se calcula su posición a partir del reloj real del Transport de Tone.js
// (que sigue corriendo aunque la pestaña esté en segundo plano). Si el
// navegador pausa la animación, al volver el cursor salta a donde va el audio.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { loadSampler } from '../utils/sampler';
import {
  buildTimeline,
  collectCursorSteps,
  collectMeasureMeta,
  findMeasureAt,
  findStepIndex,
} from '../utils/scoreTimeline';

const START_DELAY = 0.08;
const UI_UPDATE_MS = 100;
export const RATE_MIN = 0.25;
export const RATE_MAX = 2;

const DEFAULT_SETTINGS = {
  rate: 1,
  metronome: false,
  countIn: true,
  loop: { enabled: false, start: 0, end: 0 }, // índices de ocurrencia de compás
  volume: 0.8,
  instrument: 'piano',
  follow: true,
};

const secondsPerWhole = (bpm) => (4 * 60) / (bpm > 0 ? bpm : 120);

export default function useScorePlayer(osmdRef, scoreVersion) {
  const [status, setStatus] = useState('stopped'); // 'stopped' | 'playing' | 'paused'
  const [position, setPosition] = useState(0);
  const [timeline, setTimeline] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);
  const [countInBeat, setCountInBeat] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const timelineRef = useRef(null);
  const sessionRef = useRef(null);
  const statusRef = useRef('stopped');
  const positionRef = useRef(0);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const samplerRef = useRef(null);
  const clickRef = useRef(null);
  const rafRef = useRef(0);
  const cursorIndexRef = useRef(-1);
  const lastTopRef = useRef(null);
  const lastUiRef = useRef(0);

  const setStatusBoth = (s) => { statusRef.current = s; setStatus(s); };

  // ------------------------------------------------------------------ cursor
  const followCursor = useCallback((cursor) => {
    if (!settingsRef.current.follow) return;
    const el = cursor?.cursorElement;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const top = el.offsetTop;
    if (top !== lastTopRef.current) {
      lastTopRef.current = top;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, []);

  const moveCursorTo = useCallback((index) => {
    const cursor = osmdRef.current?.cursor;
    if (!cursor || index === cursorIndexRef.current) return;
    if (cursorIndexRef.current < 0 || index < cursorIndexRef.current) {
      cursor.reset();
      cursor.show();
      cursorIndexRef.current = 0;
    }
    const it = cursor.Iterator;
    while (cursorIndexRef.current < index && !it.EndReached) {
      it.moveToNextVisibleVoiceEntry(false);
      cursorIndexRef.current++;
    }
    cursor.update();
    followCursor(cursor);
  }, [osmdRef, followCursor]);

  const moveCursorToTime = useCallback((t) => {
    const tl = timelineRef.current;
    if (!tl) return;
    moveCursorTo(findStepIndex(tl.times, t));
  }, [moveCursorTo]);

  const hideCursor = useCallback(() => {
    const cursor = osmdRef.current?.cursor;
    if (cursor) { cursor.reset(); cursor.hide(); }
    cursorIndexRef.current = -1;
    lastTopRef.current = null;
  }, [osmdRef]);

  // --------------------------------------------------------------- timeline
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!scoreVersion || !osmd) return;
    try {
      const tl = buildTimeline(collectCursorSteps(osmd), collectMeasureMeta(osmd));
      timelineRef.current = tl;
      setTimeline(tl);
      const last = Math.max(0, tl.measures.length - 1);
      const s = { ...settingsRef.current, loop: { enabled: false, start: 0, end: last } };
      settingsRef.current = s;
      setSettings(s);
    } catch (err) {
      console.error('No se pudo preparar la reproducción:', err);
      setError('No se pudo preparar la reproducción de esta partitura.');
    }
  }, [osmdRef, scoreVersion]);

  const loopRegion = useCallback(() => {
    const tl = timelineRef.current;
    const { loop } = settingsRef.current;
    if (!tl || !loop.enabled || !tl.measures.length) return null;
    const a = Math.max(0, Math.min(loop.start, loop.end));
    const b = Math.min(tl.measures.length - 1, Math.max(loop.start, loop.end));
    return { ls: tl.measures[a].startTime, le: tl.measures[b].endTime };
  }, []);

  // ---------------------------------------------------------------- audio
  const click = useCallback((time, downbeat) => {
    clickRef.current?.triggerAttackRelease(downbeat ? 'C6' : 'G5', 0.03, time);
  }, []);

  const clearTransport = () => {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    transport.loop = false;
    samplerRef.current?.releaseAll?.();
  };

  const finish = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    clearTransport();
    sessionRef.current = null;
    positionRef.current = 0;
    setPosition(0);
    setCountInBeat(0);
    hideCursor();
    setStatusBoth('stopped');
  }, [hideCursor]);

  /** Programa todas las notas desde `from` (segundos de partitura) y arranca. */
  const startSession = useCallback((from, { withCountIn }) => {
    const tl = timelineRef.current;
    const sampler = samplerRef.current;
    if (!tl || !sampler) return;
    const s = settingsRef.current;
    const rate = s.rate;
    const transport = Tone.getTransport();
    clearTransport();
    transport.position = 0;

    const region = loopRegion();
    if (region && (from < region.ls - 1e-3 || from >= region.le - 1e-3)) from = region.ls;
    if (!region && from >= tl.duration - 1e-3) from = 0;

    // Cuenta de entrada (un compás de clics) solo al empezar desde el inicio del tramo
    let ci = 0;
    let countInBeatSec = 0;
    const atStart = !region || Math.abs(from - region.ls) < 1e-3;
    if (withCountIn && s.countIn && atStart) {
      const m = findMeasureAt(tl.measures, from);
      if (m) {
        countInBeatSec = ((1 / m.beatUnit) * secondsPerWhole(m.bpm)) / rate;
        for (let b = 0; b < m.beats; b++) {
          transport.schedule((time) => click(time, b === 0), b * countInBeatSec);
        }
        ci = m.beats * countInBeatSec;
      }
    }

    const base = region ? region.ls : from;
    const endT = region ? region.le : tl.duration;
    const toT = (t) => ci + (t - base) / rate;

    for (const step of tl.steps) {
      if (step.time < base - 1e-6 || step.time >= endT - 1e-6 || !step.notes.length) continue;
      const notes = step.notes.map(n => ({
        name: Tone.Frequency(n.midi, 'midi').toNote(),
        dur: n.duration / rate,
      }));
      transport.schedule((time) => {
        notes.forEach(n => sampler.triggerAttackRelease(n.name, n.dur, time));
      }, toT(step.time));
    }

    if (s.metronome) {
      for (const beat of tl.beats) {
        if (beat.time < base - 1e-6 || beat.time >= endT - 1e-6) continue;
        transport.schedule((time) => click(time, beat.downbeat), toT(beat.time));
      }
    }

    if (region) {
      transport.loop = true;
      transport.loopStart = ci;
      transport.loopEnd = toT(region.le);
    } else {
      // El final lo marca el reloj de audio (no un setTimeout, que el
      // navegador ralentiza en pestañas ocultas)
      transport.scheduleOnce(() => setTimeout(finish, 0), toT(endT) + 0.25);
    }

    sessionRef.current = { base, ci, rate, region, countInBeatSec };
    positionRef.current = from;
    transport.start(Tone.now() + START_DELAY, toT(from));
  }, [click, finish, loopRegion]);

  /** Posición de la partitura según el reloj de audio. */
  const currentScoreTime = useCallback(() => {
    const sess = sessionRef.current;
    if (!sess) return { pos: positionRef.current, beat: 0 };
    const transport = Tone.getTransport();
    const ctx = Tone.getContext().rawContext;
    let t = transport.getSecondsAtTime(ctx.currentTime - (ctx.outputLatency || 0));
    if (sess.region && t >= transport.loopEnd) {
      const span = transport.loopEnd - transport.loopStart;
      t = transport.loopStart + ((t - transport.loopStart) % span);
    }
    if (t < sess.ci) {
      const beat = sess.countInBeatSec > 0 ? Math.floor(Math.max(0, t) / sess.countInBeatSec) + 1 : 0;
      return { pos: sess.base, beat };
    }
    return { pos: sess.base + (t - sess.ci) * sess.rate, beat: 0 };
  }, []);

  const loop = useCallback(() => {
    if (statusRef.current !== 'playing') return;
    const { pos, beat } = currentScoreTime();
    positionRef.current = pos;
    moveCursorToTime(pos);
    const now = performance.now();
    if (now - lastUiRef.current > UI_UPDATE_MS) {
      lastUiRef.current = now;
      setPosition(pos);
      setCountInBeat(beat);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [currentScoreTime, moveCursorToTime]);

  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const ensureAudio = useCallback(async () => {
    await Tone.start(); // requiere un gesto del usuario
    samplerRef.current = await loadSampler(settingsRef.current.instrument);
    if (!clickRef.current) {
      clickRef.current = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.01 },
        volume: -4,
      }).toDestination();
    }
    applyVolume(settingsRef.current.volume);
  }, []);

  // --------------------------------------------------------------- acciones
  const play = useCallback(async () => {
    if (statusRef.current === 'playing' || !osmdRef.current) return;
    setError(null);
    setPreparing(true);
    try {
      await ensureAudio();
      const tl = timelineRef.current;
      if (!tl || !tl.steps.some(s => s.notes.length)) {
        setError('La partitura no tiene notas para reproducir.');
        return;
      }
      if (statusRef.current === 'paused' && sessionRef.current) {
        Tone.getTransport().start(Tone.now() + 0.03); // reanudar
      } else {
        startSession(positionRef.current, { withCountIn: true });
      }
      setStatusBoth('playing');
      startLoop();
    } catch (err) {
      console.error('Error al reproducir la partitura:', err);
      setError('No se pudo reproducir la partitura.');
      finish();
    } finally {
      setPreparing(false);
    }
  }, [osmdRef, ensureAudio, startSession, startLoop, finish]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'playing') return;
    const { pos } = currentScoreTime();
    Tone.getTransport().pause();
    samplerRef.current?.releaseAll?.();
    cancelAnimationFrame(rafRef.current);
    positionRef.current = pos;
    setPosition(pos);
    setCountInBeat(0);
    setStatusBoth('paused');
  }, [currentScoreTime]);

  const togglePlay = useCallback(() => {
    if (statusRef.current === 'playing') pause();
    else play();
  }, [play, pause]);

  const stop = useCallback(() => finish(), [finish]);

  const seek = useCallback((t) => {
    const tl = timelineRef.current;
    if (!tl) return;
    const target = Math.max(0, Math.min(t, Math.max(0, tl.duration - 0.01)));
    positionRef.current = target;
    setPosition(target);
    moveCursorToTime(target);
    if (statusRef.current === 'playing') {
      startSession(target, { withCountIn: false });
    } else {
      clearTransport();
      sessionRef.current = null;
      if (statusRef.current === 'stopped') setStatusBoth('paused');
    }
  }, [moveCursorToTime, startSession]);

  const seekToOccurrence = useCallback((occ) => {
    const tl = timelineRef.current;
    const m = tl?.measures[Math.max(0, Math.min(occ, (tl?.measures.length || 1) - 1))];
    if (m) seek(m.startTime);
  }, [seek]);

  /** Salta al compás de la partitura (índice de SourceMeasure) en el que se hizo clic. */
  const seekToSourceMeasure = useCallback((sourceIndex) => {
    const tl = timelineRef.current;
    if (!tl) return;
    const cur = findMeasureAt(tl.measures, positionRef.current)?.occurrence ?? 0;
    let occ = tl.measures.findIndex((m, i) => i >= cur && m.index === sourceIndex);
    if (occ < 0) occ = tl.measures.findIndex(m => m.index === sourceIndex);
    if (occ >= 0) seekToOccurrence(occ);
  }, [seekToOccurrence]);

  const stepMeasure = useCallback((delta) => {
    const tl = timelineRef.current;
    if (!tl) return;
    const cur = findMeasureAt(tl.measures, positionRef.current);
    if (!cur) return;
    // Si ya pasó un poco del inicio del compás, "anterior" vuelve a su inicio
    const intoMeasure = positionRef.current - cur.startTime > 0.3;
    const target = delta < 0 && intoMeasure ? cur.occurrence : cur.occurrence + delta;
    seekToOccurrence(target);
  }, [seekToOccurrence]);

  const updateSettings = useCallback(async (patch) => {
    const prev = settingsRef.current;
    const next = { ...prev, ...patch, loop: { ...prev.loop, ...(patch.loop || {}) } };
    settingsRef.current = next;
    setSettings(next);

    if ('volume' in patch) applyVolume(next.volume);

    const needsReschedule = ['rate', 'metronome', 'loop', 'instrument'].some(k => k in patch);
    if (!needsReschedule) return;

    if (statusRef.current === 'playing') {
      const { pos } = currentScoreTime();
      if ('instrument' in patch) {
        setPreparing(true);
        try { samplerRef.current = await loadSampler(next.instrument); } finally { setPreparing(false); }
      }
      if (statusRef.current === 'playing') startSession(pos, { withCountIn: false });
    } else if (statusRef.current === 'paused') {
      clearTransport();
      sessionRef.current = null;
    }
    if (next.loop.enabled && 'loop' in patch) {
      const region = loopRegion();
      if (region && (positionRef.current < region.ls || positionRef.current >= region.le) && statusRef.current !== 'playing') {
        positionRef.current = region.ls;
        setPosition(region.ls);
        if (statusRef.current !== 'stopped') moveCursorToTime(region.ls);
      }
    }
  }, [currentScoreTime, startSession, loopRegion, moveCursorToTime]);

  /** Tras redibujar la partitura (zoom / cambio de tamaño) vuelve a colocar el cursor. */
  const refreshCursor = useCallback(() => {
    cursorIndexRef.current = -1;
    lastTopRef.current = null;
    if (statusRef.current === 'stopped') hideCursor();
    else moveCursorToTime(positionRef.current);
  }, [hideCursor, moveCursorToTime]);

  // Al volver a la pestaña, resincroniza de inmediato
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && statusRef.current === 'playing') {
        const { pos } = currentScoreTime();
        positionRef.current = pos;
        moveCursorToTime(pos);
        setPosition(pos);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [currentScoreTime, moveCursorToTime]);

  // Cambio de partitura o desmontaje: detener todo
  useEffect(() => {
    if (statusRef.current !== 'stopped') finish();
  }, [scoreVersion, finish]);
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (statusRef.current !== 'stopped') clearTransport();
  }, []);

  const currentMeasure = timeline ? findMeasureAt(timeline.measures, position) : null;

  return {
    status,
    playing: status === 'playing',
    position,
    duration: timeline?.duration || 0,
    measures: timeline?.measures || [],
    currentMeasure,
    countInBeat,
    preparing,
    error,
    settings,
    ready: !!timeline,
    play,
    pause,
    togglePlay,
    stop,
    seek,
    seekToOccurrence,
    seekToSourceMeasure,
    stepMeasure,
    updateSettings,
    refreshCursor,
  };
}

function applyVolume(v) {
  const vol = Tone.getDestination().volume;
  vol.value = v <= 0.001 ? -Infinity : Tone.gainToDb(v);
}
