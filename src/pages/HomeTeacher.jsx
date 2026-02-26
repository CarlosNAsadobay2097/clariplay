import React from 'react';
import useTeacherNotifications from '../hooks/useTeacherNotifications';

export default function HomeTeacher({ user }) {
  const { notificationsByType, markAsRead, loading } = useTeacherNotifications();

  if (!user || !user.firstName) {
    return (
      <div className="section-block">
        <p>Cargando perfil del profesor...</p>
      </div>
    );
  }

  const allNotifications = Object.values(notificationsByType).flat();
  const unreadNotifications = allNotifications.filter(n => !n.read);

  return (
    <div className="section-block">
      <h2>👋 Bienvenido/a, {user.firstName} {user.lastName}</h2>
      <p>Este es tu panel de profesor/a. Desde aquí podrás gestionar tus cursos y estudiantes.</p>

      <section className="teacher-notifications" style={{ marginTop: '2rem' }}>
        <h3>Notificaciones importantes</h3>

        {loading ? (
          <p>Cargando notificaciones...</p>
        ) : unreadNotifications.length === 0 ? (
          <p>No tienes nuevas notificaciones.</p>
        ) : (
          <ul className="notificaciones-lista">
            {unreadNotifications.map(note => (
              <li key={note.id} className="notificacion-item">
                <p>{note.message}</p>
                {note.createdAt && (
                  <span className="fecha">{note.createdAt.toDate().toLocaleDateString()}</span>
                )}
                <button
                  className="btn-mark-read"
                  onClick={() => markAsRead(note.id)}
                  aria-label="Marcar notificación como leída"
                >
                  ✔️
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
