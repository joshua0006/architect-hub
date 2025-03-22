import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, XCircle, Loader2, User } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { validateUploadToken, uploadFileWithToken } from '../services/uploadTokenService';
import { UploadToken } from '../services/uploadTokenService';
import { collection, getDocs, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

const TokenUpload: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenId = searchParams.get('token');
  
  const [token, setToken] = useState<UploadToken | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [guestIdentifier, setGuestIdentifier] = useState('');
  const [guestIdentifierError, setGuestIdentifierError] = useState('');

  // Validate token on component mount
  useEffect(() => {
    const validateToken = async () => {
      if (!tokenId) {
        setTokenError('No upload token provided');
        return;
      }

      try {
        const validatedToken = await validateUploadToken(tokenId);
        if (!validatedToken) {
          setTokenError('Invalid or expired upload token');
          return;
        }
        
        setToken(validatedToken);
        
        // Initialize guest identifier from token if available
        if (validatedToken.metadata?.guestName) {
          setGuestIdentifier(validatedToken.metadata.guestName);
        }
      } catch (error) {
        console.error('Error validating token:', error);
        setTokenError('Error validating upload token');
      }
    };

    validateToken();
  }, [tokenId]);

  const handleFileUpload = async (file: File) => {
    if (!token || !tokenId) {
      setUploadError('Invalid token');
      return;
    }

    // Validate guest identifier is provided
    if (!guestIdentifier.trim()) {
      setGuestIdentifierError('Please provide your name or email before uploading');
      return;
    } else {
      setGuestIdentifierError('');
    }

    // Validate file size if token has maxFileSize
    if (token.maxFileSize && file.size > token.maxFileSize) {
      setUploadError(`File exceeds the maximum allowed size of ${(token.maxFileSize / (1024 * 1024)).toFixed(2)}MB`);
      return;
    }

    // Validate file type if token has allowedFileTypes
    if (token.allowedFileTypes && token.allowedFileTypes.length > 0) {
      if (!token.allowedFileTypes.includes(file.type)) {
        setUploadError(`This file type (${file.type || 'unknown'}) is not allowed. Allowed types: ${token.allowedFileTypes.join(', ')}`);
        return;
      }
    }

    setFileToUpload(file);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);

      const result = await uploadFileWithToken(tokenId, file);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadSuccess(true);
      
      // Create notification for the file upload
      try {
        // Get the folder name
        const folderRef = collection(db, 'folders');
        const q = query(folderRef, where('id', '==', token.folderId));
        const folderSnapshot = await getDocs(q);
        let folderName = 'Uploads';
        
        if (!folderSnapshot.empty) {
          folderName = folderSnapshot.docs[0].data().name || folderName;
        }

        // Always use the entered guest identifier, never fall back
        const guestName = guestIdentifier.trim();
        
        console.log(`Creating notification with folder ID: ${token.folderId}`);
        
        // Create notification directly using Firestore
        try {
          // Create the link to the document with proper context
          let link = `/documents`;
          
          if (token.metadata?.projectId) {
            link = `/documents/projects/${token.metadata.projectId}`;
            
            if (token.folderId) {
              link += `/folders/${token.folderId}`;
              
              if (result?.documentId) {
                link += `/files/${result.documentId}`;
              }
            }
          } else if (token.folderId) {
            link += `/folders/${token.folderId}`;
          }
          
          // Create notification in Firestore
          const notificationsRef = collection(db, 'notifications');
          await addDoc(notificationsRef, {
            iconType: 'file-upload',
            type: 'info',
            message: `${guestName} uploaded "${file.name}" to ${folderName}`,
            link: link,
            read: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            metadata: {
              contentType: file.type,
              fileName: file.name,
              folderId: token.folderId,
              folderName: folderName,
              guestName: guestName,
              uploadDate: new Date().toISOString(),
              projectId: token.metadata?.projectId || ''
            }
          });
          
          console.log('Notification created successfully');
        } catch (firestoreError) {
          console.error('Error creating notification in Firestore:', firestoreError);
        }
      } catch (notificationError) {
        console.error('Error creating notification:', notificationError);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  // Define handleDrop function after handleFileUpload to fix dependency order
  const handleDrop = useCallback((acceptedFiles: File[]) => {
    if (!guestIdentifier.trim()) {
      setGuestIdentifierError('Please provide your name or email before uploading');
      return;
    }
    
    const file = acceptedFiles[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [guestIdentifier, handleFileUpload]);

  // Update the dropzone configuration to use handleDrop
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    disabled: !token || isUploading || uploadSuccess || !guestIdentifier.trim(),
    // Only apply file type restrictions if token explicitly has allowedFileTypes
    // Otherwise, accept all file types
    accept: token?.allowedFileTypes && token.allowedFileTypes.length > 0 ? 
      token.allowedFileTypes.reduce((acc, type) => {
        acc[type] = [];
        return acc;
      }, {} as Record<string, string[]>) : 
      undefined,
    multiple: false,
  });

  // Format file size to human readable format
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'No limit';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  // If still validating token
  if (!token && !tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 max-w-md w-full bg-white rounded-lg shadow-md">
          <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-500 animate-spin" />
          <h2 className="text-xl font-semibold text-gray-800">Validating upload token...</h2>
        </div>
      </div>
    );
  }

  // If invalid token
  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 max-w-md w-full bg-white rounded-lg shadow-md">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-semibold text-gray-800">Invalid Upload Link</h2>
          <p className="mt-2 text-gray-600">{tokenError}</p>
          <p className="mt-4 text-gray-500">
            This upload link may have expired or been used too many times.
          </p>
        </div>
      </div>
    );
  }

  // At this point, token is guaranteed to be non-null
  if (!token) {
    return null; // Satisfy TypeScript, this should never happen
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-md overflow-hidden">
        <div className="bg-blue-500 p-4 text-white">
          <h1 className="text-xl font-semibold">Upload File</h1>
          {token.metadata?.title && (
            <p className="mt-1 opacity-90">{token.metadata.title}</p>
          )}
          {token.metadata?.description && (
            <p className="mt-2 text-sm opacity-80">{token.metadata.description}</p>
          )}
        </div>
        
        <div className="p-6">
          {/* Guest identifier input */}
          {!uploadSuccess && !isUploading && (
            <div className="mb-6">
              <label htmlFor="guestIdentifier" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name/Email: <span className="text-red-500">*</span>
              </label>
              <div className={`flex rounded-md border ${guestIdentifierError || !guestIdentifier.trim() ? 'border-red-300' : 'border-gray-300'} overflow-hidden`}>
                <div className="bg-gray-100 px-3 py-2 flex items-center">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  type="text"
                  id="guestIdentifier"
                  value={guestIdentifier}
                  onChange={(e) => {
                    setGuestIdentifier(e.target.value);
                    if (e.target.value.trim()) {
                      setGuestIdentifierError('');
                    }
                  }}
                  placeholder="Enter your name or email"
                  className={`flex-1 block w-full border-0 focus:ring-2 ${guestIdentifierError || !guestIdentifier.trim() ? 'focus:ring-red-500 bg-red-50' : 'focus:ring-blue-500'} py-2 px-3`}
                  required
                />
              </div>
              {guestIdentifierError && (
                <p className="mt-1 text-sm text-red-600">{guestIdentifierError}</p>
              )}
              {!guestIdentifierError && !guestIdentifier.trim() && (
                <p className="mt-1 text-sm text-orange-600">This field is required before uploading</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Required for tracking uploads and notifications
              </p>
            </div>
          )}
          
          {/* Token info */}
          <div className="mb-6 text-sm text-gray-600 space-y-1">
            {token.maxFileSize && (
              <p>Maximum file size: {formatFileSize(token.maxFileSize)}</p>
            )}
            {token.allowedFileTypes && token.allowedFileTypes.length > 0 ? (
              <p>Allowed file types: {token.allowedFileTypes.join(', ')}</p>
            ) : (
              <p>Allowed file types: All file types accepted</p>
            )}
            {token.maxUploads && (
              <p>
                Upload limit: {token.usedCount} of {token.maxUploads} uploads used
              </p>
            )}
            <p>
              Expires: {token.expiresAt.toLocaleString()}
            </p>
          </div>

          {/* Upload success state */}
          {uploadSuccess && (
            <div className="text-center p-6 bg-green-50 rounded-lg border border-green-100">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-medium text-green-800">Upload Successful!</h3>
              <p className="mt-2 text-green-600">
                Your file has been uploaded successfully.
              </p>
              {fileToUpload && (
                <div className="mt-4 p-3 bg-white rounded border border-green-200 text-left">
                  <p className="font-medium text-gray-700">{fileToUpload.name}</p>
                  <p className="text-sm text-gray-500">
                    {formatFileSize(fileToUpload.size)}
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  setUploadSuccess(false);
                  setFileToUpload(null);
                  setUploadProgress(0);
                }}
                className="mt-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                Upload Another File
              </button>
            </div>
          )}

          {/* Upload error state */}
          {uploadError && (
            <div className="text-center p-6 bg-red-50 rounded-lg border border-red-100 mb-6">
              <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <h3 className="text-lg font-medium text-red-800">Upload Failed</h3>
              <p className="mt-2 text-red-600">{uploadError}</p>
              <button
                onClick={() => setUploadError(null)}
                className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Upload in progress state */}
          {isUploading && (
            <div className="text-center p-6">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-500 animate-spin" />
              <h3 className="text-lg font-medium text-gray-800">Uploading...</h3>
              {fileToUpload && (
                <p className="mt-1 text-gray-600">{fileToUpload.name}</p>
              )}
              <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="mt-2 text-gray-600">{uploadProgress}% complete</p>
            </div>
          )}

          {/* Upload dropzone - only show if not uploading and no success/error */}
          {!isUploading && !uploadSuccess && !uploadError && (
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center
                transition-colors duration-200 ease-in-out
                ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}
                ${!token || !guestIdentifier.trim() ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer'}
              `}
            >
              <input {...getInputProps()} />
              <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragActive ? 'text-blue-500' : !guestIdentifier.trim() ? 'text-gray-400' : 'text-blue-400'}`} />
              <p className="text-lg font-medium text-gray-700">
                {!guestIdentifier.trim() ? 'Enter your name/email above first' : 'Drag & drop your file here'}
              </p>
              <p className="mt-1 text-gray-500">
                {!guestIdentifier.trim() ? 
                  'Name/Email field is required' : 
                  <React.Fragment>or <span className="text-blue-500 hover:text-blue-600">browse files</span></React.Fragment>
                }
              </p>
            </div>
          )}

          {/* Upload button shown when a file is selected but not yet uploaded */}
          {fileToUpload && !isUploading && !uploadSuccess && (
            <button
              onClick={() => handleFileUpload(fileToUpload)}
              disabled={!guestIdentifier.trim()}
              className={`mt-4 px-4 py-2 rounded-md font-medium text-white ${
                !guestIdentifier.trim() 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              Upload File
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenUpload; 