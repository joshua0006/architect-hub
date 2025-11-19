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
 * Handles any number of documents by batching queries (Firestore 'in' limited to 10 items).
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
    // Split uncached IDs into batches of 10 (Firestore 'in' operator limit)
    const batchSize = 10;
    const batches: string[][] = [];

    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      batches.push(uncachedIds.slice(i, i + batchSize));
    }

    console.log(`Processing ${uncachedIds.length} uncached documents in ${batches.length} batches`);

    // Process all batches in parallel
    const notificationsRef = collection(db, 'notifications');
    const batchPromises = batches.map(async (batch) => {
      const q = query(
        notificationsRef,
        where('metadata.fileId', 'in', batch),
        where('iconType', '==', 'file-upload')
      );
      return getDocs(q);
    });

    const snapshots = await Promise.all(batchPromises);

    // Process all query results
    snapshots.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        const data = doc.data() as NotificationDocument;
        const fileId = data.metadata?.fileId;
        const uploaderName = data.metadata?.guestName || 'Unknown User';

        if (fileId) {
          uploaderCache.set(fileId, uploaderName);
          results.set(fileId, uploaderName);
        }
      });
    });

    console.log(`Successfully resolved ${results.size} uploader names from notifications`);

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
 * Enhanced batch uploader name resolution with multi-source fallback strategy.
 * Tries multiple data sources to minimize "Unknown User" results.
 *
 * Fallback chain:
 * 1. Notification metadata.guestName
 * 2. Document createdByName field
 * 3. Document createdBy -> users collection lookup
 * 4. "Unknown User" (only if all sources fail)
 *
 * @param documentIds - Array of document IDs to resolve
 * @returns Promise<Map<string, string>> - Map of document ID to uploader name
 */
export async function getUploaderNamesWithFallback(
  documentIds: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  let notificationResolved = 0;
  let documentResolved = 0;
  let userResolved = 0;
  let unknownCount = 0;

  // Step 1: Try notification lookup (existing method)
  console.log(`🔍 Fallback Chain - Step 1: Trying notification lookup for ${documentIds.length} documents...`);
  const notificationResults = await getUploaderNamesFromNotifications(documentIds);

  // Separate resolved vs unknown
  const unknownDocIds: string[] = [];
  notificationResults.forEach((name, docId) => {
    if (name === 'Unknown User') {
      unknownDocIds.push(docId);
    } else {
      results.set(docId, name);
      notificationResolved++;
    }
  });

  console.log(`✅ Notification lookup: ${notificationResolved} resolved, ${unknownDocIds.length} unknown`);

  // Step 2: For unknowns, try document collection
  if (unknownDocIds.length > 0) {
    console.log(`🔍 Fallback Chain - Step 2: Querying documents collection for ${unknownDocIds.length} unknown documents...`);

    try {
      const documentsRef = collection(db, 'documents');
      const batchSize = 10;
      const batches: string[][] = [];

      for (let i = 0; i < unknownDocIds.length; i += batchSize) {
        batches.push(unknownDocIds.slice(i, i + batchSize));
      }

      const docBatchPromises = batches.map(async (batch) => {
        const q = query(documentsRef, where('__name__', 'in', batch));
        return getDocs(q);
      });

      const docSnapshots = await Promise.all(docBatchPromises);

      // Process document results
      const stillUnknownDocIds: string[] = [];
      const docsWithUserIds: Array<{ docId: string; userId: string }> = [];

      docSnapshots.forEach(snapshot => {
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const docId = doc.id;

          // Try createdByName first
          if (data.createdByName && data.createdByName.trim() && data.createdByName !== 'Unknown User') {
            results.set(docId, data.createdByName.trim());
            uploaderCache.set(docId, data.createdByName.trim());
            documentResolved++;
          }
          // If no createdByName but has createdBy userId, save for user lookup
          else if (data.createdBy && data.createdBy.trim()) {
            docsWithUserIds.push({ docId, userId: data.createdBy });
          }
          // Still unknown
          else {
            stillUnknownDocIds.push(docId);
          }
        });
      });

      console.log(`✅ Document lookup: ${documentResolved} resolved, ${docsWithUserIds.length} have userIds, ${stillUnknownDocIds.length} still unknown`);

      // Step 3: For documents with userIds, query users collection
      if (docsWithUserIds.length > 0) {
        console.log(`🔍 Fallback Chain - Step 3: Querying users collection for ${docsWithUserIds.length} user IDs...`);

        try {
          const usersRef = collection(db, 'users');
          const uniqueUserIds = [...new Set(docsWithUserIds.map(d => d.userId))];

          const userBatches: string[][] = [];
          for (let i = 0; i < uniqueUserIds.length; i += batchSize) {
            userBatches.push(uniqueUserIds.slice(i, i + batchSize));
          }

          const userBatchPromises = userBatches.map(async (batch) => {
            const q = query(usersRef, where('__name__', 'in', batch));
            return getDocs(q);
          });

          const userSnapshots = await Promise.all(userBatchPromises);

          // Build userId -> displayName map
          const userIdToName = new Map<string, string>();
          userSnapshots.forEach(snapshot => {
            snapshot.docs.forEach(userDoc => {
              const userData = userDoc.data();
              const displayName = userData.displayName || userData.name || userData.email || null;
              if (displayName && displayName.trim()) {
                userIdToName.set(userDoc.id, displayName.trim());
              }
            });
          });

          // Map document IDs to user display names
          docsWithUserIds.forEach(({ docId, userId }) => {
            const userName = userIdToName.get(userId);
            if (userName) {
              results.set(docId, userName);
              uploaderCache.set(docId, userName);
              userResolved++;
            } else {
              results.set(docId, 'Unknown User');
              uploaderCache.set(docId, 'Unknown User');
              unknownCount++;
            }
          });

          console.log(`✅ User lookup: ${userResolved} resolved, ${unknownCount} unknown (user doc missing/incomplete)`);
        } catch (error) {
          console.error('Error querying users collection:', error);
          // Mark all with userIds as unknown
          docsWithUserIds.forEach(({ docId }) => {
            results.set(docId, 'Unknown User');
            uploaderCache.set(docId, 'Unknown User');
            unknownCount++;
          });
        }
      }

      // Mark remaining unknowns
      stillUnknownDocIds.forEach(docId => {
        results.set(docId, 'Unknown User');
        uploaderCache.set(docId, 'Unknown User');
        unknownCount++;
      });

    } catch (error) {
      console.error('Error querying documents collection:', error);
      // Mark all unknowns as Unknown User
      unknownDocIds.forEach(docId => {
        if (!results.has(docId)) {
          results.set(docId, 'Unknown User');
          uploaderCache.set(docId, 'Unknown User');
          unknownCount++;
        }
      });
    }
  }

  // Summary
  const totalResolved = notificationResolved + documentResolved + userResolved;
  console.log(`📊 Resolution Summary: ${totalResolved}/${documentIds.length} resolved (Notifications: ${notificationResolved}, Documents: ${documentResolved}, Users: ${userResolved}, Unknown: ${unknownCount})`);

  return results;
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
