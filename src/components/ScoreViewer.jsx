import { useEffect, useRef, useState } from "react";
import { fetchSafeMusicXML } from "../utils/musicxmlSecurity";
import ScorePlayer from "./ScorePlayer";

/**
 * Vista del estudiante: partitura con reproductor + grabación y envío.
 *
 * `submission` lo calcula el padre (ver utils/lessonStatus.js):
 *   { canSubmit, reason, attemptNumber, attemptsAllowed }
 */
export default function ScoreViewer({ xmlUrl, onAudioUploaded, submission }) {
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationIdRef = useRef(null);
  const audioBlobRef = useRef(null);
  const streamRef = useRef(null);

  const [xml, setXml] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [justSent, setJustSent] = useState(false);

  const canSubmit = !!submission?.canSubmit && !justSent;

  // 🛡️ Limpieza al cerrar: micrófono, animación y contexto de audio
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  // Descarga validada y saneada de la partitura
  useEffect(() => {
    if (!xmlUrl) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setXml(null);
    fetchSafeMusicXML(xmlUrl, { signal: controller.signal })
      .then(clean => { if (!controller.signal.aborted) setXml(clean); })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error("❌ Error al cargar la partitura:", err);
        setError(err.message || "Error al cargar la partitura");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [xmlUrl]);

  // Onda del micrófono mientras se graba
  useEffect(() => {
    if (!recording || !canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    const draw = () => {
      animationIdRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#FF2D37";
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
      streamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream);
      const audioChunks = [];
      mediaRecorderRef.current.ondataavailable = (event) => audioChunks.push(event.data);
      mediaRecorderRef.current.onstop = () => {
        cancelAnimationFrame(animationIdRef.current);
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        audioBlobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close();
        }
      };
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      mediaRecorderRef.current.start();
      setRecording(true);
    } catch {
      setError("No se pudo acceder al micrófono");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleUploadClick = async () => {
    if (!audioBlobRef.current || uploading || !canSubmit) return;
    if (!window.confirm("¿Deseas enviar la grabación al profesor?")) return;
    setUploading(true);
    try {
      await onAudioUploaded(audioBlobRef.current);
      setJustSent(true);
      setAudioUrl(null);
    } catch (err) {
      alert("Error al subir: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const attemptText = submission?.attemptsAllowed > 1
    ? ` · Intento ${submission.attemptNumber} de ${submission.attemptsAllowed}`
    : "";

  return (
    <div className="score-viewer-container">
      {loading && <p className="loading-text">Cargando partitura…</p>}
      {error && (
        <p className="score-viewer-error" role="alert">
          <i className="fas fa-circle-exclamation" aria-hidden="true"></i> {error}
        </p>
      )}

      {xml && <ScorePlayer xml={xml} title="Partitura" />}

      {/* Grabación y envío */}
      <div className="recording-controls">
        {justSent && (
          <p className="status-success">
            <i className="fas fa-circle-check" aria-hidden="true"></i> Lección enviada con éxito
          </p>
        )}

        {!canSubmit && !justSent && submission?.reason && (
          <p className="status-note">
            <i className="fas fa-lock" aria-hidden="true"></i> {submission.reason}
          </p>
        )}

        {canSubmit && !recording && (
          <div className="record-row">
            <button type="button" className="record-btn" onClick={startRecording}>
              <span className="rec-dot" aria-hidden="true"></span> {audioUrl ? "Grabar de nuevo" : "Iniciar grabación"}
            </button>
            <span className="muted-text">Usa audífonos si quieres escuchar la partitura mientras grabas{attemptText}</span>
          </div>
        )}

        {canSubmit && recording && (
          <button type="button" className="record-btn is-recording" onClick={stopRecording}>
            <i className="fas fa-stop" aria-hidden="true"></i> Detener
          </button>
        )}

        {recording && (
          <canvas ref={canvasRef} width={400} height={100} className="score-viewer-waveform" />
        )}

        {audioUrl && canSubmit && (
          <div className="recording-review">
            <p><i className="fas fa-headphones" aria-hidden="true"></i> Escucha tu intento:</p>
            <audio controls src={audioUrl} />
            <button type="button" className="send-btn" onClick={handleUploadClick} disabled={uploading}>
              <i className="fas fa-paper-plane" aria-hidden="true"></i>
              {uploading ? " Enviando…" : " Enviar lección al profesor"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
