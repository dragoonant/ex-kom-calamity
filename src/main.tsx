import './base.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './client/App';
import { Gallery } from './client/Gallery';

// Rule 24 fallback: no text selection or callout on a long press, except where someone types.
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
document.addEventListener('selectstart', (e) => { if (!typing(e.target)) e.preventDefault(); });
document.addEventListener('contextmenu', (e) => { if (!typing(e.target)) e.preventDefault(); });

const gallery = new URLSearchParams(location.search).has('gallery');
createRoot(document.getElementById('root')!).render(gallery ? <Gallery /> : <App />);
