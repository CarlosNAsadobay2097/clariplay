// src/utils/musicxmlSecurity.js
//
// Validación y saneamiento de archivos MusicXML / XML antes de subirlos a
// Firebase Storage o de pasarlos a OpenSheetMusicDisplay.
//
// Riesgos que cubre:
//  - XXE / entidades externas y "billion laughs" (bloques <!DOCTYPE [...]> y <!ENTITY>)
//  - Hojas de estilo XSLT, XInclude, XHTML o <script> incrustados (XSS si el
//    archivo se abre directamente desde la URL de Storage)
//  - Archivos enormes o con millones de nodos (bloqueo del navegador)
//  - Archivos que no son MusicXML (u otros formatos renombrados a .xml)

export const MAX_MUSICXML_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_XML_ELEMENTS = 300000;
export const MUSICXML_EXTENSIONS = ['.xml', '.musicxml'];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_TYPES = {
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
};

// Hosts desde donde se permite descargar partituras para mostrarlas.
const TRUSTED_SCORE_HOSTS = ['firebasestorage.googleapis.com', 'storage.googleapis.com'];

export class UnsafeFileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeFileError';
  }
}

const VALID_ROOTS = new Set(['score-partwise', 'score-timewise']);

const FORBIDDEN_PATTERNS = [
  { re: /<!ENTITY/i, msg: 'El archivo declara entidades XML (<!ENTITY>), no está permitido.' },
  { re: /<\s*script\b/i, msg: 'El archivo contiene código <script>, no está permitido.' },
  {
    re: /xmlns(?::[\w.-]+)?\s*=\s*["']\s*http:\/\/www\.w3\.org\/(?:1999\/xhtml|2001\/XInclude|1999\/XSL\/Transform|2000\/svg)/i,
    msg: 'El archivo incluye espacios de nombres no permitidos (XHTML, SVG, XSLT o XInclude).',
  },
  { re: /\bjavascript\s*:/i, msg: 'El archivo contiene URLs "javascript:", no está permitido.' },
];

function byteLength(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str).length;
  return str.length;
}

function readBlob(blob, as) {
  if (as === 'text' && typeof blob.text === 'function') return blob.text();
  if (as === 'buffer' && typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    if (as === 'text') reader.readAsText(blob, 'utf-8');
    else reader.readAsArrayBuffer(blob);
  });
}

function hasExtension(name, list) {
  const lower = String(name || '').toLowerCase();
  return list.some(ext => lower.endsWith(ext));
}

/**
 * Valida y limpia el texto de un MusicXML.
 * Devuelve el XML sin declaraciones DOCTYPE, listo para OSMD o para subirlo.
 * Lanza UnsafeFileError si el contenido no es seguro o no es MusicXML válido.
 */
export function sanitizeMusicXML(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new UnsafeFileError('El archivo está vacío o no es texto.');
  }
  if (byteLength(raw) > MAX_MUSICXML_BYTES) {
    throw new UnsafeFileError('La partitura supera el tamaño máximo de 5 MB.');
  }

  // Quitar BOM
  let xml = raw.replace(/^﻿/, '');

  if (xml.includes('\u0000')) {
    throw new UnsafeFileError('El archivo parece binario (¿un .mxl comprimido?). Exporta la partitura como MusicXML sin comprimir (.musicxml o .xml).');
  }

  for (const { re, msg } of FORBIDDEN_PATTERNS) {
    if (re.test(xml)) throw new UnsafeFileError(msg);
  }

  // DOCTYPE: solo se acepta la forma simple (sin subconjunto interno "[...]")
  // y de todas formas se elimina, porque OSMD no la necesita.
  const doctypeRe = /<!DOCTYPE\b[^>]*>/gi;
  let match;
  while ((match = doctypeRe.exec(xml)) !== null) {
    if (match[0].includes('[')) {
      throw new UnsafeFileError('El archivo tiene un DOCTYPE con definiciones internas, no está permitido.');
    }
  }
  xml = xml.replace(doctypeRe, '');
  if (/<!DOCTYPE/i.test(xml)) {
    throw new UnsafeFileError('DOCTYPE mal formado.');
  }

  // Instrucciones de procesamiento: solo se permite la declaración <?xml ...?>
  const piRe = /<\?\s*([\w:.-]+)/g;
  while ((match = piRe.exec(xml)) !== null) {
    if (match[1].toLowerCase() !== 'xml' || match.index !== xml.search(/\S/)) {
      throw new UnsafeFileError('El archivo contiene instrucciones de procesamiento no permitidas.');
    }
  }

  if (typeof DOMParser === 'undefined') {
    throw new UnsafeFileError('No se puede validar el XML en este entorno.');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new UnsafeFileError('El XML está mal formado.');
  }

  const rootName = doc.documentElement?.nodeName;
  if (!VALID_ROOTS.has(rootName)) {
    throw new UnsafeFileError('El archivo no es una partitura MusicXML válida (score-partwise / score-timewise).');
  }

  if (doc.getElementsByTagName('*').length > MAX_XML_ELEMENTS) {
    throw new UnsafeFileError('La partitura es demasiado grande para procesarse.');
  }

  return xml;
}

