import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Milestone } from '../types';

const COLLECTION = 'milestones';

export const milestoneService = {
  // Create a milestone with transaction to update project progress
  async create(milestone: Omit<Milestone, 'id'>): Promise<void> {
    try {
      await runTransaction(db, async (transaction) => {
        // Create milestone
        const docRef = doc(collection(db, COLLECTION));
        transaction.set(docRef, {
          ...milestone,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Update project progress
        const projectRef = doc(db, 'projects', milestone.projectId);
        transaction.update(projectRef, {
          updatedAt: serverTimestamp(),
          'metadata.lastMilestoneUpdate': serverTimestamp()
        });
      });
    } catch (error) {
      console.error('Error creating milestone:', error);
      throw error;
    }
  },

  // Update a milestone with transaction to update project progress
  async update(id: string, updates: Partial<Milestone>): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, id);
      await runTransaction(db, async (transaction) => {
        const milestoneDoc = await transaction.get(docRef);
        if (!milestoneDoc.exists()) {
          throw new Error('Milestone not found');
        }

        const milestone = { id: milestoneDoc.id, ...milestoneDoc.data() } as Milestone;

        transaction.update(docRef, {
          ...updates,
          updatedAt: serverTimestamp()
        });

        // Update project progress
        const projectRef = doc(db, 'projects', milestone.projectId);
        transaction.update(projectRef, {
          updatedAt: serverTimestamp(),
          'metadata.lastMilestoneUpdate': serverTimestamp()
        });
      });
    } catch (error) {
      console.error('Error updating milestone:', error);
      throw error;
    }
  },

  // Delete a milestone with transaction to update project progress
  async delete(id: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTION, id);
      await runTransaction(db, async (transaction) => {
        const milestoneDoc = await transaction.get(docRef);
        if (!milestoneDoc.exists()) {
          throw new Error('Milestone not found');
        }

        const milestone = { id: milestoneDoc.id, ...milestoneDoc.data() } as Milestone;

        transaction.delete(docRef);

        // Update project progress
        const projectRef = doc(db, 'projects', milestone.projectId);
        transaction.update(projectRef, {
          updatedAt: serverTimestamp(),
          'metadata.lastMilestoneUpdate': serverTimestamp()
        });
      });
    } catch (error) {
      console.error('Error deleting milestone:', error);
      throw error;
    }
  }
};