import React, { useState } from 'react';
import { Folder, MoreVertical, GripVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Draggable } from 'react-beautiful-dnd';
import DeleteProjectButton from './DeleteProjectButton';
import ProjectDeleteModal from './ProjectDeleteModal';

interface Project {
  id: string;
  name: string;
  description?: string;
  lastModified: Date | string;
  filesCount?: number;
  owner?: string;
}

interface ProjectCardProps {
  project: Project;
  onDeleteProject: (projectId: string) => Promise<void>;
  index: number;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onDeleteProject, index }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const navigate = useNavigate();

  const handleProjectClick = () => {
    navigate(`/projects/${project.id}`);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDropdown(false);
    setShowDeleteModal(true);
  };

  const handleDeleteProject = async () => {
    return onDeleteProject(project.id);
  };

  return (
    <>
      <Draggable draggableId={project.id} index={index}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className="mb-3"
          >
            <div 
              className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow p-4 cursor-pointer"
              onClick={handleProjectClick}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center">
                  <div className="bg-blue-100 p-2 rounded-lg mr-3">
                    <Folder className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center">
                  <div
                    {...provided.dragHandleProps}
                    className="p-1 mr-2 rounded-full hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="w-5 h-5 text-gray-400" />
                  </div>
                  
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDropdown(!showDropdown);
                      }}
                      className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical className="w-5 h-5 text-gray-500" />
                    </button>
                    
                    {showDropdown && (
                      <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                        <div className="py-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => {
                              navigate(`/projects/${project.id}/edit`);
                              setShowDropdown(false);
                            }}
                          >
                            Edit Project
                          </button>
                          
                          <button
                            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            onClick={handleDeleteClick}
                          >
                            Delete Project
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="mt-4 flex justify-between items-center">
                <div className="text-xs text-gray-500">
                  Last modified: {formatDate(project.lastModified)}
                </div>
                
                {project.filesCount !== undefined && (
                  <div className="text-xs text-gray-500">
                    {project.filesCount} {project.filesCount === 1 ? 'file' : 'files'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Draggable>
      
      <ProjectDeleteModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        projectName={project.name}
        onDelete={handleDeleteProject}
      />
    </>
  );
};

export default ProjectCard; 