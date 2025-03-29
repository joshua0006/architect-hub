import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, FolderOpen, Home, MoreHorizontal, FileText } from 'lucide-react';
import { Folder, Document } from '../types';
import { DOCUMENT_UPDATE_EVENT } from './DocumentViewer';

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
  const [localSelectedDocument, setLocalSelectedDocument] = useState<Document | undefined>(selectedDocument);
  
  // Update local state when prop changes
  useEffect(() => {
    setLocalSelectedDocument(selectedDocument);
  }, [selectedDocument]);
  
  // Listen for document update events to refresh breadcrumbs immediately
  useEffect(() => {
    const handleDocumentUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (!customEvent.detail) return;
      
      const { documentId, documentName, documentVersion, documentUrl } = customEvent.detail;
      
      // Check if this is the same document we're currently viewing
      if (localSelectedDocument && localSelectedDocument.id === documentId) {
        console.log('Breadcrumbs: Updating document display name in breadcrumbs to:', documentName);
        
        // Update the local state to show the new name immediately
        setLocalSelectedDocument(prev => {
          if (!prev) return undefined;
          return {
            ...prev,
            name: documentName,
            version: documentVersion,
            url: documentUrl
          };
        });
      }
    };
    
    // Add listener for the custom event
    document.body.addEventListener(DOCUMENT_UPDATE_EVENT, handleDocumentUpdate);
    
    return () => {
      document.body.removeEventListener(DOCUMENT_UPDATE_EVENT, handleDocumentUpdate);
    };
  }, [localSelectedDocument]);
  
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
        {localSelectedDocument && (
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
                {getDocumentIcon(localSelectedDocument.type)}
                <span className="truncate max-w-xs">{localSelectedDocument.name}</span>
                {localSelectedDocument.type && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-gray-100 text-gray-600 uppercase">
                    {localSelectedDocument.type}
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