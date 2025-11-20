#!/usr/bin/env tsx
/**
 * Add User Document to Firestore
 *
 * Adds Firestore document for an existing Firebase Auth user
 * Requires signing in as that user first
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Use NEW Firebase
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY_NEW,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN_NEW,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL_NEW,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID_NEW,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET_NEW,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID_NEW,
  appId: process.env.VITE_FIREBASE_APP_ID_NEW,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID_NEW
};

console.log('\n📝 Add User Document to Firestore');
console.log('═'.repeat(60));
console.log(`Project: ${firebaseConfig.projectId}`);
console.log('═'.repeat(60));

const app = initializeApp(firebaseConfig, 'add-user-doc');
const auth = getAuth(app);
const db = getFirestore(app);

// User details
const USER_EMAIL = 'joshua@jezweb.net';
const USER_PASSWORD = 'jezwebinfo';
const USER_DISPLAY_NAME = 'Joshua';
const USER_ROLE = 'Admin';

async function addUserDocument() {
  try {
    console.log('\n📋 Step 1: Signing in as user...');
    console.log(`   Email: ${USER_EMAIL}`);

    const userCredential = await signInWithEmailAndPassword(
      auth,
      USER_EMAIL,
      USER_PASSWORD
    );

    const user = userCredential.user;
    console.log(`   ✅ Signed in successfully`);
    console.log(`   UID: ${user.uid}`);

    console.log('\n📋 Step 2: Creating/updating user document in Firestore...');

    const userDoc = {
      id: user.uid,
      email: USER_EMAIL,
      displayName: USER_DISPLAY_NAME,
      role: USER_ROLE,
      projectIds: [],
      groupIds: [],
      profile: {
        photoURL: null,
        bio: '',
        title: 'Administrator',
        phone: '',
        location: '',
        timezone: 'America/New_York',
        notifications: {
          email: true,
          push: true
        }
      },
      metadata: {
        lastLogin: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    };

    await setDoc(doc(db, 'users', user.uid), userDoc);
    console.log(`   ✅ User document created at /users/${user.uid}`);

    console.log('\n📋 Step 3: Signing out...');
    await signOut(auth);
    console.log('   ✅ Signed out successfully');

    console.log('\n' + '═'.repeat(60));
    console.log('✅ SUCCESS!');
    console.log('═'.repeat(60));
    console.log(`\nAdmin user is ready:`);
    console.log(`   Email: ${USER_EMAIL}`);
    console.log(`   Role: ${USER_ROLE}`);
    console.log(`   UID: ${user.uid}`);
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);

    if (error.code === 'auth/user-not-found') {
      console.error('\n⚠️  User not found in Firebase Auth!');
      console.error('   Run: npm run firebase:create-admin first');
    } else if (error.code === 'auth/wrong-password') {
      console.error('\n⚠️  Incorrect password!');
      console.error('   Check the password and try again');
    } else if (error.code === 'permission-denied') {
      console.error('\n⚠️  Permission denied!');
      console.error('   Security rules may be preventing document creation');
    }

    process.exit(1);
  }
}

addUserDocument().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
