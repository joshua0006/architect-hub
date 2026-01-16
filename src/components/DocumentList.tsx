import {
  Eye,
  FileText,
  FolderOpen,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
  Home,
  Share2,
  Search,
  ArrowUpDown,
  Filter,
  ChevronDown,
  Shield,
  Edit,
  Users,
  Download,
  Upload,
  Copy,
  X,
  Check,
  FolderPlus,
  ChevronUp,
  FolderInput,
  Image,
  Video,
  CheckCircle,
  Circle,
  CheckSquare,
  FilePlus,
  Undo,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Document, Folder, Project } from "../types";
import DocumentBreadcrumbs from "./DocumentBreadcrumbs";
import DocumentActions from "./DocumentActions";
import DocumentViewer from "./DocumentViewer";
import { motion, AnimatePresence } from "framer-motion";
import { Timestamp } from "firebase/firestore";
import { createShareToken } from '../services/shareService';
import { useToast } from '../contexts/ToastContext';
import { DEFAULT_FOLDER_ACCESS, FolderAccessPermission, PERMISSIONS_MAP, useAuth, UserRole } from '../contexts/AuthContext';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { RenameDialog } from './ui/RenameDialog';
import { PermissionsDialog } from './ui/PermissionsDialog';
import { NOTIFICATION_DOCUMENT_UPDATE_EVENT } from './NotificationIcon';
// Import doc and getDoc
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { subscribeToFolderDocuments, DOCUMENT_UPDATE_EVENT, triggerDocumentUpdate } from "../services/documentSubscriptionService";
import { subscribeToProjectFolders, FOLDER_UPDATE_EVENT, FOLDER_OPERATION_SUCCESS_EVENT, triggerFolderOperationSuccess } from "../services/folderSubscriptionService";
import { projectService } from '../services/projectService';
import { folderService } from '../services/folderService';
import { User } from '../types/auth';
import { useNavigate } from 'react-router-dom';
import { USER_UPDATE_EVENT } from '../services/userSubscriptionService';
import { documentService } from '../services/documentService';
import { formatDistanceToNow } from 'date-fns';
// Import JSZip and FileSaver for bulk downloads
import JSZip from 'jszip';
import FileSaver from 'file-saver';
// Add import for the FileSelectionManager component and its hook
import FileSelectionManager, { useFileSelection } from './FileSelectionManager';
import heic2any from 'heic2any';

// Local type definition for the DocumentViewer's Folder type
interface ViewerFolder {
  id: string;
  name: string;
  projectId?: string;
  parentId?: string;
  metadata?: any;
}

