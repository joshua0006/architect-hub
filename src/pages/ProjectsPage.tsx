import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { DragDropContext, Droppable, DropResult } from 'react-beautiful-dnd';
import ProjectCard from '../components/ProjectCard';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { userService } from '../services';

// Mock project data type
interface Project {
  id: string;
  name: string;
  description?: string;
  lastModified: Date | string;
  filesCount?: number;
  owner?: string;
}

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  // Mock loading projects
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        // Simulate API call with setTimeout
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock project data
        const mockProjects: Project[] = [
          {
            id: '1',
            name: 'Marketing Website',
            description: 'Company marketing website redesign project',
            lastModified: new Date(Date.now() - 86400000 * 2), // 2 days ago
            filesCount: 24,
          },
          {
            id: '2',
            name: 'Mobile App UI',
            description: 'UI/UX design for the mobile application',
            lastModified: new Date(Date.now() - 86400000 * 5), // 5 days ago
            filesCount: 42,
          },
          {
            id: '3',
            name: 'Brand Guidelines',
            description: 'Official brand guidelines and assets',
            lastModified: new Date(Date.now() - 86400000 * 10), // 10 days ago
            filesCount: 15,
          }
        ];
        
        if (user?.id) {
          // Try to load saved order from user preferences
          const savedOrder = await userService.getProjectOrder(user.id);
          
          if (savedOrder && savedOrder.length > 0) {
            // Create a map for quick lookup
            const projectMap = new Map(mockProjects.map(p => [p.id, p]));
            
            // Create ordered array from saved IDs, only including projects that exist
            const orderedProjects = savedOrder
              .map(id => projectMap.get(id))
              .filter(p => p !== undefined) as Project[];
            
            // Add any projects that aren't in saved order at the end
            mockProjects.forEach(project => {
              if (!savedOrder.includes(project.id)) {
                orderedProjects.push(project);
              }
            });
            
            setProjects(orderedProjects);
            console.log('Loaded custom project order from user preferences');
          } else {
            setProjects(mockProjects);
          }
        } else {
          setProjects(mockProjects);
        }
      } catch (err) {
        setError('Failed to load projects');
        console.error('Error fetching projects:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProjects();
  }, [user]);

  // Handle deleting a project
  const handleDeleteProject = async (projectId: string) => {
    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update local state after successful deletion
      setProjects(prevProjects => prevProjects.filter(project => project.id !== projectId));
      
      // Show success message
      showToast('Project successfully deleted', 'success');
      
      // Remove the deleted project from saved order if exists
      if (user?.id) {
        const savedOrder = await userService.getProjectOrder(user.id);
        if (savedOrder && savedOrder.includes(projectId)) {
          const updatedOrder = savedOrder.filter(id => id !== projectId);
          await userService.saveProjectOrder(user.id, updatedOrder);
          console.log('Updated saved order after deletion');
        }
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      showToast('Failed to delete project', 'error');
      throw error; // Re-throw to handle in the component
    }
  };

  // Create new project
  const handleCreateProject = () => {
    navigate('/projects/new');
  };

  // Handle drag end event
  const handleDragEnd = (result: DropResult) => {
    const { destination, source } = result;

    // If dropped outside the list or didn't move
    if (!destination || (destination.index === source.index)) {
      return;
    }

    // Reorder the list
    const reorderedProjects = Array.from(projects);
    const [removed] = reorderedProjects.splice(source.index, 1);
    reorderedProjects.splice(destination.index, 0, removed);

    // Update state with new order
    setProjects(reorderedProjects);
    
    // Save the new order to user preferences
    if (user?.id) {
      const projectIds = reorderedProjects.map(project => project.id);
      userService.saveProjectOrder(user.id, projectIds)
        .then(() => {
          console.log('Project order saved to user preferences');
          showToast('Project order updated', 'success');
        })
        .catch(error => {
          console.error('Error saving project order:', error);
        });
    } else {
      showToast('Project order updated', 'success');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={handleCreateProject}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          New Project
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-gray-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-12 h-12 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="ml-4 text-gray-600">Loading projects...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm underline mt-2"
          >
            Try again
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-10 text-center">
          <h3 className="text-lg font-medium text-gray-700 mb-2">No projects yet</h3>
          <p className="text-gray-500 mb-6">Create your first project to get started</p>
          <button
            onClick={handleCreateProject}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Project
          </button>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="projects-list">
            {(provided) => (
              <div 
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {projects.map((project, index) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onDeleteProject={handleDeleteProject}
                    index={index}
                  />
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
};

export default ProjectsPage; 