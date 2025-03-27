import React from 'react';
import TaskTree from './TaskTree';
import Layout from './Layout';

const TaskDemo: React.FC = () => {
  const handleTaskClick = (taskId: string) => {
    console.log(`Task clicked: ${taskId}`);
  };

  return (
    <Layout sidebar={null}>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Task Tree Structure Example</h1>
        <p className="text-gray-600 mb-8">
          This example shows a parent task with subtasks in a hierarchical structure.
          The parent task "Design a Card Layout" has two subtasks: making a smaller card design and
          ensuring the card doesn't show the 'Add Subtask' option.
        </p>
        
        <TaskTree onTaskClick={handleTaskClick} />
      </div>
    </Layout>
  );
};

export default TaskDemo; 