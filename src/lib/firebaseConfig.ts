/**
 * Firebase configuration file
 * Contains both production and test configurations
 */

// TOGGLE THIS CONSTANT TO SWITCH BETWEEN TEST AND PRODUCTION ENVIRONMENTS
// Set to true to use test environment, false to use production
export const USE_TEST_ENVIRONMENT = true;

// Firebase configuration interface
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

// Helper function to load environment variables with fallbacks
function getEnvString(key: string, fallback: string = ''): string {
  try {
    // Try to access from Vite's import.meta.env - direct property access
    if (import.meta.env && typeof import.meta.env[key] !== 'undefined') {
      return import.meta.env[key] as string;
    }
    
    // For Vite, you can also try with VITE_ prefix
    const viteKey = key.startsWith('VITE_') ? key : `VITE_${key}`;
    if (import.meta.env && typeof import.meta.env[viteKey] !== 'undefined') {
      return import.meta.env[viteKey] as string;
    }
    
    // Try to access from process.env (for Node.js environments)
    if (typeof process !== 'undefined' && process.env && typeof process.env[key] !== 'undefined') {
      return process.env[key] as string;
    }
    
    return fallback;
  } catch (e) {
    console.warn(`Error accessing env var ${key}:`, e);
    return fallback;
  }
}

// Environment variable access helper for boolean values
function getEnvValue(key: string, defaultValue: boolean): boolean {
  try {
    // Try to access from Vite's import.meta.env
    if (import.meta.env[key] !== undefined) {
      const rawValue = import.meta.env[key];
      
      // Handle different value types
      if (typeof rawValue === 'boolean') {
        return rawValue;
      }
      
      if (typeof rawValue === 'string') {
        const lowered = rawValue.toLowerCase();
        return lowered === 'true';
      }
      
      return defaultValue;
    }

    // Try to access from process.env (for SSR/build)
    if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
      const rawValue = process.env[key];
      
      if (typeof rawValue === 'string') {
        const lowered = rawValue.toLowerCase();
        return lowered === 'true';
      }
      
      return defaultValue;
    }
    
    return defaultValue;
  } catch (e) {
    console.warn(`Error accessing env var ${key}:`, e);
    return defaultValue;
  }
}

// Configuration flags - Read from environment variables with fallbacks
// Override with USE_TEST_ENVIRONMENT constant if needed
export const ENV_FLAGS = {
  // Use the constant instead of environment variable if specified
  useTestFirebase: USE_TEST_ENVIRONMENT || getEnvValue('VITE_USE_TEST_FIREBASE', false),
  useEmulators: getEnvValue('VITE_USE_FIREBASE_EMULATORS', false)
};

// Firebase configurations - Single export for both environments
export const FIREBASE_CONFIG = {
  production: {
    apiKey: getEnvString('VITE_FIREBASE_API_KEY'),
    authDomain: getEnvString('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnvString('VITE_FIREBASE_PROJECT_ID'),
    storageBucket: getEnvString('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnvString('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnvString('VITE_FIREBASE_APP_ID')
  },
  test: {
    apiKey: getEnvString('VITE_TEST_FIREBASE_API_KEY'),
    authDomain: getEnvString('VITE_TEST_FIREBASE_AUTH_DOMAIN'),
    projectId: getEnvString('VITE_TEST_FIREBASE_PROJECT_ID'),
    storageBucket: getEnvString('VITE_TEST_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: getEnvString('VITE_TEST_FIREBASE_MESSAGING_SENDER_ID'),
    appId: getEnvString('VITE_TEST_FIREBASE_APP_ID'),
    measurementId: getEnvString('VITE_TEST_FIREBASE_MEASUREMENT_ID')
  }
};

// For backward compatibility
export const PROD_CONFIG = FIREBASE_CONFIG.production;
export const TEST_CONFIG = FIREBASE_CONFIG.test;

// Firebase emulator configuration
export const EMULATOR_PORTS = {
  firestore: 8080,
  auth: 9099,
  storage: 9199
};

