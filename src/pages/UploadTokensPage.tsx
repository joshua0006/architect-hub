import React, { useState, useEffect } from 'react';
import { generateUploadToken, getUserUploadTokens, invalidateUploadToken } from '../services/uploadTokenService';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Clipboard, XCircle, Clock, Check, AlertTriangle } from 'lucide-react';

const UploadTokensPage: React.FC = () => {
  const [tokens, setTokens] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiryHours, setExpiryHours] = useState(24);
  const [maxUsage, setMaxUsage] = useState(10);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  
  const { user } = useAuth();
  const { showToast } = useToast();
  
  // Fetch user's tokens
  const fetchTokens = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      setError(null);
      const userTokens = await getUserUploadTokens(user.id);
      setTokens(userTokens);
    } catch (err) {
      setError('Failed to load upload tokens');
      showToast('Failed to load upload tokens', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchTokens();
  }, [user]);
  
  // Generate a new token
  const handleGenerateToken = async () => {
    if (!user) return;
    
    try {
      setIsGenerating(true);
      setError(null);
      
      const token = await generateUploadToken(user.id, user.id, expiryHours, maxUsage);
      showToast('New upload token generated successfully', 'success');
      
      // Refresh tokens list
      await fetchTokens();
    } catch (err) {
      setError('Failed to generate token');
      showToast('Failed to generate upload token', 'error');
    } finally {
      setIsGenerating(false);
    }
  };
  
  // Invalidate a token
  const handleInvalidateToken = async (tokenId: string) => {
    try {
      const success = await invalidateUploadToken(tokenId);
      if (success) {
        showToast('Token invalidated successfully', 'success');
        // Refresh tokens list
        await fetchTokens();
      } else {
        throw new Error('Failed to invalidate token');
      }
    } catch (err) {
      showToast('Failed to invalidate token', 'error');
    }
  };
  
  // Copy token to clipboard
  const copyToClipboard = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopySuccess(token);
      setTimeout(() => setCopySuccess(null), 2000);
      showToast('Token copied to clipboard', 'success');
    } catch (err) {
      showToast('Failed to copy token', 'error');
    }
  };
  
  if (!user) {
    return (
      <div className="p-6 bg-gray-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Upload Tokens</h2>
        <p className="text-gray-600">You need to be logged in to manage upload tokens.</p>
      </div>
    );
  }
  
  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-xl font-semibold mb-4">Upload Tokens</h2>
      <p className="text-gray-600 mb-6">
        Generate and manage tokens that allow guest users to send you notifications.
      </p>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md flex items-center">
          <AlertTriangle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}
      
      <div className="mb-6 bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-medium mb-3">Generate New Token</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="expiryHours" className="block text-sm font-medium text-gray-700 mb-1">
              Expires After (hours)
            </label>
            <input
              type="number"
              id="expiryHours"
              value={expiryHours}
              onChange={(e) => setExpiryHours(parseInt(e.target.value) || 24)}
              min="1"
              max="720"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label htmlFor="maxUsage" className="block text-sm font-medium text-gray-700 mb-1">
              Maximum Usage Count
            </label>
            <input
              type="number"
              id="maxUsage"
              value={maxUsage}
              onChange={(e) => setMaxUsage(parseInt(e.target.value) || 10)}
              min="1"
              max="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <button
          onClick={handleGenerateToken}
          disabled={isGenerating}
          className={`px-4 py-2 text-white font-medium rounded-md
            ${isGenerating 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
            }`}
        >
          {isGenerating ? 'Generating...' : 'Generate Token'}
        </button>
      </div>
      
      <div>
        <h3 className="text-lg font-medium mb-3">Your Tokens</h3>
        
        {isLoading ? (
          <div className="text-center p-6">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading tokens...</p>
          </div>
        ) : tokens.length === 0 ? (
          <div className="text-center p-6 bg-gray-50 rounded-lg">
            <p className="text-gray-600">You don't have any active upload tokens.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Token
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usage
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {tokens.map((token) => {
                  const expiresAt = new Date(token.expiresAt?.seconds * 1000 || 0);
                  const isExpired = expiresAt < new Date();
                  
                  return (
                    <tr key={token.id} className={isExpired ? 'bg-gray-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center">
                          <span className="font-mono truncate max-w-xs">{token.token}</span>
                          <button
                            onClick={() => copyToClipboard(token.token)}
                            className="ml-2 text-gray-400 hover:text-gray-600"
                          >
                            {copySuccess === token.token ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Clipboard className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {isExpired ? (
                            <span className="text-red-500">Expired</span>
                          ) : (
                            expiresAt.toLocaleString()
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {token.usageCount} / {token.maxUsage}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button
                          onClick={() => handleInvalidateToken(token.id)}
                          className="text-red-600 hover:text-red-800 flex items-center"
                          disabled={!token.isValid}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Invalidate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadTokensPage; 