# Firebase HTTPS Functions Guide

This guide provides comprehensive steps for implementing, testing, and deploying Firebase HTTPS functions with your current Firebase SDK setup.

## Table of Contents

1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Setting Up Your Functions Directory](#setting-up-your-functions-directory)
4. [Creating Your First HTTPS Function](#creating-your-first-https-function)
5. [Calling HTTPS Functions from the Client](#calling-https-functions-from-the-client)
6. [Testing Functions Locally](#testing-functions-locally)
7. [Deploying Functions to Production](#deploying-functions-to-production)
8. [Security Considerations](#security-considerations)
9. [Advanced Patterns](#advanced-patterns)
10. [Troubleshooting](#troubleshooting)

## Introduction

Firebase HTTPS functions allow you to create serverless API endpoints that can be triggered via HTTP requests. These functions run in a secure, managed environment and can interact with other Firebase services like Firestore, Storage, and Authentication.

Key benefits:
- Serverless architecture (no server management)
- Automatic scaling
- Pay-per-use pricing model
- Seamless integration with other Firebase services
- Support for TypeScript

## Prerequisites

Before you begin, ensure you have:

1. Firebase CLI installed:
   ```bash
   npm install -g firebase-tools
   ```

2. Firebase project initialized:
   ```bash
   firebase login
   firebase init
   ```

3. Required dependencies in your functions directory:
   - firebase-admin (v13.3.0+)
   - firebase-functions (v6.3.2+)

## Setting Up Your Functions Directory

Your project already has a `functions` directory with basic setup. Let's enhance it with TypeScript support and proper structure:

1. Initialize TypeScript in your functions directory:

   ```bash
   cd functions
   npm install --save-dev typescript @types/node
   ```

2. Create a `tsconfig.json` file in the functions directory:

   ```json
   {
     "compilerOptions": {
       "module": "commonjs",
       "noImplicitReturns": true,
       "noUnusedLocals": true,
       "outDir": "lib",
       "sourceMap": true,
       "strict": true,
       "target": "es2017",
       "skipLibCheck": true
     },
     "compileOnSave": true,
     "include": [
       "src"
     ]
   }
   ```

3. Update your `package.json` scripts in the functions directory:

   ```json
   "scripts": {
     "build": "tsc",
     "serve": "npm run build && firebase emulators:start --only functions",
     "shell": "npm run build && firebase functions:shell",
     "start": "npm run shell",
     "deploy": "firebase deploy --only functions",
     "logs": "firebase functions:log"
   }
   ```

4. Create a proper directory structure:

   ```
   functions/
   ├── package.json
   ├── package-lock.json
   ├── tsconfig.json
   ├── src/
   │   ├── index.ts           # Main entry point
   │   ├── auth/              # Auth-related functions
   │   ├── storage/           # Storage-related functions
   │   ├── api/               # HTTPS API functions
   │   ├── utils/             # Utility functions
   │   └── config/            # Configuration files
   └── .gitignore
   ```

## Creating Your First HTTPS Function

Let's create a simple HTTPS function:

1. Create the main entry file at `functions/src/index.ts`:

   ```typescript
   import * as functions from 'firebase-functions';
   import * as admin from 'firebase-admin';

   // Initialize Firebase Admin SDK
   admin.initializeApp();

   // Export functions from other modules
   export * from './api/helloWorld';
   ```

2. Create a simple Hello World function in `functions/src/api/helloWorld.ts`:

   ```typescript
   import * as functions from 'firebase-functions';

   // Simple Hello World function
   export const helloWorld = functions.https.onRequest((request, response) => {
     response.set('Access-Control-Allow-Origin', '*');
     
     if (request.method === 'OPTIONS') {
       // Handle CORS preflight requests
       response.set('Access-Control-Allow-Methods', 'GET, POST');
       response.set('Access-Control-Allow-Headers', 'Content-Type');
       response.status(204).send('');
       return;
     }
     
     response.status(200).send({
       message: 'Hello from Firebase Functions!',
       timestamp: new Date().toISOString(),
       query: request.query,
       body: request.body
     });
   });
   ```

3. Create a more complex function that interacts with Firestore:

   ```typescript
   // functions/src/api/documents.ts
   import * as functions from 'firebase-functions';
   import * as admin from 'firebase-admin';

   // Get documents with optional filtering
   export const getDocuments = functions.https.onRequest(async (request, response) => {
     try {
       // Set CORS headers
       response.set('Access-Control-Allow-Origin', '*');
       
       if (request.method === 'OPTIONS') {
         // Handle CORS preflight requests
         response.set('Access-Control-Allow-Methods', 'GET');
         response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
         response.status(204).send('');
         return;
       }
       
       // Get query parameters
       const limit = request.query.limit ? parseInt(request.query.limit as string) : 10;
       const category = request.query.category as string | undefined;
       
       // Build query
       let query = admin.firestore().collection('documents');
       
       if (category) {
         query = query.where('category', '==', category);
       }
       
       // Execute query
       const snapshot = await query.limit(limit).get();
       
       // Format results
       const documents = snapshot.docs.map(doc => ({
         id: doc.id,
         ...doc.data()
       }));
       
       // Send response
       response.status(200).json({
         documents,
         count: documents.length
       });
     } catch (error) {
       console.error('Error fetching documents:', error);
       response.status(500).send({
         error: 'Internal server error',
         message: error instanceof Error ? error.message : 'Unknown error'
       });
     }
   });
   ```

4. Don't forget to export the new function in `index.ts`:

   ```typescript
   // Add to functions/src/index.ts
   export * from './api/documents';
   ```

## Calling HTTPS Functions from the Client

To call your HTTPS functions from your React application:

1. Create a dedicated service for API calls in `src/services/functionsService.ts`:

   ```typescript
   import { getFunctions, httpsCallable } from 'firebase/functions';
   import axios from 'axios';
   import app from '../lib/firebase';

   // Get the functions instance
   const functions = getFunctions(app);

   // Base URL for direct HTTP calls
   // In production: https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net
   // In development with emulator: http://localhost:5001/YOUR_PROJECT_ID/us-central1
   const getFunctionsBaseUrl = () => {
     const isEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';
     const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
     const region = 'us-central1'; // Change if using a different region
     
     return isEmulator
       ? `http://localhost:5001/${projectId}/${region}`
       : `https://${region}-${projectId}.cloudfunctions.net`;
   };

   // Method 1: Using the Firebase SDK (recommended for callable functions)
   export const callFunction = async (name: string, data: any) => {
     try {
       const functionRef = httpsCallable(functions, name);
       const result = await functionRef(data);
       return result.data;
     } catch (error) {
       console.error(`Error calling function ${name}:`, error);
       throw error;
     }
   };

   // Method 2: Using direct HTTP requests (for HTTP functions)
   export const callHttpFunction = async (endpoint: string, method = 'GET', data = null) => {
     try {
       const baseUrl = getFunctionsBaseUrl();
       const url = `${baseUrl}/${endpoint}`;
       
       const config = {
         method,
         url,
         data: method !== 'GET' ? data : undefined,
         params: method === 'GET' && data ? data : undefined,
         headers: {
           'Content-Type': 'application/json'
         }
       };
       
       const response = await axios(config);
       return response.data;
     } catch (error) {
       console.error(`Error calling HTTP function ${endpoint}:`, error);
       throw error;
     }
   };

   // Example specific function wrappers
   export const getDocuments = async (category?: string, limit?: number) => {
     return callHttpFunction('getDocuments', 'GET', { category, limit });
   };

   export const helloWorld = async () => {
     return callHttpFunction('helloWorld');
   };
   ```

2. Using the functions in your components:

   ```tsx
   import React, { useState, useEffect } from 'react';
   import { helloWorld, getDocuments } from '../services/functionsService';

   const DocumentList: React.FC = () => {
     const [message, setMessage] = useState<string>('');
     const [documents, setDocuments] = useState<any[]>([]);
     const [loading, setLoading] = useState<boolean>(true);
     const [error, setError] = useState<string | null>(null);

     useEffect(() => {
       // Call the Hello World function
       const fetchHello = async () => {
         try {
           const result = await helloWorld();
           setMessage(result.message);
         } catch (err) {
           setError('Failed to fetch hello message');
           console.error(err);
         }
       };

       // Call the getDocuments function
       const fetchDocuments = async () => {
         try {
           const result = await getDocuments('reports', 5);
           setDocuments(result.documents);
         } catch (err) {
           setError('Failed to fetch documents');
           console.error(err);
         } finally {
           setLoading(false);
         }
       };

       fetchHello();
       fetchDocuments();
     }, []);

     if (loading) return <div>Loading...</div>;
     if (error) return <div>Error: {error}</div>;

     return (
       <div>
         <h2>Function Response: {message}</h2>
         <h3>Documents:</h3>
         <ul>
           {documents.map(doc => (
             <li key={doc.id}>{doc.title}</li>
           ))}
         </ul>
       </div>
     );
   };

   export default DocumentList;
   ```

## Testing Functions Locally

To test your functions locally using the Firebase Emulator Suite:

1. Update your `firebase.json` file to include functions configuration:

   ```json
   {
     "functions": {
       "source": "functions",
       "predeploy": [
         "npm --prefix \"$RESOURCE_DIR\" run build"
       ]
     },
     "emulators": {
       "functions": {
         "port": 5001
       },
       "firestore": {
         "port": 8080
       },
       "auth": {
         "port": 9099
       },
       "storage": {
         "port": 9199
       },
       "ui": {
         "enabled": true
       }
     }
   }
   ```

2. Start the emulators:

   ```bash
   firebase emulators:start
   ```

3. Test your functions using:
   - The Firebase Emulator UI (http://localhost:4000)
   - Direct HTTP requests to http://localhost:5001/YOUR_PROJECT_ID/us-central1/functionName
   - Your React application with emulator mode enabled

4. For automated testing, create a test file in `functions/src/test/`:

   ```typescript
   // functions/src/test/api.test.ts
   import * as functions from 'firebase-functions-test';
   import * as assert from 'assert';
   
   const testEnv = functions();
   
   describe('API Functions', () => {
     after(() => {
       testEnv.cleanup();
     });
     
     it('should return hello world message', async () => {
       // Import the function after initializing test environment
       const { helloWorld } = require('../api/helloWorld');
       
       // Create a fake request and response
       const req = { method: 'GET', query: {}, body: {} };
       const res = {
         set: () => {},
         status: (code: number) => ({ send: (data: any) => data, json: (data: any) => data }),
       };
       
       // Call the function
       const result = await helloWorld(req, res);
       
       // Assert the result
       assert.strictEqual(result.message, 'Hello from Firebase Functions!');
     });
   });
   ```

## Deploying Functions to Production

When you're ready to deploy your functions to production:

1. Build your functions:

   ```bash
   cd functions
   npm run build
   ```

2. Deploy only the functions:

   ```bash
   firebase deploy --only functions
   ```

3. Deploy specific functions:

   ```bash
   firebase deploy --only functions:helloWorld,functions:getDocuments
   ```

4. After deployment, your functions will be available at:
   ```
   https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/functionName
   ```

## Security Considerations

1. **Authentication**: Secure your functions by requiring authentication:

   ```typescript
   import * as functions from 'firebase-functions';
   import * as admin from 'firebase-admin';

   export const secureFunction = functions.https.onRequest(async (request, response) => {
     // Set CORS headers
     response.set('Access-Control-Allow-Origin', '*');
     
     if (request.method === 'OPTIONS') {
       response.set('Access-Control-Allow-Methods', 'GET');
       response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
       response.status(204).send('');
       return;
     }
     
     // Get the authorization header
     const authHeader = request.headers.authorization;
     if (!authHeader || !authHeader.startsWith('Bearer ')) {
       response.status(401).send({ error: 'Unauthorized' });
       return;
     }
     
     // Extract the token
     const idToken = authHeader.split('Bearer ')[1];
     
     try {
       // Verify the token
       const decodedToken = await admin.auth().verifyIdToken(idToken);
       const uid = decodedToken.uid;
       
       // Proceed with the authenticated request
       // You can also check user claims for role-based access
       if (decodedToken.admin !== true) {
         response.status(403).send({ error: 'Forbidden' });
         return;
       }
       
       // Process the request
       response.status(200).send({
         message: 'Secure data',
         userId: uid
       });
     } catch (error) {
       console.error('Error verifying token:', error);
       response.status(401).send({ error: 'Invalid token' });
     }
   });
   ```

2. **Rate Limiting**: Implement rate limiting to prevent abuse:

   ```typescript
   import * as functions from 'firebase-functions';
   import * as admin from 'firebase-admin';

   // Simple rate limiting implementation
   const rateLimiter = async (ip: string, limit: number, period: number): Promise<boolean> => {
     const db = admin.firestore();
     const now = Date.now();
     const cutoff = now - period;
     
     // Reference to the rate limiter collection
     const ref = db.collection('rateLimits').doc(ip);
     
     // Run in transaction to ensure accuracy
     return db.runTransaction(async (transaction) => {
       const doc = await transaction.get(ref);
       const data = doc.exists ? doc.data() : { requests: [] };
       
       // Filter out old requests
       const requests = data.requests.filter((time: number) => time > cutoff);
       
       // Check if limit is reached
       if (requests.length >= limit) {
         return false;
       }
       
       // Add new request timestamp
       requests.push(now);
       
       // Update the document
       transaction.set(ref, { requests });
       
       return true;
     });
   };

   export const rateLimitedFunction = functions.https.onRequest(async (request, response) => {
     // Get client IP
     const ip = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
     
     // Check rate limit: 5 requests per minute
     const allowed = await rateLimiter(ip as string, 5, 60 * 1000);
     
     if (!allowed) {
       response.status(429).send({ error: 'Too many requests' });
       return;
     }
     
     // Process the request
     response.status(200).send({ message: 'Success' });
   });
   ```

3. **Data Validation**: Always validate input data:

   ```typescript
   import * as functions from 'firebase-functions';
   import * as admin from 'firebase-admin';

   export const createDocument = functions.https.onRequest(async (request, response) => {
     // Set CORS headers
     response.set('Access-Control-Allow-Origin', '*');
     
     if (request.method === 'OPTIONS') {
       response.set('Access-Control-Allow-Methods', 'POST');
       response.set('Access-Control-Allow-Headers', 'Content-Type');
       response.status(204).send('');
       return;
     }
     
     // Check method
     if (request.method !== 'POST') {
       response.status(405).send({ error: 'Method not allowed' });
       return;
     }
     
     // Validate required fields
     const { title, content, category } = request.body;
     
     if (!title || typeof title !== 'string') {
       response.status(400).send({ error: 'Title is required and must be a string' });
       return;
     }
     
     if (!content || typeof content !== 'string') {
       response.status(400).send({ error: 'Content is required and must be a string' });
       return;
     }
     
     if (!category || typeof category !== 'string') {
       response.status(400).send({ error: 'Category is required and must be a string' });
       return;
     }
     
     // Validate string lengths
     if (title.length > 100) {
       response.status(400).send({ error: 'Title must be less than 100 characters' });
       return;
     }
     
     // Process valid data
     try {
       const docRef = await admin.firestore().collection('documents').add({
         title,
         content,
         category,
         createdAt: admin.firestore.FieldValue.serverTimestamp()
       });
       
       response.status(201).send({
         id: docRef.id,
         message: 'Document created successfully'
       });
     } catch (error) {
       console.error('Error creating document:', error);
       response.status(500).send({ error: 'Failed to create document' });
     }
   });
   ```

## Advanced Patterns

### 1. Using Callable Functions

Callable functions provide a more seamless experience with automatic authentication and data validation:

```typescript
// functions/src/api/callableFunctions.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Callable function example
export const processDocument = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }
  
  // Validate data
  if (!data.documentId || typeof data.documentId !== 'string') {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The function must be called with a valid documentId.'
    );
  }
  
  try {
    // Get the document
    const docRef = admin.firestore().collection('documents').doc(data.documentId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'The requested document does not exist.'
      );
    }
    
    // Check permissions
    const docData = doc.data();
    if (docData?.ownerId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You do not have permission to process this document.'
      );
    }
    
    // Process the document
    await docRef.update({
      processed: true,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: context.auth.uid
    });
    
    // Return success
    return {
      success: true,
      message: 'Document processed successfully'
    };
  } catch (error) {
    console.error('Error processing document:', error);
    
    // If it's already an HttpsError, rethrow it
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    // Otherwise, wrap it in an HttpsError
    throw new functions.https.HttpsError(
      'internal',
      'An error occurred while processing the document.',
      error
    );
  }
});
```

Calling a callable function from the client:

```typescript
// In your functionsService.ts
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../lib/firebase';

const functions = getFunctions(app);

export const processDocument = async (documentId: string) => {
  try {
    const processDocumentFunction = httpsCallable(functions, 'processDocument');
    const result = await processDocumentFunction({ documentId });
    return result.data;
  } catch (error) {
    console.error('Error processing document:', error);
    throw error;
  }
};
```

### 2. Function Chaining

You can chain functions together for complex workflows:

```typescript
// functions/src/api/documentWorkflow.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Function to process a document when it's created
export const onDocumentCreated = functions.firestore
  .document('documents/{documentId}')
  .onCreate(async (snapshot, context) => {
    const documentId = context.params.documentId;
    const documentData = snapshot.data();
    
    // Call another function via HTTP
    const projectId = process.env.GCLOUD_PROJECT;
    const region = 'us-central1';
    const baseUrl = `https://${region}-${projectId}.cloudfunctions.net`;
    
    // Use the Firebase Admin SDK to make authenticated function calls
    const metadata = {
      service: 'firebase-functions-internal',
    };
    
    try {
      // Call the analyze function
      await admin.functions().taskQueue('analyzeDocument')
        .enqueue({ documentId }, { scheduleDelaySeconds: 10 });
      
      // Update the document status
      await snapshot.ref.update({
        status: 'processing',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error in document workflow:', error);
      
      // Update document with error status
      await snapshot.ref.update({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return { success: false, error };
    }
  });

// Function to analyze a document (can be called directly or via queue)
export const analyzeDocument = functions.tasks
  .taskQueue()
  .onDispatch(async (data) => {
    const { documentId } = data;
    
    try {
      // Get the document
      const docRef = admin.firestore().collection('documents').doc(documentId);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new Error('Document not found');
      }
      
      const documentData = doc.data();
      
      // Perform analysis (example)
      const wordCount = documentData?.content?.split(/\s+/).length || 0;
      const sentiment = analyzeSentiment(documentData?.content);
      
      // Update the document with analysis results
      await docRef.update({
        analysis: {
          wordCount,
          sentiment,
          completedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        status: 'analyzed'
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error analyzing document:', error);
      
      // Update document with error status if possible
      if (documentId) {
        await admin.firestore().collection('documents').doc(documentId).update({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      throw error; // Rethrow to mark the task as failed
    }
  });

// Helper function for sentiment analysis (simplified example)
function analyzeSentiment(text: string = ''): string {
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful'];
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'poor'];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  const words = text.toLowerCase().split(/\W+/);
  
  for (const word of words) {
    if (positiveWords.includes(word)) positiveCount++;
    if (negativeWords.includes(word)) negativeCount++;
  }
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}
```

## Troubleshooting

### Common Issues and Solutions

1. **CORS Errors**

   If you're getting CORS errors when calling your functions from the browser:

   ```typescript
   // Add this to the beginning of your function
   response.set('Access-Control-Allow-Origin', '*');
   
   if (request.method === 'OPTIONS') {
     response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
     response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
     response.status(204).send('');
     return;
   }
   ```

   For production, replace '*' with your specific domain.

2. **Function Deployment Failures**

   If your function deployment fails:

   - Check for syntax errors in your code
   - Ensure your dependencies are correctly listed in package.json
   - Check that you're not exceeding the maximum deployment size (1MB for the free plan)
   - Verify you have the correct permissions in your Firebase project

3. **Function Execution Timeouts**

   If your functions are timing out:

   - The default timeout is 60 seconds for the Blaze plan (1st gen) or 540 seconds (2nd gen)
   - Optimize your code to complete within the time limit
   - Consider breaking long-running tasks into smaller chunks
   - Use background functions or Cloud Tasks for longer operations

4. **Memory Limits**

   If your functions are running out of memory:

   - The default memory allocation is 256MB (1st gen) or 512MB (2nd gen)
   - Optimize your code to use less memory
   - Upgrade to a higher memory configuration if needed

5. **Cold Start Latency**

   To reduce cold start latency:

   - Keep your dependencies minimal
   - Use the Node.js 18 runtime or later
   - Consider using scheduled functions to keep instances warm
   - Split large functions into smaller, more focused ones

### Debugging Tips

1. **Local Debugging**

   Debug functions locally using the Firebase Emulator Suite:

   ```bash
   firebase emulators:start
   ```

   You can view logs and function execution in the Emulator UI.

2. **Cloud Logging**

   View logs in the Firebase Console or using the CLI:

   ```bash
   firebase functions:log
   ```

3. **Adding Detailed Logs**

   Add structured logging to your functions:

   ```typescript
   functions.logger.info('Processing document', {
     documentId: id,
     processingTime: Date.now() - startTime,
     userId: context.auth?.uid
   });
   ```

4. **Testing with Postman**

   Use Postman to test your HTTP functions with different methods, headers, and body content.

5. **Error Handling Best Practices**

   Implement proper error handling:

   ```typescript
   try {
     // Function logic
   } catch (error) {
     functions.logger.error('Function failed', {
       error: error instanceof Error ? error.message : 'Unknown error',
       stack: error instanceof Error ? error.stack : undefined
     });
     
     // For HTTP functions
     response.status(500).send({
       error: 'Internal server error',
       message: error instanceof Error ? error.message : 'Unknown error'
     });
     
     // For callable functions
     throw new functions.https.HttpsError(
       'internal',
       'An error occurred while processing the request',
       error
     );
   }
   ```

---

This guide provides a comprehensive overview of implementing, testing, and deploying Firebase HTTPS functions with your current Firebase SDK. For more detailed information, refer to the [official Firebase documentation](https://firebase.google.com/docs/functions).