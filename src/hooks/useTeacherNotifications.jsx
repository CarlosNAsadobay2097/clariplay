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

const ALLOWED_TYPES = ["studentEnrolled", "recordingUploaded", "milestone"];

export default function useTeacherNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const now = new Date();
        const data = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          // Filtrar por expiración y tipos permitidos
          .filter(n => (!n.expiresAt || n.expiresAt.toDate() > now) && ALLOWED_TYPES.includes(n.type));
        setNotifications(data);
        setLoading(false);
      },
      (error) => {
        console.error('Error cargando notificaciones:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (id) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (error) {
      console.error('Error al marcar notificación como leída:', error);
    }
  };

  const notificationsByType = notifications.reduce((acc, notif) => {
    const tipo = notif.type || 'otros';
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
