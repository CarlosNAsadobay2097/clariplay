import * as Tone from 'tone';
import { loadSampler } from './sampler';
import { parseMusicXMLToNotes } from './parseMusicXMLToNotes';

export async function playMusicXML(xmlString) {
  // Utilidad heredada (no se usa en la app). El reproductor actual vive en
  // src/hooks/useScorePlayback.js.
  const sampler = await loadSampler();

  const { notes, tempo } = parseMusicXMLToNotes(xmlString);

  if (!notes || notes.length === 0) {
    console.warn("⚠️ No se encontraron notas.");
    return;
  }

  console.log("🎼 Notas parseadas desde MusicXML:");
  notes.forEach(({ time, note, duration }, index) => {
    if (typeof time !== "number" || !duration) {
      console.warn(`⚠️ Nota ${index + 1} con datos inválidos`, { note, time, duration });
    } else {
      console.log(`🔔 Nota ${index + 1}: ${note}, duración: ${duration}, tiempo: ${time}`);
    }
  });

  await Tone.start();

  Tone.Transport.cancel();
  Tone.Transport.position = 0;
  Tone.Transport.bpm.value = tempo || 120;

  function normalizeNoteName(note) {
    const flatToSharp = {
      "Db": "C#",
      "Eb": "D#",
      "Gb": "F#",
      "Ab": "G#",
      "Bb": "A#",
    };

    const notePart = note.slice(0, -1);
    const octave = note.slice(-1);
    let normalized = flatToSharp[notePart] || notePart;
    return normalized + octave;
  }

  // Reproducimos las notas programando su activación con schedule
  notes.forEach(({ time, note, duration }) => {
    const playTime = time; // Tone.js ya lo interpreta en beats
    const cleanNoteName = normalizeNoteName(note);

    Tone.Transport.schedule((scheduledTime) => {
      sampler.triggerAttackRelease(cleanNoteName, duration, scheduledTime);
    }, playTime);
  });

  const lastNote = notes[notes.length - 1];
  const endTimeInBeats = lastNote.time + lastNote.duration;

  Tone.Transport.scheduleOnce(() => {
    Tone.Transport.stop();
    console.log("⏹️ Reproducción terminada");
  }, endTimeInBeats + 0.5);

  Tone.Transport.start();
}
