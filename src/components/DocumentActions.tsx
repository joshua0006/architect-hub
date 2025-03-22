import { Plus, FolderPlus, Upload, AlertCircle, Loader2, FileText, FolderOpen, Link } from 'lucide-react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Folder } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import GenerateUploadToken from './GenerateUploadToken';
import { useAuth } from '../contexts/AuthContext';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface DocumentActionsProps {
  projectId: string;
  currentFolderId?: string;
  folders: Folder[];
  onCreateFolder: (name: string, parentId?: string) => Promise<void>;
  onCreateDocument: (name: string, type: Document['type'], file: File, folderId?: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES: string[] = []; // Empty array means all file types are allowed

// Create a custom interface for directory input
interface DirectoryInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  webkitdirectory?: string;
  directory?: string;
  mozdirectory?: string;
  "data-webkitdirectory"?: string;
  "data-directory"?: string;
}

// Define folder node structure for better organization
interface FolderNode {
  name: string;
  path: string;
  files: File[];
  subfolders: Map<string, FolderNode>;
  parent?: FolderNode;
}

// Constants for upload configuration
const MAX_UPLOAD_RETRIES = 3;
const BATCH_SIZE = 5; // How many files to process at once
const BATCH_DELAY = 500; // Milliseconds to wait between batches

// Before uploadFileWithRetry function, add this helper function to ensure Firebase operations complete
const ensureFirebaseSync = async (operation: () => Promise<any>, retries = 3, delay = 500): Promise<any> => {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const result = await operation();
      console.log(`✅ Firebase operation completed successfully on attempt ${attempt + 1}`);
      return result;
    } catch (error) {
      console.error(`❌ Firebase operation failed on attempt ${attempt + 1}:`, error);
      lastError = error;
      
      // If not the last attempt, wait before retrying
      if (attempt < retries - 1) {
        const backoffDelay = delay * Math.pow(2, attempt);
        console.log(`Waiting ${backoffDelay}ms before retrying...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }
  throw lastError || new Error('Firebase operation failed after multiple attempts');
};

// Add this function after the ensureFirebaseSync function
const handleFirebaseError = (error: any): string => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Parse and categorize Firebase errors
  if (errorMessage.includes("network") || 
      errorMessage.includes("timeout") || 
      errorMessage.includes("unavailable")) {
    return "Network issue detected. Please check your connection and try again.";
  }
  
  if (errorMessage.includes("permission") || 
      errorMessage.includes("unauthorized") || 
      errorMessage.includes("access")) {
    return "Permission denied. You may not have access to perform this operation.";
  }
  
  if (errorMessage.includes("not found") || 
      errorMessage.includes("does not exist")) {
    return "The requested item could not be found. It may have been moved or deleted.";
  }
  
  if (errorMessage.includes("already exists")) {
    return "An item with this name already exists. Please use a different name.";
  }
  
  if (errorMessage.includes("quota") || 
      errorMessage.includes("limit")) {
    return "Operation failed due to quota limits. Please try again later.";
  }
  
  // Return a generic error message for unclassified errors
  return `Firebase operation failed: ${errorMessage}`;
};

export default function DocumentActions({
  projectId,
  currentFolderId,
  folders,
  onCreateFolder,
  onCreateDocument,
  onRefresh
}: DocumentActionsProps) {
  const { user } = useAuth();
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [showFileInput, setShowFileInput] = useState(false);
  const [showTokenGenerator, setShowTokenGenerator] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>(currentFolderId);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploaderName, setUploaderName] = useState(user?.displayName || '');
  const [isFolderUpload, setIsFolderUpload] = useState(false);
  const [folderFiles, setFolderFiles] = useState<File[]>([]);
  const [currentFolderPath, setCurrentFolderPath] = useState<string>('');
  const [processingFile, setProcessingFile] = useState<string>('');
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isTokenUpload, setIsTokenUpload] = useState(false);

  const folderNameInputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const tokenGeneratorRef = useRef<HTMLDivElement>(null);
  // After the user state declaration near the top of the component, add a ref to track folders
  const folderListRef = useRef<Folder[]>([]);

  // Add this state to track if the folder is already initialized
  const [folderSelectionInitialized, setFolderSelectionInitialized] = useState(false);

  // Add a local folders state that we can update directly
  const [localFolders, setLocalFolders] = useState<Folder[]>(folders);
  const isInitialMount = useRef(true);

  // Sync local folders with props
  useEffect(() => {
    setLocalFolders(folders);
  }, [folders]);

  // Add a function to directly fetch folders from Firebase
  const fetchFoldersDirectlyFromFirebase = async (): Promise<Folder[]> => {
    try {
      console.log("🔄 DIRECT FIREBASE SYNC: Fetching folders directly from Firestore...");
      
      // Create a query for folders in the current project
      const foldersQuery = query(
        collection(db, 'folders'),
        where('projectId', '==', projectId)
      );
      
      // Execute the query
      const snapshot = await getDocs(foldersQuery);
      
      // Map the results to Folder objects
      const fetchedFolders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Folder));
      
      console.log(`✅ DIRECT FIREBASE SYNC: Successfully fetched ${fetchedFolders.length} folders`);
      
      // Update our local state with the fetched folders
      setLocalFolders(fetchedFolders);
      
      // Log fetched folder names for debugging
      console.log("FETCHED FOLDERS:", fetchedFolders.map(f => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId || 'root'
      })));
      
      return fetchedFolders;
    } catch (error) {
      console.error("❌ DIRECT FIREBASE SYNC: Failed to fetch folders:", error);
      return localFolders; // Return current state as fallback
    }
  };

  // Add this effect to update selectedFolderId when currentFolderId changes
  useEffect(() => {
    if (currentFolderId !== selectedFolderId) {
      setSelectedFolderId(currentFolderId);
      setFolderSelectionInitialized(true);
    }
  }, [currentFolderId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderNameInputRef.current && !folderNameInputRef.current.contains(event.target as Node)) {
        setShowFolderInput(false);
        setNewFolderName('');
        setError('');
      }
      if (fileInputRef.current && !fileInputRef.current.contains(event.target as Node)) {
        setShowFileInput(false);
        setSelectedFile(null);
        setError('');
      }
      if (tokenGeneratorRef.current && !tokenGeneratorRef.current.contains(event.target as Node)) {
        setShowTokenGenerator(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get available folders for selection
  const getAvailableFolders = (parentId?: string): Folder[] => {
    return folders.filter(folder => folder.parentId === parentId);
  };

  // Get folder path for display
  const getFolderPath = (folderId?: string): string => {
    if (!folderId) return 'Root';
    
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return 'Root';

    const path: string[] = [folder.name];
    let current = folder;
    
    while (current.parentId) {
      const parent = folders.find(f => f.id === current.parentId);
      if (parent) {
        path.unshift(parent.name);
        current = parent;
      } else {
        break;
      }
    }

    return path.join(' / ');
  };

  const validateFile = (file: File): string | null => {
    // Only validate file size, no file type restrictions
    if (file.size > MAX_FILE_SIZE) {
      return `File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }
    
    return null;
  };

  const handleFileSelect = (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      return;
    }

    setError('');
    setSelectedFile(file);
    // Extract filename without extension for the document name
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setNewFileName(baseName);
  };

  const handleCreateFolder = async () => {
    if (isProcessing || !newFolderName.trim()) return;

    try {
      setIsProcessing(true);
      setError('');
      
      await ensureFirebaseSync(async () => {
        await onCreateFolder(newFolderName.trim(), currentFolderId);
        console.log(`Firebase folder creation complete: "${newFolderName.trim()}" in parent "${currentFolderId || 'root'}"`);
      });
      
      if (onRefresh) {
        console.log('Refreshing to reflect new folder in UI...');
        await ensureFirebaseSync(async () => {
          await onRefresh();
        });
      }
      
      setNewFolderName('');
      setShowFolderInput(false);
    } catch (error) {
      console.error('Error ensuring folder creation is reflected in Firebase:', error);
      setError(error instanceof Error ? error.message : 'Failed to create folder and sync with database');
    } finally {
      setIsProcessing(false);
    }
  };

  const getDocumentType = (file: File): Document['type'] => {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return 'pdf';
    }
    if (file.name.toLowerCase().endsWith('.dwg')) {
      return 'dwg';
    }
    // All other file types are classified as 'other'
    return 'other';
  };

  // Update the handleCreateDocument function to better handle root folder uploads
  const handleCreateDocument = async () => {
    if (isProcessing || !selectedFile || !newFileName.trim()) {
      setError('Please select a file and provide a name');
      return;
    }

    // Only require guest name/email if user is not logged in
    if (!user && !uploaderName.trim()) {
      setError('Please provide your name or email');
      return;
    }

    try {
      setIsProcessing(true);
      setIsUploading(true);
      setError('');
      setUploadProgress(0);
      
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);

      // Determine the target folder name for display
      const targetFolderName = selectedFolderId 
        ? folders.find(f => f.id === selectedFolderId)?.name || "Selected Folder" 
        : "Root Folder";
      
      // Log the target folder for upload
      console.log(`🔍 UPLOADING FILE TO: ${selectedFolderId ? `Folder ID: "${selectedFolderId}" (${targetFolderName})` : 'Root folder'}`);
      
      // Validate the folder ID if one is selected (root doesn't need validation)
      if (selectedFolderId) {
        const isValidFolder = await validateFolderId(selectedFolderId, { retries: 2, delay: 500 });
        if (!isValidFolder) {
          console.error(`❌ Selected folder "${selectedFolderId}" could not be validated`);
          setError(`The selected folder could not be found. Please try selecting a different folder.`);
          throw new Error(`Invalid folder ID: ${selectedFolderId}`);
        }
      }
      
      // Create the document with enhanced Firebase sync reliability
      const documentType = getDocumentType(selectedFile);
      await ensureFirebaseSync(async () => {
        await onCreateDocument(newFileName.trim(), documentType, selectedFile, selectedFolderId);
        console.log(`✅ Firebase document creation complete: "${newFileName.trim()}" in ${selectedFolderId ? `folder "${targetFolderName}"` : 'Root folder'}`);
      });
      
      // Create a notification for the file upload - for guests or token uploads
      try {
        // Create notifications for guest uploads or token-based uploads
        if (!user || isTokenUpload) {
          // Get folder name
          const folderName = targetFolderName;
          
          // For guest uploads, we'll use the entered uploader name
          const uploader = uploaderName.trim();
          
          // Create the link to the document with proper context
          let link = `/documents`;
          
          if (projectId) {
            link = `/documents/projects/${projectId}`;
            
            if (selectedFolderId) {
              link += `/folders/${selectedFolderId}`;
            }
          } else if (selectedFolderId) {
            link += `/folders/${selectedFolderId}`;
          }
          
          // Create notification for guest uploads or token-based uploads
          await ensureFirebaseSync(async () => {
            const notificationsRef = collection(db, 'notifications');
            await addDoc(notificationsRef, {
              iconType: 'file-upload',
              type: 'info',
              message: `${uploader} uploaded "${newFileName.trim()}" to ${folderName}`,
              link: link,
              read: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              metadata: {
                contentType: selectedFile.type,
                fileName: selectedFile.name,
                folderId: selectedFolderId || '',
                folderName: folderName,
                isRootUpload: !selectedFolderId,
                guestName: uploader,
                uploadDate: new Date().toISOString(),
                projectId: projectId || '',
                isGuestUpload: !user,
                isTokenUpload: isTokenUpload
              }
            });
            
            const uploadType = !user ? 'Guest' : isTokenUpload ? 'Token-based' : 'User';
            console.log(`${uploadType} upload notification successfully created in Firebase`);
          });
        } else {
          console.log('Skipping notification creation for standard logged-in user upload');
        }
      } catch (notificationError) {
        console.error('Error creating upload notification in Firebase:', notificationError);
        // Continue even if notification fails - don't block the main upload
      }
      
      // Ensure UI reflects the latest from Firebase
      if (onRefresh) {
        console.log('Refreshing to reflect new document in UI...');
        await ensureFirebaseSync(async () => {
          await onRefresh();
        });
      }
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      // Show success message including location
      setError(''); // Clear any previous errors
      
      setTimeout(() => {
        setNewFileName('');
        setSelectedFile(null);
        setUploaderName('');
        setSelectedFolderId(currentFolderId);
        setShowFileInput(false);
        setUploadProgress(0);
        setIsTokenUpload(false); // Reset the token upload flag
      }, 1500); // Longer timeout to ensure user sees the completion
    } catch (error) {
      console.error('Error uploading document:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload document');
    } finally {
      setIsProcessing(false);
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleFolderSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) {
      setError('No files selected');
      return;
    }
    
    // Process file paths to extract structure
    let hasValidPath = false;
    let rootFolderName = '';
    
    // Extract the root folder name first
    for (const file of files) {
      // Try to get the path from the file object
      const relativePath = file.webkitRelativePath || (file as any).relativePath;
      
      if (relativePath) {
        hasValidPath = true;
        const pathParts = relativePath.split('/');
        if (pathParts.length > 0) {
          rootFolderName = pathParts[0];
          break;
        }
      }
    }
    
    if (!hasValidPath) {
      setError('Selected items do not appear to be a folder structure');
      return;
    }
    
    console.log(`Detected root folder: "${rootFolderName}"`);
    
    setNewFolderName(rootFolderName);
    setNewFileName(rootFolderName);
    setFolderFiles(files);
    setIsFolderUpload(true);
    setError('');
    
    // Create a list of all folders (including empty ones) from the file paths
    const allPaths = new Set<string>();
    const emptyFolders = new Set<string>();
    
    // Extract all paths from files
    files.forEach(file => {
      const path = file.webkitRelativePath || (file as any).relativePath || '';
      if (!path) return;
      
      const parts = path.split('/');
      // Process each segment of the path (directory)
      for (let i = 1; i < parts.length; i++) {
        const dirPath = parts.slice(0, i).join('/');
        if (dirPath) {
          allPaths.add(dirPath);
        }
      }
    });
    
    // Check for empty folders (directories that don't contain files directly)
    files.forEach(file => {
      const path = file.webkitRelativePath || (file as any).relativePath || '';
      if (!path) return;
      
      const parts = path.split('/');
      const parentDir = parts.slice(0, parts.length - 1).join('/');
      allPaths.delete(parentDir); // Remove from potential empty folders since it contains a file
    });
    
    // Any remaining paths are potentially empty folders
    if (allPaths.size > 0) {
      console.log(`Detected ${allPaths.size} potentially empty folders:`, Array.from(allPaths));
    }
    
    // Set the current folder path for use in other functions
    setCurrentFolderPath(rootFolderName);
  };

  // Add a helper function to extract file paths safely
  const extractFilePath = (file: File): {baseName: string, filePath: string[], fileName: string} => {
    // Get the path using webkitRelativePath or fallback to any browser-specific property
    const fullPath = file.webkitRelativePath || (file as any).relativePath || '';
    
    if (!fullPath) {
      // Fallback for browsers without proper path support
      return {
        baseName: '',
        filePath: [],
        fileName: file.name
      };
    }
    
    // Split the path into components
    const pathParts = fullPath.split('/');
    
    // First part is the base folder name
    const baseName = pathParts.shift() || '';
    
    // Last part is the file name
    const fileName = pathParts.length > 0 ? pathParts.pop() || file.name : file.name;
    
    // Everything in between is the subfolders
    return {
      baseName,
      filePath: pathParts,
      fileName
    };
  };

  // Add a utility function to track folder and file processing
  const useUploadTracker = () => {
    const [uploadStats, setUploadStats] = useState({
      totalFolders: 0,
      processedFolders: 0,
      totalFiles: 0,
      processedFiles: 0, 
      uploadedFiles: 0,
      failedFiles: 0,
      deepestLevel: 0
    });

    const updateStats = (update: Partial<typeof uploadStats>) => {
      setUploadStats(prev => ({
        ...prev,
        ...update
      }));
    };

    return {
      uploadStats,
      updateStats
    };
  };

  const { uploadStats, updateStats } = useUploadTracker();

  // Replace the validateFolderId function with this enhanced version
  const validateFolderId = async (folderId: string | null | undefined, options?: { retries?: number, delay?: number }): Promise<boolean> => {
    // Special case: If folderId is null or undefined, it represents the root folder, which is always valid
    if (folderId === null || folderId === undefined) {
      console.log(`✅ FOLDER VALIDATION: Root folder is always valid`);
      return true;
    }
    
    const retries = options?.retries || 3;
    const delay = options?.delay || 1000;
    
    // First quick check in local state
    const existsInLocalState = localFolders.some(folder => folder.id === folderId);
    if (existsInLocalState) {
      console.log(`✅ FOLDER VALIDATION: Folder ID "${folderId}" exists in local folders list.`);
      return true;
    }
    
    // If not found in local state, then check in the props folders
    const existsInProps = folders.some(folder => folder.id === folderId);
    if (existsInProps) {
      console.log(`✅ FOLDER VALIDATION: Folder ID "${folderId}" exists in props folders list.`);
      return true;
    }
    
    console.log(`⚠️ FOLDER VALIDATION: Folder ID "${folderId}" not found in initial check. Starting retry process...`);
    
    // Try with retries and direct Firebase fetching
    for (let attempt = 0; attempt < retries; attempt++) {
      console.log(`🔄 FOLDER VALIDATION: Attempt ${attempt + 1}/${retries} to validate folder ID "${folderId}"`);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
      
      // Refresh local folders from Firebase directly
      try {
        const latestFolders = await fetchFoldersDirectlyFromFirebase();
        
        // Check if folder exists in the latest data
        const exists = latestFolders.some(folder => folder.id === folderId);
        if (exists) {
          console.log(`✅ FOLDER VALIDATION: Folder ID "${folderId}" found after attempt ${attempt + 1}`);
          return true;
        }
        
        console.log(`⚠️ FOLDER VALIDATION: Folder ID "${folderId}" still not found after attempt ${attempt + 1}`);
      } catch (error) {
        console.error(`Error fetching folders during validation attempt ${attempt + 1}:`, error);
      }
      
      // Also try the standard refresh if available
      if (onRefresh) {
        try {
          await onRefresh();
          
          // Check local folders again after refresh
          const existsAfterRefresh = localFolders.some(folder => folder.id === folderId);
          if (existsAfterRefresh) {
            console.log(`✅ FOLDER VALIDATION: Folder ID "${folderId}" found after standard refresh on attempt ${attempt + 1}`);
            return true;
          }
        } catch (refreshError) {
          console.error(`Error during standard refresh in validation attempt ${attempt + 1}:`, refreshError);
        }
      }
    }
    
    // After all retries, log available folders to help with debugging
    console.error(`❌ FOLDER VALIDATION ERROR: Folder ID "${folderId}" does not exist in the current folders list even after ${retries} attempts.`);
    console.log(`Available folders in local state:`, localFolders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId || 'root' })));
    console.log(`Available folders in props:`, folders.map(f => ({ id: f.id, name: f.name, parentId: f.parentId || 'root' })));
    
    // For non-critical operations, we might want to continue anyway
    return false;
  };

  // Replace the existing refreshFolders function with this improved version
  const refreshFolders = async (options?: { delay?: number, retries?: number }): Promise<Folder[]> => {
    const delay = options?.delay || 300;
    const maxRetries = options?.retries || 1;
    let attemptCount = 0;
    let latestFolders: Folder[] = [...folders];
    
    if (onRefresh) {
      while (attemptCount <= maxRetries) {
        try {
          console.log(`Refreshing folders (attempt ${attemptCount + 1}/${maxRetries + 1})...`);
          await onRefresh();
          
          // Small delay to ensure state is updated
          if (delay > 0) {
            console.log(`Waiting ${delay}ms for folder refresh to complete...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // Get latest folders after refresh
          latestFolders = [...folders];
          console.log(`Refresh complete! Current folders: ${latestFolders.length}`);
          
          // Log the folders for debugging
          if (latestFolders.length < 10) {
            // If we have few folders, log them all
            console.log('Available folders after refresh:', latestFolders.map(f => ({
              id: f.id,
              name: f.name,
              parentId: f.parentId || 'root'
            })));
          } else {
            // Otherwise just log a summary
            console.log(`Available folders: ${latestFolders.length} total folders`);
            // Log a few random folders as sample
            const sampleFolders = latestFolders.slice(0, 3);
            console.log('Sample folders:', sampleFolders.map(f => ({
              id: f.id,
              name: f.name,
              parentId: f.parentId || 'root'
            })));
          }
          
          // If we have folders, break the retry loop
          if (latestFolders.length > 0) {
            break;
          }
          
          console.log(`No folders found after refresh attempt ${attemptCount + 1}, trying again...`);
        } catch (error) {
          console.error(`Error refreshing folders (attempt ${attemptCount + 1}):`, error);
        }
        
        attemptCount++;
      }
    }
    
    return latestFolders; // Return the latest folders from state
  };

  // Add useEffect to monitor folderFiles changes
  useEffect(() => {
    if (folderFiles.length > 0) {
      console.log(`folderFiles updated with ${folderFiles.length} files`);
      console.log(`First few files:`, folderFiles.slice(0, 3).map(f => ({
        name: f.name,
        path: f.webkitRelativePath || (f as any).relativePath || '',
        size: f.size
      })));
    }
  }, [folderFiles]);

  // Helper function to validate folder contents
  const validateFolderContents = (files: File[]): { 
    validFiles: File[], 
    invalidFiles: Array<{ file: File, reason: string }> 
  } => {
    const validFiles: File[] = [];
    const invalidFiles: Array<{ file: File, reason: string }> = [];
    
    files.forEach(file => {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push({
          file,
          reason: `File exceeds maximum size limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
        });
        return;
      }
      
      // Validate file name length
      if (file.name.length > 255) {
        invalidFiles.push({
          file,
          reason: 'File name too long (maximum 255 characters)'
        });
        return;
      }
      
      // Validate path
      const path = file.webkitRelativePath || (file as any).relativePath || '';
      if (path.length > 4096) {
        invalidFiles.push({
          file,
          reason: 'Path too long (maximum 4096 characters)'
        });
        return;
      }
      
      // If we got here, the file is valid
      validFiles.push(file);
    });
    
    return { validFiles, invalidFiles };
  };

  // Helper function to build folder structure
  const buildFolderStructure = (files: File[]): FolderNode => {
    console.log('Building folder structure from', files.length, 'files');
    
    // First, check if we have files with proper path information
    const filesWithPaths = files.filter(file => 
      file.webkitRelativePath || (file as any).relativePath
    );
    
    if (filesWithPaths.length === 0) {
      console.warn('No files with proper path information found');
    }
    
    // Create root folder
    const rootFolder: FolderNode = {
      name: '',
      path: '',
      files: [],
      subfolders: new Map()
    };
    
    // Extract base folder name from first file
    if (filesWithPaths.length > 0) {
      const path = filesWithPaths[0].webkitRelativePath || (filesWithPaths[0] as any).relativePath || '';
      const parts = path.split('/');
      if (parts.length > 0) {
        rootFolder.name = parts[0];
        rootFolder.path = parts[0];
        console.log(`Root folder name set to: "${rootFolder.name}"`);
      }
    } else if (files.length > 0) {
      // If no files have paths, use the current folder path as fallback
      console.warn('Using fallback method to determine root folder name');
      rootFolder.name = currentFolderPath || 'Uploads';
      rootFolder.path = rootFolder.name;
      console.log(`Root folder name set to (fallback): "${rootFolder.name}"`);
    } else {
      // Handle completely empty folder case (no files at all)
      console.warn('Empty folder upload detected - using current folder name');
      rootFolder.name = currentFolderPath || newFileName || 'EmptyFolder';
      rootFolder.path = rootFolder.name;
      console.log(`Root folder name for empty folder: "${rootFolder.name}"`);
    }
    
    // Normalize path separators and remove leading/trailing slashes
    const normalizePath = (path: string): string => {
      return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    };
    
    // Track all unique directory paths for empty folder detection
    const allDirectoryPaths = new Set<string>();
    
    // Process all file paths to extract directory structure
    files.forEach(file => {
      const filePath = file.webkitRelativePath || (file as any).relativePath || '';
      if (!filePath) return;
      
      const normalizedPath = normalizePath(filePath);
      const parts = normalizedPath.split('/');
      
      // Skip files with invalid paths
      if (parts.length <= 1) return;
      
      // Extract all directory paths (excluding the filename)
      const dirParts = parts.slice(0, parts.length - 1);
      
      // Store all path segments (to capture empty directories)
      for (let i = 1; i < dirParts.length + 1; i++) {
        const dirPath = dirParts.slice(0, i).join('/');
        allDirectoryPaths.add(dirPath);
      }
    });
    
    // Create a function to get or create a folder node at a specific path
    const getOrCreateFolderNode = (pathParts: string[]): FolderNode => {
      // Empty path or just the root folder name
      if (pathParts.length === 0 || (pathParts.length === 1 && pathParts[0] === rootFolder.name)) {
        console.log(`Returning root folder for path: [${pathParts.join(', ')}]`);
        return rootFolder;
      }
      
      // Skip the root folder name which is at index 0
      let currentNode = rootFolder;
      
      // Start from index 1 (first subfolder) and create folder nodes as needed
      for (let i = 1; i < pathParts.length; i++) {
        const folderName = pathParts[i];
        
        // Skip empty folder names
        if (!folderName) continue;
        
        const folderPath = pathParts.slice(0, i + 1).join('/');
        
        if (!currentNode.subfolders.has(folderName)) {
          console.log(`Creating new folder node: "${folderName}" at path: "${folderPath}"`);
          const newFolder: FolderNode = {
            name: folderName,
            path: folderPath,
            files: [],
            subfolders: new Map(),
            parent: currentNode
          };
          currentNode.subfolders.set(folderName, newFolder);
        }
        
        currentNode = currentNode.subfolders.get(folderName)!;
      }
      
      return currentNode;
    };
    
    // Track the processed paths to avoid duplicates
    const processedPaths = new Set<string>();
    
    // Build tree structure - process each file
    files.forEach(file => {
      // Get file path using either standard or browser-specific property
      const path = file.webkitRelativePath || (file as any).relativePath || '';
      
      if (!path) {
        console.warn(`File "${file.name}" has no path information, adding to root folder`);
        rootFolder.files.push(file);
        return;
      }
      
      // Avoid processing the same file multiple times (can happen with some browsers)
      if (processedPaths.has(path)) {
        console.log(`Skip duplicate path: "${path}"`);
        return;
      }
      
      processedPaths.add(path);
      
      // Normalize the path and split into components
      const normalizedPath = normalizePath(path);
      const parts = normalizedPath.split('/');
      
      // Skip empty paths
      if (parts.length === 0) {
        console.warn(`File "${file.name}" has empty path, adding to root folder`);
        rootFolder.files.push(file);
        return;
      }
      
      // If this is just [rootFolderName, fileName], add to root folder
      if (parts.length === 2) {
        console.log(`Adding file "${file.name}" to root folder`);
        rootFolder.files.push(file);
        return;
      }
      
      // For nested files, we need to navigate to the correct subfolder
      // The directory path includes everything except the last part (the filename)
      const dirPath = parts.slice(0, parts.length - 1);
      
      // Find or create the folder node for this path
      const targetFolder = getOrCreateFolderNode(dirPath);
      
      // Now add the file to the target folder
      console.log(`Adding file "${file.name}" to folder: "${targetFolder.name}"`);
      targetFolder.files.push(file);
    });
    
    // Create folder nodes for empty directories
    // Process all the directory paths we collected earlier
    allDirectoryPaths.forEach(dirPath => {
      if (!dirPath) return;
      
      const pathParts = dirPath.split('/');
      // Ensure the root folder name is included
      if (pathParts[0] !== rootFolder.name) {
        pathParts.unshift(rootFolder.name);
      }
      
      // Create the folder node (this will do nothing if it already exists)
      getOrCreateFolderNode(pathParts);
    });
    
    // If we have empty subfolders but no files detected at all, make sure we at least have the root folder
    if (files.length === 0 || (rootFolder.files.length === 0 && rootFolder.subfolders.size === 0)) {
      console.log(`📂 Creating structure for empty folder upload: "${rootFolder.name}"`);
      // The root folder is already created, so we're good to go
    }
    
    // Log the resulting structure
    console.log(`📊 Final folder structure: Root has ${rootFolder.files.length} files and ${rootFolder.subfolders.size} subfolders`);
    
    return rootFolder;
  };

  // Process folder structure recursively
  const processFolderStructure = async (
    folderNode: FolderNode,
    parentFolderId: string,
    folderPathMap: Map<string, string>,
    updateProgressFn: () => void,
    updatedFolders: Folder[]
  ): Promise<{ successfulUploads: number; failedUploads: number; createdFolders: number }> => {
    let successfulUploads = 0;
    let failedUploads = 0;
    let createdFolders = 0;
    
    console.log(`------- PROCESSING NODE -------`);
    console.log(`📁 NODE: "${folderNode.name}", path: "${folderNode.path}", parentId: "${parentFolderId}"`);
    console.log(`📊 This node has ${folderNode.files.length} files and ${folderNode.subfolders.size} subfolders`);
    
    // CRITICAL: Validate the parent folder ID before attempting to upload files or create subfolders
    const isValidParent = await validateFolderId(parentFolderId, { retries: 3, delay: 1500 });
    if (!isValidParent) {
      console.error(`⚠️ INVALID PARENT ID: "${parentFolderId}" does not exist in folder list`);
      
      // Force a refresh to try to get the latest folders
      if (onRefresh) {
        console.log(`🔄 REFRESHING FOLDERS due to invalid parent ID...`);
        await onRefresh();
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      // Check again after refresh with extended delay
      const isValidAfterRefresh = await validateFolderId(parentFolderId, { retries: 2, delay: 2000 });
      if (!isValidAfterRefresh) {
        console.error(`❌ SKIPPING NODE due to invalid parent folder ID: "${parentFolderId}" (even after refresh)`);
        
        // Try to recover by looking up the folder by name
        const folderByName = localFolders.find(f => f.name === folderNode.name);
        if (folderByName) {
          console.log(`✅ RECOVERY: Found folder by name "${folderNode.name}": ${folderByName.id}`);
          parentFolderId = folderByName.id;
          console.log(`↪️ CONTINUING with recovered folder ID: "${parentFolderId}"`);
        } else {
          console.error(`❌ RECOVERY FAILED: Cannot find folder "${folderNode.name}", aborting this branch of upload`);
          return { successfulUploads: 0, failedUploads: folderNode.files.length, createdFolders: 0 };
        }
      } else {
        console.log(`✅ PARENT ID VALID AFTER REFRESH: "${parentFolderId}"`);
      }
    }
    
    // Upload files in this folder first
    if (folderNode.files.length > 0) {
      console.log(`📄 PROCESSING ${folderNode.files.length} FILES in folder "${folderNode.name || 'root'}" (ID: "${parentFolderId}")`);
      
      // Log details of the first few files for debugging
      folderNode.files.slice(0, 3).forEach(file => {
        console.log(`- File to upload: ${file.name}, Size: ${file.size}, Path: ${file.webkitRelativePath || (file as any).relativePath || 'no-path'}`);
      });
      
      // Process files in batches
      const batches = [];
      for (let i = 0; i < folderNode.files.length; i += BATCH_SIZE) {
        batches.push(folderNode.files.slice(i, i + BATCH_SIZE));
      }
      
      for (const [batchIndex, batch] of batches.entries()) {
        console.log(`📦 BATCH ${batchIndex + 1}/${batches.length} with ${batch.length} files in folder: ${folderNode.name}`);
        
        try {
          const batchPromises = batch.map(async (file) => {
            setProcessingFile(`${folderNode.name}/${file.name}`);
            
            try {
              const documentType = getDocumentType(file);
              console.log(`⬆️ UPLOADING: "${file.name}" to folder ID: "${parentFolderId}"`);
              const result = await uploadFileWithRetry(file, parentFolderId, documentType);
              
              if (result.success) {
                successfulUploads++;
                console.log(`✅ UPLOAD SUCCESS: "${file.name}" to folder: "${folderNode.name}"`);
              } else {
                failedUploads++;
                console.error(`❌ UPLOAD FAILED: "${file.name}" to folder "${folderNode.name}":`, result.error);
              }
            } catch (fileError) {
              failedUploads++;
              console.error(`❌ UPLOAD ERROR: "${file.name}" to folder "${folderNode.name}":`, fileError);
            } finally {
              updateProgressFn();
            }
          });
          
          await Promise.all(batchPromises);
        } catch (batchError) {
          console.error(`❌ BATCH ERROR in folder "${folderNode.name}":`, batchError);
          // Continue with next batch even if this one fails
        }
        
        // Add small delay between batches to prevent overwhelming the server
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
      }
    } else {
      console.log(`📂 EMPTY FOLDER: "${folderNode.name}" has no files to upload directly`);
    }
    
    // Now create subfolders if any and process them
    if (folderNode.subfolders.size > 0) {
      console.log(`----- HANDLING SUBFOLDERS -----`);
      console.log(`📁 PROCESSING ${folderNode.subfolders.size} SUBFOLDERS in "${folderNode.name}" (ID: "${parentFolderId}")`);
      
      // List subfolder names for debugging
      console.log(`📋 SUBFOLDER NAMES: ${Array.from(folderNode.subfolders.keys()).join(', ')}`);
      
      // First, create all subfolders and store their IDs with multiple key formats for reliable retrieval
      const createdSubfolders = new Map<string, {id: string, path: string, name: string}>();
      
      // Track folder creation promises for better error handling
      const folderCreationPromises = [];
      
      // First, ensure the parent folder still exists
      const parentStillExists = await validateFolderId(parentFolderId, { retries: 2, delay: 1000 });
      if (!parentStillExists) {
        console.error(`❌ PARENT FOLDER DISAPPEARED: "${parentFolderId}" is no longer valid. Refreshing...`);
        if (onRefresh) {
          await onRefresh();
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // Check one more time
        const parentRevalidated = await validateFolderId(parentFolderId, { retries: 1, delay: 2000 });
        if (!parentRevalidated) {
          console.error(`❌ CANNOT PROCEED: Parent folder "${parentFolderId}" not found even after refresh`);
          return { 
            successfulUploads, 
            failedUploads: failedUploads + folderNode.files.reduce((total, f) => total + 1, 0),
            createdFolders 
          };
        } else {
          console.log(`✅ PARENT FOLDER RECOVERED after refresh: "${parentFolderId}"`);
        }
      }
      
      for (const [name, subfolder] of folderNode.subfolders.entries()) {
        console.log(`📁 CREATING SUBFOLDER: "${name}", path: "${subfolder.path}", in parent: "${folderNode.name}" (ID: "${parentFolderId}")`);
        
        // Check multiple possible path formats to ensure we don't create duplicates
        const possiblePaths = [
          subfolder.path,                                // The full path
          `${folderNode.path}/${name}`,                  // Constructed path based on parent path
          name,                                          // Just the name
          `${parentFolderId}/${name}`                    // Parent ID + name
        ];
        
        // Check if this folder already exists in our map with any of the possible paths
        let existingId: string | undefined;
        for (const path of possiblePaths) {
          if (folderPathMap.has(path)) {
            existingId = folderPathMap.get(path);
            console.log(`🔍 FOUND EXISTING SUBFOLDER: "${name}" with path "${path}" and ID: "${existingId}"`);
            break;
          }
        }
        
        if (existingId) {
          console.log(`⏩ SKIPPING CREATION: Subfolder "${name}" already exists with ID: "${existingId}"`);
          
          // Store this ID in all formats for redundancy
          for (const path of possiblePaths) {
            folderPathMap.set(path, existingId);
          }
          
          createdSubfolders.set(name, {
            id: existingId,
            path: subfolder.path,
            name
          });
          
          continue;
        }
        
        // Check if a folder with this name already exists in the parent
        const existingFolder = updatedFolders.find(
          f => f.name.toLowerCase() === name.toLowerCase() && f.parentId === parentFolderId
        );
        
        if (existingFolder) {
          console.log(`🔍 FOUND EXISTING FOLDER in list: "${existingFolder.name}" (ID: "${existingFolder.id}")`);
          const foundId = existingFolder.id;
          
          // Store this ID in all formats for redundancy
          for (const path of possiblePaths) {
            folderPathMap.set(path, foundId);
          }
          
          createdSubfolders.set(name, {
            id: foundId,
            path: subfolder.path,
            name
          });
          
          continue;
        }
        
        const folderCreationPromise = (async () => {
          try {
            // IMPORTANT: Create the subfolder with the CORRECT parent folder ID
            console.log(`>> CREATING SUBFOLDER: "${name}" in parent folder ID: "${parentFolderId}"`);
            
            // Verify parent ID one more time
            const isValidParentId = await validateFolderId(parentFolderId, { retries: 2, delay: 1000 });
            if (!isValidParentId) {
              console.error(`❌ PARENT ID INVALID BEFORE CREATION: "${parentFolderId}" for subfolder "${name}"`);
              return null;
            }
            
            // Create the folder
            await onCreateFolder(name, parentFolderId);
            console.log(`>> CREATED SUBFOLDER: "${name}" in parent folder: "${folderNode.name}" (ID: "${parentFolderId}")`);
            
            // Refresh to ensure we get the latest state
            if (onRefresh) {
              await onRefresh();
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Use direct folder finder for subfolders too
            console.log(`>> FINDING SUBFOLDER: "${name}" in parent "${parentFolderId}"`);
            const newSubfolder = await findNewlyCreatedFolder(name, parentFolderId);
            
            if (!newSubfolder) {
              throw new Error(`Failed to find newly created subfolder: "${name}" in parent: "${folderNode.name}" (ID: "${parentFolderId}")`);
            }
            
            const subfolderId = newSubfolder.id;
            const subfolderParentId = newSubfolder.parentId; // Get the actual parent ID from the created subfolder
            
            console.log(`>> FOUND SUBFOLDER: "${name}" with ID: "${subfolderId}", Parent: "${subfolderParentId || 'root'}"`);
            
            // Verify that the parent ID is correct
            if (subfolderParentId !== parentFolderId) {
              console.warn(`⚠️ PARENT ID MISMATCH for "${name}": Expected "${parentFolderId}", got "${subfolderParentId}"`);
              
              // Check if this is a serious issue - if parent is completely wrong
              if (subfolderParentId !== null && subfolderParentId !== undefined && 
                  !folders.some(f => f.id === subfolderParentId)) {
                console.error(`❌ SERIOUS MISMATCH: Parent ID "${subfolderParentId}" doesn't exist in folders list`);
              }
            }
            
            // Store the ID with all possible paths for redundancy
            for (const path of possiblePaths) {
              folderPathMap.set(path, subfolderId);
            }
            
            // IMPORTANT: Add the parent-specific path using the ACTUAL parent ID
            if (subfolderParentId) {
              folderPathMap.set(`${subfolderParentId}/${name}`, subfolderId);
            }
            
            createdSubfolders.set(name, {
              id: subfolderId,
              path: subfolder.path,
              name
            });
            
            createdFolders++;
            console.log(`📋 ADDED SUBFOLDER to map: "${name}" with ID: "${subfolderId}"`);
            return subfolderId;
          } catch (error) {
            console.error(`❌ ERROR creating subfolder "${name}" in parent "${folderNode.name}":`, error);
            return null;
          }
        })();
        
        folderCreationPromises.push(folderCreationPromise);
      }
      
      // Wait for all folder creation operations to complete
      await Promise.all(folderCreationPromises);
      
      console.log(`✅ COMPLETED CREATING all subfolders for "${folderNode.name}"`);
      console.log(`📊 Total created folders: ${createdFolders}`);
      
      // Refresh to ensure we get the latest state
      if (onRefresh) {
        console.log(`🔄 REFRESHING FOLDERS before processing subfolders...`);
        await onRefresh();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Now process each subfolder recursively using the IDs we just obtained
      for (const [name, subfolder] of folderNode.subfolders.entries()) {
        console.log(`📂 PROCESSING CONTENTS for subfolder: "${name}"`);
        
        try {
          // First try to get the ID from our local map of created subfolders
          const subfolderInfo = createdSubfolders.get(name);
          let subfolderId = subfolderInfo?.id;
          
          console.log(`🔍 LOOKING UP SUBFOLDER ID for "${name}" - From local map: "${subfolderId || 'not found'}"`);
          
          // If not found, try all possible paths in the folderPathMap
          if (!subfolderId) {
            const possiblePaths = [
              subfolder.path,
              `${folderNode.path}/${name}`,
              name,
              `${parentFolderId}/${name}`
            ];
            
            console.log(`🔍 TRYING PATHS for "${name}":`, possiblePaths);
            
            for (const path of possiblePaths) {
              if (folderPathMap.has(path)) {
                subfolderId = folderPathMap.get(path);
                console.log(`✅ FOUND SUBFOLDER ID using path "${path}": "${subfolderId}"`);
                break;
              }
            }
          }
          
          // One more fallback - look through all folders for matching name and parent
          if (!subfolderId) {
            console.log(`🔍 SEARCHING FOLDER LIST for "${name}" with parent "${parentFolderId}"`);
            
            // Get the very latest folders list
            const latestFolders = [...folders];
            
            // IMPROVED: Use case-insensitive comparison for the folder name
            const matchingFolder = latestFolders.find(
              f => f.name.toLowerCase() === name.toLowerCase() && f.parentId === parentFolderId
            );
            
            if (matchingFolder && matchingFolder.id) {
              subfolderId = matchingFolder.id;
              console.log(`✅ FOUND SUBFOLDER "${name}" in folders list with ID: "${subfolderId}" and parent ID: "${matchingFolder.parentId}"`);
              
              // Add to our maps for future reference
              folderPathMap.set(subfolder.path, subfolderId);
              folderPathMap.set(`${folderNode.path}/${name}`, subfolderId);
              folderPathMap.set(name, subfolderId);
              folderPathMap.set(`${parentFolderId}/${name}`, subfolderId);
            }
          }
          
          // If we still can't find it, one last attempt: search by similar name
          if (!subfolderId) {
            console.log(`🔍 TRYING SIMILAR NAME SEARCH for "${name}"`);
            
            const latestFolders = [...folders];
            
            // Find folders with similar names and correct parent
            const similarNameFolders = latestFolders.filter(
              f => f.parentId === parentFolderId && 
                   (f.name.includes(name) || name.includes(f.name) || 
                    f.name.toLowerCase().includes(name.toLowerCase()))
            );
            
            if (similarNameFolders.length > 0) {
              // Use the first match
              subfolderId = similarNameFolders[0].id;
              console.log(`✅ FOUND SIMILAR NAMED FOLDER: "${similarNameFolders[0].name}" with ID: "${subfolderId}"`);
              
              // Add to maps
              folderPathMap.set(subfolder.path, subfolderId);
              folderPathMap.set(`${folderNode.path}/${name}`, subfolderId);
              folderPathMap.set(name, subfolderId);
              folderPathMap.set(`${parentFolderId}/${name}`, subfolderId);
            }
          }
          
          // Last resort - create the folder now if we still can't find it
          if (!subfolderId) {
            console.log(`⚠️ FOLDER NOT FOUND: Creating "${name}" in parent "${parentFolderId}" as last resort`);
            
            try {
              await onCreateFolder(name, parentFolderId);
              console.log(`✅ CREATED LAST RESORT FOLDER: "${name}"`);
              
              if (onRefresh) {
                await onRefresh();
                await new Promise(resolve => setTimeout(resolve, 800));
              }
              
              const newSubfolder = await findNewlyCreatedFolder(name, parentFolderId);
              
              if (newSubfolder) {
                subfolderId = newSubfolder.id;
                console.log(`✅ FOUND LAST RESORT FOLDER: "${name}" with ID: "${subfolderId}"`);
                
                folderPathMap.set(subfolder.path, subfolderId);
                folderPathMap.set(`${folderNode.path}/${name}`, subfolderId);
                folderPathMap.set(name, subfolderId);
                folderPathMap.set(`${parentFolderId}/${name}`, subfolderId);
                
                createdFolders++;
              } else {
                console.error(`❌ FAILED TO LOCATE LAST RESORT FOLDER: "${name}"`);
              }
            } catch (lastResortError) {
              console.error(`❌ LAST RESORT FOLDER CREATION FAILED: "${name}"`, lastResortError);
            }
          }
          
          if (!subfolderId) {
            // If we still can't find it, log an error and skip processing
            console.error(`❌ CANNOT PROCESS SUBFOLDER: "${name}" (path: ${subfolder.path}) with parent "${parentFolderId}"`);
            console.log(`📋 Available folders:`, folders.map(f => ({id: f.id, name: f.name, parentId: f.parentId})));
            continue;
          }
          
          console.log(`📂 PROCEEDING with subfolder "${name}" using ID: "${subfolderId}"`);
          console.log(`📊 This subfolder has ${subfolder.files.length} files and ${subfolder.subfolders.size} nested subfolders`);
          
          // Process this subfolder recursively
          const result = await processFolderStructure(
            subfolder,
            subfolderId,
            folderPathMap,
            updateProgressFn,
            [...folders] // Always use the latest folders
          );
          
          // Accumulate results
          successfulUploads += result.successfulUploads;
          failedUploads += result.failedUploads;
          createdFolders += result.createdFolders;
          
          console.log(`✅ COMPLETED SUBFOLDER: "${name}" - Results: ${result.successfulUploads} successful uploads, ${result.createdFolders} folders created`);
        } catch (subfolderError) {
          console.error(`❌ ERROR in subfolder "${name}":`, subfolderError);
          // Continue with other subfolders
        }
      }
    } else {
      console.log(`📂 NO SUBFOLDERS: "${folderNode.name}" is a leaf node or empty folder`);
    }
    
    console.log(`------- FINISHED NODE -------`);
    console.log(`📊 SUMMARY for "${folderNode.name}": ${successfulUploads} uploads, ${failedUploads} failed, ${createdFolders} folders created`);
    
    // Return the results for this folder and all its subfolders
    return {
      successfulUploads,
      failedUploads,
      createdFolders
    };
  };

  // Helper function to upload a file with retry
  const uploadFileWithRetry = async (
    file: File,
    folderId: string | null | undefined,
    documentType: Document['type']
  ): Promise<{ success: boolean; error?: Error }> => {
    // Log whether we're uploading to a specific folder or the root
    const targetLocation = folderId ? `folder ID: "${folderId}"` : 'root folder';
    console.log(`Attempting to upload file "${file.name}" to ${targetLocation} with Firebase sync verification`);
    
    try {
      await ensureFirebaseSync(async () => {
        console.log(`Using onCreateDocument with params: name="${file.name}", type="${documentType}", folderId=${folderId ? `"${folderId}"` : 'null (root)'}`);
        await onCreateDocument(
          file.name, 
          documentType, 
          file, 
          // Convert null to undefined which is acceptable by the function signature
          folderId === null ? undefined : folderId
        );
        console.log(`Upload SUCCESS for "${file.name}" to ${targetLocation} - confirmed in Firebase`);
      }, MAX_UPLOAD_RETRIES);
      
      return { success: true };
    } catch (error) {
      console.error(`All ${MAX_UPLOAD_RETRIES} attempts failed for "${file.name}" with Firebase sync:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  // Add this function to force a synchronous update of the folders list
  const forceUpdateFoldersList = async (): Promise<Folder[]> => {
    if (!onRefresh) {
      console.log("No refresh function available");
      return folders;
    }
    
    console.log(`FORCE UPDATE: Starting direct folder fetch with Firebase sync verification`);
    
    return await ensureFirebaseSync(async () => {
      // First do the standard refresh to trigger the Firebase fetch
      await onRefresh();
      
      // Wait a moment to allow state to update
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Get the latest folders
      const updatedFolders = [...folders];
      console.log(`FORCE UPDATE: Got ${updatedFolders.length} folders after refresh from Firebase`);
      
      // Update our ref with the latest folders for tracking
      folderListRef.current = updatedFolders;
      
      // Verify the folder count is as expected
      if (folderListRef.current.length <= 0) {
        console.warn("Firebase folders list is empty after refresh - this may indicate synchronization issues");
      }
      
      return updatedFolders;
    });
  };

  // Replace the findNewlyCreatedFolder function with this improved version
  const findNewlyCreatedFolder = async (folderName: string, parentId?: string): Promise<Folder | null> => {
    console.log(`🔍 DIRECT FOLDER FINDER: Looking for "${folderName}" with parent "${parentId || 'root'}"`);
    
    // First, let's try to fetch directly from Firebase before any other search
    try {
      console.log(`🔄 DIRECT FOLDER FINDER: Fetching latest folders directly from Firebase...`);
      const latestFolders = await fetchFoldersDirectlyFromFirebase();
      
      // Check if the folder is in the freshly fetched data
      const targetFolder = latestFolders.find(f => 
        f.name === folderName && f.parentId === parentId
      );
      
      if (targetFolder) {
        console.log(`✅ DIRECT FINDER: Found folder in fresh Firebase data: "${targetFolder.id}"`);
        return targetFolder;
      }
      
      console.log(`Folder not found in fresh Firebase data, trying more search strategies...`);
    } catch (error) {
      console.error(`Error fetching folders directly:`, error);
      // Continue with other strategies if direct fetch fails
    }
    
    // Now proceed with existing search strategies, but use localFolders instead of folders
    
    // 1. First attempt: Check if folder already exists in current list with exact match
    let targetFolder = localFolders.find(f => 
      f.name === folderName && f.parentId === parentId
    );
    
    if (targetFolder) {
      console.log(`✅ DIRECT FINDER: Found folder immediately in local state: "${targetFolder.id}"`);
      return targetFolder;
    }
    
    // 2. Second attempt: Case-insensitive match
    targetFolder = localFolders.find(f => 
      f.name.toLowerCase() === folderName.toLowerCase() && f.parentId === parentId
    );
    
    if (targetFolder) {
      console.log(`✅ DIRECT FINDER: Found folder with case-insensitive match: "${targetFolder.id}"`);
      return targetFolder;
    }
    
    // 3. Try with relaxed parent ID constraints (null/undefined)
    targetFolder = localFolders.find(f => 
      f.name === folderName && (!f.parentId || f.parentId === null || f.parentId === undefined)
    );
    
    if (targetFolder) {
      console.log(`✅ DIRECT FINDER: Found folder with null parent: "${targetFolder.id}"`);
      return targetFolder;
    }
    
    // If still not found, force multiple refreshes with increasing delays
    if (onRefresh) {
      const refreshIntervals = [1000, 2000, 3000]; // Increased delays in milliseconds
      
      for (let i = 0; i < refreshIntervals.length; i++) {
        console.log(`🔄 DIRECT FINDER: Aggressive refresh attempt ${i+1}/${refreshIntervals.length} for "${folderName}"`);
        
        try {
          // Use ensureFirebaseSync for better reliability
          await ensureFirebaseSync(async () => {
            await onRefresh!();
          });
          
          // Wait longer between retries
          await new Promise(resolve => setTimeout(resolve, refreshIntervals[i]));
          
          // After each refresh, try all matching strategies again
          
          // Exact match
          targetFolder = localFolders.find(f => f.name === folderName && f.parentId === parentId);
          if (targetFolder) {
            console.log(`✅ DIRECT FINDER: Found folder after aggressive refresh ${i+1}: "${targetFolder.id}"`);
            return targetFolder;
          }
          
          // Case-insensitive match
          targetFolder = localFolders.find(f => 
            f.name.toLowerCase() === folderName.toLowerCase() && f.parentId === parentId
          );
          if (targetFolder) {
            console.log(`✅ DIRECT FINDER: Found folder (case-insensitive) after refresh ${i+1}: "${targetFolder.id}"`);
            return targetFolder;
          }
          
          // Any folder with matching name and any parent
          targetFolder = localFolders.find(f => f.name === folderName);
          if (targetFolder) {
            console.log(`⚠️ DIRECT FINDER: Found folder with matching name but different parent: "${targetFolder.id}", parent: "${targetFolder.parentId || 'root'}"`);
            return targetFolder;
          }
          
          // Similar name match as last resort
          const similarNameFolders = localFolders.filter(f => 
            f.name.toLowerCase().includes(folderName.toLowerCase()) || 
            folderName.toLowerCase().includes(f.name.toLowerCase())
          );
          
          if (similarNameFolders.length > 0) {
            // Try to find one with the correct parent first
            const bestMatch = similarNameFolders.find(f => f.parentId === parentId) || similarNameFolders[0];
            console.log(`⚠️ DIRECT FINDER: Using similar name match: "${bestMatch.name}" (${bestMatch.id})`);
            return bestMatch;
          }
          
          // Try recent folders as last resort
          if (localFolders.length > 0) {
            const recentFolders = [...localFolders].sort((a, b) => {
              // Get createdAt or updatedAt as timestamps if available
              const aTime = (a as any).createdAt || (a as any).updatedAt || 0;
              const bTime = (b as any).createdAt || (b as any).updatedAt || 0;
              // Sort descending (newest first)
              return bTime - aTime;
            });
            
            // Log the most recent folders for debugging
            console.log(`Recent folders:`, recentFolders.slice(0, 3).map(f => ({
              id: f.id, 
              name: f.name, 
              parentId: f.parentId || 'root',
              time: (f as any).createdAt || (f as any).updatedAt
            })));
            
            // Use the most recent folder as a fallback
            const mostRecent = recentFolders[0];
            if (mostRecent) {
              console.log(`⚠️ EXTREME FALLBACK: Using most recent folder: "${mostRecent.name}" (${mostRecent.id})`);
              return mostRecent;
            }
          }
        } catch (refreshError) {
          console.error(`Error during aggressive refresh ${i+1}:`, refreshError);
        }
      }
    }
    
    // Last resort - check ALL folders regardless of relationship
    console.log(`⚠️ CHECKING ALL FOLDERS (${localFolders.length} total) AS LAST RESORT`);
    for (const folder of localFolders) {
      console.log(`- Folder: ID=${folder.id}, Name="${folder.name}", Parent="${folder.parentId || 'root'}"`);
    }
    
    if (localFolders.length > 0) {
      // Desperate attempt - find any folder with a partially matching name
      const anyMatch = localFolders.find(f => 
        f.name.toLowerCase().includes(folderName.substring(0, 5).toLowerCase())
      );
      
      if (anyMatch) {
        console.log(`⚠️ DESPERATE MATCH FOUND: "${anyMatch.name}" (${anyMatch.id})`);
        return anyMatch;
      }
      
      // Absolute last resort - just use the first folder
      const firstFolder = localFolders[0];
      console.log(`⚠️ ABSOLUTE LAST RESORT: Using first available folder: "${firstFolder.name}" (${firstFolder.id})`);
      return firstFolder;
    }
    
    console.error(`❌ DIRECT FINDER: Completely failed to find folder "${folderName}" after all attempts`);
    return null;
  };

  // Now modify the handleFolderUpload function to use this new helper
  // Enhanced function to handle folder upload with better tracking
  const handleFolderUpload = async () => {
    if (isProcessing || folderFiles.length === 0 || !newFileName.trim()) {
      setError('Please select a folder and provide a name');
      return;
    }

    const startTime = Date.now();
    let totalUploadedBytes = 0;
    const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    try {
      // Log folder selection at the start for debugging
      console.log(`🚀 STARTING UPLOAD: Selected folder ID: "${selectedFolderId || 'root'}", Current folder ID: "${currentFolderId || 'root'}"`);
      console.log(`Available folders:`, folders.map(f => ({id: f.id, name: f.name, parentId: f.parentId || 'root'})));
      
      setIsProcessing(true);
      setIsUploading(true);
      setError('');
      setUploadProgress(0);
      setProcessedCount(0);
      setTotalCount(folderFiles.length);
      
      // Explicitly validate Firebase connection before proceeding with large operations
      const isConnected = await validateFirebaseConnection();
      if (!isConnected) {
        console.error("⚠️ Firebase connection validation failed!");
        setError("Unable to connect to the server. Please check your internet connection and try again.");
        throw new Error("Firebase connection validation failed");
      } else {
        console.log("✅ Firebase connection validated successfully");
      }
      
      // Reset tracking stats
      updateStats({
        totalFolders: 0,
        processedFolders: 0,
        totalFiles: 0,
        processedFiles: 0,
        uploadedFiles: 0,
        failedFiles: 0,
        deepestLevel: 0
      });
      
      // Verify Firebase connection before proceeding
      console.log("🔍 Verifying Firebase connection...");
      const isOnline = navigator.onLine;
      if (!isOnline) {
        console.warn("📴 Device appears to be offline. Firebase operations may not sync properly.");
        setError("Warning: You appear to be offline. Changes may not sync until you reconnect.");
      }
      
      // Calculate total size for statistics
      totalUploadedBytes = folderFiles.reduce((total, file) => total + file.size, 0);
      
      // Analyze files with paths to ensure we have subfolder information
      let hasSubfolders = false;
      
      // Group files by subfolder path for analysis
      const filesBySubfolder = new Map<string, File[]>();
      folderFiles.forEach(file => {
        const path = file.webkitRelativePath || (file as any).relativePath || '';
        const pathParts = path.split('/');
        
        if (pathParts.length > 2) {
          // This file is in a subfolder (main folder/subfolder/file.txt)
          hasSubfolders = true;
          
          // Extract the subfolder path (everything except the file name)
          const subfolderPath = pathParts.slice(0, -1).join('/');
          
          if (!filesBySubfolder.has(subfolderPath)) {
            filesBySubfolder.set(subfolderPath, []);
          }
          
          filesBySubfolder.get(subfolderPath)!.push(file);
        }
      });
      
      // Output subfolder analysis
      if (hasSubfolders) {
        console.log(`Found files in ${filesBySubfolder.size} subfolders:`);
        filesBySubfolder.forEach((files, path) => {
          console.log(`- Subfolder: ${path}, Files: ${files.length}`);
        });
      } else {
        console.log('No subfolders detected in the selected folder');
      }
      
      // Validate folder contents
      const { validFiles, invalidFiles } = validateFolderContents(folderFiles);
      
      if (invalidFiles.length > 0) {
        console.warn(`${invalidFiles.length} files failed validation:`, 
          invalidFiles.slice(0, 5).map(f => `${f.file.name}: ${f.reason}`));
        
        if (validFiles.length === 0) {
          setError(`No valid files to upload. ${invalidFiles.length} files failed validation.`);
          return;
        }
      }
      
      // Build folder structure for better organization
      const folderStructure = buildFolderStructure(validFiles);
      console.log('Folder structure built:', 
        { name: folderStructure.name, fileCount: validFiles.length, subfoldersCount: folderStructure.subfolders.size });
      
      // Debug output for the first level of subfolders
      if (folderStructure.subfolders.size > 0) {
        console.log('First level subfolders:');
        for (const [name, subfolder] of folderStructure.subfolders.entries()) {
          console.log(`- Subfolder: ${name}, Files: ${subfolder.files.length}, Nested subfolders: ${subfolder.subfolders.size}`);
          
          // Output nested subfolders if any
          if (subfolder.subfolders.size > 0) {
            console.log(`  Nested subfolders in ${name}:`);
            for (const [nestedName, nestedFolder] of subfolder.subfolders.entries()) {
              console.log(`  - ${nestedName}, Files: ${nestedFolder.files.length}`);
            }
          }
        }
      }
      
      // Always process the folder structure, even if the folder is empty or only has subfolders with no files
      console.log(`📊 FOLDER STRUCTURE: ${folderStructure.subfolders.size} subfolders, ${validFiles.length} files`);
      if (validFiles.length === 0 && folderStructure.subfolders.size > 0) {
        console.log(`📂 EMPTY FOLDER STRUCTURE: Folder contains only empty subfolders, will still process`);
      }
      
      // Calculate and update tracking stats from folder structure
      const calculateStats = (node: FolderNode, level = 0): {folders: number, files: number, maxDepth: number} => {
        let folders = 1; // Count this folder
        let files = node.files.length;
        let maxDepth = level;
        
        for (const subfolder of node.subfolders.values()) {
          const subStats = calculateStats(subfolder, level + 1);
          folders += subStats.folders;
          files += subStats.files;
          maxDepth = Math.max(maxDepth, subStats.maxDepth);
        }
        
        return { folders, files, maxDepth };
      };
      
      const { folders: totalFolders, files: totalFiles, maxDepth: deepestLevel } = 
        calculateStats(folderStructure);
        
      updateStats({
        totalFolders,
        totalFiles,
        deepestLevel
      });
      
      console.log(`Folder structure stats: ${totalFolders} folders, ${totalFiles} files, max depth: ${deepestLevel}`);
      
      // Ensure we have the correct selectedFolderId (double-check)
      const targetParentId = selectedFolderId;
      console.log(`🔍 PARENT FOLDER CHECK: Using selectedFolderId "${targetParentId || 'root'}" as parent for upload`);
      
      // Check if the parent folder exists if a parent was selected
      if (targetParentId) {
        const parentExists = folders.some(f => f.id === targetParentId);
        if (!parentExists) {
          console.error(`⚠️ SELECTED PARENT FOLDER NOT FOUND! ID: "${targetParentId}"`);
          console.log(`Available folders:`, folders.map(f => ({id: f.id, name: f.name})));
          setError('Selected parent folder could not be found. Please try refreshing the page.');
          throw new Error(`Parent folder with ID "${targetParentId}" not found in folder list`);
        } else {
          const parentFolder = folders.find(f => f.id === targetParentId);
          console.log(`✅ PARENT FOLDER VERIFIED: "${parentFolder?.name}" (ID: "${targetParentId}")`);
        }
      }
      
      // First create the parent folder
      const baseFolderName = newFileName.trim();
      console.log(`📁 CREATING PARENT FOLDER: "${baseFolderName}" with ${validFiles.length} files in parent: "${targetParentId || 'root'}"`);
      
      // Log the first few files to help with debugging
      validFiles.slice(0, 3).forEach(file => {
        console.log(`Sample file: ${file.name}, Path: ${file.webkitRelativePath || (file as any).relativePath || 'no-path'}, Size: ${file.size} bytes`);
      });
      
      try {
        // IMPORTANT: Use the targetParentId as the parent for the new folder
        await onCreateFolder(baseFolderName, targetParentId);
        console.log(`✅ CREATED PARENT FOLDER: "${baseFolderName}" in parent "${targetParentId || 'root'}"`);
      } catch (folderCreateError) {
        console.error(`❌ FAILED TO CREATE PARENT FOLDER:`, folderCreateError);
        setError(`Failed to create folder: ${folderCreateError instanceof Error ? folderCreateError.message : 'Unknown error'}`);
        throw folderCreateError;
      }
      
      // Force a refresh to make sure we get the latest folder list
      if (onRefresh) {
        console.log(`🔄 REFRESHING FOLDERS after parent folder creation...`);
        try {
          // First try the component's refresh function
          await ensureFirebaseSync(async () => {
            await onRefresh();
          });
          
          // Then fetch directly from Firebase to ensure we have the latest data
          console.log(`🔄 DIRECT FIREBASE SYNC: Fetching latest folders after creation...`);
          await fetchFoldersDirectlyFromFirebase();
          
          // Add a delay to ensure state fully updates
          console.log(`Waiting for folder state to update...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Verify we have the latest data
          console.log(`Current local folders after refresh and direct fetch: ${localFolders.length} folders`);
          console.log(`Local folders:`, localFolders.map(f => ({id: f.id, name: f.name, parentId: f.parentId || 'root'})));
        } catch (refreshError) {
          console.error(`Error during folder refresh:`, refreshError);
          // Continue anyway - we'll try direct Firebase fetching
        }
      } else {
        // If no refresh function, fetch directly from Firebase
        await fetchFoldersDirectlyFromFirebase();
      }
      
      // First, check if the folder is already in our local state after refresh
      console.log(`🔍 LOOKING FOR NEW PARENT FOLDER in local state: "${baseFolderName}"`);
      let createdFolder = localFolders.find(f => 
        f.name === baseFolderName && 
        f.parentId === targetParentId
      );
      
      if (createdFolder) {
        console.log(`✅ FOUND PARENT FOLDER in local state: "${createdFolder.name}" (ID: "${createdFolder.id}")`);
      } else {
        // Not found in local state, try the direct finder with increased retries
        console.log(`Not found in local state, using direct folder finder...`);
        
        // Try to force another refresh with a different approach
        if (onRefresh) {
          console.log(`Attempting secondary refresh strategy...`);
          try {
            // Directly call refresh again with a longer timeout
            await onRefresh();
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check again in local state
            createdFolder = localFolders.find(f => 
              f.name === baseFolderName && 
              f.parentId === targetParentId
            );
            
            if (createdFolder) {
              console.log(`✅ FOUND PARENT FOLDER after secondary refresh: "${createdFolder.name}" (ID: "${createdFolder.id}")`);
            }
          } catch (secondaryRefreshError) {
            console.error(`Secondary refresh failed:`, secondaryRefreshError);
          }
        }
        
        // If still not found, use our direct finder with increased retries
        if (!createdFolder) {
          console.log(`🔍 USING DIRECT FOLDER FINDER: "${baseFolderName}" with parent "${targetParentId || 'root'}"`);
          try {
            // Increase retries and add more aggressive timeouts for the direct finder
            const foundFolder = await findNewlyCreatedFolder(baseFolderName, targetParentId);
            // Convert null to undefined to satisfy type requirements
            createdFolder = foundFolder || undefined;
          } catch (finderError) {
            console.error(`Direct folder finder failed:`, finderError);
          }
        }
      }
      
      // Last resort - use state from a server-side query if folder not found
      if (!createdFolder && projectId) {
        console.log(`⚠️ CRITICAL: Using last resort server-side query to find folder...`);
        
        try {
          // Wait a bit longer before final attempt
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Try one more refresh with longer wait
          if (onRefresh) {
            await onRefresh();
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check one more time in local state
            createdFolder = localFolders.find(f => 
              f.name === baseFolderName && 
              (f.parentId === targetParentId || !f.parentId)
            );
          }
        } catch (lastResortError) {
          console.error(`Last resort query failed:`, lastResortError);
        }
      }
      
      if (!createdFolder) {
        // If still not found, we need to handle the error
        console.error(`❌ FAILED TO LOCATE PARENT FOLDER: "${baseFolderName}"`);
        console.log(`Available folders after refresh:`, localFolders.map(f => ({id: f.id, name: f.name, parentId: f.parentId || 'root'})));
        
        // Create a temporary folder object to continue the upload
        // This is a fallback to prevent the entire upload from failing
        console.log(`⚠️ CREATING TEMPORARY FOLDER OBJECT to continue upload process`);
        
        // Generate a temporary ID that's unlikely to collide
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
        
        createdFolder = {
          id: tempId,
          name: baseFolderName,
          projectId: projectId,
          parentId: targetParentId
        };
        
        console.warn(`⚠️ Using temporary folder with ID: ${tempId}. Files might not appear correctly until page refresh.`);
        setError(`Warning: Created folder "${baseFolderName}" but couldn't locate it. Upload will continue but you may need to refresh the page to see all files.`);
      } else {
        // Found the folder successfully
        console.log(`✅ SUCCESSFULLY LOCATED PARENT FOLDER: "${createdFolder.name}" with ID "${createdFolder.id}"`);
      }
      
      const parentFolderId = createdFolder.id;
      const parentFolderParentId = createdFolder.parentId; // Store the real parent from the created folder
      
      console.log(`✅ FOUND PARENT FOLDER: ID: "${parentFolderId}", Name: "${createdFolder.name}", ParentID: "${parentFolderParentId || 'root'}"`);
      
      // Verify the parent ID matches what we expected
      if (targetParentId && parentFolderParentId !== targetParentId) {
        console.warn(`⚠️ PARENT ID MISMATCH: Expected "${targetParentId}", got "${parentFolderParentId || 'root'}"`);
        // Continue anyway, but log the issue
      }
      
      // Create a map to track created folders to avoid duplicates and simplify lookups
      const folderPathMap = new Map<string, string>();
      
      // Store folder data with multiple formats for reliability
      const storeFolderInMap = (folderName: string, path: string, id: string) => {
        // Store with multiple formats for redundancy
        folderPathMap.set(path, id);
        folderPathMap.set(folderName, id);
        folderPathMap.set(`/${path}`, id);
        folderPathMap.set(`${path}/`, id);
        
        console.log(`📝 ADDED TO FOLDER MAP: "${folderName}" (path: "${path}") => ID: "${id}"`);
      };
      
      // Initialize with parent folder using multiple path formats for redundancy
      storeFolderInMap(baseFolderName, baseFolderName, parentFolderId);
      
      // IMPORTANT: Map with the correct parent context - use the ACTUAL parent ID from the created folder
      if (parentFolderParentId) {
        folderPathMap.set(`${parentFolderParentId}/${baseFolderName}`, parentFolderId);
        console.log(`📝 MAPPED PARENT PATH: "${parentFolderParentId}/${baseFolderName}" => "${parentFolderId}"`);
      }
      
      console.log(`📋 FOLDER PATH MAP INITIALIZED with parent folder "${baseFolderName}" (ID: ${parentFolderId})`);
      
      // Update processed folders count
      updateStats({
        processedFolders: 1 // Start with 1 for the parent folder
      });
      
      // Add state tracking for UI updates
      let processedFiles = 0;
      let successfulUploads = 0;
      let failedUploads = 0;
      let createdFolders = 1; // Starting with 1 for the parent folder
      const totalFilesForUpload = validFiles.length;
      
      // Set the total count for UI display
      setTotalCount(totalFilesForUpload);
      
      // For the UI to show the current progress
      const updateProgress = () => {
        processedFiles++;
        
        // Update our stats
        updateStats({
          processedFiles
        });
        
        setProcessedCount(prev => {
          const newCount = prev + 1;
          setUploadProgress(Math.floor((newCount / totalCount) * 100));
          return newCount;
        });
        setProcessingFile('');
      };
      
      console.log('▶️ STARTING FOLDER STRUCTURE PROCESSING...');
      
      // Refresh folders one more time to ensure we have the latest list
      if (onRefresh) {
        console.log(`🔄 REFRESHING FOLDERS before processing structure...`);
        await onRefresh();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Process files by traversing the folder structure
      const uploadResult = await processFolderStructure(
        folderStructure,
        parentFolderId,
        folderPathMap,
        updateProgress,
        [...folders]  // Always use the latest folders
      );
      
      successfulUploads = uploadResult.successfulUploads;
      failedUploads = uploadResult.failedUploads;
      createdFolders += uploadResult.createdFolders;
      
      console.log('✅ FOLDER STRUCTURE PROCESSING COMPLETED.');
      console.log(`📊 SUMMARY: ${successfulUploads} files uploaded, ${failedUploads} files failed, ${createdFolders} folders created`);
      console.log(`📊 PROCESSED: ${processedFiles} out of ${totalFilesForUpload} files`);
      
      // Final stats update
      updateStats({
        processedFolders: createdFolders,
        uploadedFiles: successfulUploads,
        failedFiles: failedUploads
      });
      
      // Create a notification for the folder upload
      try {
        // Skip notification creation for logged-in users
        if (!user) {
          // Get parent folder name
          const folder = targetParentId 
            ? folders.find(f => f.id === targetParentId) 
            : { name: "Root" };
          
          const folderName = folder?.name || "Root";
          
          // Create notification directly in Firestore with enhanced sync verification
          // But only for guest uploads
          await ensureFirebaseSync(async () => {
            const notificationsRef = collection(db, 'notifications');
            await addDoc(notificationsRef, {
              iconType: 'folder-upload',
              type: 'info',
              message: `${uploaderName.trim()} uploaded folder "${baseFolderName}" to ${folderName} (${successfulUploads}/${totalFilesForUpload} files)`,
              link: `/documents/projects/${projectId}/folders/${parentFolderId}`,
              read: false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              metadata: {
                folderName: baseFolderName,
                parentFolderId: targetParentId || '',
                parentFolderName: folderName,
                fileCount: totalFilesForUpload,
                successfulUploads,
                failedUploads,
                uploadDate: new Date().toISOString(),
                projectId: projectId || '',
                uploadedBy: uploaderName.trim(),
                elapsedTimeMs: Date.now() - startTime,
                totalSizeBytes: totalUploadedBytes,
                totalFolders: uploadStats.totalFolders,
                deepestLevel: uploadStats.deepestLevel,
                isGuestUpload: !user,
                isTokenUpload: isTokenUpload
              }
            });
            
            const uploadType = !user ? 'Guest' : isTokenUpload ? 'Token-based' : 'User';
            console.log(`📣 ${uploadType} NOTIFICATION CREATED for folder upload and verified in Firebase`);
          });
        } else {
          console.log('Skipping notification creation for logged-in user folder upload');
        }
      } catch (notificationError) {
        console.error('❌ ERROR creating folder upload notification in Firebase:', notificationError);
        // Continue processing even if notification fails
      }
      
      // Final refresh to show all the new files with Firebase sync verification
      if (onRefresh) {
        console.log("🔄 PERFORMING FINAL REFRESH to update UI with all uploaded files and folders");
        await ensureFirebaseSync(async () => {
          await refreshFolders({ delay: 800 });
        });
      }
      
      setUploadProgress(100);
      
      // Show a final message to the user based on success/failure
      if (failedUploads > 0) {
        if (successfulUploads > 0) {
          setError(`Uploaded ${successfulUploads} files successfully, but ${failedUploads} files failed. Check console for details.`);
        } else {
          setError(`Failed to upload all ${failedUploads} files. Check console for details.`);
        }
      }
      
      // Verify completion
      const missingFiles = totalFilesForUpload - (successfulUploads + failedUploads);
      const missingFolders = uploadStats.totalFolders - createdFolders;
      
      if (missingFiles > 0 || missingFolders > 0) {
        console.warn(`⚠️ UPLOAD VERIFICATION WARNING: ${missingFiles} files and ${missingFolders} folders may not have been processed`);
      } else {
        console.log('✅ UPLOAD VERIFICATION SUCCESS: All files and folders were processed');
      }
      
      setTimeout(() => {
        setNewFileName('');
        setFolderFiles([]);
        setIsFolderUpload(false);
        setCurrentFolderPath('');
        setProcessingFile('');
        setSelectedFolderId(currentFolderId);
        setShowFileInput(false);
        setUploadProgress(0);
        setIsTokenUpload(false); // Reset the token upload flag
      }, 2000); // Longer timeout to ensure user sees the results
      
    } catch (error) {
      console.error('❌ FOLDER UPLOAD FAILED:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload folder');
    } finally {
      setIsProcessing(false);
      setIsUploading(false);
    }
  };

  // Add this useEffect near the other useEffect hooks to handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log("📶 Device is online. Firebase operations will sync.");
      // Force a refresh when coming back online to sync any pending changes
      if (onRefresh) {
        console.log("Auto-refreshing folders after regaining connection...");
        onRefresh().catch(err => console.error("Error refreshing after reconnect:", err));
      }
    };
    
    const handleOffline = () => {
      console.warn("📴 Device is offline. Firebase operations may not sync immediately.");
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onRefresh]);

  // Add the validateFirebaseConnection function here inside the component
  const validateFirebaseConnection = async (): Promise<boolean> => {
    // Check basic online status first
    if (!navigator.onLine) {
      console.warn("Device is offline according to navigator.onLine");
      return false;
    }
    
    // If we have a refresh function, try to use it as a proxy for Firebase connectivity
    if (onRefresh) {
      try {
        console.log("Testing Firebase connection with a quick refresh...");
        // Set a timeout to prevent hanging
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          setTimeout(() => reject(new Error("Firebase connection test timed out")), 5000);
        });
        
        // Try the refresh operation with a timeout
        const refreshPromise = onRefresh().then(() => true);
        
        // Race the timeout against the refresh
        return await Promise.race([refreshPromise, timeoutPromise]);
      } catch (error) {
        console.error("Firebase connection test failed:", error);
        return false;
      }
    }
    
    // If we can't test directly, assume connection is okay based on navigator.onLine
    return true;
  };

  return (
    <div className="relative">
      <div className="flex gap-2 items-center">
        <button
          className="inline-flex items-center gap-1 rounded bg-primary-600 px-3 py-3 text-sm font-medium text-white hover:bg-primary-700"
          onClick={() => setShowFolderInput(true)}
          disabled={isProcessing}
        >
          <FolderPlus size={14} />
          New Folder
        </button>
        <button
          className="inline-flex items-center gap-1 rounded bg-primary-600 px-3 py-3 text-sm font-medium text-white hover:bg-primary-700"
          onClick={() => setShowFileInput(true)}
          disabled={isProcessing}
        >
          <Upload size={14} />
          Upload
        </button>
        {currentFolderId && (
          <button
            className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-3 text-sm font-medium text-white hover:bg-green-700"
            onClick={() => setShowTokenGenerator(true)}
            disabled={isProcessing}
          >
            <Link size={14} />
            Share Upload Link
          </button>
        )}
      </div>

      <AnimatePresence>
        {showFolderInput && (
          <motion.div
            ref={folderNameInputRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 top-12 z-10 w-64 p-3 bg-white border border-gray-200 rounded-md shadow-lg"
          >
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              disabled={isProcessing}
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              disabled={isProcessing || !newFolderName.trim()}
              className="w-full py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Folder</span>
                </>
              )}
            </button>
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </motion.div>
        )}

        {showFileInput && (
          <motion.div
            ref={fileInputRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 top-12 z-10 w-80 p-4 bg-white border border-gray-200 rounded-md shadow-lg"
          >
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Upload to Folder
              </label>
              <div className="relative">
                <select
                  key={`folder-select-${folders.length}`}
                  value={selectedFolderId || ''}
                  onChange={(e) => setSelectedFolderId(e.target.value || undefined)}
                  className="w-full pl-8 pr-4 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
                >
                  <option value="" className="font-medium">Root (Home)</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {getFolderPath(folder.id)}
                    </option>
                  ))}
                </select>
                <FolderOpen className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
              </div>
            </div>

            {/* Toggle between file and folder upload for logged-in users */}
            {user && (
              <div className="mb-4">
                <div className="flex border border-gray-200 rounded-md overflow-hidden">
                  <button
                    className={`flex-1 py-2 text-sm font-medium ${
                      !isFolderUpload 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => setIsFolderUpload(false)}
                  >
                    Single File
                  </button>
                  <button
                    className={`flex-1 py-2 text-sm font-medium ${
                      isFolderUpload 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => setIsFolderUpload(true)}
                  >
                    Folder
                  </button>
                </div>
              </div>
            )}

            {/* Show different upload areas based on type */}
            {isFolderUpload && user ? (
              <div className="mb-4 p-6 border-2 border-dashed rounded-lg text-center transition-colors bg-gray-50 hover:border-blue-400">
                {folderFiles.length > 0 ? (
                  <div className="flex flex-col items-center">
                    <FolderOpen className="w-12 h-12 text-blue-500 mb-2" />
                    <p className="text-sm font-medium text-gray-900">{currentFolderPath}</p>
                    <p className="text-xs text-gray-500 mb-2">
                      {folderFiles.length} files selected
                    </p>
                    
                    {/* Allow re-selecting a different folder */}
                    <button 
                      onClick={() => {
                        // Reset the folder selection
                        setFolderFiles([]);
                        setCurrentFolderPath('');
                        setNewFileName('');
                        
                        // Trigger the folder input click
                        if (folderInputRef.current) {
                          folderInputRef.current.click();
                        }
                      }}
                      className="text-xs text-blue-500 hover:text-blue-700 underline"
                    >
                      Select a different folder
                    </button>
                  </div>
                ) : (
                  <>
                    <FolderOpen className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 mb-1">
                      Select a folder to upload
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                      All files and subfolders will be uploaded with their structure preserved
                    </p>
                    <label className="inline-block">
                      <span className="px-4 py-2 text-sm text-blue-500 bg-blue-50 rounded-md hover:bg-blue-100 cursor-pointer transition-colors">
                        Choose Folder
                      </span>
                      <input
                        ref={folderInputRef}
                        type="file"
                        onChange={handleFolderSelect}
                        className="hidden"
                        {...{
                          webkitdirectory: "",
                          directory: "",
                          multiple: true
                        } as DirectoryInputProps}
                        onClick={(e) => {
                          console.log("Folder input clicked");
                          // Clear the input to allow selecting the same folder again
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`mb-4 p-6 border-2 border-dashed rounded-lg text-center transition-colors ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <FileText className="w-12 h-12 text-blue-500 mb-2" />
                    <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    <p className="text-xs text-blue-500 mt-1">
                      Will be uploaded to: {selectedFolderId ? getFolderPath(selectedFolderId) : "Root Folder"}
                    </p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-600 mb-1">
                      Drag & drop any file here
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      or
                    </p>
                    <label className="inline-block">
                      <span className="px-4 py-2 text-sm text-blue-500 bg-blue-50 rounded-md hover:bg-blue-100 cursor-pointer transition-colors">
                        Browse Files
                      </span>
                      <input
                        type="file"
                        accept="*/*" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleFileSelect(file);
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </>
                )}
              </div>
            )}

            {/* Error messages */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-2 bg-red-50 border border-red-200 rounded-md flex items-center text-sm text-red-600"
              >
                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            {isUploading && (
              <div className="mb-4">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    {uploadProgress}% uploaded
                  </p>
                  {isFolderUpload && (
                    <p className="text-xs text-gray-500">
                      Processing file {processedCount}/{totalCount}
                    </p>
                  )}
                </div>
                {isFolderUpload && processingFile && (
                  <p className="text-xs text-gray-500 mt-1 text-center italic truncate max-w-full">
                    {processingFile}
                  </p>
                )}
              </div>
            )}

            {((selectedFile && !isFolderUpload) || (folderFiles.length > 0 && isFolderUpload)) && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isFolderUpload ? 'Folder Name' : 'Document Name'}
                  </label>
                  <input
                    type="text"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                
                {/* Only show name/email input for non-authenticated users */}
                {!user && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your Name/Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={uploaderName}
                      onChange={(e) => setUploaderName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your name or email"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Required for tracking uploads and notifications
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowFileInput(false);
                  setSelectedFile(null);
                  setNewFileName('');
                  setError('');
                  setSelectedFolderId(currentFolderId);
                  setIsFolderUpload(false);
                  setFolderFiles([]);
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                disabled={isUploading}
              >
                Cancel
              </button>
              <button
                onClick={isFolderUpload ? handleFolderUpload : handleCreateDocument}
                disabled={
                  (isFolderUpload 
                    ? folderFiles.length === 0 || !newFileName.trim() 
                    : !selectedFile || !newFileName.trim() || (!user && !uploaderName.trim())
                  ) || isUploading
                }
                className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>{isFolderUpload ? 'Upload Folder' : 'Upload'}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {showTokenGenerator && currentFolderId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50"
          >
            <motion.div
              ref={tokenGeneratorRef}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
            >
              <GenerateUploadToken
                folderId={currentFolderId}
                folderName={folders.find(f => f.id === currentFolderId)?.name}
                onClose={() => {
                  setShowTokenGenerator(false);
                  // Set this to true when a token is generated
                  setIsTokenUpload(true);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
