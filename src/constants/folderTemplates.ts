export type FolderAccess = 'ALL' | 'STAFF_ONLY';

export interface FolderTemplate {
  name: string;
  access: FolderAccess;
  children?: FolderTemplate[];
}

// Default folder structure for projects with proper access permissions
export const PROJECT_FOLDER_TEMPLATE: FolderTemplate[] = [
  {
    name: 'ADMIN',
    access: 'STAFF_ONLY'
  },
  {
    name: 'CAD',
    access: 'STAFF_ONLY'
  },
  {
    name: 'PHOTOS',
    access: 'ALL'
  },
  {
    name: 'CONSULTANTS',
    access: 'ALL'
  },
  {
    name: 'MARKUPS',
    access: 'STAFF_ONLY'
  },
  {
    name: 'ISSUED DRAWINGS',
    access: 'ALL'
  },
  {
    name: 'Emails',
    access: 'STAFF_ONLY'
  }
];

/**
 * Check if a user with given role has access to a folder with specified access level
 * @param role User role (Staff, Client, or Admin)
 * @param folderAccess Folder access level
 * @returns Boolean indicating whether the user has access
 */
export const hasAccessToFolder = (
  role: 'Staff' | 'Client' | 'Admin',
  folderAccess: FolderAccess
): boolean => {
  // Staff and Admin can access everything
  if (role === 'Staff' || role === 'Admin') {
    return true;
  }
  
  // Clients can only access ALL folders
  return folderAccess === 'ALL';
}; 