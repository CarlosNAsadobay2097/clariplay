import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { collection, query, where, getDocs } from "firebase/firestore";
import * as Tone from "tone";
import { db } from "../firebase";
import { parseMusicXMLToNotes } from "../utils/parseMusicXMLToNotes";
import "../css/main.css";

export default function ScoreViewer({ xmlUrl, onAudioUploaded, lessonId, courseId, userId }) {
  const containerRef = useRef(null);
  const osmdRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationIdRef = useRef(null);
  const audioBlobRef = useRef(null);
  const samplerRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [playing, setPlaying] = useState(false);

  // 🛡️ ESCUDO 1: Limpieza básica al cerrar (Evita que el micro se quede encendido)
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      // Detener cualquier sonido que se haya quedado pegado
      Tone.Transport.stop();
      Tone.Transport.cancel();
    };
  }, []);

  useEffect(() => {
    if (!userId || !lessonId) return;
    const checkExisting = async () => {
      try {
        const q = query(
          collection(db, "audioRecordings"),
          where("studentId", "==", userId),
          where("lessonId", "==", lessonId)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) setSent(true);
      } catch (err) {
        console.error("Error verificando grabación:", err);
      }
    };
    checkExisting();
  }, [userId, lessonId]);

  useEffect(() => {
    if (!xmlUrl) return;
    setLoading(true);
    setError(null);

    const osmd = osmdRef.current ?? new OpenSheetMusicDisplay(containerRef.current, {
      drawingParameters: "compacttight",
      autoResize: true,
      drawTitle: true,
    });
    osmdRef.current = osmd;

    fetch(xmlUrl)
      .then(res => res.text())
      .then(xml => {
        // 🛡️ ESCUDO 2: Protección contra XML malicioso
        if (xml.includes("<!ENTITY")) throw new Error("Archivo XML no seguro.");
        return osmd.load(xml);
      })
      .then(() => { osmd.render() })
      .then(() => setLoading(false))
      .catch(err => {
        console.error("❌ Error:", err);
        setError(err.message || "Error al cargar la partitura");
        setLoading(false);
      });

    if (!samplerRef.current) {
      samplerRef.current = new Tone.Sampler({
        urls: {
          A3: "A3.mp3", "A#3": "As3.mp3", B3: "B3.mp3", C4: "C4.mp3", "C#4": "Cs4.mp3",
          D4: "D4.mp3", "D#4": "Ds4.mp3", E4: "E4.mp3", F4: "F4.mp3", "F#4": "Fs4.mp3",
          G4: "G4.mp3", "G#4": "Gs4.mp3", A4: "A4.mp3", "A#4": "As4.mp3", B4: "B4.mp3",
          C5: "C5.mp3", "C#5": "Cs5.mp3", D5: "D5.mp3", "D#5": "Ds5.mp3", E5: "E5.mp3",
          F5: "F5.mp3", "F#5": "Fs5.mp3", G5: "G5.mp3", "G#5": "Gs5.mp3", A5: "A5.mp3",
          "A#5": "As5.mp3", B5: "B5.mp3", C6: "C6.mp3", "C#6": "Cs6.mp3", D6: "D6.mp3",
          "D#6": "Ds6.mp3", E6: "E6.mp3"
        },
        baseUrl: "/audio/samples/piano/",
        release: 1,
        onload: () => console.log("🎹 Sampler cargado"),
      }).toDestination();
    }
  }, [xmlUrl]);

  // (El resto de tus funciones de dibujo y grabación se quedan IGUAL...)
  useEffect(() => {
    if (!recording || !canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);
      ctx.fillStyle = "#FFF1E6";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#E51B23";
      ctx.beginPath();
      const sliceWidth = canvas.width / dataArray.length;
      let x = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(animationIdRef.current);
  }, [recording]);

  const startRecording = async () => {
    setError(null);
    setAudioUrl(null);
    audioBlobRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      const audioChunks = [];
      mediaRecorderRef.current.ondataavailable = (event) => audioChunks.push(event.data);
      mediaRecorderRef.current.onstop = () => {
        cancelAnimationFrame(animationIdRef.current);
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        audioBlobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        // Cerramos el stream de audio para apagar el micro físicamente
        stream.getTracks().forEach(track => track.stop());
      };
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) { setError("No se pudo acceder al micrófono"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleUploadClick = async () => {
    if (!audioBlobRef.current) return;
    if (!window.confirm("¿Deseas enviar la grabación?")) return;
    try {
      await onAudioUploaded(audioBlobRef.current);
      setSent(true);
      setAudioUrl(null);
    } catch (err) { alert("Error al subir: " + err.message); }
  };

  const handlePlayScore = async () => {
    // 🛡️ ESCUDO 3: Validación de carga antes de tocar
    if (!samplerRef.current?.loaded || !osmdRef.current) {
      alert("El piano aún se está cargando, intenta en un segundo.");
      return;
    }

    setPlaying(true);
    try {
      const xmlString = await (await fetch(xmlUrl)).text();
      const { notes, tempo } = parseMusicXMLToNotes(xmlString);
      if (!notes || notes.length === 0) {
        setPlaying(false);
        return;
      }

      await Tone.start();
      await Tone.loaded(); // Espera técnica a los archivos mp3

      const osmd = osmdRef.current;
      const bpm = tempo || 120;
      const delayBeforeStart = 0.2;

      Tone.Transport.cancel();
      Tone.Transport.stop();
      Tone.Transport.bpm.value = bpm;
      osmd.cursor.reset();
      osmd.cursor.hide();

      let cursorMoved = false;
      const part = new Tone.Part((time, noteObj) => {
        const note = noteObj.note.replaceAll("#", "s");
        const durSeconds = noteObj.duration * (60 / bpm);
        samplerRef.current.triggerAttackRelease(note, durSeconds, time);

        Tone.Draw.schedule(() => {
          if (!cursorMoved) {
            osmd.cursor.show();
            cursorMoved = true;
          } else if (!osmd.cursor.iterator.EndReached) {
            osmd.cursor.next();
          }
        }, time);
      }, notes.map(n => ({ ...n, time: n.time + delayBeforeStart })));

      part.start(0);
      Tone.Transport.start("+0.1");

      const totalDuration = notes[notes.length - 1].time + notes[notes.length - 1].duration + delayBeforeStart;
      setTimeout(() => {
        Tone.Transport.stop();
        part.dispose();
        osmd.cursor.reset();
        osmd.cursor.hide();
        setPlaying(false);
      }, (totalDuration + 0.5) * 1000);
    } catch (err) {
      setPlaying(false);
    }
  };

  return (
    <div className="score-viewer-container">
      <h3>🎼 Vista previa de la partitura</h3>
      
      {/* 1. Mensajes de estado: Carga y Errores */}
      {loading && <p className="loading-text">Cargando partitura...</p>}
      {error && <p style={{ color: "#E51B23", fontWeight: "bold" }}>❌ Error: {error}</p>}
      
      {/* 2. Contenedor de la partitura */}
      <div ref={containerRef} className="score-viewer-osmd" style={{ minHeight: "200px" }} />
      
      {/* 3. Controles de reproducción de audio (Piano) */}
      <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
        <button 
          onClick={handlePlayScore} 
          disabled={playing || loading}
          style={{ cursor: (playing || loading) ? "not-allowed" : "pointer" }}
        >
          {playing ? "🔁 Reproduciendo..." : "▶ Reproducir partitura"}
        </button>
      </div>

      {/* 4. Sección de Grabación y Envío */}
      <div className="recording-controls">
        {!sent && !recording && (
          <button onClick={startRecording}>🎙 Iniciar grabación</button>
        )}
        
        {!sent && recording && (
          <button onClick={stopRecording} style={{ backgroundColor: "#E51B23", color: "white" }}>
            ⏹ Detener
          </button>
        )}

        {recording && (
          <div style={{ marginTop: "10px" }}>
            <canvas ref={canvasRef} width={400} height={100} className="score-viewer-waveform" />
          </div>
        )}

        {sent && <p style={{ color: "green", fontWeight: "bold" }}>✅ Lección enviada con éxito</p>}

        {audioUrl && !sent && (
          <div style={{ marginTop: "1rem", borderTop: "1px solid #ccc", paddingTop: "1rem" }}>
            <p>🎧 Escucha tu intento:</p>
            <audio controls src={audioUrl} style={{ width: "100%" }} />
            <br />
            <button 
              onClick={handleUploadClick} 
              style={{ marginTop: "0.5rem", backgroundColor: "#28a745", color: "white" }}
            >
              📤 Enviar lección al profesor
            </button>
          </div>
        )}
      </div>
    </div>
  );
}