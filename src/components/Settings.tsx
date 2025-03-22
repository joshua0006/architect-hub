import React, { useState, useEffect, useMemo } from "react";
import {
  Database,
  Save,
  Archive,
  Clock,
  CheckCircle2,
  ArrowUpCircle,
  Plus,
  X,
  Palette,
  Pencil,
  Trash2,
  AlertCircle,
} from "lucide-react";
import {
  sampleProjects,
  sampleDocuments,
  sampleFolders,
  sampleTasks,
  sampleTeamMembers,
} from "../data/sampleData";
import { useOrganization } from "../contexts/OrganizationContext";
import { Project, TaskCategory } from "../types";
import { motion, AnimatePresence } from "framer-motion";
import { projectService } from "../services/projectService";

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  // Pacific/Oceania
  { value: "Pacific/Fiji", label: "Fiji Time" },
  { value: "Pacific/Auckland", label: "New Zealand Time" },
  { value: "Pacific/Port_Moresby", label: "Papua New Guinea Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  // Australia
  { value: "Australia/Sydney", label: "Australian Eastern Time" },
  { value: "Australia/Darwin", label: "Australian Central Time" },
  { value: "Australia/Perth", label: "Australian Western Time" },
  // Asia
  { value: "Asia/Tokyo", label: "Japan Time" },
  { value: "Asia/Singapore", label: "Singapore Time" },
  // Americas
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  // Europe
  { value: "Europe/London", label: "British Time" },
  { value: "Europe/Paris", label: "Central European Time" },
];

interface SettingsProps {
  projects: Project[];
  onUpdateProject?: (id: string, updates: Partial<Project>) => void;
}

