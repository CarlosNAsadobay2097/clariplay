const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2/options");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ maxInstances: 10 });

// 📚 Notificar nuevos cursos a todos los estudiantes
exports.notifyNewCourse = onDocumentCreated("courses/{courseId}", async (event) => {
  const course = event.data.data();
  const courseId = event.params.courseId;

  try {
    const studentsSnapshot = await db.collection("users")
      .where("role", "==", "student")
      .get();

    if (studentsSnapshot.empty) {
      console.log('No hay estudiantes para notificar del nuevo curso.');
      return;
    }

    const batch = db.batch();
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24h

    studentsSnapshot.forEach((studentDoc) => {
      const notifRef = db.collection("notifications").doc();
      batch.set(notifRef, {
        userId: studentDoc.id,
        type: "newCourse",
        message: `Se ha creado un nuevo curso: "${course.title}"`,
        courseId: courseId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt
      });
    });

    const profNotifRef = db.collection("notifications").doc();
    batch.set(profNotifRef, {
      userId: course.createdBy,
      type: "newCourse",
      message: `Has creado el curso: "${course.title}"`,
      courseId: courseId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt
    });

    await batch.commit();
    console.log("✅ Notificaciones de nuevo curso creadas correctamente");
  } catch (error) {
    console.error("❌ Error creando notificaciones de nuevo curso:", error);
  }
});

// 🎼 Notificar nuevas lecciones a estudiantes inscritos
exports.notifyNewLesson = onDocumentCreated("lessons/{lessonId}", async (event) => {
  const lesson = event.data.data();
  const lessonId = event.params.lessonId;
  const courseId = lesson.courseId;
  const lessonTitle = lesson.title || 'Nueva lección';

  if (!courseId) {
    console.warn('La lección no tiene un courseId definido.');
    return;
  }

  try {
    const enrollmentsSnapshot = await db.collection("enrollments")
      .where("courseId", "==", courseId)
      .get();

    if (enrollmentsSnapshot.empty) {
      console.log(`No hay estudiantes inscritos en el curso ${courseId}`);
      return;
    }

    const batch = db.batch();
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)); // 24h

    enrollmentsSnapshot.forEach((enrollmentDoc) => {
      const studentId = enrollmentDoc.data().studentId;
      if (!studentId) return;

      const notifRef = db.collection("notifications").doc();
      batch.set(notifRef, {
        userId: studentId,
        type: "newLesson",
        message: `Se ha creado una nueva lección: "${lessonTitle}"`,
        lessonId: lessonId,
        courseId: courseId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt
      });
    });

    if (lesson.createdBy) {
      const profNotifRef = db.collection("notifications").doc();
      batch.set(profNotifRef, {
        userId: lesson.createdBy,
        type: "newLesson",
        message: `Has creado la lección: "${lessonTitle}"`,
        lessonId: lessonId,
        courseId: courseId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt
      });
    }

    await batch.commit();
    console.log("✅ Notificaciones de nueva lección creadas correctamente");
  } catch (error) {
    console.error("❌ Error creando notificaciones de nueva lección:", error);
  }
});

// 📝 Notificar calificaciones de lecciones grabadas
exports.notifyLessonGraded = onDocumentCreated("audioRecordings/{recordingId}", async (event) => {
  const recording = event.data.data();
  const {
    studentId,
    lessonId,
    courseId,
    score,
    feedback
  } = recording;

  if (!studentId || !lessonId || score === undefined) {
    console.warn("⚠️ Faltan datos clave para notificación de calificación.");
    return;
  }

  try {
    const lessonSnap = await db.collection("lessons").doc(lessonId).get();
    const lessonTitle = lessonSnap.exists ? lessonSnap.data().title : "una lección";

    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000)); // 48h
    const notifRef = db.collection("notifications").doc();

    await notifRef.set({
      userId: studentId,
      type: "newGrade",
      message: `Tienes una lección calificada: "${lessonTitle}".`,
      lessonId,
      courseId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt
    });

    console.log(`✅ Notificación de calificación enviada al estudiante ${studentId}`);
  } catch (error) {
    console.error("❌ Error creando notificación de calificación:", error);
  }
});

