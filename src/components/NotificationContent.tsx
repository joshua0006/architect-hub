import React from 'react';
import { Folder, ExternalLink, File, User, MessageSquare, AtSign, CheckSquare } from 'lucide-react';
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
        return <File className="w-4 h-4 text-green-500" />;
      case 'folder-update':
        return <Folder className="w-4 h-4 text-yellow-500" />;
      case 'comment':
        return <MessageSquare className="w-4 h-4 text-green-500" />;
      case 'comment-mention':
        return <AtSign className="w-4 h-4 text-blue-500" />;
      case 'task-assignment':
        return <CheckSquare className="w-4 h-4 text-purple-500" />;
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
  
  // Check if this is a task notification
  const isTaskNotification = (notification.iconType === 'task-assignment');
  
  // Check if this is a file upload notification
  const isFileUploadNotification = (notification.iconType === 'file-upload');
  
  // Safely access notification fields
  const message = notification.message || 'New notification';
  const type = notification.type || 'info';
  const createdAt = notification.createdAt || new Date();
  
  return (
    <div className="flex items-start">
      {/* Color-coded indicator based on notification type with animation for mentions and file uploads */}
      <div className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${getIconClass(type)} 
        ${isMentionNotification ? 'animate-pulse' : ''} 
        ${isFileUploadNotification && !notification.read ? 'animate-pulse' : ''}`} 
      />
      
      <div className="ml-2 flex-1 min-w-0">
        {/* Notification message with special formatting for different notification types */}
        <p className={`overflow-hidden text-sm ${!notification.read ? 'font-medium' : 'text-gray-700'} 
          ${isMentionNotification || isFileUploadNotification ? 'flex items-center' : ''}`}>
          {isMentionNotification && (
            <AtSign className="w-3 h-3 mr-1 text-blue-500 inline-flex flex-shrink-0" />
          )}
          {isTaskNotification && (
            <CheckSquare className="w-3 h-3 mr-1 text-purple-500 inline-flex flex-shrink-0" />
          )}
          {isFileUploadNotification && (
            <File className="w-3 h-3 mr-1 text-green-500 inline-flex flex-shrink-0" />
          )}
          <span className={`${isMentionNotification ? 'text-blue-700' : 
                           isFileUploadNotification && !notification.read ? 'text-green-700' : ''} truncate max-w-full block`}
                 title={message}>
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
                <File className="w-3 h-3 mr-1 flex-shrink-0" />
                <p className="truncate max-w-[170px] overflow-hidden" title={notification.metadata.fileName}>{notification.metadata.fileName}</p>
              </div>
            )}
            {notification.metadata.folderName && (
              <div className="flex items-center mt-1">
                <Folder className="w-3 h-3 mr-1 flex-shrink-0" />
                <span className="truncate max-w-[170px] overflow-hidden" title={notification.metadata.folderName}>{notification.metadata.folderName}</span>
              </div>
            )}
            {notification.metadata.guestName && !isFileUploadNotification && (
              <div className="flex items-center mt-1">
                <User className="w-3 h-3 mr-1 flex-shrink-0" />
                <p className="truncate max-w-[170px] overflow-hidden" title={notification.metadata.guestName}>{notification.metadata.guestName}</p>
              </div>
            )}
            {/* Special formatting for file upload guest name */}
            {isFileUploadNotification && notification.metadata.guestName && (
              <div className="flex items-center mt-1 text-green-600 w-full overflow-hidden">
                <User className="w-3 h-3 mr-1 flex-shrink-0" />
                <p className="font-medium truncate max-w-[100px] overflow-hidden" title={notification.metadata.guestName}>{notification.metadata.guestName}</p>
                <span className="ml-1 bg-green-100 text-green-800 text-xs px-1.5 py-0.5 rounded flex-shrink-0">Guest</span>
              </div>
            )}
            {notification.metadata.commentText && (
              <div className="flex items-start mt-1">
                <MessageSquare className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
                <div className="flex-1 overflow-hidden">
                  <p className="line-clamp-2 text-gray-600 break-words">
                    {isMentionNotification ? (
                      <span className="bg-blue-50 border-l-2 border-blue-500 pl-1 italic block overflow-hidden text-ellipsis">
                        "{notification.metadata.commentText}"
                      </span>
                    ) : (
                      <span className="overflow-hidden text-ellipsis">"{notification.metadata.commentText}"</span>
                    )}
                  </p>
                </div>
              </div>
            )}
            
            {/* For file upload notifications, show upload date if available */}
            {isFileUploadNotification && notification.metadata.uploadDate && (
              <div className="mt-1 flex items-center">
                <span className="text-xs text-gray-500">
                  Uploaded: {new Date(notification.metadata.uploadDate).toLocaleDateString()}
                </span>
              </div>
            )}
            
            {/* For task notifications, show due date if available */}
            {isTaskNotification && notification.metadata.dueDate && (
              <div className="mt-1 flex items-center">
                <CheckSquare className="w-3 h-3 mr-1" />
                <span>Due: {new Date(notification.metadata.dueDate).toLocaleDateString()}</span>
              </div>
            )}
            
            {/* For file upload notifications, show a "View file" link */}
            {isFileUploadNotification && notification.link && (
              <div className="mt-2 flex justify-end">
                <span className="text-green-600 text-xs flex items-center">
                  <span className="mr-1">View file</span>
                  <ExternalLink className="w-3 h-3" />
                </span>
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
            
            {/* For task notifications, show a "View task" link */}
            {isTaskNotification && notification.link && (
              <div className="mt-2 flex justify-end">
                <span className="text-purple-600 text-xs flex items-center">
                  <span className="mr-1">View task</span>
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