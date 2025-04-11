import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from '../types';

// Global flag to ensure only one user subscription is active at a time
let GLOBAL_USER_SUBSCRIPTION_ACTIVE = false;

/**
 * Subscribe to real-time updates for users
 * @param callback Function to call when users are updated
 * @returns Unsubscribe function to stop listening for updates
 */
export const subscribeToAllUsers = (
  callback: (users: User[]) => void
): (() => void) => {
  // Generate a unique subscription ID for tracking
  const subscriptionId = `users-${Date.now()}`;
  console.log(`[User Subscription] Creating subscription ${subscriptionId}`);
  
  // Warn if another subscription is already active
  if (GLOBAL_USER_SUBSCRIPTION_ACTIVE) {
    console.log(`[User Subscription] Another subscription is already active`);
  }
  
  GLOBAL_USER_SUBSCRIPTION_ACTIVE = true;
  
  // Set up throttling to prevent excessive updates
  let lastCallbackTime = 0;
  const MIN_CALLBACK_INTERVAL = 500; // 0.5 second minimum between callbacks
  
  // Create a query for all users
  const q = query(
    collection(db, 'users'),
    orderBy('displayName', 'asc')
  );
  
  console.log(`[User Subscription] Setting up real-time subscription for all users`);
  
  // Process incoming user snapshots
  const processSnapshot = (snapshot: any) => {
    try {
      // Throttle callbacks based on time
      const now = Date.now();
      if (now - lastCallbackTime < MIN_CALLBACK_INTERVAL) {
        console.log('[User Subscription] Throttling callback, too soon after last callback');
        return;
      }
      
      // Check if we have any users
      if (snapshot.empty) {
        console.log(`[User Subscription] No users found`);
        callback([]);
        return;
      }
      
      // Process snapshot to get all users
      const users: User[] = snapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        } as User;
      });
      
      if (users.length === 0) {
        console.log(`[User Subscription] No valid users in snapshot`);
        callback([]);
        return;
      }
      
      // Update timing variable
      lastCallbackTime = now;
      
      // Call the callback with users
      console.log(`[User Subscription] Calling back with ${users.length} users`);
      callback(users);
    } catch (error) {
      console.error('[User Subscription] Error processing snapshot:', error);
    }
  };
  
  // Set up the snapshot listener
  const unsubscribe = onSnapshot(
    q,
    { includeMetadataChanges: false },
    processSnapshot,
    (error) => {
      console.error(`[User Subscription] Error in subscription ${subscriptionId}:`, error);
    }
  );
  
  // Return unsubscribe function
  return () => {
    console.log(`[User Subscription] Cleaning up subscription ${subscriptionId}`);
    unsubscribe();
    GLOBAL_USER_SUBSCRIPTION_ACTIVE = false;
  };
};

// Event name for user updates
export const USER_UPDATE_EVENT = 'user-update';

/**
 * Trigger a user update event to refresh user lists
 * @param userId Optional user ID that was updated
 * @param action The action that occurred (create, update, delete)
 */
export const triggerUserUpdate = (
  userId?: string,
  action: 'create' | 'update' | 'delete' = 'update'
) => {
  const eventDetail = {
    userId,
    action,
    timestamp: Date.now(),
    source: 'userService'
  };
  
  // Dispatch the event with details
  const customEvent = new CustomEvent(USER_UPDATE_EVENT, { 
    detail: eventDetail,
    bubbles: true
  });
  document.dispatchEvent(customEvent);
  console.log(`[User Update] Triggered user ${action} event${userId ? ` for user ${userId}` : ''}`);
};

/**
 * Subscribe to real-time updates for users in a specific project
 * @param projectId The project ID to monitor for users
 * @param callback Function to call when project users are updated
 * @returns Unsubscribe function to stop listening for updates
 */
export const subscribeToProjectUsers = (
  projectId: string,
  callback: (users: User[]) => void
): (() => void) => {
  // Generate a unique subscription ID for tracking
  const subscriptionId = `project-users-${projectId}-${Date.now()}`;
  console.log(`[User Subscription] Creating project user subscription ${subscriptionId}`);
  
  // Create a query for users in this project
  const q = query(
    collection(db, 'users'),
    where('projectIds', 'array-contains', projectId),
    orderBy('displayName', 'asc')
  );
  
  console.log(`[User Subscription] Setting up real-time subscription for project ${projectId} users`);
  
  // Set up the snapshot listener
  const unsubscribe = onSnapshot(
    q,
    { includeMetadataChanges: false },
    (snapshot) => {
      try {
        // Process snapshot to get project users
        const users: User[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data
          } as User;
        });
        
        console.log(`[User Subscription] Calling back with ${users.length} project users`);
        callback(users);
      } catch (error) {
        console.error('[User Subscription] Error processing project users snapshot:', error);
      }
    },
    (error) => {
      console.error(`[User Subscription] Error in project user subscription ${subscriptionId}:`, error);
    }
  );
  
  // Return unsubscribe function
  return () => {
    console.log(`[User Subscription] Cleaning up project user subscription ${subscriptionId}`);
    unsubscribe();
  };
}; 