import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';
import ScoreViewer from '../components/ScoreViewer';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMusic } from '@fortawesome/free-solid-svg-icons';
import { renderLessonContent } from '../utils/safeHtml';
import {
  computeLessonStatus,
  summarizeProgress,
  formatDue,
  relativeDue,
  toDate,
  recordingDocId,
} from '../utils/lessonStatus';

const MAX_AUDIO_BYTES = 30 * 1024 * 1024; // 30 MB

const FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'todo', label: 'Por hacer', match: s => s === 'pending' || s === 'reopened' },
  { key: 'submitted', label: 'Enviadas', match: s => s === 'submitted' },
  { key: 'graded', label: 'Calificadas', match: s => s === 'graded' },
  { key: 'overdue', label: 'Vencidas', match: s => s === 'overdue' },
];

/** Sube un intento nuevo. El nº de intento va en el id del documento. */
async function uploadAttempt(audioBlob, { userId, lesson, courseId, status }) {
  if (!userId || !lesson?.id || !courseId) throw new Error('Faltan datos para subir audio');
  if (!(audioBlob instanceof Blob) || audioBlob.size === 0) throw new Error('La grabación está vacía');
  if (audioBlob.size > MAX_AUDIO_BYTES) throw new Error('La grabación es demasiado grande (máx. 30 MB)');
  if (!status.canSubmit) throw new Error(status.reason || 'Esta lección no admite más envíos');

  const attempt = status.attemptNumber;
  const filePath = `student-submissions/${courseId}/${lesson.id}/${userId}/audio-${attempt}.webm`;
  await uploadBytes(ref(storage, filePath), audioBlob, { contentType: 'audio/webm' });

  await setDoc(doc(db, 'audioRecordings', recordingDocId(lesson.id, userId, attempt)), {
    studentId: userId,
    lessonId: lesson.id,
    courseId,
    attempt,
    storagePath: filePath,
    createdAt: serverTimestamp(),
  });
}

function sortPractical(a, b) {
  const da = toDate(a.dueDate)?.getTime() ?? Infinity;
  const dbb = toDate(b.dueDate)?.getTime() ?? Infinity;
  if (da !== dbb) return da - dbb;
  return (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0);
}

