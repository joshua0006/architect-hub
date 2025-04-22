import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Settings, Users, FolderLock, ChevronLeft } from 'lucide-react';
import { Project } from '../types';
import { projectService } from '../services/projectService';
import FolderPermissionManager from '../components/FolderPermissionManager';
import UserPermissionManager from '../components/UserPermissionManager';
import { useAuth } from '../contexts/AuthContext';

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'folders' | 'users'>('folders');

  useEffect(() => {
    if (projectId) {
      loadProject(projectId);
    } else {
      setError('No project ID provided');
      setLoading(false);
    }
  }, [projectId]);

  const loadProject = async (id: string) => {
    try {
      setLoading(true);
      const projectData = await projectService.getById(id);
      
      if (!projectData) {
        setError('Project not found');
        setProject(null);
      } else {
        setProject(projectData);
        setError(null);
      }
    } catch (err) {
      setError('Failed to load project. Please try again.');
      console.error('Error loading project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(`/projects/${projectId}`);
  };

  // Check if user is staff or admin
  const isStaffOrAdmin = user && (user.role === 'Staff' || user.role === 'Admin');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 text-red-600 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p>{error || 'Project not found'}</p>
          <button 
            onClick={() => navigate('/projects')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  // Non-staff/non-admin users should not access this page
  if (!isStaffOrAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 text-yellow-700 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Permission Denied</h2>
          <p>Only staff and admin members can access project settings.</p>
          <button 
            onClick={() => navigate(`/projects/${projectId}`)}
            className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors"
          >
            Back to Project
          </button>
        </div>
      </div>
    );
  }

  // If no projectId is provided, show an error
  if (!projectId) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 text-red-600 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p>No project ID provided</p>
          <button 
            onClick={() => navigate('/projects')}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <button 
            onClick={handleBack}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center space-x-2">
              <Settings className="w-6 h-6 text-gray-600" />
              <span>{project.name} Settings</span>
            </h1>
            <p className="text-gray-600">Manage project permissions and access</p>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex border-b border-gray-200">
          <button
            className={`px-6 py-3 font-medium text-sm focus:outline-none ${
              activeTab === 'folders'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('folders')}
          >
            <div className="flex items-center space-x-2">
              <FolderLock className="w-4 h-4" />
              <span>Folder Permissions</span>
            </div>
          </button>
          <button
            className={`px-6 py-3 font-medium text-sm focus:outline-none ${
              activeTab === 'users'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('users')}
          >
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>User Permissions</span>
            </div>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        {activeTab === 'folders' ? (
          <div className="p-6">
            <p className="text-gray-600 mb-6">
              Manage which users can access specific folders in this project. By default, staff members 
              can access all folders, while client access is restricted to certain folders.
            </p>
            <FolderPermissionManager projectId={projectId} />
          </div>
        ) : (
          <div className="p-6">
            <p className="text-gray-600 mb-6">
              Manage user roles and permissions for this project. Staff members have full access,
              while client access can be customized per folder.
            </p>
            <UserPermissionManager showOnlyStaffEditable={true} />
          </div>
        )}
      </div>
    </div>
  );
} 