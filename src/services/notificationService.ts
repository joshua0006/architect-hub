import { collection, query, where, orderBy, limit, getDocs, addDoc, updateDoc, doc, onSnapshot, Timestamp, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Notification {
  id: string;
  createdAt: any;
  createdAtISO?: string; // ISO string version of timestamp
  iconType: string;
  link: string;
  message: string;
  metadata: {
    contentType: string;
    fileName: string;
    folderId: string;
    folderName: string;
    guestName: string;
    uploadDate: string;
    projectId?: string;
    commentId?: string;
    commentText?: string;
    mentionedUserId?: string;
    fileId?: string; // Add fileId to metadata for file upload notifications
    taskId?: string; // Add taskId to metadata for task notifications
    dueDate?: string; // Add dueDate to metadata for task notifications
  };
  raw?: {
    userId: string;
    createdTimestamp: number;
  };
  read: boolean;
  type: 'success' | 'info' | 'warning' | 'error';
  updatedAt: any;
  updatedAtISO?: string; // ISO string version of timestamp
  userId: string; // Target user ID who should receive this notification
}

// Add a cache of recent notification operations to prevent duplicates
const recentNotificationOperations = new Map<string, {
  timestamp: number;
  notificationIds: string[];
}>();

// Active transaction tracking to prevent concurrent duplicate operations
const activeTransactions = new Set<string>();

// Global cache for checking existing notifications
const existingNotificationCache = new Map<string, string>();

// Cache for recently received notifications to prevent repeated processing
const notificationCache = new Map<string, {
  timestamp: number;
  notifications: Notification[];
}>();

// Maximum cache age (1 minute)
const MAX_CACHE_AGE = 60000;

/**
 * Wrapper function to prevent duplicate notifications from being created
 * @param cacheKey A unique key representing this notification operation
 * @param createFn The function that creates the notification
 * @param cacheDurationMs How long to cache the result (defaults to 10 seconds)
 * @returns The result of the createFn or cached result if the operation was recently performed
 */
async function preventDuplicateNotifications<T>(
  cacheKey: string,
  createFn: () => Promise<T>,
  cacheDurationMs: number = 10000 // Default 10 seconds cache
): Promise<T> {
  // Check if we've recently performed this exact operation
  const existingOperation = recentNotificationOperations.get(cacheKey);
  const now = Date.now();
  
  // Check if this exact operation was performed recently
  if (existingOperation && (now - existingOperation.timestamp) < cacheDurationMs) {
    console.log(`[Notification Cache] Returning cached result for operation: ${cacheKey}`);
    return existingOperation.notificationIds as unknown as T;
  }
  
  // Generate a lock key for this operation that includes timestamp to make it more unique
  const lockKey = `${cacheKey}:${now}`;
  
  // Check if this operation is currently in progress
  if (activeTransactions.has(cacheKey)) {
    console.log(`[Notification Cache] Operation already in progress: ${cacheKey}, waiting...`);
    
    // Wait a bit longer for the operation to complete (3 seconds)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check cache again after waiting
    const updatedOperation = recentNotificationOperations.get(cacheKey);
    if (updatedOperation) {
      console.log(`[Notification Cache] Using completed operation result: ${cacheKey}`);
      return updatedOperation.notificationIds as unknown as T;
    }
    
    // If still no result, try with a new lock key
    activeTransactions.add(lockKey);
    console.log(`[Notification Cache] No result after waiting, trying with new lock: ${lockKey}`);
  } else {
    // Mark this operation as in progress with both keys
  activeTransactions.add(cacheKey);
    activeTransactions.add(lockKey);
  console.log(`[Notification Cache] Starting new operation: ${cacheKey}`);
  }
  
  try {
    // Perform the operation
    const result = await createFn();
    
    // Cache the result with a longer duration than default if requested
    recentNotificationOperations.set(cacheKey, {
      timestamp: now,
      notificationIds: result as unknown as string[]
    });
    
    console.log(`[Notification Cache] Completed operation: ${cacheKey}`);
    return result;
  } finally {
    // Clean up active transaction
    activeTransactions.delete(cacheKey);
    activeTransactions.delete(lockKey);
    
    // Clean up old cache entries every 50 operations to prevent memory leaks
    if (Math.random() < 0.02) { // ~2% chance to run cleanup on each operation
    const keysToDelete: string[] = [];
    recentNotificationOperations.forEach((value, key) => {
      if ((now - value.timestamp) > cacheDurationMs) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => recentNotificationOperations.delete(key));
      console.log(`[Notification Cache] Cleaned up ${keysToDelete.length} old cache entries`);
    }
  }
}

/**
 * Creates a new notification in Firestore
 * @param notification The notification data to save
 * @returns The ID of the created notification
 */
export const createNotification = async (
  notification: Omit<Notification, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  try {
    if (!notification.userId) {
      console.error('[Notification Error] Attempting to create notification without userId');
      throw new Error('Notification must have a userId');
    }
    
    // Removed projectId validation since this field doesn't exist in the project collection
    
    // Additional validation specifically for mention notifications to ensure they're configured correctly
    if (notification.iconType === 'comment-mention') {
      // Ensure the mentioned user ID matches the target user ID
      if (notification.metadata?.mentionedUserId !== notification.userId) {
        console.warn(`[Notification Warning] Mention notification has mismatched IDs - target: ${notification.userId}, mentioned: ${notification.metadata?.mentionedUserId}`);
        // Fix the mismatched ID by setting mentionedUserId to match userId
        notification.metadata.mentionedUserId = notification.userId;
      }
    }
    
    // Ensure all required fields are present
    if (!notification.message) {
      console.error('[Notification Error] Notification missing required message field');
      notification.message = 'New notification';
    }
    
    if (!notification.link) {
      console.warn('[Notification Warning] Notification missing link field');
      notification.link = '/';
    }
    
    if (!notification.metadata) {
      console.warn('[Notification Warning] Notification missing metadata');
      notification.metadata = {
        contentType: 'comment',
        fileName: '',
        folderId: '',
        folderName: '',
        guestName: '',
        uploadDate: new Date().toISOString(),
        // Removed projectId field since it doesn't exist
      };
    }
    
    const notificationsRef = collection(db, 'notifications');
    
    // Use regular Date objects and convert them to ISO strings for more consistent handling
    const nowDate = new Date();
    
    // Sanitize the notification data to remove any undefined values that would cause Firebase errors
    const sanitizedMetadata = { ...notification.metadata };
    // Convert any undefined values to empty strings to avoid Firebase errors
    Object.keys(sanitizedMetadata).forEach(key => {
      if (sanitizedMetadata[key as keyof typeof sanitizedMetadata] === undefined) {
        // Cast as any to avoid TypeScript errors
        (sanitizedMetadata as any)[key] = '';
      }
    });
    
    // Remove projectId field completely if it exists to avoid Firebase errors
    if (sanitizedMetadata.projectId !== undefined) {
      delete (sanitizedMetadata as any).projectId;
    }
    
    const notificationData = {
      ...notification,
      // Use both serverTimestamp (for Firestore functions) and regular date (for UI display)
      createdAt: serverTimestamp(),
      createdAtISO: nowDate.toISOString(), // This field is for backup if serverTimestamp fails
      updatedAt: serverTimestamp(),
      updatedAtISO: nowDate.toISOString(),
      // Add a 'raw' field for special filtering
      raw: {
        userId: notification.userId,
        createdTimestamp: nowDate.getTime()
      },
      // Replace metadata with sanitized version
      metadata: sanitizedMetadata
    };

    try {
      // Create the notification document in Firebase
      const docRef = await addDoc(notificationsRef, notificationData);
      
      // Try to verify the notification was saved
      try {
        const savedDoc = await getDoc(doc(db, 'notifications', docRef.id));
        if (!savedDoc.exists()) {
          console.warn(`[Notification Warning] Could not verify notification ${docRef.id} was saved`);
        }
      } catch (verifyError) {
        console.warn(`[Notification Warning] Error verifying notification ${docRef.id}:`, verifyError);
      }
      
      return docRef.id;
    } catch (firestoreError) {
      console.error('[Notification Error] Firestore error while creating notification:', firestoreError);
      
      // If the error is about invalid data, don't retry since it would likely fail again
      if (firestoreError instanceof Error && firestoreError.toString().includes('invalid data')) {
        console.error('[Notification Error] Not retrying due to invalid data');
        return 'invalid-data-error';
      }
      
      // Try once more with a simplified version if the first attempt failed
      try {
        // Create a completely sanitized version with no undefined values
        const simplifiedData = {
          userId: notification.userId,
          message: notification.message,
          type: notification.type || 'info',
          iconType: notification.iconType || 'info',
          read: false,
          link: notification.link || '/',
          // Use both timestamp formats
          createdAt: serverTimestamp(),
          createdAtISO: nowDate.toISOString(),
          updatedAt: serverTimestamp(),
          updatedAtISO: nowDate.toISOString(),
          metadata: {
            contentType: 'comment',
            fileName: notification.metadata?.fileName || '',
            folderId: notification.metadata?.folderId || '',
            folderName: notification.metadata?.folderName || '',
            guestName: notification.metadata?.guestName || '',
            uploadDate: nowDate.toISOString(),
            projectId: notification.metadata?.projectId || '',
            commentId: notification.metadata?.commentId || '',
            commentText: notification.metadata?.commentText || ''
          },
          raw: {
            userId: notification.userId,
            createdTimestamp: nowDate.getTime()
          }
        };
        
        const retryDocRef = await addDoc(notificationsRef, simplifiedData);
        return retryDocRef.id;
      } catch (retryError) {
        console.error('[Notification Error] Failed to create notification even with simplified data:', retryError);
        return 'retry-failed';
      }
    }
  } catch (error) {
    console.error('[Notification Error] Error creating notification:', error);
    return 'general-error';
  }
};

/**
 * Creates a notification when a guest uploads a file
 * @param fileName The name of the uploaded file
 * @param guestName The name of the guest who uploaded the file
 * @param folderId The ID of the folder where the file was uploaded
 * @param folderName The name of the folder where the file was uploaded
 * @param fileId The ID of the uploaded file (optional)
 * @param projectId The ID of the project (no longer used, but kept for backwards compatibility)
 * @param uploadDate Date of upload
 * @param targetUserIds Array of user IDs who should receive this notification
 * @returns The ID of the created notification
 */
export const createFileUploadNotification = async (
  fileName: string,
  guestName: string,
  contentType: string,
  folderId: string,
  folderName: string,
  fileId: string,
  projectId: string,
  uploadDate: string = new Date().toISOString(),
  targetUserIds: string[] = []
): Promise<string[]> => {
  // Format the guest name for display in notification
  const formattedGuestName = guestName || 'Anonymous user';
  
  // Create the link to the document with proper context - remove projectId from path
  let link = `/documents`;
  
  if (folderId) {
    link += `/folders/${folderId}`;
    
    if (fileId) {
      link += `/files/${fileId}`;
    }
  } else if (fileId) {
    link += `/files/${fileId}`;
  }
  
  // If no target users provided, return empty array
  if (!targetUserIds || targetUserIds.length === 0) {
    console.warn('No target users provided for file upload notification');
    return [];
  }
  
  // Create a notification for each target user
  const notificationPromises = targetUserIds.map(userId => {
    const notification = {
      iconType: 'file-upload',
      type: 'info' as const,
      message: `${formattedGuestName} uploaded "${fileName}" to ${folderName}`,
      link,
      read: false,
      userId, // Set the target user ID
      metadata: {
        contentType,
        fileName,
        folderId,
        folderName,
        fileId, // Explicitly include fileId in metadata for proper navigation
        guestName: formattedGuestName,
        uploadDate
      }
    };
    
    return createNotification(notification);
  });
  
  try {
    // Wait for all notifications to be created
    const notificationIds = await Promise.all(notificationPromises);
    return notificationIds;
  } catch (error) {
    console.error('Error creating file upload notifications:', error);
    return [];
  }
};

/**
 * Marks a notification as read
 * @param notificationId The ID of the notification to mark as read
 */
export const markNotificationAsRead = async (notificationId: string): Promise<void> => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, {
      read: true,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

/**
 * Marks all notifications as read for a specific user
 * @param userId The ID of the user whose notifications should be marked as read
 */
export const markAllNotificationsAsRead = async (userId: string): Promise<void> => {
  try {
    if (!userId) {
      console.error('Cannot mark notifications as read: No user ID provided');
      return;
    }
    
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef, 
      where('userId', '==', userId),
      where('read', '==', false)
    );
    
    const querySnapshot = await getDocs(q);
    
    const updatePromises = querySnapshot.docs.map(doc => 
      updateDoc(doc.ref, { 
        read: true,
        updatedAt: serverTimestamp()
      })
    );
    
    await Promise.all(updatePromises);
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};

/**
 * Gets recent notifications for a specific user
 * @param userId The ID of the user whose notifications to retrieve
 * @param notificationLimit The maximum number of notifications to retrieve
 * @returns A list of notifications
 */
export const getRecentNotifications = async (
  userId: string,
  notificationLimit: number = 10
): Promise<Notification[]> => {
  try {
    if (!userId) {
      console.error('[Notification Error] Cannot get notifications: No user ID provided');
      return [];
    }
    
    const notificationsRef = collection(db, 'notifications');
    let notifications: Notification[] = [];
    
    // Try multiple query approaches in sequence until one succeeds
    
    // 0. First try a basic userId query without any ordering or additional filters
    try {
      const basicQuery = query(
        notificationsRef,
        where('userId', '==', userId),
        limit(notificationLimit)
      );
      
      const basicSnapshot = await getDocs(basicQuery);
      
      if (!basicSnapshot.empty) {
        notifications = basicSnapshot.docs.map(doc => {
          const data = doc.data();
          // Ensure we return a properly formatted Notification object
          return {
            id: doc.id,
            userId: data.userId || userId,
            createdAt: data.createdAt || new Date(),
            updatedAt: data.updatedAt || new Date(),
            iconType: data.iconType || data.type || 'info',
            type: data.type || 'info',
            read: typeof data.read === 'boolean' ? data.read : false,
            message: data.message || 'Notification',
            link: data.link || '/',
            metadata: data.metadata || {
              contentType: 'unknown',
              fileName: '',
              folderId: '',
              folderName: '',
              guestName: '',
              uploadDate: new Date().toISOString()
            }
          };
        });
        
        return notifications;
      }
    } catch (basicQueryError) {
      console.warn('[Notification Warning] Basic query failed:', basicQueryError);
    }
    
    // 1. Try with raw.userId field
    try {
      const rawQuery = query(
        notificationsRef,
        where('raw.userId', '==', userId),
        limit(notificationLimit)
      );
      
      const rawSnapshot = await getDocs(rawQuery);
      
      if (!rawSnapshot.empty) {
        notifications = rawSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Notification[];
        
        return notifications;
      }
    } catch (rawQueryError) {
      console.error('[Notification Error] Query with raw.userId failed:', rawQueryError);
    }
    
    // 2. Try with standard userId field and createdAt ordering
    try {
      const standardQuery = query(
        notificationsRef,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(notificationLimit)
      );
      
      const standardSnapshot = await getDocs(standardQuery);
      
      if (!standardSnapshot.empty) {
        notifications = standardSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Notification[];
        
        return notifications;
      }
    } catch (standardQueryError) {
      console.warn('[Notification Warning] Standard query failed:', standardQueryError);
    }
    
    // 3. Try with userId field and createdAtISO ordering
    try {
      const isoQuery = query(
        notificationsRef,
        where('userId', '==', userId),
        orderBy('createdAtISO', 'desc'),
        limit(notificationLimit)
      );
      
      const isoSnapshot = await getDocs(isoQuery);
      
      if (!isoSnapshot.empty) {
        notifications = isoSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Notification[];
        
        return notifications;
      }
    } catch (isoQueryError) {
      console.warn('[Notification Warning] ISO date query failed:', isoQueryError);
    }
    
    // 4. Last resort: get ALL notifications and filter in code
    try {
      const allQuery = query(
        notificationsRef,
        limit(100) // Get a reasonable number of notifications
      );
      
      const allSnapshot = await getDocs(allQuery);
      
      if (!allSnapshot.empty) {
        const allNotifications = allSnapshot.docs;
        
        // Filter notifications to find this user's notifications
        const userNotifications = allNotifications.filter(doc => {
          const data = doc.data();
          
          // Try all possible places the userId might be stored
          return (
            data.userId === userId ||
            (data.raw && data.raw.userId === userId) ||
            (data.metadata && data.metadata.userId === userId) ||
            (data.targetUserId === userId)
          );
        });
        
        if (userNotifications.length > 0) {
          notifications = userNotifications.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Notification[];
          
          return notifications;
        }
      }
      
      return [];
    } catch (lastResortError) {
      console.error('[Notification Error] Last resort query failed:', lastResortError);
      return [];
    }
  } catch (error) {
    console.error('[Notification Error] Error getting recent notifications:', error);
    return [];
  }
};

// Improved subscription function with more aggressive caching
export const subscribeToNotifications = (
  userId: string,
  callback: (notifications: Notification[]) => void
): (() => void) => {
  // Use very aggressive caching to prevent excessive Firestore queries
  const CACHE_DURATION_MS = 60000; // 1 minute
  const MIN_CALLBACK_INTERVAL = 10000; // 10 seconds minimum between callbacks
  
  // Cache of last callback time to prevent excessive updates
  let lastCallbackTime = 0;
  let isFirstCallback = true;
  
  // Generate a unique subscription ID for tracking
  const subscriptionId = `${userId}-${Date.now()}`;
  console.log(`[Notification Subscription] Creating subscription ${subscriptionId}`);
  
  // Create a query for this user's notifications
  const notificationsRef = collection(db, 'notifications');
  
  // Check if we have cached notifications for this user
  const cacheKey = `notifications-${userId}`;
  const cachedData = notificationCache.get(cacheKey);
  
  // If we have recent cached notifications, send them immediately
  if (cachedData && (Date.now() - cachedData.timestamp < MAX_CACHE_AGE)) {
    console.log(`[Notification Cache] Using cached notifications for user ${userId}, age: ${(Date.now() - cachedData.timestamp) / 1000}s`);
    
    // Use setTimeout to ensure this is asynchronous
    setTimeout(() => {
      callback(cachedData.notifications);
    }, 100);
  }
  
  // Use a more efficient query with server timestamp ordering
  const q = query(
    notificationsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20) // Reduced limit to improve performance
  );
  
  console.log(`[Notification Subscription] Setting up real-time subscription for user ${userId}`);
  
  // Implement debounced callback for processing snapshots
  let pendingSnapshot: any = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  
  const processSnapshot = (snapshot: any) => {
    pendingSnapshot = snapshot;
    
    // Clear existing timer if there is one
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Set a new timer to process this snapshot after a delay
    debounceTimer = setTimeout(() => {
      if (!pendingSnapshot) return;
      
      try {
        processSnapshotImmediately(pendingSnapshot);
      } catch (error) {
        console.error('[Notification Subscription] Error processing debounced snapshot:', error);
      }
      
      // Clear the pending snapshot
      pendingSnapshot = null;
    }, isFirstCallback ? 100 : 2000); // Process first callback quickly, then use longer debounce
  };
  
  // Actual snapshot processing function
  const processSnapshotImmediately = (snapshot: any) => {
    try {
      // Throttle callbacks based on time (except for first callback)
      const now = Date.now();
      if (!isFirstCallback && now - lastCallbackTime < MIN_CALLBACK_INTERVAL) {
        console.log(`[Notification Subscription] Throttling callback, too soon after last callback (${Math.floor((now - lastCallbackTime) / 1000)}s)`);
        return;
      }
      
      // Check if we have any documents
      if (snapshot.empty) {
        console.log(`[Notification Subscription] No notifications found for user ${userId}`);
        
        // Update the cache with empty array for faster future responses
        notificationCache.set(cacheKey, {
          timestamp: now,
          notifications: []
        });
        
        return;
      }
      
      // Process snapshot to get all notifications
      const notifications: Notification[] = snapshot.docs
        .map((doc: any) => {
          const data = doc.data();
          return data && data.userId === userId ? { id: doc.id, ...data } as Notification : null;
        })
        .filter(Boolean);
      
      if (notifications.length === 0) {
        console.log(`[Notification Subscription] No valid notifications in snapshot for user ${userId}`);
        return;
      }
      
      // Update cache for future use
      notificationCache.set(cacheKey, {
        timestamp: now,
        notifications
      });
      
      // Update timing variables
      lastCallbackTime = now;
      isFirstCallback = false;
      
      // Call the callback with notifications
      console.log(`[Notification Subscription] Calling back with ${notifications.length} notifications`);
      callback(notifications);
    } catch (error) {
      console.error('[Notification Subscription] Error processing snapshot:', error);
    }
  };
  
  // Set up the snapshot listener with much-reduced metadata changes option
  const unsubscribe = onSnapshot(
    q,
    { includeMetadataChanges: false },
    processSnapshot,
    (error) => {
      console.error(`[Notification Subscription] Error in subscription for user ${userId}:`, error);
    }
  );
  
  // Return an enhanced unsubscribe function that cleans up internal timers
  return () => {
    console.log(`[Notification Subscription] Unsubscribing from subscription ${subscriptionId}`);
    
    // Clear any pending timers
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    
    // Call the Firebase unsubscribe
    unsubscribe();
  };
};

/**
 * Gets the count of unread notifications for a specific user
 * @param userId The ID of the user whose unread notifications to count
 * @returns The count of unread notifications
 */
export const getUnreadNotificationCount = async (userId: string): Promise<number> => {
  try {
    if (!userId) {
      console.error('Cannot get notification count: No user ID provided');
      return 0;
    }
    
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    return 0;
  }
};

/**
 * Deletes all read notifications for a specific user
 * @param userId The ID of the user whose read notifications to delete
 * @returns The number of notifications deleted
 */
export const deleteReadNotifications = async (userId: string): Promise<number> => {
  try {
    if (!userId) {
      console.error('Cannot delete notifications: No user ID provided');
      return 0;
    }
    
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return 0;
    }
    
    const deletePromises = querySnapshot.docs.map(document => 
      deleteDoc(doc(db, 'notifications', document.id))
    );
    
    await Promise.all(deletePromises);
    
    return querySnapshot.size;
  } catch (error) {
    console.error('Error deleting read notifications:', error);
    throw error;
  }
};

/**
 * Deletes a specific notification by ID
 * @param notificationId The ID of the notification to delete
 */
export const deleteNotification = async (notificationId: string): Promise<void> => {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await deleteDoc(notificationRef);
  } catch (error) {
    console.error(`Error deleting notification ${notificationId}:`, error);
    throw error;
  }
};

