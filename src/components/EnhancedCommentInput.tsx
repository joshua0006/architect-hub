import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { User } from '../types';
import { userService } from '../services/userService';
import MentionSuggestions from './MentionSuggestions';

interface EnhancedCommentInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  projectId: string;
  placeholder?: string;
}

const EnhancedCommentInput: React.FC<EnhancedCommentInputProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  projectId,
  placeholder = 'Add a comment... @username to mention'
}) => {
  const [mentionState, setMentionState] = useState({
    isMentioning: false,
    mentionQuery: '',
    cursorPosition: 0,
    startPosition: 0
  });
  const [suggestedUsers, setSuggestedUsers] = useState<User[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [inputPosition, setInputPosition] = useState<{ top: number; left: number } | undefined>();
  const [hasLoadedUsers, setHasLoadedUsers] = useState(false);
  // Add state to track submit button clicks and prevent duplicates
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastSubmitTime = useRef<number>(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load project members when component mounts
  useEffect(() => {
    if (projectId) {
      loadProjectMembers();
    } else {
      // If no project ID, we'll fall back to all users
      loadAllUsers();
    }
  }, [projectId]);

  const loadProjectMembers = async () => {
    try {
      let members: User[] = [];
      
      if (projectId) {
        try {
          members = await userService.getUsersByProject(projectId);
        } catch (projectError) {
          // Fall back to all users
          members = await userService.getAllUsers();
        }
      } else {
        // If no project ID, just load all users
        members = await userService.getAllUsers();
      }
      
      // Pre-load members into state (we'll filter them when user types)
      setSuggestedUsers(members);
      setHasLoadedUsers(true);
    } catch (error) {
      // Set empty array to avoid undefined errors
      setSuggestedUsers([]);
    }
  };

  // Add a dedicated method to load all users
  const loadAllUsers = async () => {
    try {
      const members = await userService.getAllUsers();
      setSuggestedUsers(members);
      setHasLoadedUsers(true);
    } catch (error) {
      setSuggestedUsers([]);
    }
  };

  // Update suggestion list when query changes
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (mentionState.isMentioning) {
        try {
          // If we haven't loaded users yet, do it now
          if (!hasLoadedUsers) {
            await loadProjectMembers();
          }
          
          let users: User[] = [];
          
          // For short queries, use all loaded users or load them fresh
          if (suggestedUsers.length > 0) {
            users = suggestedUsers;
          } else {
            // Try to get users by project, fall back to all users if that fails
            try {
              if (projectId) {
                users = await userService.getUsersByProject(projectId);
              } else {
                users = await userService.getAllUsers();
              }
            } catch (error) {
              users = await userService.getAllUsers();
            }
          }
          
          // Filter locally based on the query
          const filteredMembers = mentionState.mentionQuery.length > 0
            ? users.filter(user => 
                user.displayName.toLowerCase().includes(mentionState.mentionQuery.toLowerCase()))
            : users;
          
          setSuggestedUsers(filteredMembers);
          setHighlightedIndex(0);
        } catch (error) {
          // Set empty array to avoid undefined errors
          setSuggestedUsers([]);
        }
      }
    };

    fetchSuggestions();
  }, [mentionState.mentionQuery, mentionState.isMentioning]);

  // Update caret position for suggestion dropdown
  useEffect(() => {
    if (mentionState.isMentioning && inputRef.current) {
      // Get input element position
      const inputRect = inputRef.current.getBoundingClientRect();
      
      // Calculate approximate position based on character position
      // This is a simplified approach that works better than complex caret measurement
      const approximateCharWidth = 8; // Average character width in pixels
      const textBeforeCursor = value.substring(0, mentionState.cursorPosition);
      const approximateOffset = Math.min(textBeforeCursor.length * approximateCharWidth, inputRect.width - 100);
      
      // Set the position for the suggestion dropdown
      setInputPosition({
        top: inputRect.bottom + window.scrollY,
        left: inputRect.left + approximateOffset + window.scrollX
      });
    }
  }, [mentionState.isMentioning, mentionState.cursorPosition, value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (mentionState.isMentioning) {
      // Handle arrow keys for suggestion navigation
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev => 
          (prev < suggestedUsers.length - 1) ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev => (prev > 0) ? prev - 1 : 0);
      } else if (e.key === 'Enter' && suggestedUsers.length > 0) {
        e.preventDefault();
        handleSelectUser(suggestedUsers[highlightedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        resetMentionState();
      }
    } else if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
      e.preventDefault();
      // Use our debounced submit handler
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    const cursorPosition = e.target.selectionStart || 0;
    
    // Check if we're in the middle of typing a mention
    if (mentionState.isMentioning) {
      // Extract the current mention query
      const textBeforeCursor = newValue.substring(0, cursorPosition);
      const mentionStart = textBeforeCursor.lastIndexOf('@');
      
      if (mentionStart >= 0) {
        const query = textBeforeCursor.substring(mentionStart + 1);
        
        // Check if we should stop mention mode
        const shouldStopMention = 
          query.includes(' ') || 
          mentionStart !== mentionState.startPosition ||
          cursorPosition <= mentionStart;
        
        if (shouldStopMention) {
          resetMentionState();
        } else {
          setMentionState({
            isMentioning: true,
            mentionQuery: query,
            cursorPosition,
            startPosition: mentionStart
          });
        }
      } else {
        // If @ is deleted, reset mention state
        resetMentionState();
      }
    } else {
      // Check if we need to start mention mode
      const textBeforeCursor = newValue.substring(0, cursorPosition);
      const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
      
      if (lastAtSymbol >= 0) {
        const textAfterAt = textBeforeCursor.substring(lastAtSymbol + 1);
        // Only start mention mode if @ is at the beginning of input or preceded by a space
        const isValidStart = lastAtSymbol === 0 || 
          textBeforeCursor.charAt(lastAtSymbol - 1) === ' ';
        
        if (isValidStart && !textAfterAt.includes(' ')) {
          console.log('Starting mention mode at position', lastAtSymbol);
          
          setMentionState({
            isMentioning: true,
            mentionQuery: textAfterAt,
            cursorPosition,
            startPosition: lastAtSymbol
          });
          
          // Force load users when @ is typed if we haven't loaded them already
          if (!hasLoadedUsers) {
            loadProjectMembers();
          }
        }
      }
    }
  };

  const resetMentionState = () => {
    setMentionState({
      isMentioning: false,
      mentionQuery: '',
      cursorPosition: 0,
      startPosition: 0
    });
  };

  const handleSelectUser = (user: User) => {
    // Insert the username at the current @ position
    const beforeMention = value.substring(0, mentionState.startPosition);
    const afterMention = value.substring(mentionState.cursorPosition);
    const newValue = `${beforeMention}@${user.displayName} ${afterMention}`;
    
    onChange(newValue);
    resetMentionState();
    
    // Focus the input and place cursor after the inserted mention
    if (inputRef.current) {
      const newCursorPosition = mentionState.startPosition + user.displayName.length + 2; // +2 for @ and space
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        }
      }, 0);
    }
  };

  // Handle the submit action with safeguards against duplicate submissions
  const handleSubmit = () => {
    // Prevent submission if disabled or already submitting
    if (disabled || isSubmitting) return;
    
    // Prevent rapid re-submissions (within 2 seconds)
    const now = Date.now();
    if (now - lastSubmitTime.current < 2000) {
      return;
    }
    
    // Set submitting state to prevent multiple submissions
    setIsSubmitting(true);
    lastSubmitTime.current = now;
    
    // Call the provided onSubmit function
    onSubmit();
    
    // Reset submitting state after a delay
    setTimeout(() => {
      setIsSubmitting(false);
    }, 1000);
  };

  return (
    <div ref={containerRef} className="relative flex w-full">
      <div className="relative flex items-center w-full">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={disabled || isSubmitting}
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled || isSubmitting}
          className={`absolute right-2 p-1.5 rounded-full ${
            value.trim() && !disabled && !isSubmitting
              ? "bg-blue-500 text-white hover:bg-blue-600"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
          type="button"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      
      {mentionState.isMentioning && inputPosition && (
        <MentionSuggestions
          users={suggestedUsers}
          highlightedIndex={highlightedIndex}
          inputPosition={inputPosition}
          onSelectUser={handleSelectUser}
          isOpen={mentionState.isMentioning && suggestedUsers.length > 0}
        />
      )}
    </div>
  );
};

export default EnhancedCommentInput; 