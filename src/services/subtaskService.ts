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

const COLLECTION = 'subtasks';

export interface Subtask {
  id: string;
  parentTaskId: string;
  title: string;
  status: 'todo' | 'completed';
  assignedTo: string[];
  dueDate?: string;
  createdAt?: any;
  updatedAt?: any;
}

export const subtaskService = {
  // Get all subtasks for a parent task
  async getByParentTaskId(parentTaskId: string): Promise<Subtask[]> {
    const q = query(
      collection(db, COLLECTION),
      where('parentTaskId', '==', parentTaskId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Subtask));
  },

  // Real-time subscription to subtasks for a specific parent task
  subscribeToSubtasks(parentTaskId: string, callback: (subtasks: Subtask[]) => void) {
    try {
      const subtasksRef = collection(db, COLLECTION);
      const q = query(subtasksRef, where('parentTaskId', '==', parentTaskId));
      
      return onSnapshot(q, (snapshot) => {
        const subtasks = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Subtask));
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

  // Create a subtask
  async create(subtask: Omit<Subtask, 'id'>): Promise<string> {
    // Filter out any properties with undefined values
    const cleanedData = Object.entries(subtask).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...cleanedData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  },

  // Update a subtask
  async update(id: string, updates: Partial<Subtask>): Promise<void> {
    // Filter out any properties with undefined values
    const cleanedUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, {
      ...cleanedUpdates,
      updatedAt: serverTimestamp()
    });
  },

  // Delete a subtask
  async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  },
  
  // Delete all subtasks for a parent task
  async deleteByParentTaskId(parentTaskId: string): Promise<void> {
    const subtasks = await this.getByParentTaskId(parentTaskId);
    
    const deletePromises = subtasks.map(subtask => 
      this.delete(subtask.id)
    );
    
    await Promise.all(deletePromises);
  }
}; 