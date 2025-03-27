import { taskService } from '../services/taskService';
import { Task } from '../types';

/**
 * Utility to test real-time task subscription
 * This function will create a task, then subscribe to tasks in the project,
 * then update the task, and finally verify that the update was received via the subscription
 */
export const testRealTimeTaskUpdates = async (projectId: string): Promise<{
  success: boolean;
  message: string;
  taskId?: string;
}> => {
  // Store the result
  let result = {
    success: false,
    message: '',
    taskId: ''
  };
  
  // Create a unique task title to identify this test
  const testId = Date.now().toString();
  const taskTitle = `Test Task ${testId}`;
  
  // Create an unsubscribe function reference
  let unsubscribe: (() => void) | null = null;
  
  try {
    // Step 1: Create a new task
    console.log(`Creating test task: ${taskTitle}`);
    const taskData: Omit<Task, 'id'> = {
      projectId,
      title: taskTitle,
      description: 'Testing real-time updates',
      assignedTo: ['test-user'],
      dueDate: new Date().toISOString().split('T')[0],
      priority: 'medium',
      status: 'todo',
      category: 'test-category',
      metadata: {
        createdBy: 'test-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    
    const taskId = await taskService.create(taskData);
    result.taskId = taskId;
    console.log(`Task created with ID: ${taskId}`);
    
    // Step 2: Setup subscription and return a promise
    return new Promise((resolve) => {
      let updateReceived = false;
      
      // Set a timeout to fail the test if update isn't received
      const timeout = setTimeout(() => {
        if (unsubscribe) unsubscribe();
        resolve({
          success: false,
          message: 'Timeout: Did not receive real-time update in time',
          taskId
        });
      }, 10000); // 10 second timeout
      
      console.log('Setting up subscription to tasks...');
      unsubscribe = taskService.subscribeToProjectTasks(projectId, (tasks) => {
        console.log(`Received ${tasks.length} tasks from subscription`);
        
        // Look for our test task
        const updatedTask = tasks.find(t => t.id === taskId);
        
        if (updatedTask && updatedTask.status === 'in-progress') {
          updateReceived = true;
          console.log('Real-time update received successfully!');
          
          // Clean up
          clearTimeout(timeout);
          if (unsubscribe) unsubscribe();
          
          resolve({
            success: true,
            message: 'Successfully received real-time update for task',
            taskId
          });
        }
      });
      
      // Step 3: After a short delay, update the task
      setTimeout(async () => {
        try {
          console.log(`Updating task status to 'in-progress'...`);
          await taskService.update(taskId, { status: 'in-progress' });
          console.log('Task updated');
          
          // If we haven't received the update after 3 more seconds, fail the test
          setTimeout(() => {
            if (!updateReceived) {
              clearTimeout(timeout);
              if (unsubscribe) unsubscribe();
              
              resolve({
                success: false,
                message: 'Update was made but not received via subscription',
                taskId
              });
            }
          }, 3000);
        } catch (error) {
          clearTimeout(timeout);
          if (unsubscribe) unsubscribe();
          
          resolve({
            success: false,
            message: `Error updating task: ${error}`,
            taskId
          });
        }
      }, 1000);
    });
  } catch (error) {
    return {
      success: false,
      message: `Error during test: ${error}`,
      taskId: result.taskId
    };
  }
}; 