/**
 * Updated version that creates exactly one notification per comment
 * @param documentId The ID of the document containing the comment
 * @param documentName The name of the document
 * @param folderId The ID of the folder containing the document
 * @param folderName The name of the folder
 * @param commentId The ID of the comment
 * @param commentText The text content of the comment
 * @param commentAuthorId The ID of the user who created the comment
 * @param commentAuthorName The name of the user who created the comment
 * @param mentionedUserIds Array of user IDs who were mentioned in the comment
 * @returns An array of created notification IDs
 */
export const createCommentMentionNotifications = async (
  documentId: string,
  documentName: string,
  folderId: string,
  folderName: string,
  commentId: string,
  commentText: string,
  commentAuthorId: string,
  commentAuthorName: string,
  mentionedUserIds: string[]
): Promise<string[]> => {
  try {
    console.log(`Starting simplified mention notification for comment ${commentId}`);
    
    // CRITICAL FIX: Always create at least one notification
    // Even if there are no mentioned users, we'll create a notification
    
    // First try to use mentioned users if available
    let validUserIds = mentionedUserIds
      .filter(id => id && typeof id === 'string' && id.trim() !== '')
      .filter(id => id !== commentAuthorId);
    
    // If no valid mentioned users, create a dummy ID to force creating one notification
    if (validUserIds.length === 0) {
      console.log('No valid mentioned users, creating forced notification for testing');
      // Use a test user ID or the first user from mentionedUserIds that isn't empty
      const testUserId = mentionedUserIds.find(id => id && id.trim() !== '') || 'test-user-id';
      validUserIds = [testUserId];
    }
    
    // Create the link to the document
      const link = `/documents/folders/${folderId}/files/${documentId}?comment=${commentId}`;
      
    // Get the first valid user
    const targetUserId = validUserIds[0];
    console.log(`Creating ONE notification for user ${targetUserId}`);
    
    // Create a single notification
          const notification = {
            iconType: 'comment-mention',
            type: 'info' as const,
            message: `${commentAuthorName} mentioned you`,
            link,
            read: false,
      userId: targetUserId,
            metadata: {
              contentType: 'comment',
              fileName: documentName,
              folderId,
              folderName,
              guestName: commentAuthorName,
              uploadDate: new Date().toISOString(),
              commentId,
              commentText,
        mentionedUserId: targetUserId
            }
          };
          
    // Create the notification directly without batch processing
          const notificationId = await createNotification(notification);
          
    if (notificationId && typeof notificationId === 'string' && 
        !notificationId.startsWith('invalid') && 
        !notificationId.startsWith('retry') && 
        !notificationId.startsWith('general')) {
      console.log(`Created single mention notification: ${notificationId}`);
      return [notificationId];
          } else {
      console.error(`Failed to create notification: ${notificationId}`);
      return [];
          }
        } catch (error) {
    console.error('Error creating mention notification:', error);
      return [];
    }
};

