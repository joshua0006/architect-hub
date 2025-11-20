#!/usr/bin/env tsx
/**
 * Restore Script: Restore documents from backup
 *
 * Restores createdByName field to original state from backup
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const existingApps = getApps();
const app = existingApps.length > 0 ? existingApps[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

async function restoreDocuments(backupPath: string, dryRun: boolean = true) {
  console.log('\n🔄 Starting Firestore Restore');
  console.log('═'.repeat(60));
  console.log(`Backup: ${backupPath}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTING'}\n`);

  // Check if backup exists
  const documentsPath = resolve(backupPath, 'documents.json');
  const metadataPath = resolve(backupPath, 'metadata.json');

  if (!existsSync(documentsPath)) {
    throw new Error(`Backup file not found: ${documentsPath}`);
  }

  if (!existsSync(metadataPath)) {
    throw new Error(`Metadata file not found: ${metadataPath}`);
  }

  try {
    // Read backup
    const documentsData = JSON.parse(readFileSync(documentsPath, 'utf-8'));
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));

    console.log('📋 Backup Information:');
    console.log(`   Created: ${metadata.timestamp}`);
    console.log(`   Project: ${metadata.projectId}`);
    console.log(`   Documents: ${metadata.totalDocuments}\n`);

    const documentIds = Object.keys(documentsData);
    let restored = 0;
    let errors = 0;

    console.log(`🔄 Restoring ${documentIds.length} documents...\n`);

    for (const docId of documentIds) {
      const backupDoc = documentsData[docId];
      const originalCreatedByName = backupDoc.createdByName;

      try {
        if (!dryRun) {
          const docRef = doc(db, 'documents', docId);
          await updateDoc(docRef, {
            createdByName: originalCreatedByName || null
          });
        }

        console.log(`  ${dryRun ? '📋' : '✅'} ${backupDoc.name || docId}`);
        console.log(`     createdByName: "${originalCreatedByName || 'null'}"`);
        restored++;

      } catch (error) {
        console.error(`  ❌ ${backupDoc.name || docId}: ${error}`);
        errors++;
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 RESTORE SUMMARY');
    console.log('═'.repeat(60));

    if (dryRun) {
      console.log('⚠️  DRY RUN MODE - No changes were made\n');
    } else {
      console.log('✅ RESTORE COMPLETE\n');
    }

    console.log(`Total documents: ${documentIds.length}`);
    console.log(`✅ Successfully restored: ${restored}`);
    console.log(`❌ Errors: ${errors}`);

    if (dryRun) {
      console.log('\n💡 To execute restore, run:');
      console.log(`   npm run restore:firestore -- --backup "${backupPath}" --execute\n`);
    } else {
      console.log('\n✅ All documents restored to original state!\n');
    }

  } catch (error) {
    console.error('❌ Restore failed:', error);
    throw error;
  }
}

// Parse arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let backupPath = '';
  let dryRun = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--backup') {
      backupPath = args[++i];
    } else if (args[i] === '--execute') {
      dryRun = false;
    } else if (args[i] === '--help') {
      console.log(`
Restore Firestore Backup

Usage:
  npm run restore:firestore -- --backup BACKUP_PATH [--execute]

Options:
  --backup PATH    Path to backup directory
  --execute        Execute restore (default: dry-run)
  --help           Show this help

Examples:
  # Dry-run (preview)
  npm run restore:firestore -- --backup backups/backup_2025-11-19T06-59-43

  # Execute restore
  npm run restore:firestore -- --backup backups/backup_2025-11-19T06-59-43 --execute
      `);
      process.exit(0);
    }
  }

  if (!backupPath) {
    console.error('❌ Error: --backup PATH is required\n');
    console.log('Run with --help for usage information');
    process.exit(1);
  }

  return { backupPath, dryRun };
}

const { backupPath, dryRun } = parseArgs();

restoreDocuments(backupPath, dryRun)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Restore failed:', error);
    process.exit(1);
  });
