import React, { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../firebase';
import ScoreViewer from '../components/ScoreViewer'; // Ajusta si está en otra ruta
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMusic } from '@fortawesome/free-solid-svg-icons';

// Función para subir audio y guardar metadata
async function handleAudioUpload(audioBlob, { userId, lessonId, courseId }) {
  if (!userId || !lessonId || !courseId) {
    throw new Error("Faltan datos para subir audio");
  }

  // Verificar si ya existe grabación
  const recordingsRef = collection(db, "audioRecordings");
  const q = query(
    recordingsRef,
    where("studentId", "==", userId),
    where("lessonId", "==", lessonId)
  );
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    throw new Error("Ya existe una grabación para esta lección");
  }

  // Subir archivo a Firebase Storage
  const filePath = `student-submissions/${courseId}/${lessonId}/${userId}/audio.webm`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, audioBlob, { contentType: "audio/webm" });

  // Guardar metadata en Firestore
  await addDoc(recordingsRef, {
    studentId: userId,
    lessonId,
    courseId,
    storagePath: filePath,
    createdAt: serverTimestamp(),
  });
}

function linkifyText(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, url => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}


export default function LessonsSection() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [courses, setCourses] = useState([]);
  const [lessonsByCourse, setLessonsByCourse] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedLessonId, setSelectedLessonId] = useState(null);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      try {
        // Obtener cursos del estudiante
        const enrollmentsQuery = query(
          collection(db, 'enrollments'),
          where('studentId', '==', user.uid)
        );
        const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
        const courseIds = enrollmentsSnapshot.docs.map(doc => doc.data().courseId);

        if (courseIds.length === 0) {
          setCourses([]);
          setLessonsByCourse({});
          setLoading(false);
          return;
        }

        // Obtener detalles de los cursos
        const coursesData = [];
        for (const courseId of courseIds) {
          const courseDoc = await getDoc(doc(db, 'courses', courseId));
          if (courseDoc.exists()) {
            const courseData = courseDoc.data();
            if (!courseData.deleted) { // ✅ Solo incluir cursos no eliminados
              coursesData.push({ id: courseId, ...courseData });
            }
          }
        }

        setCourses(coursesData);

        // Obtener lecciones por curso
        const lessonsMap = {};
        for (let i = 0; i < courseIds.length; i += 10) {
          const chunk = courseIds.slice(i, i + 10);
          const lessonsQuery = query(
            collection(db, 'lessons'),
            where('courseId', 'in', chunk)
          );
          const lessonsSnapshot = await getDocs(lessonsQuery);
            lessonsSnapshot.docs.forEach(docSnap => {
              const lesson = { id: docSnap.id, ...docSnap.data() };

              // ✅ Excluir lecciones marcadas como eliminadas
              if (lesson.deleted) return;

              if (!lessonsMap[lesson.courseId]) {
                lessonsMap[lesson.courseId] = [];
              }
              lessonsMap[lesson.courseId].push(lesson);
            });

        }

        setLessonsByCourse(lessonsMap);

      } catch (error) {
        console.error('Error al obtener datos:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  const toggleSelectedLesson = (id) => {
    setSelectedLessonId(prev => (prev === id ? null : id));
  };

  return (
    <div className="lessons-section-wrapper">
      <h2 className="lessons-section-title">
        <span><FontAwesomeIcon icon={faMusic} /></span> Mis Lecciones
      </h2>

      {loading && <p>Cargando lecciones...</p>}
      {!loading && courses.length === 0 && <p>No tienes lecciones disponibles.</p>}

      {courses.map(course => {
          const lessons = lessonsByCourse[course.id] || [];
          const practicalLessons = lessons.filter(lesson => lesson.type === 'practical');
          const theoryLessons = lessons.filter(lesson => lesson.type === 'theory');

          return (
            <div key={course.id} className="course-group">
              <h3 className="course-title">
                {course.title} — Nivel: {course.level} — Instrumento: {course.instrument}
              </h3>

              {/* Lecciones Prácticas */}
              {practicalLessons.length > 0 && (
                <>
                  <h4 className="text-lg font-semibold mb-2 mt-4 text-red-600">Lecciones Prácticas</h4>
                  <div className="lessons-section-grid">
                    {practicalLessons.map(lesson => {
                      const isSelected = selectedLessonId === lesson.id;
                      return (
                        <div className="lessons-card" key={lesson.id}>
                          <h4 className="lessons-card-title">{lesson.title}</h4>
                          <p><strong>Descripción:</strong> {lesson.description}</p>
                          <p><strong>Instrucciones:</strong> {lesson.instructions}</p>

                          {lesson.xmlFileUrl && (
                            <button
                              onClick={() => toggleSelectedLesson(lesson.id)}
                              className="lessons-card-button"
                            >
                              {isSelected ? 'Ocultar' : 'Ver partitura'}
                            </button>
                          )}

                          {isSelected && lesson.xmlFileUrl && (
                            <div className="lessons-card-score">
                              <ScoreViewer
                                xmlUrl={lesson.xmlFileUrl}
                                lessonId={lesson.id}
                                courseId={course.id}
                                userId={user.uid}
                                onAudioUploaded={(audioBlob) =>
                                  handleAudioUpload(audioBlob, {
                                    userId: user.uid,
                                    lessonId: lesson.id,
                                    courseId: course.id,
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Clases Teóricas */}
              {theoryLessons.length > 0 && (
                <>
                  <h4 className="text-lg font-semibold mb-2 mt-6 text-green-700">Clases Teóricas</h4>
                  <div className="lessons-section-grid">
                    {theoryLessons.map(lesson => {
                      const isSelected = selectedLessonId === lesson.id;
                      return (
                        <div className="lessons-card" key={lesson.id}>
                          <h4 className="lessons-card-title">{lesson.title}</h4>
                          <p><strong>Descripción:</strong> {lesson.description}</p>
                          <p><strong>Instrucciones:</strong> {lesson.instructions}</p>

                          {(lesson.imageUrl || lesson.content) && (
                            <button
                              onClick={() => toggleSelectedLesson(lesson.id)}
                              className="lessons-card-button"
                            >
                              {isSelected ? 'Ocultar' : 'Ver contenido'}
                            </button>
                          )}

                          {isSelected && (
                            <div className="lessons-card-score">
                              {lesson.imageUrl && (
                                <img
                                  src={lesson.imageUrl}
                                  alt="Infografía"
                                  className="lessons-card-image"
                                />
                              )}
                              {lesson.content && (
                                <div
                                  className="lessons-card-content prose max-w-none mt-2"
                                  dangerouslySetInnerHTML={{ __html: linkifyText(lesson.content) }}
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

    </div>
  );
}