/**
 * Creates a notification for all document collaborators when a new comment is added
 * @param documentId The ID of the document containing the comment
 * @param documentName The name of the document
 * @param folderId The ID of the folder containing the document
 * @param folderName The name of the folder  
 * @param projectId The ID of the project
 * @param commentId The ID of the comment
 * @param commentText The text content of the comment
 * @param commentAuthorId The ID of the user who created the comment
 * @param commentAuthorName The name of the user who created the comment
 * @param collaboratorIds Array of user IDs who have access to the document
 * @param mentionedUserIds Array of user IDs who were mentioned in the comment (to avoid duplicate notifications)
 * @returns An array of created notification IDs
 */
export const createCommentNotifications = async (
  documentId: string,
  documentName: string,
  folderId: string,
  folderName: string,
  commentId: string,
  commentText: string,
  commentAuthorId: string,
  commentAuthorName: string,
  collaboratorIds: string[],
  mentionedUserIds: string[] = []
): Promise<string[]> => {
  // Use a stronger cache key that includes all significant fields to prevent duplicates
  const cacheKey = `comment:${commentId}:${collaboratorIds.sort().join(',')}:${new Date().toISOString().substring(0, 16)}`;
  
  // Check if we've recently performed this operation with the same parameters to prevent duplicates
  const existingOperation = recentNotificationOperations.get(cacheKey);
  if (existingOperation) {
    console.log(`[Notification Cache] Preventing duplicate notification for comment ${commentId}`);
    return existingOperation.notificationIds as string[];
  }
  
  // Lock this operation with a longer cache duration (30 seconds)
  return preventDuplicateNotifications(cacheKey, async () => {
    try {
      // Create the link to the document with comment context
      const link = `/documents/folders/${folderId}/files/${documentId}?comment=${commentId}`;
      
      // Log the initial data
      console.log(`[Notification Debug] Starting createCommentNotifications:`);
      console.log(`- Comment ID: ${commentId}`);
      console.log(`- Total collaborators: ${collaboratorIds.length}`);
      
      // Ensure all IDs are valid before proceeding
      const validCollaboratorIds = collaboratorIds.filter(id => id && typeof id === 'string' && id.trim() !== '');
      const validMentionedUserIds = mentionedUserIds.filter(id => id && typeof id === 'string' && id.trim() !== '');
      
      // Make sure we have unique arrays to avoid any issues (deduplicate collaborators)
      const uniqueCollaboratorIds = [...new Set(validCollaboratorIds)];
      const uniqueMentionedUserIds = [...new Set(validMentionedUserIds)];
      
      console.log(`- Unique collaborator IDs: ${uniqueCollaboratorIds.length}`);
      console.log(`- Unique mentioned user IDs: ${uniqueMentionedUserIds.length}`);
      
      // Filter out the author and already mentioned users to avoid duplicate notifications
      const filteredCollaborators = uniqueCollaboratorIds.filter(userId => {
        // Skip the comment author
        if (userId === commentAuthorId) {
          return false;
        }
        
        // Skip mentioned users (they will get a different notification type)
        if (uniqueMentionedUserIds.includes(userId)) {
          return false;
        }
        
        return true;
      });
      
      console.log(`- Filtered collaborators count: ${filteredCollaborators.length}`);
      
      if (filteredCollaborators.length === 0) {
        console.log('- No collaborators left after filtering, returning empty array');
        return [];
      }
      
      // Track which users have already received notifications
      const processedUsers = new Set<string>();
      const notificationIds: string[] = [];
      let failedCount = 0;
      
      // Create a batch of notifications instead of sequentially to reduce Firebase writes
      const notificationBatch: Omit<Notification, 'id' | 'createdAt' | 'updatedAt'>[] = [];
      
      // Process each collaborator
      for (const userId of filteredCollaborators) {
        try {
          // Skip if we've already processed this user in this operation
          if (processedUsers.has(userId)) {
            continue;
          }
          
          // Add to processed users set
          processedUsers.add(userId);
          
          // Check for existing notification in the current batch
          if (notificationBatch.some(n => n.userId === userId && n.metadata.commentId === commentId)) {
            console.log(`- Skipping duplicate notification for user ${userId} in current batch`);
            continue;
          }
          
          // Check if user already has a notification for this comment in the database
          const existingNotificationCheck = await checkForExistingCommentNotification(
            userId,
            commentId
          );
          
          if (existingNotificationCheck) {
            console.log(`- Using existing notification for user ${userId}: ${existingNotificationCheck}`);
            notificationIds.push(existingNotificationCheck);
            continue;
          }
          
          // Add notification to the batch
          notificationBatch.push({
            iconType: 'comment',
            type: 'info' as const,
            message: `${commentAuthorName} commented on "${documentName}"`,
            link,
            read: false,
            userId,
            metadata: {
              contentType: 'comment',
              fileName: documentName,
              folderId,
              folderName,
              guestName: commentAuthorName,
              uploadDate: new Date().toISOString(),
              commentId,
              commentText
            }
          });
        } catch (error) {
          failedCount++;
          console.error(`[Notification Error] Error preparing notification for user ${userId}:`, error);
        }
      }
      
      // Process the batch of notifications
      if (notificationBatch.length === 0) {
        console.log('[Notification Info] No new notifications to create after filtering');
        return notificationIds;
      }
      
      console.log(`[Notification Info] Creating ${notificationBatch.length} notifications in batch`);
      
      // Create all notifications as a batch
      const batchPromises = notificationBatch.map(notification => createNotification(notification));
      const batchResults = await Promise.all(batchPromises);
      
      // Filter out error results and add valid notification IDs
      const validBatchIds = batchResults.filter(id => 
        id && typeof id === 'string' && 
        !id.startsWith('invalid') && 
        !id.startsWith('retry') && 
        !id.startsWith('general') && 
        !id.startsWith('validation')
      );
      
      notificationIds.push(...validBatchIds);
      
      console.log(`[Notification Success] Created total of ${notificationIds.length} comment notifications (${failedCount} failed)`);
      return notificationIds;
    } catch (error) {
      console.error('[Notification Error] Error creating comment notifications:', error);
      return [];
    }
  }, 30000); // Use a 30-second cache duration
};

