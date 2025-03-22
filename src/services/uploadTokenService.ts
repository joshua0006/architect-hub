import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, getDoc, Timestamp, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
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
  metadata?: Record<string, any>;
}

/**
 * Creates a token that allows uploading files to a specific folder
 * @param folderId The folder ID where uploads will be stored
 * @param creatorId User ID of the token creator
 * @param options Additional options for the token
 * @returns The created upload token
 */
export const createUploadToken = async (
  folderId: string,
  creatorId: string,
  options: {
    expiresInHours?: number;
    maxFileSize?: number;
    allowedFileTypes?: string[];
    maxUploads?: number;
    metadata?: Record<string, any>;
  } = {}
): Promise<UploadToken> => {
  try {
    const {
      expiresInHours = 24,
      maxFileSize,
      allowedFileTypes,
      maxUploads,
      metadata
    } = options;

    // Get the folder's project ID
    let projectId = metadata?.projectId;
    if (!projectId) {
      try {
        const folderDoc = await getDoc(doc(db, 'folders', folderId));
        if (folderDoc.exists()) {
          projectId = folderDoc.data().projectId;
        }
      } catch (error) {
        console.error('Error getting folder projectId:', error);
      }
    }

    // Calculate expiration date
    const expiresIn = expiresInHours * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + expiresIn);

    // Prepare token data
    const tokenData = {
      folderId,
      createdBy: creatorId,
      maxFileSize,
      allowedFileTypes,
      maxUploads,
      usedCount: 0,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.now(),
      metadata: {
        ...metadata,
        projectId: projectId || ''
      }
    };

    const tokenId = uuidv4();
    const token: UploadToken = {
      id: tokenId,
      folderId,
      createdBy: creatorId,
      createdAt: new Date(),
      expiresAt,
      maxFileSize,
      allowedFileTypes,
      maxUploads,
      usedCount: 0,
      metadata: {
        ...metadata,
        projectId: projectId || ''
      }
    };

    // Store token in Firestore
    await setDoc(doc(db, 'uploadTokens', tokenId), {
      ...tokenData
    });
    
    // Convert Firestore Timestamp to Date for the returned token
    return {
      ...token,
      createdAt: tokenData.createdAt.toDate(),
      expiresAt: tokenData.expiresAt.toDate()
    };
  } catch (error) {
    console.error('Error creating upload token:', error);
    throw error;
  }
};

/**
 * Validates an upload token and checks if it can be used
 * @param tokenId The token ID to validate
 * @returns The validated token or null if invalid
 */
export const validateUploadToken = async (tokenId: string): Promise<UploadToken | null> => {
  try {
    // Get token directly by document ID instead of querying 
    const tokenDocRef = doc(db, 'uploadTokens', tokenId);
    const tokenSnapshot = await getDoc(tokenDocRef);

    if (!tokenSnapshot.exists()) {
      console.error('Upload token not found:', tokenId);
      return null;
    }

    const tokenData = tokenSnapshot.data();
    
    // Convert timestamps to Date objects
    const expiresAt = tokenData.expiresAt instanceof Timestamp 
      ? tokenData.expiresAt.toDate() 
      : new Date(tokenData.expiresAt);
    
    const createdAt = tokenData.createdAt instanceof Timestamp
      ? tokenData.createdAt.toDate()
      : new Date(tokenData.createdAt);

    const token: UploadToken = {
      id: tokenId, // Use the document ID explicitly as the token ID
      folderId: tokenData.folderId,
      createdBy: tokenData.createdBy,
      expiresAt,
      createdAt,
      maxFileSize: tokenData.maxFileSize,
      allowedFileTypes: tokenData.allowedFileTypes,
      maxUploads: tokenData.maxUploads,
      usedCount: tokenData.usedCount || 0,
      metadata: tokenData.metadata
    };

    // Check if token has expired
    const now = new Date();
    if (expiresAt < now) {
      console.error('Upload token has expired');
      return null;
    }

    // Check if max uploads limit has been reached
    if (token.maxUploads && token.usedCount >= token.maxUploads) {
      console.error('Upload token has reached maximum usage limit');
      return null;
    }

    return token;
  } catch (error) {
    console.error('Error validating upload token:', error);
    return null;
  }
};

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

/**
 * Generates a shareable upload URL that contains the token
 * @param token The upload token
 * @param baseUrl The base URL of the application
 * @returns The shareable upload URL
 */
export const generateUploadUrl = (token: UploadToken, baseUrl: string): string => {
  return `${baseUrl}/upload?token=${token.id}`;
}; 