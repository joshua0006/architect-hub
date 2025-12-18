import React, { useState, useEffect, useRef } from 'react';
import { Shield, Plus, Trash2, Save, X, ChevronDown, Search, Filter, Table } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth, UserRole } from '../contexts/AuthContext';
import { User } from '../types/auth';
import { userService } from '../services/userService';
import { authService } from '../services/authService';
import Layout from '../components/Layout';
import { Timestamp } from 'firebase/firestore';
import { CreateUserDto } from '../services/cloudFunctionService';
import {cloudFunctionService} from '../services/cloudFunctionService';
import toast, { Toaster } from 'react-hot-toast';
import PermissionsTableModal from '../components/PermissionsTableModal';
import UserDeleteConfirmModal from '../components/ui/UserDeleteConfirmModal';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [deleteModalUser, setDeleteModalUser] = useState<User | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.CONTRACTOR);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [updatingRoleData, setUpdatingRoleData] = useState<{userId: string, role: UserRole} | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  
  // Permissions modal state
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  
  // New user form
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    displayName: '',
    role: UserRole.CONTRACTOR as UserRole
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setEditingRoleId(null);
      }
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter users when search term or role filter changes
  useEffect(() => {
    if (!users.length) return;

    let result = [...users];
    
    // Apply search filter if searchTerm exists
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        user =>
          (user.displayName || '').toLowerCase().includes(term) ||
          (user.email || '').toLowerCase().includes(term)
      );
    }
    
    // Apply role filter if not set to ALL
    if (roleFilter !== 'ALL') {
      result = result.filter(user => user.role === roleFilter);
    }
    
    setFilteredUsers(result);
  }, [users, searchTerm, roleFilter]);

  // Load users on component mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoading(true);
        const usersData = await userService.getAllUsers();
        // Make sure users have all required properties from the auth User type
        const authUsers = usersData.map(user => ({
          id: user.id,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0] || 'User',
          role: user.role as UserRole,
          projectIds: user.projectIds || [],
          profile: user.profile || {
            photoURL: null,
            bio: '',
            title: '',
            phone: '',
            location: '',
            timezone: '',
            notifications: {
              email: true,
              push: true
            }
          },
          metadata: user.metadata || {
            lastLogin: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        })) as User[];
        setUsers(authUsers);
        setFilteredUsers(authUsers);
      } catch (err) {
        console.error('Error fetching users:', err);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewUser(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleRoleFilterChange = (role: UserRole | 'ALL') => {
    setRoleFilter(role);
    setIsFilterOpen(false);
  };

  const toggleFilter = () => {
    setIsFilterOpen(!isFilterOpen);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setRoleFilter('ALL');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);
      
      // Validate form
      if (!newUser.email || !newUser.password || !newUser.displayName) {
        setError('All fields are required');
        setLoading(false);
        return;
      }

      const createUserDto: CreateUserDto = {
        email: newUser.email,
        displayName: newUser.displayName,
        role: newUser.role as UserRole,
        password: newUser.password
      }

      await cloudFunctionService.createUser(createUserDto);
      
      // Create user without signing out the admin
      // await authService.createUserWithoutSignIn(
      //   newUser.email,
      //   newUser.password,
      //   newUser.displayName,
      //   newUser.role as UserRole
      // );
      
      // Reset form
      setNewUser({
        email: '',
        password: '',
        displayName: '',
        role: UserRole.CONTRACTOR
      });
      
      // Close form
      setIsCreatingUser(false);
      
      // Refresh users list
      const updatedUsers = await userService.getAllUsers();
      // Map to auth User type
      const authUsers = updatedUsers.map(user => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role as UserRole,
        projectIds: user.projectIds || [],
        profile: user.profile || {
          photoURL: null,
          bio: '',
          title: '',
          phone: '',
          location: '',
          timezone: '',
          notifications: {
            email: true,
            push: true
          }
        },
        metadata: user.metadata || {
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      })) as User[];
      toast.success('Successfully created new User!')
      setUsers(authUsers);
      setFilteredUsers(authUsers);
    } catch (err) {
      console.error('Error creating user:', err);
      setError('Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = (userId: string) => {
    const userToDelete = users.find(u => u.id === userId);
    if (userToDelete) {
      setDeleteModalUser(userToDelete);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteModalUser) return;

    try {
      setDeletingUser(deleteModalUser.id);
      setError(null);

      // Delete user using Cloud Function (handles both Auth and Firestore)
      await authService.deleteUserAccount(deleteModalUser.id);

      // Update the users list
      const updatedUsers = users.filter(user => user.id !== deleteModalUser.id);
      setUsers(updatedUsers);

      // Also update filtered users
      setFilteredUsers(filteredUsers.filter(user => user.id !== deleteModalUser.id));

      // Show success message
      toast.success(`Successfully deleted ${deleteModalUser.displayName}`);
      setDeleteModalUser(null);
    } catch (err: any) {
      console.error('Error deleting user:', err);
      const errorMessage = err.message || 'Failed to delete user';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setDeletingUser(null);
    }
  };

  const startEditingRole = (userId: string, currentRole: UserRole) => {
    // If already editing this user, close the dropdown
    if (editingRoleId === userId) {
      setEditingRoleId(null);
    } else {
      setEditingRoleId(userId);
      setSelectedRole(currentRole);
    }
  };

  const cancelEditingRole = () => {
    setEditingRoleId(null);
  };

  const handleRoleSelection = async (userId: string, role: UserRole) => {
    try {
      setUpdatingRole(true);
      setUpdatingRoleData({ userId, role });
      setError(null);
      
      await userService.updateUserRole(userId, role);
      
      // Update user in both the original and filtered users lists
      const updatedUsers = users.map(user => 
        user.id === userId ? { ...user, role: role } : user
      );
      setUsers(updatedUsers);
      
      setFilteredUsers(prevFiltered => prevFiltered.map(user => 
        user.id === userId ? { ...user, role: role } : user
      ));
      
      // Exit edit mode
      setEditingRoleId(null);
    } catch (err) {
      console.error('Error updating user role:', err);
      setError('Failed to update user role');
    } finally {
      setUpdatingRole(false);
      setUpdatingRoleData(null);
    }
  };

  // Format the last login timestamp
  const formatLastLogin = (timestamp: any) => {
    if (!timestamp) return 'Never';
    
    try {
      // Handle Firestore Timestamp objects
      if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleString();
      }
      
      // Handle string ISO dates
      if (typeof timestamp === 'string') {
        return new Date(timestamp).toLocaleString();
      }
      
      // Handle seconds/nanoseconds format
      if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleString();
      }
      
      return 'Invalid Date';
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Invalid Date';
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-purple-100 text-purple-800';
      case UserRole.STAFF:
        return 'bg-blue-100 text-blue-800';
      case UserRole.CONTRACTOR:
        return 'bg-green-100 text-green-800';
      case UserRole.CLIENT:
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Layout>
      <Toaster
        position="top-center"
        reverseOrder={false}
      />
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <Shield className="w-6 h-6 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setIsPermissionsModalOpen(true)}
              className="flex items-center space-x-1 px-4 py-2 bg-gray-100 text-gray-800 border border-gray-300 rounded-md hover:bg-gray-200 transition-colors"
            >
              <Table className="w-4 h-4" />
              <span>Project Access</span>
            </button>
            <button
              className="flex items-center space-x-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
              onClick={() => setIsCreatingUser(true)}
            >
              <Plus className="w-4 h-4" />
              <span>Create User</span>
            </button>
          </div>
        </div>
        
        {/* Permissions Table Modal */}
        <PermissionsTableModal 
          isOpen={isPermissionsModalOpen}
          onClose={() => setIsPermissionsModalOpen(false)}
        />
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}
        
        {isCreatingUser && (
          <div className="mb-6 p-4 bg-white rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Create New User</h2>
            
            <form onSubmit={handleCreateUser}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    name="displayName"
                    value={newUser.displayName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={newUser.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={newUser.password}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    name="role"
                    value={newUser.role}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value={UserRole.ADMIN}>Admin</option>
                    <option value={UserRole.STAFF}>CCA</option>
                    <option value={UserRole.CONTRACTOR}>Consultant</option>
                    <option value={UserRole.CLIENT}>Client</option>
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingUser(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow-sm overflow-visible">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">User Management</h2>
            <p className="text-gray-600">Manage users and their roles in the system</p>
            
            {/* Search and Filter Controls */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-grow">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              
              <div className="relative" ref={filterRef}>
                <button
                  onClick={toggleFilter}
                  className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 focus:outline-none"
                >
                  <Filter className="h-4 w-4" />
                  <span>Filter by Role</span>
                  <ChevronDown className="h-4 w-4" />
                </button>
                
                {isFilterOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50 overflow-visible">
                    <ul className="py-1">
                      <li 
                        className={`px-4 py-2 text-sm cursor-pointer hover:bg-gray-100 ${roleFilter === 'ALL' ? 'bg-gray-50' : ''}`}
                        onClick={() => handleRoleFilterChange('ALL')}
                      >
                        All Roles
                      </li>
                      {Object.values(UserRole).map((role) => (
                        <li 
                          key={role}
                          className={`px-4 py-2 text-sm cursor-pointer hover:bg-gray-100 ${roleFilter === role ? 'bg-gray-50' : ''}`}
                          onClick={() => handleRoleFilterChange(role as UserRole)}
                        >
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(role)}`}>
                            {role === UserRole.CONTRACTOR ? 'Consultant' : (role === UserRole.STAFF ? 'CCA' : role)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              
              {(searchTerm || roleFilter !== 'ALL') && (
                <button 
                  onClick={clearFilters}
                  className="px-4 py-2 text-purple-600 bg-purple-50 rounded-md hover:bg-purple-100"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
          
          {loading && !isCreatingUser ? (
            <div className="p-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
          ) : (
            <div className="overflow-visible">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Login
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map(user => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              {user.profile.photoURL ? (
                                <img
                                  className="h-10 w-10 rounded-full"
                                  src={user.profile.photoURL}
                                  alt={user.displayName}
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                                  {(user.displayName || 'U').charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {user.displayName}
                              </div>
                              <div className="text-sm text-gray-500">
                                {user.profile.title || 'No Title'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{user.email}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="relative" ref={editingRoleId === user.id ? dropdownRef : null}>
                            <div 
                              className={`flex items-center space-x-1 px-3 w-24 justify-center py-1 rounded-full cursor-pointer ${getRoleBadgeColor(user.role)}`}
                              onClick={() => startEditingRole(user.id, user.role as UserRole)}
                            >
                              {updatingRoleData?.userId === user.id ? (
                                <>
                                  <div className="w-3 h-3 border-t-2 border-current rounded-full animate-spin mr-1"></div>
                                  <span className="text-xs font-medium">Updating...</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-xs font-medium">{user.role === UserRole.CONTRACTOR ? 'Consultant' : (user.role === UserRole.STAFF ? 'CCA' : user.role)}</span>
                                  <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </div>
                            
                            {editingRoleId === user.id && !updatingRole && (
                              <div className="absolute z-50 mt-1 w-30 bg-white rounded-md shadow-lg overflow-visible">
                                <ul className="py-1">
                                  {Object.values(UserRole).map((role) => (
                                    <li 
                                      key={role}
                                      className={`px-4 py-2 text-sm cursor-pointer text-center hover:bg-gray-100 ${role === user.role ? 'bg-gray-50' : ''}`}
                                      onClick={() => handleRoleSelection(user.id, role as UserRole)}
                                    >
                                      <span className={`inline-block w-full px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(role)}`}>
                                        {role === UserRole.CONTRACTOR ? 'Consultant' : (role === UserRole.STAFF ? 'CCA' : role)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatLastLogin(user.metadata?.lastLogin)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end">
                            <button
                              className="text-red-600 hover:text-red-900"
                              aria-label="Delete user"
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={deletingUser === user.id}
                            >
                              {deletingUser === user.id ? (
                                <div className="w-4 h-4 border-t-2 border-red-600 rounded-full animate-spin"></div>
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No users found matching your filters.
                        {(searchTerm || roleFilter !== 'ALL') && (
                          <button 
                            onClick={clearFilters}
                            className="ml-2 text-purple-600 hover:underline"
                          >
                            Clear filters
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* User Delete Confirmation Modal */}
      <UserDeleteConfirmModal
        isOpen={deleteModalUser !== null}
        onClose={() => setDeleteModalUser(null)}
        user={deleteModalUser || { id: '', displayName: '', email: '' }}
        onDelete={confirmDeleteUser}
      />
    </Layout>
  );
} 