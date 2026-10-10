import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import NotFound from './pages/NotFound';
import Login from './pages/Login';
import Landing from './pages/Landing';
import ChooseRegister from './pages/ChooseRegister';
import RegisterStudent from './pages/RegisterStudent';
import RegisterTeacher from './pages/RegisterTeacher';
import DashboardRedirect from './pages/DashboardRedirect';
import DashboardStudent from './pages/DashboardStudent';
import HomeStudent from './pages/HomeStudent';
import DashboardTeacher from './pages/DashboardTeacher';

import PrivateRouteByRole from './components/PrivateRouteByRole';

import { auth } from './firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

import '@fortawesome/fontawesome-free/css/all.min.css';
import './css/main.css';

// Componentes globales
import Navbar from './components/Navbar';
import Footer from './components/Footer';

function App() {
  const [user, loading] = useAuthState(auth);

  if (loading) return <p style={{ textAlign: 'center', marginTop: '50px' }}>Cargando...</p>;

  return (
    <Router>
      <Navbar />

      <Routes>
        {/* Rutas públicas */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/register" element={<ChooseRegister />} />
        <Route path="/register-student" element={!user ? <RegisterStudent /> : <Navigate to="/dashboard" />} />
        <Route path="/register-teacher" element={!user ? <RegisterTeacher /> : <Navigate to="/dashboard" />} />

        {/* Ruta para redireccionar según rol después del login/registro */}
        <Route path="/dashboard" element={user ? <DashboardRedirect /> : <Navigate to="/login" />} />

        {/* Rutas protegidas según rol */}
        <Route
          path="/dashboard-student"
          element={
            <PrivateRouteByRole role="student">
              <DashboardStudent />
            </PrivateRouteByRole>
          }
        />
        <Route path="/dashboard-student" element={<DashboardStudent />}>
          <Route path="home" element={<HomeStudent />} />
        </Route>
        <Route
          path="/dashboard-teacher"
          element={
            <PrivateRouteByRole role="teacher">
              <DashboardTeacher />
            </PrivateRouteByRole>
          }
        />
        

        {/* Ruta 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>

      <Footer />
    </Router>
  );
}

export default App;
