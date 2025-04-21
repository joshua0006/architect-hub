import { folderService } from './folderService';
import { FolderTemplate, PROJECT_FOLDER_TEMPLATE, FolderAccess } from '../constants/folderTemplates';
import { Folder } from '../types';

export const folderTemplateService = {
  /**
   * Create a folder structure from a template
   * @param projectId The ID of the project to create folders for
   * @param template Optional template to use (uses default if not provided)
   * @returns Promise that resolves when all folders have been created
   */
  async createFolderStructure(
    projectId: string,
    template: FolderTemplate[] = PROJECT_FOLDER_TEMPLATE
  ): Promise<void> {
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    try {
      console.log(`Creating folder structure for project ${projectId}`);
      
      // First create the invisible root folder for the project
      const rootFolder = await this.createInvisibleRootFolder(projectId);
      
      // Then create the template folders under this root folder
      await this.createFoldersRecursively(projectId, template, rootFolder.id);
      
      console.log(`Folder structure created successfully for project ${projectId}`);
    } catch (error) {
      console.error('Error creating folder structure:', error);
      throw new Error('Failed to create folder structure');
    }
  },
  
  /**
   * Create an invisible root folder for a project
   * This folder acts as a container for all project files but isn't shown in the UI
   * @param projectId The ID of the project
   * @returns Promise that resolves to the created root folder
   */
  async createInvisibleRootFolder(projectId: string): Promise<Folder> {
    try {
      console.log(`Creating invisible root folder for project ${projectId}`);
      
      const rootFolder = await folderService.create({
        projectId,
        name: '_root', // Name it with a prefix that indicates it's a special folder
        parentId: undefined, // No parent - it's a top-level folder
        metadata: {
          isRootFolder: true, // Flag to identify this as a special root folder
          isHidden: true, // Flag to hide this folder in the UI
          access: 'ALL' as FolderAccess // Everyone can access the root folder
        }
      });
      
      console.log(`Created invisible root folder: ${rootFolder.id}`);
      return rootFolder;
    } catch (error) {
      console.error('Error creating invisible root folder:', error);
      throw new Error('Failed to create invisible root folder');
    }
  },

  /**
   * Recursively create folders from a template
   * @param projectId The project ID
   * @param templates The templates to create folders from
   * @param parentId Optional parent folder ID
   * @returns Promise that resolves when all folders have been created
   */
  async createFoldersRecursively(
    projectId: string,
    templates: FolderTemplate[],
    parentId?: string
  ): Promise<Folder[]> {
    const createdFolders: Folder[] = [];

    for (const template of templates) {
      try {
        console.log(`Creating folder from template:`, template);
        
        // Create parent folder with access level from template
        const folder = await folderService.create({
          projectId,
          name: template.name,
          parentId,
          metadata: {
            access: template.access // Explicitly set the access level from template
          }
        });

        createdFolders.push(folder);

        // Create children recursively if they exist
        if (template.children && template.children.length > 0) {
          await this.createFoldersRecursively(
            projectId,
            template.children,
            folder.id
          );
        }
      } catch (error) {
        console.error(`Error creating folder ${template.name}:`, error);
        // Continue with next folder even if one fails
      }
    }

    return createdFolders;
  }
}; 