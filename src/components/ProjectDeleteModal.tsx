import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProjectDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  onDelete: () => Promise<void>;
}

const ProjectDeleteModal: React.FC<ProjectDeleteModalProps> = ({
  isOpen,
  onClose,
  projectName,
  onDelete
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete();
      onClose();
    } catch (error) {
      console.error('Error deleting project:', error);
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!isDeleting ? onClose : undefined}
          />
          
          {/* Modal */}
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center p-4 border-b">
                <h3 className="text-lg font-medium text-gray-900">Delete Project</h3>
                {!isDeleting && (
                  <button 
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              
              {/* Content */}
              <div className="p-6">
                {isDeleting ? (
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-red-200 rounded-full"></div>
                      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-red-600 rounded-full border-t-transparent animate-spin"></div>
                    </div>
                    <p className="mt-4 text-center text-gray-700">
                      Deleting project<span className="inline-block animate-pulse">...</span>
                    </p>
                    <p className="mt-2 text-sm text-center text-gray-500">
                      This may take a moment
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center mb-4 text-red-600">
                      <AlertTriangle className="w-6 h-6 mr-2" />
                      <span className="font-medium">Warning</span>
                    </div>
                    
                    <p className="mb-4 text-gray-700">
                      Are you sure you want to delete <span className="font-semibold">{projectName}</span>? This action cannot be undone.
                    </p>
                    
                    <p className="text-sm text-gray-500">
                      All associated files, folders, and data will be permanently removed.
                    </p>
                  </>
                )}
              </div>
              
              {/* Footer */}
              {!isDeleting && (
                <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
                    disabled={isDeleting}
                  >
                    Delete Project
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProjectDeleteModal; 