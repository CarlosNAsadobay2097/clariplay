import React, { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { db, storage } from '../firebase';
import ScoreEditor from '../components/ScoreEditor';  // ajusta la ruta según tu proyecto
import LessonsByCourse from '../components/LessonsByCourse'; // Ajusta la ruta si es necesario

import {
  collection,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';

const CreateLessonForm = () => {
  const [type, setType] = useState('practical');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [courseId, setCourseId] = useState('');
  const [xmlFile, setXmlFile] = useState(null);
  const [xmlFileName, setXmlFileName] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [content, setContent] = useState('');
  const [courses, setCourses] = useState([]);
  const [xmlContent, setXmlContent] = useState(null);


  // Cargar cursos del profesor
  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, 'courses'), where('createdBy', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedCourses = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      setCourses(fetchedCourses);
    });

    return () => unsubscribe();
  }, []);

  // Limpieza URL imagen preview para evitar fugas memoria
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleXmlChange = (e) => {
    const file = e.target.files[0];
    setXmlFile(file);
    setXmlFileName(file ? file.name : '');

    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setXmlContent(event.target.result);  // contenido XML en texto
      };
      reader.readAsText(file);
    } else {
      setXmlContent(null);
    }
  };


  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImageFile(file);
    if (file) {
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImagePreview(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title || !courseId) {
      alert('Título y curso son obligatorios');
      return;
    }

    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      alert('Debes estar autenticado');
      return;
    }

    try {
      // Crear documento base
      const lessonRef = await addDoc(collection(db, 'lessons'), {
        title,
        description,
        instructions,
        type,
        courseId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        deleted: false  // << nueva propiedad importante
      });


      const lessonId = lessonRef.id;
      let fileUrl = null;

      if (type === 'practical' && xmlFile) {
        const filePath = `lessons/${courseId}/${lessonId}/${xmlFile.name}`;
        const fileRef = ref(storage, filePath);
        await uploadBytes(fileRef, xmlFile, { contentType: 'application/xml' });
        fileUrl = await getDownloadURL(fileRef);
        await updateDoc(lessonRef, { xmlFileUrl: fileUrl });
      }

      if (type === 'theory') {
        const updates = { content };
        if (imageFile) {
          const imgPath = `theoryImages/${courseId}/${lessonId}/${imageFile.name}`;
          const imgRef = ref(storage, imgPath);
          await uploadBytes(imgRef, imageFile, { contentType: imageFile.type });
          const imgUrl = await getDownloadURL(imgRef);
          updates.imageUrl = imgUrl;
        }
        await updateDoc(lessonRef, updates);
      }

      alert('Lección creada correctamente ✅');
      // Reset
      setTitle('');
      setDescription('');
      setInstructions('');
      setCourseId('');
      setXmlFile(null);
      setXmlFileName('');
      setImageFile(null);
      setImagePreview(null);
      setContent('');
    } catch (error) {
      console.error('Error al crear la lección:', error);
      alert('Ocurrió un error al crear la lección ❌');
    }
  };

  return (
    <div className="form-container">
      <h2 className="form-title">Crear nueva lección</h2>

      <form className="lesson-form" onSubmit={handleSubmit}>
        {/* Tipo */}
        <div className="form-group">
          <label>Tipo de lección:</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="practical">Lección práctica</option>
            <option value="theory">Clase teórica</option>
          </select>
        </div>

        {/* Título */}
        <div className="form-group">
          <label>Título:</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Descripción */}
        <div className="form-group">
          <label>Descripción:</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Instrucciones */}
        <div className="form-group">
          <label>Instrucciones:</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </div>

        {/* Curso */}
        <div className="form-group">
          <label>Curso:</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">Selecciona un curso</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title} — {course.level} ({course.instrument})
              </option>
            ))}
          </select>
        </div>

        {/* Práctica */}
        {type === 'practical' && (
        <div className="score-viewer-container">
          <label>Archivo MusicXML:</label>
          <input
            type="file"
            accept=".xml,.musicxml"
            onChange={handleXmlChange}
          />
          {xmlFileName && <p>Archivo seleccionado: <strong>{xmlFileName}</strong></p>}

          {xmlContent && (
            <div style={{ marginTop: '1rem' }}>
              <ScoreEditor xmlContent={xmlContent} />
            </div>
          )}
        </div>
      )}



        {/* Teoría */}
        {type === 'theory' && (
          <>
            <div className="form-group">
              <label>Contenido (texto o HTML):</label>
              <textarea
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Imagen teórica (PNG/JPG):</label>
              <input
                type="file"
                accept=".png,.jpg,.jpeg"
                onChange={handleImageChange}
              />
              {imagePreview && (
                <div style={{ marginTop: '10px' }}>
                  <p>Vista previa de imagen:</p>
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '6px' }}
                  />
                </div>
              )}
            </div>
          </>
        )}

        <button type="submit" className="submit-button">
          Crear lección
        </button>
      </form>
      <hr style={{ margin: '2rem 0' }} />
      <LessonsByCourse />
    </div>
  );
};

export default CreateLessonForm;