import React, { useEffect, useState, useRef } from 'react';
import { getAuth } from 'firebase/auth';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { fetchSafeMusicXML } from '../utils/musicxmlSecurity';
import { formatDue, toDate } from '../utils/lessonStatus';
import { Timestamp } from 'firebase/firestore';

export default function LessonsByCourse() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [courses, setCourses] = useState([]);
  const [lessonsByCourse, setLessonsByCourse] = useState({});
  const [selectedLesson, setSelectedLesson] = useState(null);

  const osmdContainerRef = useRef(null);
  const osmdInstanceRef = useRef(null);
  const [scoreError, setScoreError] = useState(null);

  // Cargar cursos del profesor
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'courses'), where('createdBy', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedCourses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCourses(fetchedCourses);
    });

    return () => unsubscribe();
  }, [user]);

  // Cargar lecciones por curso (solo no eliminadas)
  useEffect(() => {
    if (!user || courses.length === 0) return;

    const unsubscribers = [];

    for (const course of courses) {
      const q = query(
        collection(db, 'lessons'),
        where('courseId', '==', course.id),
        where('createdBy', '==', user.uid),
        where('deleted', '==', false) // ✅ Solo lecciones no eliminadas
      );


      const unsubscribe = onSnapshot(q, (snapshot) => {
        setLessonsByCourse(prev => ({
          ...prev,
          [course.id]: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        }));
      });

      unsubscribers.push(unsubscribe);
    }

    return () => unsubscribers.forEach(unsub => unsub());
  }, [courses, user]);

  // Renderizar partitura
  useEffect(() => {
    if (!selectedLesson || selectedLesson.type !== 'practical' || !selectedLesson.xmlFileUrl) return;
    if (!osmdContainerRef.current) return;

    const container = osmdContainerRef.current;
    const controller = new AbortController();
    setScoreError(null);

    const osmd = new OpenSheetMusicDisplay(container, {
      drawingParameters: 'compacttight',
      autoResize: true,
    });

    osmdInstanceRef.current = osmd;

    // 🛡️ La partitura se valida y sanea antes de dibujarla
    fetchSafeMusicXML(selectedLesson.xmlFileUrl, { signal: controller.signal })
      .then(xml => osmd.load(xml))
      .then(() => { if (!controller.signal.aborted) osmd.render(); })
      .catch(err => {
        if (controller.signal.aborted) return;
        console.error("Error al renderizar partitura:", err);
        setScoreError(err.message || 'No se pudo mostrar la partitura');
      });

    return () => {
      controller.abort();
      osmdInstanceRef.current = null;
      container.innerHTML = '';
    };
  }, [selectedLesson]);

  // Soft delete de lección
  const handleDeleteLesson = async (lessonId, xmlFileUrl, imageUrl) => {
    if (!window.confirm('¿Estás seguro de eliminar esta lección?')) return;

    try {
      const updates = {
        deleted: true,
        deletedAt: serverTimestamp()
      };

      // (Opcional) eliminar archivos del Storage si se desea limpieza total:
      try {
        if (xmlFileUrl) {
          const xmlRef = ref(storage, xmlFileUrl);
          await deleteObject(xmlRef);
        }

        if (imageUrl) {
          const imgRef = ref(storage, imageUrl);
          await deleteObject(imgRef);
        }
      } catch (fileError) {
        console.warn('No se pudo eliminar archivo de Storage:', fileError);
      }

      await updateDoc(doc(db, 'lessons', lessonId), updates);

      alert('Lección eliminada correctamente ✅');
    } catch (error) {
      console.error('Error al marcar como eliminada:', error);
      alert('Error al eliminar la lección ❌');
    }
  };

  return (
    <div className="lessons-by-course">
      <h2>Mis Cursos y Lecciones</h2>

      {courses.length === 0 && <p>No tienes cursos creados.</p>}

      {courses.map(course => {
        const lessons = lessonsByCourse[course.id] || [];

        return (
          <div key={course.id} className="lbc-course">
            <h3 className="lbc-course-title">{course.title} <span className="lbc-meta">Nivel: {course.level} · {course.instrument}</span></h3>

            {lessons.length === 0 && <p>No hay lecciones en este curso.</p>}

            {lessons.map(lesson => (
              <div key={lesson.id} className="lbc-lesson">
                <div className="lbc-lesson-info">
                  <strong>{lesson.title}</strong>
                  <span className={`lbc-badge ${lesson.type === 'practical' ? 'is-practical' : 'is-theory'}`}>
                    {lesson.type === 'practical' ? 'Práctica' : 'Teoría'}
                  </span>
                  {lesson.type === 'practical' && (
                    <DueEditor lesson={lesson} />
                  )}
                  {lesson.description && <p>{lesson.description}</p>}
                </div>

                <div className="lbc-actions">
                  <button
                    className="btn-ghost"
                    onClick={() => setSelectedLesson(lesson)}
                  >
                    Ver más
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => handleDeleteLesson(lesson.id, lesson.xmlFileUrl, lesson.imageUrl)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Modal de detalle */}
      {selectedLesson && (
        <div className="modal-overlay" onClick={() => setSelectedLesson(null)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="modal-close" onClick={() => setSelectedLesson(null)} aria-label="Cerrar">
              <i className="fas fa-xmark" aria-hidden="true"></i>
            </button>
            <h2>{selectedLesson.title}</h2>
            <p><strong>Tipo:</strong> {selectedLesson.type === 'practical' ? 'Práctica' : 'Teoría'}</p>
            <p>{selectedLesson.description}</p>

            {/* Partitura */}
            {selectedLesson.type === 'practical' && selectedLesson.xmlFileUrl && (
              <div className="modal-score">
                <h4>Partitura:</h4>
                {scoreError && <p className="score-viewer-error" role="alert">{scoreError}</p>}
                <div className="score-paper">
                  <div ref={osmdContainerRef} className="score-viewer-osmd" />
                </div>
              </div>
            )}

            {/* Imagen teórica */}
            {selectedLesson.type === 'theory' && selectedLesson.imageUrl && (
              <img src={selectedLesson.imageUrl} alt="Imagen teórica" className="lessons-card-image" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fecha límite general de una lección (para todo el curso), editable en línea. */
function DueEditor({ lesson }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const due = toDate(lesson.dueDate);

  const start = () => {
    const base = due || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setValue(local);
    setEditing(true);
  };

  const save = async (clear = false) => {
    try {
      await updateDoc(doc(db, 'lessons', lesson.id), {
        dueDate: clear || !value ? null : Timestamp.fromDate(new Date(value)),
      });
      setEditing(false);
    } catch (err) {
      console.error('Error guardando la fecha límite:', err);
      alert('No se pudo guardar la fecha límite');
    }
  };

  if (!editing) {
    return (
      <span className="due-inline">
        <i className="far fa-calendar" aria-hidden="true"></i>
        {due ? `Vence: ${formatDue(due)}` : 'Sin fecha límite'}
        <button type="button" className="link-btn" onClick={start}>Cambiar</button>
      </span>
    );
  }
  return (
    <span className="due-inline is-editing">
      <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="button" className="student-btn save" onClick={() => save(false)}>Guardar</button>
      {due && <button type="button" className="student-btn cancel" onClick={() => save(true)}>Quitar</button>}
      <button type="button" className="link-btn" onClick={() => setEditing(false)}>Cancelar</button>
    </span>
  );
}
