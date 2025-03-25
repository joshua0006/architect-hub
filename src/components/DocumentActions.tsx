import React, { useState, useEffect, useRef } from "react";
import { Plus, Upload, FolderPlus, X, Folder, File, MoreVertical, Share2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Document, Folder as FolderType } from "../types";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import GenerateUploadToken from "./GenerateUploadToken";

interface DocumentActionsProps {
  projectId: string;
  currentFolderId?: string;
  folders: FolderType[];
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onCreateDocument: (
    name: string,
    type: "pdf" | "dwg" | "other",
    file: File,
    folderId?: string
  ) => Promise<void>;
  onCreateMultipleDocuments?: (
    files: File[],
    folderId?: string
  ) => Promise<void>;
  onRefresh?: () => Promise<void>;
  onShare?: (id: string, isFolder: boolean) => Promise<void>;
}

export default function DocumentActions({
  projectId,
  currentFolderId,
  folders,
  onCreateFolder,
  onCreateDocument,
  onCreateMultipleDocuments,
  onRefresh,
  onShare,
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
      
      if (files.length === 1) {
        // Single file upload
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
        
        await onCreateDocument(fileName, fileType, file, currentFolderId);
        showToast(`File "${fileName}" uploaded successfully`, "success");
      } else if (onCreateMultipleDocuments) {
        // Multiple files upload
        await onCreateMultipleDocuments(Array.from(files), currentFolderId);
        showToast(`${files.length} files uploaded successfully`, "success");
      }
      
      if (onRefresh) {
        await onRefresh();
      }
      
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
    : "Root";

  // Only show actions if user has permission to upload
  if (!hasUploadPermission()) {
    return null;
  }

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
        <button
          onClick={() => setShowFolderInput(true)}
          className="px-3 py-2 flex items-center space-x-2 bg-slate-300 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          title="Create folder"
        >
          <FolderPlus className="w-5 h-5" />
          <span className="hidden sm:inline">Add Folder</span>
        </button>
        
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
        
        {/* Replace info message with Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-2 flex items-center space-x-2 bg-slate-300 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          title="Upload files"
        >
          <Upload className="w-5 h-5" />
          <span className="hidden sm:inline">Upload</span>
        </button>
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
    </div>
  );
}
