import React, { useState, useEffect } from 'react';
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
import { Project, Folder, Document } from '../types';
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
  updateDocumentPermission: (id: string, permission: 'STAFF_ONLY' | 'ALL') => Promise<void>;
  updateFolderPermission: (id: string, permission: 'STAFF_ONLY' | 'ALL') => Promise<void>;
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
  updateFolderPermission
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
        console.log(`Switching to project ${project.id} from URL parameter`);
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
          onFolderSelect={handleFolderSelect}
          onPreview={handleFileSelect}
          onCreateFolder={createFolder}
          onCreateDocument={createDocument}
          onUpdateFolder={updateFolder}
          onDeleteFolder={deleteFolder}
          onUpdateDocument={updateDocument}
          onDeleteDocument={deleteDocument}
          selectedFile={selectedFile}
          onShare={handleShare}
          onUpdateDocumentPermission={updateDocumentPermission}
          onUpdateFolderPermission={updateFolderPermission}
          onFullscreenChange={setIsFullscreen}
        />
      ) : (
        <div className="h-full flex items-center justify-center text-gray-500">
          Select a project to view documents
        </div>
      )}
    </Layout>
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
    setCurrentFolderId: setDocumentManagerFolderId
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

  const loadProjects = async () => {
    try {
      let fetchedProjects: Project[] = [];
      
      // Staff users see all projects, others only see projects they're added to
      if (user?.role === 'Staff') {
        // Staff can see all projects
        fetchedProjects = await projectService.getAll();
      } else if (user) {
        // Other users only see projects they're added to
        fetchedProjects = await projectService.getUserProjects(user.id);
      } else {
        // No user logged in - should not happen in protected routes
        console.warn('No user found when loading projects');
        fetchedProjects = [];
      }
      
      setProjects(fetchedProjects);
      
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

  const updateDocumentPermission = async (id: string, permission: 'STAFF_ONLY' | 'ALL') => {
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

  const updateFolderPermission = async (id: string, permission: 'STAFF_ONLY' | 'ALL') => {
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
                teamMembers={teamMembers.filter(m => selectedProject ? m.projectIds.includes(selectedProject.id) : false)}
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
                teamMembers={teamMembers}
                projects={projects}
                onCreateMember={createTeamMember}
                onUpdateMember={updateTeamMember}
                onDeleteMember={deleteTeamMember}
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
            />
          }
        />

      </Routes>
    </AnimatePresence>
  );
}