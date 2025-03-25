import React, { useEffect } from 'react';
import { User } from '../types';

interface MentionSuggestionsProps {
  users: User[];
  isOpen: boolean;
  highlightedIndex: number;
  onSelectUser: (user: User) => void;
  inputPosition?: { top: number; left: number };
}

const MentionSuggestions: React.FC<MentionSuggestionsProps> = ({
  users,
  isOpen,
  highlightedIndex,
  onSelectUser,
  inputPosition
}) => {
  // Log when component visibility changes
  useEffect(() => {
    if (isOpen) {
      console.log('MentionSuggestions opened with', users.length, 'users');
    }
  }, [isOpen, users.length]);

  // Early return if dropdown shouldn't be visible
  if (!isOpen || users.length === 0) {
    return null;
  }

  // Log for debugging
  console.log('Rendering mention suggestions', { 
    userCount: users.length, 
    position: inputPosition 
  });

  // Make sure we actually have a position
  if (!inputPosition) {
    console.warn('No position provided for mention suggestions');
  }

  // Ensure we stay within viewport bounds
  const positionStyles = inputPosition ? {
    top: `${Math.min(inputPosition.top, window.innerHeight - 200)}px`,
    left: `${Math.min(inputPosition.left, window.innerWidth - 270)}px`
  } : { top: '100px', left: '100px' };

  return (
    <div 
      className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 max-h-48 overflow-y-auto w-64"
      style={positionStyles}
    >
      <div className="py-1">
        <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-100">
          {users.length} {users.length === 1 ? 'user' : 'users'} found
        </div>
        <ul>
          {users.map((user, index) => (
            <li 
              key={user.id}
              className={`px-3 py-2 flex items-center cursor-pointer ${
                index === highlightedIndex ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50'
              }`}
              onClick={() => onSelectUser(user)}
            >
              {user.profile?.photoURL ? (
                <img 
                  src={user.profile.photoURL} 
                  alt={user.displayName}
                  className="w-6 h-6 rounded-full mr-2 object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center mr-2">
                  <span className="text-xs font-medium text-gray-600">
                    {user.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.displayName}</span>
                {user.profile?.title && (
                  <span className="text-xs text-gray-500">{user.profile.title}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default MentionSuggestions;