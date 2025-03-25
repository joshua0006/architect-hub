import React, { useState, useEffect } from 'react';
import { Shield, User, Check, X, Edit, Save } from 'lucide-react';
import { User as UserType } from '../types/auth';
import { userService } from '../services/userService';

interface UserPermissionManagerProps {
  showOnlyStaffEditable?: boolean;
}

export default function UserPermissionManager({ showOnlyStaffEditable = false }: UserPermissionManagerProps) {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editedRole, setEditedRole] = useState<'Staff' | 'Client'>('Client');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const fetchedUsers = await userService.getAllUsers();
      setUsers(fetchedUsers);
      setError(null);
    } catch (error) {
      setError('Failed to load users');
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditStart = (user: UserType) => {
    setEditingUserId(user.id);
    setEditedRole(user.role as 'Staff' | 'Client');
  };

  const handleEditCancel = () => {
    setEditingUserId(null);
    setEditedRole('Client');
  };

  const handleEditSave = async (userId: string) => {
    try {
      setLoading(true);
      await userService.updateUserRole(userId, editedRole);
      await loadUsers(); // Reload after update
      setEditingUserId(null);
    } catch (error) {
      setError(`Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Error updating user:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error && users.length === 0) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-md">
        <p>{error}</p>
      </div>
    );
  }

  // If showing only staff-editable users, filter out existing staff users
  const displayedUsers = showOnlyStaffEditable 
    ? users.filter(user => user.role === 'Client')
    : users;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="flex items-center space-x-2 px-6 py-4 border-b border-gray-200">
        <Shield className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-gray-900">User Permissions</h2>
      </div>

      <div className="divide-y divide-gray-200">
        {displayedUsers.map(user => (
          <div 
            key={user.id} 
            className="px-6 py-4 flex items-center justify-between"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                {user.profile?.photoURL ? (
                  <img 
                    src={user.profile.photoURL} 
                    alt={user.displayName} 
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-gray-500" />
                )}
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{user.displayName}</h3>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {editingUserId === user.id ? (
                <>
                  <select
                    value={editedRole}
                    onChange={(e) => setEditedRole(e.target.value as 'Staff' | 'Client')}
                    className="block w-32 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  >
                    <option value="Staff">Staff</option>
                    <option value="Client">Client</option>
                  </select>
                  
                  <button
                    onClick={() => handleEditSave(user.id)}
                    className="p-2 text-green-600 hover:text-green-700 transition-colors"
                    title="Save"
                  >
                    <Save className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={handleEditCancel}
                    className="p-2 text-gray-600 hover:text-gray-700 transition-colors"
                    title="Cancel"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </>
              ) : (
                <>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    user.role === 'Staff' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {user.role}
                  </span>
                  
                  <button
                    onClick={() => handleEditStart(user)}
                    className="p-2 text-blue-600 hover:text-blue-700 transition-colors"
                    title="Edit role"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {displayedUsers.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-500">
            No users found to manage.
          </div>
        )}
      </div>
    </div>
  );
} 