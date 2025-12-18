import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

/**
 * Cloud Function to create a new user account in Firebase Auth and Firestore
 * Only admins can create users
 */
export const createUser = functions.https.onCall(
  async (request) => {
    // 1. Authentication check
    if (!request.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated to create users'
      );
    }

    // 2. Validate input
    const data = request.data;
    if (!data.email || typeof data.email !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'email is required and must be a string'
      );
    }

    if (!data.password || typeof data.password !== 'string' || data.password.length < 6) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'password is required and must be at least 6 characters'
      );
    }

    const callerUid = request.auth.uid;
    const email = data.email;
    const displayName = data.displayName || '';
    const role = data.role || 'User';
    const password = data.password;

    try {
      // 3. Admin authorization check
      const callerDoc = await admin
        .firestore()
        .collection('users')
        .doc(callerUid)
        .get();

      if (!callerDoc.exists || callerDoc.data()?.role !== 'Admin') {
        throw new functions.https.HttpsError(
          'permission-denied',
          'Only administrators can create user accounts'
        );
      }

      // 4. Create Firebase Auth account
      const userRecord = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: displayName,
      });
      console.log(`Firebase Auth account created for user: ${userRecord.uid}`);

      // 5. Create Firestore user document
      await admin
        .firestore()
        .collection('users')
        .doc(userRecord.uid)
        .set({
          email: email,
          displayName: displayName,
          role: role,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      console.log(`Firestore document created for user: ${userRecord.uid}`);

      // 6. Create audit log
      await admin
        .firestore()
        .collection('accessLogs')
        .add({
          action: 'user_created',
          performedBy: callerUid,
          performedByEmail: request.auth.token.email || 'unknown',
          targetUserId: userRecord.uid,
          targetUserEmail: email,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

      console.log(`User creation completed successfully: ${userRecord.uid}`);
      return {
        success: true,
        userId: userRecord.uid,
        email: email,
        message: 'User account created successfully',
      };
    } catch (error: any) {
      console.error('Error creating user:', error);

      // Re-throw HttpsErrors as-is
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      // Wrap other errors
      throw new functions.https.HttpsError(
        'internal',
        `Failed to create user: ${error.message || 'Unknown error'}`
      );
    }
  }
);
