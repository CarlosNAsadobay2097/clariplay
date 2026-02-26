import React, { useState } from 'react';
import useStudentNotifications from '../hooks/useStudentNotifications';

export default function HomeStudent({ user }) {
  const nombre = user?.firstName || 'Estudiante';
  const apellido = user?.lastName || '';
  const { notificationsByType, markAsRead, loading } = useStudentNotifications();

  const [hiddenIds, setHiddenIds] = useState(new Set());

  const tipos = {
    newCourse: 'Nuevos Cursos',
    newLesson: 'Nuevas Lecciones',
    newGrade: 'Nuevas Calificaciones',
    otros: 'Otras Notificaciones'
  };

  if (loading) return <p>Cargando notificaciones...</p>;

  const handleMarkAsRead = async (id) => {
    await markAsRead(id);
    setHiddenIds(prev => new Set(prev).add(id)); // Ocultar después de marcar como leída
  };

  return (
    <>
      <div className="home-welcome">
        <h2>Bienvenido {nombre} {apellido}</h2>
      </div>

      <div className="section-block">
        <h2>Notificaciones</h2>

        {Object.entries(tipos).map(([tipo, label]) => {
          const notifs = (notificationsByType[tipo] || []).filter(n => !hiddenIds.has(n.id));

          if (notifs.length === 0) return null; // No mostrar sección vacía

          return (
            <div key={tipo} className="notificacion-seccion">
              <h3>{label}</h3>
              <ul className="notificaciones-lista">
                {notifs.map(n => (
                  <li
                    key={n.id}
                    className={`notificacion-item ${n.read ? 'leida' : 'no-leida'}`}
                  >
                    <div className="notificacion-texto">
                      <p>{n.message || 'Sin mensaje'}</p>
                      <span className="fecha">{n.date || ''}</span>
                    </div>
                    {!n.read && (
                      <button
                        className="btn-mark-read"
                        onClick={() => handleMarkAsRead(n.id)}
                      >
                        Marcar como leída
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </>
  );
}
