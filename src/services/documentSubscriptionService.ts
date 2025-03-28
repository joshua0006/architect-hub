import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Document } from '../types';

// Global flag to ensure only one document subscription is active at a time
let GLOBAL_DOCUMENT_SUBSCRIPTION_ACTIVE = false;

/**
 * Subscribe to real-time updates for documents in a specific folder
 * @param folderId The ID of the folder to monitor
 * @param callback Function to call when documents are updated
 * @returns Unsubscribe function to stop listening for updates
 */
export const subscribeToFolderDocuments = (
  folderId: string,
  callback: (documents: Document[]) => void
): (() => void) => {
  // Generate a unique subscription ID for tracking
  const subscriptionId = `docs-${folderId}-${Date.now()}`;
  console.log(`[Document Subscription] Creating subscription ${subscriptionId}`);
  
  // Warn if another subscription is already active
  if (GLOBAL_DOCUMENT_SUBSCRIPTION_ACTIVE) {
    console.log(`[Document Subscription] Another subscription is already active`);
  }
  
  GLOBAL_DOCUMENT_SUBSCRIPTION_ACTIVE = true;
  
  // Set up throttling to prevent excessive updates
  let lastCallbackTime = 0;
  const MIN_CALLBACK_INTERVAL = 1000; // 1 second minimum between callbacks
  
  // Create a query for documents in this folder
  const q = query(
    collection(db, 'documents'),
    where('folderId', '==', folderId),
    orderBy('updatedAt', 'desc')
  );
  
  console.log(`[Document Subscription] Setting up real-time subscription for folder ${folderId}`);
  
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
        console.log(`[Document Subscription] No documents found for folder ${folderId}`);
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
        console.log(`[Document Subscription] No valid documents in snapshot for folder ${folderId}`);
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
};

// Add a custom event for document refreshing
export const DOCUMENT_UPDATE_EVENT = 'document-update';

/**
 * Trigger a document update event to refresh document lists
 * @param folderId The folder ID that was updated
 * @param documentId Optional document ID that was updated
 */
export const triggerDocumentUpdate = (folderId: string, documentId?: string) => {
  const eventDetail = {
    folderId,
    documentId,
    timestamp: Date.now(),
    source: 'documentService'
  };
  
  // Dispatch the event with details
  const customEvent = new CustomEvent(DOCUMENT_UPDATE_EVENT, { 
    detail: eventDetail,
    bubbles: true
  });
  document.dispatchEvent(customEvent);
  console.log(`[Document Update] Triggered document update event for folder ${folderId}`);
}; 