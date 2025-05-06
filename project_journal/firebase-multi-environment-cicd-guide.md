# Firebase Multi-Environment Setup with CI/CD

This guide explains how to set up Firebase with multiple environments (test and live) using different Firebase projects, and how to implement CI/CD with GitHub to automatically deploy to the appropriate environment based on the branch.

## Table of Contents

1. [Setting Up Multiple Firebase Projects](#setting-up-multiple-firebase-projects)
2. [Configuring Firebase for Multi-Environment](#configuring-firebase-for-multi-environment)
3. [Branch-Based Deployment Strategy](#branch-based-deployment-strategy)
4. [Setting Up GitHub Actions for CI/CD](#setting-up-github-actions-for-cicd)
5. [Testing Your CI/CD Pipeline](#testing-your-cicd-pipeline)
6. [Best Practices](#best-practices)

## Setting Up Multiple Firebase Projects

### 1. Create Two Firebase Projects

First, create two separate Firebase projects in the Firebase Console:

1. **Test Environment Project**: e.g., "my-app-test" or "my-app-staging"
2. **Live Environment Project**: e.g., "my-app" or "my-app-prod"

For each project:
- Configure the same services you'll need (Firestore, Functions, Hosting, etc.)
- Set up appropriate security rules
- Configure authentication methods

### 2. Get Project Configuration

For each project, get the Firebase configuration:

1. Go to Project Settings > General
2. Scroll down to "Your apps" section
3. Select your web app or create one if needed
4. Copy the Firebase configuration object (apiKey, authDomain, etc.)

## Configuring Firebase for Multi-Environment

### 1. Set Up .firebaserc File

Create a `.firebaserc` file in your project root that defines both projects:

```json
{
  "projects": {
    "default": "my-app-test",
    "test": "my-app-test",
    "live": "my-app"
  }
}
```

### 2. Create Environment-Specific Configuration Files

Create environment-specific configuration files to store Firebase config for each environment:

**src/config/firebase.test.js**
```javascript
export const firebaseConfig = {
  apiKey: "YOUR_TEST_API_KEY",
  authDomain: "my-app-test.firebaseapp.com",
  projectId: "my-app-test",
  storageBucket: "my-app-test.appspot.com",
  messagingSenderId: "YOUR_TEST_MESSAGING_SENDER_ID",
  appId: "YOUR_TEST_APP_ID"
};
```

**src/config/firebase.live.js**
```javascript
export const firebaseConfig = {
  apiKey: "YOUR_LIVE_API_KEY",
  authDomain: "my-app.firebaseapp.com",
  projectId: "my-app",
  storageBucket: "my-app.appspot.com",
  messagingSenderId: "YOUR_LIVE_MESSAGING_SENDER_ID",
  appId: "YOUR_LIVE_APP_ID"
};
```

### 3. Create a Firebase Config Loader

Create a file that loads the appropriate configuration based on the environment:

**src/config/firebase.js**
```javascript
import { firebaseConfig as testConfig } from './firebase.test';
import { firebaseConfig as liveConfig } from './firebase.live';

// Determine which config to use based on environment variable
// This will be set during the build process
const environment = process.env.REACT_APP_ENVIRONMENT || 'test';

export const firebaseConfig = environment === 'live' ? liveConfig : testConfig;
```

### 4. Update firebase.json for Multi-Environment

Modify your `firebase.json` to handle both environments:

```json
{
  "hosting": {
    "public": "build",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  },
  "functions": {
    "source": "functions",
    "predeploy": [
      "npm --prefix \"$RESOURCE_DIR\" run build"
    ]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

## Branch-Based Deployment Strategy

### 1. Define Your Branch Strategy

- **staging branch**: Deploys to the test environment
- **master branch**: Deploys to the live environment

### 2. Local Testing with Different Environments

To test locally with a specific environment:

```bash
# For test environment
firebase use test
firebase emulators:start

# For live environment
firebase use live
firebase emulators:start
```

## Setting Up GitHub Actions for CI/CD

### 1. Create GitHub Secrets

In your GitHub repository:
1. Go to Settings > Secrets and variables > Actions
2. Add the following secrets:
   - `FIREBASE_TOKEN`: Your Firebase CI token (get it by running `firebase login:ci`)
   - `TEST_PROJECT_ID`: Your test Firebase project ID
   - `LIVE_PROJECT_ID`: Your live Firebase project ID

### 2. Create GitHub Actions Workflow File

Create a file at `.github/workflows/firebase-deploy.yml`:

```yaml
name: Firebase Deploy

on:
  push:
    branches:
      - staging
      - master

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm ci
          npm --prefix functions ci
      
      - name: Set environment variables
        run: |
          if [[ $GITHUB_REF == refs/heads/master ]]; then
            echo "FIREBASE_PROJECT_ID=${{ secrets.LIVE_PROJECT_ID }}" >> $GITHUB_ENV
            echo "REACT_APP_ENVIRONMENT=live" >> $GITHUB_ENV
          else
            echo "FIREBASE_PROJECT_ID=${{ secrets.TEST_PROJECT_ID }}" >> $GITHUB_ENV
            echo "REACT_APP_ENVIRONMENT=test" >> $GITHUB_ENV
          fi
      
      - name: Build React app
        run: npm run build
      
      - name: Build Functions
        run: npm --prefix functions run build
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_TOKEN }}'
          projectId: ${{ env.FIREBASE_PROJECT_ID }}
          channelId: live
        env:
          FIREBASE_CLI_PREVIEWS: hostingchannels
      
      - name: Deploy Firestore Rules
        run: npx firebase deploy --only firestore:rules --project ${{ env.FIREBASE_PROJECT_ID }} --token ${{ secrets.FIREBASE_TOKEN }}
      
      - name: Deploy Storage Rules
        run: npx firebase deploy --only storage --project ${{ env.FIREBASE_PROJECT_ID }} --token ${{ secrets.FIREBASE_TOKEN }}
      
      - name: Deploy Functions
        run: npx firebase deploy --only functions --project ${{ env.FIREBASE_PROJECT_ID }} --token ${{ secrets.FIREBASE_TOKEN }}
```

### 3. Alternative: Separate Workflows for Each Environment

You can also create separate workflow files for each environment:

**`.github/workflows/deploy-test.yml`**
```yaml
name: Deploy to Test

on:
  push:
    branches:
      - staging

jobs:
  deploy_to_test:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm ci
          npm --prefix functions ci
      
      - name: Set environment variables
        run: echo "REACT_APP_ENVIRONMENT=test" >> $GITHUB_ENV
      
      - name: Build React app
        run: npm run build
      
      - name: Build Functions
        run: npm --prefix functions run build
      
      - name: Deploy to Firebase Test
        run: npx firebase deploy --project ${{ secrets.TEST_PROJECT_ID }} --token ${{ secrets.FIREBASE_TOKEN }}
```

**`.github/workflows/deploy-live.yml`**
```yaml
name: Deploy to Live

on:
  push:
    branches:
      - master

jobs:
  deploy_to_live:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm ci
          npm --prefix functions ci
      
      - name: Set environment variables
        run: echo "REACT_APP_ENVIRONMENT=live" >> $GITHUB_ENV
      
      - name: Build React app
        run: npm run build
      
      - name: Build Functions
        run: npm --prefix functions run build
      
      - name: Deploy to Firebase Live
        run: npx firebase deploy --project ${{ secrets.LIVE_PROJECT_ID }} --token ${{ secrets.FIREBASE_TOKEN }}
```

## Testing Your CI/CD Pipeline

### 1. Push to Staging Branch

```bash
git checkout -b staging
git add .
git commit -m "Test deployment to staging environment"
git push origin staging
```

This should trigger the GitHub Actions workflow to deploy to your test environment.

### 2. Push to Master Branch

```bash
git checkout master
git merge staging
git push origin master
```

This should trigger the GitHub Actions workflow to deploy to your live environment.

## Best Practices

### 1. Environment-Specific Variables

For environment-specific variables beyond Firebase config:

**`.env.test`**
```
REACT_APP_ENVIRONMENT=test
REACT_APP_API_URL=https://api-test.example.com
REACT_APP_FEATURE_FLAG_NEW_UI=true
```

**`.env.live`**
```
REACT_APP_ENVIRONMENT=live
REACT_APP_API_URL=https://api.example.com
REACT_APP_FEATURE_FLAG_NEW_UI=false
```

Update your build scripts in `package.json`:

```json
"scripts": {
  "build:test": "env-cmd -f .env.test react-scripts build",
  "build:live": "env-cmd -f .env.live react-scripts build"
}
```

Then update your GitHub Actions workflow to use the appropriate build command.

### 2. Firebase Functions Environment Configuration

For Firebase Functions, create environment-specific configuration:

**`functions/.env.test`**
```
API_URL=https://api-test.example.com
DEBUG=true
```

**`functions/.env.live`**
```
API_URL=https://api.example.com
DEBUG=false
```

In your functions code:

```typescript
import * as functions from 'firebase-functions';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({
  path: `.env.${process.env.NODE_ENV || 'test'}`
});

// Configuration object
export const config = {
  apiUrl: process.env.API_URL || functions.config().api?.url,
  debug: process.env.DEBUG === 'true' || functions.config().app?.debug === 'true'
};
```

### 3. Testing Before Deployment

Add testing to your CI/CD pipeline:

```yaml
- name: Run tests
  run: npm test
```

### 4. Deployment Approval for Live Environment

For the live environment, you might want to add a manual approval step:

```yaml
jobs:
  build:
    # Build job steps...
    
  deploy:
    needs: build
    environment: production
    # This will require manual approval in GitHub
    runs-on: ubuntu-latest
    steps:
      # Deployment steps...
```

### 5. Rollback Strategy

Implement a rollback strategy in case of deployment issues:

```yaml
- name: Deploy with version tracking
  run: |
    DEPLOY_VERSION=$(date +%Y%m%d%H%M%S)
    echo "DEPLOY_VERSION=$DEPLOY_VERSION" >> $GITHUB_ENV
    npx firebase hosting:clone ${{ secrets.LIVE_PROJECT_ID }}:live ${{ secrets.LIVE_PROJECT_ID }}:$DEPLOY_VERSION
    npx firebase deploy --only hosting --project ${{ secrets.LIVE_PROJECT_ID }} --token ${{ secrets.FIREBASE_TOKEN }}
```

This creates a versioned deployment that you can roll back to if needed.

---

This guide provides a comprehensive approach to setting up Firebase with multiple environments and implementing CI/CD with GitHub Actions. Adjust the configurations as needed for your specific project requirements.