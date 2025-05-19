import React, { useEffect, useRef } from 'react';
import { X, Check, Info, AlertTriangle } from 'lucide-react';
import { UserRole } from '../contexts/AuthContext';

interface PermissionsTableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PermissionsTableModal({ isOpen, onClose }: PermissionsTableModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Helper to display checkmark or X
  const renderPermissionIcon = (hasPermission: boolean | string) => {
    if (hasPermission === true) {
      return <Check className="w-5 h-5 text-green-600 mx-auto" />;
    } else if (hasPermission === false) {
      return <X className="w-5 h-5 text-red-600 mx-auto" />;
    } else {
      // String value that indicates conditional access
      return (
        <div className="flex flex-col items-center">
          <Check className="w-5 h-5 text-amber-500 mx-auto" />
          <span className="text-xs text-amber-600 font-medium whitespace-nowrap">{hasPermission}</span>
        </div>
      );
    }
  };

  // Function to get role display name
  const getRoleDisplayName = (role: UserRole) => {
    switch (role) {
      case UserRole.CONTRACTOR:
        return 'Consultant';
      case UserRole.STAFF:
        return 'CCA';
      default:
        return role;
    }
  };

  // Simple permission matrix for the three specific permissions with conditional access
  const permissionMatrix = {
    'projects:view': {
      [UserRole.ADMIN]: true,
      [UserRole.STAFF]: true,
      [UserRole.CONTRACTOR]: 'If team member',
      [UserRole.CLIENT]: 'If team member',
    },
    'documents:view': {
      [UserRole.ADMIN]: true,
      [UserRole.STAFF]: true,
      [UserRole.CONTRACTOR]: 'If team member',
      [UserRole.CLIENT]: 'If team member',
    },
    'admin:view': {
      [UserRole.ADMIN]: true,
      [UserRole.STAFF]: false,
      [UserRole.CONTRACTOR]: false,
      [UserRole.CLIENT]: false,
    },
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div 
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-full max-h-[90vh] overflow-auto"
        style={{ maxWidth: '700px' }}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">Project Access Permissions</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>
        
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-start mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 mr-2 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-700">
              <span className="font-medium">Important:</span> Consultants and Clients can only access projects and documents when they are members of the project team. Access is restricted to authorized team members only.
            </p>
          </div>
          <div className="flex items-center mt-2">
            <Info className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" />
            <p className="text-sm text-gray-600">
              This table shows permissions by role. A green checkmark (<Check className="w-4 h-4 text-green-600 inline" />) indicates unrestricted access, an amber checkmark (<Check className="w-4 h-4 text-amber-500 inline" />) indicates conditional access, and a red X (<X className="w-4 h-4 text-red-600 inline" />) indicates no access.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Permission
                </th>
                {Object.values(UserRole).map(role => (
                  <th 
                    key={role}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" 
                  >
                    {getRoleDisplayName(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr className="bg-white">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  View Projects
                </td>
                {Object.values(UserRole).map(role => (
                  <td key={role} className="px-6 py-4 text-center">
                    {renderPermissionIcon(permissionMatrix['projects:view'][role])}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  View Documents
                </td>
                {Object.values(UserRole).map(role => (
                  <td key={role} className="px-6 py-4 text-center">
                    {renderPermissionIcon(permissionMatrix['documents:view'][role])}
                  </td>
                ))}
              </tr>
              <tr className="bg-white">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  Admin Dashboard Access
                </td>
                {Object.values(UserRole).map(role => (
                  <td key={role} className="px-6 py-4 text-center">
                    {renderPermissionIcon(permissionMatrix['admin:view'][role])}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <h3 className="font-medium text-gray-900 mb-2">Access Control Enforcement:</h3>
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
            <li>Project membership is managed by administrators and staff</li>
            <li>Users can only see projects they have been explicitly invited to</li>
            <li>Document access follows project membership restrictions</li>
            <li>Each project can have custom permission settings for specific files or folders</li>
          </ul>
        </div>
        
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
} 