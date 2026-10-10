import ScorePlayer from "./ScorePlayer";

// Vista previa para el profesor al crear una lección.
// Recibe el MusicXML YA SANEADO y usa el mismo reproductor que el estudiante.
export default function ScoreEditor({ xmlContent }) {
  if (!xmlContent) return null;
  return (
    <div className="score-editor">
      <ScorePlayer xml={xmlContent} title="Vista previa de la partitura" icon="fa-file-audio" />
    </div>
  );
}
