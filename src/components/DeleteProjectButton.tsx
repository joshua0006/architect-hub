import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
  onDelete: (projectId: string) => Promise<void>;
  className?: string;
}

const DeleteProjectButton: React.FC<DeleteProjectButtonProps> = ({
  projectId,
  projectName,
  onDelete,
  className = '',
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(projectId);
    } catch (error) {
      console.error('Error deleting project:', error);
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="relative inline-block">
      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className={`flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors ${className}`}
          disabled={isDeleting}
          aria-label="Delete project"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </button>
      ) : (
        <div className="flex items-center space-x-2">
          {isDeleting ? (
            <div className="flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-md">
              <div className="animate-spin mr-2 h-4 w-4 border-2 border-red-600 rounded-full border-t-transparent"></div>
              <span>Deleting...</span>
            </div>
          ) : (
            <>
              <button
                onClick={handleDelete}
                className="flex items-center px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                disabled={isDeleting}
              >
                Confirm
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
                disabled={isDeleting}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DeleteProjectButton; 