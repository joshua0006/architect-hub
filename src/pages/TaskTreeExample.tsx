import React from 'react';
import TaskTree from '../components/TaskTree';

const TaskTreeExample: React.FC = () => {
  const handleTaskClick = (taskId: string) => {
    // In a real application, this might navigate to the task details page
    console.log(`Task clicked: ${taskId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 px-4">Task Tree Structure Example</h1>
        <p className="text-gray-600 mb-8 px-4">
          This example shows a parent task with subtasks in a hierarchical structure.
          The parent task "Design a Card Layout" has two subtasks: making a smaller card design and
          ensuring the card doesn't show the 'Add Subtask' option.
        </p>
        
        <TaskTree onTaskClick={handleTaskClick} />
      </div>
    </div>
  );
};

export default TaskTreeExample; 