import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TransmittalData, TransmittalHistoryEntry, StandaloneTransmittalEntry } from '../types';

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
   * Get transmittal data for specific document IDs (for pagination)
   */
  async getTransmittalDataForDocuments(
    projectId: string,
    documentIds: string[]
  ): Promise<Map<string, TransmittalData>> {
    try {
      const transmittalMap = new Map<string, TransmittalData>();

      // If no document IDs provided, return empty map
      if (documentIds.length === 0) {
        return transmittalMap;
      }

      // Fetch transmittal data for each document ID
      // Note: Firestore doesn't have a good way to batch get subcollection docs
      // So we'll use Promise.all for parallel fetching
      const promises = documentIds.map(async (docId) => {
        const docRef = doc(db, 'transmittals', projectId, 'documents', docId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          transmittalMap.set(docId, {
            documentId: docId,
            projectId,
            ...data
          } as TransmittalData);
        }
      });

      await Promise.all(promises);

      return transmittalMap;
    } catch (error) {
      console.error('Error getting transmittal data for documents:', error);
      throw new Error('Failed to get transmittal data for specific documents');
    }
  },

  /**
   * Update transmittal data for a document
   */
  async updateTransmittalData(
    projectId: string,
    documentId: string,
    documentName: string,
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

      // Get current data to compare changes
      const currentDoc = await getDoc(docRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};

      // Track what actually changed
      const changes: TransmittalHistoryEntry['changes'] = [];

      if (updates.drawingNo !== undefined && updates.drawingNo !== currentData.drawingNo) {
        changes.push({
          field: 'drawingNo',
          oldValue: currentData.drawingNo || '',
          newValue: updates.drawingNo
        });
      }

      if (updates.description !== undefined && updates.description !== currentData.description) {
        changes.push({
          field: 'description',
          oldValue: currentData.description || '',
          newValue: updates.description
        });
      }

      if (updates.revision !== undefined && updates.revision !== currentData.revision) {
        changes.push({
          field: 'revision',
          oldValue: currentData.revision || '',
          newValue: updates.revision
        });
      }

      // Only proceed if there are actual changes
      if (changes.length === 0) {
        return;
      }

      const timestamp = new Date().toISOString();

      // Prepare the data with metadata
      const data: Partial<TransmittalData> = {
        ...updates,
        editedAt: timestamp,
        editedBy: userId,
        editedByName: userName,
        documentId,
        projectId
      };

      // Update current transmittal data
      await setDoc(docRef, data, { merge: true });

      // Write to history collection
      const historyRef = collection(db, 'transmittals', projectId, 'history');
      await addDoc(historyRef, {
        documentId,
        documentName,
        projectId,
        changes,
        editedBy: userId,
        editedByName: userName,
        timestamp
      });
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
  },

  /**
   * Get all transmittal change history for a project
   */
  async getProjectHistory(projectId: string): Promise<TransmittalHistoryEntry[]> {
    try {
      const historyRef = collection(db, 'transmittals', projectId, 'history');
      const q = query(historyRef, orderBy('timestamp', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as TransmittalHistoryEntry));
    } catch (error) {
      console.error('Error getting transmittal history:', error);
      throw new Error('Failed to get transmittal history');
    }
  },

  /**
   * Create a standalone transmittal entry (no document link)
   */
  async createStandaloneEntry(
    projectId: string,
    userId: string,
    userName: string,
    data: {
      drawingNo?: string;
      title?: string;
      description?: string;
      revision?: string;
    }
  ): Promise<StandaloneTransmittalEntry> {
    try {
      const timestamp = new Date().toISOString();
      const collectionRef = collection(db, 'transmittals', projectId, 'standalone');

      const entryData = {
        projectId,
        ...data,
        createdAt: timestamp,
        createdBy: userId,
        createdByName: userName
      };

      const docRef = await addDoc(collectionRef, entryData);

      return {
        id: docRef.id,
        ...entryData
      } as StandaloneTransmittalEntry;
    } catch (error) {
      console.error('Error creating standalone entry:', error);
      throw new Error('Failed to create standalone entry');
    }
  },

  /**
   * Get all standalone transmittal entries for a project
   */
  async getAllStandaloneEntries(projectId: string): Promise<StandaloneTransmittalEntry[]> {
    try {
      const collectionRef = collection(db, 'transmittals', projectId, 'standalone');
      const snapshot = await getDocs(collectionRef);

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as StandaloneTransmittalEntry));
    } catch (error) {
      console.error('Error getting standalone entries:', error);
      throw new Error('Failed to get standalone entries');
    }
  },

  /**
   * Update a standalone transmittal entry
   */
  async updateStandaloneEntry(
    projectId: string,
    entryId: string,
    userId: string,
    userName: string,
    updates: {
      drawingNo?: string;
      title?: string;
      description?: string;
      revision?: string;
    }
  ): Promise<void> {
    try {
      const docRef = doc(db, 'transmittals', projectId, 'standalone', entryId);
      const timestamp = new Date().toISOString();

      await setDoc(docRef, {
        ...updates,
        editedAt: timestamp,
        editedBy: userId,
        editedByName: userName
      }, { merge: true });
    } catch (error) {
      console.error('Error updating standalone entry:', error);
      throw new Error('Failed to update standalone entry');
    }
  },

  /**
   * Delete a standalone transmittal entry
   */
  async deleteStandaloneEntry(projectId: string, entryId: string): Promise<void> {
    try {
      const docRef = doc(db, 'transmittals', projectId, 'standalone', entryId);
      await setDoc(docRef, {
        deletedAt: new Date().toISOString(),
        _deleted: true
      }, { merge: true });

      // Alternatively, we could use deleteDoc() for hard deletion:
      // await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting standalone entry:', error);
      throw new Error('Failed to delete standalone entry');
    }
  }
};
