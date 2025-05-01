/**
 * Firebase configuration file
 * Contains both production and test configurations
 */

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

// Production Firebase configuration
export const PROD_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyBu3Lvkp4s_RX6qNHpRPKimc3jwY5cPhgs",
  authDomain: "structify-chris-cole.firebaseapp.com",
  projectId: "structify-chris-cole",
  storageBucket: "structify-chris-cole.firebasestorage.app",
  messagingSenderId: "55459428968",
  appId: "1:55459428968:web:56233aaec4e7699361d9dd"
};

// Test Firebase configuration
export const TEST_CONFIG: FirebaseConfig = {
  apiKey: "AIzaSyBd4o6amxsqm360eU8IUo0fr6gw3X3dSRk",
  authDomain: "chris-cole-test.firebaseapp.com",
  projectId: "chris-cole-test",
  storageBucket: "chris-cole-test.firebasestorage.app",
  messagingSenderId: "808102050509",
  appId: "1:808102050509:web:2178128aa4b4d235d4c784",
  measurementId: "G-8EZWF8CE3S"
};

// Environment variable access helper
function getEnvValue(key: string, defaultValue: boolean): boolean {
  // Log the raw values for debugging
  console.log(`[ENV DEBUG] Reading env var ${key}:`);
  console.log(`  - import.meta.env.${key} =`, import.meta.env[key]);
  console.log(`  - typeof import.meta.env.${key} =`, typeof import.meta.env[key]);
  
  try {
    // For boolean values, we need to handle string conversion
    // Try to access from Vite's import.meta.env
    if (import.meta.env[key] !== undefined) {
      const rawValue = import.meta.env[key];
      console.log(`  - Raw value from import.meta.env: "${rawValue}" (${typeof rawValue})`);
      
      // Handle different value types
      if (typeof rawValue === 'boolean') {
        return rawValue;
      }
      
      if (typeof rawValue === 'string') {
        const lowered = rawValue.toLowerCase();
        console.log(`  - String value converted: "${lowered}" => ${lowered === 'true'}`);
        return lowered === 'true';
      }
      
      console.log(`  - Using default because value type not handled: ${defaultValue}`);
      return defaultValue;
    }

    // Try to access from process.env (for SSR/build)
    if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
      const rawValue = process.env[key];
      console.log(`  - Raw value from process.env: "${rawValue}" (${typeof rawValue})`);
      
      if (typeof rawValue === 'string') {
        const lowered = rawValue.toLowerCase();
        console.log(`  - String value converted: "${lowered}" => ${lowered === 'true'}`);
        return lowered === 'true';
      }
      
      console.log(`  - Using default because value type not handled: ${defaultValue}`);
      return defaultValue;
    }
    
    console.log(`  - Using default because no value found: ${defaultValue}`);
    return defaultValue;
  } catch (e) {
    console.warn(`[ENV DEBUG] Error accessing env var ${key}:`, e);
    return defaultValue;
  }
}

// Environment variables debugging
console.log('====================================');
console.log('ENVIRONMENT VARIABLES DEBUG:');
console.log('import.meta.env available keys:', Object.keys(import.meta.env).join(', '));
console.log('Direct access to VITE_USE_TEST_FIREBASE:', import.meta.env.VITE_USE_TEST_FIREBASE);
console.log('Type of direct value:', typeof import.meta.env.VITE_USE_TEST_FIREBASE);
console.log('====================================');

// Configuration flags - Read from environment variables with fallbacks
export const ENV_FLAGS = {
  // Use environment variables with fallback to false
  useTestFirebase: getEnvValue('VITE_USE_TEST_FIREBASE', false),
  useEmulators: getEnvValue('VITE_USE_FIREBASE_EMULATORS', false)
};

// FORCE TEST FOR DEBUGGING - COMMENT OUT TO USE ENVIRONMENT VARIABLES
// Uncomment these lines to force a specific configuration regardless of env vars
ENV_FLAGS.useTestFirebase = true; // FORCE TEST CONFIG
// ENV_FLAGS.useEmulators = false;  // FORCE EMULATORS OFF (or on)

// Firebase emulator configuration
export const EMULATOR_PORTS = {
  firestore: 8080,
  auth: 9099,
  storage: 9199
};

// Log current configuration mode (for debugging)
console.log("====================================");
console.log("FIREBASE CONFIGURATION:");
console.log(`- Using ${ENV_FLAGS.useTestFirebase ? "TEST" : "PRODUCTION"} Firebase project`);
console.log(`- Test project: ${TEST_CONFIG.projectId}`);
console.log(`- Production project: ${PROD_CONFIG.projectId}`);
console.log(`- Emulators: ${ENV_FLAGS.useEmulators ? "ENABLED" : "DISABLED"}`);
console.log("===================================="); 