/** Lee un File del input y devuelve el MusicXML ya saneado. */
export async function readMusicXMLFile(file) {
  if (!file) throw new UnsafeFileError('No se seleccionó ningún archivo.');
  if (!hasExtension(file.name, MUSICXML_EXTENSIONS)) {
    throw new UnsafeFileError('Solo se aceptan archivos .musicxml o .xml.');
  }
  if (file.size > MAX_MUSICXML_BYTES) {
    throw new UnsafeFileError('La partitura supera el tamaño máximo de 5 MB.');
  }
  const text = await readBlob(file, 'text');
  return sanitizeMusicXML(text);
}

/** Crea el Blob que se sube a Storage (nunca el archivo original). */
export function musicXMLToUploadBlob(cleanXml) {
  return new Blob([cleanXml], { type: 'text/plain;charset=utf-8' });
}

// Metadatos de subida: "text/plain" + "attachment" evita que el navegador
// interprete el XML (y cualquier script) si alguien abre la URL directamente.
export const MUSICXML_UPLOAD_METADATA = {
  contentType: 'text/plain;charset=utf-8',
  contentDisposition: 'attachment; filename="score.musicxml"',
  cacheControl: 'private, max-age=3600',
};
export const MUSICXML_STORAGE_FILENAME = 'score.musicxml';

/** Comprueba que la URL apunte a nuestro Firebase Storage por HTTPS. */
export function isTrustedScoreUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return TRUSTED_SCORE_HOSTS.includes(u.hostname) || u.hostname.endsWith('.firebasestorage.app');
  } catch {
    return false;
  }
}

/** Descarga una partitura desde Storage y la devuelve saneada. */
export async function fetchSafeMusicXML(url, { signal } = {}) {
  if (!isTrustedScoreUrl(url)) {
    throw new UnsafeFileError('La URL de la partitura no es de confianza.');
  }
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  if (!res.ok) throw new Error(`No se pudo descargar la partitura (HTTP ${res.status}).`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_MUSICXML_BYTES) {
    throw new UnsafeFileError('La partitura supera el tamaño máximo de 5 MB.');
  }
  const text = await res.text();
  return sanitizeMusicXML(text);
}

/**
 * Valida una imagen (PNG/JPG) por extensión, tipo MIME, tamaño y firma binaria.
 * Devuelve { contentType, ext } para construir un nombre de archivo seguro.
 */
export async function validateImageFile(file) {
  if (!file) throw new UnsafeFileError('No se seleccionó ninguna imagen.');
  const info = IMAGE_TYPES[file.type];
  if (!info) throw new UnsafeFileError('Solo se aceptan imágenes PNG o JPG.');
  if (!hasExtension(file.name, info.ext === 'png' ? ['.png'] : ['.jpg', '.jpeg'])) {
    throw new UnsafeFileError('La extensión de la imagen no coincide con su tipo.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new UnsafeFileError('La imagen supera el tamaño máximo de 5 MB.');
  }
  const head = new Uint8Array(await readBlob(file.slice(0, info.magic.length), 'buffer'));
  const ok = info.magic.every((b, i) => head[i] === b);
  if (!ok) throw new UnsafeFileError('El archivo no es una imagen válida.');
  return { contentType: file.type, ext: info.ext };
}
