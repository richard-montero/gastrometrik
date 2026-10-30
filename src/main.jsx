import React from 'react';
import { createRoot } from 'react-dom/client';
import './estilos.css';
import { Arranque } from './GastroMetrik';

createRoot(document.getElementById('root')).render(<Arranque />);

/* App instalable en celular y computadora (PWA) */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
