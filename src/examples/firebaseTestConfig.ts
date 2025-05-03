/**
 * Example showing how to use Firebase emulators configuration
 */
import { configureFirebase } from '../lib/firebase';

/**
 * Configure Firebase to use emulators
 * Call this function early in your application initialization
 * BEFORE any Firebase operations are performed
 */
export function setupFirebaseEmulators() {
  // Configure Firebase to use emulators
  configureFirebase({
    useEmulators: true,
  });
}

/**
 * Disable Firebase emulators
 */
export function disableFirebaseEmulators() {
  // Configure Firebase to disable emulators
  configureFirebase({
    useEmulators: false,
  });
} 