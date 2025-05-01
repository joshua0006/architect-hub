import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

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
    // Log specific variables
    console.log('VITE_USE_TEST_FIREBASE:', env.VITE_USE_TEST_FIREBASE);
    console.log('VITE_USE_FIREBASE_EMULATORS:', env.VITE_USE_FIREBASE_EMULATORS);
  } catch (e) {
    console.warn('Could not read .env file', e);
  }
  
  return {
    plugins: [react()],
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
