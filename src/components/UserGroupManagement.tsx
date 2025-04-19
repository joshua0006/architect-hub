import React, { useState, useEffect } from 'react';
import { User as UserType, UserGroup, Permission, PermissionAction, PermissionResource } from '../types';
import { User as AuthUser } from '../types/auth';
import { userService } from '../services/userService';
import { permissionService } from '../services/permissionService';
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon, XCircleIcon } from '@heroicons/react/24/outline';

// Handle the case where User comes from auth context and may not have groupIds
interface UserWithGroups extends UserType {
  groupIds: string[];
}

interface UserGroupManagementProps {
  currentUser: AuthUser;
}

export default function UserGroupManagement({ currentUser }: UserGroupManagementProps) {
  // Ensure currentUser has groupIds property (even if empty)
  const userWithGroups: UserWithGroups = {
    ...currentUser,
    groupIds: (currentUser as any).groupIds || []
  };

  const [users, setUsers] = useState<UserWithGroups[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<UserGroup | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form states
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([]);
  
  // New permission form states
  const [isAddingPermission, setIsAddingPermission] = useState(false);
  const [permissionAction, setPermissionAction] = useState<PermissionAction>('view');
  const [permissionResource, setPermissionResource] = useState<PermissionResource>('project');
  const [permissionResourceId, setPermissionResourceId] = useState('*');
  const [permissionDescription, setPermissionDescription] = useState('');

  // Fetch data on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Only admins and staff can manage user groups
        if (userWithGroups.role !== 'Admin' && userWithGroups.role !== 'Staff') {
          setError('You do not have permission to manage user groups');
          setLoading(false);
          return;
        }
        
        const [usersData, groupsData, permissionsData] = await Promise.all([
          userService.getAllUsers(),
          userService.getUserGroups(),
          permissionService.getPermissions()
        ]);
        
        // Ensure all users have groupIds property
        const usersWithGroups: UserWithGroups[] = usersData.map(user => ({
          ...user,
          groupIds: (user as any).groupIds || []
        }));
        
        setUsers(usersWithGroups);
        setGroups(groupsData);
        setPermissions(permissionsData);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [userWithGroups.role]);
  
  // Reset form
  const resetForm = () => {
    setGroupName('');
    setGroupDescription('');
    setSelectedUsers([]);
    setSelectedPermissions([]);
    setIsEditing(false);
    setIsCreating(false);
    setSelectedGroup(null);
  };
  
  // Handle group selection
  const handleSelectGroup = (group: UserGroup) => {
    setSelectedGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description);
    setSelectedUsers(group.userIds);
    setSelectedPermissions(group.permissions);
    setIsEditing(false);
    setIsCreating(false);
  };
  
  // Toggle user selection
  const toggleUserSelection = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };
  
  // Toggle permission selection
  const togglePermissionSelection = (permission: Permission) => {
    const exists = selectedPermissions.some(p => p.id === permission.id);
    
    if (exists) {
      setSelectedPermissions(selectedPermissions.filter(p => p.id !== permission.id));
    } else {
      setSelectedPermissions([...selectedPermissions, permission]);
    }
  };
  
  // Create a new user group
  const createUserGroup = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!groupName.trim()) {
        setError('Group name is required');
        setLoading(false);
        return;
      }
      
      const newGroup: Omit<UserGroup, 'id' | 'metadata'> = {
        name: groupName.trim(),
        description: groupDescription.trim(),
        permissions: selectedPermissions,
        userIds: selectedUsers,
        createdBy: userWithGroups.id
      };
      
      await userService.createUserGroup(newGroup);
      
      // Refresh groups
      const updatedGroups = await userService.getUserGroups();
      setGroups(updatedGroups);
      
      resetForm();
    } catch (err) {
      console.error('Error creating user group:', err);
      setError('Failed to create user group. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Update an existing user group
  const updateUserGroup = async () => {
    try {
      if (!selectedGroup) return;
      
      setLoading(true);
      setError(null);
      
      if (!groupName.trim()) {
        setError('Group name is required');
        setLoading(false);
        return;
      }
      
      const updates: Partial<UserGroup> = {
        name: groupName.trim(),
        description: groupDescription.trim(),
        permissions: selectedPermissions
      };
      
      await userService.updateUserGroup(selectedGroup.id, updates);
      
      // Update user membership
      // First remove users that are no longer in the group
      const usersToRemove = selectedGroup.userIds.filter(
        userId => !selectedUsers.includes(userId)
      );
      
      // Then add new users to the group
      const usersToAdd = selectedUsers.filter(
        userId => !selectedGroup.userIds.includes(userId)
      );
      
      const membershipPromises = [
        ...usersToRemove.map(userId => 
          userService.removeUserFromGroup(userId, selectedGroup.id)
        ),
        ...usersToAdd.map(userId => 
          userService.addUserToGroup(userId, selectedGroup.id)
        )
      ];
      
      await Promise.all(membershipPromises);
      
      // Refresh groups
      const updatedGroups = await userService.getUserGroups();
      setGroups(updatedGroups);
      
      resetForm();
    } catch (err) {
      console.error('Error updating user group:', err);
      setError('Failed to update user group. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Delete a user group
  const deleteUserGroup = async () => {
    try {
      if (!selectedGroup) return;
      
      if (!confirm(`Are you sure you want to delete the group "${selectedGroup.name}"?`)) {
        return;
      }
      
      setLoading(true);
      setError(null);
      
      await userService.deleteUserGroup(selectedGroup.id);
      
      // Refresh groups
      const updatedGroups = await userService.getUserGroups();
      setGroups(updatedGroups);
      
      resetForm();
    } catch (err) {
      console.error('Error deleting user group:', err);
      setError('Failed to delete user group. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Create a new permission
  const createPermission = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!permissionDescription.trim()) {
        setError('Permission description is required');
        setLoading(false);
        return;
      }
      
      const newPermission: Omit<Permission, 'id'> = {
        action: permissionAction,
        resource: permissionResource,
        resourceId: permissionResourceId,
        description: permissionDescription.trim()
      };
      
      const createdPermission = await permissionService.createPermission(newPermission);
      
      // Add to selected permissions
      setSelectedPermissions([...selectedPermissions, createdPermission]);
      
      // Refresh permissions
      const updatedPermissions = await permissionService.getPermissions();
      setPermissions(updatedPermissions);
      
      // Reset permission form
      setPermissionAction('view');
      setPermissionResource('project');
      setPermissionResourceId('*');
      setPermissionDescription('');
      setIsAddingPermission(false);
    } catch (err) {
      console.error('Error creating permission:', err);
      setError('Failed to create permission. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading && groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary-500 border-r-transparent"></div>
          <p className="mt-2 text-gray-600">Loading user groups...</p>
        </div>
      </div>
    );
  }
  
  if (error && groups.length === 0) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <p>{error}</p>
      </div>
    );
  }
  
  const renderPermissionBadge = (permission: Permission) => {
    const actionColors = {
      view: 'bg-blue-100 text-blue-800',
      edit: 'bg-green-100 text-green-800',
      delete: 'bg-red-100 text-red-800',
      manage: 'bg-purple-100 text-purple-800'
    };
    
    return (
      <span 
        key={permission.id} 
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mr-2 mb-2 ${actionColors[permission.action]}`}
      >
        {permission.action} {permission.resource}
        {permission.resourceId !== '*' && ` (${permission.resourceId})`}
      </span>
    );
  };
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">User Group Management</h1>
      
      {error && (
        <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p>{error}</p>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left sidebar - Group list */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold">User Groups</h2>
            <button
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
              className="p-2 rounded-full bg-primary-50 text-primary-600 hover:bg-primary-100"
              disabled={loading}
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
          
          <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {groups.length === 0 ? (
              <p className="p-4 text-gray-500 text-center">No user groups found</p>
            ) : (
              groups.map(group => (
                <div
                  key={group.id}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedGroup?.id === group.id ? 'bg-gray-50' : ''
                  }`}
                  onClick={() => handleSelectGroup(group)}
                >
                  <h3 className="font-medium text-gray-900">{group.name}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">{group.description}</p>
                  <div className="mt-2 text-xs text-gray-500">
                    {group.userIds.length} {group.userIds.length === 1 ? 'user' : 'users'} •{' '}
                    {group.permissions.length} {group.permissions.length === 1 ? 'permission' : 'permissions'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        {/* Middle panel - Group details */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold">
              {isCreating
                ? 'Create New Group'
                : isEditing && selectedGroup
                ? `Edit ${selectedGroup.name}`
                : selectedGroup
                ? 'Group Details'
                : 'Select a Group'}
            </h2>
            {selectedGroup && !isEditing && !isCreating && (
              <div className="flex space-x-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100"
                  disabled={loading}
                >
                  <PencilIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={deleteUserGroup}
                  className="p-2 rounded-full bg-red-50 text-red-600 hover:bg-red-100"
                  disabled={loading}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
          
          <div className="p-4 h-full max-h-[600px] overflow-y-auto">
            {!selectedGroup && !isCreating ? (
              <p className="text-gray-500 text-center p-8">
                Select a group from the list or create a new one
              </p>
            ) : (
              <div className="space-y-4">
                {/* Group name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Group Name
                  </label>
                  {isEditing || isCreating ? (
                    <input
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Enter group name"
                    />
                  ) : (
                    <p className="text-gray-900">{selectedGroup?.name}</p>
                  )}
                </div>
                
                {/* Group description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  {isEditing || isCreating ? (
                    <textarea
                      value={groupDescription}
                      onChange={(e) => setGroupDescription(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="Enter group description"
                    />
                  ) : (
                    <p className="text-gray-700">{selectedGroup?.description}</p>
                  )}
                </div>
                
                {/* Permissions */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Permissions
                    </label>
                    {(isEditing || isCreating) && (
                      <button
                        onClick={() => setIsAddingPermission(!isAddingPermission)}
                        className="text-xs flex items-center text-primary-600 hover:text-primary-800"
                        type="button"
                      >
                        {isAddingPermission ? 'Cancel' : 'Add Permission'}
                      </button>
                    )}
                  </div>
                  
                  {/* Permission selection for existing permissions */}
                  {(isEditing || isCreating) && !isAddingPermission && (
                    <div className="mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-60 overflow-y-auto">
                      <p className="text-xs text-gray-500 mb-2">Select existing permissions:</p>
                      <div className="space-y-2">
                        {permissions.length === 0 ? (
                          <p className="text-gray-500 text-sm">No permissions available</p>
                        ) : (
                          permissions.map(permission => (
                            <div key={permission.id} className="flex items-center">
                              <input
                                type="checkbox"
                                id={`perm-${permission.id}`}
                                checked={selectedPermissions.some(p => p.id === permission.id)}
                                onChange={() => togglePermissionSelection(permission)}
                                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                              />
                              <label
                                htmlFor={`perm-${permission.id}`}
                                className="ml-2 block text-sm text-gray-900"
                              >
                                {permission.description} ({permission.action} {permission.resource})
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* New permission form */}
                  {isAddingPermission && (
                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-4">
                      <h4 className="text-sm font-medium mb-3">Create New Permission</h4>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Action
                          </label>
                          <select
                            value={permissionAction}
                            onChange={(e) => setPermissionAction(e.target.value as PermissionAction)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                          >
                            <option value="view">View</option>
                            <option value="edit">Edit</option>
                            <option value="delete">Delete</option>
                            <option value="manage">Manage</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Resource
                          </label>
                          <select
                            value={permissionResource}
                            onChange={(e) => setPermissionResource(e.target.value as PermissionResource)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                          >
                            <option value="project">Project</option>
                            <option value="folder">Folder</option>
                            <option value="file">File</option>
                            <option value="team">Team</option>
                          </select>
                        </div>
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Resource ID (use * for all)
                        </label>
                        <input
                          type="text"
                          value={permissionResourceId}
                          onChange={(e) => setPermissionResourceId(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                          placeholder="Resource ID or * for all"
                        />
                      </div>
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={permissionDescription}
                          onChange={(e) => setPermissionDescription(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm"
                          placeholder="E.g., View all projects"
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setIsAddingPermission(false)}
                          className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={createPermission}
                          className="px-3 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
                          disabled={loading}
                        >
                          Add Permission
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Display selected permissions */}
                  <div className="border border-gray-200 rounded-lg p-3 min-h-[100px] max-h-60 overflow-y-auto">
                    {selectedPermissions.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-6">
                        No permissions selected
                      </p>
                    ) : (
                      <div className="flex flex-wrap">
                        {selectedPermissions.map(renderPermissionBadge)}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Action buttons for edit/create */}
                {(isEditing || isCreating) && (
                  <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                      disabled={loading}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={isCreating ? createUserGroup : updateUserGroup}
                      className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
                      disabled={loading}
                    >
                      {loading ? (
                        <span className="flex items-center">
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent mr-2"></span>
                          {isCreating ? 'Creating...' : 'Updating...'}
                        </span>
                      ) : (
                        isCreating ? 'Create Group' : 'Update Group'
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Right panel - Users */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Users</h2>
          </div>
          
          {(isEditing || isCreating) ? (
            <div className="p-4 max-h-[600px] overflow-y-auto">
              <p className="text-sm text-gray-500 mb-3">
                Select users to include in this group:
              </p>
              <div className="space-y-2">
                {users.length === 0 ? (
                  <p className="text-gray-500 text-center">No users available</p>
                ) : (
                  users.map(user => (
                    <label 
                      key={user.id} 
                      className="flex items-center p-2 hover:bg-gray-50 rounded-md cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => toggleUserSelection(user.id)}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <div className="ml-3">
                        <p className="text-sm font-medium text-gray-900">{user.displayName}</p>
                        <p className="text-xs text-gray-500">{user.email} • {user.role}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : (
            selectedGroup ? (
              <div className="p-4 max-h-[600px] overflow-y-auto">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium text-gray-900">Group Members</h3>
                  <span className="text-xs text-gray-500">
                    {selectedGroup.userIds.length} {selectedGroup.userIds.length === 1 ? 'user' : 'users'}
                  </span>
                </div>
                
                <div className="space-y-3">
                  {selectedGroup.userIds.length === 0 ? (
                    <p className="text-gray-500 text-center p-4">No users in this group</p>
                  ) : (
                    selectedGroup.userIds.map(userId => {
                      const user = users.find(u => u.id === userId);
                      return user ? (
                        <div key={user.id} className="flex items-center p-2 bg-gray-50 rounded-md">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{user.displayName}</p>
                            <p className="text-xs text-gray-500">{user.email} • {user.role}</p>
                          </div>
                        </div>
                      ) : (
                        <div key={userId} className="text-gray-400 text-sm">
                          Unknown user ({userId})
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                Select a group to view its members
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
} 