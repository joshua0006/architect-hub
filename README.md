# ArchiTed Hub

ArchiTed Hub is a collaborative platform for architecture and design teams to manage projects, documents, and collaboration.

## Comment Notification System

ArchiTed Hub features a comprehensive notification system for comments in collaborative files:

### Features

- **User Mentions**: Users can mention others in comments using the `@username` syntax
- **Mention Autocomplete**: Type '@' to see a dropdown with available users to mention
- **Personalized Notifications**: Each mentioned user receives a personalized notification
- **Comment Notifications**: All collaborators on a document are notified when new comments are added
- **Real-time Updates**: Notifications are delivered in real-time to keep teams in sync

### How It Works

1. **Mention Detection**: 
   - Type '@' to trigger the mention autocomplete dropdown
   - Select a user from the list or continue typing to filter results
   - The system automatically detects mentions using the format `@username` in comments
2. **User Resolution**: Mentioned usernames are resolved to actual user accounts in the system
3. **Notification Creation**: 
   - Personalized notifications are created for each mentioned user
   - General notifications are created for all other document collaborators
4. **Notification Delivery**: Notifications appear in the user's notification panel and can be clicked to navigate directly to the relevant comment

### Implementation Details

The notification system consists of several key components:

#### `textUtils.ts`
- Contains utilities for extracting and processing mentions from text
- Implements formatting for highlighting mentions in rendered comments

#### `notificationService.ts`
- Provides functions for creating and managing notifications
- Handles different notification types including comment mentions and general comments

#### `CommentText.tsx`
- Renders comment text with highlighted mentions
- Uses dangerouslySetInnerHTML to display the formatted text with styled mentions

#### `EnhancedCommentInput.tsx`
- Provides an enhanced input field with @mention autocomplete functionality
- Detects when a user types '@' and displays a dropdown with available users
- Supports keyboard navigation (arrow keys) and selection (Enter key)
- Inserts the selected username at the cursor position

#### `MentionSuggestions.tsx`
- Renders a dropdown with user suggestions for mentions
- Displays user profile pictures and names
- Highlights the currently selected suggestion

#### `DocumentViewer.tsx`
- Uses EnhancedCommentInput for the comment form
- Processes comment text for mentions when adding or updating comments
- Generates appropriate notifications for mentioned users and collaborators

### Usage Example

To mention a user in a comment:

1. Type '@' in the comment field
2. A dropdown will appear with available users to mention
3. Continue typing to filter the list or use arrow keys to navigate
4. Press Enter or click on a user to select them
5. The @username will be inserted into your comment

Example:
```
Great progress on the design! @johndoe, can you review the changes?
```

This will create a notification for the user "johndoe" and highlight their username in the comment.

## Technical Architecture

The notification system uses Firebase Firestore for data storage and real-time updates. Key collections include:

- `documents/{documentId}/comments`: Stores comments for each document
- `notifications`: Stores all notifications with metadata and references to related content

Each notification includes:
- Message content
- Link to the referenced document and comment
- Metadata about the notification source
- Read/unread status 

## Environment Configuration

This project uses environment variables for Firebase configuration.

### Setup

1. Create a `.env` file in the root directory of your project:

```bash
# Firebase Production Configuration
VITE_FIREBASE_API_KEY=your_production_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_production_auth_domain
VITE_FIREBASE_PROJECT_ID=your_production_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_production_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_production_messaging_sender_id
VITE_FIREBASE_APP_ID=your_production_app_id

# Firebase Test Configuration
VITE_TEST_FIREBASE_API_KEY=your_test_api_key
VITE_TEST_FIREBASE_AUTH_DOMAIN=your_test_auth_domain
VITE_TEST_FIREBASE_PROJECT_ID=your_test_project_id
VITE_TEST_FIREBASE_STORAGE_BUCKET=your_test_storage_bucket
VITE_TEST_FIREBASE_MESSAGING_SENDER_ID=your_test_messaging_sender_id
VITE_TEST_FIREBASE_APP_ID=your_test_app_id
VITE_TEST_FIREBASE_MEASUREMENT_ID=your_test_measurement_id

# Firebase Environment Selection
# Set to "true" to use test Firebase project instead of production
VITE_USE_TEST_FIREBASE=false

# Set to "true" to use Firebase emulators
VITE_USE_FIREBASE_EMULATORS=false
```

2. For development, create a `.env.development` file with:

```bash
# Use test environment in development
VITE_USE_TEST_FIREBASE=true
```

3. For production, make sure to use a `.env.production` file with:

```bash
# Use production environment in production
VITE_USE_TEST_FIREBASE=false
VITE_USE_FIREBASE_EMULATORS=false
```

### Firebase Emulators

To use Firebase emulators for local development:

1. Install the Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Set up Firebase emulators:
```bash
firebase init emulators
```

3. Start the emulators:
```bash
firebase emulators:start
```

4. Configure your `.env.development` file:
```bash
VITE_USE_TEST_FIREBASE=true
VITE_USE_FIREBASE_EMULATORS=true
``` 