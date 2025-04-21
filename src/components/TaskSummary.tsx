import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Task, User } from '../types';
import { Calendar, ArrowRight, AlertCircle, Users, Layers, Clock, ChevronRight, ChevronDown } from 'lucide-react';
import { useOrganization } from '../contexts/OrganizationContext';
import { formatDateToTimezone, isOverdue } from '../utils/dateUtils';
import { useEffect, useState, useRef } from 'react';
import { userService } from '../services/userService';
import { taskService } from '../services/taskService';

interface TaskSummaryProps {
  projectId: string;
  tasks: Task[];
}

export default function TaskSummary({ projectId, tasks: initialTasks }: TaskSummaryProps) {
  const { settings } = useOrganization();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();
  
  // Ref for storing unsubscribe function
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Toggle task expansion
  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  // Load users when component mounts
  useEffect(() => {
    loadUsers();
  }, []);

  // Setup real-time subscription to tasks
  useEffect(() => {
    // Setup task subscription
    const setupTaskSubscription = () => {
      // Clean up any existing subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      try {
        // Subscribe to project tasks
        const unsubscribe = taskService.subscribeToProjectTasks(projectId, (updatedTasks) => {
          setTasks(updatedTasks);
        });
        
        // Store the unsubscribe function
        unsubscribeRef.current = unsubscribe;
      } catch (err) {
        console.error('Error setting up task subscription:', err);
      }
    };
    
    if (projectId) {
      setupTaskSubscription();
    }
    
    // Cleanup function
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [projectId]);

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
  
  // Process tasks to organize parent tasks and their subtasks
  const organizeTaskHierarchy = (allTasks: Task[]) => {
    const parentTasks: Task[] = [];
    const subtaskMap: Record<string, Task[]> = {};
    
    // First pass - separate parent tasks and subtasks
    allTasks.forEach(task => {
      if (!task.parentTaskId) {
        // This is a parent task
        parentTasks.push({...task, subtasks: []});
      } else {
        // This is a subtask
        if (!subtaskMap[task.parentTaskId]) {
          subtaskMap[task.parentTaskId] = [];
        }
        subtaskMap[task.parentTaskId].push(task);
      }
    });
    
    // Second pass - add subtasks to their parents
    parentTasks.forEach(parentTask => {
      if (subtaskMap[parentTask.id]) {
        parentTask.subtasks = subtaskMap[parentTask.id];
      }
    });
    
    return parentTasks;
  };
  
  // Organize tasks into hierarchy
  const organizedTasks = organizeTaskHierarchy(tasks);
  
  // Get the 3 most recent tasks
  const recentTasks = [...organizedTasks]
    .sort((a, b) => {
      const dateA = a.metadata?.updatedAt || a.metadata?.createdAt || "";
      const dateB = b.metadata?.updatedAt || b.metadata?.createdAt || "";
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })
    .slice(0, 3);

  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityIndicator = (priority: Task['priority']) => {
    const colors = {
      high: 'bg-red-500',
      medium: 'bg-yellow-500',
      low: 'bg-blue-500'
    };
    return <span className={`w-2 h-2 rounded-full ${colors[priority]}`} />;
  };
  
  // Helper to get assignee names for display
  const getAssigneeNames = (assignedIds: string | string[]) => {
    if (!assignedIds) return "Unassigned";
    
    const ids = Array.isArray(assignedIds) ? assignedIds : [assignedIds];
    
    if (ids.length === 0) return "Unassigned";
    
    const names = ids.map(id => 
      allUsers.find(u => u.id === id)?.displayName || "Unknown User"
    );
    
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    return `${names[0]} and ${names.length - 1} others`;
  };

  // Calculate subtask progress
  const getSubtaskProgress = (task: Task) => {
    if (!task.subtasks || task.subtasks.length === 0) return null;
    
    const totalSubtasks = task.subtasks.length;
    const completedSubtasks = task.subtasks.filter(subtask => 
      subtask.status === 'completed'
    ).length;
    
    return {
      total: totalSubtasks,
      completed: completedSubtasks,
      percentage: Math.round((completedSubtasks / totalSubtasks) * 100)
    };
  };

  // Navigate to task detail 
  const navigateToTask = (taskId: string) => {
    navigate(`/tasks/${projectId}/${taskId}`);
  };

  // Render subtask in a simplified format
  const renderSubtask = (subtask: Task, index: number) => {
    return (
      <motion.div
        key={subtask.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 * index }}
        className="p-2 border-l-4 border-l-purple-400 bg-white rounded-md shadow-sm"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1 min-w-0">
            <span className={`w-2 h-2 rounded-full mr-2 ${
              subtask.status === 'completed' ? 'bg-green-500' : 
              subtask.status === 'in-progress' ? 'bg-blue-500' : 'bg-gray-400'
            }`} />
            <p className="text-sm font-medium text-gray-700 truncate">{subtask.title}</p>
          </div>
          <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${getStatusColor(subtask.status)}`}>
            {subtask.status}
          </span>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Recent Tasks</h3>
        <Link
          to="/tasks"
          className="flex items-center text-sm text-primary-600 hover:text-primary-700 transition-colors"
        >
          View All Tasks
          <ArrowRight className="w-4 h-4 ml-1" />
        </Link>
      </div>

      <div className="space-y-4">
        {loadingUsers ? (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : recentTasks.length > 0 ? (
          recentTasks.map((task, index) => {
            const hasSubtasks = task.subtasks && task.subtasks.length > 0;
            const isExpanded = expandedTasks[task.id] || false;
            const subtaskProgress = getSubtaskProgress(task);
            const subtasks = task.subtasks || [];
            
            return (
              <div key={task.id} className="overflow-hidden rounded-lg shadow-sm">
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-4 bg-white border border-gray-200 rounded-t-lg cursor-pointer"
                  onClick={() => navigateToTask(task.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      {getPriorityIndicator(task.priority)}
                      <div>
                        <div className="flex items-center">
                          <h4 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                            {task.title}
                          </h4>
                          {hasSubtasks && (
                            <div className="flex items-center ml-2 text-blue-500">
                              {isExpanded ? (
                                <ChevronDown className="w-3 h-3" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              <span className="ml-1 text-xs font-medium">
                                {subtasks.length} {subtasks.length === 1 ? 'subtask' : 'subtasks'}
                              </span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center mt-1 space-x-2">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(task.status)}`}>
                            {task.status}
                          </span>
                          <span className="flex items-center text-xs text-gray-500">
                            <Clock className="w-3 h-3 mr-1" />
                            {isOverdue(task.dueDate, task.status, settings.timezone) ? (
                              <span className="flex items-center text-red-500">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Overdue
                              </span>
                            ) : (
                              formatDateToTimezone(task.dueDate, settings.timezone)
                            )}
                          </span>
                        </div>
                        <div className="flex items-center mt-1 text-xs text-gray-500">
                          <Users className="w-3 h-3 mr-1" />
                          <span>{getAssigneeNames(task.assignedTo)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Show subtask progress if task has subtasks */}
                  {hasSubtasks && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-purple-500 h-1.5 rounded-full" 
                          style={{ 
                            width: `${(subtasks.filter(st => st.status === 'completed').length / subtasks.length) * 100}%` 
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-gray-500">
                        <span className="flex items-center">
                          <Layers className="w-3 h-3 mr-1" />
                          {subtasks.filter(st => st.status === 'completed').length} of {subtasks.length} completed
                        </span>
                        <span className="text-blue-500">
                          {isExpanded ? 'Click to collapse' : 'Click to expand'}
                        </span>
                      </div>
                    </div>
                  )}
                </motion.div>
                
                {/* Subtasks container */}
                {hasSubtasks && isExpanded && (
                  <div className="p-3 bg-gray-50 border-t border-gray-100 border-l border-r border-b border-gray-200 rounded-b-lg">
                    <div className="space-y-2">
                      {subtasks.map((subtask, idx) => renderSubtask(subtask, idx))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-6 text-gray-500 bg-white rounded-lg border border-gray-200"
          >
            No tasks found
          </motion.div>
        )}
      </div>
    </div>
  );
}