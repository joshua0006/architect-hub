import { Milestone } from '../types';

export function calculateMilestoneProgress(milestones: Milestone[]): number {
  if (!milestones || milestones.length === 0) return 0;

  // Calculate total weight (should sum to 100)
  const totalWeight = milestones.reduce((sum, milestone) => sum + milestone.weight, 0);
  
  // If total weight is 0, return 0 progress
  if (totalWeight === 0) return 0;

  let completedWeight = 0;
  
  // Calculate progress based on milestone status
  milestones.forEach(milestone => {
    // For completed milestones, add their full weight
    if (milestone.status === 'completed') {
      completedWeight += milestone.weight;
    } 
    // For in-progress milestones, add half of their weight
    else if (milestone.status === 'in-progress') {
      completedWeight += milestone.weight * 0.5;
    }
  });
  
  // Calculate percentage based on total weight
  const progressPercentage = completedWeight;
  
  return Math.min(100, Math.round(progressPercentage));
}