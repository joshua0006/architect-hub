import React from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* Backdrop with modern blur effect */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200" 
        onClick={onCancel} 
        aria-hidden="true"
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-lg w-full max-w-md mx-4 overflow-hidden transition-all duration-200 scale-100 opacity-100">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200/80">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 transition-colors rounded-full p-1.5 hover:bg-gray-100/80 focus:outline-none focus:ring-2 focus:ring-blue-500/70"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <p className="text-gray-600">{message}</p>
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200/80 bg-gray-50/80">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 
                       rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 
                       focus:ring-blue-500/50 transition-all duration-200"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm 
                        focus:outline-none focus:ring-2 focus:ring-offset-1
                        transition-all duration-200 
                        ${danger 
                          ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 focus:ring-red-500/50' 
                          : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500/50'
                        }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}; 