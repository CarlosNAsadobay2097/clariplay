import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db, storage } from '../firebase';
import { getAuth } from 'firebase/auth';
import { getDownloadURL, ref } from 'firebase/storage';
import {
  computeLessonStatus,
  sortRecordings,
  formatDue,
  accessDocId,
  toDate,
} from '../utils/lessonStatus';

const DAY = 24 * 60 * 60 * 1000;

/** Valor para <input type="datetime-local"> en hora local */
function toLocalInput(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default function StudentsSection() {
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [viewingStudentId, setViewingStudentId] = useState(null);
  const [courses, setCourses] = useState([]);
  const [studentsByCourse, setStudentsByCourse] = useState({});
  const [lessonsByCourse, setLessonsByCourse] = useState({});
  const [recordingsByStudentCourse, setRecordingsByStudentCourse] = useState({});
  const [accessByStudentCourse, setAccessByStudentCourse] = useState({});
  const [updatedScores, setUpdatedScores] = useState({});
  const [updatedFeedbacks, setUpdatedFeedbacks] = useState({});
  const [managing, setManaging] = useState(null); // { studentId, lessonId }
  const [manageDate, setManageDate] = useState('');
  const [busy, setBusy] = useState(false);

  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    const fetchCourses = async () => {
      const q = query(collection(db, 'courses'), where('createdBy', '==', user.uid));
      const snapshot = await getDocs(q);
      setCourses(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchCourses();
  }, [user]);

  const loadStudentsByCourse = async (courseId) => {
    const q = query(collection(db, 'enrollments'), where('courseId', '==', courseId));
    const snapshot = await getDocs(q);
    const students = snapshot.docs.map(d => {
      const data = d.data();
      return { id: data.studentId, name: data.studentName || 'Estudiante sin nombre' };
    });
    setStudentsByCourse(prev => ({ ...prev, [courseId]: students }));
  };

  const loadLessonsByCourse = async (courseId) => {
    const q = query(
      collection(db, 'lessons'),
      where('courseId', '==', courseId),
      where('createdBy', '==', user.uid)
    );
    const snapshot = await getDocs(q);
    const lessons = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(lesson => !lesson.deleted && lesson.type !== 'theory')
      .sort((a, b) => (toDate(a.dueDate)?.getTime() ?? Infinity) - (toDate(b.dueDate)?.getTime() ?? Infinity));
    setLessonsByCourse(prev => ({ ...prev, [courseId]: lessons }));
    return lessons;
  };

  const keyStudentCourse = (studentId, courseId) => `${studentId}_${courseId}`;

  const loadAccess = async (studentId, courseId) => {
    try {
      const q = query(
        collection(db, 'lessonAccess'),
        where('studentId', '==', studentId),
        where('courseId', '==', courseId),
        where('teacherId', '==', user.uid)
      );
      const snapshot = await getDocs(q);
      const map = {};
      snapshot.docs.forEach(d => { const a = d.data(); map[a.lessonId] = a; });
      setAccessByStudentCourse(prev => ({ ...prev, [keyStudentCourse(studentId, courseId)]: map }));
    } catch (err) {
      console.warn('No se pudieron leer las excepciones de plazo (¿reglas de Firestore?):', err);
    }
  };

  // Carga los envíos (todos los intentos) no asociados a lecciones borradas
  const loadRecordings = async (studentId, courseId) => {
    try {
      const q = query(
        collection(db, 'audioRecordings'),
        where('studentId', '==', studentId),
        where('courseId', '==', courseId)
      );
      const snapshot = await getDocs(q);

      const recordingsRaw = await Promise.all(
        snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          try {
            const lessonSnap = await getDoc(doc(db, 'lessons', data.lessonId));
            if (!lessonSnap.exists() || lessonSnap.data().deleted) return null;
            const audioUrl = await getDownloadURL(ref(storage, data.storagePath));
            return {
              id: docSnap.id,
              lessonId: data.lessonId,
              lessonTitle: lessonSnap.data().title,
              attempt: data.attempt ?? 1,
              createdAt: data.createdAt,
              score: data.score ?? '',
              feedback: data.feedback ?? '',
              storagePath: data.storagePath,
              audioUrl,
            };
          } catch {
            return null;
          }
        })
      );

      const recordings = recordingsRaw.filter(Boolean);
      setRecordingsByStudentCourse(prev => ({ ...prev, [keyStudentCourse(studentId, courseId)]: recordings }));
      return recordings;
    } catch (err) {
      console.error('Error al cargar grabaciones del estudiante:', err);
      return [];
    }
  };

  const loadStudentData = (studentId, courseId) =>
    Promise.all([loadRecordings(studentId, courseId), loadAccess(studentId, courseId)]);

  const toggleCourse = async (courseId) => {
    setManaging(null);
    if (expandedCourse === courseId) {
      setExpandedCourse(null);
      setEditingStudentId(null);
      setViewingStudentId(null);
      return;
    }
    setExpandedCourse(courseId);
    setEditingStudentId(null);
    setViewingStudentId(null);
    if (!studentsByCourse[courseId]) await loadStudentsByCourse(courseId);
    if (!lessonsByCourse[courseId]) await loadLessonsByCourse(courseId);
  };

  const toggleEditGrades = async (studentId, courseId) => {
    const newState = editingStudentId === studentId ? null : studentId;
    setEditingStudentId(newState);
    setViewingStudentId(null);
    setManaging(null);
    if (newState && !recordingsByStudentCourse[keyStudentCourse(studentId, courseId)]) {
      await loadStudentData(studentId, courseId);
    }
  };

  const handleViewGrades = async (studentId, courseId) => {
    const newState = viewingStudentId === studentId ? null : studentId;
    setViewingStudentId(newState);
    setEditingStudentId(null);
    setManaging(null);
    if (newState && !recordingsByStudentCourse[keyStudentCourse(studentId, courseId)]) {
      await loadStudentData(studentId, courseId);
    }
  };

  /** Último intento de cada lección */
  const latestByLesson = (studentId, courseId) => {
    const recordings = recordingsByStudentCourse[keyStudentCourse(studentId, courseId)] || [];
    const map = {};
    sortRecordings(recordings).forEach(r => { map[r.lessonId] = r; });
    return map;
  };

  // Promedio con la nota del último intento de cada lección
  const calculateAverage = (studentId, courseId) => {
    if (!recordingsByStudentCourse[keyStudentCourse(studentId, courseId)]) return '-';
    const scores = Object.values(latestByLesson(studentId, courseId))
      .map(r => (r.score === '' ? NaN : Number(r.score)))
      .filter(n => !Number.isNaN(n));
    if (scores.length === 0) return '-';
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
  };

  const handleSaveScores = async (studentId, courseId) => {
    const key = keyStudentCourse(studentId, courseId);
    const latest = latestByLesson(studentId, courseId);
    try {
      const updates = {};
      for (const rec of Object.values(latest)) {
        const k = `${studentId}-${rec.lessonId}`;
        const newScore = updatedScores[k];
        const newFeedback = updatedFeedbacks[k];
        if (newScore === undefined && newFeedback === undefined) continue;
        const patch = {
          ...(newScore !== undefined ? { score: Number(newScore) } : {}),
          ...(newFeedback !== undefined ? { feedback: newFeedback } : {}),
        };
        await updateDoc(doc(db, 'audioRecordings', rec.id), patch);
        updates[rec.id] = patch;
      }
      setRecordingsByStudentCourse(prev => ({
        ...prev,
        [key]: (prev[key] || []).map(r => (updates[r.id] ? { ...r, ...updates[r.id] } : r)),
      }));
      alert('Calificaciones y retroalimentación actualizadas');
      setEditingStudentId(null);
      setUpdatedScores({});
      setUpdatedFeedbacks({});
    } catch (err) {
      console.error('Error actualizando calificaciones o feedback:', err);
      alert('Error al actualizar calificaciones o retroalimentación');
    }
  };

  // ------------------------------------------------ plazos y reintentos
  const openManage = (studentId, lesson, status) => {
    if (managing?.studentId === studentId && managing?.lessonId === lesson.id) {
      setManaging(null);
      return;
    }
    const now = new Date();
    const base = status.due && status.due > now ? status.due : now;
    setManageDate(toLocalInput(new Date(base.getTime() + 3 * DAY)));
    setManaging({ studentId, lessonId: lesson.id });
  };

  const writeAccess = async (studentId, courseId, lessonId, patch) => {
    await setDoc(doc(db, 'lessonAccess', accessDocId(lessonId, studentId)), {
      lessonId,
      studentId,
      courseId,
      teacherId: user.uid,
      updatedAt: serverTimestamp(),
      ...patch,
    }, { merge: true });
    await loadAccess(studentId, courseId);
  };

  const handleExtend = async (studentId, courseId, lessonId) => {
    const date = new Date(manageDate);
    if (Number.isNaN(date.getTime()) || date <= new Date()) {
      alert('Elige una fecha futura.');
      return;
    }
    setBusy(true);
    try {
      await writeAccess(studentId, courseId, lessonId, { dueDate: Timestamp.fromDate(date), lastAction: 'extended' });
      setManaging(null);
    } catch (err) {
      console.error('Error ampliando el plazo:', err);
      alert('No se pudo ampliar el plazo. Revisa las reglas de Firestore para "lessonAccess".');
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async (studentId, courseId, lessonId, status) => {
    if (!window.confirm('El estudiante podrá grabar y enviar esta lección otra vez. ¿Continuar?')) return;
    setBusy(true);
    try {
      const patch = { extraAttempts: increment(1), lastAction: 'reopened' };
      // Si el plazo ya venció, la reapertura incluye una nueva fecha límite
      if (status.due && status.due <= new Date()) {
        const date = new Date(manageDate);
        patch.dueDate = Timestamp.fromDate(Number.isNaN(date.getTime()) || date <= new Date() ? new Date(Date.now() + 3 * DAY) : date);
      }
      await writeAccess(studentId, courseId, lessonId, patch);
      setManaging(null);
    } catch (err) {
      console.error('Error reabriendo la lección:', err);
      alert('No se pudo reabrir la lección. Revisa las reglas de Firestore para "lessonAccess".');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section-block student-courses-section">
      <h2>Lista de Estudiantes</h2>
      <p>Revisa las entregas, califica y gestiona plazos o reintentos de cada estudiante.</p>

      <div className="student-course-cards">
        {courses.map((course) => (
          <div key={course.id} className="student-course-card">
            <div className="student-course-header" onClick={() => toggleCourse(course.id)}>
              <h3>{course.title}</h3>
              <button className="student-toggle-btn">
                {expandedCourse === course.id ? 'Ocultar' : 'Ver estudiantes'}
              </button>
            </div>

            {expandedCourse === course.id && (
              <ul className="student-course-list">
                {(studentsByCourse[course.id] || []).length === 0 && (
                  <li className="muted-text">Aún no hay estudiantes inscritos.</li>
                )}
                {(studentsByCourse[course.id] || []).map((student) => {
                  const key = keyStudentCourse(student.id, course.id);
                  const recordings = recordingsByStudentCourse[key] || [];
                  const access = accessByStudentCourse[key] || {};
                  const latest = latestByLesson(student.id, course.id);
                  const isEditing = editingStudentId === student.id;
                  const isOpen = isEditing || viewingStudentId === student.id;

                  return (
                    <li key={student.id} className="student-course-item">
                      <div className="student-course-top">
                        <span className="student-course-name">{student.name}</span>
                        <span className="student-average">Promedio: {calculateAverage(student.id, course.id)}</span>
                      </div>

                      <div className="student-course-actions">
                        <button className="student-btn edit" onClick={() => toggleEditGrades(student.id, course.id)}>
                          {isEditing ? 'Cancelar edición' : 'Editar calificación'}
                        </button>
                        <button className="student-btn view" onClick={() => handleViewGrades(student.id, course.id)}>
                          {viewingStudentId === student.id ? 'Ocultar' : 'Ver entregas'}
                        </button>
                      </div>

                      {isOpen && (
                        <div className="edit-grades-box">
                          <div className="students-table-wrapper">
                            <table className="edit-grades-table">
                              <thead>
                                <tr>
                                  <th>Lección</th>
                                  <th>Estado</th>
                                  <th>Audio</th>
                                  <th>Nota</th>
                                  <th>Feedback</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(lessonsByCourse[course.id] || []).length === 0 && (
                                  <tr><td colSpan="5">No hay lecciones prácticas en este curso.</td></tr>
                                )}

                                {(lessonsByCourse[course.id] || []).map((lesson) => {
                                  const lessonRecs = recordings.filter(r => r.lessonId === lesson.id);
                                  const recording = latest[lesson.id];
                                  const st = computeLessonStatus({ lesson, access: access[lesson.id], recordings: lessonRecs });
                                  const isManaging = managing?.studentId === student.id && managing?.lessonId === lesson.id;
                                  const k = `${student.id}-${lesson.id}`;

                                  return (
                                    <React.Fragment key={lesson.id}>
                                      <tr>
                                        <td>
                                          <strong>{lesson.title}</strong>
                                          {st.attemptsUsed > 1 && <div className="muted-text">Intento {recording?.attempt ?? st.attemptsUsed} de {st.attemptsAllowed}</div>}
                                        </td>
                                        <td>
                                          <span className={`status-badge tone-${st.tone}`}>{st.label}</span>
                                          {st.due && (
                                            <div className={`due-line ${st.status === 'overdue' ? 'is-late' : ''}`}>
                                              {st.extended ? 'Ampliado: ' : 'Vence: '}{formatDue(st.due)}
                                            </div>
                                          )}
                                          <button className="link-btn" onClick={() => openManage(student.id, lesson, st)}>
                                            <i className="fas fa-sliders" aria-hidden="true"></i> {isManaging ? 'Cerrar' : 'Plazo / reintento'}
                                          </button>
                                        </td>
                                        <td>
                                          {recording ? <audio controls src={recording.audioUrl} /> : <span className="muted-text">No entregado</span>}
                                        </td>
                                        <td>
                                          {recording ? (
                                            isEditing ? (
                                              <input
                                                type="number"
                                                min="0"
                                                max="10"
                                                defaultValue={recording.score}
                                                onChange={(e) => setUpdatedScores(prev => ({ ...prev, [k]: e.target.value }))}
                                              />
                                            ) : (
                                              <span>{recording.score === '' ? '—' : recording.score}</span>
                                            )
                                          ) : '—'}
                                        </td>
                                        <td>
                                          {recording ? (
                                            isEditing ? (
                                              <textarea
                                                defaultValue={recording.feedback}
                                                rows="2"
                                                onChange={(e) => setUpdatedFeedbacks(prev => ({ ...prev, [k]: e.target.value }))}
                                              />
                                            ) : (
                                              <span>{recording.feedback}</span>
                                            )
                                          ) : '—'}
                                        </td>
                                      </tr>

                                      {isManaging && (
                                        <tr className="manage-row">
                                          <td colSpan="5">
                                            <div className="manage-panel">
                                              <div className="manage-block">
                                                <label>
                                                  Nueva fecha límite para {student.name.split(' ')[0]}
                                                  <input
                                                    type="datetime-local"
                                                    value={manageDate}
                                                    min={toLocalInput(new Date())}
                                                    onChange={(e) => setManageDate(e.target.value)}
                                                  />
                                                </label>
                                                <button className="student-btn update" disabled={busy} onClick={() => handleExtend(student.id, course.id, lesson.id)}>
                                                  <i className="far fa-calendar-plus" aria-hidden="true"></i> Ampliar plazo
                                                </button>
                                              </div>
                                              <div className="manage-block">
                                                <p className="muted-text">
                                                  {st.attemptsUsed === 0
                                                    ? 'Aún no ha enviado: con ampliar el plazo es suficiente.'
                                                    : `Ha usado ${st.attemptsUsed} de ${st.attemptsAllowed} intento(s).${st.due && st.due <= new Date() ? ' Al reabrir se usará la fecha de arriba.' : ''}`}
                                                </p>
                                                <button
                                                  className="student-btn save"
                                                  disabled={busy || st.attemptsUsed === 0 || st.canSubmit}
                                                  onClick={() => handleReopen(student.id, course.id, lesson.id, st)}
                                                  title={st.canSubmit ? 'El estudiante ya puede enviar' : undefined}
                                                >
                                                  <i className="fas fa-rotate-right" aria-hidden="true"></i> Reabrir para repetir
                                                </button>
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {isEditing && (
                            <div className="edit-grades-buttons">
                              <button className="student-btn save" onClick={() => handleSaveScores(student.id, course.id)}>Guardar</button>
                              <button className="student-btn cancel" onClick={() => setEditingStudentId(null)}>Cancelar</button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
