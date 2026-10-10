# Clariplay

Plataforma para aprender, practicar y compartir música con partituras interactivas (React + Vite + Firebase).

## Requisitos

- Node.js **20.19 o superior** (recomendado 22 LTS)

## Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias (la primera vez y tras actualizar) |
| `npm run dev` o `npm start` | Servidor local en http://localhost:3000 |
| `npm run build` | Compila para producción en la carpeta `build/` |
| `npm run preview` | Sirve la versión compilada para probarla |
| `npm test` | Ejecuta las pruebas (Vitest) |

## Estructura relevante

- `index.html` (raíz): plantilla de la app. El punto de entrada es `src/main.jsx` → `src/App.jsx`.
- `src/utils/musicxmlSecurity.js`: validación y saneamiento de MusicXML e imágenes antes de mostrarlas o subirlas.
- `src/utils/safeHtml.js`: saneamiento del HTML de las clases teóricas (DOMPurify).
- `src/components/ScorePlayer.jsx` + `src/hooks/useScorePlayer.js` + `src/utils/scoreTimeline.js`: reproductor de partituras (play/pausa/stop, velocidad, metrónomo, loop A-B, volumen, instrumento, zoom) sincronizado con el reloj de audio.
- `src/utils/lessonStatus.js`: estado de cada lección (pendiente, enviada, calificada, reabierta, vencida) con fechas límite y reintentos.
- `src/css/main.css`: sistema visual (variables en `:root`).
- `firestore.rules.ejemplo`: reglas sugeridas para `lessonAccess` y `audioRecordings` (plazos e intentos validados en el servidor).
- `storage.rules`: propuesta de reglas de Firebase Storage (ver comentarios dentro antes de desplegar).

## Notas de la migración (oct. 2026)

- Se reemplazó Create React App (`react-scripts`, descontinuado y con vulnerabilidades sin parche) por Vite.
- `src/App.js`, `src/index.js` y `public/index.html` quedaron como archivos de compatibilidad y se pueden borrar.

## Plazos y reintentos (oct. 2026)

- `lessons.dueDate`: fecha límite general (opcional) de una lección práctica.
- `lessonAccess/{lessonId}_{studentId}`: excepciones del profesor para un estudiante (`dueDate` ampliada, `extraAttempts`).
- `audioRecordings/{lessonId}_{studentId}_{intento}`: cada envío guarda su número de intento (`attempt`).
- La función `notifyLessonAccessChange` avisa al estudiante cuando se amplía el plazo o se reabre una lección (`firebase deploy --only functions`).

`src/hooks/useScorePlayback.js` ya no se usa y se puede borrar.

Muestras de clarinete: ver `public/audio/samples/clarinet/CREDITS.txt`.
