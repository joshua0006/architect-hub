#!/usr/bin/env tsx
/**
 * Migration Script: Backfill Missing Uploader Names
 *
 * Purpose: Updates documents with missing createdByName field by recovering
 * uploader information from notifications and user collections.
 *
 * Safety: Runs in dry-run mode by default. Use --execute flag to apply changes.
 *
 * Usage:
 *   npm run migrate:uploaders -- --project PROJECT_ID              (dry-run)
 *   npm run migrate:uploaders -- --project PROJECT_ID --execute    (execute)
 *   npm run migrate:uploaders -- --all --execute                   (all projects)
 */

// Load environment variables FIRST before any Firebase imports
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
  updateDoc,
  doc,
  writeBatch,
  limit as firestoreLimit
} from 'firebase/firestore';

// Firebase configuration (from environment or config)
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

// Note: uploaderUtils will be imported dynamically to avoid circular initialization issues

interface MigrationStats {
  totalProcessed: number;
  successfullyRecovered: number;
  stillUnknown: number;
  errors: number;
  details: Array<{
    documentId: string;
    fileName: string;
    oldValue: string;
    newValue: string;
    status: 'success' | 'unknown' | 'error';
  }>;
}

interface MigrationOptions {
  projectId?: string;
  allProjects?: boolean;
  execute?: boolean;
  batchSize?: number;
  limit?: number;
}

/**
 * Get all documents missing createdByName field
 */
async function getDocumentsMissingUploaderNames(
  projectId: string,
  limitCount?: number
): Promise<Array<{ id: string; name: string; createdBy?: string }>> {
  console.log(`📋 Querying documents in project: ${projectId}`);

  const documentsRef = collection(db, 'documents');
  let q = query(
    documentsRef,
    where('projectId', '==', projectId)
  );

  if (limitCount) {
    q = query(q, firestoreLimit(limitCount));
  }

  const snapshot = await getDocs(q);

  // Filter documents missing createdByName
  const missingUploaderDocs = snapshot.docs
    .filter(doc => {
      const data = doc.data();
      return !data.createdByName || data.createdByName.trim() === '';
    })
    .map(doc => ({
      id: doc.id,
      name: doc.data().name || 'Unnamed',
      createdBy: doc.data().createdBy
    }));

  console.log(`✅ Found ${missingUploaderDocs.length} documents missing uploader names`);
  return missingUploaderDocs;
}

/**
 * Resolve uploader names using existing fallback logic
 */
async function resolveUploaderNames(
  projectId: string,
  documentIds: string[]
): Promise<Map<string, string>> {
  console.log(`🔍 Resolving uploader names for ${documentIds.length} documents...`);

  // Dynamically import to avoid initialization issues
  const { getUploaderNamesWithFallback } = await import('../src/utils/uploaderUtils.js');

  // Use the existing getUploaderNamesWithFallback utility (only needs documentIds)
  const uploaderNames = await getUploaderNamesWithFallback(documentIds);

  return uploaderNames;
}

/**
 * Update documents with recovered uploader names
 */
async function updateDocuments(
  documents: Array<{ id: string; name: string }>,
  uploaderNames: Map<string, string>,
  dryRun: boolean
): Promise<MigrationStats> {
  const stats: MigrationStats = {
    totalProcessed: 0,
    successfullyRecovered: 0,
    stillUnknown: 0,
    errors: 0,
    details: []
  };

  console.log(`${dryRun ? '🔍 DRY RUN MODE' : '💾 EXECUTING UPDATES'}...\n`);

  for (const document of documents) {
    stats.totalProcessed++;
    const uploaderName = uploaderNames.get(document.id) || 'Unknown User';

    const detail = {
      documentId: document.id,
      fileName: document.name,
      oldValue: 'Unknown User',
      newValue: uploaderName,
      status: 'unknown' as 'success' | 'unknown' | 'error'
    };

    try {
      if (uploaderName !== 'Unknown User') {
        // Successfully recovered
        if (!dryRun) {
          const docRef = doc(db, 'documents', document.id);
          await updateDoc(docRef, {
            createdByName: uploaderName
          });
        }
        stats.successfullyRecovered++;
        detail.status = 'success';
        console.log(`  ✅ ${document.name}: Unknown User → ${uploaderName}`);
      } else {
        // Still unknown
        stats.stillUnknown++;
        detail.status = 'unknown';
        console.log(`  ⚠️  ${document.name}: No data found, remains Unknown User`);
      }
    } catch (error) {
      stats.errors++;
      detail.status = 'error';
      console.error(`  ❌ ${document.name}: Error - ${error}`);
    }

    stats.details.push(detail);
  }

  return stats;
}

