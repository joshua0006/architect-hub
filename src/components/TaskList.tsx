import { useState, useEffect, useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Pencil,
  Trash2,
  ChevronDown,
  Plus,
  ChevronRight,
  ChevronUp,
  Filter,
  SlidersHorizontal,
  Link,
} from "lucide-react";
import { Task, TeamMember, User } from "../types";
import TaskActions from "./TaskActions";
import { useOrganization } from "../contexts/OrganizationContext";
import { useAuth } from "../contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { userService } from "../services/userService";
import { projectService } from "../services/projectService";
import { taskService } from "../services/taskService";
import { subtaskService, Subtask } from "../services/subtaskService";
import { createSubtaskNotification, createTaskNotification } from "../services/notificationService";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

interface TaskListProps {
  tasks: Task[];
  teamMembers: TeamMember[];
  projectId: string;
  onCreateTask: (
    projectId: string,
    title: string,
    description: string,
    assignedTo: string[],
    dueDate: string,
    priority: Task["priority"],
    category: Task["category"],
    parentTaskId?: string
  ) => void;
  onStatusChange: (taskId: string, status: Task["status"]) => void;
  onUpdateTask: (
    id: string,
    updates: Partial<Omit<Task, "id" | "projectId">>
  ) => void;
  onDeleteTask: (id: string) => void;
}

