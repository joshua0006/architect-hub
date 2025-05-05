import React, { useState, useEffect, useRef } from "react";
import { Plus, Upload, FolderPlus, X, Folder, File, MoreVertical, Share2, Copy, Move, Download } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Document, Folder as FolderType } from "../types";
import { useToast } from "../contexts/ToastContext";
import { DEFAULT_FOLDER_ACCESS, FolderAccessPermission, PERMISSIONS_MAP, useAuth, UserRole } from "../contexts/AuthContext";
import GenerateUploadToken from "./GenerateUploadToken";
import { folderService } from "../services";

interface DocumentActionsProps {
  projectId: string;
  currentFolderId?: string;
  rootFolderId?: string; // The invisible root folder ID if available
  folders: FolderType[];
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onCreateDocument: (
    name: string,
    type: "pdf" | "dwg" | "other" | "image",
    file: File,
    folderId?: string
  ) => Promise<void>;
  onCreateMultipleDocuments?: (
    files: File[],
    folderId?: string
  ) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onShare?: (id: string, isFolder: boolean) => Promise<void>;
  onCopyOrMoveFile?: (
    sourceDocumentId: string,
    destinationFolderId: string,
    action: 'copy' | 'move'
  ) => Promise<void>;
}

export default function DocumentActions({
  projectId,
  currentFolderId,
  rootFolderId,
  folders,
  onCreateFolder,
  onCreateDocument,
  onCreateMultipleDocuments,
  onRefresh,
  onShare,
  onCopyOrMoveFile,
}: DocumentActionsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showDragOverlay, setShowDragOverlay] = useState(false);
  const [showUploadTokenModal, setShowUploadTokenModal] = useState(false);
  const [showFileOperationDialog, setShowFileOperationDialog] = useState(false);
  const [fileToOperateOn, setFileToOperateOn] = useState<{ id: string, name: string } | null>(null);
  const [fileOperation, setFileOperation] = useState<'copy' | 'move'>('copy');
  const [isProcessingFileOperation, setIsProcessingFileOperation] = useState(false);
  const [selectedDestinationFolderId, setSelectedDestinationFolderId] = useState<string>("");
  const [showFileSelectionMode, setShowFileSelectionMode] = useState(false);
  const dragCounter = useRef(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const { user, canUploadDocuments } = useAuth();
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  // Add event listener for when a file is selected for operation
  useEffect(() => {
    function handleFileSelected(event: CustomEvent) {
      // Type assertion for the custom event
      const { fileId, fileName, operation } = (event as CustomEvent<{
        fileId: string;
        fileName: string;
        operation: 'copy' | 'move';
      }>).detail;
      
      setFileToOperateOn({ id: fileId, name: fileName });
      setFileOperation(operation);
      setShowFileOperationDialog(true);
    }

    // Cast to any to handle custom event with typescript
    document.addEventListener("file-selected-for-operation", handleFileSelected as any);
    
    return () => {
      document.removeEventListener("file-selected-for-operation", handleFileSelected as any);
    };
  }, []);

  const handleFolderCreate = async () => {
    if (newFolderName.trim()) {
      try {
        setIsCreatingFolder(true);
        await onCreateFolder(newFolderName.trim(), currentFolderId);
        setNewFolderName("");
        setShowFolderInput(false);
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error("Error creating folder:", error);
      } finally {
        setIsCreatingFolder(false);
      }
    }
  };

  const handleFileUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;

    try {
      setIsUploading(true);
      
      // Determine target folder ID - use root folder as fallback if available
      const targetFolderId = currentFolderId || rootFolderId;
      
      if (files.length === 1) {
        // Single file upload
        const file = files[0];
        const fileName = file.name;
        
        // Determine file type from extension
        let fileType: "pdf" | "dwg" | "other" | "image" = "other";
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension === 'pdf') {
          fileType = "pdf";
        } else if (extension === 'dwg') {
          fileType = "dwg";
        } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension || '')) {
          fileType = "image";
        }
        
        await onCreateDocument(fileName, fileType, file, targetFolderId);
        showToast(`File "${fileName}" uploaded successfully`, "success");
      } else if (onCreateMultipleDocuments) {
        // Multiple files upload
        await onCreateMultipleDocuments(Array.from(files), targetFolderId);
        showToast(`${files.length} files uploaded successfully`, "success");
      }
      if (onRefresh) {
        await onRefresh();
      }
      
      // Dispatch event for successful upload - this will be listened for by DocumentList
      const uploadSuccessEvent = new CustomEvent('document-upload-success', {
        bubbles: true,
        detail: {
          folderId: targetFolderId,
          timestamp: Date.now(),
          fileCount: files.length
        }
      });
      document.dispatchEvent(uploadSuccessEvent);
      console.log(`[Document Actions] Dispatched upload success event for folder: ${targetFolderId}`);
      
      // Reset the input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error uploading file(s):", error);
      showToast("Failed to upload files", "error");
    } finally {
      setIsUploading(false);
      setShowDropdown(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await handleFileUpload(Array.from(files));
  };

  const handleShareCurrentFolder = () => {
    if (currentFolderId) {
      // Open the upload token modal instead of directly creating a share token
      setShowUploadTokenModal(true);
    }
    setShowDropdown(false);
  };

  const handleFileOperation = (fileId: string, fileName: string, operation: 'copy' | 'move') => {
    setFileToOperateOn({ id: fileId, name: fileName });
    setFileOperation(operation);
    setShowFileOperationDialog(true);
  };

  const executeFileOperation = async () => {
    if (!fileToOperateOn || !onCopyOrMoveFile) return;
    
    try {
      setIsProcessingFileOperation(true);
      await onCopyOrMoveFile(
        fileToOperateOn.id, 
        selectedDestinationFolderId || '', // Use empty string for root if not selected
        fileOperation
      );
      
      const actionText = fileOperation === 'copy' ? 'copied' : 'moved';
      showToast(`File "${fileToOperateOn.name}" ${actionText} successfully`, "success");
      
      if (onRefresh) {
        await onRefresh();
      }
      
      // Dispatch custom event for file operation success
      const fileOperationEvent = new CustomEvent('file-operation-success', {
        bubbles: true,
        detail: {
          fileId: fileToOperateOn.id,
          folderId: selectedDestinationFolderId || '',
          operation: fileOperation,
          timestamp: Date.now()
        }
      });
      document.dispatchEvent(fileOperationEvent);
      
    } catch (error) {
      console.error(`Error ${fileOperation} file:`, error);
      showToast(`Failed to ${fileOperation} file: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsProcessingFileOperation(false);
      setShowFileOperationDialog(false);
      setFileToOperateOn(null);
      setSelectedDestinationFolderId("");
    }
  };

  // Handle drag events
  const handleDragIn = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
      // Only show overlay after a short delay to prevent flashing during quick passes
      if (dragCounter.current === 1) {
        setTimeout(() => {
          if (dragCounter.current > 0) {
            setShowDragOverlay(true);
          }
        }, 100);
      }
    }
  };

  const handleDragOut = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
      setShowDragOverlay(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setShowDragOverlay(false);
    dragCounter.current = 0;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  };

  // Check if the user has permissions to upload based on role and folder permissions
  const hasUploadPermission = () => {
    // Staff and Admin always have permission
    if (user?.role === 'Staff' || user?.role === 'Admin') {
      return true;
    }
    
    // For contractors, check current folder permissions
    if (user?.role === 'Contractor') {
      // If no current folder, check general permission
      if (!currentFolderId) {
        return canUploadDocuments();
      }
      
      // Find current folder to check its permissions
      const currentFolder = folders.find(f => f.id === currentFolderId);
      if (currentFolder?.metadata && 'access' in currentFolder.metadata) {
        const access = currentFolder.metadata.access as string;
        return access === 'CONTRACTORS_WRITE' || access === 'ALL';
      }
    }
    
    // Clients and other roles have no upload permission
    return false;
  };

  // Get the current folder name for the token generation
  const currentFolderName = currentFolderId 
    ? folders.find(f => f.id === currentFolderId)?.name 
    : "_root";

  // Only show actions if user has permission to upload
  if (!hasUploadPermission()) {
    return null;
  }

  const currentFolder = folders.find(f => f.id === currentFolderId);


  const hasFolderWritePermission = (): boolean => {

    const folderPermission = currentFolder?.metadata?.access as FolderAccessPermission;
    
    const role = user?.role as UserRole;
    
    let writeAccess = DEFAULT_FOLDER_ACCESS;

    if(role) {
      if(folderPermission in PERMISSIONS_MAP) {
        writeAccess = PERMISSIONS_MAP[folderPermission][role] ?? DEFAULT_FOLDER_ACCESS;
      } else {
        if(![UserRole.ADMIN, UserRole.STAFF].includes(role)) {
          writeAccess = {read: true, write: false};
        }
      }
    } else {
      writeAccess = {read: true, write: false};
    }
    return writeAccess.write;
  }  

  // Add function to handle bulk download
  const handleBulkDownload = () => {
    // Trigger an event to tell DocumentList to enter selection mode for download
    const selectFilesEvent = new CustomEvent('select-files-for-download', {
      bubbles: true,
      detail: { mode: 'download' }
    });
    document.dispatchEvent(selectFilesEvent);
    setShowDropdown(false);
  };

  return (
    <div 
      className="relative" 
      ref={menuRef}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center space-x-2 flex-wrap gap-2">
      
        
        {/* Create Folder button */}
        <div className="group relative">
          <button
            onClick={() => setShowFolderInput(true)}
            className="px-3 py-2 flex items-center space-x-2 bg-slate-300 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            title="Create folder"
            disabled={!hasFolderWritePermission()}
          >
            <FolderPlus className="w-5 h-5" />
            <span className="hidden sm:inline">Add Folder </span>
          </button>
          <div className={`absolute top-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap`}>
            {hasFolderWritePermission() 
              ? "Add Folder" 
              : "You don't have permission!"}
          </div>
        </div>
        
        {/* Generate Upload Token button - only for Staff/Admin */}
        {(user?.role === 'Staff' || user?.role === 'Admin') && (
          <button
            onClick={handleShareCurrentFolder}
            className="px-3 py-2 flex items-center space-x-2 bg-slate-300 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            title="Create a link for guests to upload files to this folder"
          >
            <Share2 className="w-5 h-5" />
            <span className="hidden sm:inline">Share Upload Link</span>
          </button>
        )}
        
        {/* Upload button */}
        <div className="group relative">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 flex items-center space-x-2 bg-slate-300 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            title="Upload files"
            disabled={!hasFolderWritePermission()}
          >
            <Upload className="w-5 h-5" />
            <span className="hidden sm:inline">Upload</span>
          </button>
          <div className={`absolute top-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap`}>
            {hasFolderWritePermission() 
              ? "Upload" 
              : "You don't have permission!"}
          </div>
        </div>

        {/* Bulk Download Button */}
        <div className="group relative">
          <button
            onClick={handleBulkDownload}
            className="px-3 py-2 flex items-center space-x-2 bg-slate-300 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            title="Download multiple files"
          >
            <Download className="w-5 h-5" />
            <span className="hidden sm:inline">Bulk Download</span>
          </button>
          <div className="absolute top-full mb-2 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
            Download multiple files as ZIP
          </div>
        </div>

       
      </div>

      {/* File input (hidden) */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
      />

      {/* Folder input (hidden) - using data attributes for directory selection */}
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        // @ts-ignore - These attributes exist in Chrome but are not in the TypeScript definitions
        {...{ webkitdirectory: "", directory: "" }}
      />

      {/* Drag and drop overlay */}
      <AnimatePresence>
        {showDragOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-primary-600 bg-opacity-30 backdrop-blur-sm"
            ref={dropZoneRef}
          >
            <div className="bg-white p-10 rounded-lg shadow-lg text-center border-2 border-dashed border-primary-500">
              <Upload className="w-16 h-16 mx-auto text-primary-500 mb-4" />
              <h3 className="text-xl font-medium text-primary-800 mb-2">Drop files here</h3>
              <p className="text-gray-500">Drop your files to upload them to this folder</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dropdown menu - update text for Generate Upload Token */}
      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-10 border border-gray-200"
          >
            <div className="py-1">
              <button
                onClick={() => {
                  setShowDropdown(false);
                  setShowFolderInput(true);
                }}
                className="flex items-center space-x-3 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 text-gray-700"
              >
                <FolderPlus className="w-5 h-5 text-gray-500" />
                <span>New Folder</span>
              </button>
              
              {/* Generate Upload Token - Staff/Admin only */}
              {(user?.role === 'Staff' || user?.role === 'Admin') && (
                <button
                  onClick={handleShareCurrentFolder}
                  className="flex items-center space-x-3 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 text-gray-700"
                >
                  <Share2 className="w-5 h-5 text-gray-500" />
                  <span>Share Upload Link</span>
                </button>
              )}
              
              {/* Bulk Download option */}
              <button
                onClick={handleBulkDownload}
                className="flex items-center space-x-3 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 text-gray-700"
              >
                <Download className="w-5 h-5 text-gray-500" />
                <span>Bulk Download</span>
              </button>
              
              {/* Copy Files option */}
              <button
                onClick={() => {
                  setShowDropdown(false);
                  setFileOperation('copy');
                  // Since we're dealing with multiple files, we need a selection UI
                  // This would typically interact with the document list component
                  const selectFilesEvent = new CustomEvent('select-files-for-operation', {
                    bubbles: true,
                    detail: { operation: 'copy' }
                  });
                  document.dispatchEvent(selectFilesEvent);
                }}
                className="flex items-center space-x-3 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 text-gray-700"
              >
                <Copy className="w-5 h-5 text-gray-500" />
                <span>Copy Files</span>
              </button>
              
              {/* Move Files option */}
              <button
                onClick={() => {
                  setShowDropdown(false);
                  setFileOperation('move');
                  // Since we're dealing with multiple files, we need a selection UI
                  // This would typically interact with the document list component
                  const selectFilesEvent = new CustomEvent('select-files-for-operation', {
                    bubbles: true,
                    detail: { operation: 'move' }
                  });
                  document.dispatchEvent(selectFilesEvent);
                }}
                className="flex items-center space-x-3 px-4 py-2 text-sm w-full text-left hover:bg-gray-100 text-gray-700"
              >
                <Move className="w-5 h-5 text-gray-500" />
                <span>Move Files</span>
              </button>
              
              {/* Info text about drag & drop */}
              <div className="px-4 py-2 text-xs text-gray-500 border-t mt-1">
                You can also drag & drop files to upload
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New folder input dialog */}
      <AnimatePresence>
        {showFolderInput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          >
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">Create New Folder</h2>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => {
                    setShowFolderInput(false);
                    setNewFolderName("");
                  }}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFolderCreate}
                  disabled={!newFolderName.trim() || isCreatingFolder}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors disabled:bg-primary-400 disabled:cursor-not-allowed"
                >
                  {isCreatingFolder ? "Creating..." : "Create"}
                </button>
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
                <div className="bg-primary-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
              </div>
              <p className="text-center text-gray-600">Please wait while your files are being uploaded...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Token Generation Modal */}
      <AnimatePresence>
        {showUploadTokenModal && currentFolderId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          >
            <GenerateUploadToken 
              folderId={currentFolderId}
              folderName={currentFolderName}
              onClose={() => setShowUploadTokenModal(false)}
              onTokenGenerated={(token) => {
                showToast("Upload link generated successfully! The link has been created and is ready to share.", "success");
                // We don't auto-close the dialog so users can copy the link
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* File Operation Dialog */}
      <AnimatePresence>
        {showFileOperationDialog && fileToOperateOn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          >
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  {fileOperation === 'copy' ? 'Copy' : 'Move'} File
                </h2>
                <button
                  onClick={() => setShowFileOperationDialog(false)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-gray-600 mb-4">
                Select destination folder for "{fileToOperateOn.name}":
              </p>
              
              {/* Folder selection list */}
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md mb-4">
                <ul className="divide-y divide-gray-200">
                  {/* Available folders */}
                  {folders.map(folder => (
                    <li 
                      key={folder.id}
                      className={`px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between ${
                        folder.id === currentFolderId ? 'bg-gray-100' : ''
                      } ${folder.id === selectedDestinationFolderId ? 'bg-blue-50' : ''}`}
                      onClick={() => setSelectedDestinationFolderId(folder.id)}
                    >
                      <div className="flex items-center">
                        <Folder className="w-5 h-5 text-gray-400 mr-2" />
                        <span className="truncate">{folder.name}</span>
                        {folder.id === currentFolderId && (
                          <span className="ml-2 text-xs text-gray-500">(current)</span>
                        )}
                      </div>
                      {folder.id === selectedDestinationFolderId && (
                        <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setShowFileOperationDialog(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeFileOperation}
                  disabled={isProcessingFileOperation}
                  className={`px-4 py-2 text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors ${
                    isProcessingFileOperation ? 'opacity-70 cursor-not-allowed' : ''
                  }`}
                >
                  {isProcessingFileOperation ? (
                    <span>Processing...</span>
                  ) : (
                    <span>{fileOperation === 'copy' ? 'Copy' : 'Move'}</span>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
