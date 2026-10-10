import { readFileSync } from 'node:fs';
import { test, beforeAll, afterAll, beforeEach, describe } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs, Timestamp, increment, serverTimestamp } from 'firebase/firestore';

let env;
const DAY = 864e5;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-clariplay', firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8") } });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/t1'), { role: 'teacher', firstName: 'Andrea' });
    await setDoc(doc(db, 'users/t2'), { role: 'teacher' });
    await setDoc(doc(db, 'users/s1'), { role: 'student', firstName: 'Carlos' });
    await setDoc(doc(db, 'users/s2'), { role: 'student' });
    await setDoc(doc(db, 'courses/c1'), { title: 'Clarinete I', createdBy: 't1' });
    await setDoc(doc(db, 'courses/c2'), { title: 'Otro', createdBy: 't2' });
    await setDoc(doc(db, 'lessons/l1'), { courseId: 'c1', createdBy: 't1', type: 'practical', dueDate: Timestamp.fromMillis(Date.now() + 3 * DAY), deleted: false });
    await setDoc(doc(db, 'lessons/lold'), { courseId: 'c1', createdBy: 't1', type: 'practical', dueDate: Timestamp.fromMillis(Date.now() - DAY), deleted: false });
    await setDoc(doc(db, 'lessons/l2'), { courseId: 'c2', createdBy: 't2', type: 'practical', deleted: false });
    await setDoc(doc(db, 'enrollments/e1'), { courseId: 'c1', studentId: 's1' });
    await setDoc(doc(db, 'audioRecordings/legacy'), { courseId: 'c1', lessonId: 'l1', studentId: 's1', storagePath: 'x' });
    await setDoc(doc(db, 'audioRecordings/other'), { courseId: 'c2', lessonId: 'l2', studentId: 's2', storagePath: 'x', score: 7 });
    await setDoc(doc(db, 'notifications/n1'), { userId: 's1', read: false, message: 'hola' });
  });
});
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const rec = (lessonId, uid, attempt, extra = {}) => ({ studentId: uid, lessonId, courseId: 'c1', attempt, storagePath: 'p', createdAt: serverTimestamp(), ...extra });

describe('usuarios', () => {
  test('lee y edita su perfil', async () => {
    await assertSucceeds(getDoc(doc(as('s1'), 'users/s1')));
    await assertSucceeds(updateDoc(doc(as('s1'), 'users/s1'), { firstName: 'C.' }));
  });
  test('no puede cambiarse el rol a profesor', () => assertFails(updateDoc(doc(as('s1'), 'users/s1'), { role: 'teacher' })));
  test('no lee perfiles ajenos', () => assertFails(getDoc(doc(as('s1'), 'users/s2'))));
  test('registro con rol válido', () => assertSucceeds(setDoc(doc(as('new'), 'users/new'), { role: 'student', email: 'a@b.c' })));
  test('registro con rol inventado', () => assertFails(setDoc(doc(as('new'), 'users/new'), { role: 'admin' })));
  test('sin sesión no lee nada', () => assertFails(getDoc(doc(anon(), 'courses/c1'))));
});

describe('notificaciones', () => {
  test('lista las suyas', () => assertSucceeds(getDocs(query(collection(as('s1'), 'notifications'), where('userId', '==', 's1')))));
  test('marca como leída', () => assertSucceeds(updateDoc(doc(as('s1'), 'notifications/n1'), { read: true })));
  test('no puede cambiar el mensaje', () => assertFails(updateDoc(doc(as('s1'), 'notifications/n1'), { message: 'x' })));
  test('no lee las de otro', () => assertFails(getDoc(doc(as('s2'), 'notifications/n1'))));
  test('no crea notificaciones falsas', () => assertFails(addDoc(collection(as('s1'), 'notifications'), { userId: 's2', message: 'spam' })));
});

describe('cursos y lecciones', () => {
  test('profesor crea curso', () => assertSucceeds(addDoc(collection(as('t1'), 'courses'), { title: 'x', createdBy: 't1', teacherId: 't1' })));
  test('estudiante NO crea cursos', () => assertFails(addDoc(collection(as('s1'), 'courses'), { title: 'x', createdBy: 's1' })));
  test('no edita curso ajeno', () => assertFails(updateDoc(doc(as('t2'), 'courses/c1'), { title: 'hack' })));
  test('profesor crea lección en su curso', () => assertSucceeds(addDoc(collection(as('t1'), 'lessons'), { courseId: 'c1', createdBy: 't1', title: 'x', dueDate: null, deleted: false })));
  test('no crea lección en curso ajeno', () => assertFails(addDoc(collection(as('t1'), 'lessons'), { courseId: 'c2', createdBy: 't1' })));
  test('cambia fecha límite de su lección', () => assertSucceeds(updateDoc(doc(as('t1'), 'lessons/l1'), { dueDate: Timestamp.fromMillis(Date.now() + 9 * DAY) })));
  test('no mueve la lección a otro curso', () => assertFails(updateDoc(doc(as('t1'), 'lessons/l1'), { courseId: 'c2' })));
});

