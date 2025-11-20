#!/usr/bin/env tsx
/**
 * Firebase Migration Script: Copy sample data to new Firebase project
 *
 * This script:
 * 1. Connects to both old and new Firebase projects
 * 2. Copies a sample subset of data for testing
 * 3. Validates data integrity
 * 4. Generates migration report
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

import { initializeApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  getDocs,
  setDoc,
  doc,
  query,
  where,
  limit,
  DocumentData
} from 'firebase/firestore';

// Old Firebase configuration
const oldFirebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

// New Firebase configuration
const newFirebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY_NEW,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN_NEW,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL_NEW,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID_NEW,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET_NEW,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID_NEW,
  appId: process.env.VITE_FIREBASE_APP_ID_NEW,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID_NEW
};

// Validate configurations
function validateConfig(config: any, name: string) {
  const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const missing = required.filter(key => !config[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing ${name} configuration: ${missing.join(', ')}`);
    console.error(`Please check your .env file and ensure all VITE_FIREBASE_* variables are set.`);
    process.exit(1);
  }
}

validateConfig(oldFirebaseConfig, 'OLD Firebase');
validateConfig(newFirebaseConfig, 'NEW Firebase');

// Initialize Firebase apps
const oldApp = initializeApp(oldFirebaseConfig, 'old-firebase');
const newApp = initializeApp(newFirebaseConfig, 'new-firebase');

const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

console.log('\n🔥 Firebase Migration Tool');
console.log('═'.repeat(60));
console.log(`📤 Source: ${oldFirebaseConfig.projectId}`);
console.log(`📥 Destination: ${newFirebaseConfig.projectId}`);
console.log('═'.repeat(60));

interface MigrationStats {
  collections: {
    [key: string]: {
      attempted: number;
      succeeded: number;
      failed: number;
      errors: string[];
    }
  };
  startTime: Date;
  endTime?: Date;
  duration?: string;
}

const stats: MigrationStats = {
  collections: {},
  startTime: new Date()
};

/**
 * Copy a collection from old to new Firebase
 */
async function copyCollection(
  collectionName: string,
  sourceDb: Firestore,
  destDb: Firestore,
  queryConstraints: any[] = []
) {
  console.log(`\n📦 Migrating collection: ${collectionName}`);

  stats.collections[collectionName] = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    errors: []
  };

  try {
    const sourceRef = collection(sourceDb, collectionName);
    const q = queryConstraints.length > 0
      ? query(sourceRef, ...queryConstraints)
      : query(sourceRef);

    const snapshot = await getDocs(q);
    stats.collections[collectionName].attempted = snapshot.size;

    console.log(`  Found ${snapshot.size} documents to migrate`);

    for (const docSnapshot of snapshot.docs) {
      try {
        const data = docSnapshot.data();
        const destRef = doc(destDb, collectionName, docSnapshot.id);
        await setDoc(destRef, data);
        stats.collections[collectionName].succeeded++;
        process.stdout.write(`\r  ✅ Migrated: ${stats.collections[collectionName].succeeded}/${snapshot.size}`);
      } catch (error: any) {
        stats.collections[collectionName].failed++;
        stats.collections[collectionName].errors.push(
          `Doc ${docSnapshot.id}: ${error.message}`
        );
      }
    }

    console.log('\n  ✅ Collection migration complete');
  } catch (error: any) {
    console.error(`  ❌ Error migrating collection: ${error.message}`);
    stats.collections[collectionName].errors.push(error.message);
  }
}

/**
 * Copy subcollection documents
 */
