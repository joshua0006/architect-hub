// src/services/cloudFunctionService.ts

const FIREBASE_CF_URL = import.meta.env.VITE_FIREBASE_CF_URL;


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
   * Calls the createUser cloud function.
   * @param payload - The user data to send.
   * @returns A promise that resolves with the response from the cloud function.
   * @throws Will throw an error if the request fails or the server returns an error.
   */
  async createUser(payload: CreateUserDto): Promise<CreateUserResponse> {
    const url =  `${FIREBASE_CF_URL}/createUser`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Add any other necessary headers, e.g., Authorization token
        },
        body: JSON.stringify(payload),
      });

      // Try to parse the response as JSON, regardless of status for more detailed error messages
      let responseData: CreateUserResponse | ApiError;
      try {
        responseData = await response.json();
      } catch (jsonError) {
        // If JSON parsing fails, the response might be text or empty
        const textResponse = await response.text();
        throw new Error(
          `Failed to parse JSON response. Status: ${response.status}. Response: ${textResponse}`
        );
      }

      if (!response.ok) {
        // If responseData has a message property, use it, otherwise use a generic error
        const errorMessage = (responseData as ApiError)?.message || `HTTP error! Status: ${response.status}`;
        throw new Error(errorMessage);
      }

      return responseData as CreateUserResponse;
    } catch (error: any) {
      console.error('Error calling createUser cloud function:', error);
      // Re-throw the error so the calling component can handle it
      // You might want to transform the error into a more specific error type here
      throw new Error(error.message || 'An unexpected error occurred while creating the user.');
    }
  },

  // You can add other cloud function calls here, e.g.:
  // async getUser(userId: string) { /* ... */ },
  // async updateUser(userId: string, payload: Partial<CreateUserPayload>) { /* ... */ },
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
