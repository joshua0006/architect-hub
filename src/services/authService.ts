import { 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as firebaseUpdateProfile,
  deleteUser
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { User } from '../types/auth';
import { UserRole } from '../contexts/AuthContext';

export const authService = {


  async createUser(
    email: string,
    password: string,
    displayName: string,
    role: UserRole,
    profilePicture?: File | null
  ): Promise<User> {
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const { uid } = userCredential.user;

      // Upload profile picture if provided
      let photoURL = null;
      if (profilePicture) {
        const storageRef = ref(storage, `profile-pictures/${uid}`);
        await uploadBytes(storageRef, profilePicture);
        photoURL = await getDownloadURL(storageRef);

        // Update Firebase Auth profile
        await firebaseUpdateProfile(userCredential.user, {
          displayName,
          photoURL
        });
      } else {
        await firebaseUpdateProfile(userCredential.user, {
          displayName
        });
      }

      // Generate a unique user ID (using Firebase UID)
      const userId = uid;

      // Create user document in Firestore
      const userData: Omit<User, 'id'> = {
        email,
        displayName,
        role,
        projectIds: [],
        profile: {
          photoURL,
          bio: '',
          title: '',
          phone: '',
          location: '',
          timezone: 'UTC',
          notifications: {
            email: true,
            push: true
          }
        },
        metadata: {
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      // Create the user document with the generated ID
      await setDoc(doc(db, 'users', userId), {
        ...userData,
        id: userId, // Store the ID in the document as well
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return {
        id: userId,
        ...userData
      };
    } catch (error) {
      console.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  },
  
  async createUserWithoutSignIn(
    email: string,
    password: string,
    displayName: string,
    role: UserRole,
    profilePicture?: File | null
  ): Promise<User> {
    try {
      // This function requires Firebase Admin SDK to create users without logging in
      // As a workaround for client-side only, we'll mock the user creation
      // In a real production app, this would use the Admin SDK server-side
      
      // Generate a mock user ID
      const userId = `mock-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      
      // Create user document in Firestore
      const userData: Omit<User, 'id'> = {
        email,
        displayName,
        role,
        projectIds: [],
        profile: {
          photoURL: null, // We can't upload a profile picture without authentication
          bio: '',
          title: '',
          phone: '',
          location: '',
          timezone: 'UTC',
          notifications: {
            email: true,
            push: true
          }
        },
        metadata: {
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };

      // Create the user document with the generated ID
      await setDoc(doc(db, 'users', userId), {
        ...userData,
        id: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      return {
        id: userId,
        ...userData
      };
    } catch (error) {
      console.error('Error creating user without sign in:', error);
      throw new Error('Failed to create user');
    }
  },

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Error resetting password:', error);
      throw new Error('Failed to send password reset email');
    }
  },

  async deleteUserAccount(uid: string): Promise<void> {
    try {
      // Use Cloud Function with Firebase Admin SDK to delete user
      // This properly deletes both Firebase Auth account and Firestore document
      const { cloudFunctionService } = await import('./cloudFunctionService');
      await cloudFunctionService.deleteUser(uid);
    } catch (error) {
      console.error('Error deleting user account:', error);
      throw error;
    }
  }
};