/**
 * Process documents in batches
 */
async function processBatch(
  projectId: string,
  documents: Array<{ id: string; name: string; createdBy?: string }>,
  batchSize: number,
  dryRun: boolean
): Promise<MigrationStats> {
  const allStats: MigrationStats = {
    totalProcessed: 0,
    successfullyRecovered: 0,
    stillUnknown: 0,
    errors: 0,
    details: []
  };

  // Split into batches
  const batches: Array<typeof documents> = [];
  for (let i = 0; i < documents.length; i += batchSize) {
    batches.push(documents.slice(i, i + batchSize));
  }

  console.log(`🔄 Processing ${batches.length} batches (${batchSize} documents each)\n`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n📦 Batch ${i + 1}/${batches.length} (${batch.length} documents)`);
    console.log('─'.repeat(60));

    // Resolve uploader names for this batch
    const documentIds = batch.map(doc => doc.id);
    const uploaderNames = await resolveUploaderNames(projectId, documentIds);

    // Update documents
    const batchStats = await updateDocuments(batch, uploaderNames, dryRun);

    // Aggregate statistics
    allStats.totalProcessed += batchStats.totalProcessed;
    allStats.successfullyRecovered += batchStats.successfullyRecovered;
    allStats.stillUnknown += batchStats.stillUnknown;
    allStats.errors += batchStats.errors;
    allStats.details.push(...batchStats.details);
  }

  return allStats;
}

/**
 * Print final statistics
 */
function printStatistics(stats: MigrationStats, dryRun: boolean) {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 MIGRATION RESULTS');
  console.log('═'.repeat(60));

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes were made to the database\n');
  } else {
    console.log('✅ EXECUTION COMPLETE - Changes have been saved\n');
  }

  console.log(`Total documents processed:    ${stats.totalProcessed}`);
  console.log(`✅ Successfully recovered:     ${stats.successfullyRecovered} (${Math.round(stats.successfullyRecovered / stats.totalProcessed * 100)}%)`);
  console.log(`⚠️  Still unknown:             ${stats.stillUnknown} (${Math.round(stats.stillUnknown / stats.totalProcessed * 100)}%)`);
  console.log(`❌ Errors:                     ${stats.errors}`);

  console.log('\n' + '═'.repeat(60));

  if (dryRun && stats.successfullyRecovered > 0) {
    console.log('\n💡 To execute this migration, run:');
    console.log('   npm run migrate:uploaders -- --project PROJECT_ID --execute\n');
  }
}

/**
 * Main migration function
 */
async function runMigration(options: MigrationOptions) {
  console.log('\n🚀 Starting Uploader Name Migration');
  console.log('═'.repeat(60));

  const {
    projectId,
    allProjects = false,
    execute = false,
    batchSize = 50,
    limit
  } = options;

  // Validate options
  if (!projectId && !allProjects) {
    console.error('❌ Error: Please specify --project PROJECT_ID or --all');
    process.exit(1);
  }

  if (allProjects) {
    console.error('❌ Error: --all flag not yet implemented. Please specify a project ID.');
    process.exit(1);
  }

  const dryRun = !execute;

  try {
    // Get documents missing uploader names
    const documents = await getDocumentsMissingUploaderNames(projectId!, limit);

    if (documents.length === 0) {
      console.log('✅ No documents found missing uploader names. Migration not needed.');
      return;
    }

    // Process in batches
    const stats = await processBatch(projectId!, documents, batchSize, dryRun);

    // Print results
    printStatistics(stats, dryRun);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    batchSize: 50
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--project':
        options.projectId = args[++i];
        break;
      case '--all':
        options.allProjects = true;
        break;
      case '--execute':
        options.execute = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`❌ Unknown flag: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Uploader Name Migration Script

Usage:
  npm run migrate:uploaders -- [options]

Options:
  --project PROJECT_ID    Specify project ID to migrate
  --all                   Migrate all projects (not yet implemented)
  --execute               Execute migration (default: dry-run only)
  --batch-size N          Documents per batch (default: 50)
  --limit N               Limit total documents to process
  --help                  Show this help message

Examples:
  # Dry-run for specific project
  npm run migrate:uploaders -- --project abc123

  # Execute migration for specific project
  npm run migrate:uploaders -- --project abc123 --execute

  # Test with limited documents
  npm run migrate:uploaders -- --project abc123 --limit 10
  `);
}

// Run migration if executed directly (ES module check)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const options = parseArgs();
  runMigration(options)
    .then(() => {
      console.log('\n✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

export { runMigration, MigrationOptions, MigrationStats };
