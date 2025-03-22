import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface RenameDialogProps {
  isOpen: boolean;
  title: string;
  currentName: string;
  itemType: 'file' | 'folder';
  onRename: (newName: string) => void;
  onCancel: () => void;
}

export const RenameDialog: React.FC<RenameDialogProps> = ({
  isOpen,
  title,
  currentName,
  itemType,
  onRename,
  onCancel,
}) => {
  const [newName, setNewName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the name when dialog opens and focus the input
  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
      // Focus and select all text in input when dialog opens
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && newName.trim() !== currentName) {
      onRename(newName.trim());
    } else if (newName.trim() === currentName) {
      // If name hasn't changed, just cancel
      onCancel();
    }
  };

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
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <label 
              htmlFor="item-name" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              New {itemType} name
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="item-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm 
                           focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 
                           transition-colors duration-200"
                placeholder={`Enter ${itemType} name...`}
              />
              {newName.trim() === '' && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-red-500">
                  Required
                </div>
              )}
            </div>
            {newName.trim() !== currentName && newName.trim() !== '' && (
              <p className="mt-2 text-xs text-blue-600">
                Renaming from "{currentName}" to "{newName.trim()}"
              </p>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex justify-end gap-3 p-4 border-t border-gray-200/80 bg-gray-50/80">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 
                         rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 
                         focus:ring-blue-500/50 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm 
                          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500/50
                          transition-all duration-200 
                          ${!newName.trim() || newName.trim() === currentName
                            ? 'bg-blue-400/80 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`}
              disabled={!newName.trim() || newName.trim() === currentName}
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};