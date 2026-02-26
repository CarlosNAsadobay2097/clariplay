// src/components/StudentCourses.jsx
import React, { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

export default function StudentCourses() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [availableCourses, setAvailableCourses] = useState([]);
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar cursos disponibles
  useEffect(() => {
    if (!user) return;

    const loadCourses = async () => {
      setLoading(true);

      try {
        const coursesSnapshot = await getDocs(collection(db, 'courses'));
        const allCourses = coursesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        // Obtener inscripciones del estudiante
        const enrollQuery = query(
          collection(db, 'enrollments'),
          where('studentId', '==', user.uid)
        );
        const enrollSnapshot = await getDocs(enrollQuery);
        const enrolledCourseIds = enrollSnapshot.docs.map(doc => doc.data().courseId);

        // Separar cursos inscritos y disponibles
        const enrolled = allCourses.filter(course => enrolledCourseIds.includes(course.id));
        const available = allCourses.filter(course => !enrolledCourseIds.includes(course.id));

        setEnrolledCourses(enrolled);
        setAvailableCourses(available);
      } catch (error) {
        console.error('Error al cargar cursos:', error);
      }

      setLoading(false);
    };

    loadCourses();
  }, [user]);

  // ✅ Inscripción con nombre completo desde la colección `users`
  const handleEnroll = async (courseId) => {
    if (!user) {
      alert('Debes iniciar sesión para inscribirte');
      return;
    }

    try {
      const enrollRef = collection(db, 'enrollments');
      const q = query(
        enrollRef,
        where('courseId', '==', courseId),
        where('studentId', '==', user.uid)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        alert('Ya estás inscrito en este curso.');
        return;
      }

      // Obtener los datos del estudiante desde la colección 'users'
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) {
        alert('No se encontraron tus datos de perfil.');
        return;
      }

      const userData = userSnap.data();
      const fullName = `${userData.firstName} ${userData.lastName}`;

      await addDoc(enrollRef, {
        courseId,
        studentId: user.uid,
        studentName: fullName,
        studentEmail: userData.email || user.email || 'Sin correo',
        enrolledAt: new Date()
      });

      alert('Inscripción exitosa ✅');

      // Actualizar listas sin recargar todo
      const course = availableCourses.find(c => c.id === courseId);
      setEnrolledCourses(prev => [...prev, course]);
      setAvailableCourses(prev => prev.filter(c => c.id !== courseId));
    } catch (error) {
      console.error('Error al inscribirse:', error);
      alert('Error al inscribirse. Intenta de nuevo.');
    }
  };

  return (
    <div className="courses-section">
      <h2>Cursos Inscritos</h2>
      {loading && <p>Cargando cursos...</p>}
      <div className="course-list">
        {enrolledCourses.map((course) => (
          <div key={course.id} className="course-card enrolled">
            <h3>{course.title}</h3>
            <p><strong>Profesor:</strong> {course.teacherName || 'Profesor asignado'}</p>
            <p><strong>Instrumento:</strong> {course.instrument}</p>
            <p><strong>Nivel:</strong> {course.level}</p>
          </div>
        ))}
        {enrolledCourses.length === 0 && !loading && <p>No estás inscrito en ningún curso.</p>}
      </div>

      <h2 style={{ marginTop: '2rem' }}>Cursos Disponibles</h2>
      <div className="course-list">
        {availableCourses.map((course) => (
          <div key={course.id} className="course-card available">
            <h3>{course.title}</h3>
            <p><strong>Profesor:</strong> {course.teacherName || 'Profesor asignado'}</p>
            <p><strong>Instrumento:</strong> {course.instrument}</p>
            <p><strong>Nivel:</strong> {course.level}</p>
            <div className="course-buttons">
              <button className="enroll-btn" onClick={() => handleEnroll(course.id)}>
                Inscribirse
              </button>
              <button className="details-btn">
                Ver más
              </button>
            </div>
          </div>
        ))}
        {availableCourses.length === 0 && !loading && <p>No hay cursos disponibles en este momento.</p>}
      </div>
    </div>
  );
}
