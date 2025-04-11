import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  serverTimestamp,
  setDoc,
  CollectionReference,
  writeBatch
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Folder, Document } from '../types';
import { documentService } from './documentService';
import { folderPermissionService } from './folderPermissionService';
import { FolderAccessPermission } from '../contexts/AuthContext';
import { triggerFolderUpdate, FOLDER_UPDATE_EVENT } from './folderSubscriptionService';
import { triggerDocumentUpdate, DOCUMENT_UPDATE_EVENT } from './documentSubscriptionService';
import { triggerUserUpdate } from './userSubscriptionService';

const COLLECTION = 'folders';

export const folderService = {
  // Check if name exists in parent directory
  async checkNameExists(projectId: string, name: string, parentId?: string): Promise<boolean> {
    try {
      // Check folders with same name
      const foldersQuery = query(
        collection(db, COLLECTION),
        where('projectId', '==', projectId),
        where('parentId', '==', parentId || null),
        where('name', '==', name)
      );
      const folderSnapshot = await getDocs(foldersQuery);
      if (!folderSnapshot.empty) return true;

      // Check documents with same name
      const documentsQuery = query(
        collection(db, 'documents'),
        where('projectId', '==', projectId),
        where('folderId', '==', parentId || null),
        where('name', '==', name)
      );
      const documentSnapshot = await getDocs(documentsQuery);
      return !documentSnapshot.empty;
    } catch (error) {
      console.error('Error checking name existence:', error);
      throw new Error('Failed to check name existence');
    }
  },

  // Get all folders for a project
  async getByProjectId(projectId: string): Promise<Folder[]> {
    const q = query(
      collection(db, COLLECTION),
      where('projectId', '==', projectId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));
  },

  // Get a single folder by ID
  async getById(id: string): Promise<Folder | null> {
    try {
      const docRef = doc(db, COLLECTION, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Folder : null;
    } catch (error) {
      console.error('Error getting folder:', error);
      return null;
    }
  },

  // Create a folder with auto-generated ID and documents subcollection
  async create(folder: Omit<Folder, 'id'>): Promise<Folder> {
    try {
      // Check if name already exists in parent directory
      const nameExists = await this.checkNameExists(folder.projectId, folder.name, folder.parentId);
      if (nameExists) {
        throw new Error(`A folder or file named "${folder.name}" already exists in this location`);
      }

      console.log('Creating folder:', folder);
      
      // Generate a unique folder ID using timestamp and random string
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const generatedFolderId = `folder_${timestamp}_${randomString}`;

      // Create a clean folder object without undefined values
      const cleanFolder: Record<string, any> = {
        projectId: folder.projectId,
        name: folder.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        metadata: {
          path: folder.parentId ? `${folder.parentId}/${generatedFolderId}` : generatedFolderId,
          level: folder.parentId ? 1 : 0, // Track nesting level
          access: folder.metadata?.access || 'STAFF_ONLY' // Ensure access is set from template
        }
      };

      // Only add parentId if it exists
      if (folder.parentId) {
        cleanFolder.parentId = folder.parentId;
        
        // Get parent folder to update metadata
        const parentRef = doc(db, COLLECTION, folder.parentId);
        const parentSnap = await getDoc(parentRef);
        if (parentSnap.exists()) {
          const parentData = parentSnap.data();
          cleanFolder.metadata.level = (parentData.metadata?.level || 0) + 1;
          cleanFolder.metadata.path = `${parentData.metadata?.path}/${generatedFolderId}`;
        }
      }

      console.log('Creating folder with data:', cleanFolder);
      
      // Create the folder document with the generated ID
      const docRef = doc(db, COLLECTION, generatedFolderId);
      await setDoc(docRef, cleanFolder);

      // Create documents subcollection with metadata
      const documentsCollectionRef = collection(docRef, 'documents');
      const metadataRef = doc(documentsCollectionRef, '_metadata');
      await setDoc(metadataRef, {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        totalDocuments: 0,
        settings: {
          maxFileSize: 50 * 1024 * 1024, // 50MB
          allowedTypes: ['pdf', 'dwg'],
          versionControl: true
        }
      });

      console.log('Created documents subcollection for folder:', generatedFolderId);

      return { 
        id: generatedFolderId,
        projectId: folder.projectId,
        name: folder.name,
        parentId: folder.parentId,
        metadata: {
          access: cleanFolder.metadata.access,
          path: cleanFolder.metadata.path,
          level: cleanFolder.metadata.level
        }
      };
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  },

  // Update a folder
  async update(id: string, name: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, id);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Folder not found');
      }

      const folder = { id: docSnap.id, ...docSnap.data() } as Folder;

      // Check if new name already exists in parent directory (excluding current folder)
      const nameExists = await this.checkNameExists(folder.projectId, name, folder.parentId);
      if (nameExists && name !== folder.name) {
        throw new Error(`A folder or file named "${name}" already exists in this location`);
      }

      await updateDoc(docRef, {
        name,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating folder:', error);
      throw error;
    }
  },

  // Delete a folder and its documents subcollection
  async delete(id: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const folderData = docSnap.data();
        
        // Get all documents in the documents subcollection
        const documentsRef = collection(docRef, 'documents');
        const documentsSnap = await getDocs(documentsRef);
        
        // Delete all documents in the subcollection
        const deletePromises = documentsSnap.docs.map(async (docSnapshot) => {
          if (docSnapshot.id !== '_metadata') {
            const documentRef = doc(documentsRef, docSnapshot.id);
            await deleteDoc(documentRef);
          }
        });
        
        // Wait for all document deletions to complete
        await Promise.all(deletePromises);
        
        // Delete the metadata document
        const metadataRef = doc(documentsRef, '_metadata');
        await deleteDoc(metadataRef);
        
        // Finally, delete the folder itself
        await deleteDoc(docRef);
        
        console.log('Successfully deleted folder and all its documents:', id);
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  },

  /**
   * Check if a user has access to a folder
   */
  async checkUserAccess(folderId: string, userId: string, userRole: 'Staff' | 'Client'): Promise<boolean> {
    return folderPermissionService.hasAccess(folderId, userId, userRole);
  },

  /**
   * Get all folders a user has access to in a project
   */
  async getAccessibleFolders(projectId: string, userId: string, userRole: 'Staff' | 'Client'): Promise<Folder[]> {
    try {
      const allFolders = await this.getByProjectId(projectId);
      
      if (userRole === 'Staff') {
        // Staff can access all folders
        return allFolders;
      }
      
      // For clients, filter folders they have access to
      const accessibleFolders: Folder[] = [];
      
      for (const folder of allFolders) {
        const hasAccess = await folderPermissionService.hasAccess(folder.id, userId, userRole);
        if (hasAccess) {
          accessibleFolders.push(folder);
        }
      }
      
      return accessibleFolders;
    } catch (error) {
      console.error('Error getting accessible folders:', error);
      return [];
    }
  },

  /**
   * Copy a folder and its contents to another location
   * This will copy the folder structure but will only create references to documents
   */
  async copyFolder(
    sourceFolderId: string, 
    destinationProjectId: string, 
    destinationParentId?: string
  ): Promise<string> {
    try {
      // Get the source folder
      const sourceFolder = await this.getById(sourceFolderId);
      if (!sourceFolder) {
        throw new Error('Source folder not found');
      }

      console.log(`Copying folder ${sourceFolder.name} (${sourceFolderId}) to project ${destinationProjectId}, parent ${destinationParentId || 'root'}`);

      // Map to keep track of original folder IDs to new folder IDs
      const folderIdMap = new Map<string, string>();

      // Function to recursively copy folders
      const copyFolderRecursive = async (
        folder: Folder, 
        destProjectId: string, 
        destParentId?: string
      ): Promise<string> => {
        // Create the new folder
        const newFolder = await this.create({
          name: folder.name,
          projectId: destProjectId,
          parentId: destParentId,
          metadata: {
            ...folder.metadata,
            // Reset path and level as they will be calculated in the create method
            path: undefined,
            level: undefined,
            // Keep access permissions
            access: (folder.metadata?.access as FolderAccessPermission) || 'STAFF_ONLY' as FolderAccessPermission
          }
        });

        // Store the mapping
        folderIdMap.set(folder.id, newFolder.id);
        console.log(`Created folder ${newFolder.name} with ID ${newFolder.id}`);

        // Get all subfolders
        const q = query(
          collection(db, COLLECTION),
          where('parentId', '==', folder.id)
        );
        const snapshot = await getDocs(q);
        const subfolders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));

        // Recursively copy subfolders
        for (const subfolder of subfolders) {
          await copyFolderRecursive(subfolder, destProjectId, newFolder.id);
        }

        // Get all documents in this folder
        const documentsRef = collection(db, 'documents');
        const documentsQuery = query(
          documentsRef,
          where('folderId', '==', folder.id)
        );
        const documentsSnapshot = await getDocs(documentsQuery);
        const documents = documentsSnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        } as Document));

        // Copy document references to the new folder
        const batch = writeBatch(db);
        for (const document of documents) {
          // Create a new document reference with same metadata but in the new folder
          const newDocRef = doc(documentsRef);
          batch.set(newDocRef, {
            name: document.name,
            projectId: destProjectId,
            folderId: newFolder.id,
            url: document.url, // Reuse the same URL
            type: document.type,
            version: document.version || 1,
            dateModified: serverTimestamp(),
            metadata: {
              ...(document.metadata || {}),
              originalDocumentId: document.id, // Reference to the original
              isCopy: true,
              size: document.metadata?.size,
              contentType: document.metadata?.contentType,
              originalFilename: document.metadata?.originalFilename,
              access: document.metadata?.access || 'STAFF_ONLY'
            }
          });
        }

        // Commit all document copies
        if (documents.length > 0) {
          await batch.commit();
          console.log(`Copied ${documents.length} document references to folder ${newFolder.id}`);
        }

        return newFolder.id;
      };

      // Start the recursive copy process
      const newFolderId = await copyFolderRecursive(sourceFolder, destinationProjectId, destinationParentId);
      
      // Trigger folder update events for both source and destination projects
      triggerFolderUpdate(sourceFolder.projectId, sourceFolderId, 'copy');
      if (destinationProjectId !== sourceFolder.projectId) {
        triggerFolderUpdate(destinationProjectId, newFolderId, 'copy');
        
        // When copying between projects, trigger user update to refresh project users
        triggerUserUpdate(undefined, 'update');
      }
      
      // Also trigger document update events for source and destination folders
      triggerDocumentUpdate(sourceFolderId);
      triggerDocumentUpdate(newFolderId);
      
      return newFolderId;
    } catch (error) {
      console.error('Error copying folder:', error);
      throw error;
    }
  },

  /**
   * Move a folder and its contents to another location
   */
  async moveFolder(
    sourceFolderId: string, 
    destinationProjectId: string, 
    destinationParentId?: string
  ): Promise<string> {
    try {
      // Get the source folder
      const sourceFolder = await this.getById(sourceFolderId);
      if (!sourceFolder) {
        throw new Error('Source folder not found');
      }

      console.log(`Moving folder ${sourceFolder.name} (${sourceFolderId}) to project ${destinationProjectId}, parent ${destinationParentId || 'root'}`);

      // Check if we're moving to the same parent
      if (sourceFolder.parentId === destinationParentId && sourceFolder.projectId === destinationProjectId) {
        console.log('Source and destination are the same, no need to move');
        return sourceFolderId;
      }

      // Check if the destination is a subfolder of the source (which would create a cycle)
      if (destinationParentId) {
        let currentFolder = await this.getById(destinationParentId);
        while (currentFolder && currentFolder.parentId) {
          if (currentFolder.id === sourceFolderId) {
            throw new Error('Cannot move a folder into its own subfolder');
          }
          currentFolder = await this.getById(currentFolder.parentId);
        }
      }

      // Check if name already exists in destination
      const nameExists = await this.checkNameExists(destinationProjectId, sourceFolder.name, destinationParentId);
      if (nameExists) {
        throw new Error(`A folder or file named "${sourceFolder.name}" already exists in the destination`);
      }

      // Get all documents in this folder
      const documentsRef = collection(db, 'documents');
      const documentsQuery = query(
        documentsRef,
        where('folderId', '==', sourceFolderId)
      );
      const documentsSnapshot = await getDocs(documentsQuery);
      const documents = documentsSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Document));

      // Get all subfolders recursively to update their projectId
      const getAllSubfolderIds = async (folderId: string): Promise<string[]> => {
        const result: string[] = [];
        const q = query(
          collection(db, COLLECTION),
          where('parentId', '==', folderId)
        );
        const snapshot = await getDocs(q);
        const subfolders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));
        
        for (const subfolder of subfolders) {
          result.push(subfolder.id);
          const subfolderIds = await getAllSubfolderIds(subfolder.id);
          result.push(...subfolderIds);
        }
        
        return result;
      };

      const subfolderIds = await getAllSubfolderIds(sourceFolderId);
      console.log(`Found ${subfolderIds.length} subfolders to move`);

      // Update the source folder with new parent and project
      const sourceRef = doc(db, COLLECTION, sourceFolderId);
      
      // Calculate new folder metadata
      let newMetadata: any = {
        ...sourceFolder.metadata,
        access: sourceFolder.metadata?.access || 'STAFF_ONLY'
      };
      
      // Update path based on new parent
      if (destinationParentId) {
        const parentFolder = await this.getById(destinationParentId);
        if (parentFolder && parentFolder.metadata?.path) {
          newMetadata.path = `${parentFolder.metadata.path}/${sourceFolderId}`;
          newMetadata.level = (parentFolder.metadata?.level || 0) + 1;
        } else {
          newMetadata.path = sourceFolderId;
          newMetadata.level = 0;
        }
      } else {
        newMetadata.path = sourceFolderId;
        newMetadata.level = 0;
      }

      // Update the source folder
      await updateDoc(sourceRef, {
        parentId: destinationParentId || null,
        projectId: destinationProjectId,
        updatedAt: serverTimestamp(),
        metadata: newMetadata
      });

      // Update all documents in the folder
      const batch = writeBatch(db);
      for (const document of documents) {
        const docRef = doc(documentsRef, document.id);
        batch.update(docRef, {
          projectId: destinationProjectId,
          updatedAt: serverTimestamp()
        });
      }
      
      if (documents.length > 0) {
        await batch.commit();
        console.log(`Updated ${documents.length} documents`);
      }

      // Update all subfolders
      for (const subfolderId of subfolderIds) {
        const folderRef = doc(db, COLLECTION, subfolderId);
        const subfolderSnap = await getDoc(folderRef);
        
        if (subfolderSnap.exists()) {
          const subfolderData = subfolderSnap.data() as Folder;
          
          // Update the subfolder
          await updateDoc(folderRef, {
            projectId: destinationProjectId,
            updatedAt: serverTimestamp()
          });
          
          // Update documents in the subfolder
          const subDocumentsQuery = query(
            documentsRef,
            where('folderId', '==', subfolderId)
          );
          const subDocumentsSnapshot = await getDocs(subDocumentsQuery);
          
          if (!subDocumentsSnapshot.empty) {
            const subBatch = writeBatch(db);
            subDocumentsSnapshot.docs.forEach(docSnap => {
              const docRef = doc(documentsRef, docSnap.id);
              subBatch.update(docRef, {
                projectId: destinationProjectId,
                updatedAt: serverTimestamp()
              });
            });
            await subBatch.commit();
            console.log(`Updated documents in subfolder ${subfolderId}`);
          }
        }
      }

      // Trigger folder update events for both source and destination projects
      triggerFolderUpdate(sourceFolder.projectId, sourceFolderId, 'move');
      if (destinationProjectId !== sourceFolder.projectId) {
        triggerFolderUpdate(destinationProjectId, sourceFolderId, 'move');
        
        // When moving between projects, trigger user update to refresh project users
        triggerUserUpdate(undefined, 'update');
      }
      
      // Also trigger document update events for the moved folder
      triggerDocumentUpdate(sourceFolderId);
      
      // If there's a destination parent folder, trigger update for it too
      if (destinationParentId) {
        triggerDocumentUpdate(destinationParentId);
      }
      
      return sourceFolderId;
    } catch (error) {
      console.error('Error moving folder:', error);
      throw error;
    }
  }
};