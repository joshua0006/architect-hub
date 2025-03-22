import React, { useState } from 'react';
import { X, Clock, Lock, Download, Eye } from 'lucide-react';

interface ShareSettingsModalProps {
  onClose: () => void;
  onSave: (settings: {
    expiration: string;
    password?: string;
    permissions: string[];
  }) => void;
}

export default function ShareSettingsModal({ onClose, onSave }: ShareSettingsModalProps) {
  const [expiration, setExpiration] = useState('7d');
  const [password, setPassword] = useState('');
  const [permissions, setPermissions] = useState(['view']);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      expiration,
      password: password || undefined,
      permissions
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Sharing Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="flex items-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>Expiration:</span>
              <select 
                value={expiration}
                onChange={(e) => setExpiration(e.target.value)}
                className="ml-2 px-2 py-1 border rounded"
              >
                <option value="1h">1 Hour</option>
                <option value="1d">1 Day</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days</option>
              </select>
            </label>
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <Lock className="w-5 h-5" />
              <span>Password Protection:</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ml-2 px-2 py-1 border rounded"
                placeholder="Optional"
              />
            </label>
          </div>

          <div>
            <p className="flex items-center space-x-2">
              <Eye className="w-5 h-5" />
              <span>Permissions:</span>
            </p>
            <div className="space-y-2 mt-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={permissions.includes('view')}
                  onChange={(e) => 
                    setPermissions(e.target.checked 
                      ? [...permissions, 'view'] 
                      : permissions.filter(p => p !== 'view'))
                  }
                />
                <span>View</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={permissions.includes('download')}
                  onChange={(e) => 
                    setPermissions(e.target.checked 
                      ? [...permissions, 'download'] 
                      : permissions.filter(p => p !== 'download'))
                  }
                />
                <span>Download</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 