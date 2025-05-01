import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeUploads } from './utils/uploadMiddleware';
import { setupTestFirebase } from './examples/firebaseTestConfig';
import { ENV_FLAGS } from './lib/firebaseConfig';

// Debug environment variables at startup
console.log('==== MAIN.TSX STARTUP ====');
console.log('Environment variables in main.tsx:');
console.log('VITE_USE_TEST_FIREBASE:', import.meta.env.VITE_USE_TEST_FIREBASE);
console.log('VITE_USE_FIREBASE_EMULATORS:', import.meta.env.VITE_USE_FIREBASE_EMULATORS);
console.log('ENV_FLAGS from firebaseConfig:', ENV_FLAGS);
console.log('==========================');

// Force the test configuration if needed (for debugging)
// Comment this out when not debugging
// ENV_FLAGS.useTestFirebase = true;
// ENV_FLAGS.useEmulators = true;

// Configure Firebase environment using values from environment variables
if (ENV_FLAGS.useTestFirebase) {
  setupTestFirebase();
  console.log('🧪 Using TEST Firebase environment');
} else {
  console.log('🚀 Using PRODUCTION Firebase environment');
}

// Global error handlers
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  // Prevent the default browser behavior 
  event.preventDefault();
});

// Initialize upload utilities
initializeUploads()
  .then(() => console.log('Upload utilities initialized'))
  .catch(err => console.warn('Failed to initialize upload utilities:', err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