export default function TaskList({
  tasks: initialTasks = [],
  teamMembers = [],
  projectId,
  onCreateTask,
  onStatusChange,
  onUpdateTask,
  onDeleteTask,
}: TaskListProps) {
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [showStatusMenu, setShowStatusMenu] = useState<string | null>(null);
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const { settings, isLoading } = useOrganization();
  const { user, canAssignTasks, canUpdateTaskStatus, canEditTask, canDeleteTask } = useAuth();
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Add state for tasks from Firebase
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  
  // Add state for expanded task view
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState<{[taskId: string]: string}>({});
  // Store subtasks keyed by parent id for quick lookup
  const [subtasksMap, setSubtasksMap] = useState<{[parentId: string]: Subtask[]}>({});
  
  // References to store unsubscribe functions
  const taskUnsubscribeRef = useRef<(() => void) | null>(null);
  const subtaskUnsubscribeRef = useRef<(() => void) | null>(null);
  
  const [showCustomUserDropdown, setShowCustomUserDropdown] = useState(false);
  
  // Add new state for loading states
  const [addingSubTask, setAddingSubTask] = useState<{[taskId: string]: boolean}>({});
  const [creatingTask, setCreatingTask] = useState(false);
  
  // Add new state for highlighted task
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Add reference for highlighted task element
  const highlightedTaskRef = useRef<HTMLDivElement>(null);
  
  // Get query params
  function getSearchParams() {
    return new URLSearchParams(location.search);
  }
  
  // Check for task_id in URL on component mount
  useEffect(() => {
    const params = getSearchParams();
    const taskId = params.get('task_id');
    if (taskId) {
      setHighlightedTaskId(taskId);
      setExpandedTask(taskId);
      
      // Set a timeout to scroll to the highlighted task
      setTimeout(() => {
        highlightedTaskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
      
      // Clear the highlight after 3 seconds
      setTimeout(() => {
        setHighlightedTaskId(null);
      }, 3000);
    }
  }, [location.search]);
  
  useEffect(() => {
    loadUsers();
    
    // Set up task subscription
    taskUnsubscribeRef.current = taskService.subscribeToProjectTasks(projectId, (updatedTasks) => {
      console.log("Tasks updated:", updatedTasks);
      setTasks(updatedTasks);
    });
    
    // Cleanup subscriptions when component unmounts
    return () => {
      if (taskUnsubscribeRef.current) {
        taskUnsubscribeRef.current();
        taskUnsubscribeRef.current = null;
      }
      
      if (subtaskUnsubscribeRef.current) {
        subtaskUnsubscribeRef.current();
        subtaskUnsubscribeRef.current = null;
      }
    };
  }, [projectId]);
  
  // Preload subtasks count data for all tasks
  useEffect(() => {
    // Get all parent task IDs
    const parentTaskIds = tasks
      .filter(task => !task.parentTaskId)
      .map(task => task.id);
      
    // Load subtasks for each parent task
    const loadSubtaskCounts = async () => {
      for (const taskId of parentTaskIds) {
        if (!subtasksMap[taskId]) {
          try {
            const subtasks = await subtaskService.getByParentTaskId(taskId);
            if (subtasks.length > 0) {
              setSubtasksMap(prev => ({
                ...prev,
                [taskId]: subtasks
              }));
            }
          } catch (err) {
            console.error(`Error loading subtasks for task ${taskId}:`, err);
          }
        }
      }
    };
    
    loadSubtaskCounts();
  }, [tasks]);
  
  // Load subtasks when a task is expanded
  useEffect(() => {
    // Clean up any existing subtask subscription
    if (subtaskUnsubscribeRef.current) {
      subtaskUnsubscribeRef.current();
      subtaskUnsubscribeRef.current = null;
    }
    
    if (expandedTask) {
      // Set up new subscription for the expanded task
      subtaskUnsubscribeRef.current = subtaskService.subscribeToSubtasks(expandedTask, (subtasks) => {
        setSubtasksMap(prev => ({
          ...prev,
          [expandedTask]: subtasks
        }));
      });
    }
    
    return () => {
      if (expandedTask && subtaskUnsubscribeRef.current) {
        subtaskUnsubscribeRef.current();
        subtaskUnsubscribeRef.current = null;
      }
    };
  }, [expandedTask]);

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

  // Add function to handle sub-task completion toggle
  const toggleSubTaskCompletion = async (subtask: Subtask) => {
    try {
      await subtaskService.update(subtask.id, {
        status: subtask.status === 'completed' ? 'todo' : 'completed'
      });
    } catch (err) {
      console.error("Error updating subtask status:", err);
    }
  };

  // Update task status directly with Firebase
  const handleStatusChange = async (taskId: string, status: Task["status"]) => {
    try {
      await taskService.update(taskId, { status });
      // No need to call onStatusChange since Firebase will trigger the update via subscription
    } catch (err) {
      console.error("Error updating task status:", err);
    }
  };

  // Handle task updates directly with Firebase
  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTask) {
      try {
        // Find the original task to compare assigned users
        const originalTask = tasks.find(t => t.id === editingTask.id);
        // Find newly assigned users (users in editingTask.assignedTo but not in originalTask.assignedTo)
        const newlyAssignedUsers = editingTask.assignedTo.filter(
          userId => !originalTask?.assignedTo.includes(userId)
        );
        
        // Check if assigned user has project access
        const assignedUsers = allUsers.filter(
          (u) => editingTask.assignedTo.includes(u.id)
        );
        
        // Get users without project access
        const usersWithoutAccess = assignedUsers
          .filter(user => !user.projectIds?.includes(projectId))
          .map(user => user.id);

        // If any users don't have project access, add them to the project
        if (usersWithoutAccess.length > 0) {
          await projectService.addUsersToProject(projectId, usersWithoutAccess);
          console.log(
            `Added users ${usersWithoutAccess.join(', ')} to project ${projectId}`
          );
        }

        // Update task directly with Firebase
        await taskService.update(editingTask.id, {
          title: editingTask.title,
          description: editingTask.description,
          assignedTo: editingTask.assignedTo,
          dueDate: editingTask.dueDate,
          priority: editingTask.priority,
        });
        
        // If there are newly assigned users, send notifications
        if (newlyAssignedUsers.length > 0) {
          // Generate the task link
          const taskLink = `${window.location.origin}/projects/${projectId}?task_id=${editingTask.id}`;
          
          const creatorName = user?.displayName || "A team member";
          
          await createTaskNotification(
            editingTask.id,
            editingTask.title,
            projectId,
            settings?.name || "Project",
            creatorName,
            newlyAssignedUsers,
            taskLink
          );
          
          toast.success(`Notifications sent to ${newlyAssignedUsers.length} newly assigned team member${newlyAssignedUsers.length > 1 ? 's' : ''}`);
        }
        
        setEditingTask(null);
      } catch (err) {
        console.error("Error updating task:", err);
        toast.error("Failed to update task");
      }
    }
  };

  // Update the filtered tasks logic to also filter by status
  const filteredTasks = tasks.filter(
    (task) => 
      (selectedCategory === "all" || task.category === selectedCategory) &&
      (selectedUser === "all" || task.assignedTo.includes(selectedUser)) &&
      (selectedStatus === "all" || task.status === selectedStatus)
  );

  // Filter main tasks (not subtasks)
  const mainTasks = filteredTasks.filter(task => !task.parentTaskId);

  // Add function to add sub-task
  const addSubTask = async (parentTaskId: string) => {
    const title = newSubTaskTitle[parentTaskId]?.trim();
    if (!title || addingSubTask[parentTaskId]) return;
    
    try {
      setAddingSubTask(prev => ({ ...prev, [parentTaskId]: true }));
      // Create subtask data object with only defined values
      const subtaskData: any = {
        parentTaskId, // This one is required and always defined
        title,
        status: 'todo',
        assignedTo: [],
      };
      
      // Only add dueDate if we have one
      if (newSubTaskTitle[`${parentTaskId}_dueDate`]) {
        subtaskData.dueDate = newSubTaskTitle[`${parentTaskId}_dueDate`];
      }
      
      // Create new subtask in the dedicated subtasks collection
      const newSubtaskId = await subtaskService.create(subtaskData);
      
      // Find the parent task to get its title and assigned users
      const parentTask = tasks.find(t => t.id === parentTaskId);
      
      // Send notifications to users assigned to the parent task
      if (parentTask && parentTask.assignedTo.length > 0) {
        // Get the current user's name for notification
        const creatorName = user?.displayName || "A team member";
        
        // Send notifications to all users assigned to the parent task
        await createSubtaskNotification(
          parentTaskId,
          parentTask.title,
          newSubtaskId,
          title,
          projectId,
          settings?.name || "Project",
          creatorName,
          parentTask.assignedTo
        );
      }
      
      // Clear input
      setNewSubTaskTitle(prev => ({
        ...prev,
        [parentTaskId]: ''
      }));
    } catch (err) {
      console.error("Error creating subtask:", err);
    } finally {
      setAddingSubTask(prev => ({ ...prev, [parentTaskId]: false }));
    }
  };

  // Add function to delete sub-task
  const deleteSubTask = async (subtaskId: string) => {
    try {
      await subtaskService.delete(subtaskId);
    } catch (err) {
      console.error("Error deleting subtask:", err);
    }
  };

  // Update the handleDeleteTask to also delete any subtasks and work directly with Firebase
  const handleDeleteTask = async (taskId: string) => {
    try {
      // First delete all subtasks
      await subtaskService.deleteByParentTaskId(taskId);
      // Then delete the task directly with Firebase
      await taskService.delete(taskId);
    } catch (err) {
      console.error("Error deleting task and subtasks:", err);
    }
  };

  // Handle creating a new task directly with Firebase
  const handleCreateTask = async (
    projectId: string,
    title: string,
    description: string,
    assignedTo: string[],
    dueDate: string,
    priority: Task["priority"],
    category: Task["category"],
    parentTaskId?: string
  ) => {
    try {
      setCreatingTask(true);
      // Create task directly with Firebase
      // Create task object without undefined values
      const taskData: any = {
        projectId,
        title,
        description,
        assignedTo,
        dueDate,
        priority,
        category,
        status: 'todo',
      };
      
      // Only add parentTaskId if it exists (not undefined)
      if (parentTaskId) {
        taskData.parentTaskId = parentTaskId;
      }
      
      const newTaskId = await taskService.create(taskData);
      
      // Generate the task link
      const taskLink = `${window.location.origin}/projects/${projectId}?task_id=${newTaskId}`;
      
      // If users are assigned, send notifications
      if (assignedTo.length > 0) {
        const creatorName = user?.displayName || "A team member";
        
        await createTaskNotification(
          newTaskId,
          title,
          projectId,
          settings?.name || "Project",
          creatorName,
          assignedTo,
          taskLink
        );
        
        toast.success(`Task created and notifications sent to ${assignedTo.length} team member${assignedTo.length > 1 ? 's' : ''}`);
      }
    } catch (err) {
      console.error("Error creating task:", err);
      toast.error("Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  };

  // Add this function after existing utility functions like getPriorityColor
  const getCategoryColor = (categoryId: string): string => {
    const category = settings?.taskCategories?.find(cat => cat.id === categoryId);
    return category?.color || '#3b82f6'; // Default to blue-500 if category not found
  };

  // Add function to copy task link
  const copyTaskLink = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation(); // Prevent card expansion
    const taskLink = `${window.location.origin}/projects/${projectId}?task_id=${taskId}`;
    
    try {
      await navigator.clipboard.writeText(taskLink);
      toast.success("Task link copied to clipboard");
    } catch (err) {
      console.error("Failed to copy link:", err);
      toast.error("Failed to copy link");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex space-x-2">
              <div className="w-16 h-8 bg-gray-200 rounded-md animate-pulse"></div>
              <div className="w-24 h-8 bg-gray-200 rounded-md animate-pulse"></div>
              <div className="w-20 h-8 bg-gray-200 rounded-md animate-pulse"></div>
            </div>
            <div className="w-32 h-8 bg-gray-200 rounded-md animate-pulse"></div>
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="flex items-start justify-between animate-pulse">
                <div className="w-full">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-24 h-6 bg-gray-200 rounded-md"></div>
                    <div className="w-48 h-6 bg-gray-200 rounded-md"></div>
                    <div className="w-16 h-6 bg-gray-200 rounded-md"></div>
                  </div>
                  <div className="w-3/4 h-4 bg-gray-200 rounded-md mb-4"></div>
                  <div className="w-full h-12 bg-gray-100 rounded-md mb-4"></div>
                  <div className="flex justify-between">
                    <div className="flex space-x-4">
                      <div className="w-32 h-4 bg-gray-200 rounded-md"></div>
                      <div className="w-24 h-4 bg-gray-200 rounded-md"></div>
                    </div>
                    <div className="w-16 h-4 bg-gray-200 rounded-md"></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col mb-6 space-y-4">
       {/* New horizontal filter layout */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Category Filter - Inline */}
          <div className="flex items-center flex-grow">
            <div className="flex flex-wrap gap-2">
              <button
                key="all-categories"
                onClick={() => setSelectedCategory("all")}
                className={`px-4 py-2 text-md rounded-md transition-colors ${
                  selectedCategory === "all"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All
              </button>
              {settings?.taskCategories?.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`px-4 py-2 text-md rounded-md transition-colors flex items-center space-x-1.5 ${
                    selectedCategory === category.id
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span>{category.name}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Action buttons aligned right */}
          <div className="flex items-center space-x-3">
            {/* Filters dropdown button */}
            <div className="relative">
              <button
                onClick={() => setShowFiltersDropdown(!showFiltersDropdown)}
                className="flex items-center space-x-2 px-4 py-2 text-md bg-white border border-gray-200 rounded-md shadow-sm hover:bg-gray-50 transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4 text-gray-500" />
                <span>Filters</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
              
              <AnimatePresence>
                {showFiltersDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg z-10 border border-gray-200 p-4"
                  >
                    {/* Status Filter */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setSelectedStatus("all")}
                          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                            selectedStatus === "all" 
                              ? "bg-blue-500 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          All
                        </button>
                        {statusOptions.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSelectedStatus(option.value)}
                            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                              selectedStatus === option.value
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Updated Assigned To filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Assigned To</label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setSelectedUser("all")}
                          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                            selectedUser === "all"
                              ? "bg-blue-500 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          All
                        </button>
                        
                        {user && (
                          <button
                            onClick={() => setSelectedUser(user.id)}
                            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                              selectedUser === user.id
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            Me
                          </button>
                        )}

                        <div className="relative">
                          <button
                            onClick={() => setShowCustomUserDropdown(!showCustomUserDropdown)}
                            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                              selectedUser !== "all" && selectedUser !== user?.id
                                ? "bg-blue-500 text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            Custom
                            <ChevronDown className="w-4 h-4 inline-block ml-1" />
                          </button>

                          <AnimatePresence>
                            {showCustomUserDropdown && (
                              <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200 p-2"
                              >
                                <div className="max-h-60 overflow-y-auto">
                                  {allUsers
                                    .filter(u => u.id !== user?.id)
                                    .map((user) => (
                                      <button
                                        key={user.id}
                                        onClick={() => {
                                          setSelectedUser(user.id);
                                          setShowCustomUserDropdown(false);
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 rounded-md"
                                      >
                                        {user.displayName || "Unknown User"}
                                      </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {canAssignTasks() && (
              <TaskActions
                projectId={projectId}
                teamMembers={teamMembers}
                categories={settings?.taskCategories || []}
                onCreateTask={handleCreateTask}
                creatingTask={creatingTask}
              />
            )}
          </div>
        </div>

        {/* Filter summary display */}
        {(selectedStatus !== "all" || selectedUser !== "all") && (
          <div className="flex flex-wrap gap-2 text-sm">
            {selectedStatus !== "all" && (
              <div className="flex items-center space-x-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md">
                <span>Status: </span>
                <span className="font-medium capitalize">{selectedStatus}</span>
                <button 
                  onClick={() => setSelectedStatus("all")}
                  className="ml-1 hover:text-blue-900"
                >
                  ×
                </button>
              </div>
            )}
            
            {selectedUser !== "all" && (
              <div className="flex items-center space-x-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md">
                <span>Assigned to: </span>
                <span className="font-medium">
                  {selectedUser === user?.id 
                    ? "Me" 
                    : allUsers.find(u => u.id === selectedUser)?.displayName || "Unknown"}
                </span>
                <button 
                  onClick={() => setSelectedUser("all")}
                  className="ml-1 hover:text-blue-900"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {mainTasks.map((task) => (
          <div
            key={task.id}
            ref={task.id === highlightedTaskId ? highlightedTaskRef : null}
            className={`p-4 bg-white border border-gray-200 rounded-lg shadow-sm relative ${
              subtasksMap[task.id]?.length > 0 
                ? 'hover:shadow-md transition-all duration-200' 
                : 'hover:shadow-sm transition-shadow'
            } ${
              task.id === highlightedTaskId 
                ? 'ring-2 ring-blue-500 animate-pulse' 
                : ''
            }`}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Assign to</label>
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
                      {allUsers.map((user) => (
                        <div key={user.id} className="flex items-center mb-2 last:mb-0">
                          <input
                            type="checkbox"
                            id={`user-${user.id}`}
                            checked={editingTask.assignedTo.includes(user.id)}
                            onChange={(e) => {
                              const newAssignedTo = e.target.checked
                                ? [...editingTask.assignedTo, user.id]
                                : editingTask.assignedTo.filter(id => id !== user.id);
                              setEditingTask({
                                ...editingTask,
                                assignedTo: newAssignedTo,
                              });
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor={`user-${user.id}`} className="ml-2 block text-sm text-gray-900">
                            {user.displayName || "Unknown User"}
                            {!user.projectIds?.includes(projectId) &&
                              " (Will be added to project)"}
                          </label>
                        </div>
                      ))}
                    </div>
                    {editingTask.assignedTo.some(userId => 
                      !allUsers.find(u => u.id === userId)?.projectIds?.includes(projectId)
                    ) && (
                      <p className="mt-1 text-sm text-blue-500">
                        Some users will be added to project upon assignment
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
              
                <div 
                  className={`flex items-start justify-between border-l-4 pl-3`}
                  style={{
                    cursor: 'pointer',
                    borderLeftColor: getCategoryColor(task.category)
                  }}
                  onClick={(e) => {
                    // Don't trigger if user is clicking on buttons or status menu
                    if (
                      (e.target as HTMLElement).closest('button') ||
                      (e.target as HTMLElement).closest('.status-dropdown')
                    ) {
                      return;
                    }
                    
                    // Toggle expanded state
                    const taskIdString = String(task.id);
                    setExpandedTask(expandedTask === taskIdString ? null : taskIdString);
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      {canUpdateTaskStatus(task.id) && (
                        <div className="relative status-dropdown">
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent card expansion
                              setShowStatusMenu(
                                showStatusMenu === task.id ? null : task.id
                              );
                            }}
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
                                    onClick={(e) => {
                                      e.stopPropagation(); // Prevent card expansion
                                      handleStatusChange(task.id, option.value);
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
                      <div className="flex items-center">
                        {expandedTask === String(task.id) ? 
                          <ChevronUp className="w-4 h-4 mr-1" style={{ color: getCategoryColor(task.category) }} /> : 
                          <ChevronRight className="w-4 h-4 mr-1 text-gray-500" />
                        }
                        <h3 className="font-medium text-gray-900">
                          {task.title}
                        </h3>
                        {subtasksMap[task.id]?.length > 0 && expandedTask !== String(task.id) && (
                          <span 
                            className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            style={{ 
                              backgroundColor: `${getCategoryColor(task.category)}20`, // 20 is hex for 12% opacity
                              color: getCategoryColor(task.category)
                            }}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            {subtasksMap[task.id]?.filter(st => st.status === 'completed').length || 0}/{subtasksMap[task.id]?.length}
                          </span>
                        )}
                      </div>
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

                    {/* Show sub-tasks section when expanded with animation */}
                    <AnimatePresence>
                      {expandedTask === String(task.id) && (
                        <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ 
                          opacity: 1,
                          height: "auto",
                          transition: {
                            opacity: { duration: 0.2 },
                            height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
                          }
                        }}
                        exit={{ 
                          opacity: 0,
                          height: 0,
                          transition: {
                            opacity: { duration: 0.15 },
                            height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] }
                          }
                        }}
                        className="pl-6 border-l-2 bg-gray-100 rounded-md overflow-hidden mt-2 p-2"
                        onClick={e => e.stopPropagation()}
                      >
                        <motion.div
        initial={{ y: -10 }}
        animate={{ y: 0 }}
        exit={{ y: -10 }}
        transition={{ duration: 0.2 }}
        className="p-2"
      >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-gray-700">Sub-tasks</h4>
                            <div className="text-xs text-gray-500">
                              {subtasksMap[task.id]?.filter(st => st.status === 'completed').length || 0}/{subtasksMap[task.id]?.length || 0} completed
                            </div>
                          </div>
                          
                          {/* Sub-tasks list */}
                          <div className="space-y-2 mb-3 ">
                            {(subtasksMap[task.id] || []).map(subtask => (
                               
                              <div key={subtask.id} className="flex items-center group">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent card expansion
                                    toggleSubTaskCompletion(subtask);
                                  }}
                                  className="p-1 mr-2"
                                >
                                  {subtask.status === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-gray-300" />
                                  )}
                                </button>
                                <label 
                                  className={`text-md flex-1 cursor-pointer ${subtask.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleSubTaskCompletion(subtask);
                                  }}
                                >
                                  {subtask.title}
                                </label>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // Prevent card expansion
                                    deleteSubTask(subtask.id);
                                  }}
                                  className="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="w-5 h-5 text-gray-400 hover:text-red-500" />
                                </button>
                              </div>
                             
                            ))}
                          </div>
                          
                          {/* Add new sub-task input */}
                          <div className="flex items-center">
                            <input
                              type="text"
                              placeholder="Add a sub-task..."
                              value={newSubTaskTitle[task.id] || ''}
                              onChange={(e) => setNewSubTaskTitle(prev => ({
                                ...prev,
                                [task.id]: e.target.value
                              }))}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addSubTask(task.id);
                                }
                              }}
                              disabled={addingSubTask[task.id]}
                              className={`flex-1 text-md px-2 py-1 border-b border-gray-200 focus:outline-none ${
                                addingSubTask[task.id] ? 'opacity-50' : 'focus:border-blue-500'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent card expansion
                                addSubTask(task.id);
                              }}
                              disabled={addingSubTask[task.id]}
                              className="ml-2 p-1 text-blue-500 hover:text-blue-600 disabled:opacity-50"
                            >
                              {addingSubTask[task.id] ? (
                                <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <Plus className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          <span>Assigned to: </span>
                          {task.assignedTo.length > 0 ? (
                            <div className="flex -space-x-1 ml-1">
                              {task.assignedTo.slice(0, 3).map(userId => {
                                const user = allUsers.find(u => u.id === userId);
                                return (
                                  <div 
                                    key={userId} 
                                    className="w-6 h-6 rounded-full bg-gray-100 border border-white overflow-hidden" 
                                    title={user?.displayName || "Unknown"}
                                  >
                                    {user?.profile?.photoURL ? (
                                      <img 
                                        src={user.profile.photoURL} 
                                        alt={user?.displayName?.[0] || "?"}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-xs font-medium bg-blue-100 text-blue-800">
                                        {user?.displayName?.[0]?.toUpperCase() || "?"}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {task.assignedTo.length > 3 && (
                                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-800 border border-white">
                                  +{task.assignedTo.length - 3}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="ml-1">Unassigned</span>
                          )}
                        </div>
                        <span>Due: {task.dueDate}</span>
                        {/* Show subtask progress bar if there are subtasks */}
                        {(subtasksMap[task.id]?.length > 0) && (
                          <div className="flex items-center space-x-1">
                            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full rounded-full"
                                style={{ 
                                  width: `${subtasksMap[task.id]?.filter(st => st.status === 'completed').length / subtasksMap[task.id].length * 100}%`,
                                  backgroundColor: getCategoryColor(task.category)
                                }}
                              />
                            </div>
                            <span className="text-xs flex items-center">
                              <CheckCircle2 className="w-3 h-3 mr-1" style={{ color: getCategoryColor(task.category) }} />
                              {subtasksMap[task.id]?.filter(st => st.status === 'completed').length || 0}/{subtasksMap[task.id]?.length}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        
                        {canEditTask() && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent card expansion
                              setEditingTask(task);
                            }}
                            className="p-1 hover:text-blue-500 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDeleteTask() && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent card expansion
                              handleDeleteTask(task.id);
                            }}
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