/**
 * Example showing how to use the test Firebase configuration
 */
import { configureFirebase } from '../lib/firebase';
import { ENV_FLAGS } from '../lib/firebaseConfig';

/**
 * Configure Firebase to use the test project
 * Call this function early in your application initialization
 * BEFORE any Firebase operations are performed
 */
export function setupTestFirebase() {
  // Configure Firebase to use the test project with emulators from env vars
  configureFirebase({
    useTestProject: true,
    useEmulators: ENV_FLAGS.useEmulators,
  });
  
  console.log('Firebase configured to use TEST project');
  if (ENV_FLAGS.useEmulators) {
    console.log('Firebase emulators ENABLED from environment variables');
  }
}

/**
 * Configure Firebase to use the test project with local emulators
 * Requires running Firebase emulators locally:
 * firebase emulators:start
 */
export function setupTestFirebaseWithEmulators() {
  // Configure Firebase to use the test project with emulators enabled
  configureFirebase({
    useTestProject: true,
    useEmulators: true,
  });
  
  console.log('Firebase configured to use TEST project with emulators');
}

/**
 * Reset Firebase to use the production project
 */
export function resetToProductionFirebase() {
  // Configure Firebase to use the production project with emulators disabled
  configureFirebase({
    useTestProject: false,
    useEmulators: false,
  });
  
  console.log('Firebase configured to use PRODUCTION project');
} 