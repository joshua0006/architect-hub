/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Firebase Production Configuration
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  
  // Firebase Test Configuration
  readonly VITE_TEST_FIREBASE_API_KEY: string;
  readonly VITE_TEST_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_TEST_FIREBASE_PROJECT_ID: string;
  readonly VITE_TEST_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_TEST_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_TEST_FIREBASE_APP_ID: string;
  readonly VITE_TEST_FIREBASE_MEASUREMENT_ID?: string;
  
  // Firebase Environment Selection
  readonly VITE_USE_TEST_FIREBASE?: string;
  readonly VITE_USE_FIREBASE_EMULATORS?: string;
  
  // Emulator Configuration
  readonly VITE_FIREBASE_EMULATOR_HOST?: string;
  readonly VITE_FIREBASE_FIRESTORE_EMULATOR_PORT?: string;
  readonly VITE_FIREBASE_AUTH_EMULATOR_PORT?: string;
  readonly VITE_FIREBASE_STORAGE_EMULATOR_PORT?: string;

  // CLOUD FUNCTION
  readonly VITE_FIREBASE_CF_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