// ✅ Notificación al profesor cuando un estudiante se inscribe en su curso
exports.notifyEnrollmentToTeacher = onDocumentCreated("enrollments/{enrollmentId}", async (event) => {
  const enrollment = event.data.data();
  const { courseId, studentId } = enrollment;

  if (!courseId || !studentId) return;

  try {
    const courseSnap = await db.collection("courses").doc(courseId).get();
    if (!courseSnap.exists) return;

    const courseData = courseSnap.data();
    const teacherId = courseData.createdBy;
    const courseTitle = courseData.title || 'un curso';

    const studentSnap = await db.collection("users").doc(studentId).get();
    const studentName = studentSnap.exists
      ? `${studentSnap.data().firstName || 'Un'} ${studentSnap.data().lastName || 'estudiante'}`
      : 'Un estudiante';

    const notifRef = db.collection("notifications").doc();
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000)); // 48h

    await notifRef.set({
      userId: teacherId,
      type: "studentEnrolled",
      message: `${studentName} se ha inscrito en tu curso "${courseTitle}".`,
      courseId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt
    });

    console.log("✅ Notificación de inscripción enviada al profesor");
  } catch (error) {
    console.error("❌ Error en notificación de inscripción al profesor:", error);
  }
});

// ✅ Notificación al profesor cuando un estudiante sube una grabación
exports.notifyNewRecordingToTeacher = onDocumentCreated("audioRecordings/{recordingId}", async (event) => {
  const recording = event.data.data();
  const { studentId, lessonId, courseId } = recording;

  if (!studentId || !lessonId || !courseId) return;

  try {
    const lessonSnap = await db.collection("lessons").doc(lessonId).get();
    const lessonTitle = lessonSnap.exists ? lessonSnap.data().title : 'una lección';
    const teacherId = lessonSnap.exists ? lessonSnap.data().createdBy : null;
    if (!teacherId) return;

    const studentSnap = await db.collection("users").doc(studentId).get();
    const studentName = studentSnap.exists
      ? `${studentSnap.data().firstName || 'Un'} ${studentSnap.data().lastName || 'estudiante'}`
      : 'Un estudiante';

    const notifRef = db.collection("notifications").doc();
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 48 * 60 * 60 * 1000)); // 48h

    await notifRef.set({
      userId: teacherId,
      type: "recordingUploaded",
      message: `${studentName} ha subido una grabación para la lección "${lessonTitle}".`,
      courseId,
      lessonId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt
    });

    console.log("✅ Notificación de grabación enviada al profesor");
  } catch (error) {
    console.error("❌ Error en notificación de grabación al profesor:", error);
  }
});

// ✅ Notificación cuando un curso alcanza 10 estudiantes
exports.notifyCourseHit10 = onDocumentCreated("enrollments/{enrollmentId}", async (event) => {
  const enrollment = event.data.data();
  const { courseId } = enrollment;

  if (!courseId) return;

  try {
    const enrollmentsSnap = await db.collection("enrollments")
      .where("courseId", "==", courseId)
      .get();

    const total = enrollmentsSnap.size;

    if (total === 10) {
      const courseSnap = await db.collection("courses").doc(courseId).get();
      if (!courseSnap.exists) return;

      const courseData = courseSnap.data();
      const teacherId = courseData.createdBy;
      const courseTitle = courseData.title || 'tu curso';

      const notifRef = db.collection("notifications").doc();
      const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 72 * 60 * 60 * 1000)); // 72h

      await notifRef.set({
        userId: teacherId,
        type: "milestone",
        message: `🎉 ¡Felicidades! "${courseTitle}" ha alcanzado 10 estudiantes inscritos.`,
        courseId,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt
      });

      console.log("✅ Notificación de hito enviada al profesor");
    } else {
      console.log(`ℹ️ Curso ${courseId} tiene ${total} estudiantes. No se alcanzó el hito aún.`);
    }
  } catch (error) {
    console.error("❌ Error al verificar hito de curso:", error);
  }
});
