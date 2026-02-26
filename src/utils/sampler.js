import * as Tone from "tone";

export let isSamplerLoaded = false;

export const sampler = new Tone.Sampler({
  urls: {
    A3: "A3.mp3",
    "A#3": "As3.mp3",
    B3: "B3.mp3",
    C4: "C4.mp3",
    "C#4": "Cs4.mp3",
    D4: "D4.mp3",
    "D#4": "Ds4.mp3",
    E4: "E4.mp3",
    F4: "F4.mp3",
    "F#4": "Fs4.mp3",
    G4: "G4.mp3",
    "G#4": "Gs4.mp3",
    A4: "A4.mp3",
    "A#4": "As4.mp3",
    B4: "B4.mp3",
    C5: "C5.mp3",
    "C#5": "Cs5.mp3",
    D5: "D5.mp3",
    "D#5": "Ds5.mp3",
    E5: "E5.mp3",
    F5: "F5.mp3",
    "F#5": "Fs5.mp3",
    G5: "G5.mp3",
    "G#5": "Gs5.mp3",
    A5: "A5.mp3",
    "A#5": "As5.mp3",
    B5: "B5.mp3",
    C6: "C6.mp3",
    "C#6": "Cs6.mp3",
    D6: "D6.mp3",
    "D#6": "Ds6.mp3",
    E6: "E6.mp3",
  },
  baseUrl: "/audio/samples/piano/",
  release: 1,
  onload: () => {
    isSamplerLoaded = true;
    console.log("Sampler cargado");
  },
}).toDestination();
