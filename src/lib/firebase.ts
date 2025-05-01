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
import { PROD_CONFIG, TEST_CONFIG, EMULATOR_PORTS, FirebaseConfig, ENV_FLAGS } from './firebaseConfig';

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
  return useTestConfig ? TEST_CONFIG : PROD_CONFIG;
}

// Select the appropriate Firebase config
const firebaseConfig = getCurrentConfig();

// Log the active configuration
console.log('Active Firebase configuration:', {
  apiKey: firebaseConfig.apiKey,
  projectId: firebaseConfig.projectId
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);

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