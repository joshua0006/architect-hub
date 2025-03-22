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
  CollectionReference
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Folder } from '../types';
import { documentService } from './documentService';

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
        parentId: folder.parentId
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
  }
};