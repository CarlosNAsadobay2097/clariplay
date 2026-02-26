import React, { useEffect, useRef, useState, useCallback } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import * as Tone from "tone";

export default function ScoreEditor({ xmlContent, onDataChange }) {
  const containerRef = useRef(null);
  const osmdRef = useRef(null);
  const [noteEvents, setNoteEvents] = useState([]);

  // Refs para Audio
  const audioContextRef = useRef(null);
  const playerRef = useRef(null);

  // 1. MEMORIZAR EXTRACTNOTES: Evita el warning de dependencias y optimiza rendimiento
  const extractNotes = useCallback(() => {
    if (!osmdRef.current) return;

    const notes = [];
    const measures = osmdRef.current.sheet?.measures || [];
    
    // Limitamos a 1000 compases por seguridad (evita bloqueos por archivos corruptos)
    for (let i = 0; i < Math.min(measures.length, 1000); i++) {
      const measure = measures[i];
      for (const voice of measure.voices) {
        for (const tickables of voice.tickables) {
          if (!tickables.isRest) {
            notes.push({
              midi: (tickables.halfTone || 0) + 12, // Nota MIDI aproximada
              duration: 0.5,
            });
          }
        }
      }
    }
    setNoteEvents(notes);
    if (onDataChange) {
      onDataChange({ notes: notes, audioUrl: null });
    }
  }, [onDataChange]);

  // 2. LIMPIEZA DE AUDIO: Al cerrar el componente liberamos recursos de hardware
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Inicializar AudioContext y WebAudioFont Player
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!playerRef.current && window.WebAudioFontPlayer) {
      playerRef.current = new window.WebAudioFontPlayer();
      playerRef.current.loader.decodeAfterLoading(audioContextRef.current);
    }
  }, []);

  // 3. CARGA Y RENDERIZADO: Con limpieza de DOM y seguridad XML
  useEffect(() => {
    // Protección básica contra inyección de entidades XML (Seguridad)
    if (!xmlContent || xmlContent.includes("<!ENTITY") || !containerRef.current) return;

    // Guardamos la referencia del contenedor en una variable local para el cleanup (Evita el warning de ESLint)
    const currentContainer = containerRef.current;

    if (!osmdRef.current) {
      osmdRef.current = new OpenSheetMusicDisplay(currentContainer);
    }

    const loadAndRender = async () => {
      try {
        await osmdRef.current.load(xmlContent);
        osmdRef.current.render();
        extractNotes();
      } catch (error) {
        console.error("Error cargando o renderizando la partitura:", error);
      }
    };

    loadAndRender();

    // Función de limpieza para React 19: Evita duplicados en el DOM al remontar
    return () => {
      if (currentContainer) {
        currentContainer.innerHTML = "";
      }
    };
  }, [xmlContent, extractNotes]);

  // 4. REPRODUCCIÓN: Adaptada a políticas de navegadores modernos
  const play = async () => {
    if (!playerRef.current || !audioContextRef.current) return;

    // Los navegadores requieren reanudar el contexto tras una acción del usuario
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    await Tone.start();
    const ctx = audioContextRef.current;
    let time = ctx.currentTime;

    for (const note of noteEvents) {
      // Validamos que el archivo de piano esté cargado en el objeto window
      if (window._tone_0000_AcousticGrandPiano_sf2_file) {
        playerRef.current.queueWaveTable(
          ctx,
          ctx.destination,
          window._tone_0000_AcousticGrandPiano_sf2_file,
          time,
          note.midi,
          note.duration
        );
        time += note.duration;
      }
    }
  };

  return (
    <div style={{ background: "#FFF1E6", padding: "1rem", borderRadius: "8px" }}>
      <h2 style={{ color: "#333" }}>Editor de Partitura (Versión Segura)</h2>

      {/* Contenedor para renderizado de OSMD */}
      <div
        ref={containerRef}
        style={{
          border: "1px solid #ccc",
          padding: "1rem",
          borderRadius: "6px",
          overflowX: "auto",
          backgroundColor: "white",
          minHeight: "300px",
        }}
      />

      <button
        onClick={play}
        disabled={noteEvents.length === 0}
        style={{
          marginTop: "1rem",
          backgroundColor: noteEvents.length === 0 ? "#ccc" : "#E51B23",
          color: "white",
          padding: "0.6rem 1.2rem",
          border: "none",
          borderRadius: "4px",
          cursor: noteEvents.length === 0 ? "not-allowed" : "pointer",
          fontWeight: "bold"
        }}
      >
        ▶ Reproducir Partitura
      </button>
    </div>
  );
}