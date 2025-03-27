import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Task } from '../types';

const COLLECTION = 'tasks';

export const taskService = {
  // Get all tasks
  async getAll(): Promise<Task[]> {
    const snapshot = await getDocs(collection(db, COLLECTION));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
  },

  // Real-time subscription to tasks for a specific project
  subscribeToProjectTasks(projectId: string, callback: (tasks: Task[]) => void) {
    try {
      const tasksRef = collection(db, COLLECTION);
      const q = query(tasksRef, where('projectId', '==', projectId));
      
      return onSnapshot(q, (snapshot) => {
        const tasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Task));
        callback(tasks);
      }, (error) => {
        console.error('Error in tasks subscription:', error);
        callback([]);
      });
    } catch (error) {
      console.error('Error setting up tasks subscription:', error);
      return () => {};
    }
  },

  // Get all tasks for a project
  async getByProjectId(projectId: string): Promise<Task[]> {
    const q = query(
      collection(db, COLLECTION),
      where('projectId', '==', projectId)
    );
    const snapshot = await getDocs(q);
    const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    
    // Return all tasks - both parent tasks and subtasks
    // The component will organize them into hierarchy
    return tasks;
  },

  // Get all subtasks for a parent task
  async getSubtasks(parentTaskId: string): Promise<Task[]> {
    const q = query(
      collection(db, COLLECTION),
      where('parentTaskId', '==', parentTaskId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
  },

  // Real-time subscription to subtasks for a specific parent task
  subscribeToSubtasks(parentTaskId: string, callback: (subtasks: Task[]) => void) {
    try {
      const tasksRef = collection(db, COLLECTION);
      const q = query(tasksRef, where('parentTaskId', '==', parentTaskId));
      
      return onSnapshot(q, (snapshot) => {
        const subtasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Task));
        callback(subtasks);
      }, (error) => {
        console.error('Error in subtasks subscription:', error);
        callback([]);
      });
    } catch (error) {
      console.error('Error setting up subtasks subscription:', error);
      return () => {};
    }
  },

  // Get tasks assigned to a user
  async getByAssignedTo(userId: string): Promise<Task[]> {
    // Need to handle array-contains for the new multi-user structure
    const q = query(
      collection(db, COLLECTION),
      where('assignedTo', 'array-contains', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
  },

  // Get a single task
  async getById(id: string): Promise<Task | null> {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    const task = { id: docSnap.id, ...docSnap.data() } as Task;
    
    // Fetch subtasks if this is a parent task
    const subtasks = await this.getSubtasks(task.id);
    if (subtasks.length > 0) {
      task.subtasks = subtasks;
    }
    
    return task;
  },

  // Create a task
  async create(task: Omit<Task, 'id'>): Promise<string> {
    // Filter out any properties with undefined values
    const cleanedTask = Object.entries(task).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    // If this is a subtask, get the parent task's category
    if (cleanedTask.parentTaskId) {
      try {
        const parentTask = await this.getById(cleanedTask.parentTaskId);
        if (parentTask) {
          // Ensure subtask uses the same category as parent
          cleanedTask.category = parentTask.category;
        }
      } catch (error) {
        console.error("Error getting parent task category:", error);
        // Continue with the provided category if parent lookup fails
      }
    }
    
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...cleanedTask,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  // Update a task
  async update(id: string, updates: Partial<Task>): Promise<void> {
    // Filter out any properties with undefined values
    const cleanedUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    // If this is a subtask, don't allow changing the category
    if (cleanedUpdates.parentTaskId && cleanedUpdates.category) {
      try {
        const task = await this.getById(id);
        if (task && task.parentTaskId) {
          const parentTask = await this.getById(task.parentTaskId);
          if (parentTask && cleanedUpdates.category !== parentTask.category) {
            // Remove the category update as it should match the parent
            delete cleanedUpdates.category;
          }
        }
      } catch (error) {
        console.error("Error validating subtask category update:", error);
      }
    }
    
    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, {
      ...cleanedUpdates,
      updatedAt: serverTimestamp()
    });
  },

  // Delete a task and its subtasks
  async delete(id: string): Promise<void> {
    // First, delete all subtasks
    const subtasks = await this.getSubtasks(id);
    
    // Delete each subtask
    const subtaskDeletePromises = subtasks.map(subtask => 
      deleteDoc(doc(db, COLLECTION, subtask.id))
    );
    
    // Wait for all subtask deletions to complete
    await Promise.all(subtaskDeletePromises);
    
    // Then delete the parent task
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  }
};