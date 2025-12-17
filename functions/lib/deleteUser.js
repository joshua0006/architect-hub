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
exports.deleteUser = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
/**
 * Cloud Function to delete a user account from Firebase Auth and Firestore
 * Only admins can delete users, and admins cannot delete themselves
 */
exports.deleteUser = functions.https.onCall(async (request) => {
    var _a;
    // 1. Authentication check
    if (!request.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated to delete users');
    }
    // 2. Validate input
    const data = request.data;
    if (!data.userId || typeof data.userId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'userId is required and must be a string');
    }
    const callerUid = request.auth.uid;
    const targetUserId = data.userId;
    try {
        // 3. Admin authorization check
        const callerDoc = await admin
            .firestore()
            .collection('users')
            .doc(callerUid)
            .get();
        if (!callerDoc.exists || ((_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'Admin') {
            throw new functions.https.HttpsError('permission-denied', 'Only administrators can delete user accounts');
        }
        // 4. Self-deletion prevention
        if (targetUserId === callerUid) {
            throw new functions.https.HttpsError('failed-precondition', 'Admins cannot delete their own account');
        }
        // 5. Delete Firebase Auth account
        try {
            await admin.auth().deleteUser(targetUserId);
            console.log(`Firebase Auth account deleted for user: ${targetUserId}`);
        }
        catch (authError) {
            // If user doesn't exist in Auth, log warning but continue to clean up Firestore
            if (authError.code === 'auth/user-not-found') {
                console.warn(`User ${targetUserId} not found in Firebase Auth, continuing with Firestore cleanup`);
            }
            else {
                // For other auth errors, throw them
                throw authError;
            }
        }
        // 6. Delete Firestore user document
        await admin
            .firestore()
            .collection('users')
            .doc(targetUserId)
            .delete();
        console.log(`Firestore document deleted for user: ${targetUserId}`);
        // 7. Create audit log
        await admin
            .firestore()
            .collection('accessLogs')
            .add({
            action: 'user_deleted',
            performedBy: callerUid,
            performedByEmail: request.auth.token.email || 'unknown',
            targetUserId: targetUserId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`User deletion completed successfully: ${targetUserId}`);
        return {
            success: true,
            deletedUserId: targetUserId,
            message: 'User account deleted successfully',
        };
    }
    catch (error) {
        console.error('Error deleting user:', error);
        // Re-throw HttpsErrors as-is
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        // Wrap other errors
        throw new functions.https.HttpsError('internal', `Failed to delete user: ${error.message || 'Unknown error'}`);
    }
});
//# sourceMappingURL=deleteUser.js.map