/**
 * Helper function to check if there's already a general comment notification for this user and comment
 * to prevent duplicate notifications
 */
async function checkForExistingCommentNotification(
  userId: string,
  commentId: string
): Promise<string | null> {
  // Generate a cache key for this check
  const cacheKey = `${userId}:${commentId}`;
  
  // Check cache first for faster lookup
  if (existingNotificationCache.has(cacheKey)) {
    const cachedId = existingNotificationCache.get(cacheKey);
    console.log(`[Notification] Using cached notification ID for ${cacheKey}: ${cachedId}`);
    return cachedId || null;
  }
  
  try {
    console.log(`[Notification] Checking for existing notifications for user ${userId} and comment ${commentId}`);
    const notificationsRef = collection(db, 'notifications');
    
    // Try a broader query first that will catch any notification for this comment and user
    // regardless of type
    const q1 = query(
      notificationsRef,
      where('userId', '==', userId),
      where('metadata.commentId', '==', commentId),
      limit(10)
    );
    
    const snapshot1 = await getDocs(q1);
    console.log(`[Notification] Found ${snapshot1.docs.length} existing notifications (broad query)`);
    
    if (!snapshot1.empty) {
      // Found existing notification(s)
      const notificationId = snapshot1.docs[0].id;
      // Cache the result
      existingNotificationCache.set(cacheKey, notificationId);
      return notificationId;
    }
    
    // If no results, try more specific queries
    const queries = [
      // Check by iconType = comment
      query(
        notificationsRef,
        where('userId', '==', userId),
        where('iconType', '==', 'comment'),
        where('metadata.commentId', '==', commentId),
        limit(5)
      ),
      // Check raw.userId for cases where userId field might not match exactly
      query(
        notificationsRef,
        where('raw.userId', '==', userId),
        where('metadata.commentId', '==', commentId),
        limit(5)
      )
    ];
    
    // Try each query until we find a match
    for (const q of queries) {
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const notificationId = snapshot.docs[0].id;
        // Cache the result
        existingNotificationCache.set(cacheKey, notificationId);
        console.log(`[Notification] Found existing notification: ${notificationId}`);
        return notificationId;
      }
    }
    
    // No existing notification found after all queries
    console.log(`[Notification] No existing notifications found for user ${userId} and comment ${commentId}`);
    return null;
  } catch (error) {
    console.error('[Notification Error] Error checking for existing comment notification:', error);
    return null; // On error, proceed with creating a new notification
  }
}

