import { Plus, AlertCircle, Users, PlusCircle, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Task, TeamMember, TaskCategory, User } from "../types";
import { useOrganization } from "../contexts/OrganizationContext";
import { useAuth } from "../contexts/AuthContext";
import { motion } from "framer-motion";
import { userService } from "../services/userService";
import { projectService } from "../services/projectService";
import { createTaskNotification } from "../services/notificationService";

interface TaskActionsProps {
  projectId: string;
  teamMembers: TeamMember[];
  categories: TaskCategory[];
  parentTaskId?: string; // Optional parent task ID if creating a subtask
  parentTaskCategory?: string; // Parent task's category for subtasks
  isSubtask?: boolean; // Flag to indicate if creating a subtask
  onCreateTask: (
    projectId: string,
    title: string,
    description: string,
    assignedTo: string[],
    dueDate: string,
    priority: Task["priority"],
    category: string,
    parentTaskId?: string // Added parameter for subtask creation
  ) => void;
}

export default function TaskActions({
  projectId,
  teamMembers,
  categories,
  parentTaskId,
  parentTaskCategory,
  isSubtask = false,
  onCreateTask,
}: TaskActionsProps) {
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings, isLoading, updateSettings } = useOrganization();
  const { canAssignTasks, user } = useAuth();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", color: "#3b82f6" });
  const [savingCategory, setSavingCategory] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assignedTo: user?.id ? [user.id] : [] as string[],
    dueDate: "",
    priority: "medium" as Task["priority"],
    category: isSubtask && parentTaskCategory ? parentTaskCategory : "",
    parentTaskId: parentTaskId || "", // Initialize with parent task ID if provided
  });

  useEffect(() => {
    if (showForm) {
      loadUsers();
    }
  }, [showForm]);

  useEffect(() => {
    if (showForm && user?.id) {
      setFormData((prev) => ({
        ...prev,
        assignedTo: prev.assignedTo.length > 0 ? prev.assignedTo : [user.id],
        // Set category to parent task's category if this is a subtask
        category: isSubtask && parentTaskCategory ? parentTaskCategory : prev.category
      }));
    }
  }, [showForm, user, isSubtask, parentTaskCategory]);

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const users = await userService.getAllUsers();
      setAllUsers(users);
    } catch (err) {
      console.error("Error loading users:", err);
      setError("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.category) {
      setError("Please select a task category");
      return;
    }

    if (formData.assignedTo.length === 0) {
      setError("Please select at least one assignee");
      return;
    }

    const categoryExists = settings?.taskCategories?.some(
      (cat) => cat.id === formData.category
    );
    if (!categoryExists) {
      setError("Selected category is no longer available");
      return;
    }

    try {
      // Check if assigned users have project access
      const assignedUsers = allUsers.filter(u => formData.assignedTo.includes(u.id));
      const usersToAddToProject: string[] = [];
      
      assignedUsers.forEach(user => {
        const hasProjectAccess = user.projectIds?.includes(projectId);
        if (!hasProjectAccess) {
          usersToAddToProject.push(user.id);
        }
      });
      
      // If any users don't have project access, add them to the project
      if (usersToAddToProject.length > 0) {
        await projectService.addUsersToProject(projectId, usersToAddToProject);
        console.log(`Added ${usersToAddToProject.length} users to project ${projectId}`);
      }

      // Create task
      if (
        formData.title.trim() &&
        formData.description.trim() &&
        formData.assignedTo.length > 0 &&
        formData.dueDate
      ) {
        // Get project name for notification
        const project = await projectService.getById(projectId);
        const projectName = project?.name || "project";
        
        // For subtasks, always use the parent's category
        const categoryToUse = isSubtask && parentTaskCategory 
          ? parentTaskCategory 
          : formData.category;
        
        // Create the task
        const taskId = await onCreateTask(
          projectId,
          formData.title.trim(),
          formData.description.trim(),
          formData.assignedTo,
          formData.dueDate,
          formData.priority,
          categoryToUse,
          isSubtask ? formData.parentTaskId : undefined // Pass parentTaskId only if creating a subtask
        );
        
        // Create notifications for all assignees (except the creator if they assigned themself)
        const creatorName = user?.displayName || "Someone";
        const assigneesToNotify = formData.assignedTo.filter(id => id !== user?.id);
        
        if (assigneesToNotify.length > 0 && taskId) {
          await createTaskNotification(
            taskId,
            formData.title.trim(),
            projectId,
            projectName,
            creatorName,
            assigneesToNotify,
            formData.dueDate,
            false // Not an update
          );
        }
        
        setShowForm(false);
        setFormData({
          title: "",
          description: "",
          assignedTo: user?.id ? [user.id] : [],
          dueDate: "",
          priority: "medium",
          category: isSubtask && parentTaskCategory ? parentTaskCategory : "",
          parentTaskId: parentTaskId || "",
        });
      }
    } catch (err) {
      console.error("Error creating task:", err);
      setError("Failed to create task");
    }
  };

  const getUserDisplayName = (userId: string) => {
    const foundUser = allUsers.find((u) => u.id === userId);
    return foundUser?.displayName || "Unknown User";
  };

  const handleAssigneeChange = (userId: string) => {
    setFormData(prev => {
      const newAssignedTo = [...prev.assignedTo];
      if (newAssignedTo.includes(userId)) {
        // Remove user if already selected
        return {
          ...prev,
          assignedTo: newAssignedTo.filter(id => id !== userId)
        };
      } else {
        // Add user if not already selected
        return {
          ...prev,
          assignedTo: [...newAssignedTo, userId]
        };
      }
    });
  };

  const removeAssignee = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      assignedTo: prev.assignedTo.filter(id => id !== userId)
    }));
  };

  // Function to handle creating a new category
  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      setError("Category name is required");
      return;
    }

    try {
      setSavingCategory(true);
      
      // Generate a unique ID for the new category
      const categoryId = `cat_${Date.now()}`;
      
      // Create the new category object
      const categoryToAdd: TaskCategory = {
        id: categoryId,
        name: newCategory.name.trim(),
        color: newCategory.color,
      };
      
      // Get current categories or initialize empty array
      const currentCategories = settings?.taskCategories || [];
      
      // Add the new category to the organization settings
      await updateSettings({
        ...settings,
        taskCategories: [...currentCategories, categoryToAdd],
      });
      
      // Set the form to use the newly created category
      setFormData({
        ...formData,
        category: categoryId,
      });
      
      // Reset the new category form
      setNewCategory({ name: "", color: "#3b82f6" });
      setShowNewCategoryForm(false);
      setError(null);
    } catch (err) {
      console.error("Error creating category:", err);
      setError("Failed to create category");
    } finally {
      setSavingCategory(false);
    }
  };

  // Check if user is staff or admin
  const isStaffOrAdmin = user?.role === 'Staff' || user?.role === 'Admin';

  if (isLoading) {
    return (
      <button
        disabled
        className="flex items-center space-x-2 px-4 py-2 bg-gray-200 text-gray-500 rounded-md cursor-not-allowed"
      >
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500" />
        <span>Loading...</span>
      </button>
    );
  }

  if (!canAssignTasks()) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowForm(true)}
        className={`flex items-center space-x-2 px-4 py-2 ${
          isSubtask 
            ? "bg-purple-500 hover:bg-purple-600" 
            : "bg-blue-500 hover:bg-blue-600"
        } text-white rounded-md transition-colors`}
        data-testid="create-task-button"
      >
        <Plus className="w-4 h-4" />
        <span>{isSubtask ? "Add Subtask" : "New Task"}</span>
      </button>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-lg font-semibold mb-4">
              {isSubtask ? "Create New Subtask" : "Create New Task"}
            </h3>
            
            {isSubtask && (
              <div className="mb-4 p-2 bg-purple-50 border border-purple-100 rounded-md">
                <p className="text-sm text-purple-700">
                  Creating subtask for: {parentTaskId}
                </p>
                {parentTaskCategory && (
                  <p className="text-xs text-purple-600 mt-1">
                    Subtask will use the parent task's category
                  </p>
                )}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign To (Select Multiple)
                </label>
                <div className="relative">
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAssigneeChange(e.target.value);
                        e.target.value = ""; // Reset select after selection
                      }
                    }}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      formData.assignedTo.length === 0 ? "border-red-300" : "border-gray-200"
                    }`}
                  >
                    <option value="">Select Assignees</option>
                    {loadingUsers ? (
                      <option value="" disabled>Loading users...</option>
                    ) : (
                      allUsers.map((user) => (
                        <option 
                          key={user.id} 
                          value={user.id}
                          disabled={formData.assignedTo.includes(user.id)}
                        >
                          {user.displayName}
                          {!user.projectIds?.includes(projectId) &&
                            " (Will be added to project)"}
                          {formData.assignedTo.includes(user.id) && " (Selected)"}
                        </option>
                      ))
                    )}
                  </select>
                  <Users className="absolute right-3 top-2.5 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
                
                {/* Display selected assignees */}
                {formData.assignedTo.length > 0 && (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Selected Assignees:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {formData.assignedTo.map(userId => (
                        <div 
                          key={userId} 
                          className="flex items-center bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-xs"
                        >
                          <span>{getUserDisplayName(userId)}</span>
                          <button 
                            type="button"
                            onClick={() => removeAssignee(userId)}
                            className="ml-1 text-blue-700 hover:text-blue-900"
                          >
                            <X className="w-3 h-3" />
                          </button>
                          {!allUsers.find(u => u.id === userId)?.projectIds?.includes(projectId) && (
                            <span className="ml-1 text-blue-500">
                              (Will be added to project)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {formData.assignedTo.length === 0 && (
                  <p className="mt-1 text-sm text-red-500">
                    Select at least one assignee
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) =>
                    setFormData({ ...formData, dueDate: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: e.target.value as Task["priority"],
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Category field - hidden for subtasks */}
              {!isSubtask && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  {!showNewCategoryForm ? (
                    <div className="relative">
                      <select
                        value={formData.category}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "create_new" && isStaffOrAdmin) {
                            setShowNewCategoryForm(true);
                            setFormData({ ...formData, category: "" });
                          } else {
                            setFormData({ ...formData, category: value });
                          }
                        }}
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          !formData.category ? "border-red-300" : "border-gray-200"
                        }`}
                        required
                      >
                        <option value="">Select Category</option>
                        {settings?.taskCategories?.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                        {isStaffOrAdmin && (
                          <option value="create_new">+ Create New Category</option>
                        )}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-3 p-3 border border-gray-200 rounded-md bg-gray-50">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Category Name
                        </label>
                        <input
                          type="text"
                          value={newCategory.name}
                          onChange={(e) =>
                            setNewCategory({ ...newCategory, name: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter category name"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Color
                        </label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={newCategory.color}
                            onChange={(e) =>
                              setNewCategory({ ...newCategory, color: e.target.value })
                            }
                            className="w-8 h-8 rounded-md border border-gray-200"
                          />
                          <span className="text-xs text-gray-500">{newCategory.color}</span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewCategoryForm(false);
                            setNewCategory({ name: "", color: "#3b82f6" });
                          }}
                          className="px-3 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateCategory}
                          disabled={savingCategory || !newCategory.name.trim()}
                          className="px-3 py-1 text-xs text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed flex items-center space-x-1"
                        >
                          {savingCategory ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <PlusCircle className="w-3 h-3" />
                              <span>Create Category</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                  {!formData.category && !showNewCategoryForm && !isSubtask && (
                    <p className="mt-1 text-sm text-red-500">
                      Category is required
                    </p>
                  )}
                </div>
              )}

              {/* Display selected category for subtasks */}
              {isSubtask && parentTaskCategory && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <div className="flex items-center w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-gray-500">
                    {settings?.taskCategories?.find(cat => cat.id === parentTaskCategory)?.name || "Parent category"}
                    <div 
                      className="w-3 h-3 ml-2 rounded-full" 
                      style={{ 
                        backgroundColor: settings?.taskCategories?.find(
                          cat => cat.id === parentTaskCategory
                        )?.color || "#718096" 
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Subtasks automatically use the parent task's category
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-center space-x-2 text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError("");
                    setShowNewCategoryForm(false);
                    setNewCategory({ name: "", color: "#3b82f6" });
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={showNewCategoryForm}
                  className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:bg-blue-300 disabled:cursor-not-allowed"
                >
                  {isSubtask ? "Create Subtask" : "Create Task"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}