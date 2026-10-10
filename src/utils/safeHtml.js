// src/utils/safeHtml.js
//
// El contenido de las clases teóricas lo escribe el profesor y se muestra al
// estudiante como HTML. Antes se insertaba tal cual (XSS almacenado: un
// <img onerror=...> o <script> se ejecutaba en la sesión del estudiante).
// Ahora se sanea con DOMPurify y luego se convierten las URLs en enlaces.

import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
  'ul', 'ol', 'li', 'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];
const ALLOWED_ATTR = ['href', 'title', 'src', 'alt', 'colspan', 'rowspan'];
const SAFE_URI = /^(?:https?:|mailto:)/i;
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function linkifyTextNodes(root) {
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const targets = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('a')) continue;
    URL_RE.lastIndex = 0;
    if (URL_RE.test(node.nodeValue)) targets.push(node);
  }
  for (const textNode of targets) {
    const frag = doc.createDocumentFragment();
    const parts = textNode.nodeValue.split(URL_RE);
    parts.forEach((part, i) => {
      if (i % 2 === 1) {
        const a = doc.createElement('a');
        a.setAttribute('href', part);
        a.textContent = part;
        frag.appendChild(a);
      } else if (part) {
        frag.appendChild(doc.createTextNode(part));
      }
    });
    textNode.parentNode.replaceChild(frag, textNode);
  }
}

/** Devuelve HTML seguro para usar con dangerouslySetInnerHTML. */
export function renderLessonContent(content) {
  if (!content) return '';
  const fragment = DOMPurify.sanitize(String(content), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: SAFE_URI,
    RETURN_DOM_FRAGMENT: true,
  });

  linkifyTextNodes(fragment);

  fragment.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!SAFE_URI.test(href)) {
      a.removeAttribute('href');
      return;
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer nofollow');
  });

  fragment.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    if (!/^https:/i.test(src)) {
      img.remove();
      return;
    }
    img.setAttribute('loading', 'lazy');
    img.setAttribute('referrerpolicy', 'no-referrer');
  });

  const container = (fragment.ownerDocument || document).createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}
