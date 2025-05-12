import React, { useState, useEffect, useCallback } from 'react';
import { CheckSquare, ChevronDown, Download, MoveUp, Check, X } from 'lucide-react';
import { Document, Folder } from '../types';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface FileSelectionManagerProps {
  documents: Document[];
  folders: Folder[];
  projectId: string;
  currentFolder?: Folder;
  onUpdateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  onRefresh?: () => Promise<void>;
  showToast: (message: string, type?: ToastType) => void;
}

export function useFileSelection() {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [dragTargetFolder, setDragTargetFolder] = useState<string | null>(null);
  const [draggedFiles, setDraggedFiles] = useState<string[]>([]);
  const [moveInProgress, setMoveInProgress] = useState(false);
  const [showMoveConfirmation, setShowMoveConfirmation] = useState(false);
  const [moveTargetFolder, setMoveTargetFolder] = useState<{ id: string; name: string } | null>(null);

  // Toggle file selection - select or deselect a file
  const toggleFileSelection = useCallback((fileId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    
    setSelectedFiles(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(fileId)) {
        newSelection.delete(fileId);
      } else {
        newSelection.add(fileId);
      }
      
      // If selection is empty, exit selection mode
      if (newSelection.size === 0) {
        setIsSelectionMode(false);
      } else {
        setIsSelectionMode(true);
      }
      
      return newSelection;
    });
  }, []);

  // Select all files in the documents array
  const selectAllFiles = useCallback((documents: Document[]) => {
    const newSelection = new Set<string>();
    
    documents.forEach(doc => {
      if (doc.id) {
        newSelection.add(doc.id);
      }
    });
    
    setSelectedFiles(newSelection);
    if (newSelection.size > 0) {
      setIsSelectionMode(true);
    }
  }, []);

  // Deselect all files
  const deselectAllFiles = useCallback(() => {
    setSelectedFiles(new Set());
    setIsSelectionMode(false);
  }, []);

  return {
    selectedFiles,
    isSelectionMode,
    dragTargetFolder,
    draggedFiles,
    moveInProgress,
    showMoveConfirmation,
    moveTargetFolder,
    setSelectedFiles,
    setIsSelectionMode,
    setDragTargetFolder,
    setDraggedFiles,
    setMoveInProgress,
    setShowMoveConfirmation,
    setMoveTargetFolder,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles
  };
}

const FileSelectionManager: React.FC<FileSelectionManagerProps> = ({
  documents,
  folders,
  projectId,
  currentFolder,
  onUpdateDocument,
  onRefresh,
  showToast
}) => {
  const {
    selectedFiles,
    isSelectionMode,
    dragTargetFolder,
    draggedFiles,
    moveInProgress,
    showMoveConfirmation,
    moveTargetFolder,
    setSelectedFiles,
    setIsSelectionMode,
    setDragTargetFolder,
    setDraggedFiles,
    setMoveInProgress,
    setShowMoveConfirmation,
    setMoveTargetFolder,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles
  } = useFileSelection();

  // Handle file drag start
  const handleFileDragStart = (e: React.DragEvent<HTMLDivElement>, docId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', docId);
    e.dataTransfer.effectAllowed = 'move';
    
    // Set visual feedback for drag
    if (selectedFiles.has(docId) && selectedFiles.size > 1) {
      // Multiple files being dragged
      setDraggedFiles(Array.from(selectedFiles));
      
      // Custom drag ghost for multiple files
      const dragGhost = document.createElement('div');
      dragGhost.className = 'fixed pointer-events-none bg-blue-600 text-white px-3 py-1 rounded shadow z-50';
      dragGhost.innerText = `${selectedFiles.size} files`;
      document.body.appendChild(dragGhost);
      
      e.dataTransfer.setDragImage(dragGhost, 15, 15);
      
      setTimeout(() => {
        document.body.removeChild(dragGhost);
      }, 0);
    } else {
      // Single file drag
      setDraggedFiles([docId]);
      
      // If drag started on non-selected file, select just this one
      if (!selectedFiles.has(docId)) {
        setSelectedFiles(new Set([docId]));
        setIsSelectionMode(true);
      }
    }
  };

  // Handle folder drag over
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

  // Handle folder drop
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

  // Move files to folder
  const moveFilesToFolder = async (targetFolderId: string) => {
    if (draggedFiles.length === 0) return;
    
    setMoveInProgress(true);
    
    try {
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
        await onUpdateDocument(docId, {
          folderId: targetFolderId
        });
      }
      
      // Refresh data after move
      if (onRefresh) {
        await onRefresh();
      }
      
      // Clear selection after move
      setSelectedFiles(new Set());
      setIsSelectionMode(false);
      setDraggedFiles([]);
      
      showToast("Files moved successfully", "success");
    } catch (error) {
      console.error("Error moving files:", error);
      showToast("Error moving files", "error");
    } finally {
      setMoveInProgress(false);
    }
  };

  // Download selected files
  const downloadSelectedFiles = async () => {
    if (selectedFiles.size === 0) {
      showToast("No files selected for download", "error");
      return;
    }
    
    // Implement download functionality here
    showToast(`Downloading ${selectedFiles.size} files...`, "info");
  };

  // Render selection toolbar
  const renderSelectionToolbar = () => {
    if (!isSelectionMode) return null;
    
    return (
      <div className="sticky top-0 z-10 bg-white shadow-sm border-b border-gray-200 py-2 px-4 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-sm font-medium text-gray-700">
            {selectedFiles.size} {selectedFiles.size === 1 ? 'file' : 'files'} selected
          </span>
          <button 
            onClick={() => deselectAllFiles()}
            className="ml-2 text-xs text-blue-600 hover:text-blue-800"
          >
            Clear
          </button>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={downloadSelectedFiles}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm leading-5 
                     font-medium rounded-md text-gray-700 bg-white hover:text-gray-500 
                     focus:outline-none focus:border-blue-300 focus:shadow-outline-blue 
                     active:text-gray-800 active:bg-gray-50 transition ease-in-out duration-150"
          >
            <Download className="w-4 h-4 mr-1" />
            Download
          </button>
          <button
            onClick={() => {
              // Handle move operation
              showToast("Move operation initiated", "info");
            }}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm leading-5 
                     font-medium rounded-md text-gray-700 bg-white hover:text-gray-500 
                     focus:outline-none focus:border-blue-300 focus:shadow-outline-blue 
                     active:text-gray-800 active:bg-gray-50 transition ease-in-out duration-150"
          >
            <MoveUp className="w-4 h-4 mr-1" />
            Move to...
          </button>
        </div>
      </div>
    );
  };

  // Render move confirmation dialog
  const renderMoveConfirmationDialog = () => {
    if (!showMoveConfirmation || !moveTargetFolder) return null;
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
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
      </div>
    );
  };

  return (
    <>
      {renderSelectionToolbar()}
      {renderMoveConfirmationDialog()}
    </>
  );
};

export default FileSelectionManager; 