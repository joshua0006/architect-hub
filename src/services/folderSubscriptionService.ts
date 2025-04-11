import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Folder } from '../types';

// Global flag to ensure only one folder subscription is active at a time
let GLOBAL_FOLDER_SUBSCRIPTION_ACTIVE = false;

/**
 * Subscribe to real-time updates for folders in a specific project
 * @param projectId The ID of the project to monitor
 * @param callback Function to call when folders are updated
 * @returns Unsubscribe function to stop listening for updates
 */
export const subscribeToProjectFolders = (
  projectId: string,
  callback: (folders: Folder[]) => void
): (() => void) => {
  // Generate a unique subscription ID for tracking
  const subscriptionId = `folders-${projectId}-${Date.now()}`;
  console.log(`[Folder Subscription] Creating subscription ${subscriptionId}`);
  
  // Warn if another subscription is already active
  if (GLOBAL_FOLDER_SUBSCRIPTION_ACTIVE) {
    console.log(`[Folder Subscription] Another subscription is already active`);
  }
  
  GLOBAL_FOLDER_SUBSCRIPTION_ACTIVE = true;
  
  // Set up throttling to prevent excessive updates
  let lastCallbackTime = 0;
  const MIN_CALLBACK_INTERVAL = 500; // 0.5 second minimum between callbacks
  
  // Create a query for folders in this project
  const q = query(
    collection(db, 'folders'),
    where('projectId', '==', projectId),
    orderBy('updatedAt', 'desc')
  );
  
  console.log(`[Folder Subscription] Setting up real-time subscription for project ${projectId}`);
  
  // Process incoming folder snapshots
  const processSnapshot = (snapshot: any) => {
    try {
      // Throttle callbacks based on time
      const now = Date.now();
      if (now - lastCallbackTime < MIN_CALLBACK_INTERVAL) {
        console.log('[Folder Subscription] Throttling callback, too soon after last callback');
        return;
      }
      
      // Check if we have any folders
      if (snapshot.empty) {
        console.log(`[Folder Subscription] No folders found for project ${projectId}`);
        callback([]);
        return;
      }
      
      // Process snapshot to get all folders
      const folders: Folder[] = snapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        } as Folder;
      });
      
      if (folders.length === 0) {
        console.log(`[Folder Subscription] No valid folders in snapshot for project ${projectId}`);
        callback([]);
        return;
      }
      
      // Update timing variable
      lastCallbackTime = now;
      
      // Call the callback with folders
      console.log(`[Folder Subscription] Calling back with ${folders.length} folders`);
      callback(folders);
    } catch (error) {
      console.error('[Folder Subscription] Error processing snapshot:', error);
    }
  };
  
  // Set up the snapshot listener
  const unsubscribe = onSnapshot(
    q,
    { includeMetadataChanges: false },
    processSnapshot,
    (error) => {
      console.error(`[Folder Subscription] Error in subscription ${subscriptionId}:`, error);
    }
  );
  
  // Return unsubscribe function
  return () => {
    console.log(`[Folder Subscription] Cleaning up subscription ${subscriptionId}`);
    unsubscribe();
    GLOBAL_FOLDER_SUBSCRIPTION_ACTIVE = false;
  };
};

// Event name for folder updates
export const FOLDER_UPDATE_EVENT = 'folder-update';

// Event name for folder operation success events
export const FOLDER_OPERATION_SUCCESS_EVENT = 'folder-operation-success';

/**
 * Trigger a folder update event to refresh folder lists
 * @param projectId The project ID that was updated
 * @param folderId Optional folder ID that was updated
 * @param action The action that occurred (create, update, delete, copy, move)
 */
export const triggerFolderUpdate = (
  projectId: string, 
  folderId?: string,
  action: 'create' | 'update' | 'delete' | 'copy' | 'move' = 'update'
) => {
  const eventDetail = {
    projectId,
    folderId,
    action,
    timestamp: Date.now(),
    source: 'folderService'
  };
  
  // Dispatch the event with details
  const customEvent = new CustomEvent(FOLDER_UPDATE_EVENT, { 
    detail: eventDetail,
    bubbles: true
  });
  document.dispatchEvent(customEvent);
  console.log(`[Folder Update] Triggered folder ${action} event for project ${projectId}${folderId ? `, folder ${folderId}` : ''}`);
};

/**
 * Trigger a folder operation success event
 * @param action The action that occurred (copy, move)
 * @param folderId The folder ID that was affected
 */
export const triggerFolderOperationSuccess = (
  details: {
    action: 'copy' | 'move' | 'refresh',
    folderId?: string,
    projectId?: string,
    source?: string
  }
) => {
  const eventDetail = {
    ...details,
    timestamp: Date.now(),
    source: details.source || 'folderService'
  };
  
  // Dispatch the event with details
  const customEvent = new CustomEvent(FOLDER_OPERATION_SUCCESS_EVENT, { 
    detail: eventDetail,
    bubbles: true
  });
  document.dispatchEvent(customEvent);
  console.log(`[Folder Operation] Triggered folder ${details.action} success event for folder ${details.folderId || 'N/A'}, project ${details.projectId || 'N/A'}`);
}; 