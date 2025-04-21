/**
 * Utility functions for error handling throughout the application
 */

// Format error messages in a consistent way
export const formatErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unknown error occurred';
};

// Safe JSON parsing with error handling
export const safeJsonParse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return fallback;
  }
};

// Log errors consistently
export const logError = (
  message: string, 
  error: unknown, 
  additionalContext?: Record<string, unknown>
): void => {
  console.error(
    `[ERROR] ${message}:`, 
    error, 
    additionalContext ? additionalContext : ''
  );
};

// Safely attempt an operation with proper error handling
export const safelyExecute = async <T>(
  operation: () => Promise<T>,
  errorMessage: string,
  fallbackValue?: T
): Promise<T | undefined> => {
  try {
    return await operation();
  } catch (error) {
    logError(errorMessage, error);
    return fallbackValue;
  }
}; 