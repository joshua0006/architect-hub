import { Plus, AlertCircle, Users } from "lucide-react";
import { useState, useEffect } from "react";
import { Task, TeamMember, TaskCategory, User } from "../types";
import { useOrganization } from "../contexts/OrganizationContext";
import { useAuth } from "../contexts/AuthContext";
import { motion } from "framer-motion";
import { userService } from "../services/userService";
import { projectService } from "../services/projectService";

interface TaskActionsProps {
  projectId: string;
  teamMembers: TeamMember[];
  categories: TaskCategory[];
  onCreateTask: (
    projectId: string,
    title: string,
    description: string,
    assignedTo: string,
    dueDate: string,
    priority: Task["priority"],
    category: string
  ) => void;
}

export default function TaskActions({
  projectId,
  teamMembers,
  categories,
  onCreateTask,
}: TaskActionsProps) {
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings, isLoading } = useOrganization();
  const { canAssignTasks, user } = useAuth();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assignedTo: user?.id || "",
    dueDate: "",
    priority: "medium" as Task["priority"],
    category: "",
  });

  useEffect(() => {
    if (showForm) {
      loadUsers();
    }
  }, [showForm]);

  useEffect(() => {
    if (showForm) {
      setFormData((prev) => ({
        ...prev,
        assignedTo: user?.id || "",
      }));
    }
  }, [showForm, user]);

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

    if (!formData.assignedTo) {
      setError("Please select an assignee");
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
      // Check if assigned user has project access
      const assignedUser = allUsers.find(u => u.id === formData.assignedTo);
      const hasProjectAccess = assignedUser?.projectIds?.includes(projectId);

      // If user doesn't have project access, add them to the project
      if (!hasProjectAccess) {
        await projectService.addUsersToProject(projectId, [formData.assignedTo]);
        console.log(`Added user ${formData.assignedTo} to project ${projectId}`);
      }

      // Create task
      if (
        formData.title.trim() &&
        formData.description.trim() &&
        formData.assignedTo &&
        formData.dueDate
      ) {
        await onCreateTask(
          projectId,
          formData.title.trim(),
          formData.description.trim(),
          formData.assignedTo,
          formData.dueDate,
          formData.priority,
          formData.category
        );
        setShowForm(false);
        setFormData({
          title: "",
          description: "",
          assignedTo: user?.id || "",
          dueDate: "",
          priority: "medium",
          category: "",
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
        className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span>New Task</span>
      </button>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg p-6 w-full max-w-md"
          >
            <h3 className="text-lg font-semibold mb-4">Create New Task</h3>
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
                  Assign To
                </label>
                <div className="relative">
                  <select
                    value={formData.assignedTo}
                    onChange={(e) =>
                      setFormData({ ...formData, assignedTo: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                    required
                  >
                    {loadingUsers ? (
                      <option value="">Loading users...</option>
                    ) : (
                      <>
                        <option value="">Select Assignee</option>
                        {allUsers.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.displayName}
                            {!user.projectIds?.includes(projectId) &&
                              " (Will be added to project)"}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  <Users className="absolute right-3 top-2.5 w-5 h-5 text-gray-400 pointer-events-none" />
                </div>
                {formData.assignedTo && (
                  <p className="mt-1 text-sm text-gray-500">
                    Currently assigned to: {getUserDisplayName(formData.assignedTo)}
                    {!allUsers.find(u => u.id === formData.assignedTo)?.projectIds?.includes(projectId) && (
                      <span className="text-blue-500 ml-1">
                        (Will be added to project)
                      </span>
                    )}
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
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
                </select>
                {!formData.category && (
                  <p className="mt-1 text-sm text-red-500">
                    Category is required
                  </p>
                )}
              </div>

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
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
                >
                  Create Task
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}