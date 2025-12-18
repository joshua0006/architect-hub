import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UserDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    displayName: string;
    email: string;
  };
  onDelete: () => Promise<void>;
}

const UserDeleteConfirmModal: React.FC<UserDeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  user,
  onDelete
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle escape key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, isDeleting, onClose]);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete();
      onClose();
    } catch (error) {
      console.error('Error deleting user:', error);
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
                <h3 className="text-lg font-medium text-gray-900">Delete User</h3>
                {!isDeleting && (
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500 transition-colors"
                    aria-label="Close modal"
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
                      Deleting user<span className="inline-block animate-pulse">...</span>
                    </p>
                    <p className="mt-2 text-sm text-center text-gray-500">
                      This may take a moment
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start mb-6">
                      <div className="flex-shrink-0 mr-3 mt-0.5">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
                          <AlertTriangle className="w-6 h-6 text-red-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-medium text-gray-900 mb-2">
                          Delete User Account
                        </h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Are you sure you want to delete <span className="font-semibold text-gray-900">{user.displayName}</span>?
                        </p>
                        <p className="text-sm text-gray-500 mb-3">
                          Email: <span className="font-medium text-gray-700">{user.email}</span>
                        </p>
                        <p className="text-sm text-red-600 font-medium">
                          This action cannot be undone.
                        </p>
                      </div>
                    </div>
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
                    aria-label="Confirm delete user"
                  >
                    Delete User
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

export default UserDeleteConfirmModal;
