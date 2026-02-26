import { useEffect, useState } from 'react';
import { getAuth, updateEmail, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function ProfileSection() {
  const auth = getAuth();
  const [userData, setUserData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    courses: [],
    level: '',
    instrument: '',
    goal: '',
    emailVerified: false,
  });
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    level: '',
    instrument: '',
    goal: '',
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserData({
            ...data,
            email: user.email || '',
            emailVerified: user.emailVerified,
          });
          setFormData({
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            email: user.email || '',
            level: data.level || '',
            instrument: data.instrument || '',
            goal: data.goal || '',
          });
        }
      }
    });

    return () => unsubscribe();
  }, [auth]);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        firstName: formData.firstName,
        lastName: formData.lastName,
        level: formData.level,
        instrument: formData.instrument,
        goal: formData.goal,
      });

      if (formData.email !== user.email) {
        await updateEmail(user, formData.email);
      }

      setUserData((prev) => ({
        ...prev,
        ...formData,
      }));
      setEditing(false);
    } catch (error) {
      console.error('Error actualizando perfil:', error);
      alert('Ocurrió un error al actualizar tu perfil. Intenta nuevamente.');
    }
  };

  return (
    <div className="section-block">
      <h2>Perfil del Estudiante 👤</h2>

      <div className="profile-info">
        <label>
          Nombre:
          <input
            type="text"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            disabled={!editing}
          />
        </label>

        <label>
          Apellido:
          <input
            type="text"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            disabled={!editing}
          />
        </label>

        <label>
          Correo electrónico:
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            disabled={!editing}
          />
          {!userData.emailVerified && (
            <span style={{ color: 'orange', fontSize: '0.9rem' }}>
              (Correo no verificado)
            </span>
          )}
        </label>

        <label>
          Nivel musical:
          <select
            name="level"
            value={formData.level}
            onChange={handleChange}
            disabled={!editing}
          >
            <option value="">Selecciona una opción</option>
            <option value="Principiante">Principiante</option>
            <option value="Intermedio">Intermedio</option>
            <option value="Avanzado">Avanzado</option>
          </select>
        </label>

        <label>
          Instrumento principal:
          <input
            type="text"
            name="instrument"
            value={formData.instrument}
            onChange={handleChange}
            disabled={!editing}
          />
        </label>

        <label>
          Objetivo musical:
          <input
            type="text"
            name="goal"
            value={formData.goal}
            onChange={handleChange}
            disabled={!editing}
            placeholder="Ej. Quiero tocar en una banda, mejorar técnica, etc."
          />
        </label>

        <div className="profile-actions">
          {!editing ? (
            <button onClick={() => setEditing(true)}>Editar perfil</button>
          ) : (
            <>
              <button onClick={handleSave}>Guardar cambios</button>
              <button onClick={() => setEditing(false)}>Cancelar</button>
            </>
          )}
        </div>
      </div>

      <div className="danger-zone" style={{ marginTop: '2rem' }}>
        <h4>⚠️ Eliminar cuenta</h4>
        <button className="delete-account-btn" disabled>
          Eliminar mi cuenta
        </button>
        <p style={{ fontSize: '0.9rem', color: '#666' }}>
          (Esta función aún no está habilitada por seguridad).
        </p>
      </div>
    </div>
  );
}