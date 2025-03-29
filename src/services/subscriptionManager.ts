import { projectService } from './projectService';
import { Project } from '../types';

// Reference to maintain the current unsubscribe function
export const unsubscribeRef = {
  current: null as (() => void) | null
};

// Setup project subscription
export const setupProjectSubscription = () => {
  // Clean up any existing subscription first
  if (unsubscribeRef.current) {
    unsubscribeRef.current();
    unsubscribeRef.current = null;
  }

  // Set up new subscription
  try {
    const unsubscribe = projectService.subscribeToAllProjects((updatedProjects) => {
      console.log("Projects updated:", updatedProjects);
      // You will broadcast this update to components that need it
      document.dispatchEvent(new CustomEvent('projectsUpdated', { 
        detail: { projects: updatedProjects } 
      }));
    });

    // Store the unsubscribe function
    unsubscribeRef.current = unsubscribe;
  } catch (err) {
    console.error("Error setting up project subscription:", err);
    // If subscription fails, fall back to non-realtime data
    // loadProjects();
  }
};

// Setup user-specific project subscription
export const setupUserProjectSubscription = (userId: string) => {
  // Clean up any existing subscription first
  if (unsubscribeRef.current) {
    unsubscribeRef.current();
    unsubscribeRef.current = null;
  }

  // Set up new subscription
  try {
    const unsubscribe = projectService.subscribeToUserProjects(userId, (updatedProjects) => {
      console.log("User projects updated:", updatedProjects);
      // You will broadcast this update to components that need it
      document.dispatchEvent(new CustomEvent('userProjectsUpdated', { 
        detail: { projects: updatedProjects } 
      }));
    });

    // Store the unsubscribe function
    unsubscribeRef.current = unsubscribe;
  } catch (err) {
    console.error("Error setting up user project subscription:", err);
    // If subscription fails, fall back to non-realtime data
    // loadUserProjects();
  }
};

// Export the cleanup function
export const cleanupProjectSubscription = () => {
  if (unsubscribeRef.current) {
    unsubscribeRef.current();
    unsubscribeRef.current = null;
  }
}; 