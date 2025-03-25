import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Notification 
} from '../services/notificationService';
import { formatDistanceToNow } from 'date-fns';
import NotificationContent from './NotificationContent';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

// Add a custom event for document refreshing
export const NOTIFICATION_DOCUMENT_UPDATE_EVENT = 'notification-document-update';

export const NotificationIcon: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const lastNotificationUpdate = useRef<number>(0);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  
  // Count of read notifications
  const readCount = notifications.filter(n => n.read).length;
  
  // Function to deduplicate notifications by ID
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
  
  // Fetch notifications manually on first load and when bell is clicked
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    
    try {
      // Avoid rapid repeated fetches
      const now = Date.now();
      if (now - lastNotificationUpdate.current < 2000) {
        console.log('[Notification Bell] Skipping fetch, too soon after last update');
        return;
      }
      
      setIsLoading(true);
      setError(null);
      console.log(`[Notification Bell] Manually fetching notifications for user ${user.id}`);
      
      // Force direct fetch from Firestore instead of relying on cache
      const recentNotifications = await getRecentNotifications(user.id, 20);
      console.log(`[Notification Bell] Retrieved ${recentNotifications.length} notifications manually`);
      
      if (recentNotifications.length > 0) {
        // Update with deduplication
        setNotifications(prev => deduplicateNotifications(recentNotifications));
        const newUnreadCount = recentNotifications.filter(n => !n.read).length;
        setUnreadCount(newUnreadCount);
        console.log(`[Notification Bell] Updated unread count to ${newUnreadCount}`);
      } else {
        console.log('[Notification Bell] No notifications found for this user');
      }
      
      lastNotificationUpdate.current = now;
    } catch (error) {
      console.error('[Notification Bell] Error fetching notifications:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(`Failed to load notifications: ${errorMessage}`);
      showToast('Could not load notifications', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [user, showToast, deduplicateNotifications]);
  
  // Only one useEffect for notification setup
  useEffect(() => {
    if (!user) return;
    
    console.log(`[Notification Bell] Setting up notification system for user: ${user.id}`);
    
    // Set up a unified refresh/subscription mechanism
    let unsubscribe: () => void = () => {};
    
    const setupNotifications = async () => {
      try {
        // Initial fetch
        await fetchNotifications();
        
        // Set up real-time updates
        unsubscribe = subscribeToNotifications(user.id, (newNotifications) => {
          if (newNotifications.length === 0) return;
          
          console.log(`[Notification Bell] Received ${newNotifications.length} notifications via subscription`);
          
          // Update state with deduplication
          setNotifications(prev => deduplicateNotifications(newNotifications));
          
          // Update unread count
          const newUnreadCount = newNotifications.filter(n => !n.read).length;
          if (newUnreadCount !== unreadCount) {
            setUnreadCount(newUnreadCount);
            
            // Only show toast for new notifications if there are more than before
            if (newUnreadCount > unreadCount) {
              // Check for mention notifications specifically
              const mentionNotifications = newNotifications.filter(
                n => n.iconType === 'comment-mention' && !n.read
              );
              
              if (mentionNotifications.length > 0) {
                showToast(`You were mentioned in a comment`, 'success');
              } else {
                showToast('You have new notifications', 'success');
              }
            }
          }
          
          lastNotificationUpdate.current = Date.now();
        });
      } catch (error) {
        console.error('[Notification Bell] Error setting up notifications:', error);
      }
    };
    
    setupNotifications();
    
    // Single interval for periodic refresh
    const intervalId = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastNotificationUpdate.current;
      if (timeSinceLastUpdate > 60000) { // Only refresh if no update in the last minute
        console.log('[Notification Bell] Performing periodic refresh');
        fetchNotifications();
      }
    }, 60000);
    
    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [user, fetchNotifications, unreadCount, showToast, deduplicateNotifications]);
  
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
    
    try {
      console.log('Notification clicked:', notification);
      
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
        console.log('Navigating to link:', notification.link);
        
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
          console.log('Processing file upload notification');
          if (notification.metadata?.fileId) {
            fileId = notification.metadata.fileId;
          }
        }
        
        // Determine if we need to handle project switching
        const currentPath = window.location.pathname;
        const isInDocuments = currentPath.startsWith('/documents');
        const isInDifferentProject = true; // Always force project navigation for consistency
        
        console.log('Current location:', {
          currentPath,
          isInDocuments
        });
        
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
        
        // Update navigation state with the correct target link
        navigationState.targetLink = targetLink;
        
        console.log('Navigation state with updated link:', navigationState);
        
        // Dispatch a custom event to trigger document refresh
        if (fileId || folderId) {
          console.log('Dispatching document update event');
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
        if (!isInDocuments) {
          console.log('Navigating to documents section first with direct path');
          navigate(targetLink, { state: navigationState, replace: true });
        } else {
          // If we need project switching, always navigate directly to the target
          console.log('Already in documents, navigating directly to target:', targetLink);
          navigate(targetLink, { state: navigationState, replace: true });
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
      await markAllNotificationsAsRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      showToast('All notifications marked as read', 'success');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      showToast('Failed to mark notifications as read', 'error');
    }
  };

  // Handle deleting read notifications
  const handleDeleteRead = async () => {
    if (!user) return;
    
    try {
      setIsDeleting(true);
      const deletedCount = await deleteReadNotifications(user.id);
      
      if (deletedCount > 0) {
        // Remove deleted notifications from state
        setNotifications(prev => prev.filter(n => !n.read));
        showToast(`${deletedCount} read notification${deletedCount !== 1 ? 's' : ''} deleted`, 'success');
      } else {
        showToast('No read notifications to delete', 'success');
      }
    } catch (error) {
      console.error('Error deleting read notifications:', error);
      showToast('Failed to delete read notifications', 'error');
    } finally {
      setIsDeleting(false);
    }
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
          if (!showNotifications) {
            fetchNotifications();
          }
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
            className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200 z-[9999]"
          >
            <div className="flex justify-between items-center p-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Notifications</h3>
              <div className="flex space-x-2">
                {unreadCount > 0 && (
                  <button
                    onClick={async () => {
                      await handleMarkAllAsRead();
                      // Refresh list after marking all as read
                      fetchNotifications();
                    }}
                    className="text-xs text-primary-600 hover:text-primary-800"
                    disabled={isDeleting || isLoading}
                  >
                    Mark all as read
                  </button>
                )}
                
                {readCount > 0 && (
                  <button
                    onClick={async () => {
                      await handleDeleteRead();
                      // Refresh list after deleting read notifications
                      fetchNotifications();
                    }}
                    className="text-xs text-red-600 hover:text-red-800 flex items-center"
                    disabled={isDeleting || isLoading}
                  >
                    {isDeleting ? (
                      <>
                        <span className="mr-1">Deleting...</span>
                        <span className="animate-spin h-3 w-3 border-2 border-red-500 rounded-full border-t-transparent"></span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete read
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
                    onClick={fetchNotifications}
                    className="mt-1 text-xs text-red-700 underline"
                  >
                    Try again
                  </button>
                </div>
              )}
              
              {isLoading ? (
                <div className="p-4 text-center text-gray-500">
                  <div className="animate-spin mx-auto h-6 w-6 border-2 border-blue-500 rounded-full border-t-transparent mb-2"></div>
                  <p>Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <p>No notifications</p>
                  <button 
                    onClick={fetchNotifications} 
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
                          className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors relative group 
                            ${!notification.read ? 'bg-blue-50' : ''}
                            ${isMentionNotification && !notification.read ? 'bg-blue-100 shadow-sm' : ''}`
                          }
                        >
                          <div 
                            className="flex-1"
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
                          >
                            <Trash2 className="w-4 h-4" />
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