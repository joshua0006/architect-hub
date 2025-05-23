import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Route, Routes, useLocation, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { OrganizationProvider } from '../contexts/OrganizationContext';
import { AnimatePresence } from 'framer-motion';
import Layout from './Layout';
import ProjectDetails from './ProjectDetails';
import ProjectList from './ProjectList';
import PeopleList from './PeopleList';
import DocumentList from './DocumentList';
import Settings from './Settings';
import TeamList from './TeamList';
import TaskList from './TaskList';
import AccountSettings from './AccountSettings';
import { Project, Folder, Document, Task, TeamMember } from '../types';
import { projectService } from '../services';
import { sampleTasks, sampleTeamMembers } from '../data/sampleData';
import { useDocumentManager } from '../hooks/useDocumentManager';
import { useFolderManager } from '../hooks/useFolderManager';
import { useTaskManager } from '../hooks/useTaskManager';
import { useTeamManager } from '../hooks/useTeamManager';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { createShareToken } from '../services/shareService';
import { documentService } from '../services/documentService';
import { folderService } from '../services/folderService';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { setupProjectSubscription, setupUserProjectSubscription, cleanupProjectSubscription } from '../services/subscriptionManager';

// Custom components for folder and file routes
const DocumentsPage: React.FC<{
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
}> = ({ 
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
  
  // Check if we need to switch projects based on URL parameter
  useEffect(() => {
    if (urlProjectId && (!selectedProject || selectedProject.id !== urlProjectId)) {
      const project = projects.find(p => p.id === urlProjectId);
      if (project) {
        onProjectSelect(project);
      }
    }
  }, [urlProjectId, projects, selectedProject, onProjectSelect]);
  
  // Set the current folder ID from URL parameter if needed
  useEffect(() => {
    if (urlFolderId && urlFolderId !== currentFolderId) {
      const folder = folders?.find(f => f.id === urlFolderId);
      if (folder) {
        onFolderSelect(folder);
      } else {
        // If folder not found in current project, we might need to fetch it
        // This will be handled by the parent component through folderService
        console.log(`Folder ${urlFolderId} not found in current project`);
      }
    }
  }, [urlFolderId, folders, currentFolderId, onFolderSelect]);
  
  // Find the selected file if a fileId is provided
  const selectedFile = urlFileId ? documents?.find(d => d.id === urlFileId) : undefined;
  
  // Handle pending file selection when documents become available
  useEffect(() => {
    if (pendingFileId && documents?.length && isInitialLoad) {
      const fileToSelect = documents.find(d => d.id === pendingFileId);
      if (fileToSelect) {
        // Clear the pending file selection
        setPendingFileId(undefined);
        setIsInitialLoad(false);
        
        // Log for debugging
        console.log(`Found pending file ${pendingFileId}, navigating to it now`);
        
        // Navigate to ensure the URL is correct (includes folder if needed)
        if (fileToSelect.folderId) {
          navigate(`/documents/projects/${selectedProject?.id}/folders/${fileToSelect.folderId}/files/${fileToSelect.id}`, { replace: true });
        } else {
          navigate(`/documents/projects/${selectedProject?.id}/files/${fileToSelect.id}`, { replace: true });
        }
      }
    }
  }, [documents, pendingFileId, navigate, isInitialLoad, selectedProject]);
  
  // Update pending file ID when URL changes
  useEffect(() => {
    if (urlFileId) {
      setPendingFileId(urlFileId);
    }
  }, [urlFileId]);
  
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
      
      const token = await createShareToken(
        resourceId,
        isFolder ? 'folder' : 'file',
        user.id,
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
  
  // Function to handle copy or move operations for files
  const handleCopyOrMoveFile = async (sourceDocumentId: string, destinationFolderId: string, action: 'copy' | 'move'): Promise<void> => {
    try {
      if (action === 'copy') {
        // Use document service to copy the file
        await documentService.copyDocument(sourceDocumentId, destinationFolderId);
        showToast("File copied successfully", "success");
      } else {
        // Use document service to move the file
        await documentService.moveDocument(sourceDocumentId, destinationFolderId);
        showToast("File moved successfully", "success");
      }
      
      // Refresh documents after the operation
      if (refreshDocuments) {
        await refreshDocuments();
      }
    } catch (error) {
      console.error(`Error ${action}ing file:`, error);
      showToast(`Failed to ${action} file: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      throw error;
    }
  };
  
  // Add bulk rename functionality
  const bulkRenameItems = async (items: Array<{id: string, name: string, type: 'document' | 'folder', newName?: string}>, pattern: string): Promise<void> => {
    try {
      const promises: Promise<void>[] = [];
      
      // Check if we're using individual rename mode
      if (pattern === "__INDIVIDUAL__") {
        // For individual rename, each item already has a newName property
        items.forEach(item => {
          if (item.newName && item.newName !== item.name) {
            if (item.type === 'document') {
              promises.push(updateDocument(item.id, { name: item.newName }));
            } else {
              promises.push(updateFolder(item.id, item.newName));
            }
          }
        });
      } else {
        // Original pattern-based renaming
        const renamedItems: Record<string, string> = {};
        const duplicates: string[] = [];
        
        // First pass: generate new names and check for duplicates
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
        
        // Second pass: actually rename the items
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
      }
      
      // Wait for all rename operations to complete
      await Promise.all(promises);
      
      showToast(`Successfully renamed ${promises.length} items`, "success");
      
    } catch (error) {
      console.error('Error during bulk rename:', error);
      showToast(`Error renaming items: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
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
          onBulkRename={(items, pattern) => bulkRenameItems(items, pattern)}
          onCopyOrMoveFile={(sourceDocumentId, destinationFolderId, action) => {
            if (action === 'copy') {
              return documentService.copyDocument(sourceDocumentId, destinationFolderId);
            } else {
              return documentService.moveDocument(sourceDocumentId, destinationFolderId);
            }
          }}
        />
      ) : (
        <div className="h-full flex items-center justify-center text-gray-500">
          Select a project to view documents
        </div>
      )}
    </Layout>
  );
};

// Define the TaskDetailView component inside the AppContent component
interface TaskDetailViewProps {
  projects: Project[];
  selectedProject?: Project;
  setSelectedProject: (project?: Project) => void;
  tasks: Task[];
  teamMembers: TeamMember[];
  createTask: (
    projectId: string,
    title: string,
    description: string,
    assignedTo: string[],
    dueDate: string,
    priority: Task["priority"],
    category: Task["category"],
    parentTaskId?: string
  ) => Promise<void>;
  updateTask: (id: string, updates: Partial<Omit<Task, "id" | "projectId">>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
}

const TaskDetailView: React.FC<TaskDetailViewProps> = ({ 
  projects, 
  selectedProject, 
  setSelectedProject, 
  tasks,
  teamMembers,
  createTask,
  updateTask,
  deleteTask
}) => {
  const { projectId, taskId } = useParams();
  
  // Find the project and switch to it if needed
  useEffect(() => {
    if (projectId && (!selectedProject || selectedProject.id !== projectId)) {
      const project = projects.find(p => p.id === projectId);
      if (project) {
        setSelectedProject(project);
      }
    }
  }, [projectId, selectedProject, projects, setSelectedProject]);
  
  return selectedProject ? (
    <TaskList
      tasks={tasks.filter(t => t.projectId === selectedProject.id)}
      teamMembers={teamMembers.filter(m => m.projectIds.includes(selectedProject.id))}
      projectId={selectedProject.id}
      onCreateTask={createTask}
      onStatusChange={(taskId, status) => updateTask(taskId, { status })}
      onUpdateTask={updateTask}
      onDeleteTask={deleteTask}
    />
  ) : (
    <div className="h-full flex items-center justify-center text-gray-500">
      Loading project...
    </div>
  );
};

export default function AppContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | undefined>();
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  
  // Add state for tracking notification navigation
  const [pendingNotificationNavigation, setPendingNotificationNavigation] = useState<any>(null);
  
  const {
    documents,
    loading: documentsLoading,
    error: documentsError,
    createDocument,
    updateDocument,
    updateDocumentFile,
    deleteDocument,
    setCurrentFolderId: setDocumentManagerFolderId,
    copyDocument,
    moveDocument
  } = useDocumentManager(selectedProject?.id || '');

  const {
    folders,
    loading: foldersLoading,
    error: foldersError,
    createFolder,
    updateFolder,
    deleteFolder,
  } = useFolderManager(selectedProject?.id || '');
  
  const {
    tasks,
    createTask,
    updateTask,
    deleteTask,
  } = useTaskManager(sampleTasks);
  
  const {
    teamMembers,
    createTeamMember,
    updateTeamMember,
    deleteTeamMember,
    assignToProject,
    removeFromProject,
  } = useTeamManager(sampleTeamMembers);

  // Add a tracker to prevent duplicate _root folder creation on page refresh
  const rootFolderCreationTracker = useRef<Record<string, boolean>>({});

  // Function to find the project containing a specific folder
  const findProjectForFolder = async (folderId: string): Promise<Project | undefined> => {
    try {
      // First check if the folder is in the current project
      if (folders.some(f => f.id === folderId)) {
        return selectedProject;
      }
      
      // If not, check all projects
      for (const project of projects) {
        if (project.id === selectedProject?.id) continue; // Skip current project, already checked
        
        const projectFolders = await folderService.getByProjectId(project.id);
        if (projectFolders.some(f => f.id === folderId)) {
          console.log(`Found folder ${folderId} in project ${project.id}`);
          return project;
        }
      }
      
      return undefined;
    } catch (error) {
      console.error('Error finding project for folder:', error);
      return undefined;
    }
  };

  // Function to find the project containing a specific file
  const findProjectForFile = async (fileId: string): Promise<Project | undefined> => {
    try {
      // First check if the file is in the current project
      if (documents.some(d => d.id === fileId)) {
        return selectedProject;
      }
      
      // If not, check all projects
      for (const project of projects) {
        if (project.id === selectedProject?.id) continue; // Skip current project, already checked
        
        // We need to load documents for this project
        try {
          const projectDocuments = await fetch(`/api/projects/${project.id}/documents`).then(res => res.json());
          if (projectDocuments.some((d: any) => d.id === fileId)) {
            console.log(`Found file ${fileId} in project ${project.id}`);
            return project;
          }
        } catch (e) {
          console.error(`Error checking documents for project ${project.id}:`, e);
        }
      }
      
      return undefined;
    } catch (error) {
      console.error('Error finding project for file:', error);
      return undefined;
    }
  };

  // Add event listener for project updates from Firebase
  useEffect(() => {
    // Setup event listeners for real-time updates
    const handleProjectsUpdated = (event: CustomEvent) => {
      const { projects: updatedProjects } = event.detail;
      console.log('Received real-time project updates:', updatedProjects);
      setProjects(updatedProjects);
      
      // If selectedProject is one of the updated projects, update it
      if (selectedProject) {
        const updatedSelectedProject = updatedProjects.find((p: Project) => p.id === selectedProject.id);
        if (updatedSelectedProject) {
          setSelectedProject(updatedSelectedProject);
        }
      }
    };

    // Add event listener
    document.addEventListener('projectsUpdated', handleProjectsUpdated as EventListener);
    document.addEventListener('userProjectsUpdated', handleProjectsUpdated as EventListener);
    
    return () => {
      // Remove event listener on cleanup
      document.removeEventListener('projectsUpdated', handleProjectsUpdated as EventListener);
      document.removeEventListener('userProjectsUpdated', handleProjectsUpdated as EventListener);
    };
  }, [selectedProject]);

  // Setup Firebase real-time subscription
  useEffect(() => {
    if (user) {
      if (user.role === 'Staff' || user.role === 'Admin') {
        // Staff and Admin can see all projects
        console.log('Setting up real-time subscription for all projects');
        setupProjectSubscription();
      } else {
        // Regular users only see their own projects
        console.log(`Setting up real-time subscription for ${user.id}'s projects`);
        setupUserProjectSubscription(user.id);
      }
    }
    
    // Cleanup subscription when component unmounts
    return () => {
      console.log('Cleaning up project subscription');
      cleanupProjectSubscription();
    };
  }, [user]);

  // Existing loadProjects function - for initial loading and fallback
  const loadProjects = async () => {
    try {
      let fetchedProjects: Project[] = [];
      
      if (user) {
        if (user.role === 'Staff' || user.role === 'Admin') {
          fetchedProjects = await projectService.getAll();
        } else {
          fetchedProjects = await projectService.getUserProjects(user.id);
        }
        
        console.log('Loaded projects:', fetchedProjects);
        setProjects(fetchedProjects);
      }
      
      // If selectedProject is no longer in the list, it was deleted or user lost access
      if (selectedProject && !fetchedProjects.some(p => p.id === selectedProject.id)) {
        // Select the first available project or clear selection if none left
        if (fetchedProjects.length > 0) {
          setSelectedProject(fetchedProjects[0]);
        } else {
          setSelectedProject(undefined);
          setCurrentFolderId(undefined);
        }
      } else {
        // Handle project selection from navigation state
        const state = location.state as { selectedProjectId?: string };
        if (state?.selectedProjectId) {
          const project = fetchedProjects.find(p => p.id === state.selectedProjectId);
          if (project) {
            setSelectedProject(project);
            // Clear the state to prevent reselection on subsequent renders
            navigate(location.pathname, { replace: true, state: {} });
          }
        }
        // If we're on the documents page and no project is selected,
        // select the first project
        else if (location.pathname.startsWith('/documents') && !selectedProject && fetchedProjects.length > 0) {
          // Check if we need to find a specific project for a folder in the URL
          const { folderId } = params;
          
          if (folderId) {
            // Try to find which project this folder belongs to
            for (const project of fetchedProjects) {
              const projectFolders = await folderService.getByProjectId(project.id);
              if (projectFolders.some(f => f.id === folderId)) {
                console.log(`Auto-selecting project ${project.id} for folder ${folderId}`);
                setSelectedProject(project);
                break;
              }
            }
          }
          
          // If no specific project was found, select the first one
          if (!selectedProject) {
            setSelectedProject(fetchedProjects[0]);
          }
        }

        // Update selected project if it exists in the fetched projects
        if (selectedProject) {
          const updatedProject = fetchedProjects.find(p => p.id === selectedProject.id);
          if (updatedProject) {
            setSelectedProject(updatedProject);
          }
        }
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Check if we need to switch projects when folder/file URL changes
  useEffect(() => {
    const { folderId, fileId } = params;
    
    // First check if we need to switch projects for a folder
    if (folderId && projects.length > 0 && (!folders || !folders.some(f => f.id === folderId))) {
      // The folder is not in the current project, need to find which project it's in
      const findAndSwitchProject = async () => {
        const project = await findProjectForFolder(folderId);
        if (project && project.id !== selectedProject?.id) {
          console.log(`Switching to project ${project.id} for folder ${folderId}`);
          setSelectedProject(project);
        }
      };
      
      findAndSwitchProject();
    } 
    // Then check if we need to switch projects for a file
    else if (fileId && !folderId && projects.length > 0 && (!documents || !documents.some(d => d.id === fileId))) {
      // The file is not in the current project, need to find which project it's in
      const findAndSwitchProject = async () => {
        const project = await findProjectForFile(fileId);
        if (project && project.id !== selectedProject?.id) {
          console.log(`Switching to project ${project.id} for file ${fileId}`);
          setSelectedProject(project);
        }
      };
      
      findAndSwitchProject();
    }
  }, [params, projects, folders, documents, selectedProject]);

  // Reset folder selection when project changes
  useEffect(() => {
    // Don't reset if we're navigating to a specific folder within a new project
    if (!params.folderId) {
    setCurrentFolderId(undefined);
    setDocumentManagerFolderId(undefined);
    } else {
      // Set the current folder ID to the one in the URL
      setCurrentFolderId(params.folderId);
      setDocumentManagerFolderId(params.folderId);
    }
  }, [selectedProject, setDocumentManagerFolderId, params.folderId]);

  // Handle legacy URL parameters (for backward compatibility)
  useEffect(() => {
    const folderParam = searchParams.get('folder');
    
    if (folderParam && folderParam !== currentFolderId) {
      // Set the current folder ID
      setCurrentFolderId(folderParam);
      setDocumentManagerFolderId(folderParam);
      
      // Redirect to the new URL format
      navigate(`/documents/projects/${selectedProject?.id}/folders/${folderParam}`, { replace: true });
    }
  }, [searchParams, currentFolderId, navigate, setDocumentManagerFolderId, selectedProject]);

  // Redirect to _root folder when on documents page
  useEffect(() => {
    // Check if we're on the base documents page with no specific folder
    // Or on a project's documents page without a folder
    const isBaseDocumentsPage = location.pathname === '/documents';
    const projectDocumentsPattern = /^\/documents\/projects\/([^\/]+)$/;
    const projectMatch = location.pathname.match(projectDocumentsPattern);
    
    if ((isBaseDocumentsPage || projectMatch) && selectedProject) {
      // If we're on a project page, make sure we're looking at the right project
      const projectId = projectMatch ? projectMatch[1] : selectedProject.id;
      
      // Find the _root folder for the current project
      const rootFolder = folders.find(f => 
        f.projectId === projectId && 
        f.metadata?.isRootFolder &&
        f.name === '_root'
      );
      
      if (rootFolder) {
        console.log(`Found _root folder (${rootFolder.id}) for project ${projectId}, redirecting`);
        
        // Add the folder to state first to ensure it's available
        const folder = folders.find(f => f.id === rootFolder.id);
        if (folder) {
          setDocumentManagerFolderId(folder.id);
          
          // Only navigate if we're not already on this folder's page
          if (!location.pathname.includes(`/folders/${rootFolder.id}`)) {
            // Navigate to the _root folder but using the project name instead of showing "_root"
            // This makes the URL look cleaner and hides implementation details from the user
            navigate(`/documents/projects/${projectId}/folders/${rootFolder.id}`, { 
              replace: true,
              state: { 
                folderName: selectedProject.name || "Project Documents",
                isRootFolder: true 
              }
            });
          }
        }
      } else {
        console.log(`No _root folder found for project ${projectId}, looking for alternative or creating one`);
        
        // Try to find any top-level folder in this project as a fallback
        const topLevelFolder = folders.find(f => 
          f.projectId === projectId && 
          (!f.parentId || f.parentId === '') && 
          !f.metadata?.isHidden
        );
        
        if (topLevelFolder) {
          console.log(`Found top-level folder ${topLevelFolder.id} as fallback, redirecting`);
          navigate(`/documents/projects/${projectId}/folders/${topLevelFolder.id}`, { replace: true });
        } else {
          // Before creating a new root folder, check if we're currently loading or if we've already triggered creation
          const isCreatingRootFolder = rootFolderCreationTracker.current[projectId];
          
          if (!isCreatingRootFolder && !foldersLoading) {
            // Mark that we're creating a root folder for this project to prevent duplicate creation
            rootFolderCreationTracker.current[projectId] = true;
            
            // As a last resort, attempt to create a _root folder
            console.log(`No suitable folders found, creating _root folder for project ${projectId}`);
            
            // Import needed service
            import('../services/folderTemplateService')
              .then((module) => {
                // Create the _root folder
                module.folderTemplateService.createInvisibleRootFolder(projectId)
                  .then((newRootFolder: Folder) => {
                    console.log(`Created new _root folder ${newRootFolder.id}, redirecting`);
                    // Reset the tracker for this project after successful creation
                    rootFolderCreationTracker.current[projectId] = false;
                    
                    navigate(`/documents/projects/${projectId}/folders/${newRootFolder.id}`, {
                      replace: true,
                      state: { 
                        folderName: selectedProject.name || "Project Documents",
                        isRootFolder: true 
                      }
                    });
                  })
                  .catch((error: Error) => {
                    console.error('Failed to create _root folder:', error);
                    // Reset the tracker for this project on error
                    rootFolderCreationTracker.current[projectId] = false;
                  });
              })
              .catch((error: Error) => {
                console.error('Failed to import folderTemplateService:', error);
                // Reset the tracker for this project on error
                rootFolderCreationTracker.current[projectId] = false;
              });
          } else {
            console.log(`Already creating a root folder for project ${projectId} or folders are still loading, skipping creation`);
          }
        }
      }
    }
  }, [location.pathname, selectedProject, folders, navigate, foldersLoading]);

  // Handle project switching from navigation state
  useEffect(() => {
    const state = location.state as { 
      needsProjectSwitch?: boolean;
      targetFolderId?: string;
      targetFileId?: string;
      targetProjectId?: string;
      targetLink?: string;
      fromNotification?: boolean;
      timestamp?: number;
    };

    if (state?.needsProjectSwitch && projects.length > 0) {
      console.log('Handling project switch from navigation state:', state);
      
      const switchProjectAndNavigate = async () => {
        let project: Project | undefined;
        
        // If we have the target project ID directly, use it (fastest path)
        if (state.targetProjectId) {
          project = projects.find(p => p.id === state.targetProjectId);
          if (project) {
            console.log(`Found project directly using ID: ${project.id}`);
          }
        }
        
        // If direct project lookup fails but we have a folder ID, find by folder
        if (!project && state.targetFolderId) {
          project = await findProjectForFolder(state.targetFolderId);
        }
        
        // If project still not found but we have a file ID, find by file
        if (!project && state.targetFileId) {
          project = await findProjectForFile(state.targetFileId);
        }
        
        // If we found a project and it's different from the current one, switch to it
        if (project && project.id !== selectedProject?.id) {
          console.log(`Switching to project ${project.id} for navigation`);
          
          // Set the project 
          setSelectedProject(project);
          
          // Construct the target link with the project ID
          let targetLink = `/documents/projects/${project.id}`;
          
          if (state.targetFolderId) {
            targetLink += `/folders/${state.targetFolderId}`;
            
            if (state.targetFileId) {
              targetLink += `/files/${state.targetFileId}`;
            }
          } else if (state.targetFileId) {
            targetLink += `/files/${state.targetFileId}`;
          }
          
          // Remove the state to prevent rerunning this effect
          navigate(location.pathname, { 
            replace: true, 
            state: {} 
          });
          
          // Navigate to the target link after a longer delay to ensure project fully loads
          console.log('Project switched, will navigate to:', targetLink);
          setTimeout(() => {
            console.log('Project loaded, now navigating to:', targetLink);
            navigate(targetLink, { replace: true });
          }, 500); // Increased timeout for safer project switching
          
          return; // Exit early since we're handling navigation
        }
        
        // If no project switch needed but still have a target link, navigate there
        if (state.targetLink) {
          console.log('No project switch needed, navigating directly to:', state.targetLink);
          // Clear state first
          navigate(location.pathname, { 
            replace: true, 
            state: {} 
          });
          
          // Then navigate to target
          setTimeout(() => {
            navigate(state.targetLink!, { replace: true });
          }, 100);
        }
      };
      
      switchProjectAndNavigate();
    }
  }, [location.state, projects, selectedProject]);

  // Handle location state changes from notification navigation
  useEffect(() => {
    // Check if we have navigation state from a notification
    if (location.state && location.state.fromNotification) {
      console.log('Received notification navigation state:', location.state);
      
      const navigationState = location.state;
      
      // Store the pending navigation state
      setPendingNotificationNavigation(navigationState);
      
      // Switch to the correct project if needed
      if (navigationState.targetProjectId && 
          (!selectedProject || selectedProject.id !== navigationState.targetProjectId)) {
        const project = projects.find(p => p.id === navigationState.targetProjectId);
        if (project) {
          console.log(`Switching to project ${project.id} from notification`);
          setSelectedProject(project);
        }
      }
      
      // Set the folder ID if provided
      if (navigationState.targetFolderId && currentFolderId !== navigationState.targetFolderId) {
        console.log(`Setting folder ID ${navigationState.targetFolderId} from notification`);
        setCurrentFolderId(navigationState.targetFolderId);
      }
    }
  }, [location.state, projects, selectedProject, currentFolderId]);
  
  // Process pending notification navigation after project/folder changes
  useEffect(() => {
    if (pendingNotificationNavigation) {
      const {targetProjectId, targetFolderId, targetFileId} = pendingNotificationNavigation;
      
      // Check if project and folder are now correct
      const projectMatches = !targetProjectId || 
        (selectedProject && selectedProject.id === targetProjectId);
      const folderMatches = !targetFolderId || 
        (currentFolderId === targetFolderId);
      
      if (projectMatches && folderMatches) {
        console.log('Project and folder now match notification target, clearing pending navigation');
        
        // Clear the pending navigation
        setPendingNotificationNavigation(null);
        
        // Perform a refresh to ensure we have the latest data
        if (selectedProject && currentFolderId) {
          console.log('Refreshing document list after notification navigation');
          documentService.getByFolderId(currentFolderId)
            .then((docs: Document[]) => {
              console.log(`Loaded ${docs.length} documents after notification navigation`);
              
              // Look for the target file if specified
              if (targetFileId) {
                const targetDoc = docs.find((doc: Document) => doc.id === targetFileId);
                if (targetDoc) {
                  console.log(`Found target file ${targetDoc.name}, navigating to it`);
                  // The URL navigation will happen automatically due to the file being found
                }
              }
            })
            .catch((err: Error) => {
              console.error('Error refreshing documents after notification:', err);
            });
        }
      }
    }
  }, [pendingNotificationNavigation, selectedProject, currentFolderId, documents]);

  const handleUpdateProject = async (id: string, updates: Partial<Project>) => {
    try {
      await projectService.update(id, updates);
      await loadProjects(); // Reload projects to get updated data
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const handleFolderSelect = (folder?: Folder) => {
    const newFolderId = folder?.id;
    setCurrentFolderId(newFolderId);
    setDocumentManagerFolderId(newFolderId);
  };

  const updateDocumentPermission = async (id: string, permission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL') => {
    try {
      // Get the current document to ensure it exists
      const docToUpdate = documents.find(d => d.id === id);
      if (!docToUpdate) {
        console.error(`Document ${id} not found for permission update`);
        return;
      }

      // Create metadata update with access permission
      const metadataUpdate = {
        ...(docToUpdate.metadata || {}),
        access: permission
      };

      // Use updateDocument function which already exists in the component
      await updateDocument(id, { 
        metadata: metadataUpdate
      });
      
    } catch (error) {
      console.error('Error updating document permission:', error);
      throw new Error('Failed to update document permission');
    }
  };

  const updateFolderPermission = async (id: string, permission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL') => {
    try {
      // Get the current folder to ensure it exists
      const folderToUpdate = folders.find(f => f.id === id);
      if (!folderToUpdate) {
        console.error(`Folder ${id} not found for permission update`);
        return;
      }

      // Create folder metadata
      const folderName = folderToUpdate.name; 
      
      // First update the folder name (keeping it the same) to trigger a refresh
      await updateFolder(id, folderName);
      
      // Then directly modify the folder's metadata using an internal API call
      // You might need to make another implementation for this depending on your actual services
      const folderRef = doc(db, 'folders', id);
      await updateDoc(folderRef, {
        'metadata.access': permission
      });
      
    } catch (error) {
      console.error('Error updating folder permission:', error);
      throw new Error('Failed to update folder permission');
    }
  };

  // Function to clean up duplicate _root folders for a project
  const cleanupDuplicateRootFolders = async (projectId: string) => {
    try {
      if (!projectId) return;
      
      console.log(`Checking for duplicate _root folders for project ${projectId}`);
      
      // Find all _root folders for this project
      const rootFolders = folders.filter(folder => 
        folder.projectId === projectId && 
        folder.metadata?.isRootFolder && 
        folder.name === '_root'
      );
      
      // If we have multiple _root folders, clean them up
      if (rootFolders.length > 1) {
        console.log(`Found ${rootFolders.length} _root folders for project ${projectId}, cleaning up`);
        
        // Use folderService to clean up duplicates
        const primaryRootId = await folderService.cleanupDuplicateRootFolders(projectId);
        
        if (primaryRootId) {
          console.log(`Cleanup complete, primary _root folder is ${primaryRootId}`);
          // Wait a moment for database to sync
          setTimeout(() => {
            // The folders will be reloaded automatically via subscriptions,
            // but we can force a refresh if needed
            if (selectedProject && selectedProject.id === projectId) {
              console.log('Forcing folder refresh after cleanup');
              folderService.getByProjectId(projectId);
            }
          }, 500);
        }
      }
    } catch (error) {
      console.error('Error cleaning up duplicate root folders:', error);
    }
  };
  
  // Clean up duplicate _root folders when folders change
  useEffect(() => {
    if (selectedProject && folders.length > 0) {
      // Count _root folders for this project
      const rootFolderCount = folders.filter(folder => 
        folder.projectId === selectedProject.id && 
        folder.metadata?.isRootFolder && 
        folder.name === '_root'
      ).length;
      
      if (rootFolderCount > 1) {
        console.log(`Multiple _root folders detected (${rootFolderCount}) for project ${selectedProject.id}`);
        cleanupDuplicateRootFolders(selectedProject.id);
      }
    }
  }, [selectedProject, folders]);

  return (
    <AnimatePresence mode="sync">
      <Routes>
        <Route
          path="/"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              {selectedProject ? (
                <ProjectDetails 
                  project={selectedProject}
                  tasks={tasks.filter(t => t.projectId === selectedProject.id)}
                  onProjectUpdate={loadProjects}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Select a project to view details
                </div>
              )}
            </Layout>
          }
        />
        
        <Route
          path="/team"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              <TeamList
                projects={projects}
                selectedProject={selectedProject}
              />
            </Layout>
          }
        />
        
        <Route
          path="/people"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              <PeopleList
                projects={projects}
                onAssignToProject={assignToProject}
                onRemoveFromProject={removeFromProject}
              />
            </Layout>
          }
        />
        
        <Route
          path="/documents/projects/:projectId"
          element={
            <DocumentsPage
              projects={projects}
              selectedProject={selectedProject}
              folders={folders}
              documents={documents}
              currentFolderId={currentFolderId}
              onFolderSelect={handleFolderSelect}
              onProjectSelect={setSelectedProject}
              onUpdateProject={handleUpdateProject}
              tasks={tasks}
              createDocument={createDocument}
              createFolder={createFolder}
              updateFolder={updateFolder}
              deleteFolder={deleteFolder}
              updateDocument={updateDocument}
              deleteDocument={deleteDocument}
              updateDocumentPermission={updateDocumentPermission}
              updateFolderPermission={updateFolderPermission}
              onCopyOrMoveFile={(sourceDocumentId, destinationFolderId, action) => {
                if (action === 'copy') {
                  return documentService.copyDocument(sourceDocumentId, destinationFolderId);
                } else {
                  return documentService.moveDocument(sourceDocumentId, destinationFolderId);
                }
              }}
              onBulkRename={(items, pattern) => bulkRenameItems(items, pattern)}
            />
          }
        />
        
        <Route
          path="/documents/projects/:projectId/folders/:folderId"
          element={
            <DocumentsPage
              projects={projects}
              selectedProject={selectedProject}
              folders={folders}
              documents={documents}
              currentFolderId={currentFolderId}
              onFolderSelect={handleFolderSelect}
              onProjectSelect={setSelectedProject}
              onUpdateProject={handleUpdateProject}
              tasks={tasks}
              createDocument={createDocument}
              createFolder={createFolder}
              updateFolder={updateFolder}
              deleteFolder={deleteFolder}
              updateDocument={updateDocument}
              deleteDocument={deleteDocument}
              updateDocumentPermission={updateDocumentPermission}
              updateFolderPermission={updateFolderPermission}
              onCopyOrMoveFile={(sourceDocumentId, destinationFolderId, action) => {
                if (action === 'copy') {
                  return documentService.copyDocument(sourceDocumentId, destinationFolderId);
                } else {
                  return documentService.moveDocument(sourceDocumentId, destinationFolderId);
                }
              }}
              onBulkRename={(items, pattern) => bulkRenameItems(items, pattern)}
            />
          }
        />
        
        <Route
          path="/documents/projects/:projectId/folders/:folderId/files/:fileId"
          element={
            <DocumentsPage
                  projects={projects}
              selectedProject={selectedProject}
              folders={folders}
              documents={documents}
              currentFolderId={currentFolderId}
              onFolderSelect={handleFolderSelect}
              onProjectSelect={setSelectedProject}
              onUpdateProject={handleUpdateProject}
              tasks={tasks}
              createDocument={createDocument}
              createFolder={createFolder}
              updateFolder={updateFolder}
              deleteFolder={deleteFolder}
              updateDocument={updateDocument}
              deleteDocument={deleteDocument}
              updateDocumentPermission={updateDocumentPermission}
              updateFolderPermission={updateFolderPermission}
              onCopyOrMoveFile={(sourceDocumentId, destinationFolderId, action) => {
                if (action === 'copy') {
                  return documentService.copyDocument(sourceDocumentId, destinationFolderId);
                } else {
                  return documentService.moveDocument(sourceDocumentId, destinationFolderId);
                }
              }}
              onBulkRename={(items, pattern) => bulkRenameItems(items, pattern)}
            />
          }
        />
        
        <Route
          path="/documents/projects/:projectId/files/:fileId"
          element={
            <DocumentsPage
              projects={projects}
              selectedProject={selectedProject}
              folders={folders}
              documents={documents}
              currentFolderId={currentFolderId}
              onFolderSelect={handleFolderSelect}
              onProjectSelect={setSelectedProject}
              onUpdateProject={handleUpdateProject}
              tasks={tasks}
              createDocument={createDocument}
              createFolder={createFolder}
              updateFolder={updateFolder}
              deleteFolder={deleteFolder}
              updateDocument={updateDocument}
              deleteDocument={deleteDocument}
              updateDocumentPermission={updateDocumentPermission}
              updateFolderPermission={updateFolderPermission}
              onCopyOrMoveFile={(sourceDocumentId, destinationFolderId, action) => {
                if (action === 'copy') {
                  return documentService.copyDocument(sourceDocumentId, destinationFolderId);
                } else {
                  return documentService.moveDocument(sourceDocumentId, destinationFolderId);
                }
              }}
              onBulkRename={(items, pattern) => bulkRenameItems(items, pattern)}
            />
          }
        />
        
        <Route
          path="/tasks"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              {selectedProject ? (
                <TaskList
                  tasks={tasks.filter(t => t.projectId === selectedProject.id)}
                  teamMembers={teamMembers.filter(m => m.projectIds.includes(selectedProject.id))}
                  projectId={selectedProject.id}
                  onCreateTask={createTask}
                  onStatusChange={(taskId, status) => updateTask(taskId, { status })}
                  onUpdateTask={updateTask}
                  onDeleteTask={deleteTask}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Select a project to view tasks
                </div>
              )}
            </Layout>
          }
        />
        
        <Route
          path="/tasks/:projectId/:taskId"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              <TaskDetailView 
                projects={projects}
                selectedProject={selectedProject}
                setSelectedProject={setSelectedProject}
                tasks={tasks}
                teamMembers={teamMembers}
                createTask={createTask}
                updateTask={updateTask}
                deleteTask={deleteTask}
              />
            </Layout>
          }
        />
        
        <Route
          path="/settings"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              <Settings 
                projects={projects}
                onUpdateProject={handleUpdateProject}
              />
            </Layout>
          }
        />

        <Route
          path="/account"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              <AccountSettings />
            </Layout>
          }
        />

        {/* Keep legacy routes for backward compatibility */}
        <Route
          path="/documents"
          element={
            <DocumentsPage
              projects={projects}
              selectedProject={selectedProject}
              folders={folders}
              documents={documents}
              currentFolderId={currentFolderId}
              onFolderSelect={handleFolderSelect}
              onProjectSelect={setSelectedProject}
              onUpdateProject={handleUpdateProject}
              tasks={tasks}
              createDocument={createDocument}
              createFolder={createFolder}
              updateFolder={updateFolder}
              deleteFolder={deleteFolder}
              updateDocument={updateDocument}
              deleteDocument={deleteDocument}
              updateDocumentPermission={updateDocumentPermission}
              updateFolderPermission={updateFolderPermission}
              onCopyOrMoveFile={(sourceDocumentId, destinationFolderId, action) => {
                if (action === 'copy') {
                  return documentService.copyDocument(sourceDocumentId, destinationFolderId);
                } else {
                  return documentService.moveDocument(sourceDocumentId, destinationFolderId);
                }
              }}
              onBulkRename={(items, pattern) => bulkRenameItems(items, pattern)}
            />
          }
        />
        
        <Route
          path="/documents/folders/:folderId"
          element={
            <DocumentsPage
              projects={projects}
              selectedProject={selectedProject}
              folders={folders}
              documents={documents}
              currentFolderId={currentFolderId}
              onFolderSelect={handleFolderSelect}
              onProjectSelect={setSelectedProject}
              onUpdateProject={handleUpdateProject}
              tasks={tasks}
              createDocument={createDocument}
              createFolder={createFolder}
              updateFolder={updateFolder}
              deleteFolder={deleteFolder}
              updateDocument={updateDocument}
              deleteDocument={deleteDocument}
              updateDocumentPermission={updateDocumentPermission}
              updateFolderPermission={updateFolderPermission}
              onCopyOrMoveFile={(sourceDocumentId, destinationFolderId, action) => {
                if (action === 'copy') {
                  return documentService.copyDocument(sourceDocumentId, destinationFolderId);
                } else {
                  return documentService.moveDocument(sourceDocumentId, destinationFolderId);
                }
              }}
              onBulkRename={(items, pattern) => bulkRenameItems(items, pattern)}
            />
          }
        />
        
        <Route
          path="/documents/folders/:folderId/files/:fileId"
          element={
            <DocumentsPage
              projects={projects}
              selectedProject={selectedProject}
              folders={folders}
              documents={documents}
              currentFolderId={currentFolderId}
              onFolderSelect={handleFolderSelect}
              onProjectSelect={setSelectedProject}
              onUpdateProject={handleUpdateProject}
              tasks={tasks}
              createDocument={createDocument}
              createFolder={createFolder}
              updateFolder={updateFolder}
              deleteFolder={deleteFolder}
              updateDocument={updateDocument}
              deleteDocument={deleteDocument}
              updateDocumentPermission={updateDocumentPermission}
              updateFolderPermission={updateFolderPermission}
              onCopyOrMoveFile={(sourceDocumentId, destinationFolderId, action) => {
                if (action === 'copy') {
                  return documentService.copyDocument(sourceDocumentId, destinationFolderId);
                } else {
                  return documentService.moveDocument(sourceDocumentId, destinationFolderId);
                }
              }}
              onBulkRename={(items, pattern) => bulkRenameItems(items, pattern)}
            />
          }
        />
        
        <Route
          path="/documents/files/:fileId"
          element={
            <DocumentsPage
              projects={projects}
              selectedProject={selectedProject}
              folders={folders}
              documents={documents}
              currentFolderId={currentFolderId}
              onFolderSelect={handleFolderSelect}
              onProjectSelect={setSelectedProject}
              onUpdateProject={handleUpdateProject}
              tasks={tasks}
              createDocument={createDocument}
              createFolder={createFolder}
              updateFolder={updateFolder}
              deleteFolder={deleteFolder}
              updateDocument={updateDocument}
              deleteDocument={deleteDocument}
              updateDocumentPermission={updateDocumentPermission}
              updateFolderPermission={updateFolderPermission}
              onCopyOrMoveFile={(sourceDocumentId, destinationFolderId, action) => {
                if (action === 'copy') {
                  return documentService.copyDocument(sourceDocumentId, destinationFolderId);
                } else {
                  return documentService.moveDocument(sourceDocumentId, destinationFolderId);
                }
              }}
              onBulkRename={(items, pattern) => bulkRenameItems(items, pattern)}
            />
          }
        />

      </Routes>
    </AnimatePresence>
  );
}