import { folderService } from './folderService';
import { FolderTemplate, PROJECT_FOLDER_TEMPLATE } from '../constants/folderTemplates';
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
      await this.createFoldersRecursively(projectId, template);
      console.log(`Folder structure created successfully for project ${projectId}`);
    } catch (error) {
      console.error('Error creating folder structure:', error);
      throw new Error('Failed to create folder structure');
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