import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Permission, User, UserGroup, AccessLog, PermissionAction, PermissionResource } from '../types';

export const permissionService = {
  // Permission CRUD operations
  async createPermission(permission: Omit<Permission, 'id'>): Promise<Permission> {
    try {
      const permissionsRef = collection(db, 'permissions');
      const docRef = await addDoc(permissionsRef, {
        ...permission,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      return {
        id: docRef.id,
        ...permission
      };
    } catch (error) {
      console.error('Error creating permission:', error);
      throw new Error('Failed to create permission');
    }
  },
  
  async getPermissionById(permissionId: string): Promise<Permission | null> {
    try {
      const permissionRef = doc(db, 'permissions', permissionId);
      const permissionSnap = await getDoc(permissionRef);
      
      if (!permissionSnap.exists()) {
        return null;
      }
      
      return {
        id: permissionSnap.id,
        ...permissionSnap.data()
      } as Permission;
    } catch (error) {
      console.error('Error getting permission:', error);
      return null;
    }
  },
  
  async updatePermission(permissionId: string, updates: Partial<Permission>): Promise<void> {
    try {
      const permissionRef = doc(db, 'permissions', permissionId);
      await updateDoc(permissionRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      throw new Error('Failed to update permission');
    }
  },
  
  async deletePermission(permissionId: string): Promise<void> {
    try {
      // First remove this permission from all user groups that have it
      const groupsRef = collection(db, 'userGroups');
      const groupsSnapshot = await getDocs(groupsRef);
      
      // Update all groups to remove this permission
      const updatePromises = groupsSnapshot.docs.map(async (groupDoc) => {
        const group = groupDoc.data() as UserGroup;
        if (group.permissions.some(p => p.id === permissionId)) {
          // Filter out the permission
          const updatedPermissions = group.permissions.filter(p => p.id !== permissionId);
          await updateDoc(groupDoc.ref, {
            permissions: updatedPermissions,
            'metadata.updatedAt': serverTimestamp()
          });
        }
      });
      
      await Promise.all(updatePromises);
      
      // Then delete the permission
      const permissionRef = doc(db, 'permissions', permissionId);
      await deleteDoc(permissionRef);
    } catch (error) {
      console.error('Error deleting permission:', error);
      throw new Error('Failed to delete permission');
    }
  },
  
  // Get all permissions with optional filtering
  async getPermissions(
    action?: PermissionAction, 
    resource?: PermissionResource,
    resourceId?: string
  ): Promise<Permission[]> {
    try {
      let q = collection(db, 'permissions');
      let queryRef = query(q);
      
      // Apply filters if provided
      if (action) {
        queryRef = query(queryRef, where('action', '==', action));
      }
      
      if (resource) {
        queryRef = query(queryRef, where('resource', '==', resource));
      }
      
      if (resourceId) {
        queryRef = query(queryRef, where('resourceId', '==', resourceId));
      }
      
      const snapshot = await getDocs(queryRef);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Permission));
    } catch (error) {
      console.error('Error getting permissions:', error);
      throw new Error('Failed to get permissions');
    }
  },
  
  // User group permission management
  async addPermissionToGroup(groupId: string, permission: Permission): Promise<void> {
    try {
      const groupRef = doc(db, 'userGroups', groupId);
      const groupSnap = await getDoc(groupRef);
      
      if (!groupSnap.exists()) {
        throw new Error('User group not found');
      }
      
      const group = groupSnap.data() as UserGroup;
      
      // Check if permission already exists
      if (group.permissions.some(p => p.id === permission.id)) {
        return; // Permission already exists in group
      }
      
      // Add permission to group
      await updateDoc(groupRef, {
        permissions: arrayUnion(permission),
        'metadata.updatedAt': serverTimestamp()
      });
    } catch (error) {
      console.error('Error adding permission to group:', error);
      throw new Error('Failed to add permission to group');
    }
  },
  
  async removePermissionFromGroup(groupId: string, permissionId: string): Promise<void> {
    try {
      const groupRef = doc(db, 'userGroups', groupId);
      const groupSnap = await getDoc(groupRef);
      
      if (!groupSnap.exists()) {
        throw new Error('User group not found');
      }
      
      const group = groupSnap.data() as UserGroup;
      
      // Find the permission
      const permissionToRemove = group.permissions.find(p => p.id === permissionId);
      
      if (!permissionToRemove) {
        return; // Permission not in group
      }
      
      // Remove permission from group
      await updateDoc(groupRef, {
        permissions: arrayRemove(permissionToRemove),
        'metadata.updatedAt': serverTimestamp()
      });
    } catch (error) {
      console.error('Error removing permission from group:', error);
      throw new Error('Failed to remove permission from group');
    }
  },
  
  // Permission checking
  async userHasPermission(
    userId: string,
    action: PermissionAction,
    resource: PermissionResource,
    resourceId: string
  ): Promise<boolean> {
    try {
      // Get user
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        return false; // User not found
      }
      
      const user = userSnap.data() as User;
      
      // Admin users have all permissions
      if (user.role === 'Admin') {
        return true;
      }
      
      // Staff have more permissions than clients and contractors
      if (user.role === 'Staff') {
        // Staff can access projects they're part of
        if (resource === 'project' && user.projectIds.includes(resourceId)) {
          return true;
        }
        
        // Staff can always view files/folders in their projects
        if ((resource === 'file' || resource === 'folder') && action === 'view') {
          // Get the project ID for this resource
          let projectId = '';
          
          if (resource === 'file') {
            const fileRef = doc(db, 'documents', resourceId);
            const fileSnap = await getDoc(fileRef);
            if (fileSnap.exists()) {
              projectId = fileSnap.data().projectId;
            }
          } else {
            const folderRef = doc(db, 'folders', resourceId);
            const folderSnap = await getDoc(folderRef);
            if (folderSnap.exists()) {
              projectId = folderSnap.data().projectId;
            }
          }
          
          if (projectId && user.projectIds.includes(projectId)) {
            return true;
          }
        }
      }
      
      // Check user groups
      if (!user.groupIds || user.groupIds.length === 0) {
        return false; // User not in any groups
      }
      
      // Get all groups the user is in
      const userGroups: UserGroup[] = [];
      for (const groupId of user.groupIds) {
        const groupRef = doc(db, 'userGroups', groupId);
        const groupSnap = await getDoc(groupRef);
        
        if (groupSnap.exists()) {
          userGroups.push({
            id: groupSnap.id,
            ...groupSnap.data()
          } as UserGroup);
        }
      }
      
      // Check if any group has the required permission
      for (const group of userGroups) {
        const hasPermission = group.permissions.some(p => 
          p.action === action && 
          p.resource === resource && 
          (p.resourceId === resourceId || p.resourceId === '*')
        );
        
        if (hasPermission) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error checking user permission:', error);
      return false;
    }
  },
  
  // Audit and logging
  async logAccess(accessLog: Omit<AccessLog, 'id' | 'timestamp'>): Promise<void> {
    try {
      const logsRef = collection(db, 'accessLogs');
      await addDoc(logsRef, {
        ...accessLog,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error logging access:', error);
      // Don't throw here to prevent disrupting user flow
    }
  },
  
  async getAccessLogs(
    resourceType?: PermissionResource,
    resourceId?: string,
    userId?: string,
    startDate?: Date,
    endDate?: Date,
    limit = 100
  ): Promise<AccessLog[]> {
    try {
      let q = collection(db, 'accessLogs');
      let queryRef = query(q);
      
      // Apply filters
      if (resourceType) {
        queryRef = query(queryRef, where('resourceType', '==', resourceType));
      }
      
      if (resourceId) {
        queryRef = query(queryRef, where('resourceId', '==', resourceId));
      }
      
      if (userId) {
        queryRef = query(queryRef, where('userId', '==', userId));
      }
      
      // Date filters must be applied client-side for Firestore
      const snapshot = await getDocs(queryRef);
      let logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AccessLog));
      
      // Filter by date if necessary
      if (startDate || endDate) {
        logs = logs.filter(log => {
          const logDate = new Date(log.timestamp);
          
          if (startDate && logDate < startDate) {
            return false;
          }
          
          if (endDate && logDate > endDate) {
            return false;
          }
          
          return true;
        });
      }
      
      // Sort by timestamp (newest first)
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Apply limit
      return logs.slice(0, limit);
    } catch (error) {
      console.error('Error getting access logs:', error);
      return [];
    }
  }
}; 