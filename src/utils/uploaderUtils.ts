import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';

// In-memory cache to avoid repeated queries for the same document
const uploaderCache = new Map<string, string>();

/**
 * Interface for notification metadata containing uploader information
 */
interface NotificationMetadata {
  fileId?: string;
  guestName?: string;
  uploaderRole?: string;
  fileName?: string;
  contentType?: string;
  folderId?: string;
  folderName?: string;
  uploadDate?: string;
  projectId?: string;
}

/**
 * Interface for notification document from Firestore
 */
interface NotificationDocument {
  id: string;
  iconType: string;
  metadata: NotificationMetadata;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  userId: string;
  createdAt: any;
  read: boolean;
}

/**
 * Retrieves the uploader name for a document from the notifications collection.
 * This is used as a fallback for legacy documents that don't have createdByName.
 *
 * @param documentId - The ID of the document
 * @returns Promise<string> - The uploader name or "Unknown User" if not found
 */
export async function getUploaderNameFromNotification(documentId: string): Promise<string> {
  // Check cache first
  if (uploaderCache.has(documentId)) {
    return uploaderCache.get(documentId)!;
  }

  try {
    // Query notifications collection for file upload notifications matching this document
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('metadata.fileId', '==', documentId),
      where('iconType', '==', 'file-upload'),
      limit(1)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      // No notification found, return unknown user
      uploaderCache.set(documentId, 'Unknown User');
      return 'Unknown User';
    }

    // Extract uploader name from notification metadata
    const notificationData = snapshot.docs[0].data() as NotificationDocument;
    const uploaderName = notificationData.metadata?.guestName || 'Unknown User';

    // Cache the result
    uploaderCache.set(documentId, uploaderName);

    return uploaderName;
  } catch (error) {
    console.error(`Error fetching uploader for document ${documentId}:`, error);
    uploaderCache.set(documentId, 'Unknown User');
    return 'Unknown User';
  }
}

/**
 * Batch retrieves uploader names for multiple documents from notifications.
 * More efficient than calling getUploaderNameFromNotification multiple times.
 *
 * @param documentIds - Array of document IDs
 * @returns Promise<Map<string, string>> - Map of document ID to uploader name
 */
export async function getUploaderNamesFromNotifications(
  documentIds: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Filter out already cached IDs
  const uncachedIds = documentIds.filter(id => !uploaderCache.has(id));

  // Return cached results if all are cached
  if (uncachedIds.length === 0) {
    documentIds.forEach(id => {
      results.set(id, uploaderCache.get(id)!);
    });
    return results;
  }

  try {
    // Query notifications for all uncached document IDs
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('metadata.fileId', 'in', uncachedIds.slice(0, 10)), // Firestore 'in' operator limited to 10 items
      where('iconType', '==', 'file-upload')
    );

    const snapshot = await getDocs(q);

    // Process query results
    snapshot.docs.forEach(doc => {
      const data = doc.data() as NotificationDocument;
      const fileId = data.metadata?.fileId;
      const uploaderName = data.metadata?.guestName || 'Unknown User';

      if (fileId) {
        uploaderCache.set(fileId, uploaderName);
        results.set(fileId, uploaderName);
      }
    });

    // Handle documents that weren't found in notifications
    uncachedIds.forEach(id => {
      if (!results.has(id)) {
        uploaderCache.set(id, 'Unknown User');
        results.set(id, 'Unknown User');
      }
    });

    // Add cached results for originally requested IDs
    documentIds.forEach(id => {
      if (uploaderCache.has(id) && !results.has(id)) {
        results.set(id, uploaderCache.get(id)!);
      }
    });

    return results;
  } catch (error) {
    console.error('Error batch fetching uploaders from notifications:', error);

    // Fallback: mark all as unknown
    documentIds.forEach(id => {
      if (!uploaderCache.has(id)) {
        uploaderCache.set(id, 'Unknown User');
      }
      results.set(id, uploaderCache.get(id)!);
    });

    return results;
  }
}

/**
 * Clears the uploader name cache. Useful for testing or when data is updated.
 */
export function clearUploaderCache(): void {
  uploaderCache.clear();
}

/**
 * Gets the current cache size. Useful for monitoring and debugging.
 */
export function getUploaderCacheSize(): number {
  return uploaderCache.size;
}
