import { collection, getDocs, query, where, doc, getDoc, updateDoc, arrayUnion, arrayRemove, setDoc, serverTimestamp, addDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, UserGroup } from '../types';

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
  },

  async getUserGroups(): Promise<UserGroup[]> {
    try {
      const groupsRef = collection(db, 'userGroups');
      const snapshot = await getDocs(groupsRef);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as UserGroup));
    } catch (error) {
      console.error('Error fetching user groups:', error);
      throw new Error('Failed to fetch user groups');
    }
  },

  async getUserGroupById(groupId: string): Promise<UserGroup | null> {
    try {
      const groupRef = doc(db, 'userGroups', groupId);
      const snapshot = await getDoc(groupRef);
      
      if (!snapshot.exists()) {
        return null;
      }
      
      return {
        id: snapshot.id,
        ...snapshot.data()
      } as UserGroup;
    } catch (error) {
      console.error('Error fetching user group:', error);
      return null;
    }
  },

  async createUserGroup(group: Omit<UserGroup, 'id' | 'metadata'>): Promise<UserGroup> {
    try {
      const newGroup = {
        ...group,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      };
      
      const docRef = collection(db, 'userGroups');
      const newDoc = await addDoc(docRef, newGroup);
      
      return {
        id: newDoc.id,
        ...newGroup
      } as UserGroup;
    } catch (error) {
      console.error('Error creating user group:', error);
      throw new Error('Failed to create user group');
    }
  },

  async updateUserGroup(groupId: string, updates: Partial<UserGroup>): Promise<void> {
    try {
      const groupRef = doc(db, 'userGroups', groupId);
      
      // Don't allow direct updates to userIds or metadata through this method
      const { userIds, metadata, ...validUpdates } = updates;
      
      await updateDoc(groupRef, {
        ...validUpdates,
        'metadata.updatedAt': new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating user group:', error);
      throw new Error('Failed to update user group');
    }
  },

  async deleteUserGroup(groupId: string): Promise<void> {
    try {
      const groupRef = doc(db, 'userGroups', groupId);
      
      // First, get all users in this group
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('groupIds', 'array-contains', groupId));
      const snapshot = await getDocs(q);
      
      // Remove group from all users
      const batch = writeBatch(db);
      snapshot.docs.forEach(userDoc => {
        batch.update(userDoc.ref, {
          groupIds: arrayRemove(groupId)
        });
      });
      
      // Delete the group
      batch.delete(groupRef);
      await batch.commit();
    } catch (error) {
      console.error('Error deleting user group:', error);
      throw new Error('Failed to delete user group');
    }
  },

  async addUserToGroup(userId: string, groupId: string): Promise<void> {
    try {
      // Update user document
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        groupIds: arrayUnion(groupId)
      });
      
      // Update group document
      const groupRef = doc(db, 'userGroups', groupId);
      await updateDoc(groupRef, {
        userIds: arrayUnion(userId),
        'metadata.updatedAt': new Date().toISOString()
      });
    } catch (error) {
      console.error('Error adding user to group:', error);
      throw new Error('Failed to add user to group');
    }
  },

  async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
    try {
      // Update user document
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        groupIds: arrayRemove(groupId)
      });
      
      // Update group document
      const groupRef = doc(db, 'userGroups', groupId);
      await updateDoc(groupRef, {
        userIds: arrayRemove(userId),
        'metadata.updatedAt': new Date().toISOString()
      });
    } catch (error) {
      console.error('Error removing user from group:', error);
      throw new Error('Failed to remove user from group');
    }
  },

  async getUsersInGroup(groupId: string): Promise<User[]> {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('groupIds', 'array-contains', groupId));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as User));
    } catch (error) {
      console.error('Error fetching users in group:', error);
      throw new Error('Failed to fetch users in group');
    }
  },

  // Update a user's role (Staff or Client)
  async updateUserRole(userId: string, role: 'Staff' | 'Client'): Promise<void> {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        throw new Error('User not found');
      }
      
      await updateDoc(userRef, {
        role,
        updatedAt: serverTimestamp()
      });
      
      console.log(`Updated user ${userId} role to ${role}`);
    } catch (error) {
      console.error('Error updating user role:', error);
      throw new Error('Failed to update user role');
    }
  }
};