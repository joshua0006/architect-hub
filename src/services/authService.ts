import { 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile as firebaseUpdateProfile
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../lib/firebase';
import { User, UserRole } from '../types/auth';

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

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Error resetting password:', error);
      throw new Error('Failed to send password reset email');
    }
  }
};