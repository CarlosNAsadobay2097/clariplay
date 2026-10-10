import * as Tone from "tone";

// Instrumentos del reproductor. Cada sampler se crea de forma perezosa (la
// primera vez que se necesita) para no crear el AudioContext antes de un
// gesto del usuario.

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const file = (note, octave) => `${note.replace("#", "s")}${octave}.mp3`;

function pianoUrls() {
  const urls = {};
  // C3 – B5 completos + C6 – E6 (archivos en public/audio/samples/piano)
  for (let octave = 3; octave <= 5; octave++) NOTES.forEach(n => { urls[`${n}${octave}`] = file(n, octave); });
  ["C", "C#", "D", "D#", "E"].forEach(n => { urls[`${n}6`] = file(n, 6); });
  return urls;
}

function clarinetUrls() {
  // Muestras de "tonejs-instruments" (licencia MIT, ver public/audio/samples/clarinet/CREDITS.txt)
  const list = ["D3", "F3", "A#3", "D4", "F4", "A#4", "D5", "F5", "A#5", "D6", "F#6"];
  return Object.fromEntries(list.map(n => [n, file(n.slice(0, -1), n.slice(-1))]));
}

export const INSTRUMENTS = {
  piano: { label: "Piano", baseUrl: "/audio/samples/piano/", urls: pianoUrls, release: 1 },
  clarinet: { label: "Clarinete", baseUrl: "/audio/samples/clarinet/", urls: clarinetUrls, release: 0.4 },
};

const cache = {};

/** Devuelve { sampler, ready } para el instrumento pedido. */
function create(name) {
  const def = INSTRUMENTS[name] || INSTRUMENTS.piano;
  let sampler;
  const ready = new Promise((resolve, reject) => {
    sampler = new Tone.Sampler({
      urls: def.urls(),
      baseUrl: def.baseUrl,
      release: def.release,
      onload: () => resolve(sampler),
      onerror: (err) => reject(err),
    }).toDestination();
  });
  return { sampler, ready };
}

export function getSampler(name = "piano") {
  if (!cache[name]) cache[name] = create(name);
  return cache[name].sampler;
}

/** Devuelve el sampler cuando todas sus muestras están cargadas. */
export async function loadSampler(name = "piano") {
  getSampler(name);
  return cache[name].ready;
}

export let isSamplerLoaded = false; // compatibilidad con código antiguo
