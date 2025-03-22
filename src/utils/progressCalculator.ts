import { Milestone } from '../types';

export function calculateMilestoneProgress(milestones: Milestone[]): number {
  if (!milestones || milestones.length === 0) return 0;

  // Calculate total weight (should sum to 100)
  const totalWeight = milestones.reduce((sum, milestone) => sum + milestone.weight, 0);
  
  // If total weight is not 100, normalize the weights
  const normalizer = totalWeight > 0 ? (100 / totalWeight) : 1;

  const completedWeight = milestones.reduce((sum, milestone) => {
    const normalizedWeight = milestone.weight * normalizer;
    
    switch (milestone.status) {
      case 'completed':
        return sum + normalizedWeight;
      case 'in-progress':
        return sum + (normalizedWeight * 0.5); // 50% progress for in-progress
      default:
        return sum;
    }
  }, 0);

  return Math.min(100, Math.round(completedWeight));
}