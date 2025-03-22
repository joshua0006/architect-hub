import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  subscribeToNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  deleteReadNotifications,
  deleteNotification,
  Notification 
} from '../services/notificationService';
import { formatDistanceToNow } from 'date-fns';
import NotificationContent from './NotificationContent';
import { useToast } from '../contexts/ToastContext';

// Add a custom event for document refreshing
export const NOTIFICATION_DOCUMENT_UPDATE_EVENT = 'notification-document-update';

export const NotificationIcon: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  // Count of unread notifications
  const unreadCount = notifications.filter(n => !n.read).length;
  // Count of read notifications
  const readCount = notifications.filter(n => n.read).length;
  
  useEffect(() => {
    // Subscribe to notifications collection
    const unsubscribe = subscribeToNotifications((newNotifications) => {
      setNotifications(newNotifications);
      console.log('Received notifications:', newNotifications);
    });
    
    return () => unsubscribe();
  }, []);
  
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
    try {
      console.log('Notification clicked:', notification);
      console.log('Navigating to link:', notification.link);
      
      // Mark as read first to ensure this happens regardless of navigation
      if (!notification.read) {
        await markNotificationAsRead(notification.id);
        setNotifications(prev => 
          prev.map(n => 
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
      }
      
      // Close notification panel - do this early in the process
      setShowNotifications(false);
      
      // Navigate to link if provided
      if (notification.link) {
        // Extract the folder ID from the link or from metadata
        let folderId = notification.metadata?.folderId;
        if (!folderId && notification.link.includes('/folders/')) {
          const folderMatch = notification.link.match(/\/folders\/([^\/]+)/);
          if (folderMatch && folderMatch[1]) {
            folderId = folderMatch[1];
          }
        }
        
        // Extract file ID if present in the link
        let fileId;
        if (notification.link.includes('/files/')) {
          const fileMatch = notification.link.match(/\/files\/([^\/]+)/);
          if (fileMatch && fileMatch[1]) {
            fileId = fileMatch[1];
          }
        }
        
        // Extract project ID from metadata if available
        // We need to cast metadata to any for custom fields not in the metadata type
        const projectId = (notification.metadata as any)?.projectId;
        
        // Create comprehensive navigation state
        const navigationState: {
          needsProjectSwitch: boolean;
          targetFolderId?: string;
          targetFileId?: string;
          targetProjectId?: string;
          fromNotification: boolean;
          timestamp: number;
          targetLink?: string;
        } = {
          needsProjectSwitch: true,
          targetFolderId: folderId,
          targetFileId: fileId,
          targetProjectId: projectId,
          fromNotification: true,
          timestamp: Date.now()
        };
        
        // Build the correct target link with project ID
        let targetLink = '/documents';
        
        if (projectId) {
          targetLink = `/documents/projects/${projectId}`;
          
          if (folderId) {
            targetLink += `/folders/${folderId}`;
            
            if (fileId) {
              targetLink += `/files/${fileId}`;
            }
          } else if (fileId) {
            targetLink += `/files/${fileId}`;
          }
        } else {
          // Use original link as fallback if no project ID
          targetLink = notification.link;
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
            projectId,
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
        if (!window.location.pathname.startsWith('/documents')) {
          console.log('Navigating to documents section first');
          navigate('/documents', { state: navigationState, replace: true });
        } else {
          // We're already in documents section, update location state and reload
          console.log('Already in documents, updating state with project path');
          navigate(targetLink, { state: navigationState, replace: true });
        }
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
    }
  };
  
  // Handle marking all notifications as read
  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      showToast('All notifications marked as read', 'success');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      showToast('Failed to mark notifications as read', 'error');
    }
  };

  // Handle deleting read notifications
  const handleDeleteRead = async () => {
    try {
      setIsDeleting(true);
      const deletedCount = await deleteReadNotifications();
      
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
    // Stop event propagation to prevent triggering parent click events
    event.stopPropagation();
    
    try {
      await deleteNotification(notificationId);
      // Remove the deleted notification from state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      showToast('Notification deleted', 'success');
    } catch (error) {
      console.error('Error deleting notification:', error);
      showToast('Failed to delete notification', 'error');
    }
  };
  
  // Format the timestamp
  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatDistanceToNow(date, { addSuffix: true });
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
  
  return (
    <div className="relative" ref={notificationRef}>
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative p-2 rounded-full transition-colors hover:bg-primary-50"
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
            className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200 z-50"
          >
            <div className="flex justify-between items-center p-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Notifications</h3>
              <div className="flex space-x-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs text-primary-600 hover:text-primary-800"
                    disabled={isDeleting}
                  >
                    Mark all as read
                  </button>
                )}
                
                {readCount > 0 && (
                  <button
                    onClick={handleDeleteRead}
                    className="text-xs text-red-600 hover:text-red-800 flex items-center"
                    disabled={isDeleting}
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
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No notifications
                </div>
              ) : (
                <ul>
                  {notifications.map((notification) => (
                    <li
                      key={notification.id}
                      className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                        !notification.read ? 'bg-blue-50' : ''
                      } relative group`}
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
                        onClick={(e) => handleDeleteNotification(e, notification.id)}
                        className="absolute top-2 right-2 p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label="Delete notification"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}; 