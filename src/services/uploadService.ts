import { storage, db } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, doc, updateDoc, serverTimestamp, increment } from 'firebase/firestore';
import { getUploadPath } from '../utils/uploadMiddleware';

interface UploadResult {
  downloadUrl: string;
  documentId: string;
}

export const uploadPdfToFolder = async (
  folderId: string,
  file: File
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
    
    const documentData = {
      name: file.name,
      type: 'pdf',
      url: downloadUrl,
      storagePath,
      version: 1,
      dateModified: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
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
  file: File
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
    
    const documentData = {
      name: file.name,
      type: file.type.split('/')[1] || 'unknown',
      url: downloadUrl,
      storagePath,
      version: 1,
      dateModified: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
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