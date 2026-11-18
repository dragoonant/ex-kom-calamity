import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './base.css';
import './styles.css';
import { App } from './client/App';

// KB rule 24: listeners as a fallback for browsers that ignore the CSS.
const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
for (const type of ['selectstart', 'contextmenu'] as const) {
  document.addEventListener(type, (e) => {
    if (!editable(e.target)) e.preventDefault();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
