import React, { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  doc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { getAuth } from 'firebase/auth';
import { serverTimestamp } from 'firebase/firestore';


export default function CoursesTeacherSection() {
  const [courses, setCourses] = useState([]);
  const [openCourseId, setOpenCourseId] = useState(null);
  const [studentsByCourse, setStudentsByCourse] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCourse, setNewCourse] = useState({ title: '', level: '', instrument: '' });

  const auth = getAuth();
  const user = auth.currentUser;

  // Cargar cursos del profesor autenticado
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'courses'), where('createdBy', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCourses(data);
    });

    return () => unsubscribe();
  }, [user]);

  const toggleCourse = async (courseId) => {
    if (openCourseId === courseId) {
      setOpenCourseId(null);
      return;
    }

    setOpenCourseId(courseId);

    if (studentsByCourse[courseId]) return;

    try {
      const q = query(
        collection(db, 'enrollments'),
        where('courseId', '==', courseId)
      );
      const snapshot = await getDocs(q);

      const students = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: data.studentId,
          enrollmentId: docSnap.id,
          name: data.studentName || 'Estudiante sin nombre',
          email: data.studentEmail || '—',
        };
      });

      setStudentsByCourse(prev => ({ ...prev, [courseId]: students }));
    } catch (error) {
      console.error('Error cargando estudiantes:', error);
    }
  };

  const handleDeleteEnrollment = async (enrollmentId) => {
    const confirm = window.confirm("¿Seguro que deseas quitar al estudiante del curso?");
    if (!confirm) return;

    try {
      await deleteDoc(doc(db, "enrollments", enrollmentId));
      alert("Estudiante eliminado correctamente ✅");

      if (openCourseId) {
        setStudentsByCourse(prev => {
          const updated = { ...prev };
          delete updated[openCourseId]; // forzar recarga
          return updated;
        });
        toggleCourse(openCourseId);
      }
    } catch (error) {
      console.error("Error eliminando inscripción:", error);
      alert("No se pudo eliminar al estudiante ❌");
    }
  };

  const toggleAddForm = () => setShowAddForm(prev => !prev);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewCourse(prev => ({ ...prev, [name]: value }));
  };

  const handleAddCourse = async (e) => {
    e.preventDefault();
    if (!user || !newCourse.title || !newCourse.level || !newCourse.instrument) {
      alert('Completa todos los campos');
      return;
    }

    try {
      await addDoc(collection(db, 'courses'), {
        ...newCourse,
        teacherId: user.uid,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      setNewCourse({ title: '', level: '', instrument: '' });
      setShowAddForm(false);
    } catch (err) {
      console.error('Error al guardar curso:', err);
      alert('Error al guardar curso');
    }
  };

  const handleDeleteCourse = async (courseId) => {
    const confirm = window.confirm('¿Estás seguro de que deseas eliminar este curso?');
    if (!confirm) return;

    try {
      await deleteDoc(doc(db, 'courses', courseId));
      alert('Curso eliminado correctamente ✅');
    } catch (error) {
      console.error('Error al eliminar curso:', error);
      alert('No se pudo eliminar el curso ❌');
    }
  };

  return (
    <div className="section-block">
      <h2>Mis Cursos</h2>

      <button onClick={toggleAddForm} style={{ marginBottom: '1rem' }}>
        {showAddForm ? 'Cancelar' : 'Agregar nuevo curso'}
      </button>

      {showAddForm && (
        <form onSubmit={handleAddCourse} className="add-course-form" style={{ marginBottom: '2rem' }}>
          <label>
            Título:
            <input type="text" name="title" value={newCourse.title} onChange={handleInputChange} />
          </label>
          <label>
            Nivel:
            <select name="level" value={newCourse.level} onChange={handleInputChange}>
              <option value="">Selecciona nivel</option>
              <option value="Principiante">Principiante</option>
              <option value="Intermedio">Intermedio</option>
              <option value="Avanzado">Avanzado</option>
            </select>
          </label>
          <label>
            Instrumento:
            <input type="text" name="instrument" value={newCourse.instrument} onChange={handleInputChange} />
          </label>
          <button type="submit">Agregar Curso</button>
        </form>
      )}

      <ul className="courses-list">
        {courses.map((course) => (
          <li key={course.id} className="course-item">
            <div className="course-header" onClick={() => toggleCourse(course.id)}>
              <strong>{course.title}</strong> — Nivel: {course.level} — Instrumento: {course.instrument}
              <span className="toggle-text">{openCourseId === course.id ? '▼ Ocultar' : '▶ Ver alumnos'}</span>
              <button onClick={() => handleDeleteCourse(course.id)} style={{ marginLeft: '1rem' }}>
                Eliminar curso
              </button>
            </div>

            {openCourseId === course.id && (
              <div className="students-table-wrapper">
                {studentsByCourse[course.id]?.length > 0 ? (
                  <table className="students-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th>Correo</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentsByCourse[course.id].map((student) => (
                        <tr key={student.id}>
                          <td>{student.name}</td>
                          <td>{student.email}</td>
                          <td>
                            <button
                              onClick={() => handleDeleteEnrollment(student.enrollmentId)}
                              style={{ color: 'red' }}
                            >
                              Quitar alumno
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No hay estudiantes inscritos aún.</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
