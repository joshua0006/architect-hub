import React, { useEffect, useRef } from "react";
import { Copy, Scissors, Clipboard, CheckSquare, Trash2 } from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "../constants/toolbar";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { Point } from "../types/annotation";
import { useToast } from "../contexts/ToastContext";

interface ContextMenuProps {
  position: Point;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { showAnnotationToast } = useToast();
  const {
    selectedAnnotations,
    copySelectedAnnotations,
    pasteAnnotations,
    deleteSelectedAnnotations,
    currentDocumentId,
    documents,
    selectAnnotations,
    clipboardAnnotations
  } = useAnnotationStore();

  const handleCopy = () => {
    const count = copySelectedAnnotations();
    if (count) {
      showAnnotationToast(`${count} annotation${count > 1 ? "s" : ""} copied`);
    }
    onClose();
  };

  const handleCut = () => {
    const count = copySelectedAnnotations();
    if (count) {
      showAnnotationToast(`${count} annotation${count > 1 ? "s" : ""} cut`);
      deleteSelectedAnnotations();
    }
    onClose();
  };

  const handleDelete = () => {
    const count = selectedAnnotations.length;
    if (count) {
      deleteSelectedAnnotations();
      showAnnotationToast(`${count} annotation${count > 1 ? "s" : ""} deleted`);
    }
    onClose();
  };

  const handlePaste = () => {
    if (clipboardAnnotations.length === 0) {
      showAnnotationToast("No annotations to paste");
      onClose();
      return;
    }

    // Get the current page from the first selected annotation or default to page 1
    const currentPage = selectedAnnotations.length > 0 
      ? selectedAnnotations[0].pageNumber 
      : 1;

    const pastedCount = pasteAnnotations(currentPage);
    showAnnotationToast(`${pastedCount} annotation${pastedCount > 1 ? "s" : ""} pasted`);
    onClose();
  };

  const handleSelectAll = () => {
    if (!currentDocumentId) return;
    
    const document = documents[currentDocumentId];
    if (document) {
      // Get the current page from the first selected annotation or default to page 1
      const currentPage = selectedAnnotations.length > 0 
        ? selectedAnnotations[0].pageNumber 
        : 1;
        
      selectAnnotations(
        document.annotations.filter((a) => a.pageNumber === currentPage)
      );
    }
    onClose();
  };

  // Adjust menu position to stay within viewport
  useEffect(() => {
    if (!menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    if (rect.right > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }
    if (rect.bottom > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }, [position]);

  const isActionDisabled = !selectedAnnotations.length;
  const isSelectDisabled = !currentDocumentId || 
    !documents[currentDocumentId]?.annotations.some(a => {
      // Get the current page from the first selected annotation or default to page 1
      const currentPage = selectedAnnotations.length > 0 
        ? selectedAnnotations[0].pageNumber 
        : 1;
      return a.pageNumber === currentPage;
    });

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px]"
        style={{
          left: position.x,
          top: position.y,
        }}
      >
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
          onClick={handleSelectAll}
          disabled={isSelectDisabled}
        >
          <CheckSquare size={16} />
          <span>Select All</span>
          <span className="ml-auto text-xs text-gray-400">
            {KEYBOARD_SHORTCUTS.actions.selectAll}
          </span>
        </button>
        <div className="h-px bg-gray-200 my-1" />
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          onClick={handleCopy}
          disabled={isActionDisabled}
        >
          <Copy size={16} />
          <span>Copy</span>
          <span className="ml-auto text-xs text-gray-400">
            {KEYBOARD_SHORTCUTS.actions.copy}
          </span>
        </button>
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          onClick={handleCut}
          disabled={isActionDisabled}
        >
          <Scissors size={16} />
          <span>Cut</span>
          <span className="ml-auto text-xs text-gray-400">
            {KEYBOARD_SHORTCUTS.actions.cut}
          </span>
        </button>
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
          onClick={handlePaste}
          disabled={clipboardAnnotations.length === 0}
        >
          <Clipboard size={16} />
          <span>Paste</span>
          <span className="ml-auto text-xs text-gray-400">
            {KEYBOARD_SHORTCUTS.actions.paste}
          </span>
        </button>
        <div className="h-px bg-gray-200 my-1" />
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-red-600 disabled:opacity-50"
          onClick={handleDelete}
          disabled={isActionDisabled}
        >
          <Trash2 size={16} />
          <span>Delete</span>
          <span className="ml-auto text-xs text-gray-400">
            {KEYBOARD_SHORTCUTS.actions.delete}
          </span>
        </button>
      </div>
    </>
  );
}; 