/**
 * Utility function to fix notification structure issues for a specific user
 * This can be called directly when experiencing issues with notifications
 * @param userId The user ID to fix notifications for
 * @returns Number of fixed notifications
 */
export const fixNotificationStructure = async (userId: string): Promise<number> => {
  try {
    if (!userId) {
      console.error('[Notification Error] Cannot fix notifications: No user ID provided');
      return 0;
    }
    
    console.log(`[Notification Info] Attempting to fix notifications for user: ${userId}`);
    
    // First, get all notifications in the collection to find any that might belong to this user
    const notificationsRef = collection(db, 'notifications');
    const allQuery = query(notificationsRef, limit(100));
    const allSnapshot = await getDocs(allQuery);
    
    if (allSnapshot.empty) {
      console.log('[Notification Info] No notifications found in the database');
      return 0;
    }
    
    // Find notifications that might belong to this user
    const potentialUserNotifications = allSnapshot.docs.filter(doc => {
      const data = doc.data();
      
      // Check all possible locations where the user ID might be stored
      return (
        data.userId === userId ||
        (data.raw && data.raw.userId === userId) ||
        (data.metadata && data.metadata.userId === userId) ||
        (data.targetUserId === userId) ||
        // Also check for partial matches in case the ID format is different
        (data.userId && data.userId.includes(userId)) ||
        (data.raw && data.raw.userId && data.raw.userId.includes(userId))
      );
    });
    
    console.log(`[Notification Info] Found ${potentialUserNotifications.length} potential notifications for user ${userId}`);
    
    if (potentialUserNotifications.length === 0) {
      return 0;
    }
    
    let fixedCount = 0;
    const now = new Date();
    
    // Update each notification to ensure it has the correct structure
    for (const docRef of potentialUserNotifications) {
      try {
        const data = docRef.data();
        const updates: any = {
          userId: userId, // Ensure userId is correct
          // Ensure we have timestamps in all required formats
          createdAtISO: data.createdAtISO || data.createdAt?.toDate()?.toISOString() || now.toISOString(),
          updatedAtISO: data.updatedAtISO || data.updatedAt?.toDate()?.toISOString() || now.toISOString(),
          // Ensure we have a raw field for easier querying
          raw: {
            userId: userId,
            createdTimestamp: data.createdAt?.toMillis() || now.getTime()
          },
          // Make sure iconType exists
          iconType: data.iconType || data.type || 'info',
          // Make sure read status is a boolean
          read: typeof data.read === 'boolean' ? data.read : false,
          // Ensure other required fields exist
          message: data.message || 'Notification',
          link: data.link || '/',
          // Ensure type exists
          type: data.type || 'info'
        };
        
        // Make sure metadata exists
        if (!data.metadata) {
          updates.metadata = {
            contentType: 'unknown',
            fileName: '',
            folderId: '',
            folderName: '',
            guestName: '',
            uploadDate: now.toISOString()
          };
        }
        
        // Update the notification with the fixed structure
        await updateDoc(doc(db, 'notifications', docRef.id), updates);
        fixedCount++;
        
        console.log(`[Notification Info] Fixed notification: ${docRef.id}`);
      } catch (error) {
        console.error(`[Notification Error] Failed to fix notification ${docRef.id}:`, error);
      }
    }
    
    console.log(`[Notification Info] Successfully fixed ${fixedCount} notifications for user ${userId}`);
    return fixedCount;
  } catch (error) {
    console.error('[Notification Error] Error fixing notification structure:', error);
    return 0;
  }
};