interface DeleteConfirmationProps {
  projectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmationPopup = ({
  projectName,
  onConfirm,
  onCancel,
}: DeleteConfirmationProps) => (
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
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Delete Project
      </h3>
      <p className="text-gray-600 mb-6">
        Are you sure you want to delete "{projectName}"? This action cannot be
        undone.
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

const TaskCategorySection = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TaskCategory | null>(
    null
  );
  const [formData, setFormData] = useState({
    name: "",
    color: "#3b82f6",
  });
  const { settings, updateSettings, isLoading } = useOrganization();

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  const taskCategories = settings?.taskCategories || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const categories = [...taskCategories];

      if (editingCategory) {
        const index = categories.findIndex((c) => c.id === editingCategory.id);
        if (index !== -1) {
          categories[index] = {
            ...editingCategory,
            name: formData.name,
            color: formData.color,
          };
        }
      } else {
        categories.push({
          id: crypto.randomUUID(),
          name: formData.name,
          color: formData.color,
        });
      }

      await updateSettings({ taskCategories: categories });
      setShowForm(false);
      setEditingCategory(null);
      setFormData({ name: "", color: "#3b82f6" });
    } catch (error) {
      console.error("Error updating task categories:", error);
    }
  };

  const handleDelete = async (categoryId: string) => {
    try {
      const category = taskCategories.find((c) => c.id === categoryId);
      if (category?.isDefault) {
        alert("Cannot delete default categories");
        return;
      }

      const categories = taskCategories.filter((c) => c.id !== categoryId);
      await updateSettings({ taskCategories: categories });
    } catch (error) {
      console.error("Error deleting task category:", error);
    }
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <Palette className="w-5 h-5 text-gray-500" />
          <h2 className="text-lg font-medium text-gray-900">Task Categories</h2>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Category</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {taskCategories.map((category) => (
          <div
            key={category.id}
            className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="font-medium">{category.name}</span>
              </div>
              <div className="flex items-center space-x-2">
                {!category.isDefault && (
                  <>
                    <button
                      onClick={() => {
                        setEditingCategory(category);
                        setFormData({
                          name: category.name,
                          color: category.color,
                        });
                        setShowForm(true);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(category.id)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {taskCategories.length === 0 && !isLoading && (
        <div className="text-center py-6">
          <p className="text-gray-500">No task categories found</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {editingCategory ? "Edit Category" : "Add Category"}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingCategory(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData({ ...formData, color: e.target.value })
                  }
                  className="w-full h-10 p-1 border border-gray-200 rounded-md cursor-pointer"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingCategory(null);
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
                >
                  {editingCategory ? "Save Changes" : "Add Category"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const Settings = ({ projects, onUpdateProject }: SettingsProps) => {
  const [showSampleData, setShowSampleData] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "projects" | "documents" | "folders" | "tasks" | "team"
  >("projects");
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [showUnarchiveMenu, setShowUnarchiveMenu] = useState<string | null>(
    null
  );
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectsUpdateTrigger, setProjectsUpdateTrigger] = useState(0);

  const { settings, updateSettings } = useOrganization();

  // Local state for form values
  const [formValues, setFormValues] = useState({
    name: settings.name,
    timezone: settings.timezone,
  });

  // Update local state when settings change
  useEffect(() => {
    setFormValues({
      name: settings.name,
      timezone: settings.timezone,
    });
  }, [settings]);

  const sampleData = {
    projects: sampleProjects,
    documents: sampleDocuments,
    folders: sampleFolders,
    tasks: sampleTasks,
    team: sampleTeamMembers,
  };

  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      setUpdateStatus("idle");
      await updateSettings(formValues);
      setUpdateStatus("success");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    } catch (error) {
      console.error("Error updating settings:", error);
      setUpdateStatus("error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUnarchive = (projectId: string) => {
    if (onUpdateProject) {
      const project = projects.find(p => p.id === projectId);
      if (project && project.metadata) {
        // Create a new metadata object with all required fields
        const metadata = { ...project.metadata };
        // Remove archivedAt property
        delete metadata.archivedAt;
        
        onUpdateProject(projectId, {
          status: "active",
          metadata
        });
      }
    }
    setShowUnarchiveMenu(null);
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;

    try {
      // Since projectService.deleteProject is causing an error, use the delete method instead
      await projectService.delete(projectToDelete.id);
      
      // Store the deleted project ID before clearing state
      const deletedProjectId = projectToDelete.id;
      setProjectToDelete(null);
      
      // Force a re-render by updating the counter
      setProjectsUpdateTrigger(prev => prev + 1);
      
      // Refresh the UI by removing the project locally
      if (onUpdateProject) {
        // Remove the project from the local state
        onUpdateProject(deletedProjectId, {
          status: "archived" // Use archived status as a signal to remove it
        });
      }

      // Show success message
      setError(null);
      setUpdateStatus("success");
      setTimeout(() => setUpdateStatus("idle"), 3000);
    } catch (error) {
      console.error("Error deleting project:", error);
      setError("Failed to delete project. Please try again.");
      setUpdateStatus("error");
    }
  };

  // Recalculate archived projects with dependency on the update trigger
  const archivedProjects = useMemo(
    () => projects.filter((p) => p.status === "archived"),
    [projects, projectsUpdateTrigger]
  );
  
  const doneProjects = projects.filter((p) => p.status === "done");

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

  return (
    <div className="p-6">
      <div className="flex items-center space-x-2 mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">
              General Settings
            </h2>
            <button
              onClick={handleUpdate}
              disabled={isUpdating}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                isUpdating
                  ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{isUpdating ? "Updating..." : "Update Settings"}</span>
            </button>
          </div>

          {updateStatus === "success" && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md">
              Settings updated successfully!
            </div>
          )}

          {updateStatus === "error" && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">
              {error || "Failed to update settings. Please try again."}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                value={formValues.name}
                onChange={(e) =>
                  setFormValues({ ...formValues, name: e.target.value })
                }
                className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Zone
              </label>
              <select
                value={formValues.timezone}
                onChange={(e) =>
                  setFormValues({ ...formValues, timezone: e.target.value })
                }
                className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Task Category Section */}
        <div className="mt-6">
          <TaskCategorySection />
        </div>

        {/* Completed and Archived Projects */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            Project Archive
          </h2>

          {/* Archived Projects */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Archive className="w-5 h-5 text-gray-500" />
              <h3 className="text-md font-medium text-gray-900">
                Archived Projects
              </h3>
              <span className="text-sm text-gray-500">
                ({archivedProjects.length})
              </span>
            </div>

            <div className="space-y-3">
              {archivedProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {project.name}
                    </h4>
                    <p className="text-sm text-gray-500">{project.client}</p>
                    {project.metadata?.archivedAt && (
                      <p className="text-xs text-gray-400">
                        Archived on{" "}
                        {new Date(
                          project.metadata.archivedAt
                        ).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleUnarchive(project.id)}
                      className="flex items-center space-x-2 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    >
                      <ArrowUpCircle className="w-4 h-4" />
                      <span>Restore</span>
                    </button>
                    <button
                      onClick={() => setProjectToDelete(project)}
                      className="flex items-center space-x-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
              
              {archivedProjects.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No archived projects
                </p>
              )}
            </div>
          </div>

          {/* Add the delete confirmation popup */}
          <AnimatePresence>
            {projectToDelete && (
              <DeleteConfirmationPopup
                projectName={projectToDelete.name}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setProjectToDelete(null)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Settings;
