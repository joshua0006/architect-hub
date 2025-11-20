#!/usr/bin/env tsx
/**
 * Create Admin User Script
 *
 * Creates a new user in Firebase Auth and Firestore with Admin role
 *
 * Usage: tsx scripts/createAdminUser.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';

// Determine which Firebase config to use based on VITE_FIREBASE_ACTIVE
const isNewFirebase = process.env.VITE_FIREBASE_ACTIVE === 'new';

const firebaseConfig = isNewFirebase ? {
  apiKey: process.env.VITE_FIREBASE_API_KEY_NEW,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN_NEW,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL_NEW,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID_NEW,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET_NEW,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID_NEW,
  appId: process.env.VITE_FIREBASE_APP_ID_NEW,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID_NEW
} : {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

console.log('\n👤 Firebase Admin User Creator');
console.log('═'.repeat(60));
console.log(`Target Project: ${firebaseConfig.projectId}`);
console.log(`Active Config: ${isNewFirebase ? 'NEW' : 'OLD'} Firebase`);
console.log('═'.repeat(60));

// Validate config
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('❌ Firebase configuration is incomplete!');
  console.error('Please check your .env file.');
  process.exit(1);
}

// Initialize Firebase
const app = initializeApp(firebaseConfig, 'admin-creator');
const auth = getAuth(app);
const db = getFirestore(app);

// User details
const USER_EMAIL = 'joshua@jezweb.net';
const USER_PASSWORD = 'jezwebinfo';
const USER_DISPLAY_NAME = 'Joshua';
const USER_ROLE = 'Admin';

interface UserDocument {
  id: string;
  email: string;
  displayName: string;
  role: 'Admin' | 'Staff' | 'Contractor' | 'Client';
  projectIds: string[];
  groupIds: string[];
  profile: {
    photoURL: string | null;
    bio: string;
    title: string;
    phone: string;
    location: string;
    timezone: string;
    notifications: {
      email: boolean;
      push: boolean;
    };
  };
  metadata: {
    lastLogin: any;
    createdAt: any;
    updatedAt: any;
  };
}

async function createAdminUser() {
  try {
    console.log('\n📋 Step 1: Creating user in Firebase Auth...');
    console.log(`   Email: ${USER_EMAIL}`);
    console.log(`   Password: ${'*'.repeat(USER_PASSWORD.length)}`);

    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      USER_EMAIL,
      USER_PASSWORD
    );

    const user = userCredential.user;
    console.log(`   ✅ Auth user created with UID: ${user.uid}`);

    // Note: User is automatically signed in after createUserWithEmailAndPassword
    console.log('   ✅ User is now signed in');

    console.log('\n📋 Step 2: Creating user document in Firestore...');
    console.log('   (Creating document while authenticated as the new user)');

    // Create user document in Firestore
    const userDoc: UserDocument = {
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

    // Success summary
    console.log('\n' + '═'.repeat(60));
    console.log('✅ ADMIN USER CREATED SUCCESSFULLY!');
    console.log('═'.repeat(60));
    console.log('\n📝 User Details:');
    console.log(`   UID: ${user.uid}`);
    console.log(`   Email: ${USER_EMAIL}`);
    console.log(`   Display Name: ${USER_DISPLAY_NAME}`);
    console.log(`   Role: ${USER_ROLE}`);
    console.log(`   Project: ${firebaseConfig.projectId}`);

    console.log('\n🔐 Login Credentials:');
    console.log(`   Email: ${USER_EMAIL}`);
    console.log(`   Password: ${USER_PASSWORD}`);

    console.log('\n🎯 Next Steps:');
    console.log('   1. Login to the application with the credentials above');
    console.log('   2. Verify admin permissions work correctly');
    console.log('   3. Add user to projects as needed');

    console.log('\n🔗 Firebase Console:');
    console.log(`   https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/users`);
    console.log('');

  } catch (error: any) {
    console.error('\n❌ Error creating admin user:', error.message);

    if (error.code === 'auth/email-already-in-use') {
      console.error('\n⚠️  User already exists!');
      console.error('   Options:');
      console.error('   1. Delete the existing user in Firebase Console');
      console.error('   2. Use a different email address');
      console.error('   3. Reset the password for the existing user');
    } else if (error.code === 'auth/weak-password') {
      console.error('\n⚠️  Password is too weak!');
      console.error('   Please use a stronger password (at least 6 characters)');
    } else if (error.code === 'auth/invalid-email') {
      console.error('\n⚠️  Invalid email format!');
      console.error('   Please check the email address');
    } else if (error.code === 'permission-denied') {
      console.error('\n⚠️  Permission denied!');
      console.error('   Make sure Firestore security rules allow user creation');
      console.error('   You may need to temporarily relax the rules or use Firebase Admin SDK');
    }

    console.error('\n💡 Troubleshooting:');
    console.error('   - Check Firebase Console for existing users');
    console.error('   - Verify security rules allow user document creation');
    console.error('   - Ensure you\'re targeting the correct Firebase project');
    console.error(`   - Current project: ${firebaseConfig.projectId}`);

    process.exit(1);
  }
}

// Run the script
console.log('\n⚠️  WARNING: This will create a new user with admin privileges!');
console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');

setTimeout(() => {
  createAdminUser().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}, 3000);
