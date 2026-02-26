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

export default function LessonsByCourse() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [courses, setCourses] = useState([]);
  const [lessonsByCourse, setLessonsByCourse] = useState({});
  const [selectedLesson, setSelectedLesson] = useState(null);

  const osmdContainerRef = useRef(null);
  const osmdInstanceRef = useRef(null);

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

    const osmd = new OpenSheetMusicDisplay(osmdContainerRef.current, {
      drawingParameters: 'compacttight',
      autoResize: true,
    });

    osmdInstanceRef.current = osmd;

    fetch(selectedLesson.xmlFileUrl)
      .then(res => res.text())
      .then(xml => osmd.load(xml))
      .then(() => osmd.render())
      .catch(err => {
        console.error("Error al renderizar partitura:", err);
      });
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
    <div>
      <h2>Mis Cursos y Lecciones</h2>

      {courses.length === 0 && <p>No tienes cursos creados.</p>}

      {courses.map(course => {
        const lessons = lessonsByCourse[course.id] || [];

        return (
          <div key={course.id} style={{ marginBottom: '2rem', border: '1px solid #ccc', padding: '1rem', borderRadius: '6px' }}>
            <h3>{course.title} — Nivel: {course.level} — Instrumento: {course.instrument}</h3>

            {lessons.length === 0 && <p>No hay lecciones en este curso.</p>}

            {lessons.map(lesson => (
              <div key={lesson.id} style={{ marginBottom: '1rem', padding: '0.5rem', background: '#f9f9f9', borderRadius: '4px' }}>
                <strong>{lesson.title}</strong> — Tipo: {lesson.type === 'practical' ? 'Práctica' : 'Teoría'}
                <p>{lesson.description}</p>

                <button
                  onClick={() => handleDeleteLesson(lesson.id, lesson.xmlFileUrl, lesson.imageUrl)}
                  style={{ marginRight: '0.5rem', backgroundColor: '#E51B23', color: 'white', border: 'none', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Eliminar
                </button>

                <button
                  onClick={() => setSelectedLesson(lesson)}
                  style={{ backgroundColor: '#1D1D1B', color: 'white', border: 'none', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Ver más
                </button>
              </div>
            ))}
          </div>
        );
      })}

      {/* Modal de detalle */}
      {selectedLesson && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            position: 'relative'
          }}>
            <h2>{selectedLesson.title}</h2>
            <p><strong>Tipo:</strong> {selectedLesson.type === 'practical' ? 'Práctica' : 'Teoría'}</p>
            <p>{selectedLesson.description}</p>

            {/* Partitura */}
            {selectedLesson.type === 'practical' && selectedLesson.xmlFileUrl && (
              <div style={{ marginTop: '1rem' }}>
                <h4>Partitura:</h4>
                <div ref={osmdContainerRef} style={{ width: '100%', overflowX: 'auto' }} />
              </div>
            )}

            {/* Imagen teórica */}
            {selectedLesson.type === 'theory' && selectedLesson.imageUrl && (
              <img src={selectedLesson.imageUrl} alt="Imagen teórica" style={{ maxWidth: '100%', borderRadius: '6px' }} />
            )}

            <button
              onClick={() => setSelectedLesson(null)}
              style={{
                maxWidth: '15%',
                marginTop: '1rem',
                backgroundColor: '#E51B23',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                position: 'absolute',
                top: '1rem',
                right: '1rem'
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
