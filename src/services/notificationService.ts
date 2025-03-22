import { collection, query, where, orderBy, limit, getDocs, addDoc, updateDoc, doc, onSnapshot, Timestamp, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Notification {
  id: string;
  createdAt: any;
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
  };
  read: boolean;
  type: 'success' | 'info' | 'warning' | 'error';
  updatedAt: any;
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
    console.log('Creating notification with data:', JSON.stringify(notification, null, 2));
    
    const notificationsRef = collection(db, 'notifications');
    const notificationData = {
      ...notification,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(notificationsRef, notificationData);
    console.log(`Notification created with ID: ${docRef.id} and link: ${notification.link}`);
    return docRef.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Creates a notification when a guest uploads a file
 * @param fileName The name of the uploaded file
 * @param guestName The name of the guest who uploaded the file
 * @param folderId The ID of the folder where the file was uploaded
 * @param folderName The name of the folder where the file was uploaded
 * @param fileId The ID of the uploaded file (optional)
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
  uploadDate: string = new Date().toISOString()
): Promise<string> => {
  // Format the guest name for display in notification
  const formattedGuestName = guestName || 'Anonymous user';
  
  // Create the link to the document with proper context
  let link = `/documents/projects/${projectId}`;
  
  if (folderId) {
    link += `/folders/${folderId}`;
    
    if (fileId) {
      link += `/files/${fileId}`;
    }
  } else if (fileId) {
    link += `/files/${fileId}`;
  }
  
  return createNotification({
    iconType: 'file-upload',
    type: 'info',
    message: `${formattedGuestName} uploaded "${fileName}" to ${folderName}`,
    link: link,
    read: false,
    metadata: {
      contentType: contentType,
      fileName: fileName,
      folderId: folderId,
      folderName: folderName,
      guestName: formattedGuestName,
      uploadDate: uploadDate,
      projectId: projectId
    }
  });
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
 * Marks all notifications as read
 */
export const markAllNotificationsAsRead = async (): Promise<void> => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(notificationsRef, where('read', '==', false));
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
 * Gets recent notifications
 * @param notificationLimit The maximum number of notifications to retrieve
 * @returns A list of notifications
 */
export const getRecentNotifications = async (
  notificationLimit: number = 10
): Promise<Notification[]> => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      orderBy('createdAt', 'desc'),
      limit(notificationLimit)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Notification[];
  } catch (error) {
    console.error('Error getting recent notifications:', error);
    throw error;
  }
};

/**
 * Sets up a real-time listener for notifications
 * @param callback The callback function to handle new notifications
 * @returns An unsubscribe function
 */
export const subscribeToNotifications = (
  callback: (notifications: Notification[]) => void
): (() => void) => {
  const notificationsRef = collection(db, 'notifications');
  const q = query(
    notificationsRef,
    orderBy('createdAt', 'desc'),
    limit(10)
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const notifications = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Notification[];
    
    callback(notifications);
  });
};

/**
 * Gets the count of unread notifications
 * @returns The count of unread notifications
 */
export const getUnreadNotificationCount = async (): Promise<number> => {
  try {
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('read', '==', false)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    throw error;
  }
};

/**
 * Deletes all read notifications from Firestore
 * @returns The number of notifications deleted
 */
export const deleteReadNotifications = async (): Promise<number> => {
  try {
    console.log('Deleting all read notifications');
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('read', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log('No read notifications to delete');
      return 0;
    }
    
    console.log(`Found ${querySnapshot.size} read notifications to delete`);
    
    const deletePromises = querySnapshot.docs.map(document => 
      deleteDoc(doc(db, 'notifications', document.id))
    );
    
    await Promise.all(deletePromises);
    console.log(`Successfully deleted ${querySnapshot.size} read notifications`);
    
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
    console.log(`Deleting notification with ID: ${notificationId}`);
    const notificationRef = doc(db, 'notifications', notificationId);
    await deleteDoc(notificationRef);
    console.log(`Successfully deleted notification: ${notificationId}`);
  } catch (error) {
    console.error(`Error deleting notification ${notificationId}:`, error);
    throw error;
  }
}; 