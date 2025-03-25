import React, { useEffect } from 'react';
import { Folder, ExternalLink, File, User, MessageSquare, AtSign } from 'lucide-react';
import { Notification } from '../services/notificationService';

interface NotificationContentProps {
  notification: Notification;
  formatTime: (timestamp: any) => string;
  getIconClass: (type: string) => string;
}

const NotificationContent: React.FC<NotificationContentProps> = ({ 
  notification, 
  formatTime, 
  getIconClass 
}) => {
  // Determine notification type/icon
  const getNotificationIcon = () => {
    const iconType = notification.iconType || notification.type || 'info';
    
    switch (iconType) {
      case 'file-upload':
        return <File className="w-4 h-4 text-blue-500" />;
      case 'folder-update':
        return <Folder className="w-4 h-4 text-yellow-500" />;
      case 'comment':
        return <MessageSquare className="w-4 h-4 text-green-500" />;
      case 'comment-mention':
        return <AtSign className="w-4 h-4 text-blue-500" />;
      case 'invite':
        return <User className="w-4 h-4 text-purple-500" />;
      case 'share':
        return <ExternalLink className="w-4 h-4 text-indigo-500" />;
      default:
        return <MessageSquare className="w-4 h-4 text-gray-500" />;
    }
  };
  
  // Check if this is a mention notification
  const isMentionNotification = (notification.iconType === 'comment-mention');
  
  // Safely access notification fields
  const message = notification.message || 'New notification';
  const type = notification.type || 'info';
  const createdAt = notification.createdAt || new Date();
  
  // Log notification details for debugging when it mounts
  useEffect(() => {
    if (isMentionNotification) {
      console.log(`Rendering mention notification with ID: ${notification.id} for user: ${notification.userId}`);
      console.log('Notification data:', {
        id: notification.id,
        message: notification.message,
        link: notification.link,
        metadata: notification.metadata,
        read: notification.read
      });
    }
  }, [notification, isMentionNotification]);
  
  return (
    <div className="flex items-start">
      {/* Color-coded indicator based on notification type with animation for mentions */}
      <div className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${getIconClass(type)} ${isMentionNotification ? 'animate-pulse' : ''}`} />
      
      <div className="ml-2 flex-1">
        {/* Notification message with special formatting for mentions */}
        <p className={`text-sm ${!notification.read ? 'font-medium' : 'text-gray-700'} ${isMentionNotification ? 'flex items-center' : ''}`}>
          {isMentionNotification && (
            <AtSign className="w-3 h-3 mr-1 text-blue-500 inline-flex flex-shrink-0" />
          )}
          <span className={isMentionNotification ? 'text-blue-700' : ''}>
            {message}
          </span>
        </p>
        
        {/* Timestamp */}
        <p className="text-xs text-gray-500 mt-1">
          {formatTime(createdAt)}
        </p>
        
        {/* Notification metadata */}
        {notification.metadata && (
          <div className="mt-1 text-xs text-gray-500">
            {notification.metadata.fileName && (
              <div className="flex items-center">
                <File className="w-3 h-3 mr-1" />
                <p className="truncate">{notification.metadata.fileName}</p>
              </div>
            )}
            {notification.metadata.folderName && (
              <div className="flex items-center mt-1">
                <Folder className="w-3 h-3 mr-1" />
                <span>{notification.metadata.folderName}</span>
              </div>
            )}
            {notification.metadata.guestName && (
              <div className="flex items-center mt-1">
                <User className="w-3 h-3 mr-1" />
                <p>{notification.metadata.guestName}</p>
              </div>
            )}
            {notification.metadata.commentText && (
              <div className="flex items-start mt-1">
                <MessageSquare className="w-3 h-3 mr-1 mt-0.5" />
                <div className="flex-1">
                  <p className="line-clamp-2 text-gray-600">
                    {isMentionNotification ? (
                      <span className="bg-blue-50 border-l-2 border-blue-500 pl-1 italic block">
                        "{notification.metadata.commentText}"
                      </span>
                    ) : (
                      <span>"{notification.metadata.commentText}"</span>
                    )}
                  </p>
                </div>
              </div>
            )}
            
            {/* For mention notifications, show a "Go to comment" link */}
            {isMentionNotification && notification.link && (
              <div className="mt-2 flex justify-end">
                <span className="text-blue-600 text-xs flex items-center">
                  <span className="mr-1">Go to comment</span>
                  <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationContent; 