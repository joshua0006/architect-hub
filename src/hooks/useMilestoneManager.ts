import { useState, useEffect, useCallback } from 'react';
import { Milestone } from '../types';
import { milestoneService } from '../services/milestoneService';
import { onSnapshot, query, where, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useMilestoneManager(projectId: string) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Subscribe to real-time milestone updates
  useEffect(() => {
    if (!projectId) {
      setMilestones([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'milestones'),
      where('projectId', '==', projectId)
    );

    // Set up real-time listener
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const updatedMilestones = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Milestone));
        
        // Sort by order field if available, otherwise keep the default order
        const sortedMilestones = updatedMilestones.sort((a, b) => {
          if (a.order !== undefined && b.order !== undefined) {
            return a.order - b.order;
          }
          return 0;
        });
        
        setMilestones(sortedMilestones);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error in milestone subscription:', err);
        setError(err instanceof Error ? err : new Error('Failed to load milestones'));
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount or projectId change
    return () => unsubscribe();
  }, [projectId]);

  const createMilestone = useCallback(async (
    title: string,
    description: string,
    dueDate: string,
    weight: number
  ) => {
    try {
      if (weight < 1 || weight > 100) {
        throw new Error('Weight must be between 1 and 100');
      }

      const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0) + weight;
      if (totalWeight > 100) {
        throw new Error('Total milestone weights cannot exceed 100%');
      }

      // Set order to be the highest existing order + 1, or 0 if no milestones exist
      const highestOrder = milestones.length > 0 
        ? Math.max(...milestones.map(m => m.order !== undefined ? m.order : 0))
        : -1;

      await milestoneService.create({
        projectId,
        title,
        description,
        dueDate,
        weight,
        status: 'pending',
        order: highestOrder + 1
      });
    } catch (err) {
      console.error('Error creating milestone:', err);
      throw err;
    }
  }, [projectId, milestones]);

  const updateMilestone = useCallback(async (
    id: string,
    updates: Partial<Omit<Milestone, 'id' | 'projectId'>>
  ) => {
    try {
      if (updates.weight !== undefined) {
        const currentMilestone = milestones.find(m => m.id === id);
        if (!currentMilestone) {
          throw new Error('Milestone not found');
        }

        const otherMilestonesWeight = milestones
          .filter(m => m.id !== id)
          .reduce((sum, m) => sum + m.weight, 0);

        const newTotalWeight = otherMilestonesWeight + updates.weight;
        if (newTotalWeight > 100) {
          throw new Error('Total milestone weights cannot exceed 100%');
        }
      }

      await milestoneService.update(id, updates);
    } catch (err) {
      console.error('Error updating milestone:', err);
      throw err;
    }
  }, [milestones]);

  const deleteMilestone = useCallback(async (id: string) => {
    try {
      await milestoneService.delete(id);
    } catch (err) {
      console.error('Error deleting milestone:', err);
      throw err;
    }
  }, []);

  // New function to handle reordering of milestones
  const reorderMilestones = useCallback(async (reorderedMilestones: Milestone[]) => {
    try {
      // Create an array of promises for batch updating
      const updatePromises = reorderedMilestones.map((milestone, index) => {
        return milestoneService.update(milestone.id, { order: index });
      });

      // Execute all updates in parallel
      await Promise.all(updatePromises);
    } catch (err) {
      console.error('Error reordering milestones:', err);
      throw err;
    }
  }, []);

  return {
    milestones,
    loading,
    error,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    reorderMilestones
  };
}