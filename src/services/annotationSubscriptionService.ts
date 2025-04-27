import { annotationService } from './annotationService';
import { Annotation } from '../types/annotation';

// Reference to the current unsubscribe function
const unsubscribeRef = {
  current: null as null | (() => void),
};

/**
 * Sets up a real-time subscription to annotations for a specific document
 * @param documentId The document ID to subscribe to
 * @param callback Function to call when annotations are updated
 * @returns A function to clean up the subscription
 */
export const setupAnnotationSubscription = (
  documentId: string,
  callback: (annotations: Annotation[]) => void
): (() => void) => {
  // Clean up any existing subscription first
  if (unsubscribeRef.current) {
    unsubscribeRef.current();
    unsubscribeRef.current = null;
  }

  // Set up new subscription
  try {
    const unsubscribe = annotationService.subscribeToAnnotations(documentId, (updatedAnnotations) => {
      console.log(`Received annotation update for document ${documentId} with ${updatedAnnotations.length} annotations`);
      callback(updatedAnnotations);
    });
    
    // Store the unsubscribe function for later cleanup
    unsubscribeRef.current = unsubscribe;
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  } catch (err) {
    console.error('Error setting up annotation subscription:', err);
    // If subscription fails, fall back to non-realtime data
    return () => {};
  }
}; 