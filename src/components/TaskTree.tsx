import React, { useState } from 'react';
import { Task } from '../types';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Clock, AlertCircle, Users } from 'lucide-react';

interface TaskTreeProps {
  onTaskClick?: (taskId: string) => void;
}

const TaskTree: React.FC<TaskTreeProps> = ({ onTaskClick }) => {
  const [showSubtasks, setShowSubtasks] = useState(true);

  // Example parent task with subtasks
  const task: Task = {
    id: 'parent-task-1',
    projectId: 'project-1',
    title: 'Design a Card Layout',
    description: 'Create a complete card layout design for the application interface with proper styling and functionality',
    assignedTo: ['user-1'],
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks from now
    priority: 'high',
    status: 'in-progress',
    category: 'Design',
    subtasks: [
      {
        id: 'subtask-1',
        projectId: 'project-1',
        title: 'Make a smaller card design',
        description: 'Develop a compact version of the card layout that takes up less vertical space while maintaining readability',
        assignedTo: ['user-1'],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week from now
        priority: 'medium',
        status: 'todo',
        category: 'Design',
        parentTaskId: 'parent-task-1'
      },
      {
        id: 'subtask-2',
        projectId: 'project-1',
        title: 'Ensure the card does not show the \'Add Subtask\' option',
        description: 'Modify the card component to conditionally hide the Add Subtask button based on card type or user permissions',
        assignedTo: ['user-1'],
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days from now
        priority: 'low',
        status: 'todo',
        category: 'Design',
        parentTaskId: 'parent-task-1'
      }
    ]
  };

  // Helper function to get priority indicator
  const getPriorityIndicator = (priority: Task['priority']) => {
    const colors = {
      low: 'bg-green-100 border-green-300 text-green-700',
      medium: 'bg-yellow-100 border-yellow-300 text-yellow-700',
      high: 'bg-red-100 border-red-300 text-red-700',
    };

    return (
      <div className={`h-5 w-5 rounded-full border ${colors[priority]} flex items-center justify-center text-xs`}>
        {priority === 'high' ? '!' : priority === 'medium' ? '⟳' : '·'}
      </div>
    );
  };

  // Helper function to get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo':
        return 'bg-gray-100 text-gray-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper function to check if a task is overdue
  const isOverdue = (dueDate: string, status: string) => {
    return new Date(dueDate) < new Date() && status !== 'completed';
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Helper function to get subtask progress
  const getSubtaskProgress = (task: Task) => {
    if (!task.subtasks || task.subtasks.length === 0) return 0;
    const completedSubtasks = task.subtasks.filter(st => st.status === 'completed').length;
    return (completedSubtasks / task.subtasks.length) * 100;
  };

  // Render a subtask
  const renderSubtask = (subtask: Task, index: number) => {
    return (
      <motion.div
        key={subtask.id}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className="p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:shadow-sm transition-shadow"
        onClick={() => onTaskClick && onTaskClick(subtask.id)}
      >
        <div className="flex items-start space-x-3">
          {getPriorityIndicator(subtask.priority)}
          <div className="flex-1">
            <h5 className="font-medium text-gray-900">{subtask.title}</h5>
            <div className="flex items-center mt-1 space-x-2">
              <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(subtask.status)}`}>
                {subtask.status}
              </span>
              <span className="flex items-center text-xs text-gray-500">
                <Clock className="w-3 h-3 mr-1" />
                {isOverdue(subtask.dueDate, subtask.status) ? (
                  <span className="flex items-center text-red-500">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Overdue
                  </span>
                ) : (
                  formatDate(subtask.dueDate)
                )}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2 className="text-xl font-semibold mb-4">Task Hierarchy Example</h2>
      
      {/* Parent Task */}
      <div className="overflow-hidden rounded-lg shadow-sm">
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-white border border-gray-200 rounded-t-lg cursor-pointer"
          onClick={() => setShowSubtasks(!showSubtasks)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              {getPriorityIndicator(task.priority)}
              <div>
                <div className="flex items-center">
                  <h4 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                    {task.title}
                  </h4>
                  <div className="flex items-center ml-2 text-blue-500">
                    {showSubtasks ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    <span className="ml-1 text-xs font-medium">
                      {task.subtasks?.length} subtasks
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center mt-1 space-x-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(task.status)}`}>
                    {task.status}
                  </span>
                  <span className="flex items-center text-xs text-gray-500">
                    <Clock className="w-3 h-3 mr-1" />
                    {isOverdue(task.dueDate, task.status) ? (
                      <span className="flex items-center text-red-500">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Overdue
                      </span>
                    ) : (
                      formatDate(task.dueDate)
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Subtask progress */}
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-purple-500 h-1.5 rounded-full" 
                style={{ width: `${getSubtaskProgress(task)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-500">
              <span>
                {task.subtasks?.filter(st => st.status === 'completed').length} of {task.subtasks?.length} completed
              </span>
              <span className="text-blue-500">
                {showSubtasks ? 'Click to collapse' : 'Click to expand'}
              </span>
            </div>
          </div>
        </motion.div>
        
        {/* Subtasks container */}
        {showSubtasks && (
          <div className="p-3 bg-gray-50 border-t border-gray-100 border-l border-r border-b border-gray-200 rounded-b-lg">
            <div className="space-y-2">
              {task.subtasks?.map((subtask, idx) => renderSubtask(subtask, idx))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskTree; 