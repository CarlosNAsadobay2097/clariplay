// src/hooks/useScorePlayback.js
//
// Reproduce una partitura de OSMD con Tone.js y mantiene el cursor visual
// SINCRONIZADO con el audio.
//
// Por qué antes se desincronizaba: el cursor avanzaba con Tone.Draw, que usa
// requestAnimationFrame. Cuando la pestaña queda en segundo plano el navegador
// pausa rAF y Tone.Draw DESCARTA los eventos atrasados, pero el audio (que
// corre en el hilo de audio) sigue sonando. Al volver, cursor y audio estaban
// en lugares distintos.
//
// Ahora el cursor no "cuenta pasos": en cada frame calcula su posición a
// partir del reloj real del AudioContext. Si la pestaña estuvo oculta, en el
// primer frame al volver salta directamente a donde va el audio.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';
import { loadSampler } from '../utils/sampler';
import { buildTimeline, collectCursorSteps, findStepIndex } from '../utils/scoreTimeline';

const START_DELAY = 0.15; // segundos de margen antes de la primera nota

export default function useScorePlayback(osmdRef, scoreVersion) {
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);

  const timelineRef = useRef(null);
  const startAtRef = useRef(0);
  const cursorIndexRef = useRef(-1);
  const rafRef = useRef(0);
  const playingRef = useRef(false);
  const lastCursorTopRef = useRef(null);

  // Si cambia la partitura, la línea de tiempo se recalcula
  useEffect(() => {
    timelineRef.current = null;
  }, [scoreVersion]);

  const followCursor = useCallback((cursor) => {
    const el = cursor?.cursorElement;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const top = el.offsetTop;
    if (top !== lastCursorTopRef.current) {
      lastCursorTopRef.current = top;
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
    // Avanza todos los pasos pendientes y redibuja una sola vez
    const it = cursor.Iterator;
    while (cursorIndexRef.current < index && !it.EndReached) {
      it.moveToNextVisibleVoiceEntry(false);
      cursorIndexRef.current++;
    }
    cursor.update();
    followCursor(cursor);
  }, [osmdRef, followCursor]);

  const syncCursorToAudio = useCallback(() => {
    const timeline = timelineRef.current;
    if (!playingRef.current || !timeline) return;
    const ctx = Tone.getContext().rawContext;
    const audibleNow = ctx.currentTime - (ctx.outputLatency || 0);
    const elapsed = audibleNow - startAtRef.current;
    moveCursorTo(findStepIndex(timeline.times, elapsed));
  }, [moveCursorTo]);

  const loop = useCallback(() => {
    if (!playingRef.current) return;
    syncCursorToAudio();
    rafRef.current = requestAnimationFrame(loop);
  }, [syncCursorToAudio]);

  const stop = useCallback(() => {
    playingRef.current = false;
    cancelAnimationFrame(rafRef.current);
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    const cursor = osmdRef.current?.cursor;
    if (cursor) {
      cursor.reset();
      cursor.hide();
    }
    cursorIndexRef.current = -1;
    lastCursorTopRef.current = null;
    setPlaying(false);
  }, [osmdRef]);

  const play = useCallback(async () => {
    const osmd = osmdRef.current;
    if (!osmd || playingRef.current) return;
    setError(null);
    setPreparing(true);

    try {
      await Tone.start(); // requiere el clic del usuario
      const sampler = await loadSampler();

      if (!timelineRef.current) {
        timelineRef.current = buildTimeline(collectCursorSteps(osmd));
      }
      const { steps, duration } = timelineRef.current;
      if (!steps.length || duration <= 0) {
        setError('La partitura no tiene notas para reproducir.');
        return;
      }

      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel(0);
      transport.position = 0;

      steps.forEach(step => {
        if (!step.notes.length) return;
        transport.schedule((time) => {
          step.notes.forEach(n => {
            sampler.triggerAttackRelease(Tone.Frequency(n.midi, 'midi').toNote(), n.duration, time);
          });
        }, step.time);
      });

      // El final también lo marca el reloj de audio (no un setTimeout, que el
      // navegador ralentiza en pestañas ocultas)
      transport.scheduleOnce(() => {
        setTimeout(stop, 0);
      }, duration + 0.3);

      const startAt = Tone.now() + START_DELAY;
      startAtRef.current = startAt;
      transport.start(startAt);

      playingRef.current = true;
      cursorIndexRef.current = -1;
      moveCursorTo(0);
      setPlaying(true);
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error('Error al reproducir la partitura:', err);
      setError('No se pudo reproducir la partitura.');
      stop();
    } finally {
      setPreparing(false);
    }
  }, [osmdRef, loop, moveCursorTo, stop]);

  // Al volver a la pestaña, resincroniza de inmediato
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncCursorToAudio();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [syncCursorToAudio]);

  // Al desmontar, detener todo
  useEffect(() => () => {
    if (playingRef.current) stop();
  }, [stop]);

  // Si cambia la partitura mientras suena, detener
  useEffect(() => {
    if (playingRef.current) stop();
  }, [scoreVersion, stop]);

  return { playing, preparing, error, play, stop };
}
