// Archivo heredado de Create React App. Las pruebas reales están en
// src/utils/*.test.js (ejecuta: npm test).
import { test, expect } from 'vitest';
import { renderLessonContent } from './utils/safeHtml';

test('el contenido de las lecciones se muestra saneado', () => {
  expect(renderLessonContent('<b>ok</b><script>alert(1)</script>')).toBe('<b>ok</b>');
});
