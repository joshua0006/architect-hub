import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  increment,
  query,
  where,
  orderBy,
  setDoc
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Document, DocumentComment } from '../types';
import { folderService } from './folderService';

export const documentService = {
  // Get all documents in a folder
  async getByFolderId(folderId: string): Promise<Document[]> {
    try {
      // Query documents where folderId matches
      const q = query(
        collection(db, 'documents'),
        where('folderId', '==', folderId)
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs
        .filter(doc => doc.id !== '_metadata')
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Document));
    } catch (error) {
      console.error('Error getting documents:', error);
      throw new Error('Failed to get documents');
    }
  },

  // Create a document with file upload
  async create(
    folderId: string,
    document: Omit<Document, 'id' | 'url'>,
    file: File
  ): Promise<Document> {
    try {
      // Check if name already exists in parent directory
      const nameExists = await folderService.checkNameExists(document.projectId, document.name, folderId);
      if (nameExists) {
        throw new Error(`A file or folder named "${document.name}" already exists in this location`);
      }

      // Generate unique filename
      const timestamp = Date.now();
      const uniqueFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const storagePath = `documents/${folderId}/${uniqueFilename}`;

      let url: string;

      try {
        // Upload file to Firebase Storage
        const storageRef = ref(storage, storagePath);
        const metadata = {
          contentType: file.type,
          customMetadata: {
            originalFilename: file.name,
            folderId,
            version: '1'
          }
        };

        console.log(`Uploading file to Firebase Storage: ${storagePath}`);
        const uploadResult = await uploadBytes(storageRef, file, metadata);
        url = await getDownloadURL(uploadResult.ref);
        console.log(`File uploaded successfully, URL: ${url}`);
      } catch (uploadError) {
        console.error('Error uploading to Firebase Storage:', uploadError);
        throw new Error('Failed to upload file. Please try again later.');
      }

      // Create document in Firestore
      try {
        const documentsRef = collection(db, 'documents');
        const docRef = await addDoc(documentsRef, {
          projectId: document.projectId,
          name: document.name,
          type: document.type,
          folderId: folderId,
          version: 1,
          dateModified: new Date().toISOString(),
          url,
          storagePath,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          metadata: {
            originalFilename: file.name,
            contentType: file.type,
            size: file.size,
            version: 1
          }
        });

        console.log(`Document record created in Firestore: ${docRef.id}`);

        // Create initial version record
        try {
          const versionsRef = collection(docRef, 'versions');
          await setDoc(doc(versionsRef, 'v1'), {
            version: 1,
            url,
            uploadedAt: serverTimestamp(),
            metadata: {
              originalFilename: file.name,
              contentType: file.type,
              size: file.size
            }
          });
          console.log(`Document version record created`);
        } catch (versionError) {
          console.warn('Error creating version record (non-critical):', versionError);
          // Continue even if version creation fails
        }

        // Update folder metadata
        try {
          const folderRef = doc(db, 'folders', folderId);
          await updateDoc(folderRef, {
            'metadata.documentCount': increment(1),
            'metadata.lastUpdated': serverTimestamp()
          });
          console.log(`Folder metadata updated`);
        } catch (folderUpdateError) {
          console.warn('Error updating folder metadata (non-critical):', folderUpdateError);
          // Continue even if folder metadata update fails
        }

        return {
          id: docRef.id,
          projectId: document.projectId,
          name: document.name,
          type: document.type,
          folderId,
          version: 1,
          dateModified: new Date().toISOString(),
          url
        };
      } catch (firestoreError) {
        console.error('Error creating document record in Firestore:', firestoreError);
        throw new Error('Failed to save document metadata. The file was uploaded but record creation failed.');
      }
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  },

  // Update document metadata
  async update(folderId: string, documentId: string, updates: Partial<Document>): Promise<void> {
    try {
      const documentRef = doc(db, 'documents', documentId);
      const docSnap = await getDoc(documentRef);
      
      if (!docSnap.exists()) {
        throw new Error('Document not found');
      }

      const currentDoc = { id: docSnap.id, ...docSnap.data() } as Document;

      // If name is being updated, check for conflicts
      if (updates.name && updates.name !== currentDoc.name) {
        const nameExists = await folderService.checkNameExists(currentDoc.projectId, updates.name, folderId);
        if (nameExists) {
          throw new Error(`A file or folder named "${updates.name}" already exists in this location`);
        }
      }

      await updateDoc(documentRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  },

  // Get version history for a document
  async getVersions(projectId: string, documentId: string): Promise<any[]> {
    try {
      const docRef = doc(db, 'documents', documentId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Document not found');
      }

      const versionsRef = collection(docRef, 'versions');
      const q = query(versionsRef, orderBy('version', 'desc'));
      const snapshot = await getDocs(q);
      
      // Get unique versions by version number
      const versionsMap = new Map();
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (!versionsMap.has(data.version)) {
          versionsMap.set(data.version, {
            id: doc.id,
            ...data
          });
        }
      });

      return Array.from(versionsMap.values());
    } catch (error) {
      console.error('Error getting document versions:', error);
      return []; // Return empty array instead of throwing
    }
  },

  // Update document file with version tracking
  async updateFile(folderId: string, documentId: string, file: File): Promise<string> {
    try {
      const documentRef = doc(db, 'documents', documentId);
      const docSnap = await getDoc(documentRef);
      
      if (!docSnap.exists()) {
        throw new Error('Document not found');
      }

      const document = { id: docSnap.id, ...docSnap.data() } as Document & { 
        storagePath?: string;
        metadata?: { version: number };
      };

      // Generate new storage path
      const timestamp = Date.now();
      const uniqueFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const storagePath = `documents/${folderId}/${uniqueFilename}`;

      // Upload new file
      const storageRef = ref(storage, storagePath);
      const metadata = {
        contentType: file.type,
        customMetadata: {
          originalFilename: file.name,
          folderId,
          version: String((document.metadata?.version || 1) + 1)
        }
      };

      const uploadResult = await uploadBytes(storageRef, file, metadata);
      const url = await getDownloadURL(uploadResult.ref);

      // Create new version record with a specific document ID
      const versionsRef = collection(documentRef, 'versions');
      const newVersion = (document.metadata?.version || 1) + 1;
      await setDoc(doc(versionsRef, `v${newVersion}`), {
        version: newVersion,
        url,
        storagePath,
        uploadedAt: serverTimestamp(),
        metadata: {
          originalFilename: file.name,
          contentType: file.type,
          size: file.size
        }
      });

      // Update document metadata
      await updateDoc(documentRef, {
        url,
        storagePath,
        version: newVersion,
        dateModified: new Date().toISOString(),
        updatedAt: serverTimestamp(),
        metadata: {
          ...document.metadata,
          version: newVersion,
          originalFilename: file.name,
          contentType: file.type,
          size: file.size
        }
      });

      // Delete old file if it exists
      if (document.storagePath) {
        try {
          const oldFileRef = ref(storage, document.storagePath);
          await deleteObject(oldFileRef);
        } catch (error) {
          console.warn('Old file not found:', error);
        }
      }

      return url;
    } catch (error) {
      console.error('Error updating document file:', error);
      throw error;
    }
  },

  // Delete document and its file
  async delete(folderId: string, documentId: string): Promise<void> {
    try {
      const documentRef = doc(db, 'documents', documentId);
      const docSnap = await getDoc(documentRef);
      
      if (docSnap.exists()) {
        const document = { id: docSnap.id, ...docSnap.data() } as Document & { storagePath?: string };
        
        // Delete file from storage
        if (document.storagePath) {
          try {
            const fileRef = ref(storage, document.storagePath);
            await deleteObject(fileRef);
          } catch (error) {
            console.warn('File not found:', error);
          }
        }

        // Delete document from Firestore
        await deleteDoc(documentRef);

        // Update folder metadata
        const folderRef = doc(db, 'folders', folderId);
        await updateDoc(folderRef, {
          'metadata.documentCount': increment(-1),
          'metadata.lastUpdated': serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      throw new Error('Failed to delete document');
    }
  },

  // Get comments for a document
  async getComments(documentId: string): Promise<DocumentComment[]> {
    try {
      const q = query(
        collection(db, `documents/${documentId}/comments`),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as DocumentComment));
    } catch (error) {
      console.error('Error getting comments:', error);
      throw new Error('Failed to get comments');
    }
  },

  // Add a comment to a document
  async addComment(documentId: string, comment: Omit<DocumentComment, 'id' | 'documentId'>): Promise<DocumentComment> {
    try {
      const commentsRef = collection(db, `documents/${documentId}/comments`);
      const docRef = await addDoc(commentsRef, {
        documentId,
        ...comment,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Update document metadata
      const documentRef = doc(db, 'documents', documentId);
      await updateDoc(documentRef, {
        'metadata.commentsCount': increment(1),
        'metadata.lastCommentAt': serverTimestamp()
      });

      return {
        id: docRef.id,
        documentId,
        ...comment
      };
    } catch (error) {
      console.error('Error adding comment:', error);
      throw new Error('Failed to add comment');
    }
  },

  // Update a comment
  async updateComment(documentId: string, commentId: string, text: string): Promise<void> {
    try {
      const commentRef = doc(db, `documents/${documentId}/comments`, commentId);
      await updateDoc(commentRef, {
        text,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating comment:', error);
      throw new Error('Failed to update comment');
    }
  },

  // Delete a comment
  async deleteComment(documentId: string, commentId: string): Promise<void> {
    try {
      const commentRef = doc(db, `documents/${documentId}/comments`, commentId);
      await deleteDoc(commentRef);

      // Update document metadata
      const documentRef = doc(db, 'documents', documentId);
      await updateDoc(documentRef, {
        'metadata.commentsCount': increment(-1)
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw new Error('Failed to delete comment');
    }
  }
};