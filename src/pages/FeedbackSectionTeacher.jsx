import React, { useState } from 'react';

export default function FeedbackSectionTeacher() {
  const initialFeedbackData = {
    c1: {
      title: 'Curso de Guitarra Básica',
      students: [
        {
          id: 's1',
          name: 'Ana',
          feedback: {
            'Lección 1': 'Muy buena ejecución.',
            'Lección 2': '',
          },
        },
        {
          id: 's2',
          name: 'Luis',
          feedback: {
            'Lección 1': '',
            'Lección 2': '',
          },
        },
      ],
    },
    c2: {
      title: 'Teoría Musical Intermedia',
      students: [
        {
          id: 's3',
          name: 'Carlos',
          feedback: {
            'Lección 1': '',
          },
        },
      ],
    },
  };

  const [expandedCourse, setExpandedCourse] = useState(null);
  const [feedbackData, setFeedbackData] = useState(initialFeedbackData);
  // Estado temporal para editar feedback sin afectar el original hasta guardar
  const [editBuffer, setEditBuffer] = useState({}); // { studentId: { lesson: comment, ... }, ... }

  const toggleCourse = (courseId) => {
    setExpandedCourse(expandedCourse === courseId ? null : courseId);
  };

  const handleInputChange = (studentId, lesson, value) => {
    setEditBuffer((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [lesson]: value,
      },
    }));
  };

  const handleActualizar = (courseId, studentId) => {
    // Reinicia el buffer con los valores actuales en feedbackData
    const student = feedbackData[courseId].students.find((s) => s.id === studentId);
    setEditBuffer((prev) => ({
      ...prev,
      [studentId]: { ...student.feedback },
    }));
  };

  const handleGuardar = (courseId, studentId) => {
    if (!editBuffer[studentId]) return;

    setFeedbackData((prev) => {
      const course = prev[courseId];
      const updatedStudents = course.students.map((student) =>
        student.id === studentId
          ? { ...student, feedback: { ...editBuffer[studentId] } }
          : student
      );
      return {
        ...prev,
        [courseId]: {
          ...course,
          students: updatedStudents,
        },
      };
    });

    // Opcional: limpiar buffer o dejarlo como está
    setEditBuffer((prev) => {
      const copy = { ...prev };
      delete copy[studentId];
      return copy;
    });
  };

  return (
    <div className="section-block student-feedback-section">
      <h2>Retroalimentación por Lección</h2>
      <p>Envía comentarios personalizados a tus estudiantes según su progreso en cada lección.</p>

      <div className="student-feedback-cards">
        {Object.entries(feedbackData).map(([courseId, course]) => (
          <div key={courseId} className="student-feedback-card">
            <div className="student-feedback-header" onClick={() => toggleCourse(courseId)}>
              <h3>{course.title}</h3>
              <button className="student-toggle-btn">
                {expandedCourse === courseId ? 'Ocultar' : 'Ver estudiantes'}
              </button>
            </div>

            {expandedCourse === courseId && (
              <div className="student-feedback-list">
                {course.students.map((student) => {
                  // El feedback que se muestra es el buffer si existe, si no, el original
                  const currentFeedback = editBuffer[student.id] || student.feedback;

                  return (
                    <div key={student.id} className="student-feedback-item">
                      <strong>{student.name}</strong>
                      <ul className="lesson-feedback-list">
                        {Object.entries(currentFeedback).map(([lesson, comment]) => (
                          <li key={lesson} className="lesson-feedback-item">
                            <span>{lesson}:</span>
                            <input
                              type="text"
                              value={comment}
                              onChange={(e) =>
                                handleInputChange(student.id, lesson, e.target.value)
                              }
                              placeholder="Escribe tu comentario"
                            />
                          </li>
                        ))}
                      </ul>
                      <div className="edit-grades-buttons">
                        <button
                          className="student-btn update"
                          onClick={() => handleActualizar(courseId, student.id)}
                        >
                          Actualizar
                        </button>
                        <button
                          className="student-btn save"
                          onClick={() => handleGuardar(courseId, student.id)}
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
