import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

/**
 * IMPORTANT: This configuration file loads environment variables from the .env file.
 * Never hardcode API keys, secrets, or credentials in this file or any other source code file.
 * Always use environment variables for sensitive information.
 * 
 * Required environment variables:
 * - VITE_FIREBASE_API_KEY and related Firebase config vars
 * - For test environment: VITE_TEST_FIREBASE_API_KEY and related test config vars
 */

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  console.log('Loading environment for mode:', mode);
  console.log('Environment variables loaded:', Object.keys(env).filter(key => key.startsWith('VITE_')));
  
  // Check .env file content
  try {
    const envContent = fs.readFileSync('.env', 'utf8');
    console.log('.env file exists with content length:', envContent.length);
    // Log specific variables without showing actual values
    console.log('VITE_USE_TEST_FIREBASE present:', env.VITE_USE_TEST_FIREBASE !== undefined);
    console.log('VITE_USE_FIREBASE_EMULATORS present:', env.VITE_USE_FIREBASE_EMULATORS !== undefined);
    
    // Check for critical Firebase variables but don't log their values
    const requiredFirebaseVars = [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID'
    ];
    
    const missingVars = requiredFirebaseVars.filter(key => !env[key]);
    if (missingVars.length > 0) {
      console.warn(`WARNING: Missing required Firebase environment variables: ${missingVars.join(', ')}`);
      console.warn('Firebase initialization may fail. Check your .env file.');
    }
  } catch (e) {
    console.warn('Could not read .env file', e);
  }
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
    build: {
      rollupOptions: {
        input: {
          main: './index.html',
        }
      }
    },
    // Make environment variables available to the client
    define: {
      'import.meta.env.VITE_USE_TEST_FIREBASE': JSON.stringify(env.VITE_USE_TEST_FIREBASE),
      'import.meta.env.VITE_USE_FIREBASE_EMULATORS': JSON.stringify(env.VITE_USE_FIREBASE_EMULATORS),
      // Include all VITE_ prefixed env variables
      ...Object.fromEntries(
        Object.entries(env)
          .filter(([key]) => key.startsWith('VITE_'))
          .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)])
      )
    }
  };
});
