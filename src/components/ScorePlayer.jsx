import { useCallback, useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay, PointF2D } from "opensheetmusicdisplay";
import useScorePlayer, { RATE_MAX, RATE_MIN } from "../hooks/useScorePlayer";
import { INSTRUMENTS } from "../utils/sampler";
import { formatTime } from "../utils/scoreTimeline";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const RATE_PRESETS = [0.5, 0.75, 1, 1.25, 1.5];

/**
 * Partitura + reproductor completo (estilo MuseScore).
 * Recibe el MusicXML YA SANEADO (ver utils/musicxmlSecurity.js).
 */
export default function ScorePlayer({ xml, title = "Partitura", icon = "fa-music" }) {
  const containerRef = useRef(null);
  const osmdRef = useRef(null);
  const [scoreVersion, setScoreVersion] = useState(0);
  const [renderError, setRenderError] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [scrub, setScrub] = useState(null); // posición mientras se arrastra la barra
  const [showLoop, setShowLoop] = useState(false);

  const player = useScorePlayer(osmdRef, scoreVersion);
  const { settings, measures, duration, status } = player;

  // ---------------------------------------------------------- render OSMD
  useEffect(() => {
    if (!xml || !containerRef.current) return;
    let cancelled = false;
    setRenderError(null);
    if (!osmdRef.current) {
      osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
        drawingParameters: "compacttight",
        autoResize: false, // lo manejamos nosotros para recolocar el cursor
        drawTitle: true,
        followCursor: false,
        cursorsOptions: [{ type: 0, color: "#E51B23", alpha: 0.45, follow: false }],
      });
    }
    const osmd = osmdRef.current;
    osmd.load(xml)
      .then(() => {
        if (cancelled) return;
        osmd.Zoom = zoom;
        osmd.render();
        setScoreVersion(v => v + 1);
      })
      .catch(err => {
        if (cancelled) return;
        console.error("Error cargando o renderizando la partitura:", err);
        setRenderError("No se pudo dibujar la partitura.");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xml]);

  const refreshCursorRef = useRef(player.refreshCursor);
  refreshCursorRef.current = player.refreshCursor;
  const rerender = useCallback(() => {
    const osmd = osmdRef.current;
    if (!osmd?.GraphicSheet) return;
    osmd.render();
    refreshCursorRef.current();
  }, []);

  // Redibujar al cambiar el ancho del contenedor
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = el.clientWidth;
    let timer;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - lastWidth) < 8) return;
      lastWidth = el.clientWidth;
      clearTimeout(timer);
      timer = setTimeout(rerender, 200);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [rerender]);

  const changeZoom = (delta) => {
    const z = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom + delta)) * 10) / 10;
    setZoom(z);
    if (osmdRef.current) {
      osmdRef.current.Zoom = z;
      rerender();
    }
  };

  // ------------------------------------------------- clic en la partitura
  const handleSheetClick = (e) => {
    const osmd = osmdRef.current;
    const gs = osmd?.GraphicSheet;
    if (!gs || !player.ready) return;
    try {
      const svgPoint = gs.domToSvg(new PointF2D(e.clientX, e.clientY));
      const p = gs.svgToOsmd(svgPoint);
      const sourceMeasures = osmd.Sheet.SourceMeasures;
      // 1) compás cuyo rectángulo contiene el clic
      for (const staffMeasures of gs.MeasureList) {
        for (const gm of staffMeasures || []) {
          const ps = gm?.PositionAndShape;
          if (!ps) continue;
          const x = ps.AbsolutePosition.x + ps.BorderLeft;
          const y = ps.AbsolutePosition.y + ps.BorderTop;
          const w = ps.BorderRight - ps.BorderLeft;
          const h = ps.BorderBottom - ps.BorderTop;
          if (p.x >= x && p.x <= x + w && p.y >= y - 3 && p.y <= y + h + 3) {
            player.seekToSourceMeasure(sourceMeasures.indexOf(gm.parentSourceMeasure));
            return;
          }
        }
      }
      // 2) si no, la entrada más cercana
      const se = gs.GetNearestStaffEntry(p);
      const sm = se?.parentMeasure?.parentSourceMeasure;
      if (sm) player.seekToSourceMeasure(sourceMeasures.indexOf(sm));
    } catch (err) {
      console.warn("No se pudo ubicar el compás:", err);
    }
  };

  // ------------------------------------------------------------- teclado
  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (["input", "textarea", "select", "button"].includes(tag) || e.target?.isContentEditable) return;
      const p = playerRef.current;
      if (!p.ready) return;
      if (e.code === "Space") { e.preventDefault(); p.togglePlay(); }
      else if (e.code === "ArrowRight") { e.preventDefault(); p.stepMeasure(1); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); p.stepMeasure(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ----------------------------------------------------------- derivados
  const shownPos = scrub ?? player.position;
  const progressPct = duration > 0 ? (shownPos / duration) * 100 : 0;
  const lastOcc = Math.max(0, measures.length - 1);
  const loopStartM = measures[Math.min(settings.loop.start, lastOcc)];
  const loopEndM = measures[Math.min(settings.loop.end, lastOcc)];
  const loopStyle = settings.loop.enabled && loopStartM && loopEndM && duration > 0
    ? {
        left: `${(loopStartM.startTime / duration) * 100}%`,
        width: `${((loopEndM.endTime - loopStartM.startTime) / duration) * 100}%`,
      }
    : null;
  const disabled = !player.ready || !!renderError;
  const ratePct = Math.round(settings.rate * 100);
  const measureLabel = player.currentMeasure ? player.currentMeasure.number : "–";
  const totalMeasures = measures.length ? measures[measures.length - 1].number : "–";

  const setRate = (r) => player.updateSettings({ rate: Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(r * 100) / 100)) });

  const measureOptions = measures.map((m, i) => (
    <option key={i} value={i}>Compás {m.number}{measures.filter(x => x.number === m.number).length > 1 ? ` (${measures.slice(0, i + 1).filter(x => x.number === m.number).length}ª vez)` : ""}</option>
  ));

  return (
    <div className="score-player">
      <div className="score-viewer-header">
        <h3 className="score-viewer-title">
          <i className={`fas ${icon}`} aria-hidden="true"></i> {title}
        </h3>
        <div className="sp-view-tools">
          <button type="button" className="icon-btn" onClick={() => changeZoom(-0.1)} disabled={zoom <= ZOOM_MIN} title="Alejar" aria-label="Alejar">
            <i className="fas fa-magnifying-glass-minus" aria-hidden="true"></i>
          </button>
          <span className="sp-zoom-label">{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon-btn" onClick={() => changeZoom(0.1)} disabled={zoom >= ZOOM_MAX} title="Acercar" aria-label="Acercar">
            <i className="fas fa-magnifying-glass-plus" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            className={`icon-btn ${settings.follow ? "is-on" : ""}`}
            onClick={() => player.updateSettings({ follow: !settings.follow })}
            title="Seguir el cursor automáticamente"
            aria-pressed={settings.follow}
          >
            <i className="fas fa-arrows-down-to-line" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      {(renderError || player.error) && (
        <p className="score-viewer-error" role="alert">{renderError || player.error}</p>
      )}
      {!player.ready && !renderError && <p className="loading-text">Preparando partitura…</p>}

      <div className="score-paper" onClick={handleSheetClick} title={player.ready ? "Haz clic en un compás para empezar desde ahí" : undefined}>
        <div ref={containerRef} className="score-viewer-osmd" />
      </div>

      {/* ------------------------------ Barra de control ------------------------------ */}
      <div className="player-bar" role="region" aria-label="Controles de reproducción">
        <div className="pb-progress">
          <span className="pb-time">{formatTime(shownPos)}</span>
          <div className="pb-track" style={{ "--progress": `${progressPct}%` }}>
            {loopStyle && <div className="pb-loop" style={loopStyle} aria-hidden="true" />}
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={Math.min(shownPos, duration || 0)}
              disabled={disabled}
              aria-label="Posición de reproducción"
              onChange={(e) => setScrub(Number(e.target.value))}
              onPointerUp={(e) => { player.seek(Number(e.target.value)); setScrub(null); }}
              onKeyUp={(e) => { player.seek(Number(e.target.value)); setScrub(null); }}
            />
          </div>
          <span className="pb-time">{formatTime(duration)}</span>
        </div>

        <div className="pb-row">
          <div className="pb-transport">
            <button type="button" className="icon-btn" onClick={() => player.stepMeasure(-1)} disabled={disabled} title="Compás anterior (←)" aria-label="Compás anterior">
              <i className="fas fa-backward-step" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              className={`pb-play ${player.playing ? "is-playing" : ""}`}
              onClick={player.togglePlay}
              disabled={disabled || player.preparing}
              title={player.playing ? "Pausar (espacio)" : "Reproducir (espacio)"}
              aria-label={player.playing ? "Pausar" : "Reproducir"}
            >
              <i className={`fas ${player.preparing ? "fa-spinner fa-spin" : player.playing ? "fa-pause" : "fa-play"}`} aria-hidden="true"></i>
            </button>
            <button type="button" className="icon-btn" onClick={player.stop} disabled={disabled || status === "stopped"} title="Detener" aria-label="Detener">
              <i className="fas fa-stop" aria-hidden="true"></i>
            </button>
            <button type="button" className="icon-btn" onClick={() => player.stepMeasure(1)} disabled={disabled} title="Compás siguiente (→)" aria-label="Compás siguiente">
              <i className="fas fa-forward-step" aria-hidden="true"></i>
            </button>
          </div>

          <div className="pb-status">
            {player.countInBeat > 0 ? (
              <span className="pb-countin">{player.countInBeat}</span>
            ) : (
              <span className="pb-measure">Compás <strong>{measureLabel}</strong> / {totalMeasures}</span>
            )}
            {player.playing && <span className="live-dot" aria-hidden="true"></span>}
          </div>

          <div className="pb-tools">
            {/* Velocidad */}
            <div className="pb-group pb-rate" title="Velocidad">
              <button type="button" className="icon-btn sm" onClick={() => setRate(settings.rate - 0.05)} disabled={settings.rate <= RATE_MIN} aria-label="Más lento">
                <i className="fas fa-minus" aria-hidden="true"></i>
              </button>
              <select
                value={RATE_PRESETS.includes(settings.rate) ? settings.rate : "custom"}
                onChange={(e) => e.target.value !== "custom" && setRate(Number(e.target.value))}
                aria-label="Velocidad"
              >
                {!RATE_PRESETS.includes(settings.rate) && <option value="custom">{ratePct}%</option>}
                {RATE_PRESETS.map(r => <option key={r} value={r}>{Math.round(r * 100)}%</option>)}
              </select>
              <button type="button" className="icon-btn sm" onClick={() => setRate(settings.rate + 0.05)} disabled={settings.rate >= RATE_MAX} aria-label="Más rápido">
                <i className="fas fa-plus" aria-hidden="true"></i>
              </button>
            </div>

            {/* Metrónomo y cuenta de entrada */}
            <button
              type="button"
              className={`icon-btn ${settings.metronome ? "is-on" : ""}`}
              onClick={() => player.updateSettings({ metronome: !settings.metronome })}
              title="Metrónomo"
              aria-pressed={settings.metronome}
            >
              <i className="fas fa-stopwatch" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              className={`icon-btn text ${settings.countIn ? "is-on" : ""}`}
              onClick={() => player.updateSettings({ countIn: !settings.countIn })}
              title="Cuenta de entrada (un compás de clics antes de empezar)"
              aria-pressed={settings.countIn}
            >
              1·2·3
            </button>

            {/* Loop A-B */}
            <button
              type="button"
              className={`icon-btn ${settings.loop.enabled ? "is-on" : ""}`}
              onClick={() => { const on = !settings.loop.enabled; player.updateSettings({ loop: { enabled: on } }); setShowLoop(on); }}
              title="Repetir un tramo (loop A-B)"
              aria-pressed={settings.loop.enabled}
            >
              <i className="fas fa-repeat" aria-hidden="true"></i>
            </button>

            {/* Instrumento */}
            <div className="pb-group">
              <i className="fas fa-music pb-group-icon" aria-hidden="true"></i>
              <select
                value={settings.instrument}
                onChange={(e) => player.updateSettings({ instrument: e.target.value })}
                aria-label="Sonido"
              >
                {Object.entries(INSTRUMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            {/* Volumen */}
            <div className="pb-group pb-volume">
              <button
                type="button"
                className="icon-btn sm"
                onClick={() => player.updateSettings({ volume: settings.volume > 0 ? 0 : 0.8 })}
                aria-label={settings.volume > 0 ? "Silenciar" : "Activar sonido"}
                title="Volumen"
              >
                <i className={`fas ${settings.volume === 0 ? "fa-volume-xmark" : settings.volume < 0.5 ? "fa-volume-low" : "fa-volume-high"}`} aria-hidden="true"></i>
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={settings.volume}
                onChange={(e) => player.updateSettings({ volume: Number(e.target.value) })}
                aria-label="Volumen"
                style={{ "--progress": `${settings.volume * 100}%` }}
              />
            </div>
          </div>
        </div>

        {settings.loop.enabled && showLoop && measures.length > 0 && (
          <div className="pb-loop-panel">
            <i className="fas fa-repeat" aria-hidden="true"></i>
            <span>Repetir desde</span>
            <select value={Math.min(settings.loop.start, lastOcc)} onChange={(e) => player.updateSettings({ loop: { start: Number(e.target.value) } })} aria-label="Inicio del tramo">
              {measureOptions}
            </select>
            <span>hasta</span>
            <select value={Math.min(settings.loop.end, lastOcc)} onChange={(e) => player.updateSettings({ loop: { end: Number(e.target.value) } })} aria-label="Fin del tramo">
              {measureOptions}
            </select>
            <button type="button" className="btn-ghost sm" onClick={() => setShowLoop(false)}>Listo</button>
          </div>
        )}
      </div>
    </div>
  );
}
