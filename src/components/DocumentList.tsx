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
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
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
  onCreateDocument?: (name: string, type: "pdf" | "dwg" | "other", file: File, folderId?: string) => Promise<void>;
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

  // Use the local folders from state for rendering if available, otherwise use the prop folders
  const displayFolders = isSharedView ? sharedFolders || [] : (localFolders.length > 0 ? localFolders : folders);

  // Update local state when props change
  useEffect(() => {
    setLocalDocuments(documents);
  }, [documents]);
  
  useEffect(() => {
    setLocalFolders(folders);
  }, [folders]);

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

  const allDocs = isSharedView ? sharedDocuments || [] : localDocuments.filter(
    (doc) => doc.folderId === currentFolder?.id
  );
  const allFolders = isSharedView ? sharedFolders || [] : localFolders.filter(
    (folder) => folder.parentId === currentFolder?.id
  );


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
      : displayFolders.filter(folder =>
          folder.parentId === currentFolder?.id && // Only filter direct children of current folder
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

    // Apply permission filter based on user role
    // if (user?.role !== 'Staff' && user?.role !== 'Admin') {
    //   // For non-staff users, filter based on their role
    //   if (user?.role === 'Contractor') {
    //     // Contractors can see folders with CONTRACTORS_WRITE or CLIENTS_READ or ALL permission
    //     filteredFolders = filteredFolders.filter(folder => {
    //       if (folder.metadata && 'access' in folder.metadata) {
    //         const access = folder.metadata.access as string;
    //         return access === 'CONTRACTORS_WRITE' || access === 'CLIENTS_READ' || access === 'ALL';
    //       }
    //       return false;
    //     });

    //     filteredDocs = filteredDocs.filter(doc => {
    //       if (doc.metadata && 'access' in doc.metadata) {
    //         const access = doc.metadata.access as string;
    //         return access === 'CONTRACTORS_WRITE' || access === 'CLIENTS_READ' || access === 'ALL';
    //       }
    //       return false;
    //     });
    //   } else if (user?.role === 'Client') {
    //     // Clients can only see folders with CLIENTS_READ or ALL permission
    //     filteredFolders = filteredFolders.filter(folder => {
    //       if (folder.metadata && 'access' in folder.metadata) {
    //         const access = folder.metadata.access as string;
    //         return access === 'CLIENTS_READ' || access === 'ALL';
    //       }
    //       return false;
    //     });

    //     filteredDocs = filteredDocs.filter(doc => {
    //       if (doc.metadata && 'access' in doc.metadata) {
    //         const access = doc.metadata.access as string;
    //         return access === 'CLIENTS_READ' || access === 'ALL';
    //       }
    //       return false;
    //     });
    //   } else {
    //     // Default handling for any other role
    //     filteredFolders = filteredFolders.filter(folder => {
    //       if (folder.metadata && 'access' in folder.metadata) {
    //         const access = folder.metadata.access as string;
    //         return access === 'ALL';
    //       }
    //       return false;
    //     });

    //     filteredDocs = filteredDocs.filter(doc => {
    //       if (doc.metadata && 'access' in doc.metadata) {
    //         const access = doc.metadata.access as string;
    //         return access === 'ALL';
    //       }
    //       return false;
    //     });
    //   }
    // } else {
    //   // Staff users see all items regardless of permission
    //   console.log('Staff user - showing all items regardless of permission');
    // }

    // Apply view filter
    // if (viewFilter === 'files') {
    //   filteredFolders = [];
    // } else if (viewFilter === 'folders') {
    //   filteredDocs = [];
    // }

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
      const token = await createShareToken(
        resourceId,
        isFolder ? 'folder' : 'file',
        user?.id || '',
        { expiresInHours: 168 } // 7 days
      );
      
      // Copy to clipboard
      const shareUrl = `${window.location.origin}/shared/${token.id}`;
      navigator.clipboard.writeText(shareUrl);
      
      showToast('Share link copied to clipboard', 'success');
    } catch (error) {
      console.error('Sharing failed:', error);
      showToast('Failed to create share link', 'error');
    }
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
      
      const { fileId, folderId, notificationType, forceDirect } = event.detail;
      
      // Handle forced direct navigation (from cross-project notifications)
      // No longer check if projectId matches - we always process all notifications
      // since we are now handling direct navigation across projects
      
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
                    } else {
                      console.log('File still not found after folder navigation');
                    }
                  }, 500);
                } else {
                  console.log('Target folder not found in current folder list');
                }
              }
            }
          } else if (folderId && folderId !== currentFolder?.id) {
            // Just navigate to the folder
            const targetFolder = folders.find(folder => folder.id === folderId);
            if (targetFolder && onFolderSelect) {
              console.log('Navigating to folder from notification:', targetFolder?.name || 'unnamed folder');
              onFolderSelect(targetFolder);
            } else {
              console.log('Target folder not found in current folder list');
            }
          }
        });
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
    
    // Just need to set the item details, not the position
    setPopupPosition({ x: 0, y: 0 }); // Still set position to trigger popup visibility
    setPopupItem({id, type, name});
  };
  
  // Add a function to close the popup
  const closePopup = () => {
    setPopupPosition(null);
    setPopupItem(null);
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

      const originalName = popupItem.name;
      const newName = editNameField.trim();
      let nameChanged = newName !== originalName;

      // Check if the permission selected now is different from the one present when the popup opened
      let permissionChanged = user?.role === 'Staff' && selectedPermission !== initialPermissionOnPopupOpen;

      let renamePromise: Promise<void> = Promise.resolve();
      let permissionPromise: Promise<void> = Promise.resolve();

      // --- Rename Logic ---
      if (nameChanged) {
        if (popupItem.type === 'folder') {
          renamePromise = onUpdateFolder(popupItem.id, newName);
        } else {
          renamePromise = onUpdateDocument(popupItem.id, { name: newName });
        }
      }

      // --- Permission Logic ---
      if (permissionChanged) {
        setIsSavingPermission(true); // Start loading state for permission save
        if (popupItem.type === 'folder' && onUpdateFolderPermission) {
          permissionPromise = onUpdateFolderPermission(popupItem.id, selectedPermission);
        } else if (popupItem.type === 'document' && onUpdateDocumentPermission) {
          permissionPromise = onUpdateDocumentPermission(popupItem.id, selectedPermission);
        } else {
          // Fallback direct update (less ideal as it bypasses parent logic)
          console.warn("Using fallback permission update for", popupItem.type);
          const itemRef = doc(db, popupItem.type === 'folder' ? 'folders' : 'documents', popupItem.id);
          permissionPromise = updateDoc(itemRef, {
            'metadata.access': selectedPermission,
            'updatedAt': new Date().toISOString()
          });
        }
      }

      try {
        // Wait for both promises
        await Promise.all([renamePromise, permissionPromise]);

        // Show success toast only if something actually changed
        if (nameChanged || permissionChanged) {
           showToast(`${popupItem.type === 'folder' ? 'Folder' : 'File'} updated successfully`, 'success');
        }

        // Close popup and refresh if needed
        closePopup();
        if ((nameChanged || permissionChanged) && onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error("Error saving changes:", error);
        showToast(`Failed to update ${popupItem.type}`, 'error');
      } finally {
        // Ensure loading state is turned off even if there's an error
        if (permissionChanged) {
          setIsSavingPermission(false);
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
                disabled={isSavingPermission} // Disable while saving
              />
            </div>

            {/* Permissions Section - Only for staff users */}
            {user?.role === 'Staff' && (
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
                disabled={isSavingPermission} // Disable cancel while saving permission
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                className={`px-4 py-2 rounded-md transition-colors flex items-center justify-center min-w-[120px] ${
                  isSavingPermission
                    ? 'bg-primary-400 text-white cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
                disabled={!editNameField.trim() || isSavingPermission || isFetchingPermission} // Disable if saving, fetching, or name is empty
              >
                {isSavingPermission ? (
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
      
      if (files.length === 1) {
        // Single file upload - unchanged
        const file = files[0];
        const fileName = file.name;
        
        // Determine file type from extension
        let fileType: "pdf" | "dwg" | "other" = "other";
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension === 'pdf') {
          fileType = "pdf";
        } else if (extension === 'dwg') {
          fileType = "dwg";
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
            await onCreateDocument(fileName, fileType, file, currentFolder?.id);
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
        console.log(`Uploading ${files.length} files using batch method`);
        
        // Simulate progress updates
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            const newProgress = prev + 5;
            return newProgress >= 90 ? 90 : newProgress;
          });
        }, 300);
        
        try {
          // Make sure we're passing a valid array to the createMultipleDocuments function
          await onCreateMultipleDocuments(files, currentFolder?.id);
          setUploadedFiles(prev => ({...prev, success: files.length}));
          showToast(`${files.length} files uploaded successfully`, "success");
        } catch (error) {
          console.error("Error in multiple file upload:", error);
          console.log("Falling back to individual file upload method");
          clearInterval(progressInterval);
          
          // If batch upload fails, fall back to individual upload
          return handleMultipleFileUpload(files);
        } finally {
          clearInterval(progressInterval);
          setUploadProgress(100);
        }
      } else {
        // No multiple document upload handler available
        console.log("Multiple document batch upload not available, using individual upload method");
        return handleMultipleFileUpload(files);
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
      
      // Process the files for upload
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

    console.log(`Processing ${files.length} files individually`);
    setIsUploading(true);
    setUploadProgress(0);
    
    // Reset counters if not already set
    setUploadedFiles(prev => {
      if (prev.total !== files.length) {
        return {
          total: files.length,
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
    const progressIncrement = 100 / files.length;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
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
      let fileType: "pdf" | "dwg" | "other" = "other";
      const extension = fileName.split('.').pop()?.toLowerCase();
      
      if (extension === 'pdf') {
        fileType = "pdf";
      } else if (extension === 'dwg') {
        fileType = "dwg";
      } else {
        // Check if it's a valid document file
        const validExtensions = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'rtf'];
        if (!validExtensions.includes(extension || '') && extension !== undefined) {
          console.warn(`File with extension .${extension} may not be supported: ${fileName}`);
        }
      }
      
      try {
        // Check if file has path information (from folder upload)
        let targetFolderId = currentFolder?.id;
        
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
              targetFolderId = folderPathMap[folderPath];
              console.log(`Using existing folder at path ${folderPath} with ID: ${targetFolderId}`);
            } else {
              // Need to create the folder structure
              console.log(`Creating folder structure for: ${folderPath}`);
              
              let currentPathId = currentFolder?.id;
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
                targetFolderId = currentPathId;
                folderPathMap[folderPath] = currentPathId;
              }
            }
            
            // Now upload the file to the correct folder
            console.log(`Uploading file "${displayName}" to folder ID: ${targetFolderId || 'root folder'}`);
            if (onCreateDocument) {
              await onCreateDocument(displayName, fileType, file, targetFolderId);
            } else {
              throw new Error("Document creation is not available");
            }
          } else {
            // No folders in path, just upload the file
            if (onCreateDocument) {
              await onCreateDocument(fileName, fileType, file, currentFolder?.id);
            } else {
              throw new Error("Document creation is not available");
            }
          }
        } else {
          // No path information, just upload the file to current folder
          if (onCreateDocument) {
            await onCreateDocument(fileName, fileType, file, currentFolder?.id);
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
      showToast(`${successCount} of ${files.length} files uploaded successfully`, 
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
      (name: string, type: "pdf" | "dwg" | "other", file: File, folderId?: string) => 
        onCreateDocument(name, type, file, folderId) : 
      // Fallback implementation that shows an error message
      ((name: string, type: "pdf" | "dwg" | "other", file: File, folderId?: string): Promise<void> => {
        showToast("Document creation is not available", "error");
        return Promise.reject(new Error("Document creation is not available"));
      }) as (name: string, type: "pdf" | "dwg" | "other", file: File, folderId?: string) => Promise<void>;
    
    return (
      <DocumentActions
        projectId={projectId}
        currentFolderId={currentFolder?.id}
        folders={folders}
        onCreateFolder={onCreateFolder}
        onCreateDocument={createDocumentHandler}
        onCreateMultipleDocuments={onCreateMultipleDocuments}
        onRefresh={onRefresh}
        onShare={onShare}
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

    // Set up the subscription
    const unsubscribe = subscribeToFolderDocuments(currentFolder.id, (updatedDocuments) => {
      console.log(`[Document List] Received ${updatedDocuments.length} documents from real-time update`);

      // Update local state with the latest documents
      setLocalDocuments(updatedDocuments);
    });

    // Store the unsubscribe function
    unsubscribeDocRef.current = unsubscribe;
    hasActiveDocSubscription.current = true;

    // Cleanup on unmount or when the folder changes
    return () => {
      if (unsubscribeDocRef.current) {
        console.log('[Document List] Cleaning up document subscription');
        unsubscribeDocRef.current();
        unsubscribeDocRef.current = null;
        hasActiveDocSubscription.current = false;
      }
    };
  }, [currentFolder, isSharedView]);
  
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
  
  // Simple function to check if the document is a PDF
  const isPdf = (doc?: Document) => {
    if (!doc) return false;
    if (doc.type === "pdf") return true;
    
    // Check by extension if type not explicitly set
    return doc.name.toLowerCase().endsWith(".pdf");
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
            if (user.role === 'Staff') {
              fetchedProjects = await projectService.getAll();
            } else {
              fetchedProjects = await projectService.getUserProjects(user.id);
            }
          }
          
          // If no projects were fetched but we have a selected project, use that
          if (fetchedProjects.length === 0 && selectedProject) {
            fetchedProjects = [selectedProject];
          }
          
          setAvailableProjects(fetchedProjects);
          
          // Set the current project as default if available
          if (selectedProject) {
            setSelectedDestinationProjectId(selectedProject.id);
            
            // Load the folders for this project
            await loadProjectFolders(selectedProject.id);
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
    return folder ? folder.name : "Unknown folder";
  };
  
  // Helper to build folder tree structure
  const buildFolderTree = (folders: Folder[], parentId?: string): Folder[] => {
    return folders
      .filter(folder => folder.parentId === parentId)
      .map(folder => folder);
  };
  
  // Recursively render folder tree
  const renderFolderTree = (folders: Folder[], parentId?: string, level: number = 0) => {
    const folderItems = buildFolderTree(folders, parentId);
    
    return (
      <div style={{ marginLeft: level > 0 ? `${level * 16}px` : '0' }}>
        {folderItems.map(folder => {
          const hasChildren = folders.some(f => f.parentId === folder.id);
          const isExpanded = expandedFolders.has(folder.id);
          
          return (
            <div key={folder.id}>
              <div 
                className="flex items-center py-2 px-2 hover:bg-gray-100 rounded cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent event propagation
                  handleDestinationFolderSelect(folder.id);
                }}
              >
                {hasChildren ? (
                  <button 
                    className="mr-1 p-1 rounded-full hover:bg-gray-200"
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                      e.stopPropagation(); // Prevent event propagation
                      toggleFolderExpansion(folder.id, e);
                    }}
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                ) : (
                  <span className="w-6" />
                )}
                <FolderOpen className="w-4 h-4 mr-2 text-gray-400" />
                <span className={`truncate ${selectedDestinationFolderId === folder.id ? 'font-medium text-blue-600' : 'text-gray-700'}`}>
                  {folder.name}
                </span>
                {selectedDestinationFolderId === folder.id && (
                  <Check className="w-4 h-4 ml-2 text-blue-600" />
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
    }
  };
  
  // Update the copyOrMoveFolder function
  const copyOrMoveFolder = async (source_folder: string, destination_project_id: string, destination_folder: string, action: 'move' | 'copy') => {
    try {
      // Set loading state to true when operation starts
      setIsCopyingOrMoving(true);
      
      // First, get the source folder details to show in toast notification
      const sourceFolderDetails = folders.find(f => f.id === source_folder) || 
                                 await folderService.getById(source_folder);
      
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
          const copiedFolderId = await folderService.copyFolder(
            source_folder,
            destination_project_id,
            destination_folder || undefined
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
      loadProjectFolders(projectId);
    }
  };

  // Add function to handle move button click
  const handleMoveClick = (id: string, name: string) => {
    setFolderToCopyOrMove({id, name});
    setCopyMoveAction('move');
    setShowCopyMoveDialog(true);
    setSelectedDestinationProjectId(projectId || "");
    if (projectId) {
      loadProjectFolders(projectId);
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
      
      // Refresh regardless of action
      if (onRefresh) {
        console.log('[DocumentList] Refreshing due to folder operation');
        onRefresh();
      }
      
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
        <div className="flex justify-between items-center border-b px-4 py-3 bg-white">
          <DocumentBreadcrumbs
            folders={folders}
            currentFolder={currentFolder}
            selectedDocument={selectedDocument}
            onNavigate={handleBreadcrumbNavigation}
            onDocumentClick={() => selectedDocument && onPreview(selectedDocument)}
          />
          
          {/* Replace DocumentActions with the conditional rendering function */}
          {renderUploadButtons()}
        </div>
      )}
      
      {selectedDocument ? (
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
                
                <AnimatePresence>
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
                </AnimatePresence>
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
                
                <AnimatePresence>
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
                </AnimatePresence>
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

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center py-12"
              >
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
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
                    className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <button
                      onClick={() => onFolderSelect?.(folder)}
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
                            >
                              <Share2 className="w-5 h-5" />
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
                    className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <button
                      onClick={() => {
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
                      <FileText className="w-6 h-6 text-gray-400" />
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
                    {!isSharedView && (
                      <div className="flex items-center space-x-1">
                        {/* Only show edit button if user can edit documents */}

                        {/* Copy button for documents */}
                        {canEditDocuments() && (
                          <div className="group relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Logic to copy the document
                                showToast(`Copying document functionality not implemented yet`, 'error');
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
                      
                        
                        {/* Download button always shown for all users */}
                        <div className="group relative">
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            download
                            className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 block"
                            aria-label="Download document"
                            onClick={(e) => e.stopPropagation()}
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
                              onClick={() => handleShare(doc.id, false)}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                              aria-label="Share document"
                            >
                              <Share2 className="w-5 h-5" />
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

                {subFolders.length === 0 && currentDocs.length === 0 && (
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
          </AnimatePresence>
        </>
      )}

      {/* Standard dialogs */}
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

      {/* Copy/Move dialog with folder selection */}
      <div className={`fixed inset-0 flex items-center justify-center z-50 ${showCopyMoveDialog ? 'block' : 'hidden'}`}>
        {/* Backdrop with blur effect */}
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200" 
          onClick={() => {
            setShowCopyMoveDialog(false);
            setFolderToCopyOrMove(null);
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
              {copyMoveAction === 'copy' ? 'Copy' : 'Move'} Folder
            </h3>
            <button
              onClick={() => {
                setShowCopyMoveDialog(false);
                setFolderToCopyOrMove(null);
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
              {copyMoveAction === 'copy' ? 'Copy' : 'Move'} "{folderToCopyOrMove?.name || 'this folder'}" to:
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
                      : "Root folder"
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
                        {/* Root folder option */}
                        <button
                          className={`w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center ${
                            selectedDestinationFolderId === "" ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                          }`}
                          onClick={() => handleDestinationFolderSelect("")}
                        >
                          <Home className="w-4 h-4 mr-2 text-gray-400" />
                          <span>Root folder</span>
                          {selectedDestinationFolderId === "" && (
                            <Check className="w-4 h-4 ml-2 text-blue-600" />
                          )}
                        </button>
                        
                        {/* Folder tree */}
                        {renderFolderTree(projectFolders[selectedDestinationProjectId] || [])}
                        
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
                  getFolderNameById(selectedDestinationFolderId) : "Root folder"}` 
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

      {renderEditPopup()}

      {/* Drag and drop overlay */}
      <AnimatePresence>
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
      </AnimatePresence>

      {/* Loading indicator for uploads */}
      <AnimatePresence>
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
      </AnimatePresence>
    </div>
  );
}