/**
 * Reset the notification system cache and active transactions
 * Call this function when experiencing issues with notifications
 * @returns A promise that resolves when the reset is complete
 */
export const resetNotificationSystem = async (): Promise<void> => {
  console.log('[Notification System] Resetting notification caches and active transactions');
  
  // Clear all cache maps
  recentNotificationOperations.clear();
  activeTransactions.clear();
  existingNotificationCache.clear();
  
  // Wait a moment to ensure any in-progress operations have time to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('[Notification System] Reset complete - notification system should now behave correctly');
};

/**
 * Handles notifications for users who have been mentioned in a comment
 * @param commentText The text content of the comment to check for mentions
 * @param documentId The ID of the document containing the comment
 * @param documentName The name of the document
 * @param folderId The ID of the folder containing the document
 * @param folderName The name of the folder
 * @param commentId The ID of the comment
 * @param authorId The ID of the user who created the comment
 * @param authorName The name of the user who created the comment
 * @param mentionedUsers Array of possible mentioned users with their IDs and usernames
 * @returns Array of notification IDs and list of notified usernames
 */
export const notifyMentionedUsers = async (
  commentText: string,
  documentId: string,
  documentName: string,
  folderId: string,
  folderName: string,
  commentId: string,
  authorId: string,
  authorName: string,
  mentionedUsers: Array<{ id: string, username: string }>
): Promise<{ notificationIds: string[], notifiedUsers: string[] }> => {
  console.log(`[Notification] Starting mention notification process for comment ${commentId}`);
  
  // Create the results object
  const result = {
    notificationIds: [] as string[],
    notifiedUsers: [] as string[]
  };
  
  // If there are no mentioned users or no comment text, return empty results
  if (!mentionedUsers.length || !commentText.trim()) {
    console.log(`[Notification] No mentioned users or empty comment, skipping notifications`);
    return result;
  }
  
  try {
    // Use the same extraction logic as in textUtils to ensure consistency
    // Extract mentions directly from the usernames, not trying to parse the comment text again
    const mentionedUsernames = mentionedUsers.map(user => user.username.trim().toLowerCase());
    
    if (!mentionedUsernames.length) {
      console.log(`[Notification] No mentions to process`);
      return result;
    }
    
    console.log(`[Notification] Processing ${mentionedUsernames.length} mentioned users: ${mentionedUsernames.join(', ')}`);
    
    // Reset notification system before creating new notifications to avoid duplicates
    await resetNotificationSystem();
    
    // Create the link to the document with comment context
    const link = `/documents/folders/${folderId}/files/${documentId}?comment=${commentId}`;
    
    // Filter out the author from the mentioned users (to avoid self-mentions)
    const usersToNotify = mentionedUsers.filter(user => user.id !== authorId);
    
    if (!usersToNotify.length) {
      console.log(`[Notification] No users to notify after filtering out author`);
      return result;
    }
    
    console.log(`[Notification] Creating notifications for ${usersToNotify.length} mentioned users`);
    
    // Create a notification for each mentioned user
    for (const user of usersToNotify) {
      try {
        // Check if there's already a notification for this user and comment
        const existingNotification = await checkForExistingMentionNotification(user.id, commentId);
        
        if (existingNotification) {
          console.log(`[Notification] User ${user.username} already has a notification for this comment`);
          result.notificationIds.push(existingNotification);
          result.notifiedUsers.push(user.username);
          continue;
        }
        
        // Create personalized notification for this user
        const notification = {
          iconType: 'comment-mention',
          type: 'info' as const,
          message: `${authorName} mentioned you in a comment`,
          link,
          read: false,
          userId: user.id,
          metadata: {
            contentType: 'comment',
            fileName: documentName,
            folderId,
            folderName,
            guestName: authorName,
            uploadDate: new Date().toISOString(),
            commentId,
            commentText,
            mentionedUserId: user.id
          }
        };
        
        // Create the notification
        const notificationId = await createNotification(notification);
        
        // Add to results if successful
        if (notificationId && typeof notificationId === 'string' && 
            !notificationId.startsWith('invalid') && 
            !notificationId.startsWith('retry') && 
            !notificationId.startsWith('general')) {
          console.log(`[Notification] Created notification for user ${user.username}: ${notificationId}`);
          result.notificationIds.push(notificationId);
          result.notifiedUsers.push(user.username);
        } else {
          console.error(`[Notification] Failed to create notification for user ${user.username}: ${notificationId}`);
        }
      } catch (error) {
        console.error(`[Notification] Error creating notification for user ${user.username}:`, error);
      }
    }
    
    console.log(`[Notification] Completed mention notifications: Notified ${result.notifiedUsers.length} users: ${result.notifiedUsers.join(', ')}`);
    return result;
  } catch (error) {
    console.error('[Notification] Error in notifyMentionedUsers:', error);
    return result;
  }
};

