import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit, where, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Annotation } from '../types/annotation';

export const annotationService = {
  /**
   * Save annotations to Firebase for a specific document
   * @param documentId The ID of the document
   * @param annotations The annotations to save
   */
  async saveAnnotationsToFirebase(documentId: string, annotations: Annotation[]): Promise<void> {
    try {
      // Validate input
      if (!documentId) {
        console.error('Cannot save annotations: Invalid document ID');
        return Promise.reject(new Error('Invalid document ID'));
      }
      
      // Add timestamp to each annotation if not present
      const timestampedAnnotations = annotations.map(annotation => ({
        ...annotation,
        lastModified: annotation.lastModified || Date.now()
      }));
      
      // Save annotations to the document's annotations subcollection
      const docRef = doc(db, 'documentAnnotations', documentId);
      
      // Create or update the document with the annotations and use server timestamp
      // to ensure clients can detect changes
      await setDoc(docRef, {
        annotations: timestampedAnnotations,
        updatedAt: serverTimestamp(), // Always use server timestamp for reliable ordering
        lastSyncTime: Date.now(), // Client timestamp for display purposes
        version: 1, // Increment this when making schema changes
      }, { merge: true });
      
      console.log(`Annotations saved to Firebase successfully (${timestampedAnnotations.length} annotations)`);
    } catch (error) {
      console.error('Error saving annotations to Firebase:', error);
      throw error;
    }
  },

  /**
   * Load annotations from Firebase for a specific document
   * @param documentId The ID of the document
   * @returns The annotations for the document or null if not found
   */
  async loadAnnotationsFromFirebase(documentId: string): Promise<Annotation[] | null> {
    try {
      const docRef = doc(db, 'documentAnnotations', documentId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return data.annotations as Annotation[];
      } else {
        console.log('No annotations found for document:', documentId);
        return null;
      }
    } catch (error) {
      console.error('Error loading annotations from Firebase:', error);
      return null;
    }
  },

  /**
   * Subscribe to annotations changes for a specific document
   * @param documentId The ID of the document
   * @param callback Function to call when annotations change
   * @returns Unsubscribe function
   */
  subscribeToAnnotations(documentId: string, callback: (annotations: Annotation[]) => void): () => void {
    const docRef = doc(db, 'documentAnnotations', documentId);
    
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        callback(data.annotations as Annotation[]);
      } else {
        callback([]);
      }
    }, (error) => {
      console.error('Error in annotations subscription:', error);
    });
  }
}; 