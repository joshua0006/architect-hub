import React from "react";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { Trash2, Copy } from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "../constants/toolbar";

export const SelectionIndicator: React.FC = () => {
  const {
    selectedAnnotations,
    deleteSelectedAnnotations,
    copySelectedAnnotations,
  } = useAnnotationStore();

  if (selectedAnnotations.length <= 1) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg border border-gray-200 px-4 py-2 flex items-center gap-4">
      <span className="text-sm font-medium text-gray-600">
        {selectedAnnotations.length} items selected
      </span>
      <div className="h-4 w-px bg-gray-200" />
      <button
        onClick={copySelectedAnnotations}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-700"
        title={`Copy (${KEYBOARD_SHORTCUTS.actions.copy})`}
      >
        <Copy size={16} />
        <span>Copy</span>
      </button>
      <button
        onClick={deleteSelectedAnnotations}
        className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
        title={`Delete (${KEYBOARD_SHORTCUTS.actions.delete})`}
      >
        <Trash2 size={16} />
        <span>Delete</span>
      </button>
    </div>
  );
};
