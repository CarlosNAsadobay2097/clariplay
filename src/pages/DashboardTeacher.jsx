import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHome,
  faChalkboardTeacher,
  faBookOpen,
  faUsers,
  // faComments, // eliminado
  faUserCog,
  faAngleLeft,
  faAngleRight,
} from '@fortawesome/free-solid-svg-icons';

import Navbar from '../components/Navbar';

import HomeTeacher from './HomeTeacher';
import CoursesTeacherSection from './CoursesTeacherSection';
import CreateLessonsSection from './CreateLessonsSection';
import StudentsSection from './StudentsSection';
// import FeedbackSectionTeacher from './FeedbackSectionTeacher'; // eliminado
import ProfileSectionTeacher from './ProfileSectionTeacher';

export default function DashboardTeacher() {
  const [selectedSection, setSelectedSection] = useState('home');
  const [userData, setUserData] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Para móviles
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // Para escritorio

  useEffect(() => {
    document.body.classList.add('body-dashboard');

    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const docRef = doc(db, 'users', firebaseUser.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setUserData(docSnap.data());
        } else {
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
    });

    return () => {
      unsubscribe();
      document.body.classList.remove('body-dashboard');
    };
  }, []);

  const handleNavClick = (section) => {
    setSelectedSection(section);
    setIsSidebarOpen(false); // Cerrar menú en móvil
  };

  const renderContent = () => {
    if (!userData) {
      return (
        <div className="section-block">
          <p>Cargando datos del perfil...</p>
        </div>
      );
    }

    switch (selectedSection) {
      case 'home':
        return <HomeTeacher user={userData} />;
      case 'courses':
        return <CoursesTeacherSection />;
      case 'lessons':
        return <CreateLessonsSection />;
      case 'students':
        return <StudentsSection />;
      // case 'feedback':
      //   return <FeedbackSectionTeacher />; // eliminado
      case 'profile':
        return <ProfileSectionTeacher />;
      default:
        return null;
    }
  };

  return (
    <>
      <Navbar onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

      <div className="dashboard">
        <aside
          className={`menu-dashboard ${isSidebarOpen ? 'active' : ''} ${
            isSidebarCollapsed ? 'collapsed' : ''
          }`}
        >
          <h2 className="logo-dash">Clariplay</h2>
          <nav className="nav">
            <button onClick={() => handleNavClick('home')}>
              <FontAwesomeIcon icon={faHome} /> <span>Inicio</span>
            </button>
            <button onClick={() => handleNavClick('courses')}>
              <FontAwesomeIcon icon={faChalkboardTeacher} /> <span>Mis cursos</span>
            </button>
            <button onClick={() => handleNavClick('lessons')}>
              <FontAwesomeIcon icon={faBookOpen} /> <span>Crear lecciones</span>
            </button>
            <button onClick={() => handleNavClick('students')}>
              <FontAwesomeIcon icon={faUsers} /> <span>Estudiantes</span>
            </button>
            {/* Botón feedback eliminado */}
            <button onClick={() => handleNavClick('profile')}>
              <FontAwesomeIcon icon={faUserCog} /> <span>Perfil</span>
            </button>

            {/* Solo en escritorio */}
            <div className="collapse-toggle desktop-only">
              <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}>
                <FontAwesomeIcon icon={isSidebarCollapsed ? faAngleRight : faAngleLeft} />
              </button>
            </div>
          </nav>
        </aside>

        <main className="content">
          <h1 className="section-title">
            {{
              home: 'Inicio',
              courses: 'Mis cursos',
              lessons: 'Crear lecciones',
              students: 'Estudiantes',
              // feedback: 'Retroalimentación', // eliminado
              profile: 'Perfil',
            }[selectedSection]}
          </h1>
          <div className="section-content">{renderContent()}</div>
        </main>
      </div>
    </>
  );
}
