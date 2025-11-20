#!/usr/bin/env tsx
/**
 * List all project IDs in the documents collection
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

async function listProjects() {
  console.log('\n🔍 Discovering Project IDs in Firestore');
  console.log('═'.repeat(60));

  try {
    const documentsRef = collection(db, 'documents');
    const q = query(documentsRef, firestoreLimit(500));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('❌ No documents found in the entire collection\n');
      return;
    }

    const projectIds = new Map<string, number>();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const projectId = data.projectId;
      if (projectId) {
        projectIds.set(projectId, (projectIds.get(projectId) || 0) + 1);
      }
    });

    console.log(`\n✅ Found ${snapshot.size} total documents`);
    console.log(`📊 Unique Project IDs: ${projectIds.size}\n`);

    console.log('Projects:');
    console.log('─'.repeat(60));
    Array.from(projectIds.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([projectId, count]) => {
        console.log(`  ${projectId} (${count} documents)`);
      });

    console.log('\n' + '═'.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

listProjects()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Failed:', err);
    process.exit(1);
  });
