import { useState, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Pencil,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { Task, TeamMember, User } from "../types";
import TaskActions from "./TaskActions";
import { useOrganization } from "../contexts/OrganizationContext";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { userService } from "../services/userService";
import { projectService } from "../services/projectService";

interface TaskListProps {
  tasks: Task[];
  teamMembers: TeamMember[];
  projectId: string;
  onCreateTask: (
    projectId: string,
    title: string,
    description: string,
    assignedTo: string,
    dueDate: string,
    priority: Task["priority"],
    category: Task["category"]
  ) => void;
  onStatusChange: (taskId: string, status: Task["status"]) => void;
  onUpdateTask: (
    id: string,
    updates: Partial<Omit<Task, "id" | "projectId">>
  ) => void;
  onDeleteTask: (id: string) => void;
}

export default function TaskList({
  tasks = [],
  teamMembers = [],
  projectId,
  onCreateTask,
  onStatusChange,
  onUpdateTask,
  onDeleteTask,
}: TaskListProps) {
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showStatusMenu, setShowStatusMenu] = useState<string | null>(null);
  const { settings, isLoading } = useOrganization();
  const { user, canAssignTasks, canUpdateTaskStatus, canEditTask, canDeleteTask } = useAuth();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const users = await userService.getAllUsers();
      setAllUsers(users);
    } catch (err) {
      console.error("Error loading users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const getPriorityColor = (priority: Task["priority"]) => {
    switch (priority) {
      case "high":
        return "text-red-500";
      case "medium":
        return "text-yellow-500";
      default:
        return "text-blue-500";
    }
  };

  const getStatusColor = (status: Task["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in-progress":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getStatusIcon = (status: Task["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "in-progress":
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Circle className="w-4 h-4 text-gray-300" />;
    }
  };

  const statusOptions: {
    value: Task["status"];
    label: string;
    color: string;
    icon: JSX.Element;
  }[] = [
    {
      value: "todo",
      label: "To Do",
      color: "bg-gray-100 text-gray-600",
      icon: <Circle className="w-4 h-4" />,
    },
    {
      value: "in-progress",
      label: "In Progress",
      color: "bg-yellow-100 text-yellow-800",
      icon: <AlertCircle className="w-4 h-4" />,
    },
    {
      value: "completed",
      label: "Completed",
      color: "bg-green-100 text-green-800",
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
  ];

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTask) {
      try {
        // Check if assigned user has project access
        const assignedUser = allUsers.find(
          (u) => u.id === editingTask.assignedTo
        );
        const hasProjectAccess = assignedUser?.projectIds?.includes(projectId);

        // If user doesn't have project access, add them to the project
        if (!hasProjectAccess) {
          await projectService.addUsersToProject(projectId, [
            editingTask.assignedTo,
          ]);
          console.log(
            `Added user ${editingTask.assignedTo} to project ${projectId}`
          );
        }

        // Update task
        await onUpdateTask(editingTask.id, {
          title: editingTask.title,
          description: editingTask.description,
          assignedTo: editingTask.assignedTo,
          dueDate: editingTask.dueDate,
          priority: editingTask.priority,
        });
        setEditingTask(null);
      } catch (err) {
        console.error("Error updating task:", err);
        // Optionally add error handling UI here
      }
    }
  };

  const filteredTasks = tasks.filter(
    (task) => selectedCategory === "all" || task.category === selectedCategory
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex space-x-2">
          <button
            key="all"
            onClick={() => setSelectedCategory("all")}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              selectedCategory === "all"
                ? "bg-blue-500 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            All
          </button>
          {settings?.taskCategories?.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-4 py-2 text-sm rounded-md transition-colors flex items-center space-x-2 ${
                selectedCategory === category.id
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: category.color }}
              />
              <span>{category.name}</span>
            </button>
          ))}
        </div>
        {canAssignTasks() && (
          <TaskActions
            projectId={projectId}
            teamMembers={teamMembers}
            categories={settings?.taskCategories || []}
            onCreateTask={onCreateTask}
          />
        )}
      </div>

      <div className="space-y-4">
        {filteredTasks.map((task) => (
          <div
            key={task.id}
            className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
          >
            {editingTask?.id === task.id ? (
              <form onSubmit={handleUpdateTask} className="space-y-4">
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) =>
                    setEditingTask({ ...editingTask, title: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <textarea
                  value={editingTask.description}
                  onChange={(e) =>
                    setEditingTask({
                      ...editingTask,
                      description: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <select
                      value={editingTask.assignedTo}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          assignedTo: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="">Select Assignee</option>
                      {allUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.displayName || "Unknown User"}
                          {!user.projectIds?.includes(projectId) &&
                            " (Will be added to project)"}
                        </option>
                      ))}
                    </select>
                    {editingTask.assignedTo &&
                      !allUsers
                        .find((u) => u.id === editingTask.assignedTo)
                        ?.projectIds?.includes(projectId) && (
                        <p className="mt-1 text-sm text-blue-500">
                          User will be added to project upon assignment
                        </p>
                      )}
                  </div>
                  <div>
                    <input
                      type="date"
                      value={editingTask.dueDate}
                      onChange={(e) =>
                        setEditingTask({
                          ...editingTask,
                          dueDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <select
                    value={editingTask.priority}
                    onChange={(e) =>
                      setEditingTask({
                        ...editingTask,
                        priority: e.target.value as Task["priority"],
                      })
                    }
                    className="px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                  <div className="space-x-2">
                    <button
                      type="button"
                      onClick={() => setEditingTask(null)}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      {canUpdateTaskStatus(task.id) && (
                        <div className="relative">
                          <button
                            onClick={() =>
                              setShowStatusMenu(
                                showStatusMenu === task.id ? null : task.id
                              )
                            }
                            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm ${getStatusColor(
                              task.status
                            )}`}
                          >
                            {getStatusIcon(task.status)}
                            <span className="capitalize">{task.status}</span>
                            <ChevronDown className="w-4 h-4" />
                          </button>

                          <AnimatePresence>
                            {showStatusMenu === task.id && (
                              <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute left-0 mt-2 w-40 bg-white rounded-md shadow-lg z-10 border border-gray-200"
                              >
                                {statusOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    onClick={() => {
                                      onStatusChange(task.id, option.value);
                                      setShowStatusMenu(null);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm ${
                                      option.color
                                    } hover:opacity-80 transition-opacity flex items-center space-x-2 ${
                                      task.status === option.value
                                        ? "font-medium"
                                        : ""
                                    }`}
                                  >
                                    {option.icon}
                                    <span>{option.label}</span>
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}
                      <h3 className="font-medium text-gray-900">
                        {task.title}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${getPriorityColor(
                          task.priority
                        )} bg-opacity-10`}
                      >
                        {task.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      {task.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center space-x-4">
                        <span>
                          Assigned to:{" "}
                          {allUsers.find((u) => u.id === task.assignedTo)
                            ?.displayName || "Unknown"}
                        </span>
                        <span>Due: {task.dueDate}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {canEditTask() && (
                          <button
                            onClick={() => setEditingTask(task)}
                            className="p-1 hover:text-blue-500 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteTask() && (
                          <button
                            onClick={() => onDeleteTask(task.id)}
                            className="p-1 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}