/**
 * Helper function to check if there's already a mention notification for this user and comment
 * to prevent duplicate notifications
 * @param userId User ID to check for existing notifications
 * @param commentId Comment ID to check for
 * @returns Notification ID if found, null otherwise
 */
async function checkForExistingMentionNotification(
  userId: string,
  commentId: string
): Promise<string | null> {
  // Generate a cache key for this check
  const cacheKey = `mention:${userId}:${commentId}`;
  
  // Check cache first for faster lookup
  if (existingNotificationCache.has(cacheKey)) {
    const cachedId = existingNotificationCache.get(cacheKey);
    console.log(`[Notification] Using cached mention notification ID for ${cacheKey}: ${cachedId}`);
    return cachedId || null;
  }
  
  try {
    console.log(`[Notification] Checking for existing mention notifications for user ${userId} and comment ${commentId}`);
    const notificationsRef = collection(db, 'notifications');
    
    // First query: Check by userId, commentId and iconType for mention notifications
    const q1 = query(
      notificationsRef,
      where('userId', '==', userId),
      where('metadata.commentId', '==', commentId),
      where('iconType', '==', 'comment-mention'),
      limit(5)
    );
    
    const snapshot1 = await getDocs(q1);
    console.log(`[Notification] Found ${snapshot1.docs.length} existing mention notifications`);
    
    if (!snapshot1.empty) {
      // Found existing notification(s)
      const notificationId = snapshot1.docs[0].id;
      // Cache the result
      existingNotificationCache.set(cacheKey, notificationId);
      return notificationId;
    }
    
    // If no specific mention notifications found, try more general queries
    const queries = [
      // Check by userId and commentId only
      query(
        notificationsRef,
        where('userId', '==', userId),
        where('metadata.commentId', '==', commentId),
        limit(5)
      ),
      // Check metadata.mentionedUserId field
      query(
        notificationsRef,
        where('userId', '==', userId),
        where('metadata.mentionedUserId', '==', userId),
        where('metadata.commentId', '==', commentId),
        limit(5)
      )
    ];
    
    // Try each query until we find a match
    for (const q of queries) {
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const notificationId = snapshot.docs[0].id;
        // Cache the result
        existingNotificationCache.set(cacheKey, notificationId);
        console.log(`[Notification] Found existing mention notification: ${notificationId}`);
        return notificationId;
      }
    }
    
    // No existing notification found after all queries
    console.log(`[Notification] No existing mention notifications found for user ${userId} and comment ${commentId}`);
    return null;
  } catch (error) {
    console.error('[Notification] Error checking for existing mention notification:', error);
    return null; // On error, proceed with creating a new notification
  }
}