export default function LessonsSection() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [courses, setCourses] = useState([]);
  const [lessonsByCourse, setLessonsByCourse] = useState({});
  const [recordingsByLesson, setRecordingsByLesson] = useState({});
  const [accessByLesson, setAccessByLesson] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [filter, setFilter] = useState('all');

  const loadSubmissions = useCallback(async () => {
    if (!user) return;
    const recSnap = await getDocs(query(collection(db, 'audioRecordings'), where('studentId', '==', user.uid)));
    const recs = {};
    recSnap.docs.forEach(d => {
      const r = { id: d.id, ...d.data() };
      (recs[r.lessonId] ||= []).push(r);
    });
    setRecordingsByLesson(recs);

    // Excepciones del profesor (ampliaciones / reaperturas)
    try {
      const accSnap = await getDocs(query(collection(db, 'lessonAccess'), where('studentId', '==', user.uid)));
      const acc = {};
      accSnap.docs.forEach(d => { const a = d.data(); acc[a.lessonId] = a; });
      setAccessByLesson(acc);
    } catch (err) {
      console.warn('No se pudieron leer las excepciones de plazo (¿reglas de Firestore?):', err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      try {
        const enrollmentsSnapshot = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', user.uid)));
        const courseIds = enrollmentsSnapshot.docs.map(d => d.data().courseId);

        if (courseIds.length === 0) {
          setCourses([]);
          setLessonsByCourse({});
          return;
        }

        const coursesData = [];
        for (const courseId of courseIds) {
          const courseDoc = await getDoc(doc(db, 'courses', courseId));
          if (courseDoc.exists() && !courseDoc.data().deleted) {
            coursesData.push({ id: courseId, ...courseDoc.data() });
          }
        }
        setCourses(coursesData);

        const lessonsMap = {};
        for (let i = 0; i < courseIds.length; i += 10) {
          const chunk = courseIds.slice(i, i + 10);
          const lessonsSnapshot = await getDocs(query(collection(db, 'lessons'), where('courseId', 'in', chunk)));
          lessonsSnapshot.docs.forEach(docSnap => {
            const lesson = { id: docSnap.id, ...docSnap.data() };
            if (lesson.deleted) return;
            (lessonsMap[lesson.courseId] ||= []).push(lesson);
          });
        }
        setLessonsByCourse(lessonsMap);
        await loadSubmissions();
      } catch (error) {
        console.error('Error al obtener datos:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user, loadSubmissions]);

  // Estado de cada lección práctica (recalculado cada minuto para las fechas)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const statusByLesson = useMemo(() => {
    const map = {};
    Object.values(lessonsByCourse).flat().forEach(lesson => {
      if (lesson.type !== 'practical') return;
      map[lesson.id] = computeLessonStatus({
        lesson,
        access: accessByLesson[lesson.id],
        recordings: recordingsByLesson[lesson.id] || [],
        now,
      });
    });
    return map;
  }, [lessonsByCourse, accessByLesson, recordingsByLesson, now]);

  const allStatuses = Object.values(statusByLesson);
  const filterCounts = Object.fromEntries(FILTERS.map(f => [
    f.key, f.match ? allStatuses.filter(s => f.match(s.status)).length : allStatuses.length,
  ]));
  const activeFilter = FILTERS.find(f => f.key === filter);

  const toggleSelectedLesson = (id) => setSelectedLessonId(prev => (prev === id ? null : id));

  return (
    <div className="lessons-section-wrapper">
      <div className="lessons-head">
        <h2 className="lessons-section-title">
          <span><FontAwesomeIcon icon={faMusic} /></span> Mis Lecciones
        </h2>

        {allStatuses.length > 0 && (
          <div className="filter-chips" role="tablist" aria-label="Filtrar lecciones">
            {FILTERS.map(f => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`chip ${filter === f.key ? 'is-active' : ''} ${f.key === 'overdue' && filterCounts[f.key] ? 'has-alert' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label} <span className="chip-count">{filterCounts[f.key]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="loading-text">Cargando lecciones…</p>}
      {!loading && courses.length === 0 && <p>No tienes lecciones disponibles.</p>}

      {courses.map(course => {
        const lessons = lessonsByCourse[course.id] || [];
        const practicalAll = lessons.filter(l => l.type === 'practical').sort(sortPractical);
        const practical = practicalAll.filter(l => !activeFilter.match || activeFilter.match(statusByLesson[l.id]?.status));
        const theoryLessons = filter === 'all' ? lessons.filter(l => l.type === 'theory') : [];
        const progress = summarizeProgress(practicalAll.map(l => statusByLesson[l.id]).filter(Boolean));

        if (filter !== 'all' && practical.length === 0) return null;

        return (
          <div key={course.id} className="course-group">
            <div className="course-progress-card">
              <div className="cpc-top">
                <div>
                  <h3 className="course-title">{course.title}</h3>
                  <p className="cpc-meta">Nivel: {course.level} · {course.instrument}</p>
                </div>
                {progress.average !== null && (
                  <div className="cpc-average" title="Promedio de lecciones calificadas">
                    <strong>{progress.average.toFixed(1)}</strong><span>promedio</span>
                  </div>
                )}
              </div>
              {progress.total > 0 && (
                <>
                  <div className="progress-bar" role="progressbar" aria-valuenow={progress.percent} aria-valuemin="0" aria-valuemax="100">
                    <span className="pb-graded" style={{ width: `${(progress.graded / progress.total) * 100}%` }} />
                    <span className="pb-submitted" style={{ width: `${(progress.submitted / progress.total) * 100}%` }} />
                  </div>
                  <div className="cpc-legend">
                    <span><i className="dot ok" /> {progress.graded} calificadas</span>
                    <span><i className="dot warn" /> {progress.submitted} por calificar</span>
                    <span><i className="dot neutral" /> {progress.pending} por hacer</span>
                    {progress.overdue > 0 && <span><i className="dot danger" /> {progress.overdue} vencidas</span>}
                    <span className="cpc-percent">{progress.done} de {progress.total} entregadas</span>
                  </div>
                </>
              )}
            </div>

            {/* Lecciones prácticas */}
            {practical.length > 0 && (
              <>
                <h4 className="text-red-600">Lecciones prácticas</h4>
                <div className="lessons-section-grid">
                  {practical.map(lesson => {
                    const st = statusByLesson[lesson.id];
                    const isSelected = selectedLessonId === lesson.id;
                    const actionLabel = isSelected ? 'Ocultar'
                      : st.status === 'pending' ? 'Practicar y enviar'
                      : st.status === 'reopened' ? 'Repetir lección'
                      : st.status === 'graded' ? 'Ver partitura y feedback'
                      : 'Ver partitura';

                    return (
                      <div className={`lessons-card status-${st.status} ${isSelected ? 'is-open' : ''}`} key={lesson.id}>
                        <div className="lc-head">
                          <span className={`lc-status-icon tone-${st.tone}`} aria-hidden="true">
                            <i className={`fas ${st.icon}`}></i>
                          </span>
                          <div className="lc-main">
                            <h4 className="lessons-card-title">{lesson.title}</h4>
                            <div className="lc-meta">
                              <span className={`status-badge tone-${st.tone}`}>{st.label}</span>
                              {st.due && (
                                <span className={`due-chip ${st.status === 'overdue' ? 'is-late' : st.dueSoon ? 'is-soon' : ''}`} title={formatDue(st.due)}>
                                  <i className="far fa-calendar" aria-hidden="true"></i>
                                  {st.canSubmit || st.status === 'overdue' ? relativeDue(st.due, now) : `Plazo: ${formatDue(st.due)}`}
                                </span>
                              )}
                              {st.extended && <span className="tag">Plazo ampliado</span>}
                              {st.attemptsAllowed > 1 && (
                                <span className="tag">Intento {Math.min(st.attemptNumber, st.attemptsAllowed)} de {st.attemptsAllowed}</span>
                              )}
                            </div>
                          </div>
                          {st.score !== null && (
                            <div className="score-pill" title="Calificación">
                              <strong>{st.score}</strong><span>/10</span>
                            </div>
                          )}
                        </div>

                        {lesson.description && <p className="lc-desc">{lesson.description}</p>}

                        {lesson.xmlFileUrl && (
                          <button
                            onClick={() => toggleSelectedLesson(lesson.id)}
                            className={`lessons-card-button ${st.canSubmit || isSelected ? '' : 'is-secondary'}`}
                          >
                            {actionLabel}
                          </button>
                        )}

                        {isSelected && (
                          <div className="lessons-card-score">
                            {lesson.instructions && (
                              <div className="lc-instructions">
                                <strong>Instrucciones</strong>
                                <p>{lesson.instructions}</p>
                              </div>
                            )}
                            {st.feedback && (
                              <div className="lc-feedback">
                                <strong><i className="fas fa-comment-dots" aria-hidden="true"></i> Comentario del profesor</strong>
                                <p>{st.feedback}</p>
                              </div>
                            )}
                            {lesson.xmlFileUrl && (
                              <ScoreViewer
                                xmlUrl={lesson.xmlFileUrl}
                                submission={st}
                                onAudioUploaded={async (audioBlob) => {
                                  await uploadAttempt(audioBlob, { userId: user.uid, lesson, courseId: course.id, status: st });
                                  await loadSubmissions();
                                }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Clases teóricas */}
            {theoryLessons.length > 0 && (
              <>
                <h4 className="text-green-700">Clases teóricas</h4>
                <div className="lessons-section-grid">
                  {theoryLessons.map(lesson => {
                    const isSelected = selectedLessonId === lesson.id;
                    return (
                      <div className="lessons-card status-theory" key={lesson.id}>
                        <div className="lc-head">
                          <span className="lc-status-icon tone-theory" aria-hidden="true"><i className="fas fa-book-open"></i></span>
                          <div className="lc-main">
                            <h4 className="lessons-card-title">{lesson.title}</h4>
                            {lesson.description && <p className="lc-desc">{lesson.description}</p>}
                          </div>
                        </div>

                        {(lesson.imageUrl || lesson.content) && (
                          <button onClick={() => toggleSelectedLesson(lesson.id)} className="lessons-card-button is-secondary">
                            {isSelected ? 'Ocultar' : 'Ver contenido'}
                          </button>
                        )}

                        {isSelected && (
                          <div className="lessons-card-score">
                            {lesson.instructions && <p><strong>Instrucciones:</strong> {lesson.instructions}</p>}
                            {lesson.imageUrl && <img src={lesson.imageUrl} alt="Infografía" className="lessons-card-image" />}
                            {lesson.content && (
                              <div
                                className="lessons-card-content"
                                dangerouslySetInnerHTML={{ __html: renderLessonContent(lesson.content) }}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}

      {!loading && filter !== 'all' && filterCounts[filter] === 0 && (
        <p className="empty-state">No hay lecciones en esta categoría.</p>
      )}
    </div>
  );
}
