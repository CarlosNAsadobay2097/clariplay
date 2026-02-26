import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { auth, db } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. Autenticar usuario
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      // 2. Obtener rol del usuario desde Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const role = userDocSnap.data().role;

        // 3. Navegar según rol
        if (role === 'student') {
          navigate('/dashboard-student');
        } else if (role === 'teacher') {
          navigate('/dashboard-teacher');
        } else {
          setError('Rol desconocido. Contacta al administrador.');
        }
      } else {
        setError('No se encontró la información del usuario.');
      }
    } catch (err) {
      setError('Error al iniciar sesión: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container-login">
      <h2>Iniciar Sesión</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
      <p>
        ¿No tienes cuenta? <Link to="/register">Regístrate aquí</Link>
      </p>
    </div>
  );
}
