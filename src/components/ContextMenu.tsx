import React, { useEffect, useRef } from "react";
import { Copy, Trash2, Scissors, MoveUp, MoveDown } from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "../constants/toolbar";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { Point } from "../types/annotation";

interface ContextMenuProps {
  position: Point;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    selectedAnnotations,
    copySelectedAnnotations,
    deleteSelectedAnnotations,
    currentDocument,
    documents,
    bringToFront,
    sendToBack,
  } = useAnnotationStore();

  const handleCopy = () => {
    copySelectedAnnotations();
    onClose();
  };

  const handleCut = () => {
    copySelectedAnnotations();
    deleteSelectedAnnotations();
    onClose();
  };

  const handleDelete = () => {
    deleteSelectedAnnotations();
    onClose();
  };

  const handleBringToFront = () => {
    if (currentDocument && selectedAnnotations.length) {
      bringToFront(
        currentDocument,
        selectedAnnotations.map((a) => a.id)
      );
      onClose();
    }
  };

  const handleSendToBack = () => {
    if (currentDocument && selectedAnnotations.length) {
      sendToBack(
        currentDocument,
        selectedAnnotations.map((a) => a.id)
      );
      onClose();
    }
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

  const isDisabled = !selectedAnnotations.length;

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
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          onClick={handleCopy}
          disabled={isDisabled}
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
          disabled={isDisabled}
        >
          <Scissors size={16} />
          <span>Cut</span>
          <span className="ml-auto text-xs text-gray-400">
            {KEYBOARD_SHORTCUTS.actions.cut}
          </span>
        </button>
        <div className="h-px bg-gray-200 my-1" />
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          onClick={handleBringToFront}
          disabled={isDisabled}
        >
          <MoveUp size={16} />
          <span>Bring to Front</span>
          <span className="ml-auto text-xs text-gray-400">
            {KEYBOARD_SHORTCUTS.actions.bringToFront}
          </span>
        </button>
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          onClick={handleSendToBack}
          disabled={isDisabled}
        >
          <MoveDown size={16} />
          <span>Send to Back</span>
          <span className="ml-auto text-xs text-gray-400">
            {KEYBOARD_SHORTCUTS.actions.sendToBack}
          </span>
        </button>
        <div className="h-px bg-gray-200 my-1" />
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          onClick={handleDelete}
          disabled={isDisabled}
        >
          <Trash2 size={16} className="text-red-500" />
          <span className="text-red-500">Delete</span>
          <span className="ml-auto text-xs text-gray-400">
            {KEYBOARD_SHORTCUTS.actions.delete}
          </span>
        </button>
      </div>
    </>
  );
}; 