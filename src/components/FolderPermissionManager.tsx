import React, { useState, useEffect } from 'react';
import { FolderLock, UserCircle, Check, X, Shield, FolderOpen, Users, Save, Edit, Trash2 } from 'lucide-react';
import { Folder, FolderPermission } from '../types';
import { User } from '../types/auth';
import { folderService } from '../services/folderService';
import { folderPermissionService } from '../services/folderPermissionService';
import { userService } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';

interface FolderPermissionManagerProps {
  projectId: string;
}

export default function FolderPermissionManager({ projectId }: FolderPermissionManagerProps) {
  const { user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [permissions, setPermissions] = useState<FolderPermission[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clientUsers, setClientUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [selectedAccess, setSelectedAccess] = useState<'ALL' | 'STAFF_ONLY'>('STAFF_ONLY');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [useCustomUsers, setUseCustomUsers] = useState(false);

  useEffect(() => {
    if (projectId && user) {
      loadData();
    }
  }, [projectId, user]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load folders for this project
      const projectFolders = await folderService.getByProjectId(projectId);
      setFolders(projectFolders);
      
      // Load permissions
      const folderPermissions = await folderPermissionService.getByProjectId(projectId);
      setPermissions(folderPermissions);
      
      // Load all project users
      const projectUsers = await userService.getUsersByProject(projectId);
      setUsers(projectUsers);
      
      // Filter for client users only
      const clientUsersList = projectUsers.filter(user => user.role === 'Client');
      setClientUsers(clientUsersList);
      
      setError(null);
    } catch (err) {
      setError('Failed to load data. Please try again.');
      console.error('Error loading folder permission data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditStart = (folderId: string) => {
    const permission = permissions.find(p => p.folderId === folderId);
    
    if (permission) {
      setSelectedAccess(permission.accessLevel);
      setUseCustomUsers(!!permission.customAccessUsers?.length);
      setSelectedUsers(permission.customAccessUsers || []);
    } else {
      // Default to folder's metadata access or STAFF_ONLY
      const folder = folders.find(f => f.id === folderId);
      setSelectedAccess(folder?.metadata?.access || 'STAFF_ONLY');
      setUseCustomUsers(false);
      setSelectedUsers([]);
    }
    
    setEditingFolderId(folderId);
  };

  const handleCancelEdit = () => {
    setEditingFolderId(null);
    setSelectedAccess('STAFF_ONLY');
    setUseCustomUsers(false);
    setSelectedUsers([]);
  };

  const toggleUserSelection = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(prevSelected => prevSelected.filter(id => id !== userId));
    } else {
      setSelectedUsers(prevSelected => [...prevSelected, userId]);
    }
  };

  const handleSavePermission = async (folderId: string) => {
    if (!user) return;
    
    try {
      setLoading(true);
      
      const existingPermission = permissions.find(p => p.folderId === folderId);
      
      if (existingPermission) {
        // Update existing permission
        await folderPermissionService.update(existingPermission.id, {
          accessLevel: selectedAccess,
          customAccessUsers: useCustomUsers ? selectedUsers : [],
          overrideDefault: true,
          updatedBy: user.id
        });
      } else {
        // Create new permission
        await folderPermissionService.create({
          folderId,
          projectId,
          accessLevel: selectedAccess,
          customAccessUsers: useCustomUsers ? selectedUsers : [],
          overrideDefault: true,
          createdBy: user.id
        });
      }
      
      // Reload permissions
      const updatedPermissions = await folderPermissionService.getByProjectId(projectId);
      setPermissions(updatedPermissions);
      
      setEditingFolderId(null);
    } catch (err) {
      setError('Failed to save permission. Please try again.');
      console.error('Error saving folder permission:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetToDefault = async (permissionId: string, folderId: string) => {
    try {
      setLoading(true);
      
      // Delete the permission to revert to default
      await folderPermissionService.delete(permissionId);
      
      // Update state
      setPermissions(prevPermissions => 
        prevPermissions.filter(p => p.id !== permissionId)
      );
      
      setError(null);
    } catch (err) {
      setError('Failed to reset permission. Please try again.');
      console.error('Error resetting folder permission:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !folders.length) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error && !folders.length) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-md">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="flex items-center space-x-2 px-6 py-4 border-b border-gray-200">
        <FolderLock className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-gray-900">Folder Permissions</h2>
      </div>

      {folders.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          No folders found for this project.
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {folders.map(folder => {
            const permission = permissions.find(p => p.folderId === folder.id);
            const isEditing = editingFolderId === folder.id;
            
            return (
              <div key={folder.id} className="px-6 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <FolderOpen className="w-5 h-5 text-gray-500" />
                    <h3 className="font-medium text-gray-900">{folder.name}</h3>
                  </div>
                  
                  {!isEditing && (
                    <div className="flex items-center space-x-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        (permission?.accessLevel || folder.metadata?.access) === 'ALL' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {permission?.overrideDefault ? "Custom" : "Default"}: {" "}
                        {(permission?.accessLevel || folder.metadata?.access) === 'ALL' ? 'All Users' : 'Staff Only'}
                      </span>
                      
                      <button
                        onClick={() => handleEditStart(folder.id)}
                        className="p-1 text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      
                      {permission && (
                        <button
                          onClick={() => handleResetToDefault(permission.id, folder.id)}
                          className="p-1 text-red-600 hover:text-red-700 transition-colors"
                          title="Reset to default"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                {isEditing && (
                  <div className="bg-gray-50 p-4 rounded-md mt-2">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Access Level
                        </label>
                        <select
                          value={selectedAccess}
                          onChange={(e) => setSelectedAccess(e.target.value as 'ALL' | 'STAFF_ONLY')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="STAFF_ONLY">Staff Only</option>
                          <option value="ALL">All Users (Staff & Clients)</option>
                        </select>
                      </div>
                      
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <input
                            type="checkbox"
                            id={`custom-users-${folder.id}`}
                            checked={useCustomUsers}
                            onChange={() => setUseCustomUsers(!useCustomUsers)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label htmlFor={`custom-users-${folder.id}`} className="text-sm font-medium text-gray-700">
                            Specify individual clients who can access
                          </label>
                        </div>
                        
                        {useCustomUsers && (
                          <div className="mt-2 border border-gray-200 rounded-md p-2 max-h-40 overflow-y-auto">
                            {clientUsers.length === 0 ? (
                              <p className="text-sm text-gray-500 p-2">No client users found for this project.</p>
                            ) : (
                              <ul className="space-y-1">
                                {clientUsers.map(user => (
                                  <li key={user.id} className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-md">
                                    <input
                                      type="checkbox"
                                      id={`user-${folder.id}-${user.id}`}
                                      checked={selectedUsers.includes(user.id)}
                                      onChange={() => toggleUserSelection(user.id)}
                                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <label htmlFor={`user-${folder.id}-${user.id}`} className="flex items-center space-x-2 text-sm">
                                      <UserCircle className="w-4 h-4 text-gray-500" />
                                      <span>{user.displayName}</span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex space-x-2 justify-end">
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSavePermission(folder.id)}
                          className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-1"
                        >
                          <Save className="w-4 h-4" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {permission && permission.customAccessUsers && permission.customAccessUsers.length > 0 && !isEditing && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 flex items-center">
                      <Users className="w-3 h-3 mr-1" />
                      Custom access: {permission.customAccessUsers.length} user(s)
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 