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
  serverTimestamp
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

  // Get all tasks for a project
  async getByProjectId(projectId: string): Promise<Task[]> {
    const q = query(
      collection(db, COLLECTION),
      where('projectId', '==', projectId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
  },

  // Get tasks assigned to a user
  async getByAssignedTo(userId: string): Promise<Task[]> {
    const q = query(
      collection(db, COLLECTION),
      where('assignedTo', '==', userId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
  },

  // Get a single task
  async getById(id: string): Promise<Task | null> {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Task : null;
  },

  // Create a task
  async create(task: Omit<Task, 'id'>): Promise<Task> {
    const docRef = await addDoc(collection(db, COLLECTION), {
      ...task,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { id: docRef.id, ...task };
  },

  // Update a task
  async update(id: string, updates: Partial<Task>): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  },

  // Delete a task
  async delete(id: string): Promise<void> {
    const docRef = doc(db, COLLECTION, id);
    await deleteDoc(docRef);
  }
};