interface DocumentListProps {
  documents: Document[];
  folders: Folder[];
  currentFolder?: Folder;
  projectId: string;
  selectedProject?: Project;
  onFolderSelect: (folder?: Folder) => void;
  onPreview: (document: Document) => void;
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onCreateDocument?: (name: string, type: "pdf" | "dwg" | "other" | "image", file: File, folderId?: string) => Promise<void>;
  onCreateMultipleDocuments?: (files: File[], parentId?: string) => Promise<void>;
  onUpdateFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onUpdateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onShare?: (id: string, isFolder: boolean) => Promise<void>;
  onUpdateDocumentPermission?: (id: string, permission: 'STAFF_ONLY' | 'ALL' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ') => Promise<void>;
  onUpdateFolderPermission?: (id: string, permission: 'STAFF_ONLY' | 'ALL' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ') => Promise<void>;
  onCopyOrMoveFolder?: (source_folder: string, destination_folder: string, action: 'move' | 'copy') => Promise<void>;
  onCopyOrMoveFile?: (sourceDocumentId: string, destinationFolderId: string, action: 'copy' | 'move') => Promise<void>;
  onBulkRename?: (items: Array<{id: string, name: string, type: 'document' | 'folder'}>, pattern: string) => Promise<void>;
  isSharedView?: boolean;
  sharedDocuments?: Document[];
  sharedFolders?: Folder[];
  selectedFile?: Document;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

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

export default function DocumentList({
  documents = [],
  folders = [],
  currentFolder,
  projectId,
  selectedProject,
  onFolderSelect,
  onPreview,
  onCreateFolder,
  onCreateDocument,
  onCreateMultipleDocuments,
  onUpdateFolder,
  onDeleteFolder,
  onUpdateDocument,
  onDeleteDocument,
  onRefresh,
  onShare,
  onUpdateDocumentPermission,
  onUpdateFolderPermission,
  onCopyOrMoveFolder,
  onCopyOrMoveFile,
  onBulkRename,
  isSharedView,
  sharedDocuments,
  sharedFolders,
  selectedFile,
  onFullscreenChange,
}: DocumentListProps) {
  // Add permission checks with useAuth hook
  const { user, canEditDocuments, canDeleteDocuments, canShareDocuments, canUploadDocuments } = useAuth();
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string>();
  const [editName, setEditName] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document | undefined>(
    selectedFile
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    type: "folder" | "document";
    name: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [rootLoading, setRootLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<"all" | "folders" | "files">(
    "all"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortBy, setSortBy] = useState<"name" | "dateModified" | "dateCreated">("name");
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  
  // Add state for notification-triggered navigation loading
  const [isNotificationLoading, setIsNotificationLoading] = useState(false);
  const [notificationLoadingTarget, setNotificationLoadingTarget] = useState<{
    fileId?: string;
    folderId?: string;
    fileName?: string;
  } | null>(null);
  const [isProcessingNotification, setIsProcessingNotification] = useState(false);
  
  // Add new state for rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState<{id: string, type: 'document' | 'folder', name: string} | null>(null);
  
  // Add new state for permissions dialog
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [itemForPermissions, setItemForPermissions] = useState<{id: string, type: 'document' | 'folder', permission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL'} | null>(null);
  
  // Add new state for edit dropdown
  const [editDropdownId, setEditDropdownId] = useState<string | null>(null);

  // Add new state for popup positioning and content
  const [popupPosition, setPopupPosition] = useState<{x: number, y: number} | null>(null);
  const [popupItem, setPopupItem] = useState<{id: string, type: 'folder' | 'document', name: string} | null>(null);

  // Add new state for rename field
  const [editNameField, setEditNameField] = useState<string>("");
  const [selectedPermission, setSelectedPermission] = useState<'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL'>('STAFF_ONLY');
  const [initialPermissionOnPopupOpen, setInitialPermissionOnPopupOpen] = useState<'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL'>('STAFF_ONLY');

  // Add new state for permission fetching and saving
  const [isFetchingPermission, setIsFetchingPermission] = useState(false);
  const [isSavingPermission, setIsSavingPermission] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  
  // Add state for share functionality
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [showSharePopup, setShowSharePopup] = useState(false);
  
  // Add drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [showDragOverlay, setShowDragOverlay] = useState(false);
  const [draggedFileCount, setDraggedFileCount] = useState(0);
  const dragCounter = useRef(0);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<{total: number, success: number, failed: number}>({
    total: 0,
    success: 0,
    failed: 0
  });

  // Add state for real-time document updates
  const [localDocuments, setLocalDocuments] = useState<Document[]>(documents);
  const [localFolders, setLocalFolders] = useState<Folder[]>(folders);
  const unsubscribeDocRef = useRef<(() => void) | null>(null);
  const unsubscribeFolderRef = useRef<(() => void) | null>(null);
  const hasActiveDocSubscription = useRef<boolean>(false);
  const hasActiveFolderSubscription = useRef<boolean>(false);
  const [isReloading, setIsReloading] = useState<boolean>(false);

  // Use the local folders from state for rendering if available, otherwise use the prop folders
  const displayFolders = isSharedView ? sharedFolders || [] : (localFolders.length > 0 ? localFolders : folders);

  // Identify the invisible root folder if present
  const rootFolder = displayFolders.find(folder => folder.metadata?.isRootFolder);
  
  // Filter out invisible folders from display and always hide _root folders
  const visibleFolders = displayFolders.filter(folder => {
    // Skip hidden folders
    if (folder.metadata?.isHidden) return false;
    
    // Always hide _root folders from the UI completely
    if (folder.name === '_root') return false;
    
    return true;
  });

  // When filtering folders by parent, if we're at the top level (currentFolder is undefined), 
  // also include folders whose parent is the invisible root folder
  const allFolders = isSharedView 
    ? sharedFolders || [] 
    : visibleFolders.filter(folder => {
        // Skip showing the root folder itself in the list - it should be invisible
        if (folder.name === '_root' || folder.metadata?.isRootFolder) return false;
        
        // During notification processing, be extra strict about which folders to show
        if (isProcessingNotification) {
          // Always exclude _root folders during notification processing
          if (folder.name === '_root') return false;
          
          // If we have a specific folder target in the notification, only show relevant folders
          if (notificationLoadingTarget?.folderId) {
            // If in root view, only show folders at root level
            if (!currentFolder) {
              return folder.parentId === undefined || (rootFolder && folder.parentId === rootFolder.id);
            }
            // Otherwise only show folders in current folder
            return folder.parentId === currentFolder?.id;
          }
        }
        
        if (!currentFolder) {
          // At top level, include folders whose parent is undefined OR whose parent is the root folder
          return folder.parentId === undefined || (rootFolder && folder.parentId === rootFolder.id);
        } else {
          // In a subfolder, normal filtering applies
          return folder.parentId === currentFolder.id;
        }
      });

    // Show all documents based on folder context
    const allDocs = isSharedView 
      ? sharedDocuments || [] 
      : localDocuments.filter(doc => {
          if (!currentFolder) {
            // At top level, include files with no folder or in the invisible root folder
            if (rootFolder) {
              return doc.folderId === rootFolder.id || !doc.folderId;
            } else {
              // If no root folder exists, show files with no folder ID
              return !doc.folderId;
            }
          } else {
            // In a specific folder, only show files for that folder
            return doc.folderId === currentFolder.id;
          }
        });

  // Update local state when props change, but avoid duplicate _root folders
  useEffect(() => {
    // Deduplicate folders based on ID to prevent multiple _root folders
    const uniqueFolders = folders.reduce((acc, folder) => {
      // If we don't already have this folder in our accumulator, add it
      if (!acc.some(f => f.id === folder.id)) {
        acc.push(folder);
      }
      return acc;
    }, [] as Folder[]);
    
    setLocalFolders(uniqueFolders);
  }, [folders]);
  
  useEffect(() => {
    setLocalDocuments(documents);
  }, [documents]);

  // Component initialization - ensure documents are loaded on mount
  useEffect(() => {
    const initializeComponentData = async () => {
      // Check if we're at root level and have a root folder
      if (!currentFolder && rootFolder && !isSharedView) {
        console.log(`[DocumentList] At root level with root folder: ${rootFolder.id}, initializing data`);
        
        try {
          // Set loading states
          setLoading(true);
          setRootLoading(true);
          setIsReloading(true);
          
          // Force load documents for root folder
          if (localDocuments.length === 0) {
            console.log(`[DocumentList] No documents in state, loading from service for root folder`);
            const docs = await documentService.getByFolderId(rootFolder.id);
            if (docs.length > 0) {
              console.log(`[DocumentList] Loaded ${docs.length} documents during initialization for root folder`);
              setLocalDocuments(docs);
            }
          }
          
          // Call parent refresh if available
          if (onRefresh) {
            console.log('[DocumentList] Calling parent refresh during root initialization');
            await onRefresh();
          }
        } catch (error) {
          console.error('[DocumentList] Error initializing root folder data:', error);
        } finally {
          setLoading(false);
          setRootLoading(false);
          setIsReloading(false);
        }
      }
      // Only proceed if we have a currentFolder and we're not in shared view
      else if (currentFolder && !isSharedView) {
        console.log(`[DocumentList] Component mounted, initializing data for folder: ${currentFolder.id}`);
        
        try {
          // Set loading state
          setLoading(true);
          setIsReloading(true);
          
          // Force load documents for current folder
          if (localDocuments.length === 0) {
            console.log(`[DocumentList] No documents in state, loading from service`);
            const docs = await documentService.getByFolderId(currentFolder.id);
            if (docs.length > 0) {
              console.log(`[DocumentList] Loaded ${docs.length} documents during initialization`);
              setLocalDocuments(docs);
            }
          }
          
          // Call parent refresh if available
          if (onRefresh) {
            console.log('[DocumentList] Calling parent refresh during initialization');
            await onRefresh();
          }
        } catch (error) {
          console.error('[DocumentList] Error initializing component data:', error);
        } finally {
          setLoading(false);
          setIsReloading(false);
        }
      }
    };
    
    initializeComponentData();
    
    // Register a one-time listener for window focus events to refresh data
    // This helps when a user tabs back to the application
    const handleWindowFocus = () => {
      if (currentFolder && onRefresh) {
        console.log('[DocumentList] Window focused, refreshing data');
        setIsReloading(true);
        onRefresh().finally(() => setIsReloading(false));
      } else if (!currentFolder && rootFolder && onRefresh) {
        console.log('[DocumentList] Window focused at root level, refreshing data');
        setRootLoading(true);
        onRefresh().finally(() => setRootLoading(false));
      }
    };
    
    window.addEventListener('focus', handleWindowFocus);
    
    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);  // Empty dependency array means this runs once on mount

  // Set initial values when popup opens - moved from renderEditPopup
  // Update useEffect to fetch permissions when popup opens
  useEffect(() => {
    if (popupItem) {
      const fetchPermission = async () => {
        setIsFetchingPermission(true);
        setSelectedPermission('STAFF_ONLY'); // Default while loading

        try {
          const itemRef = doc(db, popupItem.type === 'folder' ? 'folders' : 'documents', popupItem.id);
          const docSnap = await getDoc(itemRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const permission = data.metadata?.access as 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL' || 'STAFF_ONLY';
            setSelectedPermission(permission); // Set current selection
            setInitialPermissionOnPopupOpen(permission); // Store initial value
            console.log(`Fetched permission for ${popupItem.type} ${popupItem.id}: ${permission}`);
          } else {
            console.warn(`Document ${popupItem.id} not found when fetching permission.`);
            setSelectedPermission('STAFF_ONLY'); // Fallback if doc doesn't exist
            setInitialPermissionOnPopupOpen('STAFF_ONLY'); // Set initial fallback too
          }
        } catch (error) {
          console.error("Error fetching permission:", error);
          setSelectedPermission('STAFF_ONLY'); // Fallback on error
          setInitialPermissionOnPopupOpen('STAFF_ONLY'); // Set initial fallback too
        } finally {
          setIsFetchingPermission(false);
        }
      };

      setEditNameField(popupItem.name); // Set name immediately
      fetchPermission(); // Fetch permission async

    }
  }, [popupItem]); // Removed folders and documents dependencies as we fetch directly

  const isUserAdminOrStaff = (): boolean =>{
    if(!user || !user.role) {
      return false;
    }
    return [UserRole.ADMIN, UserRole.STAFF].includes(user.role);
  }


 const hasFolderWritePermission = (folderPermission: FolderAccessPermission): boolean => {
  const role = user?.role as UserRole | undefined;

  let writeAccess = DEFAULT_FOLDER_ACCESS;
  if (role && folderPermission in PERMISSIONS_MAP) {
    writeAccess = PERMISSIONS_MAP[folderPermission][role] ?? DEFAULT_FOLDER_ACCESS;
  }
  return writeAccess.write;
 }

 const hasFolderReadPermission = (folderPermission: FolderAccessPermission): boolean => {
  const role = user?.role as UserRole | undefined;

  let writeAccess = DEFAULT_FOLDER_ACCESS;
  if (role && folderPermission in PERMISSIONS_MAP) {
    writeAccess = PERMISSIONS_MAP[folderPermission][role] ?? DEFAULT_FOLDER_ACCESS;
  }
  return writeAccess.read;
 }

  // Filter and sort documents and folders based on search, view filter, and sort order
  const filteredAndSortedItems = () => {
    // Apply search filter for documents
    let filteredDocs = isSharedView
      ? (sharedDocuments || [])
      : localDocuments.filter(doc => doc.folderId === currentFolder?.id);

    filteredDocs = filteredDocs.filter(doc =>
      doc.name && typeof doc.name === 'string' ? 
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) : 
      false
    );
    
    // Apply search filter for folders
    let filteredFolders = isSharedView
      ? (sharedFolders || [])
      : visibleFolders.filter(folder =>
          folder.parentId === currentFolder?.id && // Only filter direct children of current folder
          folder.name !== '_root' && // Always exclude _root folders
          folder.name && typeof folder.name === 'string' ?
          folder.name.toLowerCase().includes(searchQuery.toLowerCase()) :
          false
        );

    // Filter folders based on user's write permissions for each folder
    filteredFolders = filteredFolders.filter(folder =>
      hasFolderReadPermission(folder.metadata?.access as FolderAccessPermission)
    );

    // Filter documents based on user's write permissions for the current folder
    filteredDocs = filteredDocs.filter(doc =>
      hasFolderReadPermission(currentFolder?.metadata?.access as FolderAccessPermission)
    );

    // Apply view filter
    if (viewFilter === 'files') {
      filteredFolders = [];
    } else if (viewFilter === 'folders') {
      filteredDocs = [];
    }

    // Sort documents and folders based on sortBy and sortOrder
    const sortFunction = (a: any, b: any) => {
      if (sortBy === 'name') {
        const aName = a.name && typeof a.name === 'string' ? a.name.toLowerCase() : '';
        const bName = b.name && typeof b.name === 'string' ? b.name.toLowerCase() : '';
        // Sort numbers before letters
        const aIsNumber = /^\d+/.test(aName);
        const bIsNumber = /^\d+/.test(bName);
        
        if (aIsNumber && !bIsNumber) return sortOrder === 'asc' ? -1 : 1;
        if (!aIsNumber && bIsNumber) return sortOrder === 'asc' ? 1 : -1;
        if (aIsNumber && bIsNumber) {
          // Extract numbers from the start of the string
          const aNumMatch = aName.match(/^\d+/);
          const bNumMatch = bName.match(/^\d+/);
          if (aNumMatch && bNumMatch) {
            const aNum = parseInt(aNumMatch[0]);
            const bNum = parseInt(bNumMatch[0]);
            if (aNum !== bNum) {
              return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
            }
          }
        }
        const comparison = aName.localeCompare(bName);
        return sortOrder === 'asc' ? comparison : -comparison;
      } else if (sortBy === 'dateModified') {
        const aDate = a.dateModified ? new Date(a.dateModified) : new Date(0);
        const bDate = b.dateModified ? new Date(b.dateModified) : new Date(0);
        return sortOrder === 'asc' ? aDate.getTime() - bDate.getTime() : bDate.getTime() - aDate.getTime();
      } else if (sortBy === 'dateCreated') {
        const aDate = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const bDate = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return sortOrder === 'asc' ? aDate.getTime() - bDate.getTime() : bDate.getTime() - aDate.getTime();
      }
      
      return 0;
    };

    filteredDocs.sort(sortFunction);
    filteredFolders.sort(sortFunction);

    return { filteredDocs, filteredFolders };
  };

  const { filteredDocs: currentDocs, filteredFolders: subFolders } = filteredAndSortedItems();

  // Toggle sort order
  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };
  
  // Change sort field
  const changeSortBy = (sortField: 'name' | 'dateModified' | 'dateCreated') => {
    setSortBy(sortField);
    setShowSortDropdown(false);
  };

  // Toggle view filter
  const changeViewFilter = (filter: 'all' | 'files' | 'folders') => {
    setViewFilter(filter);
  };

  // Replace handleStartEdit with openRenameDialog
  const openRenameDialog = (id: string, type: 'document' | 'folder', name: string) => {
    setItemToRename({ id, type, name });
    setRenameDialogOpen(true);
  };

  // Add handleRename function
  const handleRename = async (newName: string) => {
    if (!itemToRename) return;
    
    try {
      setLoading(true);
      if (itemToRename.type === 'folder') {
        await onUpdateFolder(itemToRename.id, newName);
      } else {
        await onUpdateDocument(itemToRename.id, { name: newName });
      }
      
      if (onRefresh) {
        await onRefresh();
      }
      
      showToast(`${itemToRename.type === 'folder' ? 'Folder' : 'File'} renamed successfully`, 'success');
    } catch (error) {
      console.error("Error renaming item:", error);
      showToast(`Failed to rename ${itemToRename.type === 'folder' ? 'folder' : 'file'}`, 'error');
    } finally {
      setLoading(false);
      setRenameDialogOpen(false);
      setItemToRename(null);
    }
  };

  // Close rename dialog
  const closeRenameDialog = () => {
    setRenameDialogOpen(false);
    setItemToRename(null);
  };

  // Keep handleSaveEdit for backwards compatibility
  const handleSaveEdit = async (id: string, type: "folder" | "document") => {
    if (editName.trim()) {
      try {
        setLoading(true);
        if (type === "folder") {
          await onUpdateFolder(id, editName.trim());
        } else {
          await onUpdateDocument(id, { name: editName.trim() });
        }
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error("Error saving edit:", error);
      } finally {
        setLoading(false);
        setEditingId(undefined);
        setEditName("");
      }
    }
  };

  // Handle breadcrumb navigation - force a clean reload when navigating to folders
  const handleBreadcrumbNavigation = (folder?: ViewerFolder | Folder) => {
    console.log('Navigating via breadcrumbs to:', folder);
    
    // If we have a selected document, close it first
    if (selectedDocument) {
      setSelectedDocument(undefined);
    }
    
    // Reset any search or filter state
    setSearchQuery('');
    
    if (folder) {
      // Convert ViewerFolder to Folder if needed
      const fullFolder = folders.find(f => f.id === folder.id);
      
      // Reset document subscription to force a fresh reload
      if (unsubscribeDocRef.current) {
        unsubscribeDocRef.current();
        unsubscribeDocRef.current = null;
        hasActiveDocSubscription.current = false;
      }
      
      // Navigate to the folder
      if (fullFolder && onFolderSelect) {
        onFolderSelect(fullFolder);
        
        // Force a document refresh for this folder
        triggerDocumentUpdate(fullFolder.id);
      }
    } else {
      // Navigate to root
      onFolderSelect(undefined);
    }
    
    // Perform a comprehensive refresh if available
    if (onRefresh) {
      onRefresh();
    }
  };

  // Add method to get URL path with project ID for consistency
  const getProjectPath = () => {
    return projectId ? `/documents/projects/${projectId}` : '/documents';
  };

  // Expose method for the parent to utilize with proper project context
  const getDocumentPath = (document: Document) => {
    if (document.folderId) {
      return `${getProjectPath()}/folders/${document.folderId}/files/${document.id}`;
    } else {
      return `${getProjectPath()}/files/${document.id}`;
    }
  };

  const getFolderPath = (folder: Folder) => {
    return `${getProjectPath()}/folders/${folder.id}`;
  };

  const handleShare = async (resourceId: string, isFolder: boolean) => {
    try {
      setIsSharing(true);
      setShareUrl(null);
      setShowSharePopup(true);
      
      const token = await createShareToken(
        resourceId,
        isFolder ? 'folder' : 'file',
        user?.id || '',
        { expiresInHours: 168 } // 7 days
      );
      
      // Create the share URL
      const url = `${window.location.origin}/shared/${token.id}`;
      
      // Copy to clipboard
      navigator.clipboard.writeText(url);
      
      // Set the share URL for the popup
      setShareUrl(url);
      
      showToast('Share link copied to clipboard', 'success');
    } catch (error) {
      console.error('Sharing failed:', error);
      showToast('Failed to create share link', 'error');
      setShowSharePopup(false);
    } finally {
      setIsSharing(false);
    }
  };

  const closeSharePopup = () => {
    setShowSharePopup(false);
    setShareUrl(null);
  };

  const handleDeleteItem = () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === 'document') {
        onDeleteDocument(itemToDelete.id);
      } else {
        onDeleteFolder(itemToDelete.id);
      }

      // Dispatch event for successful deletion
      const deleteSuccessEvent = new CustomEvent('document-delete-success', {
        bubbles: true,
        detail: {
          folderId: currentFolder?.id,
          itemId: itemToDelete.id,
          itemType: itemToDelete.type,
          timestamp: Date.now()
        }
      });
      document.dispatchEvent(deleteSuccessEvent);
      console.log(`[Document List] Dispatched delete success event for ${itemToDelete.type}: ${itemToDelete.id}`);

      showToast(`${itemToDelete.name} deleted successfully`, 'success');
    } catch (error) {
      console.error('Delete failed:', error);
      showToast(`Failed to delete ${itemToDelete.name}`, 'error');
    } finally {
      setItemToDelete(null);
      setShowDeleteConfirm(false);
    }
  };

  const confirmDelete = (id: string, type: 'document' | 'folder', name: string) => {
    setItemToDelete({ id, type, name });
    setShowDeleteConfirm(true);
  };

  const renderBreadcrumbs = () => {
    return (
      <DocumentBreadcrumbs
        folders={folders}
        currentFolder={currentFolder}
        selectedDocument={selectedDocument}
        onNavigate={handleBreadcrumbNavigation}
        onDocumentClick={() => selectedDocument && onPreview(selectedDocument)}
        onUpdateDocument={onUpdateDocument}
        onRefresh={onRefresh}
        showToast={(message: string, type?: "success" | "error" | "info" | "warning") => showToast(message, type as "success" | "error")}
      />
    );
  };

  // Add this effect to handle selected file from URL
  useEffect(() => {
    if (selectedFile) {
      // Get the folder information for the selected file
      const fileFolder = selectedFile.folderId ? folders.find(f => f.id === selectedFile.folderId) : undefined;
      setSelectedDocument(selectedFile);
    }
  }, [selectedFile, folders]);

  // Add additional effect to handle documents array changes
  useEffect(() => {
    if (documents.length > 0 && !selectedDocument && selectedFile) {
      // Get the folder information for the selected file
      const fileFolder = selectedFile.folderId ? folders.find(f => f.id === selectedFile.folderId) : undefined;
      setSelectedDocument(selectedFile);
    }
  }, [documents, selectedDocument, selectedFile, folders]);

  // Monitor for project changes while we have a selectedFile
  useEffect(() => {
    // Only proceed if we have a selectedFile and documents are loaded
    if (selectedFile && documents.length > 0) {
      console.log(`Looking for selected file ${selectedFile.id} in documents array of ${documents.length} items`);
      
      // Function to find and set the document
      const findAndSetDocument = () => {
        const foundDoc = documents.find(d => d.id === selectedFile.id);
        if (foundDoc) {
          console.log(`Found document in array: ${foundDoc.name ? foundDoc.name : 'unnamed document'}`);
          if (!selectedDocument || selectedDocument.id !== foundDoc.id) {
            console.log(`Setting selected document to: ${foundDoc.name ? foundDoc.name : 'unnamed document'}`);
            setSelectedDocument(foundDoc);
          }
          return true;
        }
        return false;
      };
      
      // Try to find immediately
      const foundImmediately = findAndSetDocument();
      
      // If not found immediately, set up retry mechanism
      if (!foundImmediately) {
        console.log(`Document ${selectedFile.id} not found immediately, setting up retry...`);
        
        // Set up retries with increasing delays
        let retryCount = 0;
        const maxRetries = 5;
        const retryDelay = 400; // Initial delay
        
        const retryFindDocument = () => {
          if (retryCount >= maxRetries) {
            console.log(`Max retries (${maxRetries}) reached, giving up on finding document ${selectedFile.id}`);
            return;
          }
          
          retryCount++;
          console.log(`Retry attempt ${retryCount} for document ${selectedFile.id}`);
          
          const found = findAndSetDocument();
          if (!found && retryCount < maxRetries) {
            // Schedule next retry with increasing delay
            const nextDelay = retryDelay * (1 + 0.5 * retryCount);
            console.log(`Scheduling retry ${retryCount + 1} in ${nextDelay}ms`);
            setTimeout(retryFindDocument, nextDelay);
          }
        };
        
        // Start retry process
        const initialRetryTimeout = setTimeout(retryFindDocument, retryDelay);
        
        // Clean up function to cancel any pending retries
        return () => {
          clearTimeout(initialRetryTimeout);
        };
      }
    }
  }, [selectedFile, documents, projectId, selectedDocument]); // Include dependencies that should trigger re-checking

  // Listen for notification document update events
  useEffect(() => {
    const handleNotificationUpdate = (event: CustomEvent) => {
      console.log('Notification document update event received:', event.detail);
      
      const { fileId, folderId, notificationType, forceDirect, fileName } = event.detail;

      // Flag that we're processing a notification immediately to prevent UI flickers and hide _root folders
      setIsProcessingNotification(true);
      
      // Always set notification loading state for any notification type
      setIsNotificationLoading(true);
      setNotificationLoadingTarget({
        fileId,
        folderId,
        fileName
      });
      console.log('Starting notification processing:', { fileId, folderId, fileName });
      
      // Set a safety timeout to clear loading states if something goes wrong
      const safetyTimeout = setTimeout(() => {
        setIsNotificationLoading(false);
        setNotificationLoadingTarget(null);
        setIsProcessingNotification(false);
        console.log('Safety timeout triggered to clear notification loading states');
      }, 5000); // 5 seconds max wait time
      
      // If we have a refresh function, call it to update the document list
      if (onRefresh) {
        console.log('Refreshing document list due to notification update');
        onRefresh().then(() => {
          // After refresh, navigate to the referenced file or folder if needed
          if (fileId) {
            const fileToSelect = documents.find(doc => doc.id === fileId);
            if (fileToSelect) {
              console.log('Navigating to file from notification:', fileToSelect.name ? fileToSelect.name : 'unnamed file');
              if (onPreview) {
                onPreview(fileToSelect);
                // Clear loading state once file preview is initiated
                clearTimeout(safetyTimeout);
                setTimeout(() => {
                  setIsNotificationLoading(false);
                  setNotificationLoadingTarget(null);
                  setIsProcessingNotification(false);
                }, 500);
              } else {
                // Clear loading state if preview function not available
                clearTimeout(safetyTimeout);
                setIsNotificationLoading(false);
                setNotificationLoadingTarget(null);
                setIsProcessingNotification(false);
              }
            } else {
              console.log('File not found in current document list, may need to fetch');
              
              // If the file is in a different folder, we may need to navigate to that folder first
              if (folderId && folderId !== currentFolder?.id) {
                const targetFolder = folders.find(folder => folder.id === folderId);
                if (targetFolder && onFolderSelect) {
                  console.log('Navigating to folder from notification:', targetFolder?.name || 'unnamed folder');
                  onFolderSelect(targetFolder);
                  
                  // After navigating to the folder, we need to find the file again
                  // Set a timeout to give time for the folder navigation to complete
                  setTimeout(() => {
                    // Try to find the file again after folder navigation
                    const updatedFileToSelect = documents.find(doc => doc.id === fileId);
                    if (updatedFileToSelect && onPreview) {
                      console.log('Found file after folder navigation:', updatedFileToSelect.name ? updatedFileToSelect.name : 'unnamed file');
                      onPreview(updatedFileToSelect);
                      
                      // Clear loading state after navigation is complete
                      clearTimeout(safetyTimeout);
                      setTimeout(() => {
                        setIsNotificationLoading(false);
                        setNotificationLoadingTarget(null);
                        setIsProcessingNotification(false);
                      }, 300);
                    } else {
                      console.log('File still not found after folder navigation');
                      clearTimeout(safetyTimeout);
                      setIsNotificationLoading(false);
                      setNotificationLoadingTarget(null);
                      setIsProcessingNotification(false);
                      
                      // Show a toast message to the user
                      if (showToast) {
                        showToast('The file you\'re looking for could not be found. It may have been moved or deleted.', 'error');
                      }
                    }
                  }, 1000); // Extended timeout for folder navigation
                } else {
                  console.log('Target folder not found in current folder list');
                  clearTimeout(safetyTimeout);
                  setIsNotificationLoading(false);
                  setNotificationLoadingTarget(null);
                  setIsProcessingNotification(false);
                  
                  // Show a toast message to the user
                  if (showToast) {
                    showToast('The folder containing this file could not be found. It may have been moved or deleted.', 'error');
                  }
                }
              } else {
                // If we can't find the file and there's no folder to navigate to, clear loading states
                clearTimeout(safetyTimeout);
                setIsNotificationLoading(false);
                setNotificationLoadingTarget(null);
                setIsProcessingNotification(false);
                
                // Show a toast message to the user
                if (showToast) {
                  showToast('The file you\'re looking for could not be found. It may have been moved or deleted.', 'error');
                }
              }
            }
          } else if (folderId && folderId !== currentFolder?.id) {
            // Just navigate to the folder
            const targetFolder = folders.find(folder => folder.id === folderId);
            if (targetFolder && onFolderSelect) {
              console.log('Navigating to folder from notification:', targetFolder?.name || 'unnamed folder');
              onFolderSelect(targetFolder);
              
              // Clear loading state after folder navigation is complete
              clearTimeout(safetyTimeout);
              setTimeout(() => {
                setIsNotificationLoading(false);
                setNotificationLoadingTarget(null);
                setIsProcessingNotification(false);
              }, 500);
            } else {
              console.log('Target folder not found in current folder list');
              clearTimeout(safetyTimeout);
              setIsNotificationLoading(false);
              setNotificationLoadingTarget(null);
              setIsProcessingNotification(false);
              
              // Show a toast message to the user
              if (showToast) {
                showToast('The folder you\'re looking for could not be found. It may have been moved or deleted.', 'error');
              }
            }
          } else {
            // No navigation happened, clear loading state
            clearTimeout(safetyTimeout);
            setIsNotificationLoading(false);
            setNotificationLoadingTarget(null);
            setIsProcessingNotification(false);
          }
        }).catch(error => {
          console.error('Error handling notification update:', error);
          clearTimeout(safetyTimeout);
          setIsNotificationLoading(false);
          setNotificationLoadingTarget(null);
          setIsProcessingNotification(false);
          
          // Show a toast message to the user
          if (showToast) {
            showToast('There was an error loading the content. Please try again.', 'error');
          }
        });
      } else {
        // No refresh function available, clear loading state
        clearTimeout(safetyTimeout);
        setIsNotificationLoading(false);
        setNotificationLoadingTarget(null);
        setIsProcessingNotification(false);
      }
    };
    
    // Add event listener
    document.addEventListener(
      NOTIFICATION_DOCUMENT_UPDATE_EVENT, 
      handleNotificationUpdate as EventListener
    );
    
    // Clean up event listener
    return () => {
      document.removeEventListener(
        NOTIFICATION_DOCUMENT_UPDATE_EVENT, 
        handleNotificationUpdate as EventListener
      );
    };
  }, [onRefresh, documents, folders, currentFolder, onFolderSelect, onPreview]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get filter label for display
  const getFilterLabel = () => {
    switch (viewFilter) {
      case 'files':
        return 'Files Only';
      case 'folders':
        return 'Folders Only';
      default:
        return 'All Items';
    }
  };

  // Get filter icon for display
  const getFilterIcon = () => {
    switch (viewFilter) {
      case 'files':
        return <FileText className="w-4 h-4" />;
      case 'folders':
        return <FolderOpen className="w-4 h-4" />;
      default:
        return <Filter className="w-4 h-4" />;
    }
  };

  // Update handleEditClick to not need mouse coordinates
  const handleEditClick = (e: React.MouseEvent, id: string, type: 'folder' | 'document', name: string) => {
    e.stopPropagation();
    
    // Close image preview popup if it's open
    closeImagePreview();
    
    // Just need to set the item details, not the position
    setPopupPosition({ x: 0, y: 0 }); // Still set position to trigger popup visibility
    setPopupItem({id, type, name});
  };
  
  // Add a function to close the popup
  const closePopup = () => {
    // Reset popup visibility and item reference
    setPopupPosition(null);
    setPopupItem(null);

    // Reset form fields to clean state
    setEditNameField("");
    setSelectedPermission('STAFF_ONLY');
    setInitialPermissionOnPopupOpen('STAFF_ONLY');

    // Reset all loading/saving states
    setIsFetchingPermission(false);
    setIsSavingPermission(false);
    setIsSavingName(false);
  };
  
  // Add effect to close popup when clicking outside
  useEffect(() => {
    if (popupPosition) {
      const handleClickOutside = (e: MouseEvent) => {
        // Check if the click was inside the popup
        const popup = document.getElementById('edit-popup');
        if (popup && !popup.contains(e.target as Node)) {
          closePopup();
        }
      };
      
      // Add event listener with a small delay to prevent immediate closure
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [popupPosition]);

  // Update the renderEditPopup function to display centered on screen
  // Update the renderEditPopup function
  const renderEditPopup = () => {
    if (!popupItem) return null;

    const handleSaveChanges = async () => {
      if (!popupItem || !editNameField.trim()) return;
      
      console.log(`Attempting to save changes for ${popupItem.type} [${popupItem.id}]`);
      let nameChanged = false;
      let permissionChanged = false;
      
      try {
        // Process name change first
        if (editNameField !== popupItem.name) {
          setIsSavingName(true);
          nameChanged = true;
          console.log(`Renaming ${popupItem.type} from "${popupItem.name}" to "${editNameField}"`);
          
          if (popupItem.type === 'folder') {
            await onUpdateFolder(popupItem.id, editNameField);
          } else {
            await onUpdateDocument(popupItem.id, { name: editNameField });
          }
        }
        
        // Then process permission change
        if (selectedPermission !== initialPermissionOnPopupOpen) {
          setIsSavingPermission(true);
          permissionChanged = true;
          console.log(`Changing permission for ${popupItem.type} [${popupItem.id}] from ${initialPermissionOnPopupOpen} to ${selectedPermission}`);
          
          // Get reference to the item
          const itemRef = doc(db, popupItem.type === 'folder' ? 'folders' : 'documents', popupItem.id);
          
          // Update the permission
          await updateDoc(itemRef, {
            'metadata.access': selectedPermission,
            'updatedAt': new Date().toISOString()
          });
        }
        
        // Close the popup if successful
        showToast(`${popupItem.type === 'folder' ? 'Folder' : 'File'} updated successfully`, 'success');
        closePopup();
      } catch (error) {
        console.error('Error updating item:', error);
        showToast(`Failed to update ${popupItem.type}`, 'error');
        
        // Reset saving states
        if (permissionChanged) {
          setIsSavingPermission(false);
        }
        if (nameChanged) {
          setIsSavingName(false);
        }
      }
    };


    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
        onClick={(e) => { if (e.target === e.currentTarget) closePopup(); }}
      >
        <div
          id="edit-popup"
          className="bg-white rounded-md shadow-lg overflow-hidden w-full max-w-md mx-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 border-b border-gray-100 bg-primary-50 flex justify-between items-center">
            <h3 className="font-medium text-gray-800">
              Edit {popupItem.type === 'folder' ? 'Folder' : 'File'}
            </h3>
            <button onClick={closePopup} className="text-gray-500 hover:text-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="p-4">
            {/* Rename Section */}
            <div className="mb-4">
              <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                {popupItem.type === 'folder' ? 'Folder' : 'File'} name
              </label>
              <input
                id="edit-name"
                type="text"
                value={editNameField}
                onChange={(e) => setEditNameField(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={isSavingPermission || isSavingName} // Disable while saving
              />
            </div>

            {/* Permissions Section - Only for staff users */}
            {(user?.role === 'Staff' || user?.role === 'Admin') && (
              <div className="mb-3">
                <p className="block text-sm font-medium text-gray-700 mb-2">
                  Who can access this {popupItem.type === 'folder' ? 'folder' : 'file'}?
                </p>
                {isFetchingPermission ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Staff Only Radio */}
                    <label className={`flex items-center p-3 border rounded-md ${isSavingPermission ? 'opacity-50 cursor-not-allowed' : 'border-gray-200'}`}>
                      <input
                        type="radio"
                        name="permission"
                        checked={selectedPermission === 'STAFF_ONLY'}
                        onChange={() => setSelectedPermission('STAFF_ONLY')}
                        className="h-4 w-4 text-primary-600"
                        disabled={isSavingPermission}
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">Staff Only</span>
                        <p className="text-xs text-gray-500">Only staff members can view this {popupItem.type}</p>
                      </div>
                    </label>
                    {/* Contractors Write Radio */}
                     <label className={`flex items-center p-3 border rounded-md ${isSavingPermission ? 'opacity-50 cursor-not-allowed' : 'border-gray-200'}`}>
                      <input
                        type="radio"
                        name="permission"
                        checked={selectedPermission === 'CONTRACTORS_WRITE'}
                        onChange={() => setSelectedPermission('CONTRACTORS_WRITE')}
                        className="h-4 w-4 text-primary-600"
                         disabled={isSavingPermission}
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">Consultants Write</span>
                        <p className="text-xs text-gray-500">Consultants can read and write to this {popupItem.type}</p>
                      </div>
                    </label>
                    {/* Clients Read Radio */}
                     <label className={`flex items-center p-3 border rounded-md ${isSavingPermission ? 'opacity-50 cursor-not-allowed' : 'border-gray-200'}`}>
                      <input
                        type="radio"
                        name="permission"
                        checked={selectedPermission === 'CLIENTS_READ'}
                        onChange={() => setSelectedPermission('CLIENTS_READ')}
                        className="h-4 w-4 text-primary-600"
                         disabled={isSavingPermission}
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">Clients Read</span>
                        <p className="text-xs text-gray-500">Clients can read but not modify this {popupItem.type}</p>
                      </div>
                    </label>
                    {/* All Users Radio */}
                     <label className={`flex items-center p-3 border rounded-md ${isSavingPermission ? 'opacity-50 cursor-not-allowed' : 'border-gray-200'}`}>
                      <input
                        type="radio"
                        name="permission"
                        checked={selectedPermission === 'ALL'}
                        onChange={() => setSelectedPermission('ALL')}
                        className="h-4 w-4 text-primary-600"
                         disabled={isSavingPermission}
                      />
                      <div className="ml-3">
                        <span className="text-sm font-medium text-gray-900">All Users</span>
                        <p className="text-xs text-gray-500">Everyone with project access can view this {popupItem.type}</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex justify-end space-x-2 mt-4 border-t border-gray-100 pt-3">
              <button
                onClick={closePopup}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                disabled={isSavingPermission || isSavingName} // Disable cancel while saving
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                className={`px-4 py-2 rounded-md transition-colors flex items-center justify-center min-w-[120px] ${
                  isSavingPermission || isSavingName
                    ? 'bg-primary-400 text-white cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
                disabled={!editNameField.trim() || isSavingPermission || isSavingName || isFetchingPermission} // Disable if saving, fetching, or name is empty
              >
                {isSavingPermission || isSavingName ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Add function to open permissions dialog
  const openPermissionsDialog = (id: string, type: 'document' | 'folder', permission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL') => {
    setItemForPermissions({ id, type, permission });
    setPermissionsDialogOpen(true);
    setEditDropdownId(null);
  };
  
  // Update the handleUpdatePermission function to directly update the Firestore document
  const handleUpdatePermission = async (permission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL') => {
    if (!itemForPermissions) return;
    
    try {
      setLoading(true);
      
      if (itemForPermissions.type === 'folder') {
        // First check if we have the onUpdateFolderPermission callback
        if (onUpdateFolderPermission) {
          // Use the callback if available
          await onUpdateFolderPermission(itemForPermissions.id, permission);
        } else {
          // Fallback to direct update if no callback provided
          const folderRef = doc(db, 'folders', itemForPermissions.id);
          await updateDoc(folderRef, {
            'metadata.access': permission,
            'updatedAt': new Date().toISOString()
          });
        }
        
        // Update local state to reflect changes immediately
        const updatedFolder = folders.find(f => f.id === itemForPermissions.id);
        if (updatedFolder) {
          // Create metadata if it doesn't exist
          if (!updatedFolder.metadata) {
            updatedFolder.metadata = {};
          }
          // Set access property 
          (updatedFolder.metadata as any).access = permission;
        }
      } else {
        // Document case
        if (onUpdateDocumentPermission) {
          // Use the callback if available
          await onUpdateDocumentPermission(itemForPermissions.id, permission);
        } else {
          // Fallback to direct update if no callback provided
          const documentRef = doc(db, 'documents', itemForPermissions.id);
          await updateDoc(documentRef, {
            'metadata.access': permission,
            'updatedAt': new Date().toISOString()
          });
        }
        
        // Update local state to reflect changes immediately
        const updatedDocument = documents.find(d => d.id === itemForPermissions.id);
        if (updatedDocument) {
          // Create metadata if it doesn't exist
          if (!updatedDocument.metadata) {
            updatedDocument.metadata = {};
          }
          // Set access property
          (updatedDocument.metadata as any).access = permission;
        }
      }
      
      if (onRefresh) {
        await onRefresh();
      }
      
      showToast(`${itemForPermissions.type === 'folder' ? 'Folder' : 'File'} permissions updated successfully`, 'success');
    } catch (error) {
      console.error("Error updating permissions:", error);
      showToast(`Failed to update ${itemForPermissions.type === 'folder' ? 'folder' : 'file'} permissions`, 'error');
    } finally {
      setLoading(false);
      setPermissionsDialogOpen(false);
      setItemForPermissions(null);
    }
  };
  
  // Close permissions dialog
  const closePermissionsDialog = () => {
    setPermissionsDialogOpen(false);
    setItemForPermissions(null);
  };

  // Add the missing handlePermissionClick function
  const handlePermissionClick = (id: string, type: 'document' | 'folder', currentPermission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL') => {
    setItemForPermissions({
      id,
      type,
      permission: currentPermission
    });
    setPermissionsDialogOpen(true);
  };

  // Check if the user has permissions to upload via drag and drop
  const hasUploadPermission = () => {
    // Allow for staff users
    if (user?.role === 'Staff' || user?.role === 'Admin') {
      return true;
    }
    
    // For contractors, check if they have write access to the current folder
    if (user?.role === 'Contractor') {
      // If no current folder, use project-level permissions
      if (!currentFolder) {
        return canUploadDocuments();
      }
      
      // Check folder-specific permissions
      if (currentFolder.metadata && 'access' in currentFolder.metadata) {
        const access = currentFolder.metadata.access as string;
        return access === 'CONTRACTORS_WRITE' || access === 'ALL';
      }
    }
    
    // Clients and other roles have no upload permission
    return false;
  };

  // Add this new function to handle permission-denied attempts
  const handlePermissionDenied = () => {
    if (user?.role === 'Contractor') {
      showToast("You don't have write permission for this folder. Only Staff and Contractors with write permission can upload files or create folders.", "error");
    } else {
      showToast("Only Staff and Contractors with write permission can upload files or create folders.", "error");
    }
  };

  // Update the drag handlers to use the new function
  const handleDragIn = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't show drag overlay when in document viewer mode
    if (selectedDocument) {
      return;
    }
    
    // Only proceed if user has upload permission
    if (!hasUploadPermission()) {
      if (dragCounter.current === 0) {
        handlePermissionDenied();
      }
      return;
    }
    
    dragCounter.current++;

    // Get file count from dataTransfer - need to check both items and files
    let fileCount = 0;
    if (e.dataTransfer.items) {
      // Use items for counting during dragenter/dragover
      fileCount = Array.from(e.dataTransfer.items)
        .filter(item => item.kind === 'file')
        .length;
    } else if (e.dataTransfer.files) {
      // Fallback to files if items not available
      fileCount = e.dataTransfer.files.length;
    }
    
    // Only update state and show overlay if we have files
    if (fileCount > 0) {
      setDraggedFileCount(fileCount);
      
      // Only show overlay after a short delay to prevent flashing during quick passes
      if (dragCounter.current === 1) {
        setTimeout(() => {
          if (dragCounter.current > 0 && !selectedDocument) {
            setIsDragging(true);
            setShowDragOverlay(true);
          }
        }, 100);
      }
    }
  };

  const handleDragOut = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Ignore when in document viewer
    if (selectedDocument) {
      return;
    }
    
    // Only proceed if user has upload permission
    if (!hasUploadPermission()) return;
    
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
      setShowDragOverlay(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only proceed if user has upload permission and not in document viewer
    if (!hasUploadPermission() || selectedDocument) return;
  };

  // Process the item - could be a file or directory
  const processEntry = async (entry: any, currentPath = ''): Promise<File[]> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        // Handle file entry
        entry.file((file: File) => {
          // Add path info to the file object
          const fileWithPath = Object.defineProperty(file, 'path', {
            value: currentPath ? `${currentPath}/${file.name}` : file.name,
            writable: true
          });
          resolve([fileWithPath]);
        }, () => {
          console.error('Error reading file:', entry.fullPath);
          resolve([]);
        });
      } else if (entry.isDirectory) {
        // Handle directory entry
        const dirReader = entry.createReader();
        const allFiles: File[] = [];
        
        // Function to read all directory contents
        const readEntries = () => {
          dirReader.readEntries(async (entries: any[]) => {
            if (entries.length === 0) {
              // No more entries, resolve with all files
              resolve(allFiles);
            } else {
              // Process each entry
              const entryPromises = entries.map(childEntry => {
                const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                return processEntry(childEntry, newPath);
              });
              
              const nestedFiles = await Promise.all(entryPromises);
              allFiles.push(...nestedFiles.flat());
              
              // Continue reading
              readEntries();
            }
          }, (error: any) => {
            console.error('Error reading directory:', error);
            resolve(allFiles);
          });
        };
        
        // Start reading
        readEntries();
      } else {
        // Neither file nor directory
        resolve([]);
      }
    });
  };

  // Get all files from a DataTransferItemList
  const getAllFilesFromDataTransferItems = async (items: DataTransferItemList): Promise<File[]> => {
    const filePromises: Promise<File[]>[] = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Skip non-file entries
      if (item.kind !== 'file') {
        continue;
      }
      
      // Get entry (works in Chrome, Firefox, Edge)
      // @ts-ignore - TypeScript doesn't know about webkitGetAsEntry
      const webkitEntry = item.webkitGetAsEntry && item.webkitGetAsEntry();
      if (webkitEntry) {
        filePromises.push(processEntry(webkitEntry));
      } else {
        // Fallback for browsers without entry API
        const file = item.getAsFile();
        if (file) {
          filePromises.push(Promise.resolve([file]));
        }
      }
    }
    
    const fileGroups = await Promise.all(filePromises);
    return fileGroups.flat();
  };

  // Convert HEIC file to JPEG before upload
  const convertHeicToJpeg = async (file: File): Promise<File> => {
    // Only convert if it's a HEIC file
    if (!file.name.toLowerCase().endsWith('.heic') && 
        !file.type.toLowerCase().includes('image/heic')) {
      return file;
    }
    
    try {
      console.log(`Converting HEIC file: ${file.name} to JPEG`);
      setIsUploading(true);
      
      // Create a toast notification
      showToast(`Converting ${file.name} to JPG format...`, "success");
      
      // Convert HEIC to JPEG using heic2any library
      const jpegBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.9  // Maintain good quality
      }) as Blob;
      
      // Create new file name (replace .heic with .jpg)
      const newFileName = file.name.replace(/\.heic$/i, '.jpg');
      
      // Create a new File object from the JPEG blob
      const jpegFile = new File(
        [jpegBlob], 
        newFileName, 
        { type: 'image/jpeg', lastModified: file.lastModified }
      );
      
      console.log(`Successfully converted ${file.name} to ${jpegFile.name}`);
      showToast(`Successfully converted ${file.name} to JPG format`, "success");
      
      return jpegFile;
    } catch (error) {
      console.error(`Error converting HEIC file: ${file.name}`, error);
      showToast(`Failed to convert ${file.name} to JPG. Uploading original file.`, "error");
      
      // Return the original file if conversion fails
      return file;
    }
  };
  
  // Process files to convert any HEIC files to JPEG before upload
  const processFilesBeforeUpload = async (files: File[]): Promise<File[]> => {
    if (!files || files.length === 0) return files;
    
    try {
      const processedFiles: File[] = [];
      
      // Process each file - convert HEIC to JPEG
      for (const file of files) {
        try {
          // Check if it's a HEIC file
          if (file.name.toLowerCase().endsWith('.heic') || 
              file.type.toLowerCase().includes('image/heic')) {
            // Convert HEIC to JPEG
            const jpegFile = await convertHeicToJpeg(file);
            processedFiles.push(jpegFile);
          } else {
            // Not a HEIC file, keep as is
            processedFiles.push(file);
          }
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
          // Add the original file if there's an error
          processedFiles.push(file);
        }
      }
      
      return processedFiles;
    } catch (error) {
      console.error('Error processing files before upload:', error);
      // Return original files if there's an error in the overall process
      return files;
    }
  };

  // Handle file upload logic - single or batch
  const handleFileUpload = async (files: File[]) => {
    if (!files || files.length === 0 || !hasUploadPermission()) {
      console.warn("No files to upload or no permission");
      return;
    }

    console.log(`Starting upload of ${files.length} files`);
    
    try {
      setIsUploading(true);
      setUploadProgress(0);

      // Process files - convert HEIC to JPEG
      const processedFiles = await processFilesBeforeUpload(files);

      // Determine the target folder ID - use currentFolder.id if in a folder,
      // use rootFolder.id if at project level with an invisible root folder,
      // or null/undefined if uploading directly to root with no folder
      const targetFolderId = currentFolder?.id || (rootFolder?.id);
      
      if (processedFiles.length === 1) {
        // Single file upload - unchanged
        const file = processedFiles[0];
        const fileName = file.name;
        
        // Determine file type from extension
        let fileType: "pdf" | "dwg" | "other" | "image" = "other";
        const extension = file.name.split('.').pop()?.toLowerCase();
              if (extension === 'pdf') {
        fileType = "pdf";
      } else if (extension === 'dwg') {
        fileType = "dwg";
      } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'heic'].includes(extension || '')) {
        fileType = "image";
        }
        
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            const newProgress = prev + 10;
            return newProgress >= 90 ? 90 : newProgress;
          });
        }, 300);
        
        try {
          if (onCreateDocument) {
            await onCreateDocument(fileName, fileType, file, targetFolderId);
            setUploadedFiles(prev => ({...prev, success: prev.success + 1}));
            showToast(`File "${fileName}" uploaded successfully`, "success");
          } else {
            throw new Error("Document creation is not available");
          }
        } catch (error) {
          setUploadedFiles(prev => ({...prev, failed: prev.failed + 1}));
          throw error;
        } finally {
          clearInterval(progressInterval);
          setUploadProgress(100);
        }
      } else if (onCreateMultipleDocuments) {
        // Try to use the batch upload if available
        console.log(`Uploading ${processedFiles.length} files using batch method`);
        
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            const newProgress = prev + 5;
            return newProgress >= 90 ? 90 : newProgress;
          });
        }, 300);
        
        try {
          // Pass the targetFolderId which might be undefined for root directory
          await onCreateMultipleDocuments(processedFiles, targetFolderId);
          setUploadedFiles(prev => ({...prev, success: processedFiles.length}));
          showToast(`${processedFiles.length} files uploaded successfully`, "success");
        } catch (error) {
          console.error("Error in multiple file upload:", error);
          console.log("Falling back to individual file upload method");
          clearInterval(progressInterval);
          
          // If batch upload fails, fall back to individual upload
          return handleMultipleFileUpload(processedFiles);
        } finally {
          clearInterval(progressInterval);
          setUploadProgress(100);
        }
      } else {
        // No multiple document upload handler available
        console.log("Multiple document batch upload not available, using individual upload method");
        return handleMultipleFileUpload(processedFiles);
      }
      
      if (onRefresh) {
        await onRefresh();
      }
      
      // Keep the progress bar at 100% for a moment before closing
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 800);
      
    } catch (error) {
      console.error("Error uploading file(s):", error);
      showToast("Failed to upload files", "error");
      
      // Still set to 100% and close after a delay
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 800);
    }
  };

  // Handle drop event - process files from DataTransfer
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Skip file processing if we're in document viewer
    if (selectedDocument) {
      return;
    }
    
    // Only proceed if user has upload permission
    if (!hasUploadPermission()) {
      showToast("You don't have permission to upload files in this folder", "error");
      return;
    }
    
    setIsDragging(false);
    setShowDragOverlay(false);
    dragCounter.current = 0;
    
    // Check if we have items (for folder support)
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      try {
        console.log(`Processing ${e.dataTransfer.items.length} dropped items (may include folders)`);
        
        // Show loading state
        setIsUploading(true);
        setUploadProgress(10); // Initial progress
        setUploadedFiles({
          total: 0,  // We don't know the total yet
          success: 0,
          failed: 0
        });
        
        // Get all files including those in folders
        const allFiles = await getAllFilesFromDataTransferItems(e.dataTransfer.items);
        
        console.log(`Found ${allFiles.length} files in the dropped items`);
        
        // Update total file count
        setUploadedFiles(prev => ({
          ...prev,
          total: allFiles.length
        }));
        
        // Now process all the files
        if (allFiles.length === 0) {
          showToast("No valid files found in the dropped items", "error");
          setIsUploading(false);
          return;
        }
        
        // Check if we have path information (from folders)
        const hasPathInfo = allFiles.some(file => 'path' in file);
        
        if (hasPathInfo) {
          // Files from folders - handle them individually
          await handleMultipleFileUpload(allFiles);
        } else if (allFiles.length === 1) {
          // Single file
          handleFileUpload(allFiles);
        } else {
          // Multiple files
          if (onCreateMultipleDocuments) {
            handleFileUpload(allFiles);
          } else {
            handleMultipleFileUpload(allFiles);
          }
        }
        
      } catch (error) {
        console.error("Error processing dropped items:", error);
        showToast("Failed to process dropped items", "error");
        setIsUploading(false);
      }
    } 
    // Fallback to regular file handling
    else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      console.log(`Processing ${droppedFiles.length} dropped files (legacy method)`);
      
      // Reset counters and prepare for upload
      setDraggedFileCount(0);
      setUploadedFiles({
        total: droppedFiles.length,
        success: 0,
        failed: 0
      });
      
      // Process the files for upload - HEIC files will be automatically converted by handleFileUpload
      if (droppedFiles.length === 1) {
        handleFileUpload(droppedFiles);
      } else {
        if (onCreateMultipleDocuments) {
          handleFileUpload(droppedFiles);
        } else {
          handleMultipleFileUpload(droppedFiles);
        }
      }
    } else {
      console.warn("Drop event contained no files or folders");
    }
    
    // Clear the data transfer object
    e.dataTransfer.clearData();
  };

  // Replace the folder creation part inside handleMultipleFileUpload
  // Create a new folder and return its ID directly
  const createFolderAndGetId = async (name: string, parentId?: string): Promise<string | undefined> => {
    try {
      console.log(`Creating folder "${name}" in parent: ${parentId || 'root'}`);
      
      // First check if folder already exists to avoid duplication
      const existingFolder = folders.find(f => 
        f.name === name && f.parentId === parentId
      );
      
      if (existingFolder) {
        console.log(`Folder "${name}" already exists with ID: ${existingFolder.id}`);
        return existingFolder.id;
      }
      
      // Call onCreateFolder which doesn't return the ID
      await onCreateFolder(name, parentId);
      console.log(`Folder "${name}" creation initiated, waiting for completion...`);
      
      // Give Firebase a moment to complete the operation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to refresh the folder list
      if (onRefresh) {
        await onRefresh();
        console.log("Local folder list refreshed");
      }
      
      // First try to find the folder in local state (may have been updated by refresh)
      let newFolder = folders.find(f => 
        f.name === name && f.parentId === parentId
      );
      
      if (newFolder) {
        console.log(`Found newly created folder in local state: ${newFolder.id}`);
        return newFolder.id;
      }
      
      // If not found locally, try to fetch directly from Firebase
      console.log("Folder not found in local state, querying Firebase directly...");
      
      // Query Firestore directly to find the newly created folder
      const foldersRef = collection(db, 'folders');
      let folderQuery = query(
        foldersRef,
        where('name', '==', name),
        where('parentId', '==', parentId || null),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      
      try {
        const querySnapshot = await getDocs(folderQuery);
        
        if (!querySnapshot.empty) {
          const folderDoc = querySnapshot.docs[0];
          console.log(`Found folder directly in Firebase: ${folderDoc.id}`);
          return folderDoc.id;
        }
        
        // If still not found, try a more lenient search
        console.log("Folder not found with exact criteria, trying broader search...");
        
        // Try just by name (in case parentId is different)
        folderQuery = query(
          foldersRef,
          where('name', '==', name),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        
        const nameSnapshot = await getDocs(folderQuery);
        
        if (!nameSnapshot.empty) {
          // Log all found folders for debugging
          nameSnapshot.docs.forEach(doc => {
            const data = doc.data();
            console.log(`Found folder by name: ${doc.id}, parentId: ${data.parentId}, createdAt: ${data.createdAt}`);
          });
          
          // Use the first one
          const folderDoc = nameSnapshot.docs[0];
          console.log(`Using folder found by name search: ${folderDoc.id}`);
          return folderDoc.id;
        }
        
        console.error(`Failed to find newly created folder "${name}" even after Firebase query`);
        return undefined;
      } catch (queryError) {
        console.error("Error querying Firebase for folder:", queryError);
        return undefined;
      }
    } catch (error) {
      console.error(`Error creating folder "${name}":`, error);
      return undefined;
    }
  };

  // Update the folder creation section in handleMultipleFileUpload
  const handleMultipleFileUpload = async (files: File[]) => {
    if (!files || files.length === 0 || !hasUploadPermission()) {
      console.warn("No files to upload or no permission");
      return;
    }

    // Process files - convert HEIC to JPEG
    const processedFiles = await processFilesBeforeUpload(files);

    // Determine the target folder ID - use currentFolder.id if in a folder,
    // use rootFolder.id if at project level with an invisible root folder,
    // or undefined if uploading directly to root with no folder
    const targetFolderId = currentFolder?.id || (rootFolder?.id);
    
    console.log(`Processing ${processedFiles.length} files individually to ${targetFolderId ? `folder ${targetFolderId}` : 'root directory'}`);
    setIsUploading(true);
    setUploadProgress(0);
    
    // Reset counters if not already set
    setUploadedFiles(prev => {
      if (prev.total !== processedFiles.length) {
        return {
          total: processedFiles.length,
          success: 0,
          failed: 0
        };
      }
      return prev;
    });
    
    // Create a mapping of folder paths to folder IDs
    // This will help us track created folders for faster lookup
    const folderPathMap: Record<string, string> = {};
    
    // Process each file individually
    let successCount = 0;
    let failCount = 0;
    
    // Calculate progress increment per file
    const progressIncrement = 100 / processedFiles.length;
    
    for (let i = 0; i < processedFiles.length; i++) {
      const file = processedFiles[i];
      const fileName = file.name;
      
      // Check if the file should be skipped (e.g., system files, .DS_Store)
      const skipPatterns = ['.DS_Store', 'Thumbs.db', '.git'];
      const shouldSkip = skipPatterns.some(pattern => fileName.includes(pattern));
      
      if (shouldSkip) {
        console.log(`Skipping system file: ${fileName}`);
        setUploadProgress(Math.min(((i + 1) * progressIncrement), 100));
        continue;
      }
      
      // Determine file type from extension
      let fileType: "pdf" | "dwg" | "other" | "image" = "other";
      const extension = fileName.split('.').pop()?.toLowerCase();
      
      if (extension === 'pdf') {
        fileType = "pdf";
      } else if (extension === 'dwg') {
        fileType = "dwg";
      } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'heic'].includes(extension || '')) {
        fileType = "image";
      } else {
        // Check if it's a valid document file
        const validExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf'];
        if (!validExtensions.includes(extension || '') && extension !== undefined) {
          console.warn(`File with extension .${extension} may not be supported: ${fileName}`);
        }
      }
      
      try {
        // Check if file has path information (from folder upload)
        let uploadTargetFolderId = targetFolderId; // Use the parent-determined folder ID by default
        
        if ('path' in file) {
          const filePath = (file as any).path;
          console.log(`Processing file with path: ${filePath}`);
          
          // Extract folder structure from path
          const pathParts = filePath.split('/');
          
          // If we have a path with folders
          if (pathParts.length > 1) {
            // Remove the filename from the path
            const folderPath = pathParts.slice(0, -1).join('/');
            const displayName = pathParts[pathParts.length - 1]; // The file name
            
            // Check if we've already created this folder path
            if (folderPathMap[folderPath]) {
              // Use the existing folder ID
              uploadTargetFolderId = folderPathMap[folderPath];
              console.log(`Using existing folder at path ${folderPath} with ID: ${uploadTargetFolderId}`);
            } else {
              // Need to create the folder structure
              console.log(`Creating folder structure for: ${folderPath}`);
              
              let currentPathId = targetFolderId; // Start from the parent folder (might be undefined for root)
              // Build the folder structure one level at a time
              for (let j = 0; j < pathParts.length - 1; j++) {
                const folderName = pathParts[j];
                const folderPathSoFar = pathParts.slice(0, j + 1).join('/');
                
                // Check if this segment is already created
                if (folderPathMap[folderPathSoFar]) {
                  currentPathId = folderPathMap[folderPathSoFar];
                  continue;
                }
                
                // Look for an existing folder with this name in the current folder
                const existingFolder = folders.find(f => 
                  f.name === folderName && f.parentId === currentPathId
                );
                
                if (existingFolder) {
                  // Use existing folder
                  currentPathId = existingFolder.id;
                  // Only store if we have a valid ID
                  if (currentPathId) {
                    folderPathMap[folderPathSoFar] = currentPathId;
                    console.log(`Found existing folder "${folderName}" with ID: ${existingFolder.id}`);
                  }
                } else {
                  // Create a new folder and get its ID directly
                  const newFolderId = await createFolderAndGetId(folderName, currentPathId);
                  
                  if (newFolderId) {
                    currentPathId = newFolderId;
                    folderPathMap[folderPathSoFar] = newFolderId;
                    console.log(`Created and mapped folder "${folderName}" with ID: ${newFolderId}`);
                  } else {
                    console.warn(`Failed to create/find folder "${folderName}", will upload to parent folder instead`);
                    // Stop here and use the parent folder we've reached so far
                    break;
                  }
                }
              }
              
              // Set the target folder ID to the deepest folder we were able to create
              // Only if currentPathId is valid
              if (currentPathId) {
                uploadTargetFolderId = currentPathId;
                folderPathMap[folderPath] = currentPathId;
              }
            }
            
            // Now upload the file to the correct folder
            console.log(`Uploading file "${displayName}" to folder ID: ${uploadTargetFolderId || 'root folder'}`);
            if (onCreateDocument) {
              await onCreateDocument(displayName, fileType, file, uploadTargetFolderId);
            } else {
              throw new Error("Document creation is not available");
            }
          } else {
            // No folders in path, just upload the file
            if (onCreateDocument) {
              await onCreateDocument(fileName, fileType, file, uploadTargetFolderId);
            } else {
              throw new Error("Document creation is not available");
            }
          }
        } else {
          // No path information, just upload the file to current folder or root folder
          if (onCreateDocument) {
            await onCreateDocument(fileName, fileType, file, uploadTargetFolderId);
          } else {
            throw new Error("Document creation is not available");
          }
        }
        
        successCount++;
        setUploadedFiles(prev => ({
          ...prev, 
          success: prev.success + 1
        }));
      } catch (error) {
        console.error(`Error uploading file ${fileName}:`, error);
        failCount++;
        setUploadedFiles(prev => ({
          ...prev, 
          failed: prev.failed + 1
        }));
      }
      
      // Update progress after each file
      setUploadProgress(Math.min(((i + 1) * progressIncrement), 100));
    }
    
    // Show completion message
    if (successCount > 0) {
      showToast(`${successCount} of ${processedFiles.length} files uploaded successfully`, 
        failCount > 0 ? "error" : "success");
    } else {
      showToast("Failed to upload any files", "error");
    }
    
    // Refresh the document list
    if (onRefresh) {
      await onRefresh();
    }
    
    // Keep the progress bar at 100% for a moment before closing
    setTimeout(() => {
      setIsUploading(false);
      setUploadProgress(0);
    }, 800);
  };

    const renderUploadButtons = () => {
      if (!hasUploadPermission()) {
        return null;
      }
      
      // Create a properly typed wrapper function that always returns a function, never undefined
      const createDocumentHandler = onCreateDocument ? 
        (name: string, type: "pdf" | "dwg" | "other" | "image", file: File, folderId?: string) => 
          onCreateDocument(name, type, file, folderId) : 
        // Fallback implementation that shows an error message
        ((name: string, type: "pdf" | "dwg" | "other" | "image", file: File, folderId?: string): Promise<void> => {
          showToast("Document creation is not available", "error");
          return Promise.reject(new Error("Document creation is not available"));
        }) as (name: string, type: "pdf" | "dwg" | "other" | "image", file: File, folderId?: string) => Promise<void>;
      
      // Modified to allow uploads to root directory by passing optional folder IDs
      return (
        <DocumentActions
          projectId={projectId}
          currentFolderId={currentFolder?.id}
          rootFolderId={rootFolder?.id}
          folders={folders}
          onCreateFolder={onCreateFolder}
          onCreateDocument={createDocumentHandler}
          onCreateMultipleDocuments={onCreateMultipleDocuments}
          onRefresh={onRefresh}
          onShare={onShare}
          allowRootUploads={true} // Enable uploads to root directory
        />
      );
    };

  // Get sort by label for display
  const getSortByLabel = () => {
    switch (sortBy) {
      case 'dateModified':
        return 'Date Modified';
      case 'dateCreated':
        return 'Date Added';
      default:
        return 'Name';
    }
  };

  // Add effect to close sort dropdown when clicking outside
  useEffect(() => {
    const handleClickOutsideSort = (event: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutsideSort);
    return () => document.removeEventListener('mousedown', handleClickOutsideSort);
  }, []);

  // Use the initial documents as the starting point
  useEffect(() => {
    setLocalDocuments(documents);
  }, [documents]);

  // Setup real-time document subscription
  useEffect(() => {
    // Handle subscription for root folder when at top level
    if (!currentFolder && rootFolder && !isSharedView) {
      // Cleanup any existing subscription
      if (unsubscribeDocRef.current) {
        console.log('[Document List] Cleaning up document subscription due to folder change');
        unsubscribeDocRef.current();
        unsubscribeDocRef.current = null;
        hasActiveDocSubscription.current = false;
      }

      console.log(`[Document List] Setting up real-time document subscription for root folder: ${rootFolder.id}`);
      setRootLoading(true);

      try {
        // Set up the subscription for the root folder
        const unsubscribe = subscribeToFolderDocuments(rootFolder.id, (updatedDocuments) => {
          console.log(`[Document List] Received ${updatedDocuments.length} documents from real-time update for root folder`);
          setLocalDocuments(updatedDocuments);
          setRootLoading(false);
        });

        // Store the unsubscribe function
        unsubscribeDocRef.current = unsubscribe;
        hasActiveDocSubscription.current = true;
      } catch (error) {
        console.error(`[Document List] Error setting up document subscription for root folder ${rootFolder.id}:`, error);
        
        // If subscription fails, try to get documents directly as fallback
        documentService.getByFolderId(rootFolder.id)
          .then(docs => {
            console.log(`[Document List] Fallback loading retrieved ${docs.length} documents for root folder`);
            setLocalDocuments(docs);
            setRootLoading(false);
          })
          .catch(err => {
            console.error('[Document List] Fallback document loading failed for root folder:', err);
            setRootLoading(false);
          });
      }

      return () => {
        if (unsubscribeDocRef.current) {
          console.log('[Document List] Cleaning up root folder document subscription');
          unsubscribeDocRef.current();
          unsubscribeDocRef.current = null;
          hasActiveDocSubscription.current = false;
        }
      };
    }
    
    // Only set up subscription if we have a currentFolder and we're not in shared view
    if (!currentFolder || isSharedView) {
      // Cleanup any existing subscription
      if (unsubscribeDocRef.current) {
        console.log('[Document List] Cleaning up document subscription due to folder change');
        unsubscribeDocRef.current();
        unsubscribeDocRef.current = null;
        hasActiveDocSubscription.current = false;
      }
      return;
    }

    // Don't create multiple subscriptions for the same folder
    if (hasActiveDocSubscription.current && unsubscribeDocRef.current) {
      console.log(`[Document List] Already have an active subscription for this folder`);
      return;
    }

    console.log(`[Document List] Setting up real-time document subscription for folder: ${currentFolder.id}`);

    try {
      // Set up the subscription
      const unsubscribe = subscribeToFolderDocuments(currentFolder.id, (updatedDocuments) => {
        console.log(`[Document List] Received ${updatedDocuments.length} documents from real-time update`);

        // Update local state with the latest documents
        setLocalDocuments(updatedDocuments);
      });

      // Store the unsubscribe function
      unsubscribeDocRef.current = unsubscribe;
      hasActiveDocSubscription.current = true;
    } catch (error) {
      console.error(`[Document List] Error setting up document subscription for folder ${currentFolder.id}:`, error);
      
      // If subscription fails, try to get documents directly as fallback
      documentService.getByFolderId(currentFolder.id)
        .then(docs => {
          console.log(`[Document List] Fallback loading retrieved ${docs.length} documents`);
          setLocalDocuments(docs);
        })
        .catch(err => console.error('[Document List] Fallback document loading failed:', err));
    }

    // Cleanup on unmount or when the folder changes
    return () => {
      if (unsubscribeDocRef.current) {
        console.log('[Document List] Cleaning up document subscription');
        unsubscribeDocRef.current();
        unsubscribeDocRef.current = null;
        hasActiveDocSubscription.current = false;
      }
    };
  }, [currentFolder, rootFolder, isSharedView]);
  
  // Setup folder subscription for real-time updates
  useEffect(() => {
    if (projectId && !isSharedView) {
      // Clean up any existing subscription first
      if (unsubscribeFolderRef.current) {
        unsubscribeFolderRef.current();
        unsubscribeFolderRef.current = null;
        hasActiveFolderSubscription.current = false;
      }
      
      console.log(`Setting up real-time folder subscription for project ${projectId}`);
      
      // Set up the new subscription
      const unsubscribe = subscribeToProjectFolders(projectId, (updatedFolders) => {
        console.log(`Received ${updatedFolders.length} folders in real-time update`);
        
        // Force a fresh sort based on the current sort settings to ensure new items appear correctly
        const sortedFolders = [...updatedFolders].sort((a, b) => {
          // Apply current sort settings
          if (sortBy === 'name') {
            const result = a.name.localeCompare(b.name);
            return sortOrder === 'asc' ? result : -result;
          } else if (sortBy === 'dateModified') {
            // Use the lastUpdated field from metadata
            const aDate = a.metadata?.lastUpdated ? new Date(a.metadata.lastUpdated).getTime() : 0;
            const bDate = b.metadata?.lastUpdated ? new Date(b.metadata.lastUpdated).getTime() : 0;
            return sortOrder === 'asc' ? aDate - bDate : bDate - aDate;
          } else {
            // For dateCreated, we don't have that in the Folder type, fallback to name
            return sortBy === 'dateCreated' ? 
              (sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)) : 
              0;
          }
        });
        
        setLocalFolders(sortedFolders);
        
        // Force document refresh if current folder was modified
        if (currentFolder && sortedFolders.some(f => f.id === currentFolder.id)) {
          console.log(`Current folder ${currentFolder.id} found in update, refreshing documents`);
          triggerDocumentUpdate(currentFolder.id);
        }
      });
      
      unsubscribeFolderRef.current = unsubscribe;
      hasActiveFolderSubscription.current = true;
      
      // Clean up subscription on unmount
      return () => {
        if (unsubscribeFolderRef.current) {
          console.log('Cleaning up folder subscription on unmount');
          unsubscribeFolderRef.current();
          unsubscribeFolderRef.current = null;
          hasActiveFolderSubscription.current = false;
        }
      };
    }
  }, [projectId, isSharedView, currentFolder, sortBy, sortOrder]);
  
  // Listen for folder update events (like when folders are copied)
  useEffect(() => {
    const handleFolderUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { projectId: updatedProjectId, folderId, action } = customEvent.detail;
      
      console.log(`Received folder ${action} event for project ${updatedProjectId}${folderId ? `, folder ${folderId}` : ''}`);
      
      // Refresh once for copy and move operations regardless of subscription status
      if (action === 'copy' || action === 'move') {
        console.log(`Folder ${action} operation detected - performing single refresh`);
        if (onRefresh) {
          onRefresh();
        }
        
        // If we're in the folder that was moved, navigate back to root
        if (action === 'move' && currentFolder && folderId === currentFolder.id) {
          console.log('Current folder was moved, navigating to root');
          onFolderSelect(undefined);
        }
        return;
      }
      
      // For other operations, refresh only if this is our current project and we don't have an active subscription
      if (updatedProjectId === projectId && !hasActiveFolderSubscription.current) {
        if (onRefresh) {
          console.log('Manually refreshing folders after update event');
          onRefresh();
        }
      }
    };
    
    document.addEventListener(FOLDER_UPDATE_EVENT, handleFolderUpdate as EventListener);
    
    return () => {
      document.removeEventListener(FOLDER_UPDATE_EVENT, handleFolderUpdate as EventListener);
    };
  }, [projectId, onRefresh, currentFolder, onFolderSelect]);
  
  // Listen for document update events from other sources
  useEffect(() => {
    const handleDocumentUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { folderId, source } = customEvent.detail;

      console.log(`[Document List] Document update event received from ${source}:`, customEvent.detail);

      // If this update is for our current folder, refresh
      if (currentFolder && folderId === currentFolder.id) {
        console.log(`[Document List] Updating for folder match: ${folderId}`);
        if (onRefresh) {
          onRefresh();
        }
      }
    };

    // Listen for both notification updates and direct document updates
    document.addEventListener(NOTIFICATION_DOCUMENT_UPDATE_EVENT, handleDocumentUpdate);
    document.addEventListener(DOCUMENT_UPDATE_EVENT, handleDocumentUpdate);

    return () => {
      document.removeEventListener(NOTIFICATION_DOCUMENT_UPDATE_EVENT, handleDocumentUpdate);
      document.removeEventListener(DOCUMENT_UPDATE_EVENT, handleDocumentUpdate);
    };
  }, [currentFolder, onRefresh]);

  // When files are uploaded or deleted, set up listeners for the events
  useEffect(() => {
    // Only add these event listeners when we're in a folder
    if (!currentFolder) return;

    // Define handler for successful file operations
    const handleFileOperationSuccess = () => {
      console.log(`[Document List] File operation completed, triggering update for folder: ${currentFolder.id}`);

      // Trigger document update event
      triggerDocumentUpdate(currentFolder.id);

      // Also call onRefresh if available
      if (onRefresh) {
        onRefresh();
      }
    };

    // Define custom events for file operations
    const FILE_UPLOAD_SUCCESS_EVENT = 'document-upload-success';
    const FILE_DELETE_SUCCESS_EVENT = 'document-delete-success';

    // Add event listeners
    document.addEventListener(FILE_UPLOAD_SUCCESS_EVENT, handleFileOperationSuccess);
    document.addEventListener(FILE_DELETE_SUCCESS_EVENT, handleFileOperationSuccess);

    // Return cleanup function
    return () => {
      document.removeEventListener(FILE_UPLOAD_SUCCESS_EVENT, handleFileOperationSuccess);
      document.removeEventListener(FILE_DELETE_SUCCESS_EVENT, handleFileOperationSuccess);
    };
  }, [currentFolder, onRefresh]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const isPdf = (doc?: Document) => {
    if (!doc) return false;
    const extension = doc.name.split('.').pop()?.toLowerCase();
    return extension === 'pdf' || (doc.metadata?.contentType === 'application/pdf');
  };
  
  const isHeic = (doc?: Document) => {
    if (!doc) return false;
    const extension = doc.name.split('.').pop()?.toLowerCase();
    return extension === 'heic' || (doc.metadata?.contentType === 'image/heic');
  };
  
  // Function to check if the document is a video
  const isVideo = (doc?: Document) => {
    if (!doc) return false;
    
    // Check file extension
    const extension = doc.name.split('.').pop()?.toLowerCase();
    const videoExtensions = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'wmv', 'flv', 'mkv'];
    
    // Check content type if available
    const contentType = doc.metadata?.contentType;
    const isVideoContentType = contentType ? contentType.startsWith('video/') : false;
    
    return videoExtensions.includes(extension || '') || isVideoContentType;
  };
  
  // Function to check if the document is an image
  const isImage = (doc?: Document) => {
    if (!doc) return false;
    
    // Check file extension
    const extension = doc.name.split('.').pop()?.toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    
    // Check content type if available
    const contentType = doc.metadata?.contentType;
    const isImageContentType = contentType ? contentType.startsWith('image/') && contentType !== 'image/heic' : false;
    
    return imageExtensions.includes(extension || '') || isImageContentType;
  };
  
  // Function to generate thumbnail URL - uses the actual document URL for images
  const getThumbnailUrl = (doc: Document) => {
    return doc.url;
  };
  
  // State for hover preview
  const [hoveredImageDoc, setHoveredImageDoc] = useState<Document | null>(null);
  const [showPreviewPopup, setShowPreviewPopup] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Mouse enter handler for image thumbnails
  const handleImageMouseEnter = (doc: Document, e: React.MouseEvent) => {
    setHoveredImageDoc(doc);
    setIsPreviewLoading(true);
    
    // Calculate position based on mouse coordinates
    const x = e.clientX;
    const y = e.clientY;
    
    updatePreviewPosition(x, y);
    
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    // Set a timeout to show the preview after 0.5 seconds
    hoverTimeoutRef.current = setTimeout(() => {
      setShowPreviewPopup(true);
    }, 500);
  };
  
  // Helper function to calculate and update preview position with boundary checks
  const updatePreviewPosition = (x: number, y: number) => {
    const previewWidth = 240;
    const previewHeight = 240;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate position (initially to the right and slightly above the cursor)
    let posX = x + 20;
    let posY = y - 50;
    
    // Check right boundary
    if (posX + previewWidth > viewportWidth) {
      // If it would go off the right edge, position it to the left of the cursor
      posX = x - previewWidth - 20;
    }
    
    // Check left boundary (in case the above adjustment pushed it too far left)
    if (posX < 0) {
      // If it would go off the left edge, align with left edge with small margin
      posX = 10;
    }
    
    // Check bottom boundary
    if (posY + previewHeight > viewportHeight) {
      // If it would go off the bottom, position it higher
      posY = viewportHeight - previewHeight - 10;
    }
    
    // Check top boundary
    if (posY < 0) {
      // If it would go off the top, align with top edge with small margin
      posY = 10;
    }
    
    // Update the position state
    setPreviewPosition({ x: posX, y: posY });
  };
  
  // Mouse move handler to update preview position
  const handleImageMouseMove = (e: React.MouseEvent) => {
    if (hoveredImageDoc) {
      // Calculate position based on mouse coordinates
      const x = e.clientX;
      const y = e.clientY;
      
      updatePreviewPosition(x, y);
    }
  };
  
  // Function to close the image preview popup
  const closeImagePreview = () => {
    setShowPreviewPopup(false);
    setHoveredImageDoc(null);
    
    // Clear any existing hover timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };
  
  // Mouse leave handler for image thumbnails
  const handleImageMouseLeave = () => {
    closeImagePreview();
  };
  
  // Find the Layout component ref or context to update its state when fullscreen changes
  useEffect(() => {
    // Make any adjustments to the parent Layout needed when fullscreen changes
    console.log("PDF fullscreen mode:", isFullscreen);
    
    // Extra cleanup or adjustments can go here
    return () => {
      if (isFullscreen) {
        setIsFullscreen(false);
      }
    };
  }, [isFullscreen]);

  // Update state for copy/move dialog
  const [showCopyMoveDialog, setShowCopyMoveDialog] = useState(false);
  const [folderToCopyOrMove, setFolderToCopyOrMove] = useState<{id: string, name: string} | null>(null);
  const [documentToCopyOrMove, setDocumentToCopyOrMove] = useState<{id: string, name: string} | null>(null);
  const [copyMoveAction, setCopyMoveAction] = useState<'copy' | 'move'>('copy');
  const [destinationFolder, setDestinationFolder] = useState("");
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isCopyingOrMoving, setIsCopyingOrMoving] = useState(false);
  const [projectFolders, setProjectFolders] = useState<{[projectId: string]: Folder[]}>({});
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [selectedDestinationProjectId, setSelectedDestinationProjectId] = useState("");
  const [selectedDestinationFolderId, setSelectedDestinationFolderId] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  
  // Toggle folder expansion in the folder tree
  const toggleFolderExpansion = (folderId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    
    setExpandedFolders(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(folderId)) {
        newExpanded.delete(folderId);
      } else {
        newExpanded.add(folderId);
      }
      return newExpanded;
    });
  };

  // Load available projects for the dropdown when the dialog opens
  useEffect(() => {
    if (showCopyMoveDialog) {
      const loadProjects = async () => {
        try {
          setIsLoadingProjects(true);
          
          // Fetch projects from Firebase based on user role
          let fetchedProjects: Project[] = [];
          if (user) {
            if (user.role === 'Staff' || user.role === 'Admin') {
              fetchedProjects = await projectService.getAll();
            } else {
              fetchedProjects = await projectService.getUserProjects(user.id);
            }
            
            // Filter out archived projects
            fetchedProjects = fetchedProjects.filter(project => project.status !== 'archived');
          }
          
          // If no projects were fetched but we have a selected project (that's not archived)
          if (fetchedProjects.length === 0 && selectedProject && selectedProject.status !== 'archived') {
            fetchedProjects = [selectedProject];
          }
          
          setAvailableProjects(fetchedProjects);
          
          // Set the current project as default if available and not archived
          if (selectedProject && selectedProject.status !== 'archived') {
            setSelectedDestinationProjectId(selectedProject.id);
            
            // Load the folders for this project
            await loadProjectFolders(selectedProject.id);
          } else if (fetchedProjects.length > 0) {
            // Set the first non-archived project as default
            setSelectedDestinationProjectId(fetchedProjects[0].id);
            
            // Load the folders for this project
            await loadProjectFolders(fetchedProjects[0].id);
          }
          
          setIsLoadingProjects(false);
        } catch (error) {
          console.error("Error loading projects:", error);
          showToast("Failed to load available projects", "error");
          setIsLoadingProjects(false);
        }
      };
      
      loadProjects();
    }
  }, [showCopyMoveDialog, selectedProject, user]);

  // Function to load folders for a given project
  const loadProjectFolders = async (projectId: string) => {
    if (!projectId) return;
    
    try {
      setIsLoadingFolders(true);
      
      // If we already have the folders for this project, don't reload
      if (projectFolders[projectId]) {
        setIsLoadingFolders(false);
        return;
      }
      
      // Fetch folders from Firebase using folderService
      const fetchedFolders = await folderService.getByProjectId(projectId);
      
      // Store the fetched folders in state
      setProjectFolders(prev => ({
        ...prev,
        [projectId]: fetchedFolders
      }));
      
      // Auto-expand _root folders that have children
      const rootFolders = fetchedFolders.filter(folder => 
        folder.parentId === undefined && folder.name === '_root' && 
        fetchedFolders.some(f => f.parentId === folder.id)
      );
      
      // Add all _root folders with children to expanded folders set
      setExpandedFolders(prev => {
        const newExpanded = new Set(prev);
        rootFolders.forEach(folder => {
          newExpanded.add(folder.id);
        });
        return newExpanded;
      });
      
      setIsLoadingFolders(false);
    } catch (error) {
      console.error(`Error loading folders for project ${projectId}:`, error);
      setIsLoadingFolders(false);
      showToast(`Failed to load folders for the selected project`, "error");
    }
  };
  
  // Handle project change in dropdown
  const handleDestinationProjectChange = async (projectId: string) => {
    setSelectedDestinationProjectId(projectId);
    setSelectedDestinationFolderId(""); // Reset folder selection
    setShowProjectDropdown(false);
    
    // Load folders for the selected project
    await loadProjectFolders(projectId);
    
    // Automatically show folder dropdown if there are folders
    const projectFoldersList = projectFolders[projectId] || [];
    const hasRootFoldersWithChildren = projectFoldersList.some(folder => 
      folder.parentId === undefined && 
      folder.name === '_root' && 
      projectFoldersList.some(f => f.parentId === folder.id)
    );
    
    if (hasRootFoldersWithChildren) {
      setShowFolderDropdown(true);
    }
  };
  
  // Handle folder selection
  const handleDestinationFolderSelect = (folderId: string) => {
    setSelectedDestinationFolderId(folderId);
    setShowFolderDropdown(false);
  };
  
  // Helper function to get folder name by ID
  const getFolderNameById = (folderId: string): string => {
    if (!folderId) return "Root";
    
    const folder = projectFolders[selectedDestinationProjectId]?.find(f => f.id === folderId);
    return folder ? (folder.name === '_root' ? 'Root' : folder.name) : "Unknown folder";
  };
  
  // Helper to build folder tree structure
  const buildFolderTree = (folders: Folder[], parentId?: string): Folder[] => {
    // If we're looking at the root level (parentId is undefined), filter root folders
    if (parentId === undefined) {
      // Get all root folders (folders with no parent)
      const rootFolders = folders.filter(folder => folder.parentId === parentId);
      
      // Only include '_root' folders that have children, or non-'_root' folders
      return rootFolders.filter(folder => {
        // If folder name is not '_root', always include it
        if (folder.name !== '_root') return true;
        
        // Only include '_root' (to be displayed as 'Root') folders that have at least one child folder
        return folders.some(f => f.parentId === folder.id);
      });
    }
    
    // For non-root levels, return all folders with the specified parent
    return folders.filter(folder => folder.parentId === parentId);
  };
  
  // Recursively render folder tree
  const renderFolderTree = (folders: Folder[], parentId?: string, level: number = 0) => {
    const folderItems = buildFolderTree(folders, parentId);
    
    return (
      <div style={{ marginLeft: level > 0 ? `${level * 16}px` : '0' }}>
        {folderItems.map(folder => {
          const hasChildren = folders.some(f => f.parentId === folder.id);
          const isExpanded = expandedFolders.has(folder.id);
          const displayName = folder.name === '_root' ? 'Root' : folder.name;
          
          return (
            <div key={folder.id}>
              <div
                className="flex items-center py-2 px-2 hover:bg-gray-100 rounded cursor-pointer truncate"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent event propagation
                  handleDestinationFolderSelect(folder.id);
                }}
              >
                <div className="flex items-center min-w-0 flex-1">
                  {hasChildren ? (
                    <button
                      className="mr-1 p-1 rounded-full hover:bg-gray-200 flex-shrink-0"
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation(); // Prevent event propagation
                        toggleFolderExpansion(folder.id, e);
                      }}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  ) : (
                    <span className="w-6 flex-shrink-0" />
                  )}
                  <FolderOpen className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                  <span className={`truncate ${selectedDestinationFolderId === folder.id ? 'font-medium text-blue-600' : 'text-gray-700'}`}>
                    {displayName}
                  </span>
                </div>
                {selectedDestinationFolderId === folder.id && (
                  <Check className="w-4 h-4 ml-2 flex-shrink-0 text-blue-600" />
                )}
              </div>
              
              {isExpanded && hasChildren && renderFolderTree(folders, folder.id, level + 1)}
            </div>
          );
        })}
      </div>
    );
  };
  
  // Define utility function for folder operations
  const emitFolderOperationSuccess = (action: 'copy' | 'move', folderId: string) => {
    triggerFolderOperationSuccess({
      action,
      folderId,
      projectId: projectId,
      source: 'documentList'
    });
    
    // Also trigger document update event for the folder to refresh its documents
    triggerDocumentUpdate(folderId);
  };
  
  // Add this function right after the loadProjectFolders function
  const forceReloadFolders = async (targetProjectId?: string) => {
    try {
      console.log(`[DocumentList] Force reloading folders for project ${targetProjectId || projectId}`);
      
      // Set loading state to true
      setLoading(true);
      setIsReloading(true);
      
      // If a specific project ID is provided, load those folders
      if (targetProjectId) {
        const freshFolders = await folderService.getByProjectId(targetProjectId);
        
        // If this is the current project, update local folders
        if (targetProjectId === projectId) {
          console.log(`[DocumentList] Updating local folders with ${freshFolders.length} items`);
          setLocalFolders(freshFolders);
        }
        
        // Also update the project folders cache
        setProjectFolders(prev => ({
          ...prev,
          [targetProjectId]: freshFolders
        }));
      } 
      // Otherwise reload current project folders
      else if (projectId) {
        const freshFolders = await folderService.getByProjectId(projectId);
        console.log(`[DocumentList] Updating local folders with ${freshFolders.length} items`);
        setLocalFolders(freshFolders);
      }
      
      // Also call the parent refresh if available
      if (onRefresh) {
        console.log(`[DocumentList] Calling parent refresh`);
        await onRefresh();
      }
    } catch (error) {
      console.error("Error force reloading folders:", error);
      showToast("Failed to reload folders", "error");
    } finally {
      // Set loading state back to false
      setLoading(false);
      setIsReloading(false);
    }
  };
  
  // Force reload documents for a specific folder
  const forceReloadDocuments = async (folderId: string) => {
    try {
      console.log(`[DocumentList] Force reloading documents for folder ${folderId}`);
      
      // Set loading state to true
      setLoading(true);
      setIsReloading(true);
      
      // Fetch fresh documents from the service
      const freshDocuments = await documentService.getByFolderId(folderId);
      console.log(`[DocumentList] Loaded ${freshDocuments.length} documents for folder ${folderId}`);
      
      // Update local state if this is the current folder
      if (currentFolder && currentFolder.id === folderId) {
        console.log(`[DocumentList] Updating documents for current folder`);
        setLocalDocuments(freshDocuments);
      }
      
      // Also call the parent refresh if available
      if (onRefresh) {
        console.log(`[DocumentList] Calling parent refresh after document reload`);
        await onRefresh();
      }
      
      return freshDocuments;
    } catch (error) {
      console.error(`Error force reloading documents for folder ${folderId}:`, error);
      showToast("Failed to reload documents", "error");
      return [];
    } finally {
      // Set loading state back to false
      setLoading(false);
      setIsReloading(false);
    }
  };
  
  const copyOrMoveFolder = async (source_folder: string, destination_project_id: string, destination_folder: string, action: 'move' | 'copy') => {
    try {
      // Set loading state to true when operation starts
      setIsCopyingOrMoving(true);
      
      // First, get the source folder details to show in toast notification
      let sourceFolderDetails: Folder | undefined = folders.find(f => f.id === source_folder);
      
      // If not found in local state, try to fetch it directly from the service
      if (!sourceFolderDetails) {
        try {
          const folderResult = await folderService.getById(source_folder);
          if (folderResult) {
            sourceFolderDetails = folderResult;
          } else {
            throw new Error('Source folder not found');
          }
        } catch (error) {
          console.error("Error fetching folder details:", error);
          throw new Error('Source folder not found');
        }
      }
      
      if (!sourceFolderDetails) {
        throw new Error('Source folder not found');
      }
      
      const sourceFolderName = sourceFolderDetails.name;
      const sourceProjectId = sourceFolderDetails.projectId;

      if (action === 'copy') {
        // If we have a handler function from parent, use it for copying
        if (onCopyOrMoveFolder) {
          await onCopyOrMoveFolder(source_folder, destination_folder, action);
          // Trigger custom event for folder copy success
          triggerFolderOperationSuccess({
            action,
            folderId: source_folder,
            projectId: destination_project_id,
            source: 'documentList'
          });
        } else {
          // Use folderService to copy the folder
          const destFolder = destination_folder || undefined;
          const copiedFolderId = await folderService.copyFolder(
            source_folder,
            destination_project_id,
            destFolder
          );
          
          console.log(`Folder copied successfully. New folder ID: ${copiedFolderId}`);
          // Trigger custom event for folder copy success
          triggerFolderOperationSuccess({
            action,
            folderId: copiedFolderId,
            projectId: destination_project_id,
            source: 'documentList'
          });
        }
        
        // Force immediate refresh of destination project folders
        await forceReloadFolders(destination_project_id);
        
        // If it's cross-project, also refresh source project
        if (sourceProjectId !== destination_project_id) {
          console.log('Cross-project copy detected, refreshing source project');
          triggerFolderOperationSuccess({
            action: 'refresh',
            projectId: sourceProjectId,
            source: 'documentList'
          });
          
          // Force refresh source project folders
          if (sourceProjectId !== projectId) {
            await forceReloadFolders(sourceProjectId);
          }
        }
      } else {
        // action is 'move' here
        // If we have a handler function from parent, use it for moving
        if (onCopyOrMoveFolder) {
          await onCopyOrMoveFolder(source_folder, destination_folder, action);
          // Trigger custom event for folder move success
          triggerFolderOperationSuccess({
            action,
            folderId: source_folder,
            projectId: destination_project_id,
            source: 'documentList'
          });
        } else {
          // Use folderService to move the folder
          const destFolder = destination_folder || undefined;
          const movedFolderId = await folderService.moveFolder(
            source_folder,
            destination_project_id,
            destination_folder || undefined
          );
          
          console.log(`Folder moved successfully. Folder ID: ${movedFolderId}`);
          // Trigger custom event for folder move success
          triggerFolderOperationSuccess({
            action,
            folderId: movedFolderId,
            projectId: destination_project_id,
            source: 'documentList'
          });
          
          // If we moved the current folder, navigate to root
          if (currentFolder && currentFolder.id === source_folder) {
            console.log('Current folder was moved, navigating to root');
            onFolderSelect(undefined);
          }
        }
        
        // Force immediate refresh of destination project folders
        await forceReloadFolders(destination_project_id);
        
        // If it's cross-project, also refresh source project
        if (sourceProjectId !== destination_project_id) {
          console.log('Cross-project move detected, refreshing source project');
          triggerFolderOperationSuccess({
            action: 'refresh',
            projectId: sourceProjectId,
            source: 'documentList'
          });
          
          // Force refresh source project folders if it's not the current project
          if (sourceProjectId !== projectId) {
            await forceReloadFolders(sourceProjectId);
          }
        }
      }
      
      // Force immediate UI update
      setLocalFolders(prev => [...prev]);
      setLocalDocuments(prev => [...prev]);
      
      const actionText = action === 'copy' ? 'copied' : 'moved';
      showToast(`Folder ${sourceFolderName} ${actionText} successfully`, 'success');
      
      // Close the dialog and reset states
      setShowCopyMoveDialog(false);
      setFolderToCopyOrMove(null);
      setCopyMoveAction('copy');
      setDestinationFolder("");
      setSelectedDestinationProjectId("");
      setSelectedDestinationFolderId("");
    } catch (error) {
      console.error(`Error ${action === 'copy' ? 'copying' : 'moving'} folder:`, error);
      showToast(`Failed to ${action} folder: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      // Set loading state to false regardless of success or failure
      setIsCopyingOrMoving(false);
    }
  };
  
  // Update function to handle copy button click
  const handleCopyClick = (id: string, name: string) => {
    setFolderToCopyOrMove({id, name});
    setCopyMoveAction('copy');
    setShowCopyMoveDialog(true);
    setSelectedDestinationProjectId(projectId || "");
    if (projectId) {
      loadProjectFolders(projectId).then(() => {
        // Check if we have root folders with children and auto-expand
        const projectFoldersList = projectFolders[projectId] || [];
        const hasRootFoldersWithChildren = projectFoldersList.some(folder => 
          folder.parentId === undefined && 
          folder.name === '_root' && 
          projectFoldersList.some(f => f.parentId === folder.id)
        );
        
        if (hasRootFoldersWithChildren) {
          setShowFolderDropdown(true);
        }
      });
    }
  };

  // Add function to handle move button click
  const handleMoveClick = (id: string, name: string) => {
    setFolderToCopyOrMove({id, name});
    setCopyMoveAction('move');
    setShowCopyMoveDialog(true);
    setSelectedDestinationProjectId(projectId || "");
    if (projectId) {
      loadProjectFolders(projectId).then(() => {
        // Check if we have root folders with children and auto-expand
        const projectFoldersList = projectFolders[projectId] || [];
        const hasRootFoldersWithChildren = projectFoldersList.some(folder => 
          folder.parentId === undefined && 
          folder.name === '_root' && 
          projectFoldersList.some(f => f.parentId === folder.id)
        );
        
        if (hasRootFoldersWithChildren) {
          setShowFolderDropdown(true);
        }
      });
    }
  };

  // Function to handle downloading a folder
  const handleFolderDownload = async (folderId: string, folderName: string) => {
    try {
      setLoading(true);
      
      // Get all documents in this folder
      const folderDocs = documents.filter(doc => doc.folderId === folderId);
      
      if (folderDocs.length === 0) {
        showToast('No files to download in this folder', 'error');
        setLoading(false);
        return;
      }
      
      // For simplicity, create a list of links for the user to download
      const linksText = folderDocs.map(doc => `${doc.name}: ${doc.url}`).join('\n');
      
      // Create a download file with the links
      const blob = new Blob([linksText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      // Create temporary link and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}_links.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast(`Download links for folder "${folderName}" created`, 'success');
    } catch (error) {
      console.error('Error downloading folder:', error);
      showToast('Failed to download folder', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Create event listeners for folder operations
  useEffect(() => {
    // Define custom events for folder operations
    const FOLDER_OPERATION_SUCCESS_EVENT = 'folder-operation-success';
    
    // Define handler for successful folder operations
    const handleFolderOperationSuccess = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { action, folderId, projectId: eventProjectId } = customEvent.detail;
      
      console.log(`[DocumentList] Folder operation completed successfully, action: ${action}, folderId: ${folderId || 'N/A'}, projectId: ${eventProjectId || 'N/A'}`);
      
      // Immediately force reload folders to ensure UI is updated
      if (action === 'copy' || action === 'move' || action === 'refresh') {
        // If a project ID is specified in the event, refresh those folders specifically
        if (eventProjectId) {
          console.log(`[DocumentList] Force reloading folders for project ${eventProjectId} due to ${action} operation`);
          forceReloadFolders(eventProjectId);
        } 
        // Otherwise refresh the current project folders
        else if (projectId) {
          console.log(`[DocumentList] Force reloading current project folders due to ${action} operation`);
          forceReloadFolders(projectId);
        }
      }
      
      // Add a small delay before refreshing documents to ensure database has synced
      setTimeout(() => {
        // Refresh regardless of action
        if (onRefresh) {
          console.log('[DocumentList] Refreshing due to folder operation with delay');
          onRefresh();
        }
        
        // If we have a current folder, also trigger a document update for it
        if (currentFolder) {
          console.log(`[DocumentList] Triggering document update for current folder: ${currentFolder.id}`);
          triggerDocumentUpdate(currentFolder.id);
        }
        
        // If we have a specific folder ID, also refresh its documents
        if (folderId && folderId !== currentFolder?.id) {
          console.log(`[DocumentList] Triggering document update for affected folder: ${folderId}`);
          triggerDocumentUpdate(folderId);
        }
      }, 300); // Short delay to ensure database sync
      
      // Additional handling for cross-project moves
      if (action === 'move' && eventProjectId && eventProjectId !== selectedProject?.id) {
        console.log('[DocumentList] Cross-project move detected, force reloading folders');
        folderService.getByProjectId(eventProjectId).then(setLocalFolders);
      }
    };
    
    // Add event listeners
    document.addEventListener(FOLDER_OPERATION_SUCCESS_EVENT, handleFolderOperationSuccess as EventListener);
    
    // Return cleanup function
    return () => {
      document.removeEventListener(FOLDER_OPERATION_SUCCESS_EVENT, handleFolderOperationSuccess as EventListener);
    };
  }, [onRefresh, selectedProject, projectId]);

  // Refresh contents when currentFolder changes
  useEffect(() => {
    if (currentFolder) {
      console.log(`Current folder changed to: ${currentFolder.id} (${currentFolder.name}), refreshing content`);
      
      // Force a document refresh for this folder to ensure we have the latest content
      triggerDocumentUpdate(currentFolder.id);
      
      // If we have a refresh function, also call it
      if (onRefresh) {
        console.log('Calling full refresh due to folder change');
        onRefresh();
      }
    }
  }, [currentFolder?.id, onRefresh]);

  // Ensure documents are loaded on page refresh
  useEffect(() => {
    // If we have a currentFolder but no documents in local state, trigger a refresh
    if (currentFolder && !isSharedView && localDocuments.length === 0 && documents.length === 0) {
      console.log(`[DocumentList] Page refresh detected - no documents loaded for folder ${currentFolder.id}, forcing refresh`);
      
      // Force a document refresh for this folder
      triggerDocumentUpdate(currentFolder.id);
      
      // Also call parent refresh if available
      if (onRefresh) {
        console.log('[DocumentList] Calling parent refresh due to page refresh with empty documents');
        onRefresh();
      }
    }
  }, [currentFolder, localDocuments.length, documents.length, isSharedView, onRefresh]);

  // Listen for user update events when folder operations occur between projects
  useEffect(() => {
    const handleUserUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { action, source } = customEvent.detail;
      
      console.log(`[Document List] User update event received from ${source}, action: ${action}`);
      
      // Only refresh if we have an onRefresh callback and the update is related to folder operations
      if (onRefresh && source === 'userService') {
        console.log('[Document List] Refreshing after user update event from folder operation');
        onRefresh();
      }
    };
    
    document.addEventListener(USER_UPDATE_EVENT, handleUserUpdate as EventListener);
    
    return () => {
      document.removeEventListener(USER_UPDATE_EVENT, handleUserUpdate as EventListener);
    };
  }, [onRefresh]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Handle project dropdown
      if (showProjectDropdown && 
          projectDropdownRef.current && 
          !projectDropdownRef.current.contains(event.target as Node)) {
        setShowProjectDropdown(false);
      }
      
      // Handle folder dropdown
      if (showFolderDropdown && 
          folderDropdownRef.current && 
          !folderDropdownRef.current.contains(event.target as Node)) {
        setShowFolderDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProjectDropdown, showFolderDropdown]);

  // Function to copy or move a document
  const copyOrMoveDocument = async (source_document: string, destination_project_id: string, destination_folder: string, action: 'move' | 'copy') => {
    try {
      // Set loading state to true when operation starts
      setIsCopyingOrMoving(true);
      
      // First, get the source document details for toast notification
      let sourceDocumentDetails = documents.find(d => d.id === source_document);
      
      // If not found in local state, try to fetch it directly from the service
      if (!sourceDocumentDetails) {
        try {
          // Fetch document by ID from the appropriate folder, if we know which folder it belongs to
          // We'll need to search in all folders' documents if we don't know the folder
          const allProjectFolders = folders.filter(f => f.projectId === projectId);
          let foundDoc = null;
          
          for (const folder of allProjectFolders) {
            try {
              const folderDocs = await documentService.getByFolderId(folder.id);
              const doc = folderDocs.find(d => d.id === source_document);
              if (doc) {
                foundDoc = doc;
                break;
              }
            } catch (err) {
              console.log(`Error fetching docs for folder ${folder.id}:`, err);
            }
          }
          
          if (foundDoc) {
            sourceDocumentDetails = foundDoc;
          }
        } catch (error) {
          console.error("Error fetching document details:", error);
          throw new Error('Source document not found');
        }
      }
      
      if (!sourceDocumentDetails) {
        throw new Error('Source document not found');
      }
      
      const sourceDocumentName = sourceDocumentDetails.name;
      const sourceProjectId = sourceDocumentDetails.projectId;
      const sourceFolderId = sourceDocumentDetails.folderId;

      if (action === 'copy') {
        // First get the document file to re-upload
        const response = await fetch(sourceDocumentDetails.url);
        const blob = await response.blob();
        const file = new File([blob], sourceDocumentDetails.name, { type: blob.type });
        
        // Create a new document in the destination folder
        const newDocData = {
          projectId: destination_project_id,
          name: sourceDocumentDetails.name,
          type: sourceDocumentDetails.type,
          dateModified: new Date().toISOString(),
          folderId: destination_folder || "", // Use empty string if undefined
          version: 1,
          metadata: {
            ...sourceDocumentDetails.metadata,
            copiedFrom: source_document
          }
        };

        // Use document service to create the new document
        // Ensure destination_folder is not undefined when passing to create
        const destFolder = destination_folder || "";
        await documentService.create(destFolder, newDocData, file, user ? {
          id: user.id,
          displayName: user.displayName,
          role: user.role
        } : undefined);
        
        // Show success message
        showToast(`Document ${sourceDocumentName} copied successfully`, 'success');
        
      } else {
        // action is 'move'
        // Get the document file to re-upload
        const response = await fetch(sourceDocumentDetails.url);
        const blob = await response.blob();
        const file = new File([blob], sourceDocumentDetails.name, { type: blob.type });
        
        // Create a new document in the destination folder
        const newDocData = {
          projectId: destination_project_id,
          name: sourceDocumentDetails.name,
          type: sourceDocumentDetails.type,
          dateModified: new Date().toISOString(),
          folderId: destination_folder || "", // Use empty string if undefined
          version: sourceDocumentDetails.version,
          metadata: sourceDocumentDetails.metadata
        };

        // Use document service to create the new document in destination
        // Ensure destination_folder is not undefined when passing to create
        const destFolder = destination_folder || "";
        await documentService.create(destFolder, newDocData, file, user ? {
          id: user.id,
          displayName: user.displayName,
          role: user.role
        } : undefined);
        
        // Delete the original document after successful move
        // Ensure sourceFolderId is not undefined when passing to delete
        const srcFolder = sourceFolderId || "";
        await documentService.delete(srcFolder, source_document);
        
        // If the moved document was selected, deselect it
        if (selectedDocument && selectedDocument.id === source_document) {
          setSelectedDocument(undefined);
        }
        
        // Show success message
        showToast(`Document ${sourceDocumentName} moved successfully`, 'success');
      }
      
      // Force immediate refresh of destination project folders
      if (onRefresh) {
        console.log(`[DocumentList] Calling parent refresh`);
        await onRefresh();
      }
      
      // Force refreshing document in the destination folder
      if (destination_folder) {
        await forceReloadDocuments(destination_folder);
      } else {
        // If destination is root, find root folder ID
        const rootFolder = folders.find(folder => 
          folder.projectId === destination_project_id && 
          folder.metadata?.isRootFolder
        );
        
        if (rootFolder) {
          await forceReloadDocuments(rootFolder.id);
        } else {
          // If no root folder found, refresh all documents in the project
          // Refresh all folders in the project to get their documents
          const projectFolders = folders.filter(f => f.projectId === destination_project_id);
          let allDocuments: Document[] = [];
          
          for (const folder of projectFolders) {
            try {
              const folderDocs = await documentService.getByFolderId(folder.id);
              allDocuments = [...allDocuments, ...folderDocs];
            } catch (err) {
              console.log(`Error fetching docs for folder ${folder.id}:`, err);
            }
          }
          
          // Update local documents with the refreshed data
          setLocalDocuments(prev => {
            // Merge with existing documents from other projects
            const existingFromOtherProjects = prev.filter(d => d.projectId !== destination_project_id);
            return [...existingFromOtherProjects, ...allDocuments];
          });
        }
      }
      
      // Force immediate UI update
      setLocalFolders(prev => [...prev]);
      setLocalDocuments(prev => [...prev]);
      
      // Close the dialog and reset states
      setShowCopyMoveDialog(false);
      setDocumentToCopyOrMove(null);
      setCopyMoveAction('copy');
      setDestinationFolder("");
      setSelectedDestinationProjectId("");
      setSelectedDestinationFolderId("");
    } catch (error) {
      console.error(`Error ${action === 'copy' ? 'copying' : 'moving'} document:`, error);
      showToast(`Failed to ${action} document: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      // Set loading state to false regardless of success or failure
      setIsCopyingOrMoving(false);
    }
  };

  // Function to handle document copy button click
  const handleDocumentCopyClick = (id: string, name: string) => {
    setDocumentToCopyOrMove({id, name});
    setCopyMoveAction('copy');
    setShowCopyMoveDialog(true);
    setSelectedDestinationProjectId(projectId || "");
    if (projectId) {
      loadProjectFolders(projectId).then(() => {
        // Check if we have root folders with children and auto-expand
        const projectFoldersList = projectFolders[projectId] || [];
        const hasRootFoldersWithChildren = projectFoldersList.some(folder => 
          folder.parentId === undefined && 
          folder.name === '_root' && 
          projectFoldersList.some(f => f.parentId === folder.id)
        );
        
        if (hasRootFoldersWithChildren) {
          setShowFolderDropdown(true);
        }
      });
    }
  };

  // Function to handle document move button click
  const handleDocumentMoveClick = (id: string, name: string) => {
    setDocumentToCopyOrMove({id, name});
    setCopyMoveAction('move');
    setShowCopyMoveDialog(true);
    setSelectedDestinationProjectId(projectId || "");
    if (projectId) {
      loadProjectFolders(projectId).then(() => {
        // Check if we have root folders with children and auto-expand
        const projectFoldersList = projectFolders[projectId] || [];
        const hasRootFoldersWithChildren = projectFoldersList.some(folder => 
          folder.parentId === undefined && 
          folder.name === '_root' && 
          projectFoldersList.some(f => f.parentId === folder.id)
        );
        
        if (hasRootFoldersWithChildren) {
          setShowFolderDropdown(true);
        }
      });
    }
  };

  // Add share popup
  const renderSharePopup = () => {
    if (!showSharePopup) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Share</h3>
            <button
              onClick={closeSharePopup}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {isSharing ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-10 h-10 animate-spin text-primary-500 mb-4" />
              <p className="text-gray-600">Creating share link...</p>
            </div>
          ) : shareUrl ? (
            <div className="space-y-4">
              <p className="text-gray-600 mb-2">Use this link to share the content:</p>
              <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="p-2 flex-1 outline-none text-sm"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    showToast("Link copied to clipboard", "success");
                  }}
                  className="bg-primary-500 hover:bg-primary-600 text-white p-2"
                  aria-label="Copy link"
                >
                  <Copy className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                This link will expire in 7 days.
              </p>
              <div className="flex justify-end mt-4">
                <button
                  onClick={closeSharePopup}
                  className="px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6">
              <p className="text-red-500">Failed to create share link</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Add a specific handler for document update events that uses forceReloadDocuments
  useEffect(() => {
    const handleManualDocumentRefresh = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { folderId } = customEvent.detail;
      
      // Only respond if we have a matching folder
      if (folderId && (currentFolder?.id === folderId || (rootFolder && rootFolder.id === folderId))) {
        console.log(`[DocumentList] Manual document refresh requested for folder ${folderId}`);
        
        // Use our force reload function to ensure documents are properly loaded
        forceReloadDocuments(folderId).then(docs => {
          console.log(`[DocumentList] Force loaded ${docs.length} documents in response to manual refresh`);
        });
      }
    };
    
    // Listen for the document update event
    document.addEventListener(DOCUMENT_UPDATE_EVENT, handleManualDocumentRefresh);
    
    return () => {
      document.removeEventListener(DOCUMENT_UPDATE_EVENT, handleManualDocumentRefresh);
    };
  }, [currentFolder, rootFolder]);

  // Add state for file selection mode
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState<'download' | 'copy' | 'move' | 'rename' | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [movingFiles, setMovingFiles] = useState(false);
  const [moveProgress, setMoveProgress] = useState(0);
  const [itemTypeFilter, setItemTypeFilter] = useState<'document' | 'folder' | 'both'>('both');
  const [draggedItems, setDraggedItems] = useState<string[]>([]);
  const [dropTargetFolder, setDragTargetFolder] = useState<string | null>(null);
  const [fileBeingDragged, setFileBeingDragged] = useState<string | null>(null);
  const [showMoveConfirmation, setShowMoveConfirmation] = useState(false);
  const [moveTargetFolder, setMoveTargetFolder] = useState<{ id: string, name: string } | null>(null);
  const [draggedFiles, setDraggedFiles] = useState<string[]>([]);
  const [moveInProgress, setMoveInProgress] = useState(false);

  // Toggle item selection - select or deselect a file or folder
  const toggleFileSelection = (itemId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    
    // Prevent folder selection in download mode
    if (selectionMode === 'download') {
      // Check if the itemId belongs to a folder
      const isFolder = folders.some(folder => folder.id === itemId);
      if (isFolder) {
        showToast("Folders cannot be selected for download, only files");
        return;
      }
    }
    
    setSelectedFiles(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(itemId)) {
        newSelection.delete(itemId);
      } else {
        newSelection.add(itemId);
      }
      
      // If selection is empty, exit selection mode
      if (newSelection.size === 0) {
        setIsSelectionMode(false);
      } else {
        setIsSelectionMode(true);
      }
      
      return newSelection;
    });
  };
  
  // Select all files and folders in the current view
  const selectAllFiles = () => {
    const newSelection = new Set<string>();
    
    // Add all visible document IDs to selection
    const { filteredDocs, filteredFolders } = filteredAndSortedItems();
    
    // Add documents
    filteredDocs.forEach(doc => {
      if (doc.id) {
        newSelection.add(doc.id);
      }
    });
    
    // Add folders only if not in download mode
    if (selectionMode !== 'download') {
      filteredFolders.forEach(folder => {
        if (folder.id) {
          newSelection.add(folder.id);
        }
      });
    } else if (filteredFolders.length > 0) {
      // Show a message that folders can't be selected in download mode
      showToast("Selecting all files. Folders can't be included in downloads.");
    }
    
    setSelectedFiles(newSelection);
    if (newSelection.size > 0) {
      setIsSelectionMode(true);
    }
  };
  
  // Deselect all files
  const deselectAllFiles = () => {
    setSelectedFiles(new Set());
    setIsSelectionMode(false);
  };
  
  // Exit selection mode
  const exitSelectionMode = () => {
    setSelectedFiles(new Set());
    setIsSelectionMode(false);
  };
  
  // Download all selected files as a zip archive
  const downloadSelectedFiles = async () => {
    if (selectedFiles.size === 0) {
      showToast("No files selected for download", "error");
      return;
    }
    
    try {
      setIsDownloading(true);
      const zip = new JSZip();
      const selectedDocs = currentDocs.filter(doc => selectedFiles.has(doc.id));
      
      // Show toast while processing
      showToast(`Preparing ${selectedFiles.size} files for download...`);
      
      // Track progress for large downloads
      let processed = 0;
      
      // Process each file
      for (const doc of selectedDocs) {
        try {
          // Fetch the file
          const response = await fetch(doc.url);
          
          if (!response.ok) {
            console.error(`Failed to fetch file ${doc.name}: ${response.status} ${response.statusText}`);
            continue;
          }
          
          // Get the blob data
          const blob = await response.blob();
          
          // Check for content-type from the response
          const responseContentType = response.headers.get('content-type');
          
          // Ensure filename has correct extension
          let fileName = doc.name;
          
          // Get file extension from metadata, content-type, or document type
          let fileExtension = '';
          
          // First check metadata original filename
          if (doc.metadata?.originalFilename && doc.metadata.originalFilename.includes('.')) {
            fileExtension = doc.metadata.originalFilename.split('.').pop() || '';
          } 
          // Then try to get from response content type or metadata content type
          else if (responseContentType || doc.metadata?.contentType) {
            const contentType = (responseContentType || doc.metadata?.contentType || '').toLowerCase();
            if (contentType.includes('pdf')) fileExtension = 'pdf';
            else if (contentType.includes('dwg')) fileExtension = 'dwg';
            else if (contentType.includes('jpeg') || contentType.includes('jpg')) fileExtension = 'jpg';
            else if (contentType.includes('png')) fileExtension = 'png';
            else if (contentType.includes('gif')) fileExtension = 'gif';
            else if (contentType.includes('tiff')) fileExtension = 'tiff';
            else if (contentType.includes('bmp')) fileExtension = 'bmp';
            else if (contentType.includes('svg')) fileExtension = 'svg';
            else if (contentType.includes('webp')) fileExtension = 'webp';
            else if (contentType.includes('octet-stream')) {
              // For binary streams, try to guess from the URL
              const urlPath = new URL(doc.url).pathname.toLowerCase();
              if (urlPath.includes('.pdf')) fileExtension = 'pdf';
              else if (urlPath.includes('.dwg')) fileExtension = 'dwg';
              else if (urlPath.includes('.jpg') || urlPath.includes('.jpeg')) fileExtension = 'jpg';
              else if (urlPath.includes('.png')) fileExtension = 'png';
              else if (urlPath.includes('.gif')) fileExtension = 'gif';
              else fileExtension = 'bin';
            }
          } 
          // Finally fallback to document type
          if (!fileExtension) {
            fileExtension = doc.type === 'pdf' 
              ? 'pdf' 
              : doc.type === 'dwg' 
                ? 'dwg' 
                : doc.type === 'image' 
                  ? 'jpg' 
                  : 'bin';
          }
          
          // If filename doesn't already have an extension, add it
          if (!fileName.toLowerCase().endsWith(`.${fileExtension.toLowerCase()}`)) {
            fileName = `${fileName}.${fileExtension}`;
          }
          
          // Add file to zip with proper filename
          zip.file(fileName, blob);
          
          // Update progress for large downloads
          processed++;
          if (selectedDocs.length > 5 && processed % 5 === 0) {
            showToast(`Preparing download: ${processed}/${selectedDocs.length} files processed...`);
          }
        } catch (fileError) {
          console.error(`Error processing file ${doc.name}:`, fileError);
        }
      }
      
      // Generate the zip file
      showToast("Creating download package...");
      const content = await zip.generateAsync({ type: "blob" });
      
      // Save the zip file
      const zipName = `${selectedProject?.name || 'documents'}-files-${new Date().toISOString().slice(0,10)}.zip`;
      FileSaver.saveAs(content, zipName);
      
      showToast(`${selectedFiles.size} files downloaded successfully`, "success");
      
      // Exit selection mode after successful download
      exitSelectionMode();
    } catch (error) {
      console.error("Error downloading selected files:", error);
      showToast("Failed to download selected files", "error");
    } finally {
      setIsDownloading(false);
    }
  };
  
  // Move selected files to a different folder
  const moveSelectedFiles = async () => {
    if (selectedFiles.size === 0) {
      showToast("No files selected to move", "error");
      return;
    }
    
    // Set up the copy/move dialog for multiple files
    setDocumentToCopyOrMove(null);
    setFolderToCopyOrMove(null);
    setCopyMoveAction('move');
    setShowCopyMoveDialog(true);
    
    // Listen for dialog close/completion
    const handleSelectFilesForOperation = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { action, success } = customEvent.detail;
      
      if (action === 'move' && success) {
        // Clear selection after successful move
        exitSelectionMode();
        
        // Show success message
        showToast(`${selectedFiles.size} files moved successfully`, "success");
        
        // Refresh the current view
        if (onRefresh) {
          onRefresh();
        }
      }
      
      // Remove event listener
      document.removeEventListener(FOLDER_OPERATION_SUCCESS_EVENT, handleSelectFilesForOperation as EventListener);
    };
    
    // Add event listener
    document.addEventListener(FOLDER_OPERATION_SUCCESS_EVENT, handleSelectFilesForOperation as EventListener);
  };
  
  // Copy selected files to a different folder
  const copySelectedFiles = async () => {
    if (selectedFiles.size === 0) {
      showToast("No files selected to copy", "error");
      return;
    }
    
    // Set up the copy/move dialog for multiple files
    setDocumentToCopyOrMove(null);
    setFolderToCopyOrMove(null);
    setCopyMoveAction('copy');
    setShowCopyMoveDialog(true);
    
    // Listen for dialog close/completion
    const handleSelectFilesForOperation = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { action, success } = customEvent.detail;
      
      if (action === 'copy' && success) {
        // Clear selection after successful copy
        exitSelectionMode();
        
        // Show success message
        showToast(`${selectedFiles.size} files copied successfully`, "success");
        
        // Refresh the current view
        if (onRefresh) {
          onRefresh();
        }
      }
      
      // Remove event listener
      document.removeEventListener(FOLDER_OPERATION_SUCCESS_EVENT, handleSelectFilesForOperation as EventListener);
    };
    
    // Add event listener
    document.addEventListener(FOLDER_OPERATION_SUCCESS_EVENT, handleSelectFilesForOperation as EventListener);
  };
  
  // Handle file drag start
  const handleFileDragStart = (e: React.DragEvent<HTMLDivElement>, docId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', docId);
    
    // Mark which files are being dragged
    setDraggedFiles([docId]);
    
    // Visual cue for dragging
    const target = e.currentTarget;
    target.classList.add('opacity-50');
    
    // Clean up after drag ends
    const handleDragEnd = () => {
      target.classList.remove('opacity-50');
      target.removeEventListener('dragend', handleDragEnd);
    };
    
    target.addEventListener('dragend', handleDragEnd);
  };
  
  // Handle folder drag over - provide visual feedback when dragging over a folder
  const handleFolderDragOver = (e: React.DragEvent<HTMLDivElement>, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    
    // Visual feedback - highlight target folder
    setDragTargetFolder(folderId);
  };
  
  // Handle folder drag leave
  const handleFolderDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove highlight
    setDragTargetFolder(null);
  };
  
  // Handle folder drop - move files to the target folder
  const handleFolderDrop = async (e: React.DragEvent<HTMLDivElement>, targetFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Clear visual feedback
    setDragTargetFolder(null);
    
    if (draggedFiles.length === 0) {
      return;
    }
    
    // Get folder name for confirmation
    const targetFolder = folders.find(f => f.id === targetFolderId);
    if (!targetFolder) return;
    
    // Show confirmation dialog
    setMoveTargetFolder({ id: targetFolderId, name: targetFolder.name });
    setShowMoveConfirmation(true);
  };

  // Function to execute the file move operation
  const moveFilesToFolder = async (targetFolderId: string) => {
    if (draggedFiles.length === 0) return;
    
    setMoveInProgress(true);
    
    try {
      // Use toast from context
      showToast(`Moving ${draggedFiles.length} files...`);
      
      for (const docId of draggedFiles) {
        const doc = documents.find(d => d.id === docId);
        if (!doc) continue;
        
        // Skip if file is already in target folder
        if (doc.folderId === targetFolderId) {
          showToast("File is already in this folder");
          continue;
        }
        
        showToast(`Moving ${doc.name}...`);
        
        // Update document location
        if (onUpdateDocument) {
          await onUpdateDocument(docId, {
            folderId: targetFolderId
          });
        }
      }
      
      // Refresh data after move
      if (onRefresh) {
        await onRefresh();
      }
      
      // Clear selection after move
      setSelectedFiles(new Set());
      setIsSelectionMode(false);
      setDraggedFiles([]);
      
      showToast("Files moved successfully");
    } catch (error) {
      console.error("Error moving files:", error);
      showToast("Error moving files", "error");
    } finally {
      setMoveInProgress(false);
    }
  };

  // Add a new effect to listen for the bulk rename selection event
  useEffect(() => {
    const handleSelectFilesForRename = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { mode } = customEvent.detail;
      
      if (mode === 'rename') {
        // Enter selection mode for rename
        setSelectionMode('rename');
        setIsSelectionMode(true);
        
        // Clear any existing selection
        setSelectedFiles(new Set());
      }
    };
    
    document.addEventListener('select-files-for-rename', handleSelectFilesForRename as EventListener);
    
    return () => {
      document.removeEventListener('select-files-for-rename', handleSelectFilesForRename as EventListener);
    };
  }, []);

  // Add function to handle bulk rename operation
  const bulkRenameSelectedItems = () => {
    console.log("bulkRenameSelectedItems called, selected files:", selectedFiles.size);
    
    if (selectedFiles.size === 0) {
      showToast("No files or folders selected for renaming", "error");
      return;
    }
    
    // Gather the selected items (both files and folders)
    const itemsToRename: Array<{id: string, name: string, type: 'document' | 'folder'}> = [];
    
    // Get selected documents
    const selectedDocs = currentDocs.filter(doc => selectedFiles.has(doc.id));
    console.log("Selected documents for rename:", selectedDocs.length);
    
    selectedDocs.forEach(doc => {
      itemsToRename.push({
        id: doc.id,
        name: doc.name,
        type: 'document'
      });
    });
    
    // Get selected folders
    const selectedFolders = visibleFolders.filter(folder => selectedFiles.has(folder.id));
    console.log("Selected folders for rename:", selectedFolders.length);
    
    selectedFolders.forEach(folder => {
      itemsToRename.push({
        id: folder.id,
        name: folder.name,
        type: 'folder'
      });
    });
    
    // If no onBulkRename function is provided, show an error
    if (!onBulkRename) {
      showToast("Bulk rename functionality is not available", "error");
      return;
    }
    
    console.log("Dispatching items-selected-for-rename event with items:", itemsToRename);
    
    // First try direct approach - create a modal directly in DocumentList
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold">Rename ${itemsToRename.length} Items</h2>
          <button id="closeRenameModal" class="text-gray-500 hover:text-gray-700 transition-colors">✕</button>
        </div>
        
        <div class="mb-4 max-h-72 overflow-y-auto border border-gray-200 rounded-md">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 10%">Type</th>
                <th scope="col" class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style="width: 90%">New Name</th>

              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              ${itemsToRename.map((item, index) => `
                <tr key="${item.id}">
                  <td class="px-3 py-2 whitespace-nowrap">
                    ${item.type === 'folder' ? 
                      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>' : 
                      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-gray-400"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>'}
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    <input 
                      type="text"
                      id="rename-${item.id}"
                      value="${item.name}"
                      class="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="flex justify-end space-x-2">
          <button
            id="cancelRenameModal"
            class="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            id="confirmRename"
            class="px-4 py-2 text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    document.getElementById('closeRenameModal')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    document.getElementById('cancelRenameModal')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    document.getElementById('confirmRename')?.addEventListener('click', async () => {
      // Gather new names
      const updatedItems = itemsToRename.map(item => {
        const input = document.getElementById(`rename-${item.id}`) as HTMLInputElement;
        return {
          ...item,
          newName: input.value
        };
      });
      
      // Apply rename
      try {
        await onBulkRename(updatedItems, "__INDIVIDUAL__");
        showToast(`${updatedItems.length} items renamed successfully`, "success");
        
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error('Error renaming items:', error);
        showToast(`Failed to rename items: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      } finally {
        document.body.removeChild(modal);
      }
    });
    
    // Also try the original event approach as fallback
    const itemsSelectedEvent = new CustomEvent('items-selected-for-rename', {
      bubbles: true,
      detail: {
        items: itemsToRename
      }
    });
    document.dispatchEvent(itemsSelectedEvent);
    
    // Exit selection mode
    exitSelectionMode();
  };

  // Add a listener for bulk rename success event
  useEffect(() => {
    const handleBulkRenameSuccess = (event: Event) => {
      // Refresh the current view
      if (onRefresh) {
        onRefresh();
      }
    };
    
    document.addEventListener('bulk-rename-success', handleBulkRenameSuccess as EventListener);
    
    return () => {
      document.removeEventListener('bulk-rename-success', handleBulkRenameSuccess as EventListener);
    };
  }, [onRefresh]);

  // Modify the UI to show rename action in selection mode
  // Inside the render function where the selection mode controls are
  // Look for the selection actions section
  // Add the following inside:

  /* Inside the selection mode UI:
  {selectionMode === 'rename' && (
    <button
      onClick={bulkRenameSelectedItems}
      className="px-3 py-2 text-primary-700 border border-primary-200 bg-primary-100 hover:bg-primary-200 rounded"
    >
      Rename Selected
    </button>
  )}
  */

  // Add event listener for the 'select-files-for-download' event
  useEffect(() => {
    const handleSelectFilesForDownload = (event: Event) => {
      const customEvent = event as CustomEvent;

      // Clear any existing selection
      setSelectedFiles(new Set());

      // Enter selection mode for download
      setIsSelectionMode(true);
      setSelectionMode('download');

      console.log("[DocumentList] Entered file selection mode for download");
    };

    // Add event listener
    document.addEventListener('select-files-for-download', handleSelectFilesForDownload as EventListener);

    // Clean up
    return () => {
      document.removeEventListener('select-files-for-download', handleSelectFilesForDownload as EventListener);
    };
  }, []);

  // Event listener for bulk move operation
  useEffect(() => {
    const handleSelectFilesForOperation = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { operation, itemType } = customEvent.detail;

      console.log(`[DocumentList] Entering selection mode for ${operation} operation on ${itemType}`);

      // Enter selection mode
      setIsSelectionMode(true);
      setSelectionMode(operation); // 'move'
      setItemTypeFilter(itemType); // 'document'

      // Clear any existing selection
      setSelectedFiles(new Set());
    };

    // Add event listener
    document.addEventListener('select-files-for-operation', handleSelectFilesForOperation as EventListener);

    // Cleanup
    return () => {
      document.removeEventListener('select-files-for-operation', handleSelectFilesForOperation as EventListener);
    };
  }, []);

  return (
    <div 
      ref={dropZoneRef}
      className="h-full flex flex-col relative overflow-hidden"
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Only show header when not in fullscreen */}
      {!isFullscreen && (
        <>
          <div className="flex justify-between items-center border-b px-4 py-3 bg-white">
            <DocumentBreadcrumbs
              folders={folders}
              currentFolder={currentFolder}
              selectedDocument={selectedDocument}
              onNavigate={handleBreadcrumbNavigation}
              onDocumentClick={() => selectedDocument && onPreview(selectedDocument)}
              onUpdateDocument={onUpdateDocument}
              onRefresh={onRefresh}
              showToast={(message: string, type?: "success" | "error" | "info" | "warning") => showToast(message, type as "success" | "error")}
            />
            
            {/* Header actions */}
            {!isSelectionMode && renderUploadButtons()}
            
            {/* Selection mode controls */}
            {isSelectionMode && (
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">
                  {selectedFiles.size} {selectedFiles.size === 1 ? 'item' : 'items'} selected
                </span>
                
                {/* Selection actions */}
                <div className="flex items-center space-x-2 ml-4">
                 {/* Select All button */}
                <button
                  onClick={selectAllFiles}
                  className="px-3 py-2 text-blue-700 border border-blue-200 bg-blue-100 hover:text-blue-900 hover:bg-blue-200 rounded"
                >
                  Select All
                </button>

                {/* Deselect All button */}
                <button
                  onClick={deselectAllFiles}
                  className="px-3 py-2 text-red-700 border border-red-200 bg-red-100 hover:text-red-900 hover:bg-red-200 rounded"
                >
                  Deselect All
                </button>

                  
                  {/* Download button - only in download mode */}
                  {selectionMode === 'download' && selectedFiles.size > 0 && (
                    <button
                      onClick={downloadSelectedFiles}
                      disabled={isDownloading}
                      className={`px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center space-x-1 ${
                        isDownloading ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>Download ZIP</span>
                        </>
                      )}
                    </button>
                  )}
                  
                  {/* Move button - only in move mode */}
                  {selectionMode === 'move' && selectedFiles.size > 0 && (
                    <button
                      onClick={() => {
                        // Clear single-file states to prevent wrong dialog from showing
                        setDocumentToCopyOrMove(null);
                        setFolderToCopyOrMove(null);
                        setShowCopyMoveDialog(true);
                      }}
                      disabled={movingFiles}
                      className={`px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center space-x-1 ${
                        movingFiles ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
                    >
                      {movingFiles ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <FolderInput className="w-4 h-4" />
                          <span>Move Items</span>
                        </>
                      )}
                    </button>
                  )}
                  
                  {/* Copy button - only in copy mode */}
                  {selectionMode === 'copy' && selectedFiles.size > 0 && (
                    <button
                      onClick={() => {
                        // Clear single-file states to prevent wrong dialog from showing
                        setDocumentToCopyOrMove(null);
                        setFolderToCopyOrMove(null);
                        setShowCopyMoveDialog(true);
                      }}
                      disabled={movingFiles}
                      className={`px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center space-x-1 ${
                        movingFiles ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
                    >
                      {movingFiles ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy Items</span>
                        </>
                      )}
                    </button>
                  )}
                  
                  {/* Rename button - only in rename mode */}
                  {selectionMode === 'rename' && selectedFiles.size > 0 && (
                    <button
                      onClick={bulkRenameSelectedItems}
                      className="px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center space-x-1"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Rename Selected</span>
                    </button>
                  )}
                  
                  {/* Cancel button */}
                  <button
                    onClick={exitSelectionMode}
                    className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Main content area - documents grid or document viewer */}
      {selectedDocument ? (
        <>
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Remove duplicate breadcrumbs - the main one at the top is enough */}
            <DocumentViewer
              document={selectedDocument}
              onClose={() => setSelectedDocument(undefined)}
              onRefresh={onRefresh}
              folders={folders} // Pass the full folders array with complete folder information
              onNavigateToFolder={handleBreadcrumbNavigation}
              viewerHeight={600}
              setViewerHeight={(height: number) => {
                console.log('Viewer height updated:', height);
                // You can add state for this if needed
              }}
              isFullscreen={isFullscreen}
              onFullscreenChange={(fullscreen) => {
                setIsFullscreen(fullscreen);
                onFullscreenChange?.(fullscreen);
              }}
            />
          </div>
        </>
      ) : (
        <>
          {/* Search, filter, and sort controls */}
          <div className="px-4 my-4 space-y-3">
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search files and folders..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-200 transition-all duration-300"
                />
                <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                {searchQuery && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute right-3 top-2.5 text-xs text-gray-500 hover:text-gray-700"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear
                  </motion.button>
                )}
              </div>
              
              {/* Filter Dropdown */}
              <div className="relative" ref={filterRef}>
                <button
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className="px-3 py-2 bg-slate-300 text-gray-700 rounded-md hover:bg-gray-200 transition-all duration-300 flex items-center space-x-2 min-w-[110px] justify-between"
                >
                  <div className="flex items-center space-x-2">
                    {getFilterIcon()}
                    <span className="text-sm">{getFilterLabel()}</span>
                  </div>
                  <ChevronDown className="w-4 h-4" />
                </button>
                
                <>
                  {showFilterDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200"
                    >
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setViewFilter('all');
                            setShowFilterDropdown(false);
                          }}
                          className={`flex items-center space-x-2 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 ${
                            viewFilter === 'all' ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <Filter className="w-4 h-4" />
                          <span>All Items</span>
                        </button>
                        <button
                          onClick={() => {
                            setViewFilter('folders');
                            setShowFilterDropdown(false);
                          }}
                          className={`flex items-center space-x-2 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 ${
                            viewFilter === 'folders' ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <FolderOpen className="w-4 h-4" />
                          <span>Folders Only</span>
                        </button>
                        <button
                          onClick={() => {
                            setViewFilter('files');
                            setShowFilterDropdown(false);
                          }}
                          className={`flex items-center space-x-2 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 ${
                            viewFilter === 'files' ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                          <span>Files Only</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </>
              </div>
              
              {/* Sort Dropdown */}
              <div className="relative" ref={sortRef}>
                <button
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className="px-3 py-2 bg-slate-300 text-gray-700 rounded-md hover:bg-gray-200 transition-all duration-300 flex items-center space-x-2 min-w-[140px] justify-between"
                >
                  <div className="flex items-center space-x-2">
                    <ArrowUpDown className="w-4 h-4" />
                    <span className="text-sm">{getSortByLabel()} {sortOrder === 'asc' ? '↑' : '↓'}</span>
                  </div>
                  <ChevronDown className="w-4 h-4" />
                </button>
                
                <>
                  {showSortDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200"
                    >
                      <div className="py-1">
                        <button
                          onClick={() => changeSortBy('name')}
                          className={`flex items-center space-x-2 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 ${
                            sortBy === 'name' ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <span>Name (Alpha & Numeric)</span>
                        </button>
                        <button
                          onClick={() => changeSortBy('dateModified')}
                          className={`flex items-center space-x-2 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 ${
                            sortBy === 'dateModified' ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <span>Date Modified</span>
                        </button>
                        <button
                          onClick={() => changeSortBy('dateCreated')}
                          className={`flex items-center space-x-2 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 ${
                            sortBy === 'dateCreated' ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                          }`}
                        >
                          <span>Date Added</span>
                        </button>
                        <div className="border-t border-gray-100 my-1"></div>
                        <button
                          onClick={toggleSortOrder}
                          className="flex items-center space-x-2 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 text-gray-700"
                        >
                          <span>Toggle Order ({sortOrder === 'asc' ? 'Ascending' : 'Descending'})</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </>
              </div>
            </div>
            
            {searchQuery && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-gray-500"
              >
                Found {subFolders.length + currentDocs.length} items
                {viewFilter !== 'all' && ` (${viewFilter === 'folders' ? `${subFolders.length} folders` : `${currentDocs.length} files`})`}
              </motion.div>
            )}
          </div>

          <>
            {loading || isReloading || isNotificationLoading || isProcessingNotification || (rootLoading && !currentFolder && rootFolder) ? (
                              <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-12"
                >
                  <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-3" />
                  {isNotificationLoading ? (
                    <div className="text-center">
                      <p className="text-primary-700 font-medium">Navigating to uploaded file...</p>
                      {notificationLoadingTarget?.fileName && (
                        <p className="text-sm text-gray-500 mt-1">
                          {notificationLoadingTarget.fileName}
                        </p>
                      )}
                    </div>
                  ) : rootLoading && !currentFolder && rootFolder ? (
                    <p className="text-gray-500">Loading root folder content...</p>
                  ) : isProcessingNotification ? (
                    <p className="text-gray-500">Processing notification...</p>
                  ) : (
                    <p className="text-gray-500">Loading content...</p>
                  )}
                </motion.div>
            ) : (
                              <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2 px-4 pr-6 overflow-y-auto"
                  style={{paddingTop: '1.5rem', paddingBottom: '1.5rem'}}
                >
                {subFolders.map((folder, index) => (
                  <motion.div
                    key={`folder-${folder.id || Math.random().toString(36)}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center justify-between p-3 bg-white border ${
                      dropTargetFolder === folder.id ? 'border-primary-500 bg-primary-50' : 
                      isSelectionMode && selectedFiles.has(folder.id) ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
                    } rounded-lg ${selectionMode === 'download' ? 'hover:bg-gray-50 opacity-60 cursor-default' : 'hover:bg-gray-50'} transition-colors`}
                    onDragOver={(e: any) => handleFolderDragOver(e, folder.id)}
                    onDragLeave={(e: any) => handleFolderDragLeave(e)}
                    onDrop={(e: any) => handleFolderDrop(e, folder.id)}
                  >
                    {/* Selection checkbox - only show in selection mode and not in download mode for folders */}
                    {isSelectionMode && selectionMode !== 'download' && itemTypeFilter !== 'document' && (
                      <div
                        className="flex-shrink-0 mr-3 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFileSelection(folder.id, e);
                        }}
                      >
                        {selectedFiles.has(folder.id) ? (
                          <CheckCircle className="w-5 h-5 text-primary-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        // In selection mode, toggle selection instead of navigating
                        // But prevent toggling in download mode for folders
                        if (isSelectionMode) {
                          e.preventDefault();
                          if (selectionMode !== 'download' && itemTypeFilter !== 'document') {
                            toggleFileSelection(folder.id, e);
                          } else if (selectionMode === 'download') {
                            showToast("Folders cannot be selected for download, only files");
                          } else if (itemTypeFilter === 'document') {
                            showToast("Only documents can be selected in this mode");
                          }
                          return;
                        }
                        onFolderSelect?.(folder);
                      }}
                      className="flex items-left space-x-3 flex-1"
                    >
                      <FolderOpen className="w-6 h-6 text-gray-400" />
                      <span className="font-medium text-gray-900">
                        {typeof folder.name === 'string' ? folder.name : 'Unnamed folder'}
                      </span>
                    </button>
                    {!isSharedView && (
                      <div className="flex items-center space-x-1">
                        {/* Only show edit button if user can edit documents */}
                          <div className="group relative">
                            <button
                              onClick={(e) => handleEditClick(e, folder.id, 'folder', typeof folder.name === 'string' ? folder.name : 'Unnamed folder')}
                              className={`p-1 ${!hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission) ?
                                'text-gray-300 cursor-not-allowed' :
                                'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} rounded-full`}
                              aria-label="Edit folder"
                              disabled={!hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission)}
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            <div className={`absolute ${index === 0 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap`}>
                              {hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission)
                                ? "Edit"
                                : "You don't have permission access"}
                            </div>
                          </div>
                      
                        {/* Copy button */}
                        <div className="group relative">
                          <button
                            onClick={() => handleCopyClick(folder.id, typeof folder.name === 'string' ? folder.name : 'Unnamed folder')}
                            className={`p-1 ${!hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission) ?
                              'text-gray-300 cursor-not-allowed' :
                              'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} rounded-full`}
                            aria-label="Copy folder"
                            disabled={!hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission) ||
                                      !isUserAdminOrStaff()}>
                            <Copy className="w-5 h-5" />
                          </button>
                          <div className={`absolute ${index === 0 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap`}>
                              {hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission) && isUserAdminOrStaff()
                                ? "Copy"
                                : "You don't have permission to copy folder"}   
                          </div>
                        </div>

                        {/* Move button */}
                        <div className="group relative">
                          <button
                            onClick={() => handleMoveClick(folder.id, typeof folder.name === 'string' ? folder.name : 'Unnamed folder')}
                            className={`p-1 ${!hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission) ?
                              'text-gray-300 cursor-not-allowed' :
                              'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} rounded-full`}
                            aria-label="Move folder"
                            disabled={!hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission) ||
                                      !isUserAdminOrStaff()}>
                            <FolderInput className="w-5 h-5" />
                          </button>
                          <div className={`absolute ${index === 0 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap`}>
                          {hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission) && isUserAdminOrStaff()
                                ? "Move"
                                : "You don't have permission to move folder."} 
                          </div>
                        </div>

                        {/* Download button */}
                        <div className="group relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFolderDownload(folder.id, typeof folder.name === 'string' ? folder.name : 'Unnamed folder');
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                            aria-label="Download folder"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                          <div className={`absolute ${index === 0 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap`}>
                            Download
                          </div>
                        </div>

                        {/* Only show share button if user can share documents */}
                        {canShareDocuments() && (
                          <div className="group relative">
                            <button
                              onClick={() => handleShare(folder.id, true)}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                              aria-label="Share folder"
                              disabled={isSharing}
                            >
                              {isSharing && showSharePopup ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <Share2 className="w-5 h-5" />
                              )}
                            </button>
                            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                              Share
                            </div>
                          </div>
                        )}

                        {/* Only show delete button if user can delete documents */}
                          <div className="group relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDelete(folder.id, 'folder', typeof folder.name === 'string' ? folder.name : 'Unnamed folder');
                              }}
                              className={`p-1 ${!hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission) ?
                                'text-gray-300 cursor-not-allowed' :
                                'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} rounded-full`}
                              aria-label="Delete folder"
                              disabled={!hasFolderWritePermission(folder?.metadata?.access as FolderAccessPermission)}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                            <div className={`absolute ${index === 0 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap`}>
                              Delete
                            </div>
                          </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {currentDocs.map((doc) => ( 
                  <motion.div
                    key={`doc-${doc.id || Math.random().toString(36)}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-center justify-between p-3 bg-white border ${
                      isSelectionMode && selectedFiles.has(doc.id) 
                        ? 'border-primary-500 bg-primary-50' 
                        : 'border-gray-200'
                    } rounded-lg hover:bg-gray-50 transition-colors ${
                      draggedItems.includes(doc.id) ? 'opacity-50' : ''
                    }`}
                    draggable={!isSharedView}
                    onDragStart={(e: any) => handleFileDragStart(e, doc.id)}
                  >
                    {/* Selection checkbox - only show in selection mode */}
                    {isSelectionMode && itemTypeFilter !== 'folder' && (
                      <div
                        className="flex-shrink-0 mr-3 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFileSelection(doc.id);
                        }}
                      >
                        {selectedFiles.has(doc.id) ? (
                          <CheckCircle className="w-5 h-5 text-primary-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    )}
                    
                    <button
                      onClick={(e) => {
                        // In selection mode, toggle selection instead of previewing
                        if (isSelectionMode) {
                          e.preventDefault();
                          toggleFileSelection(doc.id);
                          return;
                        }
                        
                        // Close image preview popup if it's open
                        closeImagePreview();
                        
                        if (isSharedView) {
                          onPreview(doc);
                        } else {
                          // Get the full current folder info for this document
                          const documentFolder = doc.folderId ? folders.find(f => f.id === doc.folderId) : undefined;
                          console.log(`Setting selected document: ${doc.name} in folder: ${documentFolder?.name || 'No folder'}`);
                          setSelectedDocument(doc);
                        }
                      }}
                      className="flex items-center space-x-3 flex-1"
                    >
                      {isImage(doc) ? (
                        <div 
                          className="w-10 h-10 relative rounded overflow-hidden flex-shrink-0 border border-gray-200"
                          onMouseEnter={(e) => handleImageMouseEnter(doc, e)}
                          onMouseMove={handleImageMouseMove}
                          onMouseLeave={handleImageMouseLeave}
                        >
                          <img 
                            src={getThumbnailUrl(doc)} 
                            alt={doc.name} 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // If image fails to load, fallback to icon
                              e.currentTarget.style.display = 'none';
                              const icon = document.createElement('div');
                              icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-gray-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M4 12v4a2 2 0 0 0 2 2h2"></path><path d="M14 18.5v.5"></path><path d="M17 18.5v.5"></path><path d="M3 12h14v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-1"></path></svg>';
                              e.currentTarget.parentNode?.appendChild(icon.firstChild as Node);
                            }}
                          />
                        </div>
                      ) : isHeic(doc) ? (
                        <Image className="w-6 h-6 text-blue-400" />
                      ) : isPdf(doc) ? (
                        <FileText className="w-6 h-6 text-red-400" />
                      ) : isVideo(doc) ? (
                        <Video className="w-6 h-6 text-purple-400" />
                      ) : (
                        <FileText className="w-6 h-6 text-gray-400" />
                      )}
                      <div>
                        <div className="text-left">
                          <span className="font-medium text-gray-900">
                            {typeof doc.name === 'string' ? doc.name : 'Unnamed document'}
                          </span>
                          <span className="ml-2 text-sm text-gray-500">
                            v{doc.version}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          Modified: {formatDate(doc.dateModified)}
                        </p>
                      </div>
                    </button>
                    {!isSharedView && !isSelectionMode && (
                      <div className="flex items-center space-x-1">
                        {/* Only show edit button if user can edit documents */}

                        {/* Edit button for documents */}
                        {canEditDocuments() && (
                          <div className="group relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                closeImagePreview();
                                handleEditClick(e, doc.id, 'document', typeof doc.name === 'string' ? doc.name : 'Unnamed document');
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                              aria-label="Edit document name"
                            >
                              <Edit className="w-5 h-5" />
                            </button>
                            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                              Edit name
                            </div>
                          </div>
                        )}

                        {/* Copy button for documents */}
                        {canEditDocuments() && (
                          <div className="group relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                closeImagePreview();
                                handleDocumentCopyClick(doc.id, typeof doc.name === 'string' ? doc.name : 'Unnamed document');
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                              aria-label="Copy document"
                            >
                              <Copy className="w-5 h-5" />
                            </button>
                            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                              Copy
                            </div>
                          </div>
                        )}
                        
                        {/* Move button for documents */}
                        {canEditDocuments() && (
                          <div className="group relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                closeImagePreview();
                                handleDocumentMoveClick(doc.id, typeof doc.name === 'string' ? doc.name : 'Unnamed document');
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                              aria-label="Move document"
                            >
                              <FolderInput className="w-5 h-5" />
                            </button>
                            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                              Move
                            </div>
                          </div>
                        )}
                        
                        {/* Download button always shown for all users */}
                        <div className="group relative">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 block"
                            aria-label="Download document"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeImagePreview();
                            }}
                          >
                            <Download className="w-5 h-5" />
                          </a>
                          <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                            Download
                          </div>
                        </div>
                        
                        {/* Only show share button if user can share documents */}
                        {canShareDocuments() && (
                          <div className="group relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                closeImagePreview();
                                handleShare(doc.id, false);
                              }}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                              aria-label="Share document"
                              disabled={isSharing}
                            >
                              {isSharing && showSharePopup ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <Share2 className="w-5 h-5" />
                              )}
                            </button>
                            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                              Share
                            </div>
                          </div>
                        )}

                        {/* Only show delete button if user can delete documents */}
                        {canDeleteDocuments() && (
                          <div className="group relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                closeImagePreview();
                                confirmDelete(doc.id, 'document', typeof doc.name === 'string' ? doc.name : 'Unnamed document');
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-red-50"
                              aria-label="Delete document"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                              Delete
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}

                {!loading && !isReloading && !rootLoading && !isNotificationLoading && !isProcessingNotification &&
                 subFolders.length === 0 && currentDocs.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-12"
                  >
                    <p className="text-gray-500">
                      {searchQuery ? "No matching items found." : "No documents or folders found in this location."}
                    </p>
                    {searchQuery && (
                      <p className="text-sm text-gray-400 mt-2">
                        Try adjusting your search terms or filters
                      </p>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
          </>
        </>
      )}

      {/* Drag and drop overlay */}
      <>
        {showDragOverlay && hasUploadPermission() && !selectedDocument && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-primary-600 bg-opacity-30 backdrop-blur-sm"
            ref={dropZoneRef}
          >
            <div className="bg-white p-10 rounded-lg shadow-lg text-center border-2 border-dashed border-primary-500">
              <Upload className="w-16 h-16 mx-auto text-primary-500 mb-4" />
              <h3 className="text-xl font-medium text-primary-800 mb-2">Drop files or folders here</h3>
              <p className="text-gray-500">
                Drop your {draggedFileCount > 0 ? draggedFileCount : ''} item{draggedFileCount !== 1 ? 's' : ''} to upload 
                {currentFolder ? ` to "${currentFolder.name}"` : ''}
              </p>
              <div className="mt-3 text-xs text-gray-400">
                Supported formats: PDF, DWG, and document files
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Folder structure will be preserved on upload
              </div>
            </div>
          </motion.div>
        )}
      </>

      {renderEditPopup()}
      {renderSharePopup()}

      {/* Standard dialogs */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={`Delete ${itemToDelete?.type === 'folder' ? 'Folder' : 'Document'}`}
        message={`Are you sure you want to delete "${itemToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteItem}
        onCancel={() => setShowDeleteConfirm(false)}
        danger={true}
      />
      
      <RenameDialog
        isOpen={renameDialogOpen}
        title={`Rename ${itemToRename?.type === 'folder' ? 'Folder' : 'File'}`}
        currentName={itemToRename?.name || ''}
        itemType={itemToRename?.type === 'folder' ? 'folder' : 'file'}
        onRename={handleRename}
        onCancel={closeRenameDialog}
      />
      
      <PermissionsDialog
        isOpen={permissionsDialogOpen}
        title={`Edit ${itemForPermissions?.type === 'folder' ? 'Folder' : 'File'} Permissions`}
        itemId={itemForPermissions?.id || ''}
        itemType={itemForPermissions?.type || 'document'}
        currentPermission={itemForPermissions?.permission || 'STAFF_ONLY'}
        onSave={handleUpdatePermission}
        onCancel={closePermissionsDialog}
      />

      {/* Copy/Move dialog with folder selection */}
      {showCopyMoveDialog && (folderToCopyOrMove || documentToCopyOrMove) && selectedFiles.size === 0 && (
      <div className="fixed inset-0 flex items-center justify-center z-50">
        {/* Backdrop with blur effect */}
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200" 
          onClick={() => {
            setShowCopyMoveDialog(false);
            setFolderToCopyOrMove(null);
            setDocumentToCopyOrMove(null);
            setDestinationFolder("");
            setSelectedDestinationProjectId("");
            setSelectedDestinationFolderId("");
          }} 
          aria-hidden="true"
        />
        
        {/* Dialog */}
        <div className="relative bg-white rounded-xl shadow-lg w-full max-w-lg mx-4 overflow-visible transition-all duration-200 scale-100 opacity-100 max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200/80 flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-900">
              {copyMoveAction === 'copy' ? 'Copy' : 'Move'} {folderToCopyOrMove ? 'Folder' : 'Document'}
            </h3>
            <button
              onClick={() => {
                setShowCopyMoveDialog(false);
                setFolderToCopyOrMove(null);
                setDocumentToCopyOrMove(null);
                setDestinationFolder("");
                setSelectedDestinationProjectId("");
                setSelectedDestinationFolderId("");
              }}
              className="text-gray-500 hover:text-gray-700 transition-colors rounded-full p-1.5 hover:bg-gray-100/80 focus:outline-none focus:ring-2 focus:ring-blue-500/70"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Content */}
          <div className="p-6 overflow-y-auto flex-grow">
            <p className="text-gray-600 mb-4">
              {copyMoveAction === 'copy' ? 'Copy' : 'Move'} "{folderToCopyOrMove?.name || documentToCopyOrMove?.name || 'this item'}" to:
            </p>
            
            {/* Project selection dropdown */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Destination Project
              </label>
              <div className="relative">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent event propagation
                    setShowProjectDropdown(!showProjectDropdown);
                  }}
                >
                  <span className="truncate">
                    {selectedDestinationProjectId 
                      ? availableProjects.find(p => p.id === selectedDestinationProjectId)?.name || "Unknown project"
                      : "Select a project"
                    }
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                
                {showProjectDropdown && (
                  <div 
                    ref={projectDropdownRef}
                    className="fixed z-50 mt-1 bg-white shadow-lg rounded-md py-1 max-h-60 overflow-auto" 
                    style={{
                      width: 'calc(100% - 48px)',
                      left: '50%',
                      transform: 'translateX(-50%)'
                    }}
                  >
                    {isLoadingProjects ? (
                      <div className="flex justify-center items-center p-4">
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        <span className="ml-2 text-gray-600">Loading projects...</span>
                      </div>
                    ) : (
                      availableProjects.map(project => (
                        <button
                          key={project.id}
                          className={`w-full text-left px-4 py-2 hover:bg-gray-100 ${
                            selectedDestinationProjectId === project.id ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                          }`}
                          onClick={() => handleDestinationProjectChange(project.id)}
                        >
                          {project.name}
                        </button>
                      ))
                    )}
                    
                    {!isLoadingProjects && availableProjects.length === 0 && (
                      <div className="px-4 py-2 text-gray-500 text-sm">
                        No projects available
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Folder selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Destination Folder
              </label>
              
              <div className="relative">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent event propagation
                    if (selectedDestinationProjectId) {
                      setShowFolderDropdown(!showFolderDropdown);
                    } else {
                      showToast("Please select a project first", "error");
                    }
                  }}
                  disabled={!selectedDestinationProjectId}
                >
                  <span className="truncate">
                    {selectedDestinationFolderId 
                      ? getFolderNameById(selectedDestinationFolderId)
                      : "Root"
                    }
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                
                {showFolderDropdown && selectedDestinationProjectId && (
                  <div 
                    ref={folderDropdownRef}
                    className="fixed z-50 mt-1 bg-white shadow-lg rounded-md py-1 max-h-[300px] overflow-auto" 
                    style={{
                      width: 'calc(100% - 48px)',
                      left: '50%',
                      transform: 'translateX(-50%)'
                    }}
                  >
                    {isLoadingFolders ? (
                      <div className="flex justify-center items-center p-4">
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                        <span className="ml-2 text-gray-600">Loading folders...</span>
                      </div>
                    ) : (
                      <>
                        {/* Folder tree - directly display folders */}
                        {renderFolderTree(projectFolders[selectedDestinationProjectId] || [], undefined, 0)}
                        
                        {/* No folders message */}
                        {(projectFolders[selectedDestinationProjectId]?.length === 0) && (
                          <div className="px-4 py-2 text-gray-500 text-sm">
                            No folders available
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="mt-2 text-xs text-gray-500">
              Selected destination: {selectedDestinationProjectId ? 
                `${availableProjects.find(p => p.id === selectedDestinationProjectId)?.name || "Unknown"} / ${selectedDestinationFolderId ? 
                  getFolderNameById(selectedDestinationFolderId) : "Root"}` 
                : "Please select a destination"
              }
            </div>
          </div>
          
          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t border-gray-200/80 bg-gray-50/80 flex-shrink-0">
            <button
              onClick={() => {
                setShowCopyMoveDialog(false);
                setFolderToCopyOrMove(null);
                setDocumentToCopyOrMove(null);
                setDestinationFolder("");
                setSelectedDestinationProjectId("");
                setSelectedDestinationFolderId("");
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 
                         rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 
                         focus:ring-blue-500/50 transition-all duration-200"
              disabled={isCopyingOrMoving}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (folderToCopyOrMove && selectedDestinationProjectId && !isCopyingOrMoving) {
                  copyOrMoveFolder(
                    folderToCopyOrMove.id, 
                    selectedDestinationProjectId,
                    selectedDestinationFolderId,
                    copyMoveAction
                  );
                } else if (documentToCopyOrMove && selectedDestinationProjectId && !isCopyingOrMoving) {
                  copyOrMoveDocument(
                    documentToCopyOrMove.id,
                    selectedDestinationProjectId,
                    selectedDestinationFolderId,
                    copyMoveAction
                  );
                }
              }}
              disabled={!selectedDestinationProjectId || isCopyingOrMoving}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm 
                          focus:outline-none focus:ring-2 focus:ring-offset-1
                          transition-all duration-200 flex items-center justify-center min-w-[80px]
                          ${!selectedDestinationProjectId || isCopyingOrMoving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500/50'}`}
            >
              {isCopyingOrMoving ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {copyMoveAction === 'copy' ? "Copying..." : "Moving..."}
                </>
              ) : (
                <>{copyMoveAction === 'copy' ? "Copy" : "Move"}</>
              )}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Render popup */}
      {renderEditPopup()}
      
      {/* Render confirmation dialogs */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={`Delete ${itemToDelete?.type === 'folder' ? 'Folder' : 'File'}`}
        message={`Are you sure you want to delete "${itemToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteItem}
        onCancel={() => setShowDeleteConfirm(false)}
        danger={true}
      />
      
      <RenameDialog
        isOpen={renameDialogOpen}
        title={`Rename ${itemToRename?.type === 'folder' ? 'Folder' : 'File'}`}
        currentName={itemToRename?.name || ''}
        itemType={itemToRename?.type === 'folder' ? 'folder' : 'file'}
        onRename={handleRename}
        onCancel={closeRenameDialog}
      />
      
      <PermissionsDialog
        isOpen={permissionsDialogOpen}
        title={`Edit ${itemForPermissions?.type === 'folder' ? 'Folder' : 'File'} Permissions`}
        itemId={itemForPermissions?.id || ''}
        itemType={itemForPermissions?.type || 'document'}
        currentPermission={itemForPermissions?.permission || 'STAFF_ONLY'}
        onSave={handleUpdatePermission}
        onCancel={closePermissionsDialog}
      />

      {/* Drag and drop overlay */}
      <>
        {showDragOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center p-6"
          >
            <div className="bg-white rounded-xl p-8 max-w-md text-center shadow-2xl">
              <div className="mb-4 bg-primary-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                <Upload className="w-8 h-8 text-primary-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Drop {draggedFileCount > 1 ? 'Files' : 'File'} to Upload</h3>
              <p className="text-gray-600">
                Drop {draggedFileCount === 1 ? 'your file' : `your ${draggedFileCount} files`} anywhere to start uploading
              </p>
            </div>
          </motion.div>
        )}
      </>

      {/* Loading indicator for uploads */}
      <>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          >
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">Uploading Files</h2>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                <div 
                  className="bg-primary-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between text-sm text-gray-500 mb-4">
                <span>Uploading {uploadedFiles.total} file{uploadedFiles.total !== 1 ? 's' : ''}</span>
                <span>{uploadProgress}%</span>
              </div>
              
              {uploadedFiles.success > 0 && (
                <p className="text-center text-green-600 text-sm mb-1">
                  {uploadedFiles.success} file{uploadedFiles.success !== 1 ? 's' : ''} uploaded successfully
                </p>
              )}
              
              {uploadedFiles.failed > 0 && (
                <p className="text-center text-red-600 text-sm mb-1">
                  {uploadedFiles.failed} file{uploadedFiles.failed !== 1 ? 's' : ''} failed to upload
                </p>
              )}
              
              <p className="text-center text-gray-600 text-sm">
                {uploadProgress < 100 ? 
                  "Please wait while your files are being uploaded..." : 
                  "Upload complete!"}
              </p>
            </div>
          </motion.div>
        )}
      </>

      {/* Large image preview popup */}
      <>
        {showPreviewPopup && hoveredImageDoc && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
            style={{ 
              width: '240px',
              height: '240px',
              left: `${previewPosition.x}px`,
              top: `${previewPosition.y}px`,
              transform: 'none' // Remove the centered transform
            }}
          >
            <div className="relative w-full h-full">
              {isPreviewLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              )}
              <img
                src={hoveredImageDoc ? getThumbnailUrl(hoveredImageDoc) : ''}
                alt={hoveredImageDoc?.name || 'Preview'}
                className="w-full h-full object-contain"
                onLoad={() => setIsPreviewLoading(false)}
                onError={() => setIsPreviewLoading(false)}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 text-white p-2 text-sm truncate">
                {hoveredImageDoc?.name}
              </div>
            </div>
          </motion.div>
        )}
      </>
      
      {/* Download progress overlay */}
      <>
        {isDownloading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          >
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">Creating ZIP Archive</h2>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                <div 
                  className="bg-primary-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${downloadProgress}%` }}
                ></div>
              </div>
              
              <div className="flex justify-between text-sm text-gray-500 mb-4">
                <span>Archiving {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''}</span>
                <span>{downloadProgress}%</span>
              </div>
              
              <p className="text-center text-gray-600 text-sm">
                {downloadProgress < 100 ? 
                  "Please wait while your files are being processed..." : 
                  "Archive complete! Download will start automatically."}
              </p>
            </div>
          </motion.div>
        )}
      </>

      {/* Add multi-file move dialog */}
      <>
        {showCopyMoveDialog && (selectionMode === 'move' || selectionMode === 'copy') && selectedFiles.size > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 sm:p-6 overflow-y-auto"
          >
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
                <h2 className="text-xl font-semibold">
                  {selectionMode === 'copy' ? 'Copy' : 'Move'} {selectedFiles.size} Files
                </h2>
                <button
                  onClick={() => setShowCopyMoveDialog(false)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <p className="text-gray-600 mb-4">
                  Select destination folder:
                </p>
              
              {/* Project selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destination Project
                </label>
                
                <div className="relative">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  >
                    <span className="truncate">
                      {selectedDestinationProjectId 
                        ? availableProjects.find(p => p.id === selectedDestinationProjectId)?.name || "Unknown project"
                        : "Select a project"
                      }
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>
                  
                  {showProjectDropdown && (
                    <div
                      ref={projectDropdownRef}
                      className="absolute z-50 mt-1 w-full bg-white shadow-lg rounded-md py-1 max-h-60 overflow-auto border border-gray-200"
                    >
                      {isLoadingProjects ? (
                        <div className="flex justify-center items-center p-4">
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                          <span className="ml-2 text-gray-600">Loading projects...</span>
                        </div>
                      ) : (
                        availableProjects.map(project => (
                          <button
                            key={project.id}
                            className={`w-full text-left px-4 py-2 hover:bg-gray-100 ${
                              selectedDestinationProjectId === project.id ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                            }`}
                            onClick={() => handleDestinationProjectChange(project.id)}
                          >
                            {project.name}
                          </button>
                        ))
                      )}
                      
                      {!isLoadingProjects && availableProjects.length === 0 && (
                        <div className="px-4 py-2 text-gray-500 text-sm">
                          No projects available
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Folder selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destination Folder
                </label>
                
                <div className="relative">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent event propagation
                      if (selectedDestinationProjectId) {
                        setShowFolderDropdown(!showFolderDropdown);
                      } else {
                        showToast("Please select a project first", "error");
                      }
                    }}
                    disabled={!selectedDestinationProjectId}
                  >
                    <span className="truncate">
                      {selectedDestinationFolderId 
                        ? getFolderNameById(selectedDestinationFolderId)
                        : "Root"
                      }
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>
                  
                  {showFolderDropdown && selectedDestinationProjectId && (
                    <div
                      ref={folderDropdownRef}
                      className="absolute z-50 mt-1 w-full bg-white shadow-lg rounded-md py-1 max-h-[300px] overflow-auto border border-gray-200"
                    >
                      {isLoadingFolders ? (
                        <div className="flex justify-center items-center p-4">
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                          <span className="ml-2 text-gray-600">Loading folders...</span>
                        </div>
                      ) : (
                        <>
                          {/* Folder tree - directly display folders */}
                          {renderFolderTree(projectFolders[selectedDestinationProjectId] || [], undefined, 0)}
                          
                          {/* No folders message */}
                          {(projectFolders[selectedDestinationProjectId]?.length === 0) && (
                            <div className="px-4 py-2 text-gray-500 text-sm">
                              No folders available
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="mt-2 text-xs text-gray-500">
                Selected destination: {selectedDestinationProjectId ?
                  `${availableProjects.find(p => p.id === selectedDestinationProjectId)?.name || "Unknown"} / ${selectedDestinationFolderId ?
                    getFolderNameById(selectedDestinationFolderId) : "Root"}`
                  : "Please select a destination"
                }
              </div>

              {/* Progress Bar for Bulk Move */}
              {movingFiles && selectedFiles.size > 1 && (
                <div className="mt-4 mb-2">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Moving {selectedFiles.size} documents...</span>
                    <span>{moveProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-primary-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${moveProgress}%` }}
                    />
                  </div>
                </div>
              )}
              </div>

              {/* Footer - Inside dialog container */}
              <div className="flex justify-end gap-3 p-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
              <button
                onClick={() => {
                  setShowCopyMoveDialog(false);
                  setFolderToCopyOrMove(null);
                  setDocumentToCopyOrMove(null);
                  setDestinationFolder("");
                  setSelectedDestinationProjectId("");
                  setSelectedDestinationFolderId("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 
                           rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 
                           focus:ring-blue-500/50 transition-all duration-200"
                disabled={isCopyingOrMoving}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!selectedDestinationProjectId) {
                    showToast("Please select a destination project", "error");
                    return;
                  }

                  // Handle bulk move operation
                  if (selectionMode === 'move' && selectedFiles.size > 0) {
                    // Filter to only documents
                    const selectedDocs = documents.filter(doc => selectedFiles.has(doc.id));

                    if (selectedDocs.length === 0) {
                      showToast("No documents selected", "error");
                      return;
                    }

                    // Validate not moving to same folder
                    if (selectedDestinationFolderId === currentFolder?.id) {
                      showToast("Documents are already in this folder", "error");
                      return;
                    }

                    setMovingFiles(true);
                    setMoveProgress(0);

                    let successCount = 0;
                    let failCount = 0;

                    try {
                      for (let i = 0; i < selectedDocs.length; i++) {
                        try {
                          if (onCopyOrMoveFile) {
                            await onCopyOrMoveFile(selectedDocs[i].id, selectedDestinationFolderId, 'move');
                          }
                          successCount++;

                          // Update progress
                          const progress = Math.round(((i + 1) / selectedDocs.length) * 100);
                          setMoveProgress(progress);
                        } catch (error) {
                          failCount++;
                          console.error(`Failed to move ${selectedDocs[i].name}:`, error);
                        }
                      }

                      // Show feedback
                      if (failCount === 0) {
                        showToast(`Successfully moved ${successCount} document${successCount > 1 ? 's' : ''}`, "success");
                      } else if (successCount > 0) {
                        showToast(`Moved ${successCount} documents, ${failCount} failed`, "warning");
                      } else {
                        showToast("Failed to move documents", "error");
                      }

                      // Close dialog and exit selection mode
                      setShowCopyMoveDialog(false);
                      exitSelectionMode();

                      // Refresh the view
                      if (onRefresh) {
                        await onRefresh();
                      }
                    } catch (error) {
                      console.error("Bulk move error:", error);
                      showToast("An error occurred during move operation", "error");
                    } finally {
                      setMovingFiles(false);
                      setMoveProgress(0);
                    }
                  }
                  // Handle single folder operation
                  else if (folderToCopyOrMove && selectedDestinationProjectId && !isCopyingOrMoving) {
                    copyOrMoveFolder(
                      folderToCopyOrMove.id,
                      selectedDestinationProjectId,
                      selectedDestinationFolderId,
                      copyMoveAction
                    );
                  }
                  // Handle single document operation
                  else if (documentToCopyOrMove && selectedDestinationProjectId && !isCopyingOrMoving) {
                    copyOrMoveDocument(
                      documentToCopyOrMove.id,
                      selectedDestinationProjectId,
                      selectedDestinationFolderId,
                      copyMoveAction
                    );
                  }
                }}
                disabled={!selectedDestinationProjectId || isCopyingOrMoving}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm 
                            focus:outline-none focus:ring-2 focus:ring-offset-1
                            transition-all duration-200 flex items-center justify-center min-w-[80px]
                            ${!selectedDestinationProjectId || isCopyingOrMoving ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500/50'}`}
              >
                {isCopyingOrMoving ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {copyMoveAction === 'copy' ? "Copying..." : "Moving..."}
                  </>
                ) : (
                  <>{copyMoveAction === 'copy' ? "Copy" : "Move"}</>
                )}
              </button>
            </div>
            </div>
          </motion.div>
        )}
      </>

      {/* Move confirmation dialog */}
      <>
        {showMoveConfirmation && moveTargetFolder && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          >
            <div className="bg-white rounded-lg shadow-xl overflow-hidden max-w-md w-full">
              <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Move Files</h3>
                <p className="text-gray-600">
                  Move {draggedFiles.length} {draggedFiles.length === 1 ? 'file' : 'files'} to folder "{moveTargetFolder.name}"?
                </p>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={() => {
                    moveFilesToFolder(moveTargetFolder.id);
                    setShowMoveConfirmation(false);
                    setMoveTargetFolder(null);
                  }}
                  disabled={moveInProgress}
                  className={`w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 
                              ${moveInProgress ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} 
                              text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 
                              focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm`}
                >
                  {moveInProgress ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Moving...
                    </>
                  ) : (
                    'Move'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoveConfirmation(false);
                    setMoveTargetFolder(null);
                  }}
                  disabled={moveInProgress}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 
                            bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 
                            focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </>

      {/* Breadcrumbs are already included at the top of the component */}
    </div>
  );
}
