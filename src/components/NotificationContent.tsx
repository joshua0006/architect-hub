import React, { useEffect } from 'react';
import { Folder, ExternalLink, File, User } from 'lucide-react';
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
  // Check if the notification link is a file-specific link
  const isFileLink = notification.link && notification.link.includes('/files/');
  
  // Log notification link format when the component mounts
  useEffect(() => {
    console.log(`Notification ID: ${notification.id} has link: ${notification.link}`);
    
    if (notification.metadata?.folderId) {
      console.log(`Folder ID from metadata: ${notification.metadata.folderId}`);
    }
  }, [notification]);
  
  return (
    <div className="flex items-start">
      <div className={`flex-shrink-0 w-2 h-2 mt-2 rounded-full ${getIconClass(notification.type)}`} />
      <div className="ml-2 flex-1">
        <p className={`text-sm ${!notification.read ? 'font-medium' : 'text-gray-700'}`}>
          {notification.message}
        </p>
        {notification.metadata && (
          <div className="mt-1 text-xs text-gray-500">
            {notification.metadata.fileName && (
              <div className="flex items-center">
                <File className="w-3 h-3 mr-1" />
                <p className="truncate">{notification.metadata.fileName}</p>
              </div>
            )}
            {notification.metadata.guestName && (
              <div className="flex items-center mt-1">
                <User className="w-3 h-3 mr-1" />
                <p>{notification.metadata.guestName}</p>
              </div>
            )}
            {notification.metadata.folderName && (
              <div className="flex items-center mt-1">
                <Folder className="w-3 h-3 mr-1" />
                <span>{notification.metadata.folderName}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-500 mt-1">
            {formatTime(notification.createdAt)}
          </p>
          {notification.link && (
            <div className="text-xs text-primary-600 flex items-center">
              <span className="mr-1">
                {isFileLink ? 'View file' : 'Go to folder'}
              </span>
              <ExternalLink className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationContent; 