# Firebase Migration Guide

This guide explains how to migrate your project to a new Firebase instance and switch between Firebase projects.

## 📋 Overview

This project now supports **dual Firebase configurations**, allowing you to:
- Run the same codebase with different Firebase projects
- Easily switch between "old" and "new" Firebase instances
- Migrate sample data for testing
- Maintain parallel environments

## 🔧 Configuration

### Environment Variables

Your `.env` file now contains configurations for both Firebase projects:

```env
# Toggle between Firebase projects
VITE_FIREBASE_ACTIVE=old  # Change to 'new' to use the new Firebase

# Old Firebase Project (structify-chris-cole)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=structify-chris-cole
# ... other old config

# New Firebase Project (chris-cole-test)
VITE_FIREBASE_API_KEY_NEW=...
VITE_FIREBASE_PROJECT_ID_NEW=chris-cole-test
# ... other new config
```

### Switching Between Firebase Projects

Simply change the `VITE_FIREBASE_ACTIVE` variable in `.env`:

```bash
# Use old Firebase (structify-chris-cole)
VITE_FIREBASE_ACTIVE=old

# Use new Firebase (chris-cole-test)
VITE_FIREBASE_ACTIVE=new
```

**Important:** After changing this variable, restart your development server:

```bash
npm run dev
```

## 🚀 Migration Steps

### Step 1: Deploy Security Rules and Indexes

Deploy Firestore rules and indexes to the new Firebase project:

```bash
npm run firebase:deploy-new
```

This script will:
- Set the active Firebase project to `chris-cole-test`
- Deploy `firestore.rules`
- Deploy `firestore.indexes.json`

**Prerequisites:**
- Firebase CLI installed: `npm install -g firebase-tools`
- Authenticated: `firebase login`

### Step 2: Run Sample Data Migration

Migrate a subset of data (sample projects, documents, transmittals) to the new Firebase:

```bash
npm run firebase:migrate
```

This script will:
- Connect to BOTH Firebase projects simultaneously
- Select 1-2 sample projects
- Copy projects, folders, documents, and transmittals
- Generate a migration report

**What gets migrated:**
- ✅ Settings (organization config)
- ✅ 2 sample projects (with metadata)
- ✅ Up to 10 folders per project
- ✅ Up to 20 documents per project
- ✅ Transmittal data (documents, standalone, history)
- ✅ Tasks and milestones (up to 10 each)
- ❌ User accounts (skipped for testing)
- ❌ Storage files (skipped for testing)

### Step 3: Test with New Firebase

Switch to the new Firebase project:

```bash
# In .env file
VITE_FIREBASE_ACTIVE=new
```

Restart your dev server:

```bash
npm run dev
```

**Test the following:**
- ✅ Application loads without errors
- ✅ Sample projects are visible
- ✅ Documents can be opened
- ✅ Transmittal data displays correctly
- ✅ No console errors

### Step 4: Switch Back if Needed

If you encounter issues, easily switch back to the old Firebase:

```bash
# In .env file
VITE_FIREBASE_ACTIVE=old
```

Restart dev server, and you're back to the original Firebase.

## 📊 Migration Report

After running the migration script, a detailed report is saved to:

```
backups/migration-report-[timestamp].json
```

The report includes:
- Collections migrated
- Success/failure counts
- Error details
- Duration and timing

## 🔍 Verification

### Check Current Firebase Project

The application logs which Firebase project is active on startup. Check the browser console for:

```
[FIREBASE] Initialized with project: chris-cole-test
```

### Verify Data

1. Open Firebase Console for the new project:
   - https://console.firebase.google.com/project/chris-cole-test

2. Navigate to Firestore Database

3. Verify collections exist:
   - `settings`
   - `projects`
   - `folders`
   - `documents`
   - `transmittals/{projectId}/documents`
   - `transmittals/{projectId}/standalone`
   - `transmittals/{projectId}/history`

## 📝 NPM Scripts

### Migration Scripts

```bash
# Deploy security rules and indexes to new Firebase
npm run firebase:deploy-new

# Migrate sample data to new Firebase
npm run firebase:migrate
```

### Existing Scripts

```bash
# Backup documents from current active Firebase
npm run backup:documents

# Restore documents to current active Firebase
npm run restore:documents

# List all projects in current active Firebase
npm run list:projects
```

## 🛡️ Security Rules

Both Firebase projects use the same security rules from `firestore.rules`. The deployment script ensures the new project has identical security configuration.

**Important:** The rules are role-based and require:
- User documents to exist in `/users/{userId}`
- Project team membership defined
- Proper role assignments (Admin, Staff, Manager, etc.)

Since user accounts are not migrated, you may need to:
1. Create test user accounts in Firebase Auth (new project)
2. Create corresponding user documents in Firestore
3. Assign users to projects via team subcollections

## ⚠️ Important Notes

### IndexedDB Persistence

When you switch Firebase projects, the browser's IndexedDB cache is tied to the Firebase project. After switching:

1. Clear browser cache if you experience issues
2. Hard refresh the page (Ctrl+Shift+R / Cmd+Shift+R)
3. Check that the correct project ID is logged in the console

### Parallel Development

You can work with both Firebase projects by:
- Using different browser profiles
- Using different `.env` files
- Running multiple dev servers on different ports

### Production Deployment

When deploying to production:
1. Ensure `.env` or deployment environment variables are correct
2. Set `VITE_FIREBASE_ACTIVE` to the desired project
3. Verify Firebase configuration in build logs
4. Test thoroughly before switching traffic

## 🔗 Useful Links

- **Old Firebase Console:** https://console.firebase.google.com/project/structify-chris-cole
- **New Firebase Console:** https://console.firebase.google.com/project/chris-cole-test
- **Firebase CLI Docs:** https://firebase.google.com/docs/cli

## 🆘 Troubleshooting

### Configuration Issues

If you see "Firebase configuration is missing required fields":

1. Check `.env` file has all `VITE_FIREBASE_*` variables
2. Verify `VITE_FIREBASE_ACTIVE` is set to `old` or `new`
3. Restart dev server after changing environment variables

### Migration Errors

If migration fails:

1. Check both Firebase projects are accessible
2. Verify Firebase CLI is authenticated: `firebase login`
3. Check the migration report in `backups/` for error details
4. Ensure security rules allow read access (run deploy script first)

### Permission Denied Errors

If you see "permission-denied" errors:

1. Verify security rules are deployed to new Firebase
2. Check that user accounts exist if testing with authentication
3. Ensure project team memberships are set up correctly

### IndexedDB Errors

If you see persistence errors:

1. Clear browser cache and storage
2. Try in incognito/private browsing mode
3. Check browser console for specific error codes

## 📞 Support

For issues or questions:
1. Check this guide first
2. Review migration report for error details
3. Check Firebase Console for both projects
4. Verify environment variables are correct
