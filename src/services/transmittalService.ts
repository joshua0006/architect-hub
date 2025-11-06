import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TransmittalData } from '../types';

export const transmittalService = {
  /**
   * Get transmittal data for a specific document
   */
  async getTransmittalData(projectId: string, documentId: string): Promise<TransmittalData | null> {
    try {
      const docRef = doc(db, 'transmittals', projectId, 'documents', documentId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return {
          documentId,
          projectId,
          ...docSnap.data()
        } as TransmittalData;
      }

      return null;
    } catch (error) {
      console.error('Error getting transmittal data:', error);
      throw new Error('Failed to get transmittal data');
    }
  },

  /**
   * Get all transmittal data for a project (optimized batch load)
   */
  async getAllTransmittalData(projectId: string): Promise<Map<string, TransmittalData>> {
    try {
      const transmittalMap = new Map<string, TransmittalData>();
      const collectionRef = collection(db, 'transmittals', projectId, 'documents');
      const snapshot = await getDocs(collectionRef);

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        transmittalMap.set(doc.id, {
          documentId: doc.id,
          projectId,
          ...data
        } as TransmittalData);
      });

      return transmittalMap;
    } catch (error) {
      console.error('Error getting all transmittal data:', error);
      throw new Error('Failed to get transmittal data for project');
    }
  },

  /**
   * Update transmittal data for a document
   */
  async updateTransmittalData(
    projectId: string,
    documentId: string,
    userId: string,
    userName: string,
    updates: {
      drawingNo?: string;
      description?: string;
      revision?: string;
    }
  ): Promise<void> {
    try {
      const docRef = doc(db, 'transmittals', projectId, 'documents', documentId);

      // Prepare the data with metadata
      const data: Partial<TransmittalData> = {
        ...updates,
        editedAt: new Date().toISOString(),
        editedBy: userId,
        editedByName: userName,
        documentId,
        projectId
      };

      // Use setDoc with merge to create or update
      await setDoc(docRef, data, { merge: true });
    } catch (error) {
      console.error('Error updating transmittal data:', error);
      throw new Error('Failed to update transmittal data');
    }
  },

  /**
   * Delete all transmittal overrides for a document (reset to original)
   */
  async deleteTransmittalData(projectId: string, documentId: string): Promise<void> {
    try {
      const docRef = doc(db, 'transmittals', projectId, 'documents', documentId);

      // Set all fields to null/undefined to effectively "delete" the overrides
      // This is safer than actual deletion for maintaining history
      await setDoc(docRef, {
        drawingNo: null,
        description: null,
        revision: null,
        editedAt: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error deleting transmittal data:', error);
      throw new Error('Failed to delete transmittal data');
    }
  },

  /**
   * Check if a document has any transmittal overrides
   */
  async hasTransmittalOverrides(projectId: string, documentId: string): Promise<boolean> {
    try {
      const data = await this.getTransmittalData(projectId, documentId);
      if (!data) return false;

      return !!(data.drawingNo || data.description || data.revision);
    } catch (error) {
      console.error('Error checking transmittal overrides:', error);
      return false;
    }
  }
};
