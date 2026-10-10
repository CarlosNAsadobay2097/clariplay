import React, { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { db, storage } from '../firebase';
import ScoreEditor from '../components/ScoreEditor';  // ajusta la ruta según tu proyecto
import LessonsByCourse from '../components/LessonsByCourse'; // Ajusta la ruta si es necesario
import {
  readMusicXMLFile,
  musicXMLToUploadBlob,
  validateImageFile,
  MUSICXML_UPLOAD_METADATA,
  MUSICXML_STORAGE_FILENAME,
} from '../utils/musicxmlSecurity';

import {
  collection,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp
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
  const [fileError, setFileError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dueDate, setDueDate] = useState(''); // fecha límite opcional (datetime-local)


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

  // 🛡️ El MusicXML se valida y sanea ANTES de mostrarlo o subirlo.
  // Lo que se sube es el texto saneado, nunca el archivo original.
  const handleXmlChange = async (e) => {
    const file = e.target.files[0];
    setFileError('');
    setXmlFile(null);
    setXmlFileName('');
    setXmlContent(null);
    if (!file) return;

    try {
      const cleanXml = await readMusicXMLFile(file);
      setXmlFile(musicXMLToUploadBlob(cleanXml));
      setXmlFileName(file.name);
      setXmlContent(cleanXml);
    } catch (err) {
      setFileError(err.message || 'Archivo no válido');
      e.target.value = '';
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    setFileError('');
    setImageFile(null);
    setImagePreview(null);
    if (!file) return;

    try {
      await validateImageFile(file);
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      setFileError(err.message || 'Imagen no válida');
      e.target.value = '';
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
    if (submitting) return;
    setSubmitting(true);

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
        dueDate: type === 'practical' && dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
        deleted: false  // << nueva propiedad importante
      });


      const lessonId = lessonRef.id;
      let fileUrl = null;

      if (type === 'practical' && xmlFile) {
        // Nombre fijo: el nombre original del usuario no se usa en la ruta
        const filePath = `lessons/${courseId}/${lessonId}/${MUSICXML_STORAGE_FILENAME}`;
        const fileRef = ref(storage, filePath);
        await uploadBytes(fileRef, xmlFile, MUSICXML_UPLOAD_METADATA);
        fileUrl = await getDownloadURL(fileRef);
        await updateDoc(lessonRef, { xmlFileUrl: fileUrl });
      }

      if (type === 'theory') {
        const updates = { content };
        if (imageFile) {
          const { contentType, ext } = await validateImageFile(imageFile);
          const imgPath = `theoryImages/${courseId}/${lessonId}/image.${ext}`;
          const imgRef = ref(storage, imgPath);
          await uploadBytes(imgRef, imageFile, { contentType });
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
      setDueDate('');
      setXmlFile(null);
      setXmlFileName('');
      setImageFile(null);
      setImagePreview(null);
      setContent('');
      setXmlContent(null);
      setFileError('');
    } catch (error) {
      console.error('Error al crear la lección:', error);
      alert('Ocurrió un error al crear la lección ❌');
    } finally {
      setSubmitting(false);
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

        {/* Fecha límite (solo prácticas) */}
        {type === 'practical' && (
          <div className="form-group">
            <label>
              Fecha límite de entrega (opcional):
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <span className="muted-text">Podrás ampliarla o reabrir la lección a cada estudiante desde "Estudiantes".</span>
          </div>
        )}

        {/* Práctica */}
        {type === 'practical' && (
        <div className="score-viewer-container">
          <label>Archivo MusicXML:</label>
          <input
            type="file"
            accept=".xml,.musicxml,application/vnd.recordare.musicxml+xml,application/xml,text/xml"
            onChange={handleXmlChange}
          />
          {fileError && <p className="form-error" role="alert">{fileError}</p>}
          {xmlFileName && <p className="file-chip">Archivo seleccionado: <strong>{xmlFileName}</strong></p>}

          {xmlContent && (
            <div className="score-editor-wrapper">
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
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                onChange={handleImageChange}
              />
              {fileError && <p className="form-error" role="alert">{fileError}</p>}
              {imagePreview && (
                <div className="image-preview">
                  <p>Vista previa de imagen:</p>
                  <img
                    src={imagePreview}
                    alt="Preview"
                  />
                </div>
              )}
            </div>
          </>
        )}

        <button type="submit" className="submit-button" disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear lección'}
        </button>
      </form>
      <hr className="section-divider" />
      <LessonsByCourse />
    </div>
  );
};

export default CreateLessonForm;