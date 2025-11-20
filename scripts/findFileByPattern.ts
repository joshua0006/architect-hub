#!/usr/bin/env tsx
/**
 * Find files matching a pattern in their name
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit as firestoreLimit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function findFiles(pattern: string) {
  console.log(`\n🔍 Searching for files matching: "${pattern}"`);
  console.log('═'.repeat(80));

  try {
    const documentsRef = collection(db, 'documents');
    const q = query(documentsRef, firestoreLimit(1000));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('❌ No documents found\n');
      return;
    }

    const matches: any[] = [];
    const regex = new RegExp(pattern, 'i'); // Case-insensitive

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.name && regex.test(data.name)) {
        matches.push({
          id: doc.id,
          name: data.name,
          projectId: data.projectId,
          createdByName: data.createdByName,
          createdBy: data.createdBy
        });
      }
    });

    console.log(`\n✅ Found ${matches.length} matching files\n`);

    if (matches.length === 0) {
      console.log('No files found matching the pattern\n');
      return;
    }

    matches.forEach((file, index) => {
      console.log(`${index + 1}. ${file.name}`);
      console.log(`   Project ID: ${file.projectId}`);
      console.log(`   Document ID: ${file.id}`);
      console.log(`   Uploader: ${file.createdByName || 'Unknown User'}`);
      console.log(`   Created By: ${file.createdBy || 'N/A'}`);
      console.log('');
    });

    console.log('═'.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const pattern = process.argv[2] || 'BC';
findFiles(pattern)
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Failed:', err);
    process.exit(1);
  });
