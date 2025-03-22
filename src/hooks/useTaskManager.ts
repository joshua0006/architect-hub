import { useState, useEffect } from 'react';
import { Task } from '../types';
import { taskService } from '../services';

export function useTaskManager(initialTasks: Task[]) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const fetchedTasks = await taskService.getAll();
      setTasks(fetchedTasks);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load tasks'));
    } finally {
      setLoading(false);
    }
  };

  const createTask = async (
    projectId: string,
    title: string,
    description: string,
    assignedTo: string,
    dueDate: string,
    priority: Task['priority'],
    category: Task['category']
  ) => {
    try {
      const newTask = await taskService.create({
        projectId,
        title,
        description,
        assignedTo,
        dueDate,
        priority,
        category,
        status: 'todo'
      });
      setTasks(prev => [...prev, newTask]);
      return newTask;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to create task');
    }
  };

  const updateTask = async (
    id: string,
    updates: Partial<Omit<Task, 'id' | 'projectId'>>
  ) => {
    try {
      await taskService.update(id, updates);
      setTasks(tasks.map(task => 
        task.id === id ? { ...task, ...updates } : task
      ));
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update task');
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await taskService.delete(id);
      setTasks(tasks.filter(task => task.id !== id));
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete task');
    }
  };

  return {
    tasks,
    loading,
    error,
    createTask,
    updateTask,
    deleteTask,
    refreshTasks: loadTasks
  };
}