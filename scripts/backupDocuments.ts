#!/usr/bin/env tsx
/**
 * Backup Script: Export documents collection to JSON
 *
 * Creates timestamped backup of documents collection before migration
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

interface BackupMetadata {
  timestamp: string;
  projectId: string;
  totalDocuments: number;
  backupPath: string;
  collections: string[];
}

async function backupDocuments(projectId: string) {
  console.log('\n📦 Starting Firestore Backup');
  console.log('═'.repeat(60));
  console.log(`Project: ${projectId}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const backupDir = resolve(__dirname, '../backups', `backup_${timestamp}`);

  // Create backup directory
  if (!existsSync(resolve(__dirname, '../backups'))) {
    mkdirSync(resolve(__dirname, '../backups'));
  }
  mkdirSync(backupDir);

  try {
    // Backup documents collection
    console.log('📄 Backing up documents collection...');
    const documentsRef = collection(db, 'documents');
    const q = query(documentsRef, where('projectId', '==', projectId));
    const snapshot = await getDocs(q);

    const documents: Record<string, any> = {};
    snapshot.docs.forEach(doc => {
      documents[doc.id] = {
        ...doc.data(),
        _backupId: doc.id
      };
    });

    const documentsPath = resolve(backupDir, 'documents.json');
    writeFileSync(documentsPath, JSON.stringify(documents, null, 2));
    console.log(`✅ Backed up ${snapshot.size} documents to: ${documentsPath}`);

    // Create metadata
    const metadata: BackupMetadata = {
      timestamp: new Date().toISOString(),
      projectId,
      totalDocuments: snapshot.size,
      backupPath: backupDir,
      collections: ['documents']
    };

    const metadataPath = resolve(backupDir, 'metadata.json');
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Create README
    const readme = `# Firestore Backup

## Backup Information
- **Created**: ${metadata.timestamp}
- **Project ID**: ${projectId}
- **Documents**: ${metadata.totalDocuments}

## Files
- \`documents.json\`: All documents in the project
- \`metadata.json\`: Backup metadata

## Restore
To restore this backup, run:
\`\`\`bash
npm run restore:firestore -- --backup ${backupDir}
\`\`\`

## What's Backed Up
- Document IDs
- All document fields including createdByName
- Original values before migration

## Notes
- This backup only includes the documents collection
- Storage files (PDFs, images) are NOT included
- To revert migration: restore createdByName field from this backup
`;

    writeFileSync(resolve(backupDir, 'README.md'), readme);

    console.log('\n' + '═'.repeat(60));
    console.log('📊 BACKUP SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✅ Total documents backed up: ${metadata.totalDocuments}`);
    console.log(`📁 Backup location: ${backupDir}`);
    console.log(`📝 Metadata: ${metadataPath}`);
    console.log('\n💾 Backup complete! You can now safely run the migration.\n');

    return backupDir;

  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}

// Parse arguments
const projectId = process.argv[2] || 'BPo1ejgqniYfBTnCMJjB';

backupDocuments(projectId)
  .then((backupPath) => {
    console.log(`To run migration after backup:`);
    console.log(`npm run migrate:uploaders -- --project ${projectId} --execute\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Backup failed:', error);
    process.exit(1);
  });
