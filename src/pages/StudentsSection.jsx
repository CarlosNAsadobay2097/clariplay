import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { getAuth } from 'firebase/auth';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../firebase';

export default function StudentsSection() {
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [viewingStudentId, setViewingStudentId] = useState(null);
  const [courses, setCourses] = useState([]);
  const [studentsByCourse, setStudentsByCourse] = useState({});
  const [lessonsByCourse, setLessonsByCourse] = useState({});
  const [recordingsByStudentCourse, setRecordingsByStudentCourse] = useState({});
  const [updatedScores, setUpdatedScores] = useState({});
  const [updatedFeedbacks, setUpdatedFeedbacks] = useState({});

  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const fetchCourses = async () => {
      const q = query(collection(db, 'courses'), where('createdBy', '==', user.uid));
      const snapshot = await getDocs(q);
      const fetchedCourses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCourses(fetchedCourses);
    };

    fetchCourses();
  }, [user]);

  // Función para cargar estudiantes inscritos en un curso
  const loadStudentsByCourse = async (courseId) => {
    const q = query(collection(db, 'enrollments'), where('courseId', '==', courseId));
    const snapshot = await getDocs(q);
    const students = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: data.studentId,
        name: data.studentName || 'Estudiante sin nombre',
        average: data.average ?? '-',
      };
    });
    setStudentsByCourse(prev => ({ ...prev, [courseId]: students }));
  };

  // Función para cargar lecciones no borradas creadas por el profesor en un curso
  const loadLessonsByCourse = async (courseId) => {
    const q = query(
      collection(db, 'lessons'),
      where('courseId', '==', courseId),
      where('createdBy', '==', user.uid)
    );
    const snapshot = await getDocs(q);
    const lessons = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(lesson => !lesson.deleted && lesson.type !== 'theory');  // <-- Aquí filtramos
    setLessonsByCourse(prev => ({ ...prev, [courseId]: lessons }));
    return lessons;
  };


  const keyStudentCourse = (studentId, courseId) => `${studentId}_${courseId}`;

  // Carga grabaciones no asociadas a lecciones borradas
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
            if (!lessonSnap.exists()) return null;
            const lessonData = lessonSnap.data();
            if (lessonData.deleted) return null;  // ignorar grabaciones de lecciones borradas

            const audioUrl = await getDownloadURL(ref(storage, data.storagePath));
            return {
              id: docSnap.id,
              lessonId: data.lessonId,
              lessonTitle: lessonData.title,
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
      setRecordingsByStudentCourse(prev => ({
        ...prev,
        [keyStudentCourse(studentId, courseId)]: recordings,
      }));

      return recordings;
    } catch (err) {
      console.error('Error al cargar grabaciones del estudiante:', err);
      return [];
    }
  };

  const toggleCourse = async (courseId) => {
    if (expandedCourse === courseId) {
      setExpandedCourse(null);
      setEditingStudentId(null);
      setViewingStudentId(null);
      return;
    }

    setExpandedCourse(courseId);
    setEditingStudentId(null);
    setViewingStudentId(null);

    if (!studentsByCourse[courseId]) {
      await loadStudentsByCourse(courseId);
    }
    if (!lessonsByCourse[courseId]) {
      await loadLessonsByCourse(courseId);
    }
  };

  const toggleEditGrades = async (studentId, courseId) => {
    const newState = editingStudentId === studentId ? null : studentId;
    setEditingStudentId(newState);
    setViewingStudentId(null);

    if (newState && !recordingsByStudentCourse[keyStudentCourse(studentId, courseId)]) {
      await loadRecordings(studentId, courseId);
    }
  };

  const handleViewGrades = async (studentId, courseId) => {
    const newState = viewingStudentId === studentId ? null : studentId;
    setViewingStudentId(newState);
    setEditingStudentId(null);

    if (newState && !recordingsByStudentCourse[keyStudentCourse(studentId, courseId)]) {
      await loadRecordings(studentId, courseId);
    }
  };

  // Calcula promedio sólo con lecciones que tienen nota válida y que no están borradas
  const calculateAverage = (studentId, courseId) => {
    const recordings = recordingsByStudentCourse[keyStudentCourse(studentId, courseId)];
    if (!recordings || recordings.length === 0) return '-';

    const validScores = recordings
      .map(r => Number(r.score))
      .filter(score => !isNaN(score));

    if (validScores.length === 0) return '-';

    const total = validScores.reduce((acc, score) => acc + score, 0);
    return (total / validScores.length).toFixed(2);
  };

  const handleSaveScores = async (studentId, courseId) => {
    const recordings = recordingsByStudentCourse[keyStudentCourse(studentId, courseId)];
    try {
      const updatedRecordings = [...recordings];

      for (let i = 0; i < recordings.length; i++) {
        const rec = recordings[i];
        const key = `${studentId}-${rec.lessonId}`;
        const newScore = updatedScores[key];
        const newFeedback = updatedFeedbacks[key];

        if (newScore !== undefined || newFeedback !== undefined) {
          const docRef = doc(db, 'audioRecordings', rec.id);
          await updateDoc(docRef, {
            ...(newScore !== undefined ? { score: Number(newScore) } : {}),
            ...(newFeedback !== undefined ? { feedback: newFeedback } : {}),
          });

          updatedRecordings[i] = {
            ...rec,
            score: newScore !== undefined ? Number(newScore) : rec.score,
            feedback: newFeedback !== undefined ? newFeedback : rec.feedback,
          };
        }
      }

      setRecordingsByStudentCourse((prev) => ({
        ...prev,
        [keyStudentCourse(studentId, courseId)]: updatedRecordings,
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

  return (
    <div className="section-block student-courses-section">
      <h2>Lista de Estudiantes</h2>
      <p>Aquí podrás ver y gestionar los estudiantes inscritos en tus cursos.</p>

      <div className="student-course-cards">
        {courses.map((course) => (
          <div key={course.id} className="student-course-card">
            <div className="student-course-header" onClick={() => toggleCourse(course.id)} style={{ cursor: 'pointer' }}>
              <h3>{course.title}</h3>
              <button className="student-toggle-btn">
                {expandedCourse === course.id ? 'Ocultar' : 'Ver estudiantes'}
              </button>
            </div>

            {expandedCourse === course.id && (
              <ul className="student-course-list">
                {(studentsByCourse[course.id] || []).map((student) => (
                  <li key={student.id} className="student-course-item">
                    <div className="student-course-top">
                      <span className="student-course-name">{student.name}</span>
                      <span className="student-average">
                        Promedio: {calculateAverage(student.id, course.id)}
                      </span>
                    </div>

                    <div className="student-course-actions">
                      <button
                        className="student-btn edit"
                        onClick={() => toggleEditGrades(student.id, course.id)}
                      >
                        {editingStudentId === student.id ? 'Cancelar edición' : 'Editar calificación'}
                      </button>
                      <button
                        className="student-btn view"
                        onClick={() => handleViewGrades(student.id, course.id)}
                      >
                        {viewingStudentId === student.id ? 'Ocultar' : 'Ver calificaciones'}
                      </button>
                    </div>

                    {(editingStudentId === student.id || viewingStudentId === student.id) && (
                      <div className="edit-grades-box">
                        <table className="edit-grades-table">
                          <thead>
                            <tr>
                              <th>Lección</th>
                              <th>Audio</th>
                              <th>Nota</th>
                              <th>Feedback</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(lessonsByCourse[course.id] || []).length === 0 && (
                              <tr><td colSpan="4">No hay lecciones en este curso.</td></tr>
                            )}

                            {(lessonsByCourse[course.id] || []).map((lesson) => {
                              const recordings = recordingsByStudentCourse[keyStudentCourse(student.id, course.id)] || [];
                              const recording = recordings.find(r => r.lessonId === lesson.id);

                              if (recording) {
                                return (
                                  <tr key={lesson.id}>
                                    <td>{lesson.title}</td>
                                    <td>
                                      <audio controls src={recording.audioUrl} style={{ width: '180px' }} />
                                    </td>
                                    <td>
                                      {editingStudentId === student.id ? (
                                        <input
                                          type="number"
                                          min="0"
                                          max="10"
                                          defaultValue={recording.score}
                                          onChange={(e) =>
                                            setUpdatedScores((prev) => ({
                                              ...prev,
                                              [`${student.id}-${lesson.id}`]: e.target.value,
                                            }))
                                          }
                                        />
                                      ) : (
                                        <span>{recording.score}</span>
                                      )}
                                    </td>
                                    <td>
                                      {editingStudentId === student.id ? (
                                        <textarea
                                          defaultValue={recording.feedback}
                                          rows="2"
                                          onChange={(e) =>
                                            setUpdatedFeedbacks((prev) => ({
                                              ...prev,
                                              [`${student.id}-${lesson.id}`]: e.target.value,
                                            }))
                                          }
                                        />
                                      ) : (
                                        <span>{recording.feedback}</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              } else {
                                return (
                                  <tr key={lesson.id}>
                                    <td>{lesson.title}</td>
                                    <td colSpan="3" style={{ fontStyle: 'italic', color: '#777' }}>
                                      No entregado
                                    </td>
                                  </tr>
                                );
                              }
                            })}
                          </tbody>
                        </table>

                        {editingStudentId === student.id && (
                          <div className="edit-grades-buttons">
                            <button
                              className="student-btn save"
                              onClick={() => handleSaveScores(student.id, course.id)}
                            >
                              Guardar
                            </button>
                            <button
                              className="student-btn cancel"
                              onClick={() => setEditingStudentId(null)}
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
