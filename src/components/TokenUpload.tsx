import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateUploadToken, UploadToken, incrementTokenUsage } from '../services/uploadTokenService';
import { Upload, AlertCircle, CheckCircle2, FileText, Loader2, User, X } from 'lucide-react';
import { documentService } from '../services/documentService';
import { userService } from '../services/userService';
import { createFileUploadNotification } from '../services/notificationService';
import { triggerDocumentUpdate } from '../services/documentSubscriptionService';
import heic2any from 'heic2any';

// Convert HEIC file to JPEG before upload
const convertHeicToJpeg = async (file: File): Promise<File> => {
  // Only convert if it's a HEIC file
  if (!file.name.toLowerCase().endsWith('.heic') && 
      !file.type.toLowerCase().includes('image/heic')) {
    return file;
  }
  
  try {
    console.log(`Converting HEIC file: ${file.name} to JPEG`);
    
    // Convert HEIC to JPEG using heic2any library
    const jpegBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9  // Maintain good quality
    }) as Blob;
    
    // Create new file name (replace .heic with .jpg)
    const newFileName = file.name.replace(/\.heic$/i, '.jpg');
    
    // Create a new File object from the JPEG blob
    const jpegFile = new File(
      [jpegBlob], 
      newFileName, 
      { type: 'image/jpeg', lastModified: file.lastModified }
    );
    
    console.log(`Successfully converted ${file.name} to ${jpegFile.name}`);
    return jpegFile;
  } catch (error) {
    console.error(`Error converting HEIC file: ${file.name}`, error);
    // Return the original file if conversion fails
    return file;
  }
};

// Process files to convert any HEIC files to JPEG before upload
const processFilesBeforeUpload = async (files: File[]): Promise<File[]> => {
  if (!files || files.length === 0) return files;
  
  try {
    const processedFiles: File[] = [];
    
    // Process each file - convert HEIC to JPEG
    for (const file of files) {
      try {
        // Check if it's a HEIC file
        if (file.name.toLowerCase().endsWith('.heic') || 
            file.type.toLowerCase().includes('image/heic')) {
          // Convert HEIC to JPEG
          const jpegFile = await convertHeicToJpeg(file);
          processedFiles.push(jpegFile);
        } else {
          // Not a HEIC file, keep as is
          processedFiles.push(file);
        }
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        // Add the original file if there's an error
        processedFiles.push(file);
      }
    }
    
    return processedFiles;
  } catch (error) {
    console.error('Error processing files before upload:', error);
    // Return original files if there's an error in the overall process
    return files;
  }
};

// Custom document upload function for token uploads
const uploadDocument = async (
  folderId: string,
  docData: any,  // Renamed from 'document' to avoid shadowing the global object
  file: File,
  uploader?: { id: string, displayName: string, role: string }
): Promise<any> => {
  // Use the imported documentService but wrap it with error handling
  try {
    // Call the actual create method on documentService
    const documentResult = await documentService.create(folderId, docData, file, uploader);
    
    // Dispatch document upload event for real-time updates
    // This custom event will be picked up by DocumentList components
    if (documentResult) {
      const uploadSuccessEvent = new CustomEvent('document-upload-success', {
        bubbles: true,
        detail: {
          folderId: folderId,
          fileId: documentResult.id,
          timestamp: Date.now(),
          source: 'guest-upload'
        }
      });
      
      // Use window.document to explicitly refer to the global document object
      window.document.dispatchEvent(uploadSuccessEvent);
      console.log(`[Token Upload] Dispatched upload success event for folder: ${folderId}`);
      
      // Also use the triggerDocumentUpdate function as a backup
      triggerDocumentUpdate(folderId, documentResult.id);
    }
    
    // If upload is successful, return the result
    return documentResult;
  } catch (error) {
    console.error("Error in uploadDocument:", error);
    throw error;
  }
};

