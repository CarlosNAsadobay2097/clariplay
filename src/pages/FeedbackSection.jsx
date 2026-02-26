export default function FeedbackSection() {
  const feedbackList = [
    {
      id: 1,
      lessonTitle: 'Lección 1: Introducción a la música',
      date: '2025-06-20',
      comment: 'Buen trabajo, solo revisa el tempo final.',
    },
    {
      id: 2,
      lessonTitle: 'Lección 2: Escalas y acordes',
      date: '2025-06-25',
      comment: 'Practica más escalas menores. Vas bien.',
    },
    {
      id: 3,
      lessonTitle: 'Lección 3: Lectura rítmica',
      date: '2025-06-27',
      comment: 'Excelente interpretación. Sigue así.',
    },
  ];

  return (
    <div className="section-block">
      <h2>Retroalimentación</h2>
      {feedbackList.map((item) => (
        <div key={item.id} className="feedback-card">
          <div className="feedback-header">
            <h3>📚 {item.lessonTitle}</h3>
            <span className="feedback-date">🗓️ {item.date}</span>
          </div>
          <p className="feedback-comment">💬 {item.comment}</p>
        </div>
      ))}
    </div>
  );
}
