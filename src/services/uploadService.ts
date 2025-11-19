import { storage, db } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, doc, updateDoc, serverTimestamp, increment, getDoc } from 'firebase/firestore';
import { getUploadPath } from '../utils/uploadMiddleware';

interface UploadResult {
  downloadUrl: string;
  documentId: string;
}

/**
 * Validates and ensures uploader has a display name.
 * If displayName is missing but userId exists, attempts to fetch from user document.
 *
 * @param uploader - The uploader object (may be undefined or incomplete)
 * @returns Promise<string> - The uploader's display name or 'Unknown User' as last resort
 */
async function getValidatedUploaderName(
  uploader?: { id: string, displayName: string, role: string }
): Promise<string> {
  // If no uploader provided at all
  if (!uploader) {
    console.warn('Upload attempted without uploader information');
    return 'Unknown User';
  }

  // If displayName is provided and valid
  if (uploader.displayName && uploader.displayName.trim()) {
    return uploader.displayName.trim();
  }

  // If we have a user ID but no displayName, try to fetch from user document
  if (uploader.id) {
    console.warn(`Uploader ${uploader.id} missing displayName, attempting to fetch from user document`);

    try {
      const userDocRef = doc(db, 'users', uploader.id);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userData = userDoc.data();
        const fetchedName = userData.displayName || userData.name || userData.email;

        if (fetchedName && typeof fetchedName === 'string' && fetchedName.trim()) {
          console.log(`Successfully fetched displayName for user ${uploader.id}: ${fetchedName}`);
          return fetchedName.trim();
        }
      }

      console.error(`User document ${uploader.id} exists but has no valid displayName/name/email`);
    } catch (error) {
      console.error(`Failed to fetch user document for ${uploader.id}:`, error);
    }
  }

  // Last resort - log the issue clearly
  console.error('Upload proceeding with Unknown User - uploader data incomplete:', {
    hasId: !!uploader.id,
    hasDisplayName: !!uploader.displayName,
    hasRole: !!uploader.role
  });

  return 'Unknown User';
}

export const uploadPdfToFolder = async (
  folderId: string,
  file: File,
  uploader?: { id: string, displayName: string, role: string }
): Promise<UploadResult> => {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `folders/${folderId}/documents/${uniqueFilename}`;

    let downloadUrl: string;
    
    // 1. Upload file to Firebase Storage
    try {
      const storageRef = ref(storage, storagePath);
      const metadata = {
        contentType: file.type,
        customMetadata: {
          originalFilename: file.name,
          folderId,
          version: '1'
        }
      };

      const uploadResult = await uploadBytes(storageRef, file, metadata);
      downloadUrl = await getDownloadURL(uploadResult.ref);
    } catch (firebaseError) {
      console.error('Firebase upload failed:', firebaseError);
      throw new Error('Failed to upload file to storage. Please try again later.');
    }

    // 2. Create document record in Firestore
    const folderDocRef = doc(db, 'folders', folderId);
    const documentsCollectionRef = collection(folderDocRef, 'documents');

    // Validate and get uploader name (with fallback to user document if needed)
    const uploaderName = await getValidatedUploaderName(uploader);

    const documentData = {
      name: file.name,
      type: 'pdf',
      url: downloadUrl,
      storagePath,
      version: 1,
      dateModified: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uploader?.id,
      createdByName: uploaderName,
      metadata: {
        originalFilename: file.name,
        contentType: file.type,
        size: file.size,
        version: 1
      }
    };

    const docRef = await addDoc(documentsCollectionRef, documentData);

    // 3. Update folder metadata
    try {
      const metadataRef = doc(documentsCollectionRef, '_metadata');
      await updateDoc(metadataRef, {
        totalDocuments: increment(1),
        lastUpdated: serverTimestamp()
      });
    } catch (error) {
      console.warn('Error updating folder metadata:', error);
      // Continue even if metadata update fails
    }

    return {
      downloadUrl,
      documentId: docRef.id
    };
  } catch (error) {
    console.error('Error uploading PDF:', error);
    throw new Error('Failed to upload PDF');
  }
};

// Function to handle uploading any file type (not just PDFs)
export const uploadFileToFolder = async (
  folderId: string,
  file: File,
  uploader?: { id: string, displayName: string, role: string }
): Promise<UploadResult> => {
  try {
    // Generate unique filename
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `folders/${folderId}/documents/${uniqueFilename}`;

    let downloadUrl: string;

    // 1. Upload file to Firebase Storage
    try {
      const storageRef = ref(storage, storagePath);
      const metadata = {
        contentType: file.type,
        customMetadata: {
          originalFilename: file.name,
          folderId,
          version: '1'
        }
      };

      const uploadResult = await uploadBytes(storageRef, file, metadata);
      downloadUrl = await getDownloadURL(uploadResult.ref);
    } catch (firebaseError) {
      console.error('Firebase upload failed:', firebaseError);
      throw new Error('Failed to upload file to storage. Please try again later.');
    }

    // 2. Create document record in Firestore
    const folderDocRef = doc(db, 'folders', folderId);
    const documentsCollectionRef = collection(folderDocRef, 'documents');

    // Determine file type more accurately for the document record
    let docType = 'other';
    const fileType = file.type.toLowerCase();
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (fileType === 'application/pdf' || extension === 'pdf') {
      docType = 'pdf';
    } else if (extension === 'dwg') {
      docType = 'dwg';
    } else if (fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension || '')) {
      docType = 'image';
    }

    // Validate and get uploader name (with fallback to user document if needed)
    const uploaderName = await getValidatedUploaderName(uploader);

    const documentData = {
      name: file.name,
      type: docType,
      url: downloadUrl,
      storagePath,
      version: 1,
      dateModified: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uploader?.id,
      createdByName: uploaderName,
      metadata: {
        originalFilename: file.name,
        contentType: file.type,
        size: file.size,
        version: 1
      }
    };

    const docRef = await addDoc(documentsCollectionRef, documentData);

    // 3. Update folder metadata
    try {
      const metadataRef = doc(documentsCollectionRef, '_metadata');
      await updateDoc(metadataRef, {
        totalDocuments: increment(1),
        lastUpdated: serverTimestamp()
      });
    } catch (error) {
      console.warn('Error updating folder metadata:', error);
      // Continue even if metadata update fails
    }

    return {
      downloadUrl,
      documentId: docRef.id
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error('Failed to upload file. Please try again later.');
  }
};