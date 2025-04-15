import { Search, Plus, Archive, CheckCircle2, Clock, Trash2, AlertCircle, ArrowUpDown, Loader2, MoreVertical } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { Project, Task } from "../types";
import AddProject from "./AddProject";
import { useMilestoneManager } from "../hooks/useMilestoneManager";
import { calculateMilestoneProgress } from "../utils/progressCalculator";
import { projectService, userService } from "../services";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";

interface DeleteConfirmationProps {
  projectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmationPopup = ({ projectName, onConfirm, onCancel }: DeleteConfirmationProps) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white rounded-lg p-6 max-w-md w-full m-4"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Project</h3>
      <p className="text-gray-600 mb-6">
        Are you sure you want to delete "{projectName}"? This action cannot be undone.
      </p>
      <div className="flex justify-end space-x-3">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors flex items-center space-x-2"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete Project</span>
        </button>
      </div>
    </motion.div>
  </motion.div>
);

interface ProjectItemProps {
  project: Project;
  selectedId?: string;
  onSelect: (project: Project) => void;
  onStatusChange: (projectId: string, newStatus: Project["status"]) => void;
  onDeleteProject: (projectId: string) => void;
  tasks: Task[];
  isDeletingProject: string | null;
  index: number;
}

const ProjectItem = ({
  project,
  selectedId,
  onSelect,
  onStatusChange,
  onDeleteProject,
  tasks,
  isDeletingProject,
  index
}: ProjectItemProps) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { milestones, loading: milestonesLoading } = useMilestoneManager(project.id);
  const [progress, setProgress] = useState(project.progress);
  const prevProgressRef = useRef(progress);
  const statusUpdateTimeoutRef = useRef<NodeJS.Timeout>();
  const { user } = useAuth();

  // Format location for display
  const location =
    typeof project.metadata?.location === "string"
      ? project.metadata.location
      : project.metadata?.location
      ? `${project.metadata.location.city || ""}, ${
          project.metadata.location.state || ""
        }, ${project.metadata.location.country || ""}`.replace(
          /^[, ]+|[, ]+$/g,
          ""
        )
      : "";

  useEffect(() => {
    if (!milestonesLoading) {
      const newProgress = calculateMilestoneProgress(milestones);
      if (newProgress !== prevProgressRef.current) {
        prevProgressRef.current = newProgress;
        setProgress(newProgress);

        if (project.status !== "archived") {
          if (statusUpdateTimeoutRef.current) {
            clearTimeout(statusUpdateTimeoutRef.current);
          }

          statusUpdateTimeoutRef.current = setTimeout(() => {
            const newStatus = newProgress === 100 ? "done" : "active";
            if (project.status !== newStatus) {
              onStatusChange(project.id, newStatus);
            }
          }, 500);
        }
      }
    }

    return () => {
      if (statusUpdateTimeoutRef.current) {
        clearTimeout(statusUpdateTimeoutRef.current);
      }
    };
  }, [
    milestones,
    milestonesLoading,
    project.id,
    project.status,
    onStatusChange,
  ]);

  const getStatusIcon = (status: Project["status"]) => {
    switch (status) {
      case "active":
        return <Clock className="w-4 h-4 text-blue-500" />;
      case "done":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "archived":
        return <Archive className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: Project["status"]) => {
    switch (status) {
      case "active":
        return "bg-blue-100 text-blue-800";
      case "done":
        return "bg-green-100 text-green-800";
      case "archived":
        return "bg-gray-100 text-gray-600";
    }
  };

  const getProgressColor = useCallback((value: number) => {
    if (value < 30) return "bg-red-500";
    if (value < 70) return "bg-yellow-500";
    return "bg-green-500";
  }, []);

  const getAnimationDuration = useCallback(
    (currentProgress: number, previousProgress: number) => {
      const delta = Math.abs(currentProgress - previousProgress);
      return Math.max(0.5, Math.min(1.5, delta / 100));
    },
    []
  );

  const handleCardClick = (e: React.MouseEvent) => {
    if (e.target instanceof Element && e.target.closest(".status-menu")) {
      return;
    }
    onSelect(project);
  };

  const handleDeleteConfirm = () => {
    onDeleteProject(project.id);
    setShowDeleteConfirm(false);
  };

  const renderStatusMenu = () => {
    // For non-staff users, just show the status without dropdown
    if (user?.role !== 'Staff') {
      return (
        <div className="status-menu">
          <button
            onClick={(e) => e.stopPropagation()}
            className={`flex items-center space-x-2 px-2 py-1 rounded-md ${getStatusColor(project.status)}`}
          >
            {getStatusIcon(project.status)}
            <span className="text-sm capitalize">{project.status}</span>
          </button>
        </div>
      );
    }

    // For staff users, show the status button with dropdown
    return (
      <div className="relative status-menu">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowStatusMenu(!showStatusMenu);
          }}
          className={`flex items-center space-x-2 px-2 py-1 rounded-md ${getStatusColor(project.status)}`}
        >
          {getStatusIcon(project.status)}
          <span className="text-sm capitalize">{project.status}</span>
        </button>

        <AnimatePresence>
          {showStatusMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200"
            >
              <div className="py-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onStatusChange(project.id, "archived");
                    setShowStatusMenu(false);
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full"
                >
                  <Archive className="w-4 h-4" />
                  <span>Archive</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowStatusMenu(false);
                    setShowDeleteConfirm(true);
                  }}
                  className="flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <>
      <Draggable draggableId={project.id} index={index}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className="mb-2"
          >
            <motion.div
              onClick={handleCardClick}
              className={`w-full p-4 text-left rounded-lg transition-all duration-300 hover:scale-[1.01] cursor-pointer ${
                selectedId === project.id
                  ? "bg-primary-50 border-primary-200"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              } border card-shadow relative ${isDeletingProject === project.id ? 'opacity-70' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {isDeletingProject === project.id && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70 rounded-lg z-10">
                  <div className="flex flex-col items-center space-y-2">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                    <span className="text-sm text-gray-600">Deleting project...</span>
                  </div>
                </div>
              )}
              
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{project.name}</h3>
                  {project.client ? (
                    <p className="text-sm text-gray-500 mt-1">{project.client}</p>
                  ) : (
                    <br />
                  )}
                </div>
                
                {renderStatusMenu()}
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Progress</span>
                  <motion.span
                    key={`progress-text-${progress}`}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="font-medium"
                  >
                    {progress}%
                  </motion.span>
                </div>
                <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    key={`progress-bar-${project.id}-${progress}`}
                    className={`absolute left-0 top-0 h-full rounded-full ${getProgressColor(
                      progress
                    )}`}
                    initial={{ width: `${prevProgressRef.current}%` }}
                    animate={{ width: `${progress}%` }}
                    transition={{
                      duration: getAnimationDuration(progress, prevProgressRef.current),
                      ease: [0.4, 0, 0.2, 1],
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </Draggable>

      <AnimatePresence>
        {showDeleteConfirm && (
          <DeleteConfirmationPopup
            projectName={project.name}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

interface ProjectListProps {
  projects: Project[];
  selectedId?: string;
  onSelect: (project: Project) => void;
  onProjectsChange: () => void;
  onUpdateProject: (id: string, updates: Partial<Project>) => void;
  tasks: Task[];
}

export default function ProjectList({
  projects,
  selectedId,
  onSelect,
  onProjectsChange,
  onUpdateProject,
  tasks,
}: ProjectListProps) {
  const [showAddProject, setShowAddProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredProjects, setFilteredProjects] = useState(projects);
  const [projectOrder, setProjectOrder] = useState<Project[]>([]);
  const [isOrderLoaded, setIsOrderLoaded] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isProjectTab = location.pathname === "/";
  const [isDeletingProject, setIsDeletingProject] = useState<string | null>(null);
  const { showToast } = useToast();
  const { user } = useAuth();

  // Load user's saved project order
  useEffect(() => {
    const loadSavedOrder = async () => {
      if (!user?.id || projects.length === 0) return;
      
      try {
        const savedOrder = await userService.getProjectOrder(user.id);
        
        if (savedOrder && savedOrder.length > 0) {
          // Create a map for quick lookup
          const projectMap = new Map(projects.map(p => [p.id, p]));
          
          // Create ordered array from saved IDs, only including projects that exist
          const orderedProjects = savedOrder
            .map(id => projectMap.get(id))
            .filter(p => p !== undefined) as Project[];
          
          // Add any projects that aren't in saved order at the end
          projects.forEach(project => {
            if (!savedOrder.includes(project.id)) {
              orderedProjects.push(project);
            }
          });
          
          setProjectOrder(orderedProjects);
          console.log('Loaded custom project order from user preferences');
        } else {
          setProjectOrder(projects);
        }
      } catch (error) {
        console.error('Error loading saved project order:', error);
        setProjectOrder(projects);
      } finally {
        setIsOrderLoaded(true);
      }
    };
    
    loadSavedOrder();
  }, [user, projects]);

  useEffect(() => {
    // Only apply filtering after the custom order is loaded
    if (!isOrderLoaded) return;
    
    // Filter projects without sorting by name
    const filtered = projectOrder
      .filter((project) => project.status !== "archived")
      .filter((project) => {
        const searchLower = searchQuery.toLowerCase();
        return (
          project.name.toLowerCase().includes(searchLower) ||
          project.client.toLowerCase().includes(searchLower) ||
          project.metadata?.industry.toLowerCase().includes(searchLower) ||
          project.metadata?.projectType.toLowerCase().includes(searchLower) ||
          project.metadata?.location.city.toLowerCase().includes(searchLower) ||
          project.metadata?.location.country.toLowerCase().includes(searchLower)
        );
      });
    
    setFilteredProjects(filtered);
  }, [searchQuery, projectOrder, isOrderLoaded, projects]);

  const handleDragEnd = (result: DropResult) => {
    const { destination, source } = result;

    // If dropped outside the list or didn't move
    if (!destination || (destination.index === source.index)) {
      return;
    }

    // Reorder the list
    const newOrder = Array.from(filteredProjects);
    const [removed] = newOrder.splice(source.index, 1);
    newOrder.splice(destination.index, 0, removed);

    setFilteredProjects(newOrder);
    
    // Also update the master project order (including archived projects)
    const updatedProjectOrder = Array.from(projectOrder);
    // Find the indices in the full project order
    const sourceIdx = updatedProjectOrder.findIndex(p => p.id === removed.id);
    if (sourceIdx !== -1) {
      updatedProjectOrder.splice(sourceIdx, 1);
      // Find where to insert in the master list (approximate position)
      let targetIdx;
      if (destination.index === 0) {
        targetIdx = 0;
      } else if (destination.index >= newOrder.length - 1) {
        targetIdx = updatedProjectOrder.length;
      } else {
        // Find the project that would be before this one in the filtered list
        const beforeProject = newOrder[destination.index - 1];
        targetIdx = updatedProjectOrder.findIndex(p => p.id === beforeProject.id) + 1;
      }
      updatedProjectOrder.splice(targetIdx, 0, removed);
      setProjectOrder(updatedProjectOrder);
    }
    
    // Save the new order to user preferences
    if (user?.id) {
      const projectIds = updatedProjectOrder.map(project => project.id);
      userService.saveProjectOrder(user.id, projectIds)
        .then(() => {
          console.log('Project order saved to user preferences');
        })
        .catch(error => {
          console.error('Error saving project order:', error);
        });
    }
  };

  const handleProjectSelect = (project: Project) => {
    onSelect(project);

    if (!isProjectTab) {
      navigate("/", {
        replace: true,
        state: {
          fromPath: location.pathname,
          projectId: project.id,
        },
      });
    }
  };

  const handleStatusChange = (
    projectId: string,
    newStatus: Project["status"]
  ) => {
    const updates: Partial<Project> = {
      status: newStatus,
    };

    if (newStatus === "archived") {
      const currentProject = projects.find((p) => p.id === projectId);
      if (currentProject && currentProject.metadata) {
        updates.metadata = {
          industry: currentProject.metadata.industry || '',
          projectType: currentProject.metadata.projectType || '',
          location: currentProject.metadata.location || { city: '', state: '', country: '' },
          budget: currentProject.metadata.budget || '',
          scope: currentProject.metadata.scope || '',
          archivedAt: new Date().toISOString(),
          // Preserve any other existing metadata fields
          ...(currentProject.metadata.lastMilestoneUpdate && { 
            lastMilestoneUpdate: currentProject.metadata.lastMilestoneUpdate 
          })
        };
      } else {
        // If metadata doesn't exist, create a minimal valid structure
        updates.metadata = {
          industry: '',
          projectType: '',
          location: { city: '', state: '', country: '' },
          budget: '',
          scope: '',
          archivedAt: new Date().toISOString()
        };
      }
    }

    onUpdateProject(projectId, updates);
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      setIsDeletingProject(projectId);
      
      console.log(`Deleting project ${projectId}...`);
      await projectService.delete(projectId);
      console.log(`Project ${projectId} deleted successfully`);
      
      // Show success toast
      showToast('Project deleted successfully', 'success');
      setIsDeletingProject(null);
      
      // No need to manually update the list as Firebase will trigger a real-time update
      // The events from subscriptionManager will update the projects automatically
      
      // If the deleted project was selected, reset selection
      if (selectedId === projectId) {
        const remainingProjects = projects.filter(p => p.id !== projectId);
        if (remainingProjects.length > 0) {
          onSelect(remainingProjects[0]);
        } else {
          // If no projects left, pass null to reset selection
          onSelect(null as any);
        }
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      showToast('Failed to delete project', 'error');
      setIsDeletingProject(null);
    }
  };

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4 space-y-4">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
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
        </div>
        
        <div className="flex w-full">
          {user?.role === "Staff" || user?.role === "Admin" && (
            <button
              onClick={() => setShowAddProject(true)}
              className="w-full px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-all duration-300 flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          )}
        </div>

        {searchQuery && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-gray-500"
          >
            Found {filteredProjects.length}{" "}
            {filteredProjects.length === 1 ? "project" : "projects"}
          </motion.div>
        )}
      </div>

      <motion.div className="p-4 space-y-4">
        <DragDropContext onDragEnd={handleDragEnd}>
          <AnimatePresence mode="wait">
            {filteredProjects.length > 0 ? (
              <Droppable droppableId="projects-list">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-2"
                  >
                    {filteredProjects.map((project, index) => (
                      <ProjectItem
                        key={project.id}
                        project={project}
                        selectedId={selectedId}
                        onSelect={handleProjectSelect}
                        onStatusChange={handleStatusChange}
                        onDeleteProject={handleDeleteProject}
                        tasks={tasks}
                        isDeletingProject={isDeletingProject}
                        index={index}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-8"
              >
                <p className="text-gray-500">No projects found</p>
                {searchQuery && (
                  <p className="text-sm text-gray-400 mt-2">
                    Try adjusting your search terms
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </DragDropContext>
      </motion.div>

      {showAddProject && (
        <AddProject
          onSuccess={() => {
            setShowAddProject(false);
            onProjectsChange();
          }}
          onCancel={() => setShowAddProject(false)}
        />
      )}
    </>
  );
}