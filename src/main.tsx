import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeUploads } from './utils/uploadMiddleware';
import { setupTestFirebase } from './examples/firebaseTestConfig';
import { ENV_FLAGS, USE_TEST_ENVIRONMENT } from './lib/firebaseConfig';

// Debug environment variables at startup
console.log('==== ENVIRONMENT CONFIG ====');
console.log('USE_TEST_ENVIRONMENT constant:', USE_TEST_ENVIRONMENT);
console.log('Using test Firebase:', ENV_FLAGS.useTestFirebase);
console.log('Using Firebase emulators:', ENV_FLAGS.useEmulators);
console.log('==========================');

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
