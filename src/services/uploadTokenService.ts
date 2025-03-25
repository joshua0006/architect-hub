import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, getDoc, Timestamp, collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { ShareToken } from '../types';

// Interface for the upload token
export interface UploadToken {
  id: string;
  folderId: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  maxFileSize?: number; // in bytes
  allowedFileTypes?: string[]; // mime types
  maxUploads?: number;
  usedCount: number;
  metadata?: {
    title?: string;
    description?: string;
    folderName?: string;
    projectId?: string;
  };
}

interface UploadTokenOptions {
  expiresInHours: number;
  maxFileSize?: number; // in bytes
  allowedFileTypes?: string[];
  maxUploads?: number;
  metadata?: {
    title?: string;
    description?: string;
    folderName?: string;
    projectId?: string;
  };
}

/**
 * Creates an upload token for a specific folder
 */
export const createUploadToken = async (
  folderId: string,
  userId: string,
  options: UploadTokenOptions
): Promise<UploadToken> => {
  // Calculate expiration date
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + options.expiresInHours);
  
  // Create token document
  const tokenData = {
    folderId,
    createdBy: userId,
    expiresAt: Timestamp.fromDate(expiresAt),
    maxFileSize: options.maxFileSize,
    allowedFileTypes: options.allowedFileTypes || [],
    maxUploads: options.maxUploads,
    usedCount: 0,
    createdAt: serverTimestamp(),
    metadata: options.metadata || {}
  };
  
  // Add to Firestore
  const tokenRef = await addDoc(collection(db, 'uploadTokens'), tokenData);
  
  // Return token with ID
  return {
    id: tokenRef.id,
    folderId,
    createdBy: userId,
    expiresAt,
    maxFileSize: options.maxFileSize,
    allowedFileTypes: options.allowedFileTypes,
    maxUploads: options.maxUploads,
    usedCount: 0,
    createdAt: new Date(),
    metadata: options.metadata
  };
};

/**
 * Generates a URL for uploading using a token
 */
export const generateUploadUrl = (token: UploadToken, baseUrl: string): string => {
  return `${baseUrl}/upload?token=${token.id}`;
};

/**
 * Validates if a token is valid for upload
 */
export const validateUploadToken = async (tokenId: string): Promise<UploadToken | null> => {
  try {
    const tokenDoc = await getDoc(doc(db, 'uploadTokens', tokenId));
    
    if (!tokenDoc.exists()) {
      return null; // Token doesn't exist
    }
    
    const tokenData = tokenDoc.data() as Omit<UploadToken, 'id' | 'expiresAt' | 'createdAt'> & { 
      expiresAt: Timestamp;
      createdAt: Timestamp;
    };
    
    const token: UploadToken = {
      id: tokenDoc.id,
      ...tokenData,
      expiresAt: tokenData.expiresAt.toDate(),
      createdAt: tokenData.createdAt.toDate()
    };
    
    // Check if token is expired
    if (token.expiresAt < new Date()) {
      return null; // Token expired
    }
    
    // Check if max uploads reached
    if (token.maxUploads && token.usedCount >= token.maxUploads) {
      return null; // Max uploads reached
    }
    
    return token;
  } catch (error) {
    console.error('Error validating upload token:', error);
    return null;
  }
};

/**
 * Increments the used count for a token
 */
export const incrementTokenUsage = async (tokenId: string): Promise<boolean> => {
  try {
    const tokenRef = doc(db, 'uploadTokens', tokenId);
    const tokenDoc = await getDoc(tokenRef);
    
    if (!tokenDoc.exists()) {
      return false;
    }
    
    await updateDoc(tokenRef, {
      usedCount: increment(1)
    });
    
    return true;
  } catch (error) {
    console.error('Error incrementing token usage:', error);
    return false;
  }
};

// Mock functions for testing if Firebase isn't initialized
// These can be removed in production
const mockTokens = new Map<string, UploadToken>();
let mockTokenCounter = 1;

// Export as named exports for better tree-shaking
export { mockTokens, mockTokenCounter };

/**
 * Uploads a file using an upload token
 * @param tokenId The upload token ID
 * @param file The file to upload
 * @returns Information about the uploaded file
 */
export const uploadFileWithToken = async (
  tokenId: string,
  file: File
): Promise<{ url: string; path: string; documentId: string } | null> => {
  try {
    // Validate the token
    const token = await validateUploadToken(tokenId);
    if (!token) {
      throw new Error('Invalid or expired upload token');
    }

    // Check file size if a limit is set
    if (token.maxFileSize && file.size > token.maxFileSize) {
      throw new Error(`File exceeds the maximum allowed size of ${token.maxFileSize} bytes`);
    }

    // Check file type if restrictions are set
    if (token.allowedFileTypes && token.allowedFileTypes.length > 0) {
      if (!token.allowedFileTypes.includes(file.type)) {
        throw new Error(`File type ${file.type} is not allowed. Allowed types: ${token.allowedFileTypes.join(', ')}`);
      }
    }

    // Generate a unique filename
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `folders/${token.folderId}/documents/${uniqueFilename}`;

    // Upload file to Firebase Storage
    const storageRef = ref(storage, storagePath);
    const metadata = {
      contentType: file.type,
      customMetadata: {
        originalFilename: file.name,
        folderId: token.folderId,
        uploadedWithToken: tokenId,
        version: '1'
      }
    };

    const uploadResult = await uploadBytes(storageRef, file, metadata);
    const downloadUrl = await getDownloadURL(uploadResult.ref);

    // Create document record in Firestore
    const documentData = {
      name: file.name,
      type: file.type.includes('pdf') ? 'pdf' : 'other',
      url: downloadUrl,
      storagePath,
      folderId: token.folderId,
      projectId: token.metadata?.projectId || "",
      version: 1,
      dateModified: new Date().toISOString(),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      uploadedWithToken: tokenId,
      metadata: {
        originalFilename: file.name,
        contentType: file.type,
        size: file.size,
        version: 1
      }
    };

    // Create a new document in the top-level documents collection
    const documentsCollectionRef = collection(db, 'documents');
    const newDocRef = await addDoc(documentsCollectionRef, documentData);
    const documentId = newDocRef.id;

    // Update token usage count
    const tokenRef = doc(db, 'uploadTokens', tokenId);
    await setDoc(tokenRef, { usedCount: token.usedCount + 1 }, { merge: true });

    return {
      url: downloadUrl,
      path: storagePath,
      documentId
    };
  } catch (error) {
    console.error('Error uploading file with token:', error);
    throw error;
  }
}; 