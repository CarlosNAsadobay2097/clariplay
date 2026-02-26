import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function LessonsSection() {
  const [courses, setCourses] = useState([]);
  const [expandedCourseId, setExpandedCourseId] = useState(null);
  const [lessonsByCourse, setLessonsByCourse] = useState({});
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState('');

  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    async function fetchStudentCourses() {
      try {
        const enrollmentsQuery = query(
          collection(db, 'enrollments'),
          where('studentId', '==', user.uid)
        );
        const enrollSnapshot = await getDocs(enrollmentsQuery);

        const coursePromises = enrollSnapshot.docs.map(async (enrollDoc) => {
          const courseId = enrollDoc.data().courseId;
          const courseDoc = await getDoc(doc(db, 'courses', courseId));
          if (courseDoc.exists()) {
            return { id: courseId, title: courseDoc.data().title };
          }
          return null;
        });

        const fetchedCourses = (await Promise.all(coursePromises)).filter(Boolean);
        setCourses(fetchedCourses);
      } catch (error) {
        console.error('Error cargando cursos del estudiante:', error);
      }
    }

    fetchStudentCourses();
  }, [user]);

  async function loadLessons(courseId) {
    if (!user) return;

    try {
      const recordingsQuery = query(
        collection(db, 'audioRecordings'),
        where('studentId', '==', user.uid),
        where('courseId', '==', courseId)
      );
      const recordingsSnapshot = await getDocs(recordingsQuery);

      const lessonsData = await Promise.all(
        recordingsSnapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          const lessonDocRef = doc(db, 'lessons', data.lessonId);
          const lessonDoc = await getDoc(lessonDocRef);

          if (!lessonDoc.exists()) return null;

          const lessonData = lessonDoc.data();

          // ❌ Si está borrada o es clase teórica, la excluimos
          if (lessonData.deleted || lessonData.type === 'theory') return null;

          return {
            id: docSnap.id,
            lessonId: data.lessonId,
            title: lessonData.title ?? 'Lección sin título',
            score: data.score ?? '—',
            feedback: data.feedback ?? 'Sin feedback disponible',
          };
        })
      );

      const filteredLessons = lessonsData.filter(Boolean);

      setLessonsByCourse((prev) => ({
        ...prev,
        [courseId]: filteredLessons,
      }));
    } catch (error) {
      console.error('Error cargando lecciones entregadas:', error);
    }
  }


  function toggleCourse(courseId) {
    if (expandedCourseId === courseId) {
      setExpandedCourseId(null);
    } else {
      setExpandedCourseId(courseId);
      if (!lessonsByCourse[courseId]) {
        loadLessons(courseId);
      }
    }
  }

  const handleShowFeedback = (feedbackText) => {
    setCurrentFeedback(feedbackText);
    setShowFeedbackModal(true);
  };

  const handleCloseModal = () => {
    setShowFeedbackModal(false);
    setCurrentFeedback('');
  };

  return (
    <div className="lessons-section">
      <h2>Mis Calificaciones</h2>

      {courses.length === 0 && <p>No estás inscrito en ningún curso.</p>}

      {courses.map((course) => (
        <div key={course.id} className="course-block">
          <h3
            className="course-title"
            onClick={() => toggleCourse(course.id)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {course.title} {expandedCourseId === course.id ? '▲' : '▼'}
          </h3>

          {expandedCourseId === course.id && (
            <div className="table-responsive">
              <table className="school-grades">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Lección</th>
                    <th>Nota</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {lessonsByCourse[course.id]?.length > 0 ? (
                    lessonsByCourse[course.id].map((lesson, idx) => (
                      <tr key={lesson.id}>
                        <td>{idx + 1}</td>
                        <td>{lesson.title}</td>
                        <td>{lesson.score}</td>
                        <td>
                          <button
                            className="btn-feedback"
                            onClick={() => handleShowFeedback(lesson.feedback)}
                          >
                            Ver feedback
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center' }}>
                        No has enviado lecciones para este curso.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* Modal para feedback */}
      {showFeedbackModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Feedback del Profesor</h3>
            <p>{currentFeedback}</p>
            <button onClick={handleCloseModal} className="btn-ok">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
