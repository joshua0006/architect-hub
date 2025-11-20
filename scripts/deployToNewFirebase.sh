#!/bin/bash
# Firebase Deployment Script for New Project
#
# This script deploys Firestore rules and indexes to the new Firebase project
# (chris-cole-test)
#
# Prerequisites:
# 1. Firebase CLI installed: npm install -g firebase-tools
# 2. Authenticated with Firebase: firebase login
# 3. New Firebase project created in console

echo ""
echo "🔥 Firebase Deployment to New Project"
echo "═══════════════════════════════════════════════════════════"
echo "Target Project: chris-cole-test"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found!"
    echo "Install with: npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase"
    echo "Run: firebase login"
    exit 1
fi

# Confirm deployment
echo "This will deploy:"
echo "  ✅ Firestore security rules (firestore.rules)"
echo "  ✅ Firestore indexes (firestore.indexes.json)"
echo ""
read -p "Continue with deployment? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

echo ""
echo "📋 Step 1: Setting active Firebase project"
firebase use chris-cole-test

if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  Project 'chris-cole-test' not found in your Firebase projects"
    echo "Adding project alias..."
    firebase use --add chris-cole-test
fi

echo ""
echo "📋 Step 2: Deploying Firestore rules"
firebase deploy --only firestore:rules --project chris-cole-test

if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy Firestore rules"
    exit 1
fi

echo ""
echo "📋 Step 3: Deploying Firestore indexes"
firebase deploy --only firestore:indexes --project chris-cole-test

if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy Firestore indexes"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Deployment Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📝 Next Steps:"
echo "   1. Wait for indexes to build (check Firebase Console)"
echo "   2. Run migration script: npm run migrate-firebase"
echo "   3. Switch to new Firebase: VITE_FIREBASE_ACTIVE=new"
echo ""
echo "🔗 Firebase Console: https://console.firebase.google.com/project/chris-cole-test"
echo ""
