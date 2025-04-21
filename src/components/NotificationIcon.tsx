import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Bell, X, Check, CheckCheck, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  subscribeToNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  deleteReadNotifications,
  deleteNotification,
  getUnreadNotificationCount,
  getRecentNotifications,
  resetNotificationSystem,
  Notification 
} from '../services/notificationService';
import { formatDistanceToNow } from 'date-fns';
import NotificationContent from './NotificationContent';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

// Extended notification interface to include subtaskId in metadata
interface ExtendedNotification extends Notification {
  metadata: Notification['metadata'] & {
    subtaskId?: string;
    parentTaskId?: string;
    parentTaskTitle?: string;
  }
}

// Add a custom event for document refreshing
export const NOTIFICATION_DOCUMENT_UPDATE_EVENT = 'notification-document-update';

// Global flag to ensure only one notification subscription is active
let GLOBAL_SUBSCRIPTION_ACTIVE = false;

export const NotificationIcon: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const lastNotificationUpdate = useRef<number>(0);
  const lastSubscriptionUpdate = useRef<number>(0);
  const hasActiveSubscription = useRef<boolean>(false);
  const setupInProgress = useRef<boolean>(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  
  // Count of read notifications
  const readCount = notifications.filter(n => n.read).length;
  
  // Add a new state to track which notification is being deleted by ID
  const [deletingNotificationId, setDeletingNotificationId] = useState<string | null>(null);
  
  // Function to handle navigation for task and subtask notifications
  const handleTaskNotificationNavigation = (notification: ExtendedNotification) => {
    // Extract task ID and project ID from metadata
    let taskId = notification.metadata?.taskId;
    let projectId = notification.metadata?.projectId;
    
    console.log('Task Notification Navigation Debug:', {
      notification: {
        id: notification.id,
        iconType: notification.iconType,
        contentType: notification.metadata?.contentType,
        metadata: notification.metadata,
        link: notification.link
      },
      taskId,
      projectId,
      currentPath: window.location.pathname
    });
    
    // For subtask notifications, check if we have a subtaskId in metadata
    const isSubtaskRelated = notification.iconType === 'task-subtask';
    const isSubtaskAssignment = isSubtaskRelated && notification.metadata?.contentType === 'subtask-assignment';
    
    // If this is a subtask notification, make sure we highlight both the task and subtask
    let subtaskId = isSubtaskRelated ? notification.metadata?.subtaskId : null;
    
    // For subtask notifications, try different ways of getting the subtask ID
    if (isSubtaskRelated && !subtaskId) {
      // Look for subtaskId in the URL
      const subtaskIdMatch = notification.link.match(/subtask_id=([^&]+)/);
      if (subtaskIdMatch && subtaskIdMatch[1]) {
        subtaskId = subtaskIdMatch[1];
        console.log('Extracted subtaskId from link query param:', subtaskId);
      } else {
        console.warn('Could not find subtaskId in notification for a subtask notification', {
          notificationId: notification.id,
          link: notification.link,
          metadata: notification.metadata
        });
      }
    }
    
    // Handle legacy notification format where link has task_id query parameter
    if (!taskId && notification.link.includes('task_id=')) {
      const taskIdMatch = notification.link.match(/task_id=([^&]+)/);
      if (taskIdMatch && taskIdMatch[1]) {
        taskId = taskIdMatch[1];
        console.log('Extracted taskId from legacy link format:', taskId);
      }
    }
    
    // Handle legacy notification format where link has /projects/ path
    if (!projectId && notification.link.includes('/projects/')) {
      const projectIdMatch = notification.link.match(/\/projects\/([^\/\?]+)/);
      if (projectIdMatch && projectIdMatch[1]) {
        projectId = projectIdMatch[1];
        console.log('Extracted projectId from legacy link format:', projectId);
      }
    }
    
    // Extract both projectId and taskId from links with /tasks/{projectId}/{taskId} format
    if ((!projectId || !taskId) && notification.link.includes('/tasks/')) {
      const taskUrlMatch = notification.link.match(/\/tasks\/([^\/]+)\/([^\/\?]+)/);
      if (taskUrlMatch && taskUrlMatch.length >= 3) {
        const extractedProjectId = taskUrlMatch[1];
        const extractedTaskId = taskUrlMatch[2];
        
        if (!projectId && extractedProjectId) {
          projectId = extractedProjectId;
          console.log('Extracted projectId from tasks URL:', projectId);
        }
        
        if (!taskId && extractedTaskId) {
          taskId = extractedTaskId;
          console.log('Extracted taskId from tasks URL:', taskId);
        }
      }
    }
    
    // For subtask notifications, if we don't have a task ID, use the parent task ID
    if (isSubtaskRelated && !taskId && notification.metadata?.parentTaskId) {
      taskId = notification.metadata.parentTaskId;
      console.log('Using parentTaskId for subtask notification:', taskId);
    }
    
    // For subtask notifications, make sure we have a task ID
    if (isSubtaskRelated && !taskId) {
      console.error('Subtask notification missing required taskId/parentTaskId metadata');
      return;
    }
    
    if (!taskId || !projectId) {
      console.error('Task notification missing required taskId or projectId metadata:', {
        taskId,
        projectId,
        link: notification.link,
        metadata: notification.metadata
      });
      
      // Try one more fallback approach - parse the URL directly for tasks
      if (notification.link.startsWith('/tasks/')) {
        const pathParts = notification.link.split('/').filter(Boolean);
        if (pathParts.length >= 3 && pathParts[0] === 'tasks') {
          // The URL format should be /tasks/{projectId}/{taskId}
          projectId = pathParts[1];
          taskId = pathParts[2];
          
          console.log('Fallback extraction from URL path:', { projectId, taskId });
          
          if (projectId && taskId) {
            // Continue with navigation using these extracted IDs
            console.log('Using fallback IDs for navigation');
          } else {
            showToast('Unable to navigate to this task', 'error');
            return;
          }
        } else {
          showToast('Unable to navigate to this task', 'error');
          return;
        }
      } else {
        showToast('Unable to navigate to this task', 'error');
        return;
      }
    }
    
    // Navigate to the task page with the correct URL format
    const taskUrl = `/tasks/${projectId}/${taskId}`;
    console.log(`Navigating to task page: ${taskUrl} with subtaskId: ${subtaskId || 'none'}`);
    
    // Special handling for legacy URL formats that might have unexpected structure
    if (notification.link && notification.link !== taskUrl) {
      console.log(`Link format mismatch. Using generated URL ${taskUrl} instead of original ${notification.link}`);
    }
    
    // First, dispatch a custom event for task refresh to prepare the component
    const eventDetail = {
      taskId,
      projectId,
      subtaskId,
      notificationType: notification.iconType,
      timestamp: Date.now(),
      source: 'notification',
      isSubtaskAssignment
    };
    
    // Enhanced logging to debug subtask navigation
    console.log('Task Navigation Details:', {
      navigatingTo: taskUrl,
      subtaskId,
      isSubtaskRelated,
      isSubtaskAssignment,
      eventDetail,
      notificationMetadata: notification.metadata
    });
    
    // Dispatch task update event that components can listen for
    const customEvent = new CustomEvent('task-notification-update', { 
      detail: eventDetail,
      bubbles: true
    });
    document.dispatchEvent(customEvent);
    
    // Give a short delay to ensure the event is processed before navigation
    setTimeout(() => {
      navigate(taskUrl, { 
        state: { 
          fromNotification: true,
          highlightTaskId: taskId,
          highlightSubtaskId: subtaskId,
          isSubtaskAssignment,
          isSubtaskRelated,
          parentTaskId: isSubtaskRelated ? taskId : undefined,
          parentTaskTitle: isSubtaskRelated ? notification.metadata?.parentTaskTitle : undefined,
          timestamp: Date.now()
        },
        replace: true // Use replace to avoid history stacking
      });
    }, 100);
  };
  
  // Function to deduplicate notifications by ID - memoized to prevent recreating
  const deduplicateNotifications = useCallback((notifs: Notification[]): Notification[] => {
    // Use a Map to deduplicate by ID
    const uniqueNotifs = new Map<string, Notification>();
    
    // First add all existing notifications to the map
    notifications.forEach(n => uniqueNotifs.set(n.id, n));
    
    // Then add/update with any new notifications
    notifs.forEach(n => uniqueNotifs.set(n.id, n));
    
    // Convert back to array and sort by createdAt (newest first)
    return Array.from(uniqueNotifs.values())
      .sort((a, b) => {
        // Try to parse createdAt to timestamps for comparison
        const timeA = a.createdAt?.toMillis?.() || 
                      (a.createdAtISO ? new Date(a.createdAtISO).getTime() : 0) || 
                      (a.raw?.createdTimestamp || 0);
        const timeB = b.createdAt?.toMillis?.() || 
                      (b.createdAtISO ? new Date(b.createdAtISO).getTime() : 0) || 
                      (b.raw?.createdTimestamp || 0);
        return timeB - timeA;
      });
  }, [notifications]);
  
  // Fetch notifications manually - memoized for stability
  const fetchNotifications = useCallback(async (forceFetch = false, skipLoadingState = false) => {
    if (!user || hasActiveSubscription.current) {
      // Skip manual fetching if we have active subscription
      return;
    }
    
    try {
      // Increase throttle time from 30s to 2 minutes
      const now = Date.now();
      if (!forceFetch && now - lastNotificationUpdate.current < 120000) {
        return;
      }
      
      if (!skipLoadingState) {
        setIsLoading(true);
      }
      setError(null);
      
      // Force direct fetch from Firestore instead of relying on cache
      const recentNotifications = await getRecentNotifications(user.id, 20);
      
      if (recentNotifications.length > 0) {
        // Update with deduplication
        setNotifications(prev => deduplicateNotifications(recentNotifications));
        const newUnreadCount = recentNotifications.filter(n => !n.read).length;
        setUnreadCount(newUnreadCount);
      }
      
      lastNotificationUpdate.current = now;
    } catch (error) {
      console.error('[Notification Bell] Error fetching notifications:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to load notifications: ${errorMessage}`);
      showToast('Could not load notifications', 'error');
    } finally {
      if (!skipLoadingState) {
        setIsLoading(false);
      }
    }
  }, [user, showToast, deduplicateNotifications]);
  
  // Throttled update function for subscription updates - less aggressive throttling for faster updates
  const updateNotificationsThrottled = useCallback((newNotifications: Notification[]) => {
    const now = Date.now();
    
    // For file upload notifications, decrease throttle time to make them appear faster
    const fileUploadNotifications = newNotifications.filter(n => n.iconType === 'file-upload' && !n.read);
    const mentionNotifications = newNotifications.filter(n => n.iconType === 'comment-mention' && !n.read);
    const hasFileUploads = fileUploadNotifications.length > 0;
    const hasMentions = mentionNotifications.length > 0;
    
    // Reduce the default throttle time for faster updates
    // Default: 10 seconds, file uploads and mentions: 2 seconds
    const throttleTime = hasFileUploads || hasMentions ? 2000 : 10000;
    
    // If there's any unread notification, reduce throttle time to ensure timely updates
    if (now - lastSubscriptionUpdate.current < throttleTime && 
        !newNotifications.some(n => !n.read && n.id && !notifications.some(existing => existing.id === n.id))) {
      return;
    }
    
    if (newNotifications.length === 0) return;
    
    // Compare current and new notifications to detect any changes
    // Focus on detecting new notifications that don't exist in current state
    const existingIds = new Set(notifications.map(n => n.id));
    const hasNewNotifications = newNotifications.some(n => !existingIds.has(n.id));
    
    // Check if read status has changed for any notifications
    const readStatusChanged = newNotifications.some(newNote => {
      const existing = notifications.find(n => n.id === newNote.id);
      return existing && existing.read !== newNote.read;
    });
    
    // Update if we have new notifications or read status has changed
    if (hasNewNotifications || readStatusChanged) {
      console.log(`[Notification] Detected changes - New: ${hasNewNotifications}, Read status changed: ${readStatusChanged}`);
      
      // Single state update to reduce renders
      setNotifications(prev => {
        const updated = deduplicateNotifications(newNotifications);
        const newUnreadCount = updated.filter(n => !n.read).length;
        
        // Only update unread count if it changed
        if (newUnreadCount !== unreadCount) {
          // Use setTimeout to separate state updates
          setTimeout(() => {
            setUnreadCount(newUnreadCount);
            
            // Only show toast for new notifications if there are more than before
            if (newUnreadCount > unreadCount) {
              // Check for file upload notifications specifically
              const fileUploadNotifications = updated.filter(
                n => n.iconType === 'file-upload' && !n.read
              );
              
              // Check for mention notifications specifically
              const mentionNotifications = updated.filter(
                n => n.iconType === 'comment-mention' && !n.read
              );
              
              if (fileUploadNotifications.length > 0) {
                // Show a toast for file uploads
                const latestUpload = fileUploadNotifications.sort((a, b) => {
                  const timeA = a.createdAt?.toMillis?.() || new Date(a.createdAtISO || Date.now()).getTime();
                  const timeB = b.createdAt?.toMillis?.() || new Date(b.createdAtISO || Date.now()).getTime();
                  return timeB - timeA;
                })[0];
                
                if (latestUpload && latestUpload.metadata) {
                  const guestName = latestUpload.metadata.guestName || 'A guest';
                  showToast(`${guestName} uploaded a file`, 'success');
                } else {
                  showToast('New file uploaded', 'success');
                }
              } else if (mentionNotifications.length > 0) {
                showToast(`You were mentioned in a comment`, 'success');
              } else if (newUnreadCount - unreadCount > 0) {
                showToast('You have new notifications', 'success');
              }
            }
          }, 100);
        }
        
        return updated;
      });
      
      lastSubscriptionUpdate.current = now;
      lastNotificationUpdate.current = now;
    }
  }, [notifications, unreadCount, deduplicateNotifications, showToast]);
  
  // Update the setupUserSubscription implementation to properly handle errors
  const setupUserSubscription = (userId: string) => {
    // Make sure to clean up any existing subscription first
    if (unsubscribeRef.current) {
      console.log('[Notification] Cleaning up existing subscription');
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    // If we already have an active subscription, don't create another one
    if (hasActiveSubscription.current) {
      console.log('[Notification] Subscription already active, skipping setup');
      return;
    }
    
    // Set up new subscription
    try {
      console.log(`[Notification] Setting up subscription for user ${userId}`);
      // Set up real-time updates with throttled callback
      const unsubscribe = subscribeToNotifications(userId, updateNotificationsThrottled);
      
      // Store the unsubscribe function
      unsubscribeRef.current = unsubscribe;
      hasActiveSubscription.current = true;
      
      // Initial fetch to populate state without triggering a reset
      getRecentNotifications(userId, 20).then(notifications => {
        if (notifications.length > 0) {
          setNotifications(deduplicateNotifications(notifications));
          setUnreadCount(notifications.filter(n => !n.read).length);
        }
      }).catch(error => {
        console.error('[Notification] Initial fetch error:', error);
      });
    } catch (error) {
      console.error('[Notification Error] Error setting up user subscription:', error);
      hasActiveSubscription.current = false;
    }
  };
  
  // Update the useEffect that was previously optimized
  useEffect(() => {
    if (!user || !user.id) return;
    
    // Reference to user ID for cleanup
    const userId = user.id;
    
    // Prevent multiple setups for the same user
    if (setupInProgress.current) {
      console.log('[Notification] Setup already in progress, skipping');
      return;
    }
    
    // Only set up subscription if not already active for this user
    if (hasActiveSubscription.current || GLOBAL_SUBSCRIPTION_ACTIVE) {
      console.log('[Notification] Subscription already active, skipping setup');
      return;
    }
    
    console.log(`[Notification] Starting subscription setup for user ${userId}`);
    
    // Set flags to prevent concurrent setup
    GLOBAL_SUBSCRIPTION_ACTIVE = true;
    setupInProgress.current = true;
    
    // Direct setup without resetting notification system
    setupUserSubscription(userId);
    setupInProgress.current = false;
    
    // Clean up function
    return () => {
      console.log(`[Notification] Cleaning up subscription for user ${userId}`);
      
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      hasActiveSubscription.current = false;
      GLOBAL_SUBSCRIPTION_ACTIVE = false;
      setupInProgress.current = false;
    };
  }, [user]); // Only depend on user to prevent unnecessary re-runs
  
  // Setup a less frequent refresh mechanism - increased from 10 minutes to 30 minutes
  useEffect(() => {
    if (!user) return;
    
    // Periodic refresh - increased from 10 to 30 minutes
    const intervalId = setInterval(() => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastNotificationUpdate.current;
      
      // Only refresh if no update in the last 30 minutes
      if (timeSinceLastUpdate > 1800000) {
        fetchNotifications();
      }
    }, 1800000); // Check every 30 minutes
    
    return () => {
      clearInterval(intervalId);
    };
  }, [user, fetchNotifications]);
  
  // Close notification panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Handle marking a notification as read and navigate to folder/file
  const handleNotificationClick = async (notification: Notification) => {
    if (!user) return;
    
    console.log('Notification clicked:', {
      id: notification.id,
      type: notification.type,
      iconType: notification.iconType,
      link: notification.link,
      hasMetadata: !!notification.metadata,
      metadata: notification.metadata
    });
    
    try {
      // Verify this notification belongs to the current user
      if (notification.userId !== user.id) {
        console.error('Attempting to access notification that does not belong to current user');
        return;
      }
      
      // Mark as read first to ensure this happens regardless of navigation
      if (!notification.read) {
        await markNotificationAsRead(notification.id);
        
        // Update local state to mark this notification as read
        setNotifications(prev => 
          prev.map(n => 
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
        
        // Update unread count
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      // Close notification panel - do this early in the process
      setShowNotifications(false);
      
      // Navigate to link if provided
      if (notification.link) {
        // Check if this is a task notification
        const isTaskNotification = notification.iconType === 'task-assignment';
        // Check if this is a subtask notification
        const isSubtaskNotification = notification.iconType === 'task-subtask';
        
        console.log('Notification link checks:', {
          isTaskNotification,
          isSubtaskNotification,
          willUseTaskHandler: isTaskNotification || isSubtaskNotification,
          notificationLink: notification.link,
          metadata: notification.metadata
        });
        
        // Handle task and subtask notifications with a separate function
        if (isTaskNotification || isSubtaskNotification) {
          console.log('Calling handleTaskNotificationNavigation');
          handleTaskNotificationNavigation(notification as ExtendedNotification);
          return;
        }
        
        // Check if this is a file upload notification
        const isFileUploadNotification = notification.iconType === 'file-upload';
        
        // Handle file upload notifications specially
        if (isFileUploadNotification) {
          // For file upload notifications, get the file ID from metadata
          const fileId = notification.metadata?.fileId;
          const folderId = notification.metadata?.folderId;
          
          if (fileId && folderId) {
            // Create a navigation state with information about the file upload
            const navigationState = {
              needsProjectSwitch: true,
              targetFolderId: folderId,
              targetFileId: fileId,
              fromNotification: true,
              timestamp: Date.now(),
              notificationType: 'file-upload',
              forceDirect: true,
              highlightNew: true // Signal to the file viewer that this is a newly uploaded file
            };
            
            // Build target link
            const targetLink = `/documents/folders/${folderId}/files/${fileId}`;
            
            // Dispatch refresh event
            const eventDetail = {
              fileId,
              folderId,
              notificationType: 'file-upload',
              fileName: notification.metadata?.fileName,
              timestamp: Date.now(),
              source: 'notification'
            };
            
            // Dispatch the event with details
            const customEvent = new CustomEvent(NOTIFICATION_DOCUMENT_UPDATE_EVENT, { 
              detail: eventDetail,
              bubbles: true
            });
            document.dispatchEvent(customEvent);
            
            // Navigate to the file
            navigate(targetLink, { state: navigationState, replace: true });
            return;
          }
        }
        
        // Extract the folder ID from the link or from metadata
        let folderId = notification.metadata?.folderId;
        if (!folderId && notification.link.includes('/folders/')) {
          const folderMatch = notification.link.match(/\/folders\/([^\/]+)/);
          if (folderMatch && folderMatch[1]) {
            folderId = folderMatch[1];
          }
        }
        
        // Extract file ID if present in the link or from metadata
        let fileId = notification.metadata?.fileId; // First try to get from metadata
        if (!fileId && notification.link.includes('/files/')) {
          const fileMatch = notification.link.match(/\/files\/([^\/]+)/);
          if (fileMatch && fileMatch[1]) {
            fileId = fileMatch[1];
          }
        }
        
        // Handle special case for file upload notifications
        if (notification.iconType === 'file-upload' && !fileId) {
          // For file upload notifications, the fileId might be in a different field
          if (notification.metadata?.fileId) {
            fileId = notification.metadata.fileId;
          }
        }
        
        // Determine if we need to handle project switching
        const currentPath = window.location.pathname;
        const isInDocuments = currentPath.startsWith('/documents');
        const isInDifferentProject = true; // Always force project navigation for consistency
        
        // Create comprehensive navigation state
        interface NavigationState {
          needsProjectSwitch: boolean;
          targetFolderId?: string;
          targetFileId?: string;
          fromNotification: boolean;
          timestamp: number;
          notificationType?: string;
          forceDirect: boolean;
          targetLink?: string;
          commentId?: string;
        }
        
        const navigationState: NavigationState = {
          needsProjectSwitch: isInDifferentProject,
          targetFolderId: folderId,
          targetFileId: fileId,
          fromNotification: true,
          timestamp: Date.now(),
          notificationType: notification.iconType,
          forceDirect: true // Force direct navigation
        };
        
        // Extract comment ID from query parameter if it exists
        if (notification.link.includes('?comment=')) {
          const commentMatch = notification.link.match(/\?comment=([^&]+)/);
          if (commentMatch && commentMatch[1]) {
            navigationState.commentId = commentMatch[1];
          }
        }
        
        // Build the correct target link - always start from /documents
        let targetLink = '/documents';
        
        if (folderId) {
          targetLink += `/folders/${folderId}`;
          
          if (fileId) {
            targetLink += `/files/${fileId}`;
            
            // Add comment ID if present
            if (navigationState.commentId) {
              targetLink += `?comment=${navigationState.commentId}`;
            }
          }
        } else if (fileId) {
          targetLink += `/files/${fileId}`;
          
          // Add comment ID if present
          if (navigationState.commentId) {
            targetLink += `?comment=${navigationState.commentId}`;
          }
        }
        
        // Create navigation state with the correct target link
        navigationState.targetLink = targetLink;
        
        // Dispatch a custom event to trigger document refresh
        if (fileId || folderId) {
          const eventDetail = {
            fileId,
            folderId,
            commentId: navigationState.commentId,
            notificationType: notification.iconType,
            fileName: notification.metadata?.fileName,
            timestamp: Date.now(),
            source: 'notification'
          };
          
          // Dispatch the event with details
          const customEvent = new CustomEvent(NOTIFICATION_DOCUMENT_UPDATE_EVENT, { 
            detail: eventDetail,
            bubbles: true
          });
          document.dispatchEvent(customEvent);
        }
        
        // First navigate to documents to ensure we're in the documents section
        // Make sure we're not handling task notifications here by checking the icon type
        const isTaskRelated = notification.iconType === 'task-assignment' || notification.iconType === 'task-subtask';
        
        if (!isTaskRelated) {
          if (!isInDocuments) {
            navigate(targetLink, { state: navigationState, replace: true });
          } else {
            // If we need project switching, always navigate directly to the target
            navigate(targetLink, { state: navigationState, replace: true });
          }
        }
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };
  
  // Handle marking all notifications as read
  const handleMarkAllAsRead = async () => {
    if (!user) return;
    
    try {
      // Don't set loading state here since it's managed by the caller
      // Call the service to mark all notifications as read
      await markAllNotificationsAsRead(user.id);
      
      // Update local state to mark all notifications as read
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      
      // Reset unread count to zero
      setUnreadCount(0);
      
      showToast('All notifications marked as read', 'success');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      showToast('Failed to mark notifications as read', 'error');
      throw error; // Re-throw to allow caller to handle
    }
    // Don't manage loading state in finally block
  };

  // Handle deleting read notifications
  const handleDeleteRead = async () => {
    if (!user) return;
    
    try {
      // Don't set deleting state here since it's managed by the caller
      const deletedCount = await deleteReadNotifications(user.id);
      
      if (deletedCount > 0) {
        // Remove deleted notifications from state
        setNotifications(prev => prev.filter(n => !n.read));
        showToast(`${deletedCount} read notification${deletedCount !== 1 ? 's' : ''} deleted`, 'success');
      } else {
        showToast('No read notifications to delete', 'success');
      }
      return deletedCount;
    } catch (error) {
      console.error('Error deleting read notifications:', error);
      showToast('Failed to delete read notifications', 'error');
      throw error; // Re-throw to allow caller to handle
    }
    // Don't manage deleting state in finally block
  };

  // Handle deleting a single notification
  const handleDeleteNotification = async (event: React.MouseEvent, notificationId: string) => {
    if (!user) return;
    
    // Find the notification to verify ownership
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || notification.userId !== user.id) {
      console.error('Attempting to delete notification that does not belong to current user');
      return;
    }
    
    // Stop event propagation to prevent triggering parent click events
    event.stopPropagation();
    
    try {
      // Set the deleting state for this specific notification
      setDeletingNotificationId(notificationId);
      
      await deleteNotification(notificationId);
      
      // Remove the deleted notification from state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // If the notification was unread, decrement unread count
      if (!notification.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      
      showToast('Notification deleted', 'success');
    } catch (error) {
      console.error('Error deleting notification:', error);
      showToast('Failed to delete notification', 'error');
    } finally {
      // Clear the deleting state
      setDeletingNotificationId(null);
    }
  };
  
  // Format the timestamp
  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    try {
      // Handle different timestamp formats
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        // Firestore timestamp
        return formatDistanceToNow(timestamp.toDate(), { addSuffix: true });
      } else if (timestamp instanceof Date) {
        // JavaScript Date object
        return formatDistanceToNow(timestamp, { addSuffix: true });
      } else if (typeof timestamp === 'string') {
        // ISO string or other string format
        return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
      } else if (typeof timestamp === 'number') {
        // Unix timestamp (milliseconds)
        return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
      } else if (timestamp._seconds) {
        // Firestore timestamp object in JSON format
        return formatDistanceToNow(new Date(timestamp._seconds * 1000), { addSuffix: true });
      }
      
      // Default fallback
      return formatDistanceToNow(new Date(), { addSuffix: true });
    } catch (error) {
      console.error('Error formatting timestamp:', error, timestamp);
      console.log('Timestamp:', timestamp);
      return 'some time ago';
    }
  };
  
  // Get icon class based on notification type
  const getIconClass = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-500';
      case 'info':
        return 'bg-blue-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  // If no user is logged in, don't show the notification icon
  if (!user) {
    return null;
  }
  
  return (
    <div className="relative" ref={notificationRef}>
      <button
        onClick={() => {
          setShowNotifications(!showNotifications);
        }}
        className="relative p-2 rounded-full transition-colors hover:bg-gray-100"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        
        {/* Notification badge */}
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      
      {/* Notification dropdown */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200 z-[9999] w-[350px] max-w-[90vw]"
          >
            <div className="flex justify-between items-center p-3 border-b border-gray-200 w-full">
              <h3 className="font-semibold text-gray-700">Notifications</h3>
              <div className="flex space-x-2 flex-shrink-0">
                {unreadCount > 0 && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        // Set loading state explicitly for this operation
                        setIsLoading(true);
                        await handleMarkAllAsRead();
                        // Refresh list after marking all as read without changing loading state
                        await fetchNotifications(true, true);
                      } catch (error) {
                        console.error('Error marking all as read:', error);
                      } finally {
                        // Clear loading state when everything is done
                        setIsLoading(false);
                      }
                    }}
                    className="text-xs text-primary-600 hover:text-primary-800 hover:bg-gray-100 px-2 py-1 rounded transition-colors z-10 relative disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                 
                  >
                   Mark all as read
                  </button>
                )}
                
                {readCount > 0 && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        // Set deleting state explicitly for this operation
                        setIsDeleting(true);
                        await handleDeleteRead();
                        // Refresh list after deleting read notifications
                        await fetchNotifications(true, true);
                      } catch (error) {
                        console.error('Error deleting read notifications:', error);
                      } finally {
                        // Clear deleting state when everything is done
                        setIsDeleting(false);
                      }
                    }}
                    className="text-xs text-red-600 hover:text-red-800 hover:bg-gray-100 px-2 py-1 rounded flex items-center z-10 relative disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    
                  >
                    {isDeleting ? (
                      <>
                        <span className="mr-1">Deleting...</span>
                        <span className="animate-spin h-3 w-3 border-2 border-red-500 rounded-full border-t-transparent"></span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3 h-3 mr-1" />
                        <span>Delete read</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {/* Error message */}
              {error && (
                <div className="p-3 bg-red-50 border-b border-red-100 text-sm text-red-600">
                  <p className="flex items-center">
                    <span className="mr-1">⚠️</span> {error}
                  </p>
                  <button 
                    onClick={() => fetchNotifications(true)}
                    className="mt-1 text-xs text-red-700 underline"
                  >
                    Try again
                  </button>
                </div>
              )}
              
              {notifications.length === 0 && isLoading ? (
                <div className="p-4 text-center text-gray-500">
                  <div className="animate-spin mx-auto h-6 w-6 border-2 border-blue-500 rounded-full border-t-transparent mb-2"></div>
                  <p>Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <p>No notifications</p>
                  <button 
                    onClick={() => fetchNotifications(true)} 
                    className="mt-2 text-xs text-blue-500 hover:text-blue-700"
                  >
                    Refresh
                  </button>
                </div>
              ) : (
                <>
                  <ul>
                    {notifications.map((notification) => {
                      // Check if this is a mention notification
                      const isMentionNotification = notification.iconType === 'comment-mention';
                      
                      return (
                        <li
                          key={notification.id}
                          className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors relative group overflow-hidden
                            ${!notification.read ? 'bg-blue-50' : ''}
                            ${isMentionNotification && !notification.read ? 'bg-blue-100 shadow-sm' : ''}`
                          }
                        >
                          <div 
                            className="flex-1 w-full overflow-hidden"
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <NotificationContent 
                              notification={notification} 
                              formatTime={formatTime} 
                              getIconClass={getIconClass} 
                            />
                          </div>
                          
                          {/* Delete button - show on hover */}
                          <button 
                            onClick={async (e) => {
                              await handleDeleteNotification(e, notification.id);
                              // Refresh notifications after deleting
                              await fetchNotifications();
                            }}
                            className="absolute top-2 right-2 p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Delete notification"
                            disabled={deletingNotificationId === notification.id}
                          >
                            {deletingNotificationId === notification.id ? (
                              <span className="w-4 h-4 block animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}; 