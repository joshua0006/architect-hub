import React, { useState } from 'react';
import { createUploadToken, UploadToken, generateUploadUrl } from '../services/uploadTokenService';
import { Check, Copy, RefreshCw } from 'lucide-react';
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
        <h2 className="text-xl font-semibold">Generate Upload Link</h2>
        <p className="text-sm opacity-90">
          Create a shareable link that allows guests to upload files to this folder
        </p>
      </div>

      {generatedToken ? (
        <div className="p-6">
          <div className="mb-4">
            <h3 className="font-medium text-gray-700 mb-1">Upload link generated</h3>
            <p className="text-sm text-gray-500 mb-3">
              Share this link with anyone you want to upload files to this folder
            </p>
            
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-grow">
                <input
                  type="text"
                  readOnly
                  value={generateUploadUrl(generatedToken, window.location.origin)}
                  className="w-full p-2 pr-10 border border-gray-300 rounded bg-gray-50 text-sm font-mono"
                />
                <button
                  onClick={copyTokenLink}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-blue-500"
                >
                  {showCopied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-600 mb-6">
            <p><span className="font-medium">Expires:</span> {generatedToken.expiresAt.toLocaleString()}</p>
            {generatedToken.maxUploads && (
              <p><span className="font-medium">Max uploads:</span> {generatedToken.maxUploads}</p>
            )}
            {generatedToken.maxFileSize && (
              <p>
                <span className="font-medium">Max file size:</span> {(generatedToken.maxFileSize / (1024 * 1024)).toFixed(1)} MB
              </p>
            )}
            {generatedToken.allowedFileTypes && generatedToken.allowedFileTypes.length > 0 ? (
              <p>
                <span className="font-medium">File types:</span> {generatedToken.allowedFileTypes.join(', ')}
              </p>
            ) : (
              <p>
                <span className="font-medium">File types:</span> All file types allowed
              </p>
            )}
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
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max uploads</label>
              <input
                type="number"
                name="maxUploads"
                value={formData.maxUploads}
                onChange={handleInputChange}
                min="1"
                max="100"
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
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
              Comma-separated list of MIME types (e.g., application/pdf,image/jpeg). Leave empty to allow all file types.
            </p>
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