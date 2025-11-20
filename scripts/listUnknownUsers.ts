#!/usr/bin/env tsx
/**
 * List all files showing as "Unknown User" in transmittal view
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  limit as firestoreLimit
} from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function listFiles(projectId: string, limitCount: number = 50) {
  console.log('\n📋 Documents in Project');
  console.log('═'.repeat(80));
  console.log(`Project: ${projectId}`);
  console.log(`Limit: ${limitCount} documents\n`);

  try {
    const documentsRef = collection(db, 'documents');
    let q = query(
      documentsRef,
      where('projectId', '==', projectId),
      firestoreLimit(limitCount)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('❌ No documents found in this project\n');
      return;
    }

    console.log(`Total documents: ${snapshot.size}\n`);

    const unknownUsers: any[] = [];
    const knownUsers: any[] = [];

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const createdByName = data.createdByName;

      const fileInfo = {
        id: doc.id,
        name: data.name || 'Unnamed',
        createdByName: createdByName,
        createdBy: data.createdBy,
        isEmpty: createdByName === '',
        isWhitespace: typeof createdByName === 'string' && createdByName.trim() === '',
        type: typeof createdByName
      };

      if (!createdByName || createdByName.trim() === '') {
        unknownUsers.push(fileInfo);
      } else {
        knownUsers.push(fileInfo);
      }
    });

    if (unknownUsers.length > 0) {
      console.log(`\n⚠️  Files with Unknown/Empty Uploader (${unknownUsers.length}):`);
      console.log('─'.repeat(80));
      unknownUsers.forEach((file, index) => {
        console.log(`\n${index + 1}. ${file.name}`);
        console.log(`   Document ID: ${file.id}`);
        console.log(`   createdByName: "${file.createdByName}" (${file.type})`);
        console.log(`   Is empty string: ${file.isEmpty}`);
        console.log(`   Is whitespace: ${file.isWhitespace}`);
        console.log(`   createdBy: ${file.createdBy || 'N/A'}`);
      });
    }

    console.log(`\n\n✅ Files with Known Uploader (${knownUsers.length}):`);
    console.log('─'.repeat(80));
    if (knownUsers.length > 10) {
      console.log('(Showing first 10)');
      knownUsers.slice(0, 10).forEach((file, index) => {
        console.log(`${index + 1}. ${file.name} → ${file.createdByName}`);
      });
    } else {
      knownUsers.forEach((file, index) => {
        console.log(`${index + 1}. ${file.name} → ${file.createdByName}`);
      });
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`Summary: ${unknownUsers.length} unknown, ${knownUsers.length} known\n`);

  } catch (error) {
    console.error('❌ Error listing files:', error);
    process.exit(1);
  }
}

// Parse arguments
const args = process.argv.slice(2);
const projectId = args[0] || 'structify-chris-cole';
const limitIndex = args.indexOf('--limit');
const limitCount = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : 50;

listFiles(projectId, limitCount)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
