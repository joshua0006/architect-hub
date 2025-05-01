import { initializeApp } from 'firebase/app';
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
import { FIREBASE_CONFIG, EMULATOR_PORTS, FirebaseConfig, ENV_FLAGS } from './firebaseConfig';

// Global configuration flags - initialized from config
let useTestConfig = ENV_FLAGS.useTestFirebase;
let useEmulators = ENV_FLAGS.useEmulators;

/**
 * Configure Firebase to use either production or test environment
 * @param options Configuration options
 */
export function configureFirebase(options: {
  useTestProject?: boolean;
  useEmulators?: boolean;
}) {
  if (options.useTestProject !== undefined) {
    useTestConfig = options.useTestProject;
  }
  
  if (options.useEmulators !== undefined) {
    useEmulators = options.useEmulators;
  }
  
  console.log(`Firebase configuration:
    - Using ${useTestConfig ? 'TEST' : 'PRODUCTION'} project
    - Emulators ${useEmulators ? 'ENABLED' : 'DISABLED'}
  `);
  
  // Returning the current config is useful but we don't reinitialize Firebase here
  // That would require restarting the application
  return getCurrentConfig();
}

/**
 * Get current Firebase configuration
 */
export function getCurrentConfig(): FirebaseConfig {
  // Get the appropriate configuration based on our flag
  const config = useTestConfig ? FIREBASE_CONFIG.test : FIREBASE_CONFIG.production;
  
  // Check if any required fields are missing
  const requiredFields = ['apiKey', 'authDomain', 'projectId'];
  const missingFields = requiredFields.filter(field => {
    return !config[field as keyof typeof config];
  });
  
  if (missingFields.length > 0) {
    console.error(`[FIREBASE ERROR] Missing required Firebase configuration fields: ${missingFields.join(', ')}`);
    console.error('[FIREBASE ERROR] This may be due to environment variables not being properly loaded.');
    console.error('[FIREBASE ERROR] Check that your .env file exists and contains the required values.');
    
    // Instead of hardcoded values, throw an error with clear instructions
    throw new Error(`
      Firebase configuration is missing required fields: ${missingFields.join(', ')}
      
      Please ensure your .env file exists with the following variables:
      
      # Firebase Production Configuration
      VITE_FIREBASE_API_KEY=your-api-key-here
      VITE_FIREBASE_AUTH_DOMAIN=your-auth-domain
      VITE_FIREBASE_PROJECT_ID=your-project-id
      VITE_FIREBASE_STORAGE_BUCKET=your-storage-bucket
      VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
      VITE_FIREBASE_APP_ID=your-app-id
      
      # Firebase Test Configuration (if using test environment)
      VITE_TEST_FIREBASE_API_KEY=your-test-api-key
      VITE_TEST_FIREBASE_AUTH_DOMAIN=your-test-auth-domain
      VITE_TEST_FIREBASE_PROJECT_ID=your-test-project-id
      VITE_TEST_FIREBASE_STORAGE_BUCKET=your-test-storage-bucket
      VITE_TEST_FIREBASE_MESSAGING_SENDER_ID=your-test-messaging-sender-id
      VITE_TEST_FIREBASE_APP_ID=your-test-app-id
      VITE_TEST_FIREBASE_MEASUREMENT_ID=your-test-measurement-id
      
      # Firebase Configuration Flags
      VITE_USE_TEST_FIREBASE=false
      VITE_USE_FIREBASE_EMULATORS=false
      
      Make sure to restart your development server after creating/updating the .env file.
    `);
  }
  
  return config;
}

// Select the appropriate Firebase config based on environment settings
const firebaseConfig = getCurrentConfig();
const environment = useTestConfig ? 'test' : 'production';

// Log the active configuration (but don't show sensitive data in production)
console.log(`Using Firebase ${environment} environment:`, {
  apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 5)}...` : 'MISSING',
  projectId: firebaseConfig.projectId || 'MISSING',
  authDomain: firebaseConfig.authDomain || 'MISSING'
});

// Check for configuration errors before initializing Firebase
if (!firebaseConfig.apiKey) {
  console.error('[FIREBASE ERROR] API Key is missing. Firebase initialization will fail.');
  console.error('[FIREBASE ERROR] Make sure your .env file is correctly set up with Firebase credentials.');
}

// Initialize Firebase with additional error handling
let app;
try {
  app = initializeApp(firebaseConfig);
  console.log('[FIREBASE] Firebase app successfully initialized');
} catch (error) {
  console.error('[FIREBASE ERROR] Failed to initialize Firebase app:', error);
  // Re-throw but with more helpful message
  throw new Error(`Firebase initialization failed. Check that your environment variables are correctly set in .env file: ${error}`);
}

// Initialize Firestore
export const db = getFirestore(app);

// Configure persistence
enableIndexedDbPersistence(db)
  .catch((err) => {
    console.error('Persistence failed:', err.code);
  });

// Initialize other Firebase services
export const storage = getStorage(app);
export const auth = getAuth(app);

// Connect to emulators if enabled
if (useEmulators) {
  try {
    connectFirestoreEmulator(db, 'localhost', EMULATOR_PORTS.firestore);
    connectAuthEmulator(auth, `http://localhost:${EMULATOR_PORTS.auth}`);
    connectStorageEmulator(storage, 'localhost', EMULATOR_PORTS.storage);
    console.log('Connected to Firebase emulators');
  } catch (error) {
    console.error('Failed to connect to emulators:', error);
  }
}

console.log('Using Firebase project:', firebaseConfig.projectId);

export const checkFirestoreConnection = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, 'shareTokens'));
    console.log('Total tokens in database:', querySnapshot.size);
  } catch (error) {
    console.error('Firestore connection failed:', error);
  }
};

export default app;