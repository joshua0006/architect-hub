import { taskService } from '../services/taskService';
import { Task } from '../types';

/**
 * Utility function to test the subtask implementation
 * This function simulates the creation of a parent task and a subtask
 * and verifies that the subtask inherits the parent's category
 */
export const testSubtaskCategoryInheritance = async (): Promise<{
  success: boolean;
  message: string;
  parentTask?: Task;
  subtask?: Task;
}> => {
  try {
    // Create a parent task
    const projectId = 'test-project';
    const parentTaskData: Omit<Task, 'id'> = {
      projectId,
      title: 'Parent Task',
      description: 'This is a parent task for testing',
      assignedTo: ['user1'],
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
    
    // Create the parent task
    const parentTaskId = await taskService.create(parentTaskData);
    
    // Create a subtask with a different category
    const subtaskData: Omit<Task, 'id'> = {
      projectId,
      title: 'Subtask',
      description: 'This is a subtask for testing',
      assignedTo: ['user1'],
      dueDate: new Date().toISOString().split('T')[0],
      priority: 'low',
      status: 'todo',
      category: 'different-category', // Try to use a different category
      parentTaskId, // Reference to parent task
      metadata: {
        createdBy: 'test-user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    };
    
    // Create the subtask
    const subtaskId = await taskService.create(subtaskData);
    
    // Fetch the parent task and subtask
    const parentTask = await taskService.getById(parentTaskId);
    const subtask = await taskService.getById(subtaskId);
    
    // Check if the subtask has the same category as the parent
    if (parentTask && subtask) {
      const categoriesMatch = parentTask.category === subtask.category;
      
      if (categoriesMatch) {
        return {
          success: true,
          message: `Subtask successfully inherited parent category: ${parentTask.category}`,
          parentTask,
          subtask
        };
      } else {
        return {
          success: false,
          message: `Subtask did not inherit parent category. Parent: ${parentTask.category}, Subtask: ${subtask.category}`,
          parentTask,
          subtask
        };
      }
    } else {
      return {
        success: false,
        message: 'Failed to retrieve parent task or subtask',
        parentTask: parentTask || undefined,
        subtask: subtask || undefined
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Error testing subtask category inheritance: ${errorMessage}`
    };
  }
}; 