import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  connectFirestoreEmulator,
  enableIndexedDbPersistence,
  getDocs,
  collection
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBu3Lvkp4s_RX6qNHpRPKimc3jwY5cPhgs",
  authDomain: "structify-chris-cole.firebaseapp.com",
  projectId: "structify-chris-cole",
  storageBucket: "structify-chris-cole.firebasestorage.app",
  messagingSenderId: "55459428968",
  appId: "1:55459428968:web:56233aaec4e7699361d9dd"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Configure persistence
enableIndexedDbPersistence(db)
  .catch((err) => {
    console.error('Persistence failed:', err.code);
  });

// Emulator connection (only in development)
if (process.env.NODE_ENV === 'development') {
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
    console.log('Connected to Firestore emulator');
  } catch (error) {
    console.log('Using production Firestore instance');
  }
}

export const storage = getStorage(app);
export const auth = getAuth(app);

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