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
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Document, Folder } from "../types";
import DocumentBreadcrumbs from "./DocumentBreadcrumbs";
import DocumentActions from "./DocumentActions";
import DocumentViewer from "./DocumentViewer";
import { motion, AnimatePresence } from "framer-motion";
import { Timestamp } from "firebase/firestore";
import { createShareToken } from '../services/shareService';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { RenameDialog } from './ui/RenameDialog';
import { NOTIFICATION_DOCUMENT_UPDATE_EVENT } from './NotificationIcon';

// Local type definition for the DocumentViewer's Folder type
interface ViewerFolder {
  id: string;
  name: string;
}

interface DocumentListProps {
  documents: Document[];
  folders: Folder[];
  currentFolder?: Folder;
  projectId: string;
  onFolderSelect?: (folder?: Folder) => void;
  onPreview: (document: Document) => void;
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onCreateDocument: (
    name: string,
    type: Document["type"],
    file: File,
    folderId?: string
  ) => Promise<void>;
  onUpdateFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onUpdateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onShare: (id: string, isFolder: boolean) => Promise<void>;
  isSharedView?: boolean;
  sharedDocuments?: Document[];
  sharedFolders?: Folder[];
  selectedFile?: Document;
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
  onFolderSelect,
  onPreview,
  onCreateFolder,
  onCreateDocument,
  onUpdateFolder,
  onDeleteFolder,
  onUpdateDocument,
  onDeleteDocument,
  onRefresh,
  onShare,
  isSharedView,
  sharedDocuments,
  sharedFolders,
  selectedFile,
}: DocumentListProps) {
  const [editingId, setEditingId] = useState<string>();
  const [editName, setEditName] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Document>();
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{id: string, type: 'document' | 'folder', name: string} | null>(null);
  
  // Add new state for rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState<{id: string, type: 'document' | 'folder', name: string} | null>(null);

  const currentDocs = isSharedView ? sharedDocuments || [] : documents.filter(
    (doc) => doc.folderId === currentFolder?.id
  );
  const subFolders = isSharedView ? sharedFolders || [] : folders.filter(
    (folder) => folder.parentId === currentFolder?.id
  );

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

  const handleBreadcrumbNavigation = (folder?: ViewerFolder) => {
    if (selectedDocument) {
      setSelectedDocument(undefined);
    }
    
    if (folder) {
      // Find the corresponding folder from our folders array
      const matchingFolder = folders.find(f => f.id === folder.id);
      onFolderSelect?.(matchingFolder);
    } else {
      onFolderSelect?.(undefined);
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
      showToast(`${itemToDelete.name} deleted successfully`, 'success');
    } catch (error) {
      console.error('Delete failed:', error);
      showToast(`Failed to delete ${itemToDelete.name}`, 'error');
    } finally {
      setItemToDelete(null);
      setDeleteConfirmOpen(false);
    }
  };

  const confirmDelete = (id: string, type: 'document' | 'folder', name: string) => {
    setItemToDelete({ id, type, name });
    setDeleteConfirmOpen(true);
  };

  const renderBreadcrumbs = () => {
    if (selectedDocument) {
      const currentFolder = folders.find(
        (f) => f.id === selectedDocument.folderId
      );

      return (
        <nav
          className="flex items-center text-sm text-gray-600 px-4 pt-2"
          aria-label="Breadcrumb"
        >
          <button
            onClick={() => handleBreadcrumbNavigation(undefined)}
            className="flex items-center hover:text-gray-900 px-2 py-1 rounded-md transition-colors hover:bg-gray-100"
          >
            <Home className="w-4 h-4 mr-1.5" />
            <span>Documents</span>
          </button>

          {currentFolder && (
            <>
              <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
              <button
                onClick={() => handleBreadcrumbNavigation(currentFolder)}
                className="flex items-center px-2 py-1 rounded-md transition-colors hover:bg-gray-100"
              >
                <FolderOpen className="w-4 h-4 mr-1.5 text-gray-400" />
                <span>{currentFolder.name}</span>
              </button>
            </>
          )}

          <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />
          <span className="px-2 py-1 text-gray-900 font-medium">
            {selectedDocument.name}
          </span>
        </nav>
      );
    }

    return (
      <DocumentBreadcrumbs
        folders={folders}
        currentFolder={currentFolder}
        onNavigate={handleBreadcrumbNavigation}
      />
    );
  };

  // Add this effect to handle selected file from URL
  useEffect(() => {
    if (selectedFile) {
      console.log("Setting selected document from selectedFile prop:", selectedFile.name);
      setSelectedDocument(selectedFile);
    }
  }, [selectedFile]);

  // Add additional effect to handle documents array changes
  useEffect(() => {
    if (documents.length > 0 && !selectedDocument && selectedFile) {
      console.log("Documents loaded, setting selected document:", selectedFile.name);
      setSelectedDocument(selectedFile);
    }
  }, [documents, selectedDocument, selectedFile]);

  // Monitor for project changes while we have a selectedFile
  useEffect(() => {
    // Only proceed if we have a selectedFile and documents are loaded
    if (selectedFile && documents.length > 0) {
      console.log(`Looking for selected file ${selectedFile.id} in documents array of ${documents.length} items`);
      
      // Function to find and set the document
      const findAndSetDocument = () => {
        const foundDoc = documents.find(d => d.id === selectedFile.id);
        if (foundDoc) {
          console.log(`Found document in array: ${foundDoc.name}`);
          if (!selectedDocument || selectedDocument.id !== foundDoc.id) {
            console.log(`Setting selected document to: ${foundDoc.name}`);
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
              console.log('Navigating to file from notification:', fileToSelect.name);
              if (onPreview) {
                onPreview(fileToSelect);
              }
            } else {
              console.log('File not found in current document list, may need to fetch');
              
              // If the file is in a different folder, we may need to navigate to that folder first
              if (folderId && folderId !== currentFolder?.id) {
                const targetFolder = folders.find(folder => folder.id === folderId);
                if (targetFolder && onFolderSelect) {
                  console.log('Navigating to folder from notification:', targetFolder.name);
                  onFolderSelect(targetFolder);
                  
                  // After navigating to the folder, we need to find the file again
                  // Set a timeout to give time for the folder navigation to complete
                  setTimeout(() => {
                    // Try to find the file again after folder navigation
                    const updatedFileToSelect = documents.find(doc => doc.id === fileId);
                    if (updatedFileToSelect && onPreview) {
                      console.log('Found file after folder navigation:', updatedFileToSelect.name);
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
              console.log('Navigating to folder from notification:', targetFolder.name);
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

  return (
    <div
      className={`h-full flex flex-col ${
        selectedDocument ? "bg-gray-100" : "p-6"
      }`}
    >
      <div
        className={`flex items-center justify-between ${
          selectedDocument ? "p-4" : "mb-6"
        }`}
      >
        {renderBreadcrumbs()}
        {!selectedDocument && !isSharedView && (
          <DocumentActions
            projectId={projectId}
            currentFolderId={currentFolder?.id}
            folders={folders}
            onCreateFolder={onCreateFolder}
            onCreateDocument={onCreateDocument}
            onRefresh={onRefresh}
          />
        )}
      </div>

      {selectedDocument ? (
        <div className="flex-1 min-h-0">
          <DocumentViewer
            document={selectedDocument}
            onClose={() => setSelectedDocument(undefined)}
            onRefresh={onRefresh}
            folders={folders.map(f => ({ id: f.id, name: f.name }))}
            onNavigateToFolder={handleBreadcrumbNavigation}
            viewerHeight={600}
            setViewerHeight={(height: number) => {
              console.log('Viewer height updated:', height);
              // You can add state for this if needed
            }}
          />
        </div>
      ) : (
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
              className="space-y-2"
            >
              {subFolders.map((folder) => (
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
                      {folder.name}
                    </span>
                  </button>
                  {!isSharedView && (
                    <div className="flex items-center space-x-1">
                      <div className="group relative">
                        <button
                          onClick={() => openRenameDialog(folder.id, 'folder', folder.name)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                          aria-label="Rename folder"
                        >
                          <Pencil className="w-5 h-5" />
                        </button>
                        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                          Rename
                        </div>
                      </div>
                      <div className="group relative">
                        <button
                          onClick={() => confirmDelete(folder.id, 'folder', folder.name)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
                          aria-label="Delete folder"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                          Delete
                        </div>
                      </div>
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
                        setSelectedDocument(doc);
                      }
                    }}
                    className="flex items-center space-x-3 flex-1"
                  >
                    <FileText className="w-6 h-6 text-gray-400" />
                    <div>
                      <div className="text-left">
                        <span className="font-medium text-gray-900">
                          {doc.name}
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
                      <div className="group relative">
                        <button
                          onClick={() => openRenameDialog(doc.id, 'document', doc.name)}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                          aria-label="Rename document"
                        >
                          <Pencil className="w-5 h-5" />
                        </button>
                        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                          Rename
                        </div>
                      </div>
                      <div className="group relative">
                        <button
                          onClick={() => confirmDelete(doc.id, 'document', doc.name)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
                          aria-label="Delete document"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                          Delete
                        </div>
                      </div>
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
                    No documents or folders found in this location.
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title={`Delete ${itemToDelete?.type === 'folder' ? 'Folder' : 'File'}`}
        message={`Are you sure you want to delete "${itemToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteItem}
        onCancel={() => setDeleteConfirmOpen(false)}
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
    </div>
  );
}
