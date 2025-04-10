import React, { useState } from 'react';
import { Plus, X, Loader2, FolderOpen, AlertCircle } from 'lucide-react';
import { Project } from '../types';
import { projectService } from '../services';
import { useAuth } from '../contexts/AuthContext';

interface AddProjectProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function AddProject({ onSuccess, onCancel }: AddProjectProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    status: 'active' as Project['status'],
    progress: 0,
    startDate: '',
    endDate: '',
    metadata: {
      industry: '',
      projectType: '',
      location: {
        city: '',
        state: '',
        country: ''
      },
      budget: '',
      scope: ''
    }
  });

  // Ensure only staff users can create projects
  if (user?.role !== 'Staff') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-gray-900">Add New Project</h2>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md flex items-start">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
            <p>Only staff members can create new projects.</p>
          </div>
          
          <div className="flex justify-end space-x-3 pt-6">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsCreating(true);
      setError(null);
      
      // Clean up empty values before submission
      const cleanedData: Omit<Project, 'id'> = {
        name: formData.name,
        client: formData.client,
        status: formData.status,
        progress: formData.progress,
        startDate: formData.startDate,
        endDate: formData.endDate,
        // Automatically add the current user (project creator) to the project team members
        teamMemberIds: user ? [user.id] : [],
        metadata: {
          industry: formData.metadata.industry || 'N/A',
          projectType: formData.metadata.projectType || 'N/A',
          location: {
            city: formData.metadata.location.city || 'N/A',
            state: formData.metadata.location.state || 'N/A',
            country: formData.metadata.location.country || 'N/A'
          },
          budget: formData.metadata.budget || 'N/A',
          scope: formData.metadata.scope || 'N/A'
        }
      };
      
      await projectService.create(cleanedData);
      
      // Close the modal but don't need to manually refresh the list
      // Firebase real-time subscription will update the projects list automatically
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error creating project:', error);
      setError(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name.startsWith('metadata.location.')) {
      // Handle location sub-fields (city, state, country)
      const locationField = name.split('.')[2]; // Get the third part (e.g., "city" from "metadata.location.city")
      setFormData(prev => ({
        ...prev,
        metadata: {
          ...prev.metadata,
          location: {
            ...prev.metadata.location,
            [locationField]: value
          }
        }
      }));
    } else if (name.includes('.')) {
      // Handle other metadata fields
      const [parent, child] = name.split('.');
      setFormData(prev => {
        if (parent === 'metadata') {
          return {
            ...prev,
            metadata: {
              ...prev.metadata,
              [child]: value
            }
          };
        }
        return prev;
      });
    } else {
      // Handle top-level fields
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
        {/* Loading overlay */}
        {isCreating && (
          <div className="absolute inset-0 bg-white bg-opacity-80 z-10 flex flex-col items-center justify-center">
            <div className="bg-blue-50 rounded-lg p-6 shadow-lg max-w-xs w-full text-center">
              <div className="flex justify-center mb-3">
                <FolderOpen className="w-10 h-10 text-blue-500 animate-pulse" />
              </div>
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Creating Project</h3>
              <p className="text-sm text-gray-600">Setting up folder structure...</p>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">Add New Project</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            disabled={isCreating}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter project name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client
                </label>
                <input
                  type="text"
                  name="client"
                  value={formData.client}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter client name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Project Details */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Project Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Industry
                </label>
                <input
                  type="text"
                  name="metadata.industry"
                  value={formData.metadata.industry}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Construction"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Type
                </label>
                <input
                  type="text"
                  name="metadata.projectType"
                  value={formData.metadata.projectType}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Residential"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Location</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    name="metadata.location.city"
                    value={formData.metadata.location.city}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter city"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State/Province
                  </label>
                  <input
                    type="text"
                    name="metadata.location.state"
                    value={formData.metadata.location.state}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter state/province"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    name="metadata.location.country"
                    value={formData.metadata.location.country}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter country"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Budget
              </label>
              <input
                type="text"
                name="metadata.budget"
                value={formData.metadata.budget}
                onChange={handleChange}
                placeholder="e.g., 120M USD"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scope
              </label>
              <textarea
                name="metadata.scope"
                value={formData.metadata.scope}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter project scope"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors flex items-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Project</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}