describe('inscripciones', () => {
  test('estudiante se inscribe', () => assertSucceeds(addDoc(collection(as('s2'), 'enrollments'), { courseId: 'c1', studentId: 's2', studentName: 'S2' })));
  test('no inscribe a otro', () => assertFails(addDoc(collection(as('s2'), 'enrollments'), { courseId: 'c1', studentId: 's1' })));
  test('profesor lista inscritos de su curso', () => assertSucceeds(getDocs(query(collection(as('t1'), 'enrollments'), where('courseId', '==', 'c1')))));
  test('otro profesor no los ve', () => assertFails(getDocs(query(collection(as('t2'), 'enrollments'), where('courseId', '==', 'c1')))));
  test('estudiante lista las suyas', () => assertSucceeds(getDocs(query(collection(as('s1'), 'enrollments'), where('studentId', '==', 's1')))));
  test('estudiante consulta si ya está inscrito', () => assertSucceeds(getDocs(query(collection(as('s1'), 'enrollments'), where('courseId', '==', 'c1'), where('studentId', '==', 's1')))));
  test('profesor quita estudiante', () => assertSucceeds(deleteDoc(doc(as('t1'), 'enrollments/e1'))));
});

describe('grabaciones', () => {
  test('estudiante lista sus envíos', () => assertSucceeds(getDocs(query(collection(as('s1'), 'audioRecordings'), where('studentId', '==', 's1')))));
  test('profesor lista envíos de su curso', () => assertSucceeds(getDocs(query(collection(as('t1'), 'audioRecordings'), where('studentId', '==', 's1'), where('courseId', '==', 'c1')))));
  test('estudiante NO ve grabaciones ajenas', () => assertFails(getDoc(doc(as('s1'), 'audioRecordings/other'))));
  test('envía su primer intento', () => assertSucceeds(setDoc(doc(as('s2'), 'audioRecordings/l1_s2_1'), rec('l1', 's2', 1))));
  test('no puede saltarse a intento 2', () => assertFails(setDoc(doc(as('s2'), 'audioRecordings/l1_s2_2'), rec('l1', 's2', 2))));
  test('no puede ponerse nota', () => assertFails(setDoc(doc(as('s2'), 'audioRecordings/l1_s2_1'), rec('l1', 's2', 1, { score: 10 }))));
  test('no puede enviar fuera de plazo', () => assertFails(setDoc(doc(as('s2'), 'audioRecordings/lold_s2_1'), rec('lold', 's2', 1))));
  test('no puede reenviar el mismo intento (sobrescribir)', async () => {
    await assertSucceeds(setDoc(doc(as('s2'), 'audioRecordings/l1_s2_1'), rec('l1', 's2', 1)));
    await assertFails(setDoc(doc(as('s2'), 'audioRecordings/l1_s2_1'), rec('l1', 's2', 1)));
  });
  test('profesor califica', () => assertSucceeds(updateDoc(doc(as('t1'), 'audioRecordings/legacy'), { score: 9, feedback: 'bien' })));
  test('profesor no altera otros campos', () => assertFails(updateDoc(doc(as('t1'), 'audioRecordings/legacy'), { studentId: 's2' })));
  test('profesor ajeno no califica (aunque cambie courseId)', () => assertFails(updateDoc(doc(as('t2'), 'audioRecordings/legacy'), { score: 0, courseId: 'c2' })));
  test('estudiante no se califica', () => assertFails(updateDoc(doc(as('s1'), 'audioRecordings/legacy'), { score: 10 })));
});

describe('plazos y reintentos', () => {
  const acc = (extra) => ({ lessonId: 'lold', studentId: 's2', courseId: 'c1', teacherId: 't1', updatedAt: serverTimestamp(), ...extra });
  test('profesor amplía plazo y el estudiante ya puede enviar', async () => {
    await assertSucceeds(setDoc(doc(as('t1'), 'lessonAccess/lold_s2'), acc({ dueDate: Timestamp.fromMillis(Date.now() + DAY) }), { merge: true }));
    await assertSucceeds(setDoc(doc(as('s2'), 'audioRecordings/lold_s2_1'), rec('lold', 's2', 1)));
  });
  test('profesor reabre (intento 2)', async () => {
    await assertSucceeds(setDoc(doc(as('s2'), 'audioRecordings/l1_s2_1'), rec('l1', 's2', 1)));
    await assertSucceeds(setDoc(doc(as('t1'), 'lessonAccess/l1_s2'), { ...acc({}), lessonId: 'l1', extraAttempts: increment(1) }, { merge: true }));
    await assertSucceeds(setDoc(doc(as('s2'), 'audioRecordings/l1_s2_2'), rec('l1', 's2', 2)));
    await assertFails(setDoc(doc(as('s2'), 'audioRecordings/l1_s2_3'), rec('l1', 's2', 3)));
  });
  test('estudiante no se da plazo a sí mismo', () => assertFails(setDoc(doc(as('s2'), 'lessonAccess/lold_s2'), acc({ teacherId: 's2', dueDate: Timestamp.fromMillis(Date.now() + DAY) }))));
  test('profesor ajeno no da plazo', () => assertFails(setDoc(doc(as('t2'), 'lessonAccess/lold_s2'), acc({ teacherId: 't2' }))));
  test('lecturas: estudiante y profesor', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'lessonAccess/l1_s1'), { lessonId: 'l1', studentId: 's1', courseId: 'c1', teacherId: 't1', extraAttempts: 1 }));
    await assertSucceeds(getDocs(query(collection(as('s1'), 'lessonAccess'), where('studentId', '==', 's1'))));
    await assertSucceeds(getDocs(query(collection(as('t1'), 'lessonAccess'), where('studentId', '==', 's1'), where('courseId', '==', 'c1'), where('teacherId', '==', 't1'))));
    await assertFails(getDocs(query(collection(as('s2'), 'lessonAccess'), where('studentId', '==', 's1'))));
  });
});