const TokenUpload: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState<UploadToken | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
  const [uploadStatus, setUploadStatus] = useState<{[key: string]: 'pending' | 'uploading' | 'success' | 'error'}>({});
  const [isDragging, setIsDragging] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successfulFiles, setSuccessfulFiles] = useState<string[]>([]);
  const [guestIdentifier, setGuestIdentifier] = useState("");
  const [identifierError, setIdentifierError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const tokenId = searchParams.get('token');
  const [displayedRemainingUploads, setDisplayedRemainingUploads] = useState<number | null>(null);

  // Update the displayed remaining uploads whenever token changes
  useEffect(() => {
    if (token?.maxUploads) {
      setDisplayedRemainingUploads(token.maxUploads - token.usedCount);
    } else {
      setDisplayedRemainingUploads(null);
    }
  }, [token]);

  const fetchToken = async (id: string | null) => {
    if (!id) {
      setTokenError('No upload token provided.');
      setIsLoading(false);
      return;
    }

    try {
      const validToken = await validateUploadToken(id);
      if (validToken) {
        setToken(validToken);
      } else {
        setTokenError('This upload link is invalid or has expired.');
      }
    } catch (error) {
      console.error('Error validating token:', error);
      setTokenError('Error validating upload token.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchToken(tokenId);
  }, [tokenId]);

  const hasReachedUploadLimit = () => {
    if (!token?.maxUploads) return false;
    // Use displayedRemainingUploads for real-time tracking
    if (displayedRemainingUploads !== null) {
      return displayedRemainingUploads < files.length;
    }
    // Fallback to token state if displayedRemainingUploads is not set yet
    return (token.usedCount + files.length) > token.maxUploads;
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files.length) return;
    const selectedFiles = Array.from(e.target.files);
    addFiles(selectedFiles);
  };

  const addFiles = async (newFiles: File[]) => {
    if (!guestIdentifier.trim()) {
      setIdentifierError("Please provide your name/email before uploading files");
      return;
    }
    
    if (token?.maxUploads) {
      // Calculate remaining uploads based on the current token state
      const remainingUploads = displayedRemainingUploads !== null 
        ? displayedRemainingUploads
        : (token.maxUploads - token.usedCount);
        
      if (newFiles.length > remainingUploads) {
        alert(`You can only upload ${remainingUploads} more file(s). Please select fewer files.`);
        if (remainingUploads <= 0) return;
        newFiles = newFiles.slice(0, remainingUploads);
      }
    }
    
    // Process files - convert HEIC to JPEG
    const processedFiles = await processFilesBeforeUpload(newFiles);
    
    const validFiles = processedFiles.filter(file => {
      if (token?.maxFileSize && file.size > token.maxFileSize) {
        return false;
      }

      if (token?.allowedFileTypes && token.allowedFileTypes.length > 0) {
        const fileType = file.type;
        return token.allowedFileTypes.includes(fileType);
      }

      return true;
    });

    if (validFiles.length !== processedFiles.length) {
      alert('Some files were rejected due to size or type restrictions.');
    }

    const newStatus: {[key: string]: 'pending' | 'uploading' | 'success' | 'error'} = {};
    const newProgress: {[key: string]: number} = {};
    
    validFiles.forEach(file => {
      const fileId = `${file.name}_${file.size}_${Date.now()}`;
      newStatus[fileId] = 'pending';
      newProgress[fileId] = 0;
    });

    setFiles(prev => [...prev, ...validFiles]);
    setUploadStatus(prev => ({ ...prev, ...newStatus }));
    setUploadProgress(prev => ({ ...prev, ...newProgress }));
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!guestIdentifier.trim()) {
      setIdentifierError("Please provide your name/email before uploading files");
      return;
    }
    
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    
    if (!guestIdentifier.trim()) {
      setIdentifierError("Please provide your name/email before uploading files");
      return;
    }
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      // The HEIC conversion will be handled by addFiles
      addFiles(Array.from(e.dataTransfer.files));
      e.dataTransfer.clearData();
    }
  };

  const handleUpload = async () => {
    if (!token || !files.length) return;
    
    if (!guestIdentifier.trim()) {
      setIdentifierError("Please provide your name/email before uploading files");
      return;
    } else {
      setIdentifierError("");
    }
    
    // Refresh token information before starting uploads to ensure we have latest usedCount
    if (tokenId) {
      try {
        await fetchToken(tokenId);
      } catch (error) {
        console.error("Error refreshing token before upload:", error);
        // Continue with current token data
      }
    }
    
    setIsUploading(true);
    
    let successCount = 0;
    const successFiles: string[] = [];
    let updatedUsedCount = token.usedCount;
    
    try {
      // Process files one by one instead of parallel to avoid race conditions with token usage count
      for (const file of files) {
        const fileId = `${file.name}_${file.size}_${Date.now()}`;
        
        try {
          setUploadStatus(prev => ({ ...prev, [fileId]: 'uploading' }));
          
          let fileType: "pdf" | "dwg" | "other" | "image" = "other";
          const extension = file.name.split('.').pop()?.toLowerCase();
          if (extension === 'pdf') {
            fileType = "pdf";
          } else if (extension === 'dwg') {
            fileType = "dwg";
          } else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'heic'].includes(extension || '')) {
            fileType = "image";
          }
          
          const documentResult = await uploadDocument(
            token.folderId,
            {
              name: file.name,
              type: fileType,
              projectId: token.metadata?.projectId || '',
              folderId: token.folderId,
              version: 1,
              dateModified: new Date().toISOString()
            },
            file,
            {
              id: 'guest',
              displayName: guestIdentifier.trim(),
              role: 'Guest'
            }
          );
          
          setUploadProgress(prev => ({ ...prev, [fileId]: 100 }));
          setUploadStatus(prev => ({ ...prev, [fileId]: 'success' }));
          successCount++;
          successFiles.push(file.name);
          
          // Increment token usage and update local state immediately for each successful file
          if (token.id) {
            await incrementTokenUsage(token.id);
            
            // Get the latest token information from the server
            if (tokenId) {
              try {
                await fetchToken(tokenId);
                // The token state is now updated by fetchToken
                // Get the latest usedCount for local reference
                if (token) {
                  updatedUsedCount = token.usedCount;
                }
              } catch (refreshError) {
                console.error("Error refreshing token data:", refreshError);
                // Update local count as fallback
                updatedUsedCount++;
                setToken(prevToken => prevToken ? {
                  ...prevToken,
                  usedCount: updatedUsedCount
                } : null);
              }
            } else {
              // If no tokenId (shouldn't happen), update local state only
              updatedUsedCount++;
              setToken(prevToken => prevToken ? {
                ...prevToken,
                usedCount: updatedUsedCount
              } : null);
            }
          }
          
          // Send notifications to users
          try {
            // Fetch all users with access to this folder first
            const projectUsers = await userService.getUsersByProject(token.metadata?.projectId || '');
            const staffUsers = projectUsers.filter(u => u.role === 'Staff' || u.role === 'Admin');
            const assignedUsers = projectUsers.filter(u => u.role !== 'Staff' && u.role !== 'Admin');
            
            // If this is a root folder, get the project name
            let folderName = token.metadata?.folderName || "Folder";
            let projectName = "";
            
            if (folderName === '_root' && token.metadata?.projectId) {
              try {
                // Try to get the project name
                const { projectService } = await import('../services/projectService');
                const project = await projectService.getById(token.metadata.projectId);
                if (project && project.name) {
                  projectName = project.name;
                }
              } catch (projectError) {
                console.warn('Error fetching project name (non-critical):', projectError);
              }
            }
            
            if (documentResult && (staffUsers.length > 0 || assignedUsers.length > 0)) {
              await createFileUploadNotification(
                file.name.length > 40 ? file.name.substring(0, 37) + '...' : file.name,
                guestIdentifier.trim().length > 25 ? guestIdentifier.trim().substring(0, 22) + '...' : guestIdentifier.trim(),
                fileType,
                token.folderId,
                folderName,
                documentResult.id,
                token.metadata?.projectId || '',
                new Date().toISOString(),
                [...assignedUsers.map((u) => u.id), ...staffUsers.map((u) => u.id)],
                projectName
              );
              
              console.log(`Notifications sent to ${assignedUsers.length + staffUsers.length} users`);
            } else {
              console.warn("No users to notify or missing document result for notifications");
              
              // If there's a system user or admin that should always be notified, you could add it here
              if (documentResult && token.createdBy) {
                // Always notify the token creator at minimum
                await createFileUploadNotification(
                  file.name.length > 40 ? file.name.substring(0, 37) + '...' : file.name,
                  guestIdentifier.trim().length > 25 ? guestIdentifier.trim().substring(0, 22) + '...' : guestIdentifier.trim(),
                  fileType,
                  token.folderId,
                  folderName,
                  documentResult.id,
                  token.metadata?.projectId || '',
                  new Date().toISOString(),
                  [token.createdBy]
                );
                console.log(`Notification sent to token creator: ${token.createdBy}`);
              }
            }
            
          } catch (notificationError) {
            console.error("Error sending upload notifications:", notificationError);
            // Continue with the upload even if notification fails
          }
        } catch (error) {
          console.error(`Error uploading file ${file.name}:`, error);
          setUploadStatus(prev => ({ ...prev, [fileId]: 'error' }));
        }
      }
    } finally {
      setIsUploading(false);
    }
    
    if (successCount > 0) {
      // We've already updated the token state for each file, this is just a safety check
      setSuccessfulFiles(successFiles);
      setShowSuccessPopup(true);
      setFiles([]);
    }
  };

  const handleContinueAfterSuccess = async () => {
    // Fetch the most current token information to make sure we have the latest count
    if (tokenId) {
      await fetchToken(tokenId);
    }
    
    setShowSuccessPopup(false);
    
    if (token?.maxUploads && token.usedCount >= token.maxUploads) {
      setUploadComplete(true);
    } else {
      setUploadProgress({});
      setUploadStatus({});
      setSuccessfulFiles([]);
    }
  };

  const removeFile = (fileToRemove: File) => {
    setFiles(prevFiles => prevFiles.filter(file => file !== fileToRemove));
    
    const fileIds = Object.keys(uploadStatus).filter(id => 
      id.startsWith(`${fileToRemove.name}_${fileToRemove.size}`)
    );
    
    if (fileIds.length) {
      const newStatus = { ...uploadStatus };
      const newProgress = { ...uploadProgress };
      
      fileIds.forEach(id => {
        delete newStatus[id];
        delete newProgress[id];
      });
      
      setUploadStatus(newStatus);
      setUploadProgress(newProgress);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto text-blue-500 animate-spin" />
          <h2 className="mt-4 text-xl font-medium text-gray-700">Validating upload link...</h2>
        </div>
      </div>
    );
  }

  if (tokenError || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md text-center">
          <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Invalid Upload Link</h2>
          <p className="text-gray-600 mb-6">{tokenError || 'This upload link is invalid or has expired.'}</p>
          <p className="text-sm text-gray-500">
            Please contact the person who shared this link with you for a new upload link.
          </p>
        </div>
      </div>
    );
  }

  if (uploadComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload Complete!</h2>
          <p className="text-gray-600 mb-6">
            Your files have been successfully uploaded.
          </p>
          <button 
            onClick={() => {
              setFiles([]);
              setUploadProgress({});
              setUploadStatus({});
              setUploadComplete(false);
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Upload More Files
          </button>
        </div>
      </div>
    );
  }

  const title = token.metadata?.title || 'Upload Files';
  const description = token.metadata?.description;
  const folderName = token.metadata?.folderName;
  const maxSizeMB = token.maxFileSize ? Math.round(token.maxFileSize / (1024 * 1024)) : null;

  const renderLoadingOverlay = () => {
    if (!isUploading) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-lg text-center max-w-md">
          <Loader2 className="w-16 h-16 mx-auto text-blue-500 animate-spin mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">Uploading Files...</h3>
          <p className="text-gray-600">Please wait while your files are being uploaded</p>
        </div>
      </div>
    );
  };

  const renderSuccessPopup = () => {
    if (!showSuccessPopup) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-lg text-center max-w-md">
          <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h3 className="text-xl font-medium text-gray-800 mb-2">Files Uploaded Successfully!</h3>
          
          <div className="mt-4 mb-4 max-h-40 overflow-y-auto">
            <div className="bg-gray-50 rounded-md p-3 text-left">
              <p className="text-sm font-medium text-gray-700 mb-2">The following files were uploaded:</p>
              <ul className="text-sm text-gray-600 list-disc pl-5 space-y-1">
                {successfulFiles.map((fileName, index) => (
                  <li key={index} className="overflow-hidden text-ellipsis whitespace-nowrap max-w-full" title={fileName}>
                    {fileName}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <button
            onClick={handleContinueAfterSuccess}
            className="mt-2 px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {renderLoadingOverlay()}
      {renderSuccessPopup()}
      
      <header className="bg-blue-500 py-4 sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <h1 className="text-white text-2xl font-bold">{`Upload to ${folderName || "Folder"}`}</h1>
          <p className="text-blue-100">{`Uploading to: ${folderName || "Folder"}`}</p>
        </div>
      </header>

      <main className="flex-grow container mx-auto px-4 py-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name/Email <span className="text-red-500">*</span>
              </label>
              <div className={`flex rounded-md overflow-hidden border ${identifierError ? 'border-red-300' : 'border-gray-300'}`}>
                <div className="bg-gray-100 px-3 py-2 flex items-center">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  value={guestIdentifier}
                  onChange={(e) => {
                    setGuestIdentifier(e.target.value);
                    if (e.target.value.trim()) {
                      setIdentifierError("");
                    }
                  }}
                  placeholder="Enter your name or email"
                  className={`w-full py-2 px-3 border-0 focus:ring-2 focus:ring-blue-500 ${identifierError ? 'bg-red-50' : ''}`}
                  required
                />
              </div>
              {identifierError && (
                <p className="mt-1 text-sm text-red-600">{identifierError}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">Required for identifying who uploaded the files</p>
            </div>

            <div className="flex flex-wrap justify-between text-sm text-gray-600 mb-6">
              {maxSizeMB && (
                <div className="flex items-center mr-6 mb-2">
                  <span className="font-medium mr-2">Max file size:</span> 
                  {maxSizeMB} MB
                </div>
              )}
              {displayedRemainingUploads !== null && (
                <div className="flex items-center mb-2">
                  <span className="font-medium mr-2">Remaining uploads:</span> 
                  <span className={displayedRemainingUploads <= 0 ? 'text-red-500 font-bold' : ''}>
                    {displayedRemainingUploads <= 0 ? 'No remaining uploads' : displayedRemainingUploads}
                  </span>
                </div>
              )}
            </div>

            {token?.maxUploads && token.usedCount >= token.maxUploads && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      You have reached the maximum number of uploads allowed. Please contact the person who shared this link if you need to upload more files.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div 
              className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
                isDragging ? 'border-blue-500 bg-blue-50' : 
                !guestIdentifier.trim() || hasReachedUploadLimit() ? 'border-gray-300 opacity-60' : 
                'border-gray-300 hover:border-blue-300'
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelection}
                multiple
                className="hidden"
                disabled={!guestIdentifier.trim() || hasReachedUploadLimit()}
              />
              
              <Upload className={`w-12 h-12 mx-auto text-blue-500 mb-4 ${
                (!guestIdentifier.trim() || hasReachedUploadLimit()) ? 'opacity-60' : ''
              }`} />
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                {!guestIdentifier.trim() ? 'Enter your name/email above first' : 
                 hasReachedUploadLimit() ? 'Maximum upload limit reached' :
                 'Drag and drop your files here'}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {hasReachedUploadLimit() ? 
                  'No more uploads allowed' : 
                  'or'}
              </p>
              {!hasReachedUploadLimit() && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!guestIdentifier.trim() || hasReachedUploadLimit()}
                  className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  Browse Files
                </button>
              )}
            </div>

            {files.length > 0 && (
              <>
              <h3 className="text-lg font-medium text-gray-700 mb-4">Files to upload</h3>
              <div className="mb-6 max-h-60 overflow-y-auto">
                
                <ul className="space-y-3">
                  {files.map((file, index) => {
                    const fileId = `${file.name}_${file.size}_${Date.now()}`;
                    const status = uploadStatus[fileId] || 'pending';
                    const progress = uploadProgress[fileId] || 0;
                    
                    return (
                      <li key={index} className="bg-gray-50 p-3 rounded">
                        <div className="flex items-center">
                          <FileText className="w-5 h-5 text-gray-400 mr-3" />
                          <div className="flex-grow">
                            <p className="text-sm font-medium text-gray-700 truncate" title={file.name}>{file.name}</p>
                            <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                          </div>
                          {status === 'uploading' && (
                            <div className="ml-2">
                              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                            </div>
                          )}
                          {status === 'success' && (
                            <div className="ml-2">
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            </div>
                          )}
                          {status === 'error' && (
                            <div className="ml-2">
                              <AlertCircle className="w-5 h-5 text-red-500" />
                            </div>
                          )}
                          {status === 'pending' && (
                            <button
                              onClick={() => removeFile(file)}
                              className="ml-2 p-1 text-gray-500 hover:text-red-500 transition-colors rounded-full hover:bg-gray-100"
                              title="Remove file"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                        {status === 'uploading' && (
                          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                            <div 
                              className="bg-blue-500 h-1.5 rounded-full" 
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              </>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => {
                  setFiles([]);
                  setUploadProgress({});
                  setUploadStatus({});
                }}
                disabled={!files.length}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear All
              </button>
              <button
                onClick={handleUpload}
                disabled={!files.length || !guestIdentifier.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload Files
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TokenUpload; 