/**
 * Creates task notifications for assigned users
 * @param taskId The ID of the task
 * @param taskTitle The title of the task
 * @param projectId The ID of the project
 * @param projectName The name of the project
 * @param creatorName The name of the user who created or updated the task
 * @param assignedUserIds Array of user IDs assigned to the task
 * @param dueDate The due date of the task
 * @param isUpdate Whether this is a task update (true) or new task creation (false)
 * @returns Array of created notification IDs
 */
export const createTaskNotification = async (
  taskId: string,
  taskTitle: string,
  projectId: string,
  projectName: string,
  creatorName: string,
  assignedUserIds: string[],
  dueDate: string,
  isUpdate: boolean = false
): Promise<string[]> => {
  try {
    console.log(`[Notification Info] Creating ${isUpdate ? 'task update' : 'new task'} notifications for ${assignedUserIds.length} users`);
    
    // If no target users provided, return empty array
    if (!assignedUserIds || assignedUserIds.length === 0) {
      console.warn('[Notification Warning] No target users provided for task notification');
      return [];
    }
    
    // Create the link to the task
    const link = `/projects/${projectId}/tasks?task=${taskId}`;
    
    // Create a notification for each assigned user
    const notificationPromises = assignedUserIds.map(userId => {
      const notification = {
        iconType: 'task-assignment',
        type: 'info' as const,
        message: isUpdate 
          ? `${creatorName} updated task "${taskTitle}"`
          : `${creatorName} assigned you to "${taskTitle}"`,
        link,
        read: false,
        userId, // Set the target user ID
        metadata: {
          contentType: 'task',
          fileName: '', // Using task title in message instead
          folderId: '',
          folderName: '',
          guestName: creatorName,
          uploadDate: new Date().toISOString(),
          projectId,
          taskId,
          dueDate
        }
      };
      
      return createNotification(notification);
    });
    
    try {
      // Wait for all notifications to be created
      const notificationIds = await Promise.all(notificationPromises);
      console.log(`[Notification Success] Created ${notificationIds.length} task notifications`);
      return notificationIds;
    } catch (error) {
      console.error('[Notification Error] Error creating task notifications:', error);
      return [];
    }
  } catch (error) {
    console.error('[Notification Error] Error in createTaskNotification:', error);
    return [];
  }
};