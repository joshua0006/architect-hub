// src/services/cloudFunctionService.ts

import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { auth } from '../lib/firebase';


// Define an interface for the payload for better type safety
export interface CreateUserDto {
  displayName: string;
  email: string;
  role: string;
  password?: string; // Password might be optional or handled differently
}

// Define an interface for the expected successful response (adjust as needed)
interface CreateUserResponse {
  // Example: assuming the function returns the created user's ID or some status
  userId?: string;
  message?: string;
  // Add other properties based on your actual API response
  [key: string]: any; // Allow other properties if the response is dynamic
}

// Define an interface for API error responses
interface ApiError {
  message: string;
  // Add other potential error properties
  [key: string]: any;
}

export const cloudFunctionService = {
  /**
   * Calls the createUser cloud function using Firebase callable functions.
   * @param payload - The user data to send.
   * @returns A promise that resolves with the response from the cloud function.
   * @throws Will throw an error if the request fails or the server returns an error.
   */
  async createUser(payload: CreateUserDto): Promise<CreateUserResponse> {
    try {
      // Ensure user is authenticated
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Must be authenticated to create users');
      }

      // Use Firebase callable function
      const createUserFn = httpsCallable<
        CreateUserDto,
        { success: boolean; userId: string; email: string; message: string }
      >(functions, 'createUser');

      const result = await createUserFn(payload);

      return {
        userId: result.data.userId,
        message: result.data.message,
      };
    } catch (error: any) {
      console.error('Error calling createUser cloud function:', error);

      // Extract error message
      let errorMessage = 'An unexpected error occurred while creating the user.';

      if (error.code === 'unauthenticated') {
        errorMessage = 'You must be logged in to create users.';
      } else if (error.code === 'permission-denied') {
        errorMessage = 'Only administrators can create user accounts.';
      } else if (error.code === 'invalid-argument') {
        errorMessage = error.message || 'Invalid user data provided.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  },

  /**
   * Calls the deleteUser cloud function to delete a user from Firebase Auth and Firestore.
   * Only admins can delete users. Uses Firebase callable functions for security.
   * @param userId - The ID of the user to delete.
   * @returns A promise that resolves when the user is deleted.
   * @throws Will throw an error if the request fails, user is not authorized, or server returns an error.
   */
  async deleteUser(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Use Firebase callable function for better security and error handling
      const deleteUserFn = httpsCallable<
        { userId: string },
        { success: boolean; deletedUserId: string; message: string }
      >(functions, 'deleteUser');

      const result = await deleteUserFn({ userId });

      return {
        success: result.data.success,
        message: result.data.message,
      };
    } catch (error: any) {
      console.error('Error calling deleteUser cloud function:', error);

      // Extract error message from Firebase Functions error
      let errorMessage = 'An unexpected error occurred while deleting the user.';

      if (error.code === 'unauthenticated') {
        errorMessage = 'You must be logged in to delete users.';
      } else if (error.code === 'permission-denied') {
        errorMessage = 'Only administrators can delete user accounts.';
      } else if (error.code === 'failed-precondition') {
        errorMessage = 'You cannot delete your own account.';
      } else if (error.code === 'invalid-argument') {
        errorMessage = 'Invalid user ID provided.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  },
};

// Example of how to use this service in a component:
/*
import { cloudFunctionService } from './cloudFunctionService';

const handleCreateUser = async () => {
  try {
    const newUser = {
      first_name: "Nat-TEST",
      last_name: "Roman-TEST",
      email: "Nat-Roman-test@email.com",
      role: "Staff",
      password: "12345678"
    };
    const response = await cloudFunctionService.createUser(newUser);
    console.log('User created successfully:', response);
    // Handle success (e.g., show a success message, redirect)
  } catch (error: any) {
    console.error('Failed to create user:', error.message);
    // Handle error (e.g., show an error message to the user)
  }
};
*/
