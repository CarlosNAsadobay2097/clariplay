import React from 'react';

function Footer() {
  return (
    <footer className="footer">
      <p>
        Designed and developed by <a href="https://ngindustry.example.com" target="_blank" rel="noopener noreferrer">NGIndustry</a>, 
        Created by <a href="https://linkedin.com/in/andreavelastegui" target="_blank" rel="noopener noreferrer">Andrea Velastegui</a>
      </p>
      <div className="social-icons">
        <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
          <i className="fab fa-facebook"></i>
        </a>
        <a href="https://www.instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
          <i className="fab fa-instagram"></i>
        </a>
        <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
          <i className="fab fa-youtube"></i>
        </a>
      </div>
    </footer>
  );
}

export default Footer;
