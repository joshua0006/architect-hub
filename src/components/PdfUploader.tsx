import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2 } from "lucide-react";
import { uploadPdfToFolder, uploadFileToFolder } from "../services/uploadService";

interface FileUploaderProps {
  folderId: string;
  onUploadSuccess?: (result: {
    downloadUrl: string;
    documentId: string;
  }) => void;
  onUploadError?: (error: Error) => void;
  acceptedFileTypes?: Record<string, string[]>; // Mimetype to extension mapping
  maxFileSize?: number; // In bytes
  title?: string;
  description?: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  folderId,
  onUploadSuccess,
  onUploadError,
  acceptedFileTypes = {
    "application/pdf": [".pdf"],
    // Add more file types as needed
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/msword": [".doc"],
  },
  maxFileSize = 50 * 1024 * 1024, // 50MB default
  title = "Upload Files",
  description = "Drag & drop your files here or click to browse",
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Check if file type is accepted
    const fileTypeAccepted = Object.keys(acceptedFileTypes).some(type => 
      file.type === type || file.type.startsWith(type.split('/')[0] + '/')
    );
    
    if (!fileTypeAccepted) {
      const supportedTypes = Object.values(acceptedFileTypes).flat().join(', ');
      onUploadError?.(new Error(`Unsupported file type. Please upload ${supportedTypes}`));
      return;
    }

    // Validate file size
    if (file.size > maxFileSize) {
      onUploadError?.(new Error(`File size must be less than ${maxFileSize / (1024 * 1024)}MB`));
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

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

      // Use the general file upload function for any file type
      const result = await uploadFileToFolder(folderId, file);

      clearInterval(progressInterval);
      setUploadProgress(100);

      onUploadSuccess?.(result);
    } catch (error) {
      onUploadError?.(error as Error);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptedFileTypes,
    multiple: false,
  });

  return (
    <div className="flex items-center justify-center h-full p-4 sm:p-8">
      <div className="w-full max-w-lg">
        <h3 className="text-lg font-medium mb-2">{title}</h3>
        
        <div
          {...getRootProps()}
          className={`
            w-full p-6 
            border-2 border-dashed rounded-lg 
            transition-colors duration-200 ease-in-out
            flex flex-col items-center justify-center
            cursor-pointer
            ${
              isDragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400"
            }
            ${isUploading ? "pointer-events-none opacity-80" : ""}
          `}
        >
          <input {...getInputProps()} />
          
          {isUploading ? (
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
              <p className="text-center text-gray-600">
                Uploading... {uploadProgress}%
              </p>
              <div className="w-full mt-4 bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <>
              <Upload
                className={`w-12 h-12 mb-4 ${
                  isDragActive ? "text-blue-500" : "text-gray-400"
                }`}
              />
              <p className="text-center text-gray-600">
                {description}
                <br />
                <span className="text-sm text-gray-500">or</span>
              </p>
              <button className="mt-2 text-blue-500 hover:text-blue-600 font-medium">
                Browse Files
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Supported formats: {Object.values(acceptedFileTypes).flat().join(", ")}
                <br />
                Max size: {maxFileSize / (1024 * 1024)}MB
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// For backward compatibility, export PdfUploader as well
export const PdfUploader = FileUploader;
