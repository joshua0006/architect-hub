import { useState, useEffect } from 'react';
import { Folder } from '../types';
import { folderService } from '../services';

export function useFolderManager(projectId: string) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (projectId) {
      loadFolders();
    } else {
      setFolders([]);
      setLoading(false);
    }
  }, [projectId]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const fetchedFolders = await folderService.getByProjectId(projectId);
      setFolders(fetchedFolders);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load folders'));
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async (name: string, parentId?: string) => {
    try {
      const newFolder = await folderService.create({
        projectId,
        name,
        parentId
      });
      await loadFolders(); // Reload folders after creating a new one
      return newFolder;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to create folder');
    }
  };

  const updateFolder = async (id: string, name: string) => {
    try {
      await folderService.update(id, name);
      await loadFolders(); // Reload folders after updating
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update folder');
    }
  };

  const deleteFolder = async (id: string) => {
    try {
      await folderService.delete(id);
      await loadFolders(); // Reload folders after deleting
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to delete folder');
    }
  };

  return {
    folders,
    loading,
    error,
    createFolder,
    updateFolder,
    deleteFolder,
    refreshFolders: loadFolders
  };
}