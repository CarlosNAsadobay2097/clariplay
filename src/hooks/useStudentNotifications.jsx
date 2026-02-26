import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc
} from 'firebase/firestore';
import { db } from '../firebase';
import { getAuth } from 'firebase/auth';

export default function useStudentNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date();

      // Filtrar notificaciones: solo las que no están leídas y no están expiradas (o no tienen expiresAt)
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(n => !n.read && (!n.expiresAt || n.expiresAt.toDate() > now));

      setNotifications(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Marcar una notificación como leída
  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
      // No hace falta actualizar estado local porque onSnapshot actualiza automáticamente
    } catch (error) {
      console.error('Error al marcar como leída:', error);
    }
  };

  // Agrupar notificaciones por tipo, para luego renderizar en secciones separadas si quieres
  const notificationsByType = notifications.reduce((acc, notif) => {
    const tipo = notif.type || 'otros'; // 'otros' para cualquier tipo no definido
    if (!acc[tipo]) acc[tipo] = [];
    acc[tipo].push(notif);
    return acc;
  }, {});

  return {
    notificationsByType,
    markAsRead,
    loading
  };
}
