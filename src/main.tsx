import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeUploads } from './utils/uploadMiddleware';

// Initialize upload utilities
initializeUploads()
  .then(() => console.log('Upload utilities initialized'))
  .catch(err => console.warn('Failed to initialize upload utilities:', err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
