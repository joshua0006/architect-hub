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
  setDoc,
  Timestamp,
  onSnapshot
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
import { userService } from './userService';
import { createCommentMentionNotifications, createAdminFileUploadNotification } from './notificationService';
import { extractMentions, extractUserIds, resolveUserMentions, UserMention } from '../utils/textUtils';

// Add a global subscription tracker
let GLOBAL_DOCUMENT_SUBSCRIPTION_ACTIVE = false;

export const documentService = {
  // Get all documents in a folder
  async getByFolderId(folderId: string): Promise<Document[]> {
    try {
      let q;
      
      if (folderId) {
        // Query documents with specific folder ID
        q = query(
          collection(db, 'documents'),
          where('folderId', '==', folderId)
        );
      } else {
        // For root directory (empty string folderId), get documents with empty folderId
        q = query(
          collection(db, 'documents'),
          where('folderId', '==', '')
        );
      }
      
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

  // Subscribe to real-time document updates for a specific folder
  subscribeToDocuments(
    folderId: string,
    callback: (documents: Document[]) => void
  ): (() => void) {
    // Generate a unique subscription ID for tracking
    const subscriptionId = `docs-${folderId || 'root'}-${Date.now()}`;
    console.log(`[Document Subscription] Creating subscription ${subscriptionId}`);
    
    // Prevent multiple subscriptions
    if (GLOBAL_DOCUMENT_SUBSCRIPTION_ACTIVE) {
      console.log(`[Document Subscription] Another subscription is already active, using that one`);
    }
    
    GLOBAL_DOCUMENT_SUBSCRIPTION_ACTIVE = true;
    
    // Set up throttling to prevent excessive updates
    let lastCallbackTime = 0;
    const MIN_CALLBACK_INTERVAL = 1000; // 1 second minimum between callbacks
    
    // Create a query for documents in this folder
    let q;
    if (folderId) {
      // For specific folder ID
      q = query(
        collection(db, 'documents'),
        where('folderId', '==', folderId),
        orderBy('updatedAt', 'desc')
      );
    } else {
      // For root directory (empty string folderId)
      q = query(
        collection(db, 'documents'),
        where('folderId', '==', ''),
        orderBy('updatedAt', 'desc')
      );
    }
    
    console.log(`[Document Subscription] Setting up real-time subscription for folder ${folderId || 'root'}`);
    
    // Process incoming document snapshots
    const processSnapshot = (snapshot: any) => {
      try {
        // Throttle callbacks based on time
        const now = Date.now();
        if (now - lastCallbackTime < MIN_CALLBACK_INTERVAL) {
          console.log('[Document Subscription] Throttling callback, too soon after last callback');
          return;
        }
        
        // Check if we have any documents
        if (snapshot.empty) {
          console.log(`[Document Subscription] No documents found for folder ${folderId || 'root'}`);
          callback([]);
          return;
        }
        
        // Process snapshot to get all documents
        const documents: Document[] = snapshot.docs
          .filter((doc: any) => doc.id !== '_metadata')
          .map((doc: any) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data
            } as Document;
          });
        
        if (documents.length === 0) {
          console.log(`[Document Subscription] No valid documents in snapshot for folder ${folderId || 'root'}`);
          callback([]);
          return;
        }
        
        // Update timing variable
        lastCallbackTime = now;
        
        // Call the callback with documents
        console.log(`[Document Subscription] Calling back with ${documents.length} documents`);
        callback(documents);
      } catch (error) {
        console.error('[Document Subscription] Error processing snapshot:', error);
      }
    };
    
    // Set up the snapshot listener
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: false },
      processSnapshot,
      (error) => {
        console.error(`[Document Subscription] Error in subscription ${subscriptionId}:`, error);
      }
    );
    
    // Return unsubscribe function
    return () => {
      console.log(`[Document Subscription] Cleaning up subscription ${subscriptionId}`);
      unsubscribe();
      GLOBAL_DOCUMENT_SUBSCRIPTION_ACTIVE = false;
    };
  },

  // Create a document with file upload
  async create(
    folderId: string,
    document: Omit<Document, 'id' | 'url'>,
    file: File,
    uploader?: { id: string, displayName: string, role: string } // Add uploader info
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
      
      // For root directory uploads, use a different storage path structure
      const storagePath = folderId 
        ? `documents/${folderId}/${uniqueFilename}` 
        : `documents/root/${uniqueFilename}`;

      let url: string;

      try {
        // Upload file to Firebase Storage
        const storageRef = ref(storage, storagePath);
        const metadata = {
          contentType: file.type,
          customMetadata: {
            originalFilename: file.name,
            folderId: folderId || 'root',
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
          folderId: document.folderId, // This can be an empty string for root
          version: 1,
          dateModified: new Date().toISOString(),
          url,
          storagePath,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: uploader?.id || '', // Add the uploader ID if available
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

        // Update folder metadata if we have a valid folder ID
        if (folderId) {
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
        }

        // If file was uploaded by a non-admin user, notify admin users
        if (uploader && uploader.role !== 'Admin') {
          try {
            // Get the folder name
            let folderName = "Project Root";
            if (folderId) {
              const folder = await folderService.getById(folderId);
              if (folder) {
                folderName = folder.name;
              }
            }

            // Get all admin users
            const adminUsers = await userService.getUsersByRole('Admin');
            if (adminUsers && adminUsers.length > 0) {
              // Create notifications for all admin users
              await createAdminFileUploadNotification(
                document.name,
                uploader.displayName,
                uploader.role,
                file.type,
                folderId || '',
                folderName,
                docRef.id,
                document.projectId,
                new Date().toISOString(),
                adminUsers.map(user => user.id)
              );
              console.log(`Admin notifications sent for file upload by ${uploader.displayName}`);
            }
          } catch (notificationError) {
            console.warn('Error sending admin notifications (non-critical):', notificationError);
            // Continue even if notifications fail
          }
        }

        return {
          id: docRef.id,
          projectId: document.projectId,
          name: document.name,
          type: document.type,
          folderId: document.folderId,
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
      const commentRef = doc(db, `documents/${documentId}/comments/${commentId}`);
      await deleteDoc(commentRef);
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw new Error('Failed to delete comment');
    }
  },

  subscribeToDocument(documentId: string, callback: (document: Document | null) => void) {
    try {
      const documentRef = doc(db, 'documents', documentId);
      
      return onSnapshot(documentRef, (snapshot) => {
        if (snapshot.exists()) {
          const documentData = {
            id: snapshot.id,
            ...snapshot.data(),
          } as Document;
          
          callback(documentData);
        } else {
          console.log(`Document ${documentId} not found`);
          callback(null);
        }
      }, (error) => {
        console.error('Error in document subscription:', error);
        callback(null);
      });
    } catch (error) {
      console.error('Error setting up document subscription:', error);
      return () => {};
    }
  },
  
  subscribeToDocumentUpdates(folderId: string, callback: (documents: Document[]) => void) {
    try {
      const documentsRef = collection(db, 'documents');
      
      // If folderId is specified, we'll filter by it in the callback
      return onSnapshot(documentsRef, (snapshot) => {
        const documents = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as Document));
        
        // Filter documents by folderId if specified
        const filteredDocs = folderId 
          ? documents.filter(doc => doc.folderId === folderId)
          : documents;
          
        callback(filteredDocs);
      }, (error) => {
        console.error('Error in documents subscription:', error);
        callback([]);
      });
    } catch (error) {
      console.error('Error setting up documents subscription:', error);
      return () => {};
    }
  }
};