import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FolderPermission } from '../types';
import { hasAccessToFolder } from '../constants/folderTemplates';

const COLLECTION = 'folderPermissions';

export const folderPermissionService = {
  /**
   * Get all folder permissions for a project
   */
  async getByProjectId(projectId: string): Promise<FolderPermission[]> {
    try {
      const q = query(
        collection(db, COLLECTION),
        where('projectId', '==', projectId)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FolderPermission));
    } catch (error) {
      console.error('Error fetching folder permissions:', error);
      throw new Error('Failed to fetch folder permissions');
    }
  },

  /**
   * Get permission for a specific folder
   */
  async getByFolderId(folderId: string): Promise<FolderPermission | null> {
    try {
      const q = query(
        collection(db, COLLECTION),
        where('folderId', '==', folderId)
      );
      
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      } as FolderPermission;
    } catch (error) {
      console.error('Error fetching folder permission:', error);
      return null;
    }
  },

  /**
   * Create a new folder permission
   */
  async create(permission: Omit<FolderPermission, 'id' | 'createdAt' | 'updatedAt'>): Promise<FolderPermission> {
    try {
      // Check if a permission already exists for this folder
      const existingPermission = await this.getByFolderId(permission.folderId);
      if (existingPermission) {
        throw new Error('Permission already exists for this folder');
      }
      
      const now = new Date().toISOString();
      const permissionData = {
        ...permission,
        createdAt: now,
        updatedAt: now
      };
      
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...permissionData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      return {
        id: docRef.id,
        ...permissionData
      };
    } catch (error) {
      console.error('Error creating folder permission:', error);
      throw new Error('Failed to create folder permission');
    }
  },

  /**
   * Update an existing folder permission
   */
  async update(id: string, updates: Partial<Omit<FolderPermission, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    try {
      const permissionRef = doc(db, COLLECTION, id);
      const now = new Date().toISOString();
      
      await updateDoc(permissionRef, {
        ...updates,
        updatedAt: now
      });
    } catch (error) {
      console.error('Error updating folder permission:', error);
      throw new Error('Failed to update folder permission');
    }
  },

  /**
   * Delete a folder permission
   */
  async delete(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('Error deleting folder permission:', error);
      throw new Error('Failed to delete folder permission');
    }
  },

  /**
   * Check if a user has access to a folder based on role and custom permissions
   */
  async hasAccess(folderId: string, userId: string, userRole: 'Staff' | 'Client' | 'Admin'): Promise<boolean> {
    try {
      // Staff and Admin always have access to all folders
      if (userRole === 'Staff' || userRole === 'Admin') {
        return true;
      }
      
      // Get the folder from Firestore to check its metadata
      const folderRef = doc(db, 'folders', folderId);
      const folderSnap = await getDoc(folderRef);
      
      if (!folderSnap.exists()) {
        return false; // Folder doesn't exist
      }
      
      const folderData = folderSnap.data();
      const defaultAccess = folderData.metadata?.access || 'STAFF_ONLY';
      
      // Check if there's a custom permission override for this folder
      const permission = await this.getByFolderId(folderId);
      
      if (permission && permission.overrideDefault) {
        // If using custom access users list
        if (permission.customAccessUsers?.length) {
          return permission.customAccessUsers.includes(userId);
        }
        
        // Otherwise use the access level
        return permission.accessLevel === 'ALL';
      }
      
      // No override, use default template permission
      return hasAccessToFolder(userRole, defaultAccess);
    } catch (error) {
      console.error('Error checking folder access:', error);
      // Default to no access on error
      return false;
    }
  }
}; 