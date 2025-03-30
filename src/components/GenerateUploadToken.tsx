import React, { useState } from 'react';
import { createUploadToken, UploadToken, generateUploadUrl } from '../services/uploadTokenService';
import { Check, Copy, RefreshCw, Share2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface TokenFormData {
  folderId: string;
  expiresInHours: number;
  maxFileSize: number;
  allowedFileTypes: string;
  maxUploads: number;
  title: string;
  description: string;
}

interface GenerateUploadTokenProps {
  folderId: string;
  folderName?: string;
  onTokenGenerated?: (token: UploadToken) => void;
  onClose?: () => void;
}

const GenerateUploadToken: React.FC<GenerateUploadTokenProps> = ({
  folderId,
  folderName,
  onTokenGenerated,
  onClose
}) => {
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<UploadToken | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [formData, setFormData] = useState<TokenFormData>({
    folderId,
    expiresInHours: 24, // 24 hours default
    maxFileSize: 50, // 50 MB default
    allowedFileTypes: '', // Empty string means all file types allowed
    maxUploads: 10,
    title: folderName ? `Upload to ${folderName}` : 'File Upload',
    description: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsGenerating(true);
    try {
      // Parse the allowed file types into an array
      const allowedFileTypesArray = formData.allowedFileTypes
        .split(',')
        .map(type => type.trim())
        .filter(Boolean);

      // Convert the max file size to bytes
      const maxFileSizeBytes = formData.maxFileSize * 1024 * 1024; // Convert MB to bytes

      const token = await createUploadToken(
        folderId,
        user.id,
        {
          expiresInHours: Number(formData.expiresInHours),
          maxFileSize: maxFileSizeBytes,
          allowedFileTypes: allowedFileTypesArray,
          maxUploads: Number(formData.maxUploads),
          metadata: {
            title: formData.title,
            description: formData.description,
            folderName
          }
        }
      );

      setGeneratedToken(token);
      onTokenGenerated?.(token);
    } catch (error) {
      console.error('Error generating upload token:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyTokenLink = () => {
    if (!generatedToken) return;
    
    const baseUrl = window.location.origin;
    const uploadUrl = generateUploadUrl(generatedToken, baseUrl);
    
    navigator.clipboard.writeText(uploadUrl).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden max-w-md w-full">
      <div className="bg-blue-500 p-4 text-white">
        <h2 className="text-xl font-semibold">Create Guest Upload Link</h2>
        <p className="text-sm opacity-90">
          Create a shareable link that lets guests upload files directly to this folder
        </p>
      </div>

      {generatedToken ? (
        <div className="p-6">
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-1">Upload link generated</h3>

            {/* Upload Link Card */}
            <div>           
              <div className="p-5">
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Link URL</label>
                    <div className="relative flex items-center mb-2 group">
                      <input
                        type="text"
                        readOnly
                        value={generateUploadUrl(generatedToken, window.location.origin)}
                        className="w-full p-3 pr-16 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono shadow-sm group-hover:border-blue-300 transition-colors"
                      />
                      <button
                        onClick={copyTokenLink}
                        className="absolute right-2 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md text-sm transition-colors flex items-center"
                        title={showCopied ? "Copied!" : "Copy to clipboard"}
                      >
                        {showCopied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
                        {showCopied ? "Copied" : "Copy"}
                      </button>
                    </div>
                    
                    <p className="text-xs text-gray-600 mb-2 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Anyone with this link can upload files to &#8203;  <span className="font-medium"> {folderName || "this folder"}</span>
                    </p>
                  </div>
                  
                  <div className="bg-gradient-to-br from-blue-50 to-white rounded-md border border-blue-100 p-1">
                    <div className="grid grid-cols-2 text-sm gap-3 p-2">
                      <div className="flex flex-col">
                        <span className="text-gray-500 text-xs uppercase tracking-wide">Max files</span>
                        <span className="font-semibold text-gray-800 mt-1 flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          {generatedToken.maxUploads || 'Unlimited'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500 text-xs uppercase tracking-wide">File size limit</span>
                        <span className="font-semibold text-gray-800 mt-1 flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                          </svg>
                          {generatedToken.maxFileSize 
                            ? `${(generatedToken.maxFileSize / (1024 * 1024)).toFixed(1)} MB` 
                            : 'Unlimited'}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500 text-xs uppercase tracking-wide">Expires</span>
                        <span className="font-semibold text-gray-800 mt-1 flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {new Date(generatedToken.expiresAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-500 text-xs uppercase tracking-wide">Allowed file types</span>
                        <span className="font-semibold text-gray-800 mt-1 flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="truncate max-w-xs">
                            {generatedToken.allowedFileTypes && generatedToken.allowedFileTypes.length > 0 
                              ? generatedToken.allowedFileTypes.join(', ')
                              : 'All types'}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={copyTokenLink}
                    className="w-full flex items-center justify-center py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-md hover:from-blue-700 hover:to-blue-600 transition-all shadow-sm"
                  >
                    {showCopied ? 
                      <>
                        <Check size={18} className="mr-2" /> 
                        Copied to clipboard!
                      </> : 
                      <>
                        <Copy size={18} className="mr-2" /> 
                        Copy link to clipboard
                      </>
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setGeneratedToken(null)}
              className="flex-1 py-2 px-4 border border-blue-500 text-blue-500 rounded hover:bg-blue-50 transition-colors"
            >
              <RefreshCw size={16} className="inline mr-1" /> Generate New
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Upload title shown to guests"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Optional description"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires in (hours)</label>
              <input
                type="number"
                name="expiresInHours"
                value={formData.expiresInHours}
                onChange={handleInputChange}
                min="1"
                max="720"
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Link will expire after this time
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max file uploads</label>
              <input
                type="number"
                name="maxUploads"
                value={formData.maxUploads}
                onChange={handleInputChange}
                min="1"
                max="100"
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Maximum number of files a guest can upload
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max file size (MB)</label>
            <input
              type="number"
              name="maxFileSize"
              value={formData.maxFileSize}
              onChange={handleInputChange}
              min="1"
              max="1000"
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Maximum allowed size for each uploaded file
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Allowed file types</label>
            <input
              type="text"
              name="allowedFileTypes"
              value={formData.allowedFileTypes}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Leave empty to allow all file types"
            />
            <p className="mt-1 text-xs text-gray-500">
              Comma-separated list of MIME types (e.g., application/pdf,image/jpeg,image/png). Leave empty to allow all file types.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button 
                type="button" 
                onClick={() => setFormData(prev => ({
                  ...prev, 
                  allowedFileTypes: 'application/pdf'
                }))}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
              >
                PDF only
              </button>
              <button 
                type="button" 
                onClick={() => setFormData(prev => ({
                  ...prev, 
                  allowedFileTypes: 'image/jpeg,image/png,image/gif'
                }))}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
              >
                Images only
              </button>
              <button 
                type="button" 
                onClick={() => setFormData(prev => ({
                  ...prev, 
                  allowedFileTypes: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                }))}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
              >
                Documents only
              </button>
              <button 
                type="button" 
                onClick={() => setFormData(prev => ({
                  ...prev, 
                  allowedFileTypes: ''
                }))}
                className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
              >
                All types
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isGenerating}
              className="flex-1 py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Generating...' : 'Generate Link'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default GenerateUploadToken; 