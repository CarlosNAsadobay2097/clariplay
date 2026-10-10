import { describe, it, expect } from 'vitest';
import {
  sanitizeMusicXML,
  UnsafeFileError,
  isTrustedScoreUrl,
  readMusicXMLFile,
  validateImageFile,
} from './musicxmlSecurity';

const VALID = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part>
</score-partwise>`;

describe('sanitizeMusicXML', () => {
  it('acepta un MusicXML normal y quita el DOCTYPE', () => {
    const out = sanitizeMusicXML(VALID);
    expect(out).not.toMatch(/DOCTYPE/i);
    expect(out).toContain('<score-partwise');
  });

  it('acepta BOM al inicio', () => {
    expect(() => sanitizeMusicXML('﻿' + VALID)).not.toThrow();
  });

  const attacks = {
    'XXE con entidad externa': `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><score-partwise>&xxe;</score-partwise>`,
    'billion laughs': `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><score-partwise>&lol2;</score-partwise>`,
    'entity en minúsculas': `<!doctype x [<!entity a "b">]><score-partwise/>`,
    'DOCTYPE con subconjunto interno sin ENTITY': `<!DOCTYPE score-partwise [<!ELEMENT a ANY>]><score-partwise/>`,
    'script incrustado': `<score-partwise><script>alert(1)</script></score-partwise>`,
    'XHTML namespace': `<score-partwise><x:div xmlns:x="http://www.w3.org/1999/xhtml">hi</x:div></score-partwise>`,
    'XInclude': `<score-partwise xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///etc/passwd"/></score-partwise>`,
    'xml-stylesheet': `<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="evil.xsl"?><score-partwise/>`,
    'javascript: URL': `<score-partwise><credit><link href="javascript:alert(1)"/></credit></score-partwise>`,
    'no es MusicXML': `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>`,
    'html disfrazado': `<html><body><img src=x onerror=alert(1)></body></html>`,
    'XML mal formado': `<score-partwise><part>`,
    'binario (mxl)': 'PK\u0003\u0004\u0000\u0000garbage',
    'vacío': '   ',
  };

  for (const [name, payload] of Object.entries(attacks)) {
    it(`rechaza: ${name}`, () => {
      expect(() => sanitizeMusicXML(payload)).toThrow(UnsafeFileError);
    });
  }

  it('rechaza archivos de más de 5 MB', () => {
    const big = '<score-partwise>' + 'a'.repeat(5 * 1024 * 1024) + '</score-partwise>';
    expect(() => sanitizeMusicXML(big)).toThrow(/5 MB/);
  });
});

describe('readMusicXMLFile', () => {
  it('rechaza extensiones que no son .xml/.musicxml', async () => {
    const f = new File([VALID], 'evil.html', { type: 'text/html' });
    await expect(readMusicXMLFile(f)).rejects.toThrow(UnsafeFileError);
  });
  it('lee un .musicxml válido', async () => {
    const f = new File([VALID], 'tema.musicxml', { type: 'application/xml' });
    await expect(readMusicXMLFile(f)).resolves.toContain('score-partwise');
  });
});

describe('isTrustedScoreUrl', () => {
  it('solo permite Firebase Storage por https', () => {
    expect(isTrustedScoreUrl('https://firebasestorage.googleapis.com/v0/b/x/o/a?alt=media')).toBe(true);
    expect(isTrustedScoreUrl('https://clariplay-86df4.firebasestorage.app/a')).toBe(true);
    expect(isTrustedScoreUrl('http://firebasestorage.googleapis.com/a')).toBe(false);
    expect(isTrustedScoreUrl('https://evil.com/a.xml')).toBe(false);
    expect(isTrustedScoreUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('validateImageFile', () => {
  it('acepta un PNG real', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    const f = new File([png], 'a.png', { type: 'image/png' });
    await expect(validateImageFile(f)).resolves.toEqual({ contentType: 'image/png', ext: 'png' });
  });
  it('rechaza un HTML renombrado a .png', async () => {
    const f = new File(['<script>alert(1)</script>'], 'a.png', { type: 'image/png' });
    await expect(validateImageFile(f)).rejects.toThrow(UnsafeFileError);
  });
  it('rechaza SVG', async () => {
    const f = new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' });
    await expect(validateImageFile(f)).rejects.toThrow(UnsafeFileError);
  });
});
