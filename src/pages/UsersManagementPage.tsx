import React from 'react';
import { Shield } from 'lucide-react';
import UserPermissionManager from '../components/UserPermissionManager';

export default function UsersManagementPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center space-x-2 mb-6">
        <Shield className="w-6 h-6 text-primary-600" />
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
      </div>
      
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Manage User Permissions</h2>
          <p className="text-gray-600 mb-6">
            As a staff member, you can assign user roles and manage access permissions. 
            Staff users have access to all project folders, while client users can only 
            access designated shared folders.
          </p>
          
          <UserPermissionManager />
        </div>
      </div>
    </div>
  );
} 