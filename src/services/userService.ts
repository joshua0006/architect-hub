import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from '../types/auth';

export const userService = {
  async getAllUsers(): Promise<User[]> {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
    } catch (error) {
      console.error('Error fetching users:', error);
      throw new Error('Failed to fetch users');
    }
  },

  async getUsersByRole(role: string): Promise<User[]> {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', '==', role));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
    } catch (error) {
      console.error('Error fetching users by role:', error);
      throw new Error('Failed to fetch users by role');
    }
  },

  async getUsersByProject(projectId: string): Promise<User[]> {
    try {
      // Check if projectId is valid
      if (!projectId || projectId.trim() === '') {
        console.warn('No projectId provided to getUsersByProject, falling back to getAllUsers');
        return this.getAllUsers();
      }

      console.log(`Fetching users for project: ${projectId}`);
      
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('projectIds', 'array-contains', projectId));
      
      try {
        const snapshot = await getDocs(q);
        const users = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as User));
        
        console.log(`Found ${users.length} users for project ${projectId}`);
        return users;
      } catch (queryError) {
        console.error('Error in Firestore query:', queryError);
        
        // If the query fails, fall back to getting all users
        console.warn('Falling back to getAllUsers due to query error');
        return this.getAllUsers();
      }
    } catch (error) {
      console.error('Error fetching users by project:', error);
      
      // Return empty array instead of throwing to prevent UI failures
      console.warn('Returning empty array due to error in getUsersByProject');
      return [];
    }
  },

  async getUserByUsername(username: string): Promise<User | null> {
    try {
      // First try an exact match on displayName
      const usersRef = collection(db, 'users');
      const exactQuery = query(usersRef, where('displayName', '==', username));
      const exactSnapshot = await getDocs(exactQuery);
      
      // If we have an exact match, return the first one
      if (!exactSnapshot.empty) {
        const userData = exactSnapshot.docs[0].data();
        return {
          id: exactSnapshot.docs[0].id,
          ...userData
        } as User;
      }
      
      // Otherwise try a case-insensitive search (requires a query on all users)
      const allUsersSnapshot = await getDocs(usersRef);
      const allUsers = allUsersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
      
      // Find a case-insensitive match
      const matchingUser = allUsers.find(
        user => user.displayName.toLowerCase() === username.toLowerCase()
      );
      
      return matchingUser || null;
    } catch (error) {
      console.error('Error fetching user by username:', error);
      return null;
    }
  },
  
  async getUsersByUsernamePrefix(prefix: string): Promise<User[]> {
    try {
      if (!prefix || prefix.length < 2) {
        return [];
      }
      
      // Get all users (Firestore doesn't support prefix/LIKE queries)
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const allUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
      
      // Filter users by prefix (case insensitive)
      return allUsers.filter(user => 
        user.displayName.toLowerCase().startsWith(prefix.toLowerCase())
      );
    } catch (error) {
      console.error('Error fetching users by username prefix:', error);
      return [];
    }
  }
};