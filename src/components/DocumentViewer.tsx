import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

import {
  ChevronDown,
  ChevronUp,
  Download,
  MessageSquare,
  History,
  Upload,
  FileUp,
  Send,
  Pencil,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  ChevronRight,
  FolderOpen,
  Home,
  Edit2,
  Trash,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";
import {
  doc,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  getDocs,
  getDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { storage } from "../lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { PDFViewer } from "./PDFViewer";
import { Toolbar } from "./Toolbar";
import { Button } from "./ui/button";
import { MediaViewer, isImage, isVideo, isAudio, isPDF, getMediaTypeInfo } from "../utils/mediaUtils";
import { useOrganization } from '../contexts/OrganizationContext';
import { 
  extractMentions, 
  resolveUserMentions, 
  extractUserIds,
  UserMention
} from '../utils/textUtils';
import { userService } from '../services/userService';
import { 
  createCommentMentionNotifications, 
  createCommentNotifications,
  resetNotificationSystem,
  notifyMentionedUsers
} from '../services/notificationService';
import CommentText from './CommentText';
import EnhancedCommentInput from './EnhancedCommentInput';
import { DocumentVersion, DocumentComment } from "../types";
import { NOTIFICATION_DOCUMENT_UPDATE_EVENT } from './NotificationIcon';

interface Document {
  id: string;
  name: string;
  type: string;
  version: number;
  url: string;
  dateModified: string;
  folderId?: string;
  metadata?: {
    contentType?: string;
    size?: number;
    originalFilename?: string;
  };
}

interface Folder {
  id: string;
  name: string;
}

interface Comment extends DocumentComment {
  userPhotoURL?: string | null;
}

interface DocumentViewerProps {
  document: Document;
  onClose: () => void;
  onRefresh?: () => void;
  folders: Folder[];
  onNavigateToFolder: (folder?: Folder) => void;
  isShared?: boolean;
  viewerHeight: number;
  setViewerHeight: (height: number) => void;
}

interface CommentMarkerProps {
  comment: DocumentComment;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = ["application/pdf"];

const CommentMarker = ({
  comment,
  isOwner,
  onEdit,
  onDelete,
}: CommentMarkerProps) => (
  <div
    className="absolute group"
    style={{
      left: `${comment.position?.x || 0}%`,
      top: `${comment.position?.y || 0}%`,
    }}
  >
    <div className="relative">
      <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center cursor-pointer group-hover:bg-blue-600 transition-colors">
        <MessageSquare className="w-4 h-4 text-white" />
      </div>

      <div className="absolute left-8 top-0 hidden group-hover:block min-w-[200px] bg-white rounded-lg shadow-lg p-3 border border-gray-200 z-10">
        <div className="flex justify-between items-start mb-2">
          <div>
            <span className="text-sm font-medium">{comment.userName}</span>
            <span className="text-xs text-gray-500 ml-2">
              {new Date(comment.createdAt).toLocaleString()}
            </span>
          </div>
          {isOwner && (
            <div className="flex space-x-1">
              <button
                onClick={onEdit}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-600">{comment.text}</p>
      </div>
    </div>
  </div>
);

// Add a utility function to format dates
const formatDate = (date: string | Timestamp | Date) => {
  if (date instanceof Timestamp) {
    return date.toDate().toLocaleString();
  }
  if (typeof date === "string") {
    return new Date(date).toLocaleString();
  }
  if (date instanceof Date) {
    return date.toLocaleString();
  }
  return "Date unavailable";
};

const CommentSection = memo(
  ({
    user,
    newComment,
    handleCommentChange,
    handleAddComment,
    comments,
    loadingComments,
    submittingComment,
    editingCommentId,
    editText,
    setEditText,
    handleUpdateComment,
    handleDeleteComment,
    setEditingCommentId,
    document,
    highlightedCommentId,
    commentRefs
  }: {
    user: any;
    newComment: string;
    handleCommentChange: (value: string) => void;
    handleAddComment: () => void;
    comments: Comment[];
    loadingComments: boolean;
    submittingComment: boolean;
    editingCommentId: string | null;
    editText: string;
    setEditText: (text: string) => void;
    handleUpdateComment: (id: string) => void;
    handleDeleteComment: (id: string) => void;
    setEditingCommentId: (id: string | null) => void;
    document: Document;
    highlightedCommentId: string | null;
    commentRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  }) => (
    <div className="mt-8">
      <h3 className="text-sm font-medium text-gray-900 mb-4 flex items-center">
        <MessageSquare className="w-4 h-4 mr-1" /> Comments
      </h3>

      {/* Add comment form */}
      <div className="mb-6 w-full">
        <EnhancedCommentInput
          value={newComment}
          onChange={handleCommentChange}
          onSubmit={handleAddComment}
          disabled={!user || submittingComment}
          projectId="" // Set empty projectId since it's not used
        />
      </div>

      {/* Comments list */}
      <div className="space-y-4">
        {loadingComments ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : comments.length > 0 ? (
          comments.map((comment) => (
            <div
              key={comment.id}
              ref={el => commentRefs.current[comment.id] = el}
              className={`bg-white rounded-lg border ${highlightedCommentId === comment.id ? 'border-blue-300 shadow-md' : 'border-gray-200'} p-4`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  {comment.userPhotoURL ? (
                    <img
                      src={comment.userPhotoURL}
                      alt={comment.userName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-600">
                        {comment.userName[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-gray-900">
                      {comment.userName}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                </div>
                {user && comment.userId === user.id && (
                  <div className="flex gap-2">
                    {editingCommentId === comment.id ? (
                      <>
                        <button
                          onClick={() => handleUpdateComment(comment.id)}
                                disabled={submittingComment}
                          className="p-1 text-green-600 hover:text-green-700 rounded-full hover:bg-green-50 disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditText("");
                          }}
                          disabled={submittingComment}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditText(comment.text);
                          }}
                          disabled={submittingComment}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 disabled:opacity-50"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          disabled={submittingComment}
                          className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100 disabled:opacity-50"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {editingCommentId === comment.id ? (
                <div className="w-full mt-2">
                  <EnhancedCommentInput
                    value={editText}
                    onChange={setEditText}
                    onSubmit={() => handleUpdateComment(comment.id)}
                    disabled={submittingComment}
                    projectId="" // Set empty projectId since it's not used
                    placeholder="Edit comment..."
                  />
                </div>
              ) : (
                <CommentText 
                  text={comment.text} 
                  className="mt-2 text-gray-600" 
                />
              )}
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 py-4">No comments yet</p>
        )}
      </div>
    </div>
  )
);

const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  viewerHeight,
  isShared,
  setViewerHeight,
  onRefresh
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeStartY = useRef<number>(0);
  const startHeight = useRef<number>(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const { user } = useAuth();
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const isSubmittingRef = useRef(false);
  const lastSubmissionTimeRef = useRef(0);
  const [lastCommentId, setLastCommentId] = useState<string | null>(null);
  const lastCommentTime = useRef<number>(0);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Add CSS for highlight animation in JSX
  const highlightStyles = `
    @keyframes pulse-highlight {
      0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5); }
      70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
      100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
    }
    .highlight-document {
      animation: pulse-highlight 2s ease-in-out;
      border: 2px solid #3b82f6 !important;
      transition: all 0.3s ease;
    }
  `;

  useEffect(() => {
    if (!document.id) return;

    setLoadingComments(true);
    const commentsRef = collection(db, `documents/${document.id}/comments`);
    const q = query(commentsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newComments = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Comment[];
        setComments(newComments);
        setLoadingComments(false);
      },
      (error) => {
        console.error("Error loading comments:", error);
        setLoadingComments(false);
      }
    );

    return () => unsubscribe();
  }, [document.id]);

  useEffect(() => {
    if (document.type === "pdf") {
      fetch(document.url)
        .then((res) => res.blob())
        .then((blob) =>
          setFile(new File([blob], document.name, { type: "application/pdf" }))
        )
        .catch((error) => console.error("Error loading PDF:", error));
    }
  }, [document]);

  useEffect(() => {
    // Check if we have a commentId in the URL
    const commentId = searchParams.get('comment');
    if (commentId) {
      console.log(`Found commentId in URL: ${commentId}, setting it as highlighted`);
      setHighlightedCommentId(commentId);
      
      // Wait for comments to load before trying to scroll
      const scrollTimeout = setTimeout(() => {
        const commentElement = commentRefs.current[commentId];
        if (commentElement) {
          console.log(`Scrolling to comment: ${commentId}`);
          commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Add a flash effect for the highlighted comment
          commentElement.classList.add('bg-blue-50');
          commentElement.classList.add('border-blue-300');
          
          setTimeout(() => {
            commentElement.classList.remove('bg-blue-50');
            commentElement.classList.remove('border-blue-300');
            // Add transition to make the highlight fade smoothly
            commentElement.classList.add('transition-all');
            commentElement.classList.add('duration-500');
          }, 2000);
        } else {
          console.log(`Comment element not found for ID: ${commentId}`);
        }
      }, 500); // Short delay to ensure comments have loaded
      
      return () => clearTimeout(scrollTimeout);
    }
  }, [searchParams, comments.length]);

  // Add a new useEffect to listen for notification events
  useEffect(() => {
    // Listen for notification document update events
    const handleNotificationUpdate = (event: CustomEvent) => {
      const { documentId, fileId, commentId, notificationType, fileName } = event.detail;
      console.log(`Received notification update event for document ${documentId}, comment ${commentId}, file ${fileId}`);
      console.log(`Notification type: ${notificationType}, fileName: ${fileName}`);
      
      // Only process if this is the same document we're viewing
      if (documentId && document.id === documentId) {
        // Handle comment notifications
        if (commentId) {
          console.log(`Setting highlighted comment ID to: ${commentId}`);
          setHighlightedCommentId(commentId);
          
          // Give time for state to update, then scroll
          setTimeout(() => {
            const commentElement = commentRefs.current[commentId];
            if (commentElement) {
              console.log('Scrolling to comment from notification event');
              commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              
              // Add a flash effect
              commentElement.classList.add('bg-blue-50');
              commentElement.classList.add('border-blue-300');
              
              setTimeout(() => {
                commentElement.classList.remove('bg-blue-50');
                commentElement.classList.remove('border-blue-300');
                commentElement.classList.add('transition-all');
                commentElement.classList.add('duration-500');
              }, 2000);
            }
          }, 100);
        }
        // Handle file upload notifications - animate or highlight the document view
        else if (notificationType === 'file-upload') {
          console.log('Handling file upload notification');
          
          // Set toast message and show it
          setToastMessage(`Viewing uploaded file: ${fileName || document.name}`);
          setShowToast(true);
          
          // Hide after 5 seconds
          setTimeout(() => {
            setShowToast(false);
          }, 5000);
          
          // Apply highlight via DOM (since the document viewer is complex)
          const documentViewer = window.document.querySelector('.document-content') as HTMLElement;
          if (documentViewer) {
            documentViewer.classList.add('highlight-document');
            setTimeout(() => {
              documentViewer.classList.remove('highlight-document');
            }, 3000);
          }
        }
      }
    };
    
    // Add event listener
    window.document.addEventListener(
      NOTIFICATION_DOCUMENT_UPDATE_EVENT,
      handleNotificationUpdate as EventListener
    );
    
    // Cleanup
    return () => {
      window.document.removeEventListener(
        NOTIFICATION_DOCUMENT_UPDATE_EVENT,
        handleNotificationUpdate as EventListener
      );
    };
  }, [document.id, document.name]);

  // Add a useEffect to handle the navigation coming from notifications
  useEffect(() => {
    // Check if we're navigating from a notification and need to handle special project switching
    const locationState = location.state as any;
    if (locationState?.fromNotification && locationState?.forceDirect) {
      console.log('Handling notification navigation with forceDirect:', locationState);
      
      // If this is a direct navigation from a notification, we might need to handle project context
      // This ensures proper context switching even when coming from a different project
      
      // You could trigger any necessary project initialization here
      // For example, loading project data based on the current document/folder
      
      // Clear the navigation state after handling to prevent loops
      const clearedState = {...locationState, handled: true};
      window.history.replaceState(clearedState, '');
    }
  }, [location]);

  const handleAddComment = async () => {
    if (!user || !newComment.trim() || submittingComment) return;
    
    const now = Date.now();
    
    // Prevent multiple submissions within a short timeframe
    if (now - lastSubmissionTimeRef.current < 2000) {
      return;
    }
    
    // Prevent concurrent submissions
    if (isSubmittingRef.current) {
      return;
    }
    
    // Check if this exact comment was recently added
    if (now - lastCommentTime.current < 10000 && lastCommentId) {
      return;
    }
    
    // Set all the submission lock flags
    isSubmittingRef.current = true;
    lastSubmissionTimeRef.current = now;
    lastCommentTime.current = now;
    
    const submissionId = now.toString();
    const commentText = newComment.trim();
    
    try {
      setSubmittingComment(true);
      
      // Clear input immediately to prevent accidental resubmission
      setNewComment("");
      
      // Extract mentions - detect @username patterns in the text
      const mentions = extractMentions(commentText);
      
      // Improve the mentions for display by limiting them to valid users
      const limitedMentions = mentions.map(mention => {
        // Keep track of the original mention
        const originalMention = mention;
        
        // Try to limit the mention to just the username part
        const nameParts = mention.username.split(/\s+/);
        
        return originalMention;
      });
      
      let resolvedMentions: UserMention[] = [];
      try {
        resolvedMentions = await resolveUserMentions(limitedMentions, async (username) => {
          try {
            const trimmedUsername = username.trim();
            
            if (!trimmedUsername) {
              return null;
            }
            
            // Get all users at once to prevent multiple calls
            const allUsers = await userService.getAllUsers();
            
            // First try strict case-insensitive match on the full display name
            let match = allUsers.find(u => 
              u.displayName.toLowerCase() === trimmedUsername.toLowerCase()
            );
            
            if (match) {
              return match.id;
            }
            
            // Check if the mention is just the first part of a multi-word name
            // For example, when "@John Doe" is mentioned as "@John"
            const firstWord = trimmedUsername.split(/\s+/)[0].toLowerCase();
            
            match = allUsers.find(u => {
              const nameParts = u.displayName.toLowerCase().split(/\s+/);
              return nameParts[0] === firstWord; // Match first name
            });
            
            if (match) {
              return match.id;
            }
            
            // Try partial match where display name starts with mention text
            match = allUsers.find(u => 
              u.displayName.toLowerCase().startsWith(trimmedUsername.toLowerCase())
            );
            
            if (match) {
              return match.id;
            }
            
            // Try finding any user whose display name contains the mention text completely
            match = allUsers.find(u => {
              const displayName = u.displayName.toLowerCase();
              return displayName.includes(trimmedUsername.toLowerCase());
            });
            
            if (match) {
              return match.id;
            }
            
            return null;
          } catch (error) {
            console.error(`Error resolving username ${username}:`, error);
            return null;
          }
        });
      } catch (resolveError) {
        console.error('Error resolving mentions:', resolveError);
        resolvedMentions = [];
      }
      
      const mentionedUserIds = extractUserIds(resolvedMentions);
      
      const validMentionedUserIds = mentionedUserIds.filter(id => id && typeof id === 'string' && id.trim() !== '');
      
      // Add the comment to Firestore
      const commentsRef = collection(db, `documents/${document.id}/comments`);
      const commentDocRef = await addDoc(commentsRef, {
        userId: user.id,
        userName: user.displayName,
        text: commentText,
        createdAt: serverTimestamp(),
        userPhotoURL: user.profile?.photoURL || null,
        mentions: validMentionedUserIds,
        submissionId
      });
      
      const commentId = commentDocRef.id;
      
      // Store this comment ID to prevent duplicates
      setLastCommentId(commentId);
      
      // Get folder name for notification context
      let folderName = 'folder';
      if (document.folderId) {
        try {
          const folderDoc = await getDoc(doc(db, `folders/${document.folderId}`));
          if (folderDoc.exists()) {
            folderName = folderDoc.data().name || 'folder';
          }
        } catch (folderError) {
          console.error('Error fetching folder name:', folderError);
        }
      }
      
      // Fetch complete user objects for mentioned users to include usernames
      if (validMentionedUserIds.length > 0) {
        try {
          // Get all users in one query to avoid multiple requests
          const allUsers = await userService.getAllUsers();
          
          // Filter to just the mentioned users and format with usernames
          const mentionedUsers = allUsers
            .filter(u => validMentionedUserIds.includes(u.id))
            .map(u => ({ 
              id: u.id, 
              username: u.displayName || u.email || `user-${u.id.substring(0, 6)}`
            }));
          
          // Create notifications using the function
          await createNotificationsForComment(
            document.id, 
            document.name, 
            document.folderId || '', 
            folderName,
            commentId, 
            commentText, 
            user.id, 
            user.displayName,
            mentionedUsers
          );
        } catch (error) {
          console.error('Error fetching mentioned users:', error);
        }
      }
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setSubmittingComment(false);
      isSubmittingRef.current = false;
    }
  };

  const createNotificationsForComment = async (
    documentId: string,
    documentName: string,
    folderId: string,
    folderName: string,
    commentId: string,
    commentText: string,
    authorId: string,
    authorName: string,
    mentionedUsers: Array<{ id: string, username: string }>
  ) => {
    try {
      // Use the new notification function that properly checks comment text for mentions
      await notifyMentionedUsers(
        commentText,
        documentId,
        documentName,
        folderId,
        folderName,
        commentId,
        authorId,
        authorName,
        mentionedUsers
      );
    } catch (error) {
      console.error('Error creating notifications:', error);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editText.trim() || submittingComment) return;
    
    try {
      setSubmittingComment(true);
      
      const mentions = extractMentions(editText.trim());
      
      let resolvedMentions: UserMention[] = [];
      try {
        resolvedMentions = await resolveUserMentions(mentions, async (username) => {
          try {
            const trimmedUsername = username.trim();
            
            if (!trimmedUsername) {
              return null;
            }
            
            // Get all users at once to prevent multiple calls
            const allUsers = await userService.getAllUsers();
            
            // First try strict case-insensitive match on the full display name
            let match = allUsers.find(u => 
              u.displayName.toLowerCase() === trimmedUsername.toLowerCase()
            );
            
            if (match) {
              console.log(`Found exact display name match for @${trimmedUsername}: ${match.id}`);
              return match.id;
            }
            
            // Check if the mention is just the first part of a multi-word name
            // For example, when "@John Doe" is mentioned as "@John"
            const firstWord = trimmedUsername.split(/\s+/)[0].toLowerCase();
            
            match = allUsers.find(u => {
              const nameParts = u.displayName.toLowerCase().split(/\s+/);
              return nameParts[0] === firstWord; // Match first name
            });
            
            if (match) {
              console.log(`Found first name match for @${trimmedUsername}: ${match.id} (${match.displayName})`);
              return match.id;
            }
            
            // Try partial match where display name starts with mention text
            match = allUsers.find(u => 
              u.displayName.toLowerCase().startsWith(trimmedUsername.toLowerCase())
            );
            
            if (match) {
              console.log(`Found display name starts with @${trimmedUsername}: ${match.id} (${match.displayName})`);
              return match.id;
            }
            
            // Try finding any user whose display name contains the mention text completely
            match = allUsers.find(u => {
              const displayName = u.displayName.toLowerCase();
              return displayName.includes(trimmedUsername.toLowerCase());
            });
            
            if (match) {
              console.log(`Found display name contains @${trimmedUsername}: ${match.id} (${match.displayName})`);
              return match.id;
            }
            
            console.log(`Could not resolve mention @${trimmedUsername}`);
            return null;
          } catch (error) {
            console.error(`Error resolving username ${username}:`, error);
            return null;
          }
        });
      } catch (resolveError) {
        console.error('Error resolving mentions:', resolveError);
        resolvedMentions = [];
      }
      
      const mentionedUserIds = extractUserIds(resolvedMentions);
      
      const validMentionedUserIds = mentionedUserIds.filter(id => id && typeof id === 'string' && id.trim() !== '');
      
      const commentRef = doc(
        db,
        `documents/${document.id}/comments/${commentId}`
      );
      
      await updateDoc(commentRef, {
        text: editText.trim(),
        updatedAt: serverTimestamp(),
        mentions: validMentionedUserIds
      });
      
      const updatedCommentDoc = await getDoc(commentRef);
      if (!updatedCommentDoc.exists()) {
        throw new Error('Comment no longer exists');
      }
      
      const updatedComment = updatedCommentDoc.data() as DocumentComment;
      const oldMentions = updatedComment.mentions || [];
      
      const newMentions = validMentionedUserIds.filter(id => !oldMentions.includes(id));
      
      if (newMentions.length > 0) {
        let folderName = 'folder';
        if (document.folderId) {
          try {
            const folderDoc = await getDoc(doc(db, `folders/${document.folderId}`));
            if (folderDoc.exists()) {
              folderName = folderDoc.data().name || 'folder';
            }
          } catch (folderError) {
            console.error('Error fetching folder name:', folderError);
          }
        }
        
        try {
          await createCommentMentionNotifications(
            document.id,
            document.name,
            document.folderId || '',
            folderName,
            commentId,
            editText.trim(),
            user?.id || '',
            user?.displayName || 'User',
            newMentions
          );
        } catch (notificationError) {
          console.error('Error creating mention notifications for updated comment:', notificationError);
        }
      }
      
      setEditingCommentId(null);
      setEditText("");
    } catch (error) {
      console.error('Error updating comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm("Are you sure you want to delete this comment?"))
      return;

    try {
      setSubmittingComment(true);
      const commentRef = doc(
        db,
        `documents/${document.id}/comments/${commentId}`
      );
      await deleteDoc(commentRef);
    } catch (error) {
      console.error("Error deleting comment:", error);
    } finally {
      setSubmittingComment(false);
    }
  };

  const documentService = {
    getVersions: async (docId: string) => {
      try {
        const versionsRef = collection(db, `documents/${docId}/versions`);
        const q = query(versionsRef, orderBy("version", "desc"));
        const snapshot = await getDocs(q);

        const versionsWithCORS = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const data = doc.data();
            try {
              const storageRef = ref(storage, data.url);
              const downloadURL = await getDownloadURL(storageRef);
              return {
                id: doc.id,
                ...data,
                url: `${downloadURL}?alt=media`,
                accessible: true,
              };
            } catch (error) {
              console.warn(`Error accessing file ${data.url}:`, error);
              return {
                id: doc.id,
                ...data,
                url: null,
                accessible: false,
              };
            }
          })
        );

        return versionsWithCORS as (DocumentVersion & {
          accessible: boolean;
        })[];
      } catch (error) {
        console.error("Error fetching versions:", error);
        return [];
      }
    },

    updateFile: async (folderId: string, docId: string, file: File) => {
      try {
        const storageRef = ref(storage, `documents/${docId}/${file.name}`);
        const uploadResult = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(uploadResult.ref);

        const corsEnabledURL = `${downloadURL}?alt=media`;

        const docRef = doc(db, "documents", docId);
        const docSnap = await getDoc(docRef);
        const currentVersion = docSnap.data()?.version || 0;

        const versionsRef = collection(db, `documents/${docId}/versions`);
        await addDoc(versionsRef, {
          version: currentVersion + 1,
          url: corsEnabledURL,
          uploadedAt: serverTimestamp(),
          metadata: {
            originalFilename: file.name,
            contentType: file.type,
            size: file.size,
          },
        });

        await updateDoc(docRef, {
          url: corsEnabledURL,
          version: currentVersion + 1,
          dateModified: serverTimestamp(),
          name: file.name,
        });
      } catch (error) {
        console.error("Error updating document:", error);
        throw new Error("Failed to update document");
      }
    },
  };

  useEffect(() => {
    loadVersions();
  }, [document.id]);

  useEffect(() => {
    if (isResizing) {
      const handleMouseMove = (e: MouseEvent) => {
        const deltaY = e.clientY - resizeStartY.current;
        const newHeight = Math.max(
          400,
          Math.min(startHeight.current + deltaY, window.innerHeight - 200)
        );
        setViewerHeight(newHeight);
      };

      const handleMouseUp = () => setIsResizing(false);

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing]);

  const loadVersions = async () => {
    try {
      setLoadingVersions(true);
      const fetchedVersions = await documentService.getVersions(document.id);
      setVersions(fetchedVersions.sort((a, b) => b.version - a.version));
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    startHeight.current = viewerHeight;
  };

  const validateFile = (file: File): string | null => {
    if (!file.type && !file.name.toLowerCase().endsWith(".pdf"))
      return "Only PDF files are allowed";
    if (file.type && !ALLOWED_FILE_TYPES.includes(file.type))
      return "Only PDF files are allowed";
    if (file.size > MAX_FILE_SIZE)
      return `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    return null;
  };

  const handleFileUpload = async (file: File) => {
    const error = validateFile(file);
    if (error) return setUploadError(error);

    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadProgress(0);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => (prev >= 90 ? 90 : prev + 10));
      }, 300);

      await documentService.updateFile(
        document.folderId || "",
        document.id,
        file
      );
      clearInterval(progressInterval);
      setUploadProgress(100);

      await Promise.all([loadVersions(), onRefresh?.()]);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Failed to upload file"
      );
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 500);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await handleFileUpload(file);
  };

  const handleCommentChange = (newValue: string) => {
    setNewComment(newValue);
  };

  const handleAddAnnotation = () => {
    // Implementation of handleAddAnnotation
  };

  const handleDownload = () => {
    // Implementation of handleDownload
  };

  return (
    <div className="flex flex-col h-full">
      {/* Add style tag for highlight animation */}
      <style>{highlightStyles}</style>
      
      {/* Toast notification */}
      {showToast && (
        <div 
          id="document-toast" 
          className="fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-md shadow-lg flex items-center"
        >
          <div className="mr-2">
            <FileUp className="w-4 h-4" />
          </div>
          <span>{toastMessage}</span>
          <button 
            onClick={() => setShowToast(false)} 
            className="ml-2 text-white hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {/* Document Header */}
      <div
        className={`bg-white border-b border-gray-200 transition-all ${
          isExpanded ? "pb-6" : ""
        }`}
      >
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900">
                {document.name}
              </h2>
              <p className="text-sm text-gray-500">
                Version {document.version} • Last modified{" "}
                {formatDate(document.dateModified)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="px-2 py-1 text-xs font-medium uppercase rounded-full bg-gray-100 text-gray-800">
              {document.type}
            </span>
            <a
              href={document.url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            >
              <Download className="w-5 h-5" />
            </a>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>

        {/* Version History Section */}
        {isExpanded && (
          <div className="px-4 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
                <History className="w-4 h-4 mr-1" /> Version History
              </h3>
              <div className="space-y-2">
                <AnimatePresence mode="wait">
                  {loadingVersions ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex justify-center py-4"
                    >
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </motion.div>
                  ) : (
                    versions.map((version) => (
                      <motion.div
                        key={version.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-gray-900">
                              Version {version.version}
                            </span>
                            {version.version === document.version && (
                              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-gray-500">
                            <p>Uploaded {formatDate(version.uploadedAt)}</p>
                            <p className="text-xs">
                              {version.metadata.originalFilename} (
                              {(version.metadata.size / (1024 * 1024)).toFixed(
                                2
                              )}{" "}
                              MB)
                            </p>
                          </div>
                        </div>
                        {version.accessible ? (
                          <a
                            href={version.url}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-4 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors flex items-center space-x-1"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                          </a>
                        ) : (
                          <div className="ml-4 px-3 py-1.5 text-sm text-gray-500 flex items-center space-x-1">
                            <AlertCircle className="w-4 h-4" />
                            <span>Unavailable</span>
                          </div>
                        )}
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
                {!loadingVersions && versions.length === 0 && (
                  <p className="text-center text-gray-500 py-4">
                    No version history available
                  </p>
                )}
              </div>
            </div>

            {/* File Upload Section */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
                <Upload className="w-4 h-4 mr-1" /> Update Document
              </h3>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`mb-4 p-6 border-2 border-dashed rounded-lg text-center transition-colors ${
                  isDragging || isUploading
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400"
                }`}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center space-y-2">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    <div className="w-full max-w-xs mx-auto">
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-blue-500"
                          animate={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-sm text-blue-500 mt-2">
                        Uploading... {uploadProgress}%
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <FileUp className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 mb-1">
                      Drag & drop a new version here
                    </p>
                    <p className="text-xs text-gray-500 mb-2">or</p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 text-sm text-blue-500 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                    >
                      Browse Files
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      PDF files up to 50MB
                    </p>
                  </>
                )}
              </div>
              {uploadError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center text-sm text-red-600"
                >
                  <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                  {uploadError}
                </motion.div>
              )}
            </div>

            {/* Add Comment Section here */}
            <CommentSection
              user={user}
              newComment={newComment}
              handleCommentChange={handleCommentChange}
              handleAddComment={handleAddComment}
              comments={comments}
              loadingComments={loadingComments}
              submittingComment={submittingComment}
              editingCommentId={editingCommentId}
              editText={editText}
              setEditText={setEditText}
              handleUpdateComment={handleUpdateComment}
              handleDeleteComment={handleDeleteComment}
              setEditingCommentId={setEditingCommentId}
              document={document}
              highlightedCommentId={highlightedCommentId}
              commentRefs={commentRefs}
            />
          </div>
        )}
      </div>

      {/* Document Content */}
      <div className="flex-1 bg-gray-100 p-4">
        {document.type === "pdf" ? (
          <div className="flex h-full gap-4">
            <Toolbar />
            <div
              className="relative bg-white rounded-lg shadow-sm p-4 flex-1 document-content"
              style={{ height: "100%" }}
            >
              <PDFViewer file={document.url} documentId={document.id} />
            </div>
          </div>
        ) : isImage(document.name, document.metadata?.contentType) ? (
          <div className="h-full flex items-center justify-center bg-white rounded-lg shadow-sm p-4 document-content">
            <img 
              src={document.url} 
              alt={document.name} 
              className="max-w-full max-h-full object-contain" 
              onError={() => console.error("Image loading error")} 
            />
          </div>
        ) : isVideo(document.name, document.metadata?.contentType) ? (
          <div className="h-full flex items-center justify-center bg-white rounded-lg shadow-sm p-4 document-content">
            <video 
              src={document.url} 
              controls 
              className="max-w-full max-h-full" 
              onError={() => console.error("Video loading error")}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        ) : isAudio(document.name, document.metadata?.contentType) ? (
          <div className="h-full flex items-center justify-center bg-white rounded-lg shadow-sm p-4 document-content">
            <div className="flex flex-col items-center">
              <p className="mb-2 text-gray-700">{document.name}</p>
              <audio 
                src={document.url} 
                controls 
                className="w-full" 
                onError={() => console.error("Audio loading error")}
              >
                Your browser does not support the audio tag.
              </audio>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center bg-white rounded-lg shadow-sm document-content">
            <div className="text-center">
              <p className="text-gray-500 mb-4">
                This file type cannot be previewed directly
              </p>
              <a
                href={document.url}
                download
                className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
              >
                Download File
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
