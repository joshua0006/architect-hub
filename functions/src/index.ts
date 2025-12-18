import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
admin.initializeApp();

// Export Cloud Functions
export { createUser } from './createUser';
export { deleteUser } from './deleteUser';
