import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './base.css';

// KB rule 24: listeners as a fallback for browsers that ignore the CSS.
const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
for (const type of ['selectstart', 'contextmenu'] as const) {
  document.addEventListener(type, (e) => {
    if (!editable(e.target)) e.preventDefault();
  });
}

// M0 placeholder screen. The title is a placeholder (PLAN.md D10); the look arrives with M2.
function App() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>City of Tomorrow (working title)</h1>
      <p>Scaffold only. The first playable battle is milestone M2.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
