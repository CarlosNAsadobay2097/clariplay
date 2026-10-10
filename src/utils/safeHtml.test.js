import { describe, it, expect } from 'vitest';
import { renderLessonContent } from './safeHtml';

describe('renderLessonContent', () => {
  it('elimina scripts y manejadores de eventos', () => {
    const out = renderLessonContent('<p>Hola</p><script>alert(1)</script><img src="x" onerror="alert(1)">');
    expect(out).toContain('<p>Hola</p>');
    expect(out).not.toMatch(/script|onerror|alert/i);
  });
  it('elimina enlaces javascript:', () => {
    const out = renderLessonContent('<a href="javascript:alert(1)">clic</a>');
    expect(out).not.toMatch(/javascript/i);
  });
  it('convierte URLs de texto en enlaces seguros', () => {
    const out = renderLessonContent('Mira https://youtube.com/watch?v=1 ahora');
    expect(out).toContain('href="https://youtube.com/watch?v=1"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });
  it('no duplica enlaces que ya existen', () => {
    const out = renderLessonContent('<a href="https://a.com">https://a.com</a>');
    expect(out.match(/<a /g)).toHaveLength(1);
  });
  it('mantiene formato básico', () => {
    const out = renderLessonContent('<h2>Título</h2><ul><li><strong>uno</strong></li></ul>');
    expect(out).toBe('<h2>Título</h2><ul><li><strong>uno</strong></li></ul>');
  });
});
