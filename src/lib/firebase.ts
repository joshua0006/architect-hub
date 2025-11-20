import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  connectFirestoreEmulator,
  enableIndexedDbPersistence,
  getDocs,
  collection
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
// @ts-ignore - Import from local module without type declarations
import { FIREBASE_CONFIG, EMULATOR_PORTS, ENV_FLAGS } from './firebaseConfig';

// Global configuration flag - initialized from config
let useEmulators = ENV_FLAGS.useEmulators;

/**
 * Configure Firebase emulators
 * @param options Configuration options
 */
export function configureFirebase(options: {
  useEmulators?: boolean;
}) {
  if (options.useEmulators !== undefined) {
    useEmulators = options.useEmulators;
  }
  
  // Returning the current config is useful but we don't reinitialize Firebase here
  // That would require restarting the application
  return FIREBASE_CONFIG;
}

/**
 * Get current Firebase configuration
 */
export function getCurrentConfig() {
  // Check if any required fields are missing
  const requiredFields = ['apiKey', 'authDomain', 'projectId'];
  const missingFields = requiredFields.filter(field => {
    return !FIREBASE_CONFIG[field as keyof typeof FIREBASE_CONFIG];
  });
  
  if (missingFields.length > 0) {
    console.error(`[FIREBASE ERROR] Missing required Firebase configuration fields: ${missingFields.join(', ')}`);
    console.error('[FIREBASE ERROR] This may be due to environment variables not being properly loaded.');
    
    // Instead of hardcoded values, throw an error with clear instructions
    throw new Error(`
      Firebase configuration is missing required fields: ${missingFields.join(', ')}
      
      Please ensure your .env file or Netlify environment variables include:

      # Firebase Configuration Toggle
      VITE_FIREBASE_ACTIVE=old  # or 'new' for chris-cole-test project

      # Firebase Configuration (for old project)
      VITE_FIREBASE_API_KEY=your-api-key-here
      VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
      VITE_FIREBASE_PROJECT_ID=your-project-id
      VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
      VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
      VITE_FIREBASE_APP_ID=your-app-id
      VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id

      # Firebase Configuration (for new project - optional)
      VITE_FIREBASE_API_KEY_NEW=your-api-key-here
      VITE_FIREBASE_AUTH_DOMAIN_NEW=your-auth-domain
      # ... (see .env for full list)

      # Firebase Configuration Flags
      VITE_USE_FIREBASE_EMULATORS=false
      
      Make sure to restart your development server after creating/updating the environment variables.
    `);
  }
  
  return FIREBASE_CONFIG;
}

// Get Firebase config and check for required fields
const firebaseConfig = getCurrentConfig();

// Check for configuration errors before initializing Firebase
if (!firebaseConfig.apiKey) {
  console.error('[FIREBASE ERROR] API Key is missing. Firebase initialization will fail.');
  console.error('[FIREBASE ERROR] Make sure your environment variables are correctly set up with Firebase credentials.');
}

// Initialize Firebase with additional error handling
let app;
try {
  // Check if app is already initialized to avoid duplicate app error
  const existingApps = getApps();
  if (existingApps.length > 0) {
    app = existingApps[0];
  } else {
    app = initializeApp(firebaseConfig);
  }
} catch (error) {
  console.error('[FIREBASE ERROR] Failed to initialize Firebase app:', error);
  // Re-throw but with more helpful message
  throw new Error(`Firebase initialization failed. Check that your environment variables are correctly set: ${error}`);
}

// Initialize Firestore
export const db = getFirestore(app);

// Configure persistence (only in browser environment)
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db)
    .catch((err) => {
      if (err.code !== 'failed-precondition') {
        console.error('Persistence failed:', err.code);
      }
      // failed-precondition means persistence was already enabled or can't be enabled
    });
}

// Initialize other Firebase services
export const storage = getStorage(app);
export const auth = getAuth(app);

// Connect to emulators if enabled
if (useEmulators) {
  try {
    connectFirestoreEmulator(db, 'localhost', EMULATOR_PORTS.firestore);
    connectAuthEmulator(auth, `http://localhost:${EMULATOR_PORTS.auth}`);
    connectStorageEmulator(storage, 'localhost', EMULATOR_PORTS.storage);
  } catch (error) {
    console.error('Failed to connect to emulators:', error);
  }
}

export const checkFirestoreConnection = async () => {
  try {
    await getDocs(collection(db, 'shareTokens'));
  } catch (error) {
    console.error('Firestore connection failed:', error);
  }
};

export default app;