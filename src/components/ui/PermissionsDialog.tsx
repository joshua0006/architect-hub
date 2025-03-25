import React, { useState } from 'react';
import { Shield, Eye, X, Users, Edit, File } from 'lucide-react';

interface PermissionsDialogProps {
  isOpen: boolean;
  title: string;
  itemId: string;
  itemType: 'document' | 'folder';
  currentPermission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL';
  onSave: (permission: 'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL') => Promise<void>;
  onCancel: () => void;
}

export function PermissionsDialog({
  isOpen,
  title,
  itemId,
  itemType,
  currentPermission,
  onSave,
  onCancel
}: PermissionsDialogProps) {
  const [permission, setPermission] = useState<'STAFF_ONLY' | 'CONTRACTORS_WRITE' | 'CLIENTS_READ' | 'ALL'>(currentPermission);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setLoading(true);
      await onSave(permission);
    } catch (error) {
      console.error('Error saving permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 overflow-y-auto z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Shield className="w-5 h-5 mr-2 text-blue-500" />
            {title}
          </h2>
          <button 
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-2">
              Who can access this {itemType}?
            </label>
            
            <div className="space-y-3 mt-3">
              <label className="flex items-center space-x-3 p-3 border rounded-md bg-white hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="permission"
                  value="STAFF_ONLY"
                  checked={permission === 'STAFF_ONLY'}
                  onChange={() => setPermission('STAFF_ONLY')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex flex-col">
                  <span className="text-gray-900 font-medium">Staff Only</span>
                  <span className="text-gray-500 text-sm">Only staff members can view and edit this {itemType}</span>
                </div>
              </label>
              
              <label className="flex items-center space-x-3 p-3 border rounded-md bg-white hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="permission"
                  value="CONTRACTORS_WRITE"
                  checked={permission === 'CONTRACTORS_WRITE'}
                  onChange={() => setPermission('CONTRACTORS_WRITE')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex flex-col">
                  <span className="text-gray-900 font-medium">Contractors (Read & Write)</span>
                  <span className="text-gray-500 text-sm">Contractors can read and write to this {itemType}</span>
                </div>
              </label>
              
              <label className="flex items-center space-x-3 p-3 border rounded-md bg-white hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="permission"
                  value="CLIENTS_READ"
                  checked={permission === 'CLIENTS_READ'}
                  onChange={() => setPermission('CLIENTS_READ')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex flex-col">
                  <span className="text-gray-900 font-medium">Clients (Read Only)</span>
                  <span className="text-gray-500 text-sm">Clients can view but not modify this {itemType}</span>
                </div>
              </label>
              
              <label className="flex items-center space-x-3 p-3 border rounded-md bg-white hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="permission"
                  value="ALL"
                  checked={permission === 'ALL'}
                  onChange={() => setPermission('ALL')}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex flex-col">
                  <span className="text-gray-900 font-medium">All Users</span>
                  <span className="text-gray-500 text-sm">Anyone with project access can view this {itemType}</span>
                </div>
              </label>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 rounded-md text-sm text-blue-700">
              <div className="flex items-start">
                <Shield className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Access Level Summary:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Staff can read and write to all folders</li>
                    <li>Contractors can read and write to selected folders only</li>
                    <li>Clients can read only selected folders</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 