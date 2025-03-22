import { useState, useEffect } from 'react';
import { Document } from '../types';
import { documentService } from '../services';
import { folderService } from '../services';

export function useDocumentManager(projectId: string) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();

  useEffect(() => {
    if (projectId && currentFolderId) {
      loadDocuments();
    } else {
      setDocuments([]);
      setLoading(false);
    }
  }, [projectId, currentFolderId]);

  const loadDocuments = async () => {
    if (!currentFolderId) return;
    
    try {
      setLoading(true);
      console.log('Loading documents for folder:', currentFolderId);
      const docs = await documentService.getByFolderId(currentFolderId);
      console.log('Loaded documents:', docs);
      setDocuments(docs.filter(doc => doc.url && doc.name));
      setError(null);
    } catch (err) {
      console.error('Error loading documents:', err);
      setError(err instanceof Error ? err : new Error('Failed to load documents'));
    } finally {
      setLoading(false);
    }
  };

  const createDocument = async (
    name: string,
    type: Document['type'],
    file: File,
    folderId?: string
  ) => {
    try {
      const targetFolderId = folderId || currentFolderId;
      if (!targetFolderId) {
        throw new Error('No folder selected');
      }

      console.log('Creating document:', { name, type, folderId: targetFolderId });

      // First, verify the folder exists
      const folder = await folderService.getById(targetFolderId);
      if (!folder) {
        throw new Error('Folder not found');
      }

      const newDoc = await documentService.create(
        targetFolderId,
        {
          projectId,
          name,
          type,
          folderId: targetFolderId,
          version: 1,
          dateModified: new Date().toISOString()
        },
        file
      );
      
      console.log('Created document:', newDoc);
      
      // Reload documents after creating a new one
      await loadDocuments();
      
      return newDoc;
    } catch (err) {
      console.error('Error creating document:', err);
      throw err instanceof Error ? err : new Error('Failed to create document');
    }
  };

  const updateDocument = async (id: string, updates: Partial<Document>) => {
    try {
      if (!currentFolderId) {
        throw new Error('No folder selected');
      }
      
      console.log('Updating document:', id, updates);
      await documentService.update(currentFolderId, id, updates);
      
      // Reload documents after update
      await loadDocuments();
    } catch (err) {
      console.error('Error updating document:', err);
      throw err instanceof Error ? err : new Error('Failed to update document');
    }
  };

  const updateDocumentFile = async (documentId: string, file: File) => {
    try {
      if (!currentFolderId) {
        throw new Error('No folder selected');
      }
      
      console.log('Updating document file:', documentId);
      const url = await documentService.updateFile(currentFolderId, documentId, file);
      
      // Reload documents after file update
      await loadDocuments();
      
      return url;
    } catch (err) {
      console.error('Error updating document file:', err);
      throw err instanceof Error ? err : new Error('Failed to update document file');
    }
  };

  const deleteDocument = async (documentId: string) => {
    try {
      if (!currentFolderId) {
        throw new Error('No folder selected');
      }
      
      console.log('Deleting document:', documentId);
      await documentService.delete(currentFolderId, documentId);
      
      // Reload documents after deletion
      await loadDocuments();
    } catch (err) {
      console.error('Error deleting document:', err);
      throw err instanceof Error ? err : new Error('Failed to delete document');
    }
  };

  return {
    documents,
    loading,
    error,
    currentFolderId,
    setCurrentFolderId,
    createDocument,
    updateDocument,
    updateDocumentFile,
    deleteDocument,
    refreshDocuments: loadDocuments
  };
}