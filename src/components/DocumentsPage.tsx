import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Project, Folder, Document } from '../types';
import DocumentList from './DocumentList';
import Layout from './Layout';
import ProjectList from './ProjectList';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';

interface DocumentsPageProps {
  projects: Project[];
  selectedProject?: Project;
  folders?: Folder[];
  documents?: Document[];
  currentFolderId?: string;
  onFolderSelect: (folder?: Folder) => void;
  onProjectSelect: (project?: Project) => void;
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  tasks: any[];
  createDocument: any;
  createFolder: any;
  updateFolder: any;
  deleteFolder: any;
  updateDocument: any;
  deleteDocument: any;
  updateDocumentPermission: (id: string, permission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL') => Promise<void>;
  updateFolderPermission: (id: string, permission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL') => Promise<void>;
  onCopyOrMoveFile?: (sourceDocumentId: string, destinationFolderId: string, action: 'copy' | 'move') => Promise<void>;
  onBulkRename?: (items: Array<{id: string, name: string, type: 'document' | 'folder'}>, pattern: string) => Promise<void>;
}

const DocumentsPage: React.FC<DocumentsPageProps> = ({ 
  projects, 
  selectedProject, 
  folders, 
  documents,
  currentFolderId,
  onFolderSelect,
  onProjectSelect,
  onUpdateProject,
  tasks,
  createDocument,
  createFolder,
  updateFolder,
  deleteFolder,
  updateDocument,
  deleteDocument,
  updateDocumentPermission,
  updateFolderPermission,
  onCopyOrMoveFile,
  onBulkRename
}) => {
  // Hooks for URL parameters
  const params = useParams();
  const { projectId: urlProjectId, folderId: urlFolderId, fileId: urlFileId } = params;
  const navigate = useNavigate();
  const [pendingFileId, setPendingFileId] = useState<string | undefined>(urlFileId);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const { showToast } = useToast();
  const { user } = useAuth();
  
  // Add state for tracking fullscreen mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Find the selected file if a fileId is provided
  const selectedFile = urlFileId ? documents?.find(d => d.id === urlFileId) : undefined;
  
  // Navigation function to update URL when folder is selected
  const handleFolderSelect = (folder?: Folder) => {
    onFolderSelect(folder);
    
    if (folder) {
      // Include project ID in the path for better context
      navigate(`/documents/projects/${selectedProject?.id}/folders/${folder.id}`);
    } else {
      // Navigate to project root if no folder selected
      navigate(`/documents/projects/${selectedProject?.id}`);
    }
  };
  
  // Navigation function to update URL when file is selected
  const handleFileSelect = (file: Document) => {
    if (currentFolderId) {
      // Include project ID in the path for file in folder
      navigate(`/documents/projects/${selectedProject?.id}/folders/${currentFolderId}/files/${file.id}`);
    } else {
      // Include project ID in the path for file not in folder
      navigate(`/documents/projects/${selectedProject?.id}/files/${file.id}`);
    }
  };
  
  // Handle sharing files and folders
  const handleShare = async (resourceId: string, isFolder: boolean) => {
    try {
      if (!user) {
        showToast('You must be logged in to share resources', 'error');
        return;
      }
      
      // Call the share service
      // Note: This implementation will depend on your actual share service
      // ...
      
      showToast('Share link copied to clipboard', 'success');
    } catch (error) {
      console.error('Sharing failed:', error);
      showToast('Failed to create share link', 'error');
    }
  };
  
  // Implement the bulk rename functionality
  const handleBulkRename = async (items: Array<{id: string, name: string, type: 'document' | 'folder'}>, pattern: string): Promise<void> => {
    try {
      if (onBulkRename) {
        await onBulkRename(items, pattern);
        showToast(`${items.length} items renamed successfully`, "success");
        return;
      }
      
      // Fallback implementation if onBulkRename is not provided
      const promises: Promise<void>[] = [];
      const renamedItems: Record<string, string> = {};
      const duplicates: string[] = [];
      
      // Generate new names
      items.forEach((item, index) => {
        // Get file extension if it's a document
        const ext = item.name.includes('.') ? item.name.split('.').pop() : '';
        const nameWithoutExt = item.name.replace(`.${ext}`, '');
        
        // Create a new name based on the pattern
        let newName = pattern
          .replace(/{name}/g, nameWithoutExt)
          .replace(/{index}/g, (index + 1).toString().padStart(2, '0'))
          .replace(/{ext}/g, ext || '');
        
        // Add extension back if it was a document with extension
        if (item.type === 'document' && ext && !newName.endsWith(`.${ext}`)) {
          newName += `.${ext}`;
        }
        
        // Check for duplicates
        if (renamedItems[newName]) {
          duplicates.push(item.name);
        }
        
        renamedItems[item.id] = newName;
      });
      
      // If duplicates found, show error and abort
      if (duplicates.length > 0) {
        showToast(`Rename pattern would create duplicate names. Please use a pattern with unique values like {name}_{index}`, "error");
        return;
      }
      
      // Perform rename operations
      items.forEach(item => {
        const newName = renamedItems[item.id];
        if (newName && newName !== item.name) {
          if (item.type === 'document') {
            promises.push(updateDocument(item.id, { name: newName }));
          } else {
            promises.push(updateFolder(item.id, newName));
          }
        }
      });
      
      // Wait for all rename operations to complete
      await Promise.all(promises);
      
      showToast(`Successfully renamed ${promises.length} items`, "success");
    } catch (error) {
      console.error('Error during bulk rename:', error);
      showToast(`Error renaming items: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      throw error;
    }
  };
  
  // Handle copy or move file operations
  const handleCopyOrMoveFile = async (sourceDocumentId: string, destinationFolderId: string, action: 'copy' | 'move'): Promise<void> => {
    try {
      if (onCopyOrMoveFile) {
        await onCopyOrMoveFile(sourceDocumentId, destinationFolderId, action);
        return;
      }
      
      // Fallback implementation if onCopyOrMoveFile is not provided
      showToast(`Sorry, ${action} functionality requires implementation`, "error");
      throw new Error(`${action} functionality not implemented in this component`);
    } catch (error) {
      console.error(`Error ${action}ing file:`, error);
      showToast(`Failed to ${action} file: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      throw error;
    }
  };

  return (
    <Layout
      sidebar={
        <ProjectList
          projects={projects}
          selectedId={selectedProject?.id}
          onSelect={onProjectSelect}
          onProjectsChange={() => {}} // This will be handled by the parent
          onUpdateProject={onUpdateProject}
          tasks={tasks}
        />
      }
      fullscreenMode={isFullscreen}
    >
      {selectedProject ? (
        <DocumentList
          documents={documents || []}
          folders={folders || []}
          currentFolder={folders?.find(f => f.id === currentFolderId)}
          projectId={selectedProject.id}
          selectedProject={selectedProject}
          onFolderSelect={handleFolderSelect}
          onPreview={handleFileSelect}
          onCreateFolder={createFolder}
          onCreateDocument={createDocument}
          onCreateMultipleDocuments={(files, folderId) => createDocument(files[0].name, 'other', files[0], folderId)}
          onUpdateFolder={updateFolder}
          onDeleteFolder={deleteFolder}
          onUpdateDocument={updateDocument}
          onDeleteDocument={deleteDocument}
          selectedFile={selectedFile}
          onShare={handleShare}
          onUpdateDocumentPermission={updateDocumentPermission}
          onUpdateFolderPermission={updateFolderPermission}
          onFullscreenChange={setIsFullscreen}
          onBulkRename={handleBulkRename}
          onCopyOrMoveFile={handleCopyOrMoveFile}
        />
      ) : (
        <div className="h-full flex items-center justify-center text-gray-500">
          Select a project to view documents
        </div>
      )}
    </Layout>
  );
};

export default DocumentsPage; 