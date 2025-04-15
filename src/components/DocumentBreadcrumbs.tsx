import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, FolderOpen, Home, MoreHorizontal, FileText, Image } from 'lucide-react';
import { Folder, Document } from '../types';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface DocumentBreadcrumbsProps {
  folders: Folder[];
  currentFolder?: Folder;
  selectedDocument?: Document;
  onNavigate: (folder?: Folder) => void;
  onDocumentClick?: () => void;
}

export default function DocumentBreadcrumbs({
  folders,
  currentFolder,
  selectedDocument,
  onNavigate,
  onDocumentClick,
}: DocumentBreadcrumbsProps) {
  const folderMap = new Map<string, Folder>(folders.map(f => [f.id, f]));
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentVersion, setCurrentVersion] = useState<number | undefined>(selectedDocument?.version);
  const [documentName, setDocumentName] = useState<string | undefined>(selectedDocument?.name);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle backspace key to navigate to parent folder
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Check if backspace was pressed and not in an input field
      if (
        event.key === 'Backspace' && 
        !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)
      ) {
        event.preventDefault(); // Prevent browser back navigation
        navigateToParent();
      }
    }
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentFolder, selectedDocument, onNavigate]);

  // Add setupVersionSubscription function
  const setupVersionSubscription = () => {
    // Clean up any existing subscription first
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (!selectedDocument?.id) return;

    try {
      // Set up new subscription
      const docRef = doc(db, "documents", selectedDocument.id);
      
      unsubscribeRef.current = onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setCurrentVersion(data.version || 0);
          // Update document name if it has changed
          if (data.name && data.name !== documentName) {
            setDocumentName(data.name);
          }
        }
      });
    } catch (err) {
      console.error("Error setting up version subscription:", err);
    }
  };

  // Update documentName when selectedDocument changes
  useEffect(() => {
    setDocumentName(selectedDocument?.name);
  }, [selectedDocument?.name]);

  // Add cleanup effect for version subscription
  useEffect(() => {
    setupVersionSubscription();
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [selectedDocument?.id]);

  const generateBreadcrumbPath = () => {
    const path: Folder[] = [];
    let current = currentFolder;

    while (current) {
      path.unshift(current);
      current = current.parentId ? folderMap.get(current.parentId) : undefined;
    }

    return path;
  };

  const breadcrumbPath = generateBreadcrumbPath();
  const shouldCollapse = breadcrumbPath.length > 3;
  
  // Function to navigate to parent folder
  const navigateToParent = () => {
    if (selectedDocument) {
      // If a document is selected, navigate to its containing folder
      onNavigate(currentFolder);
    } else if (currentFolder) {
      // If in a folder, navigate to parent folder
      const parentFolder = currentFolder.parentId ? folderMap.get(currentFolder.parentId) : undefined;
      onNavigate(parentFolder);
    }
  };
  
  // Function to render dropdown content
  const renderDropdownContent = () => {
    // For collapsed breadcrumbs, we show hidden middle items in dropdown
    const hiddenItems = breadcrumbPath.slice(1, breadcrumbPath.length - 1);
    
    return (
      <div 
        className="absolute top-full left-0 mt-1 bg-white rounded-md shadow-lg py-1 z-10 min-w-40 max-h-60 overflow-y-auto"
        ref={dropdownRef}
      >
        {hiddenItems.map(folder => (
          <button
            key={folder.id}
            onClick={() => {
              onNavigate(folder);
              setShowDropdown(false);
            }}
            className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100"
          >
            <FolderOpen className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
            <span className="truncate">{folder.name}</span>
          </button>
        ))}
      </div>
    );
  };

  // Get appropriate icon for document type
  const getDocumentIcon = (type: string) => {
    if (type === 'pdf') {
      return <FileText className="w-4 h-4 text-red-400" />;
    } else if (type === 'heic' || type === 'image/heic') {
      return <Image className="w-4 h-4 text-blue-400" />;
    }
    return <FileText className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div ref={containerRef} className="relative mb-4">
      <nav 
        className="flex flex-wrap items-center text-sm text-gray-600 gap-1" 
        aria-label="Breadcrumb"
      >
        {/* Home button - always shown */}
        <div className="flex items-center my-1">
          <button
            onClick={() => onNavigate(undefined)}
            className="flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap hover:text-gray-900 hover:bg-gray-100"
          >
            <Home className="w-4 h-4" />
            <span>Documents</span>
          </button>
        </div>

        {/* Render breadcrumbs based on path length */}
        {breadcrumbPath.length > 0 && (
          <>
            {/* First chevron after Home */}
            <div className="flex items-center my-1">
              <ChevronRight className="w-4 h-4 mx-1 text-gray-400 flex-shrink-0" />
            </div>
            
            {shouldCollapse ? (
              // Collapsed view - show first, ellipsis dropdown, and last item
              <>
                {/* Only show first item if there are more than 2 items total */}
                {breadcrumbPath.length > 2 && (
                  <>
                    {/* First folder */}
                    <div className="flex items-center my-1">
                      <button
                        onClick={() => onNavigate(breadcrumbPath[0])}
                        className="flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap hover:text-gray-900 hover:bg-gray-100"
                      >
                        <FolderOpen className="w-4 h-4 text-gray-400" />
                        <span>{breadcrumbPath[0].name}</span>
                      </button>
                    </div>
                    
                    {/* Chevron after first folder */}
                    <div className="flex items-center my-1">
                      <ChevronRight className="w-4 h-4 mx-1 text-gray-400 flex-shrink-0" />
                    </div>
                    
                    {/* Dropdown toggle for middle items */}
                    <div className="flex items-center my-1 relative">
                      <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap hover:text-gray-900 hover:bg-gray-100"
                        title={showDropdown ? "Hide folders" : "Show hidden folders"}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                        <span className="text-xs text-gray-500">
                          {breadcrumbPath.length - 2} more
                        </span>
                      </button>
                      {showDropdown && renderDropdownContent()}
                    </div>
                    
                    {/* Chevron after dropdown */}
                    <div className="flex items-center my-1">
                      <ChevronRight className="w-4 h-4 mx-1 text-gray-400 flex-shrink-0" />
                    </div>
                  </>
                )}
                
                {/* Last item (current folder) - always shown */}
                <div className="flex items-center my-1">
                  <button
                    onClick={() => onNavigate(breadcrumbPath[breadcrumbPath.length - 1])}
                    className="flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap hover:text-gray-900 hover:bg-gray-100"
                  >
                    <FolderOpen className="w-4 h-4 text-gray-400" />
                    <span>{breadcrumbPath[breadcrumbPath.length - 1].name}</span>
                  </button>
                </div>
              </>
            ) : (
              // Show all items directly when there are just a few
              breadcrumbPath.map((folder, index) => (
                <React.Fragment key={folder.id}>
                  {index > 0 && (
                    <div className="flex items-center my-1">
                      <ChevronRight className="w-4 h-4 mx-1 text-gray-400 flex-shrink-0" />
                    </div>
                  )}
                  <div className="flex items-center my-1">
                    <button
                      onClick={() => onNavigate(folder)}
                      className="flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap hover:text-gray-900 hover:bg-gray-100"
                    >
                      <FolderOpen className="w-4 h-4 text-gray-400" />
                      <span>{folder.name}</span>
                    </button>
                  </div>
                </React.Fragment>
              ))
            )}
          </>
        )}

        {/* Show selected document at the end if available */}
        {selectedDocument && (
          <>
            {/* Chevron before document */}
            <div className="flex items-center my-1">
              <ChevronRight className="w-4 h-4 mx-1 text-gray-400 flex-shrink-0" />
            </div>
            
            {/* Document item - current (last) item */}
            <div className="flex items-center my-1">
              <div 
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md whitespace-nowrap text-gray-900 font-medium bg-blue-50 border border-blue-200"
                onClick={onDocumentClick}
                aria-current="page"
              >
                {getDocumentIcon(selectedDocument.type)}
                <span className="truncate max-w-xs">{documentName || selectedDocument.name}</span>
                {selectedDocument.type && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600 uppercase">
                    {selectedDocument.type}
                  </span>
                )}
                {currentVersion !== undefined && (
                  <span className="ml-2 text-xs text-gray-500">
                    v{currentVersion}
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </nav>
    </div>
  );
}