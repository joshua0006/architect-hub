import { Search, Plus, Archive, CheckCircle2, Clock, Trash2, AlertCircle } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Project, Task } from "../types";
import AddProject from "./AddProject";
import { useMilestoneManager } from "../hooks/useMilestoneManager";
import { calculateMilestoneProgress } from "../utils/progressCalculator";
import { projectService } from "../services";

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
}

const ProjectItem = ({
  project,
  selectedId,
  onSelect,
  onStatusChange,
  onDeleteProject,
  tasks,
}: ProjectItemProps) => {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { milestones, loading: milestonesLoading } = useMilestoneManager(project.id);
  const [progress, setProgress] = useState(project.progress);
  const prevProgressRef = useRef(progress);
  const statusUpdateTimeoutRef = useRef<NodeJS.Timeout>();

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

  return (
    <>
      <motion.div
        onClick={handleCardClick}
        className={`w-full p-4 text-left rounded-lg transition-all duration-300 hover:scale-[1.01] cursor-pointer ${
          selectedId === project.id
            ? "bg-primary-50 border-primary-200"
            : "bg-white border-gray-200 hover:bg-gray-50"
        } border card-shadow relative`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-medium text-gray-900">{project.name}</h3>
            {project.client ? (
              <p className="text-sm text-gray-500 mt-1">{project.client}</p>
            ) : (
              <br />
            )}
            
          
          </div>

          <div className="relative status-menu">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowStatusMenu(!showStatusMenu);
              }}
              className={`flex items-center space-x-2 px-2 py-1 rounded-md ${getStatusColor(
                project.status
              )}`}
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
  const location = useLocation();
  const navigate = useNavigate();
  const isProjectTab = location.pathname === "/";

  useEffect(() => {
    const filtered = projects
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
  }, [searchQuery, projects]);

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
      await projectService.delete(projectId);
      onProjectsChange();
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  return (
    <>
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
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
          <button
            onClick={() => setShowAddProject(true)}
            className="ml-4 px-3 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-all duration-300 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
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
        <AnimatePresence mode="wait">
          {filteredProjects.length > 0 ? (
            <div className="space-y-2">
              {filteredProjects.map((project) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  selectedId={selectedId}
                  onSelect={handleProjectSelect}
                  onStatusChange={handleStatusChange}
                  onDeleteProject={handleDeleteProject}
                  tasks={tasks}
                />
              ))}
            </div>
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