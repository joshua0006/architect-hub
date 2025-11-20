#!/usr/bin/env tsx
/**
 * Diagnostic Script: Query Specific File
 *
 * Queries Firestore for a specific file by name and displays all its data
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
  where
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

async function queryFileByName(fileName: string, projectId: string) {
  console.log('\n🔍 Diagnostic Query');
  console.log('═'.repeat(60));
  console.log(`File: ${fileName}`);
  console.log(`Project: ${projectId}\n`);

  try {
    // Query documents by name
    const documentsRef = collection(db, 'documents');
    const q = query(
      documentsRef,
      where('projectId', '==', projectId),
      where('name', '==', fileName)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('❌ No documents found with this name\n');
      console.log('💡 Suggestions:');
      console.log('   - Check if the file name is exact (case-sensitive)');
      console.log('   - Try searching without extension');
      console.log('   - Verify the project ID is correct\n');
      return;
    }

    console.log(`✅ Found ${snapshot.size} document(s)\n`);

    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();

      console.log(`Document ${index + 1}:`);
      console.log('─'.repeat(60));
      console.log(`📄 Document ID: ${doc.id}`);
      console.log(`📝 Name: ${data.name}`);
      console.log(`📁 Folder ID: ${data.folderId || 'N/A'}`);
      console.log(`🔗 Project ID: ${data.projectId}`);

      console.log('\n👤 Uploader Information:');
      console.log(`   createdByName: "${data.createdByName}" (type: ${typeof data.createdByName})`);
      console.log(`   createdBy: ${data.createdBy || 'N/A'}`);
      console.log(`   createdAt: ${data.createdAt || 'N/A'}`);

      // Check for empty/whitespace issues
      if (data.createdByName !== undefined && data.createdByName !== null) {
        const trimmed = data.createdByName.trim();
        console.log(`   createdByName (trimmed): "${trimmed}"`);
        console.log(`   Is empty string: ${data.createdByName === ''}`);
        console.log(`   Is whitespace only: ${trimmed === ''}`);
        console.log(`   Length: ${data.createdByName.length}`);
      } else {
        console.log(`   ⚠️  createdByName is ${data.createdByName === null ? 'null' : 'undefined'}`);
      }

      console.log('\n📊 All Fields:');
      Object.keys(data).sort().forEach(key => {
        const value = data[key];
        const displayValue = typeof value === 'string'
          ? `"${value}"`
          : typeof value === 'object'
          ? JSON.stringify(value)
          : value;
        console.log(`   ${key}: ${displayValue}`);
      });

      console.log('\n' + '═'.repeat(60) + '\n');
    });

  } catch (error) {
    console.error('❌ Error querying file:', error);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
Diagnostic File Query Script

Usage:
  npm run diagnostic:file -- --file "FILE_NAME" --project PROJECT_ID

Options:
  --file FILE_NAME       File name to search for (exact match)
  --project PROJECT_ID   Project ID to search in
  --help                 Show this help message

Example:
  npm run diagnostic:file -- --file "20251104_BC_Floor Plan.dwg" --project structify-chris-cole
    `);
    process.exit(0);
  }

  let fileName = '';
  let projectId = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') {
      fileName = args[++i];
    } else if (args[i] === '--project') {
      projectId = args[++i];
    }
  }

  if (!fileName || !projectId) {
    console.error('❌ Error: Both --file and --project are required\n');
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  return { fileName, projectId };
}

// Run diagnostic
const { fileName, projectId } = parseArgs();
queryFileByName(fileName, projectId)
  .then(() => {
    console.log('✅ Diagnostic complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Diagnostic failed:', error);
    process.exit(1);
  });
