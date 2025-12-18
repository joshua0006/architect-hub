"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUser = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/**
 * Cloud Function to create a new user account in Firebase Auth and Firestore
 * Only admins can create users
 */
exports.createUser = functions.https.onCall(async (request) => {
    var _a;
    // 1. Authentication check
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated to create users');
    }
    // 2. Validate input
    const data = request.data;
    if (!data.email || typeof data.email !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'email is required and must be a string');
    }
    if (!data.password || typeof data.password !== 'string' || data.password.length < 6) {
        throw new functions.https.HttpsError('invalid-argument', 'password is required and must be at least 6 characters');
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
        if (!callerDoc.exists || ((_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'Admin') {
            throw new functions.https.HttpsError('permission-denied', 'Only administrators can create user accounts');
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
    }
    catch (error) {
        console.error('Error creating user:', error);
        // Re-throw HttpsErrors as-is
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        // Wrap other errors
        throw new functions.https.HttpsError('internal', `Failed to create user: ${error.message || 'Unknown error'}`);
    }
});
//# sourceMappingURL=createUser.js.map