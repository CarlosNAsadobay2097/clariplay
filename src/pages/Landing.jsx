import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/Logo_6.svg';
import aboutImage from '../assets/about-image.jpg';

function Landing() {
  useEffect(() => {
    // Quita clase del dashboard si existe
    document.body.classList.remove('body-dashboard');
    document.body.classList.add('body-landing');

    return () => {
      document.body.classList.remove('body-landing');
    };
  }, []);

  return (
    <div className="landing">
      <div className="hero">
        <div className="hero-content">
          <img src={logo} alt="Clariplay Logo" className="hero-logo" />
          <p>Una nueva forma de aprender, practicar y compartir música.</p>
          <Link to="/register" className="cta-button">Empieza ahora</Link>
        </div>
      </div>

      <section className="about">
        <h2>¿Qué es Clariplay?</h2>
        <img src={aboutImage} alt="Sobre Clariplay" className="about-image" />
        <p>
          Clariplay es una plataforma educativa donde estudiantes y profesores de música pueden compartir
          lecciones, partituras interactivas y grabaciones para retroalimentación directa.
        </p>
        <ul className="features-list">
          <li><i className="fas fa-music"></i><span>Editor de partituras fácil de usar</span></li>
          <li><i className="fas fa-headphones-alt"></i><span>Graba tu interpretación desde la plataforma</span></li>
          <li><i className="fas fa-chalkboard-teacher"></i><span>Recibe calificaciones y consejos reales</span></li>
        </ul>
      </section>

      <section className="video-section">
        <h2>Conoce más</h2>
        <div className="video-container">
          <iframe
            width="100%"
            height="415"
            src="https://www.youtube.com/embed/JRy1fz2MOPk?si=FXn1oy1W3Xnh9eTc"
            title="Presentación Clariplay"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </section>
    </div>
  );
}

export default Landing;
