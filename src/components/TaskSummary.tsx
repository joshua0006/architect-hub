import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Task } from '../types';
import { Calendar, ArrowRight, AlertCircle } from 'lucide-react';
import { useOrganization } from '../contexts/OrganizationContext';
import { formatDateToTimezone, isOverdue } from '../utils/dateUtils';

interface TaskSummaryProps {
  tasks: Task[];
  projectId: string;
}

export default function TaskSummary({ tasks, projectId }: TaskSummaryProps) {
  const { settings } = useOrganization();
  
  // Get the 5 most recent tasks
  const recentTasks = [...tasks]
    .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())
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

      <div className="space-y-3">
        {recentTasks.map((task, index) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-all duration-200 group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center items-start space-x-3">
                {getPriorityIndicator(task.priority)}
                <div>
                  <h4 className="font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                    {task.title}
                  </h4>
                  <div className="flex items-center mt-1 space-x-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(task.status)}`}>
                      {task.status}
                    </span>
                    <span className="flex items-center text-xs text-gray-500">
                      <Calendar className="w-3 h-3 mr-1" />
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
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {recentTasks.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-6 text-gray-500"
          >
            No tasks found
          </motion.div>
        )}
      </div>
    </div>
  );
}