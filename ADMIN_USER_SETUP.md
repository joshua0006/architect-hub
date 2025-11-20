# Admin User Setup Guide

## Current Status

✅ **Firebase Auth User Created**
- Email: joshua@jezweb.net
- Password: jezwebinfo
- UID: GTYxQaOoyTWODSiqzyx6K28k71J3

❌ **Firestore Document Missing**
- Cannot create due to security rules not deployed

## Quick Fix: Deploy Security Rules First

### Option 1: Deploy Security Rules (Recommended)

```bash
# Step 1: Install Firebase CLI (if not installed)
npm install -g firebase-tools

# Step 2: Login to Firebase
firebase login

# Step 3: Deploy security rules to new Firebase project
npm run firebase:deploy-new
```

Wait for deployment to complete, then run:

```bash
# Step 4: Add user document to Firestore
npm run firebase:add-user-doc
```

### Option 2: Manually Create User Document in Firebase Console

If you can't deploy rules or prefer manual setup:

1. **Open Firebase Console:**
   https://console.firebase.google.com/project/chris-cole-test/firestore/data

2. **Create new document in `users` collection:**
   - Click "Start collection" or navigate to existing `users` collection
   - Document ID: `GTYxQaOoyTWODSiqzyx6K28k71J3`

3. **Add fields:**

```json
{
  "id": "GTYxQaOoyTWODSiqzyx6K28k71J3",
  "email": "joshua@jezweb.net",
  "displayName": "Joshua",
  "role": "Admin",
  "projectIds": [],
  "groupIds": [],
  "profile": {
    "photoURL": null,
    "bio": "",
    "title": "Administrator",
    "phone": "",
    "location": "",
    "timezone": "America/New_York",
    "notifications": {
      "email": true,
      "push": true
    }
  },
  "metadata": {
    "lastLogin": "2025-11-20T01:45:00.000Z",
    "createdAt": "2025-11-20T01:45:00.000Z",
    "updatedAt": "2025-11-20T01:45:00.000Z"
  }
}
```

**Field Types:**
- `id`, `email`, `displayName`, `role`: string
- `projectIds`, `groupIds`: array
- `profile`: map (nested object)
- `metadata`: map (nested object)
- Timestamps can be created as strings (ISO format) or use Firebase timestamp type

4. **Save the document**

### Option 3: Temporarily Relax Security Rules

**⚠️ WARNING: Only for development/testing!**

1. Open Firebase Console → Firestore → Rules
2. Temporarily change the users rule:

```javascript
// TEMPORARY - DEVELOPMENT ONLY
match /users/{userId} {
  allow read, write: if true;  // Allow all access temporarily
}
```

3. Publish rules
4. Run: `npm run firebase:add-user-doc`
5. **IMPORTANT:** Restore proper security rules immediately:

```javascript
match /users/{userId} {
  allow read: if isSignedIn();
  allow create: if isSignedIn() && request.auth.uid == userId;
  allow update: if isOwner(userId);
  allow delete: if false;
}
```

## Verification

Once the user document is created, verify the setup:

### 1. Check Firebase Console

**Auth:**
https://console.firebase.google.com/project/chris-cole-test/authentication/users

Should show: joshua@jezweb.net

**Firestore:**
https://console.firebase.google.com/project/chris-cole-test/firestore/data/users/GTYxQaOoyTWODSiqzyx6K28k71J3

Should show the user document with role: "Admin"

### 2. Test Login

```bash
# Make sure you're using the new Firebase
# .env should have: VITE_FIREBASE_ACTIVE=new

# Start dev server
npm run dev
```

1. Navigate to login page
2. Use credentials:
   - Email: joshua@jezweb.net
   - Password: jezwebinfo
3. Verify you can log in
4. Check that admin features are accessible

## Troubleshooting

### "Email already in use" error
The user already exists in Firebase Auth. You can:
- Use the existing user (UID: GTYxQaOoyTWODSiqzyx6K28k71J3)
- Delete the user in Firebase Console and recreate
- Use a different email address

### "Permission denied" error
- Security rules not deployed → Run deployment script
- Wrong Firebase project → Check VITE_FIREBASE_ACTIVE=new in .env
- Rules too restrictive → Use manual creation via Firebase Console

### User document exists but can't log in
- Verify the `role` field is exactly "Admin" (case-sensitive)
- Check that the user's UID matches the document ID
- Clear browser cache and try again

### Admin features not working
- Verify `role: "Admin"` in Firestore user document
- Check security rules are deployed correctly
- Ensure the application is reading from the correct Firebase project

## Next Steps

After successful admin user creation:

1. ✅ Deploy security rules (if not already done)
2. ✅ Create admin user document in Firestore
3. ✅ Test login with credentials
4. ✅ Verify admin permissions work
5. 📋 Run data migration: `npm run firebase:migrate`
6. 🎯 Test with migrated sample data

## Quick Reference

### Login Credentials
- **Email:** joshua@jezweb.net
- **Password:** jezwebinfo
- **Role:** Admin
- **UID:** GTYxQaOoyTWODSiqzyx6K28k71J3

### Firebase Console Links
- **Auth Users:** https://console.firebase.google.com/project/chris-cole-test/authentication/users
- **Firestore Data:** https://console.firebase.google.com/project/chris-cole-test/firestore/data
- **Security Rules:** https://console.firebase.google.com/project/chris-cole-test/firestore/rules

### NPM Scripts
```bash
npm run firebase:deploy-new      # Deploy security rules
npm run firebase:create-admin    # Create new admin user (Auth only)
npm run firebase:add-user-doc    # Add Firestore document for existing user
npm run firebase:migrate         # Migrate sample data
```
