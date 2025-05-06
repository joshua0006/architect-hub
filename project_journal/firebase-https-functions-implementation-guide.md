# Firebase HTTPS Functions Implementation Guide

This step-by-step guide shows you how to implement Firebase HTTPS functions in a new project from scratch, with practical examples and best practices.

## Table of Contents

1. [Project Setup](#project-setup)
2. [Creating Your First HTTPS Function](#creating-your-first-https-function)
3. [Testing Your Function Locally](#testing-your-function-locally)
4. [Deploying Your Function](#deploying-your-function)
5. [Calling Your Function from a Client](#calling-your-function-from-a-client)
6. [Real-World Examples](#real-world-examples)
7. [Best Practices](#best-practices)

## Project Setup

### 1. Create a new Firebase project

```bash
# Create a new directory for your project
mkdir my-firebase-functions-project
cd my-firebase-functions-project

# Initialize a new npm project
npm init -y

# Install Firebase CLI globally if you haven't already
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init
```

During the Firebase initialization:
- Select "Functions" when prompted for features
- Choose to create a new Firebase project or use an existing one
- Select JavaScript or TypeScript (recommended)
- Say yes to ESLint
- Say yes to installing dependencies

### 2. Understand the generated project structure

After initialization, your project structure should look like this:

```
my-firebase-functions-project/
├── .firebaserc                # Links your project to your Firebase project
├── .gitignore
├── firebase.json              # Firebase configuration
├── functions/                 # This is where your functions code lives
│   ├── node_modules/
│   ├── package.json           # Functions dependencies
│   ├── package-lock.json
│   ├── tsconfig.json          # TypeScript configuration (if using TypeScript)
│   ├── src/                   # Source code directory
│   │   └── index.ts           # Main entry point for your functions
│   └── .eslintrc.js           # ESLint configuration
└── README.md
```

### 3. Set up environment variables (optional)

For sensitive information like API keys, create a `.env` file in the functions directory:

```bash
cd functions
touch .env
```

Add your environment variables:

```
## Creating Your First HTTPS Function

### 1. Basic Hello World function

Open `functions/src/index.ts` and replace its contents with:

```typescript
import * as functions from 'firebase-functions';

// Hello World HTTP function
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

### 2. Function with request parameters

Add a new function that accepts parameters:

```typescript
// Function that accepts parameters
export const greet = functions.https.onRequest((request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  
  if (request.method === 'OPTIONS') {
    response.set('Access-Control-Allow-Methods', 'GET, POST');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.status(204).send('');
    return;
  }
  
  // Get name from query parameters or body
  const name = request.query.name || request.body.name || 'Anonymous';
  
  response.status(200).send({
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString()
  });
});
```

### 3. Function with Firestore integration

First, initialize Firebase Admin SDK at the top of your `index.ts` file:

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
admin.initializeApp();
```

Then add a function that interacts with Firestore:

```typescript
// Function that interacts with Firestore
export const saveMessage = functions.https.onRequest(async (request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  
  if (request.method === 'OPTIONS') {
    response.set('Access-Control-Allow-Methods', 'POST');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.status(204).send('');
    return;
  }
  
  // Check if it's a POST request
  if (request.method !== 'POST') {
    response.status(405).send({ error: 'Method not allowed' });
    return;
  }
  
  // Get message from request body
  const { message } = request.body;
  
  if (!message || typeof message !== 'string') {
    response.status(400).send({ error: 'Message is required and must be a string' });
    return;
  }
  
  try {
    // Save message to Firestore
    const docRef = await admin.firestore().collection('messages').add({
      text: message,
## Testing Your Function Locally

### 1. Start the Firebase emulators

```bash
cd functions
npm run serve
```

This will start the Firebase emulators, including the Functions emulator.

### 2. Test your function using a browser or API client

Once the emulators are running, you can test your functions at:

- `http://localhost:5001/YOUR_PROJECT_ID/us-central1/helloWorld`
- `http://localhost:5001/YOUR_PROJECT_ID/us-central1/greet?name=John`

For POST requests, use a tool like Postman or curl:

```bash
curl -X POST \
  http://localhost:5001/YOUR_PROJECT_ID/us-central1/saveMessage \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hello from curl!"}'
```

### 3. View logs and debug

The Firebase emulator UI is available at `http://localhost:4000`. You can view function logs, execution details, and more.

## Deploying Your Function

### 1. Deploy to Firebase

```bash
firebase deploy --only functions
```

Or deploy specific functions:

```bash
firebase deploy --only functions:helloWorld,functions:greet
```

### 2. View your deployed functions

After deployment, your functions will be available at:

```
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/helloWorld
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/greet
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/saveMessage
```

You can find these URLs in the Firebase console under Functions.

## Calling Your Function from a Client

### 1. Set up a web client

Create a simple HTML file with JavaScript to call your functions:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Firebase Functions Demo</title>
</head>
<body>
  <h1>Firebase Functions Demo</h1>
  
  <div>
    <h2>Hello World Function</h2>
    <button id="callHelloWorld">Call Hello World</button>
    <pre id="helloWorldResult"></pre>
  </div>
  
  <div>
    <h2>Greet Function</h2>
    <input type="text" id="nameInput" placeholder="Enter your name">
    <button id="callGreet">Call Greet</button>
    <pre id="greetResult"></pre>
  </div>
  
  <div>
    <h2>Save Message Function</h2>
    <textarea id="messageInput" placeholder="Enter a message"></textarea>
    <button id="callSaveMessage">Save Message</button>
    <pre id="saveMessageResult"></pre>
  </div>

  <script type="module">
    // Import the functions you need from the SDKs you need
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
    import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
    
    // Your web app's Firebase configuration
    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT_ID.appspot.com",
      messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
      appId: "YOUR_APP_ID"
    };
    
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const functions = getFunctions(app);
    
    // Uncomment this line to use the local emulator
    // connectFunctionsEmulator(functions, "localhost", 5001);
    
    // Function to make a direct HTTP request
    async function callHttpFunction(url, method = 'GET', data = null) {
      try {
        const options = {
          method,
          headers: {
            'Content-Type': 'application/json'
          },
          body: method !== 'GET' && data ? JSON.stringify(data) : undefined
        };
        
        // For GET requests with query parameters
        if (method === 'GET' && data) {
          const params = new URLSearchParams();
          for (const key in data) {
            params.append(key, data[key]);
          }
          url = `${url}?${params.toString()}`;
        }
        
        const response = await fetch(url, options);
        return await response.json();
      } catch (error) {
        console.error('Error calling function:', error);
        throw error;
      }
    }
    
    // Set up event listeners
    document.getElementById('callHelloWorld').addEventListener('click', async () => {
      try {
        const result = await callHttpFunction('https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/helloWorld');
        document.getElementById('helloWorldResult').textContent = JSON.stringify(result, null, 2);
      } catch (error) {
        document.getElementById('helloWorldResult').textContent = `Error: ${error.message}`;
      }
    });
    
    document.getElementById('callGreet').addEventListener('click', async () => {
      try {
        const name = document.getElementById('nameInput').value || 'Anonymous';
        const result = await callHttpFunction('https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/greet', 'GET', { name });
        document.getElementById('greetResult').textContent = JSON.stringify(result, null, 2);
      } catch (error) {
        document.getElementById('greetResult').textContent = `Error: ${error.message}`;
      }
    });
    
    document.getElementById('callSaveMessage').addEventListener('click', async () => {
      try {
        const message = document.getElementById('messageInput').value;
        if (!message) {
          alert('Please enter a message');
          return;
        }
        
        const result = await callHttpFunction(
          'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/saveMessage',
          'POST',
          { message }
        );
        document.getElementById('saveMessageResult').textContent = JSON.stringify(result, null, 2);
      } catch (error) {
        document.getElementById('saveMessageResult').textContent = `Error: ${error.message}`;
      }
    });
  </script>
</body>
</html>
```

### 2. Using the Firebase SDK in a React application

For a React application, you would typically use the Firebase SDK:

```jsx
// src/services/firebase.js
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

// For local development with emulators
if (process.env.NODE_ENV === 'development') {
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

export { app, functions };
```

```jsx
// src/services/functionsService.js
import { functions } from './firebase';
import { httpsCallable } from 'firebase/functions';
import axios from 'axios';

// Method 1: Using the Firebase SDK for callable functions
export const callFunction = async (name, data) => {
  try {
    const functionRef = httpsCallable(functions, name);
    const result = await functionRef(data);
    return result.data;
  } catch (error) {
    console.error(`Error calling function ${name}:`, error);
    throw error;
  }
};

// Method 2: Using direct HTTP requests for HTTP functions
export const callHttpFunction = async (endpoint, method = 'GET', data = null) => {
  try {
    const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
    const region = 'us-central1';
    const baseUrl = `https://${region}-${projectId}.cloudfunctions.net`;
    const url = `${baseUrl}/${endpoint}`;
    
    const config = {
      method,function is_prime(int $n  {
        if ($num <= 1> return false;
=          if ($ )
        )
      })3      url,
      if ($num % 2 === 0 || ret) 
      data: method !== 'GET' ? 
    d
    
    $i = 5;
    while($i $i*---ata : undefined,
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
export const getGreeting = async (name) => {
  return callHttpFunction('greet', 'GET', { name });
};

export const saveMessage = async (message) => {
  return callHttpFunction('saveMessage', 'POST', { message });
};
```

```jsx
// src/components/FunctionsDemo.jsx
import React, { useState } from 'react';
import { getGreeting, saveMessage } from '../services/functionsService';

const FunctionsDemo = () => {head
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGreet = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getGreeting(name || 'Anonymous');
      setGreetingResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMessage = async () => {
    if (!message) {
      setError('Please enter a message');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const result = await saveMessage(message);
      setSaveResult(result);
      setMessage(''); // Clear the input
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Firebase Functions Demo</h1>
      
      {error && <div style={{ color: 'red' }}>{error}</div>}
      
      <div>
        <h2>Greet Function</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
        />
        <button onClick={handleGreet} disabled={loading}>
          {loading ? 'Loading...' : 'Get Greeting'}
        </button>
        {greetingResult && (
          <pre>{JSON.stringify(greetingResult, null, 2)}</pre>
        )}
## Real-World Examples

### 1. User Registration with Custom Claims

```typescript
// functions/src/auth/userManagement.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
function is_prime(int $n   {
  if ($num <= 1> return f=alse;
    if ($ )create matrix matix for r rows row for row fill value matrix[ return matirix]
  )3})
if ($num % 2 === 0 || ret) 
// Set custom claims when
//  
// 
// $i = 5;
// while($i $i*---a new user is created
export const processNewUser = functions.auth.user().onCreate(async (user) => {
  try {
    // Set default custom claims
    const customClaims = {
      role: 'user',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Set custom claims for the user
    await admin.auth().setCustomUserClaims(user.uid, customClaims);
    
    // Create a user document in Firestore
    await admin.firestore().collection('users').doc(user.uid).set({
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: 'user',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error processing new user:', error);
    return { success: false, error };
  }
});

// HTTP function to update user role (admin only)
export const updateUserRole = functions.https.onRequest(async (request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  
  if (request.method === 'OPTIONS') {
    response.set('Access-Control-Allow-Methods', 'POST');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.status(204).send('');
    return;
  }
  
  // Check if it's a POST request
  if (request.method !== 'POST') {
    response.status(405).send({ error: 'Method not allowed' });
    return;
  }
  
  // Verify authentication
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    response.status(401).send({ error: 'Unauthorized' });
    return;
  }
  
  try {
    // Extract and verify the token
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Check if the user is an admin
    if (decodedToken.role !== 'admin') {
      response.status(403).send({ error: 'Forbidden: Admin access required' });
      return;
    }
    
    // Get parameters from request body
    const { userId, role } = request.body;
    
    if (!userId || typeof userId !== 'string') {
      response.status(400).send({ error: 'userId is required and must be a string' });
      return;
    }
    
    if (!role || typeof role !== 'string' || !['user', 'editor', 'admin'].includes(role)) {
      response.status(400).send({ error: 'role is required and must be one of: user, editor, admin' });
      return;
    }
    
    // Update the user's custom claims
    await admin.auth().setCustomUserClaims(userId, { role });
    
    // Update the user document in Firestore
    await admin.firestore().collection('users').doc(userId).update({
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    response.status(200).send({
      success: true,
      message: `User ${userId} role updated to ${role}`
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    response.status(500).send({
      error: 'Failed to update user role',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

### 2. Image Processing Function

```typescript
// functions/src/storage/imageProcessing.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as sharp from 'sharp';

// Install sharp: npm install sharp

// Process images when uploaded to Storage
export const processImage = functions.storage.object().onFinalize(async (object) => {
  // File details
  const filePath = object.name;
  const contentType = object.contentType;
  
  // Exit if this is not an image
  if (!filePath || !contentType || !contentType.startsWith('image/')) {
    console.log('Not an image, exiting function');
    return null;
  }
  
  // Exit if this is already a thumbnail
  if (filePath.includes('thumbnails/')) {
    console.log('Already a thumbnail, exiting function');
    return null;
  }
  
  // Get file name and create thumbnail path
  const fileName = path.basename(filePath);
  const bucket = admin.storage().bucket(object.bucket);
  const workingDir = path.join(os.tmpdir(), 'thumbnails');
  const tempFilePath = path.join(workingDir, fileName);
  
  // Create the temp directory if it doesn't exist
  if (!fs.existsSync(workingDir)) {
    fs.mkdirSync(workingDir);
  }
  
  // Download file from bucket
  try {
    await bucket.file(filePath).download({ destination: tempFilePath });
    console.log('Image downloaded locally to', tempFilePath);
    
    // Generate a thumbnail using Sharp
    const thumbnailPath = path.join(workingDir, `thumb_${fileName}`);
    await sharp(tempFilePath)
      .resize(200, 200, { fit: 'inside', withoutEnlargement: true })
      .toFile(thumbnailPath);
    
    console.log('Thumbnail created at', thumbnailPath);
    
    // Upload the thumbnail to the bucket
    const thumbFileName = `thumbnails/thumb_${fileName}`;
    await bucket.upload(thumbnailPath, {
      destination: thumbFileName,
      metadata: {
        contentType: contentType,
        metadata: {
          firebaseStorageDownloadTokens: object.metadata?.firebaseStorageDownloadTokens,
        }
      }
    });
    
    console.log('Thumbnail uploaded to Storage');
    
    // Update the Firestore document if applicable
    // This assumes you have a 'images' collection with documents containing the image path
    const imagesRef = admin.firestore().collection('images');
    const snapshot = await imagesRef.where('path', '==', filePath).get();
    
    if (!snapshot.empty) {
      const docId = snapshot.docs[0].id;
      await imagesRef.doc(docId).update({
        thumbnailPath: thumbFileName,
        processed: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('Firestore document updated with thumbnail path');
    }
    
    // Clean up the temp directory
    fs.unlinkSync(tempFilePath);
    fs.unlinkSync(thumbnailPath);
    
    return { success: true, thumbnailPath: thumbFileName };
  } catch (error) {
    console.error('Error processing image:', error);
    return { success: false, error };
  }
});
```

### 3. Scheduled Database Cleanup

```typescript
// functions/src/scheduled/cleanup.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Run daily at midnight
export const dailyCleanup = functions.pubsub.schedule('0 0 * * *')
  .timeZone('America/New_York') // Set your timezone
  .onRun(async (context) => {
    try {
      const now = admin.firestore.Timestamp.now();
      const thirtyDaysAgo = new Date(now.toMillis() - 30 * 24 * 60 * 60 * 1000);
      
      // Delete temporary messages older than 30 days
      const tempMessagesRef = admin.firestore().collection('temporaryMessages');
      const oldMessagesSnapshot = await tempMessagesRef
        .where('createdAt', '<', thirtyDaysAgo)
        .get();
      
      // Batch delete old messages
      const batch = admin.firestore().batch();
      oldMessagesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`Deleted ${oldMessagesSnapshot.size} old temporary messages`);
      
      // Delete unused storage files
      // This is a simplified example - in practice, you'd need to list files and check references
      const bucket = admin.storage().bucket();
      const [files] = await bucket.getFiles({ prefix: 'temp/' });
      
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const createdTime = new Date(metadata.timeCreated);
        
        if (createdTime < thirtyDaysAgo) {
          await file.delete();
          console.log(`Deleted old file: ${file.name}`);
        }
      }
      
      return { success: true, messagesDeleted: oldMessagesSnapshot.size };
    } catch (error) {
      console.error('Error in daily cleanup:', error);
      return { success: false, error };
    }
  });
```

## Best Practices

### 1. Function Organization

Organize your functions by domain or feature:

```
functions/
├── src/
│   ├── index.ts           # Main entry point that exports all functions
│   ├── auth/              # Authentication-related functions
│   │   ├── userManagement.ts
│   │   └── verification.ts
│   ├── api/               # API/HTTP functions
│   │   ├── documents.ts
│   │   └── users.ts
│   ├── triggers/          # Database/Firestore trigger functions
│   │   ├── documentChanges.ts
│   │   └── userChanges.ts
│   ├── storage/           # Storage-related functions
│   │   └── imageProcessing.ts
│   ├── scheduled/         # Scheduled/cron functions
│   │   └── cleanup.ts
│   └── utils/             # Shared utility functions
│       ├── validation.ts
│       └── formatting.ts
```

### 2. Error Handling

Implement proper error handling in all functions:

```typescript
try {
  // Function logic
} catch (error) {
  console.error('Function failed:', error);
  
  // For HTTP functions
  response.status(500).send({
    error: 'Internal server error',
    message: error instanceof Error ? error.message : 'Unknown error'
  });
  
  // For background functions, you might want to log to a monitoring service
  // or update a status document in Firestore
}
```

### 3. Security

Always implement proper authentication and authorization:

```typescript
// Check authentication
const authHeader = request.headers.authorization;
if (!authHeader || !authHeader.startsWith('Bearer ')) {
  response.status(401).send({ error: 'Unauthorized' });
  return;
}

// Verify token
try {
  const idToken = authHeader.split('Bearer ')[1];
  const decodedToken = await admin.auth().verifyIdToken(idToken);
  const uid = decodedToken.uid;
  
  // Check authorization (role-based)
  if (decodedToken.role !== 'admin') {
    response.status(403).send({ error: 'Forbidden' });
    return;
  }
  
  // Proceed with the authenticated and authorized request
} catch (error) {
  response.status(401).send({ error: 'Invalid token' });
}
```

### 4. Performance Optimization

Optimize your functions for better performance:

- Keep dependencies minimal
- Use lazy loading for heavy dependencies
- Reuse database connections
- Implement caching where appropriate
- Use batched operations for Firestore
- Set appropriate memory and timeout configurations

### 5. Testing

Write tests for your functions:

```typescript
// functions/src/tests/api.test.ts
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

### 6. Monitoring and Logging

Implement proper monitoring and structured logging:

```typescript
// Structured logging
functions.logger.info('Processing document', {
  documentId: id,
  processingTime: Date.now() - startTime,
  userId: context.auth?.uid
});

// Error logging
functions.logger.error('Function failed', {
  error: error instanceof Error ? error.message : 'Unknown error',
  stack: error instanceof Error ? error.stack : undefined,
  functionName: 'processDocument',
  params: { documentId }
});
```

### 7. Environment Configuration

Use environment configuration for different environments:

```typescript
// functions/.env.development
API_URL=http://localhost:8080
DEBUG=true

// functions/.env.production
API_URL=https://api.example.com
DEBUG=false

// functions/src/config/index.ts
import * as functions from 'firebase-functions';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({
  path: `.env.${process.env.NODE_ENV || 'development'}`
});

// Configuration object
export const config = {
  apiUrl: process.env.API_URL || functions.config().api?.url || 'https://default-api.example.com',
  debug: process.env.DEBUG === 'true' || functions.config().app?.debug === 'true' || false,
  // Add other configuration values here
};
```

---

This guide provides a comprehensive overview of implementing Firebase HTTPS functions in a new project. For more detailed information, refer to the [official Firebase documentation](https://firebase.google.com/docs/functions).
      </div>
      
      <div>
        <h2>Save Message Function</h2>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter a message"
        />
        <button onClick={handleSaveMessage} disabled={loading}>
          {loading ? 'Saving...' : 'Save Message'}
        </button>
        {saveResult && (
          <pre>{JSON.stringify(saveResult, null, 2)}</pre>
        )}
      </div>
    </div>
  );
};

export default FunctionsDemo;
```
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    response.status(201).send({
      id: docRef.id,
      message: 'Message saved successfully'
    });
  } catch (error) {
    console.error('Error saving message:', error);
    response.status(500).send({ 
      error: 'Failed to save message',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```
API_KEY=your_api_key_here
DATABASE_URL=your_database_url_here
```

Then install the dotenv package:

```bash
npm install dotenv
```

And update your `functions/src/index.ts` file to load the environment variables:

```typescript
import * as dotenv from 'dotenv';
dotenv.config();