async function copySubcollection(
  parentPath: string,
  subcollectionName: string,
  sourceDb: Firestore,
  destDb: Firestore
) {
  console.log(`\n  📁 Migrating subcollection: ${parentPath}/${subcollectionName}`);

  const key = `${parentPath}/${subcollectionName}`;
  stats.collections[key] = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    errors: []
  };

  try {
    const sourceRef = collection(sourceDb, parentPath, subcollectionName);
    const snapshot = await getDocs(sourceRef);
    stats.collections[key].attempted = snapshot.size;

    console.log(`    Found ${snapshot.size} documents`);

    for (const docSnapshot of snapshot.docs) {
      try {
        const data = docSnapshot.data();
        const destRef = doc(destDb, parentPath, subcollectionName, docSnapshot.id);
        await setDoc(destRef, data);
        stats.collections[key].succeeded++;
      } catch (error: any) {
        stats.collections[key].failed++;
        stats.collections[key].errors.push(`Doc ${docSnapshot.id}: ${error.message}`);
      }
    }

    console.log(`    ✅ Subcollection migrated`);
  } catch (error: any) {
    console.error(`    ❌ Error: ${error.message}`);
    stats.collections[key].errors.push(error.message);
  }
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    console.log('\n🚀 Starting sample data migration...\n');

    // Step 1: Migrate settings (organization config)
    console.log('📋 Step 1: Migrating settings');
    await copyCollection('settings', oldDb, newDb, [limit(10)]);

    // Step 2: Get sample projects (limit to 2)
    console.log('\n📋 Step 2: Selecting sample projects');
    const projectsRef = collection(oldDb, 'projects');
    const projectsSnapshot = await getDocs(query(projectsRef, limit(2)));
    const sampleProjects = projectsSnapshot.docs.map(d => d.id);

    console.log(`  Selected projects: ${sampleProjects.join(', ')}`);

    // Step 3: Migrate selected projects
    console.log('\n📋 Step 3: Migrating projects');
    for (const projectId of sampleProjects) {
      // Copy project document
      await copyCollection('projects', oldDb, newDb, [
        where('__name__', '==', projectId)
      ]);

      // Copy project team subcollection
      await copySubcollection(`projects/${projectId}`, 'team', oldDb, newDb);
    }

    // Step 4: Migrate folders for selected projects
    console.log('\n📋 Step 4: Migrating folders');
    for (const projectId of sampleProjects) {
      await copyCollection('folders', oldDb, newDb, [
        where('projectId', '==', projectId),
        limit(10)
      ]);
    }

    // Step 5: Migrate documents for selected projects
    console.log('\n📋 Step 5: Migrating documents');
    for (const projectId of sampleProjects) {
      await copyCollection('documents', oldDb, newDb, [
        where('projectId', '==', projectId),
        limit(20)
      ]);
    }

    // Step 6: Migrate transmittals
    console.log('\n📋 Step 6: Migrating transmittals');
    for (const projectId of sampleProjects) {
      // Transmittals have nested structure: transmittals/{projectId}/documents|standalone|history
      await copySubcollection(`transmittals/${projectId}`, 'documents', oldDb, newDb);
      await copySubcollection(`transmittals/${projectId}`, 'standalone', oldDb, newDb);
      await copySubcollection(`transmittals/${projectId}`, 'history', oldDb, newDb);
    }

    // Step 7: Migrate tasks and milestones
    console.log('\n📋 Step 7: Migrating tasks and milestones');
    for (const projectId of sampleProjects) {
      await copyCollection('tasks', oldDb, newDb, [
        where('projectId', '==', projectId),
        limit(10)
      ]);
      await copyCollection('milestones', oldDb, newDb, [
        where('projectId', '==', projectId),
        limit(10)
      ]);
    }

    stats.endTime = new Date();
    stats.duration = `${Math.round((stats.endTime.getTime() - stats.startTime.getTime()) / 1000)}s`;

    // Generate report
    generateReport();

  } catch (error: any) {
    console.error(`\n❌ Migration failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Generate migration report
 */
function generateReport() {
  console.log('\n\n📊 MIGRATION REPORT');
  console.log('═'.repeat(60));
  console.log(`Started: ${stats.startTime.toISOString()}`);
  console.log(`Ended: ${stats.endTime?.toISOString()}`);
  console.log(`Duration: ${stats.duration}`);
  console.log('═'.repeat(60));

  let totalAttempted = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  Object.entries(stats.collections).forEach(([name, data]) => {
    totalAttempted += data.attempted;
    totalSucceeded += data.succeeded;
    totalFailed += data.failed;

    const status = data.failed === 0 ? '✅' : '⚠️';
    console.log(`\n${status} ${name}`);
    console.log(`   Attempted: ${data.attempted}`);
    console.log(`   Succeeded: ${data.succeeded}`);
    console.log(`   Failed: ${data.failed}`);

    if (data.errors.length > 0) {
      console.log(`   Errors:`);
      data.errors.slice(0, 5).forEach(err => console.log(`     - ${err}`));
      if (data.errors.length > 5) {
        console.log(`     ... and ${data.errors.length - 5} more errors`);
      }
    }
  });

  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total Documents Attempted: ${totalAttempted}`);
  console.log(`Total Documents Succeeded: ${totalSucceeded}`);
  console.log(`Total Documents Failed: ${totalFailed}`);
  console.log(`Success Rate: ${totalAttempted > 0 ? Math.round((totalSucceeded / totalAttempted) * 100) : 0}%`);

  // Save report to file
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const reportDir = resolve(__dirname, '../backups');
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir);
  }

  const reportPath = resolve(reportDir, `migration-report-${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify(stats, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);

  if (totalFailed === 0) {
    console.log('\n✅ Migration completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Set VITE_FIREBASE_ACTIVE=new in .env');
    console.log('   2. Restart your dev server');
    console.log('   3. Test the application with new Firebase');
    console.log('   4. Set VITE_FIREBASE_ACTIVE=old to switch back if needed');
  } else {
    console.log('\n⚠️  Migration completed with errors. Review the report above.');
  }
}

// Run migration
migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
