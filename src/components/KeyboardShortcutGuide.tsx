import React, { useRef } from "react";
import { X } from "lucide-react";
import { KEYBOARD_SHORTCUTS } from "../constants/toolbar";
import { useClickOutside } from "../hooks/useClickOutside";

interface KeyboardShortcutGuideProps {
  onClose: () => void;
}

interface ShortcutSection {
  title: string;
  shortcuts: { label: string; shortcut: string }[];
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: "Tools",
    shortcuts: [
      { label: "Select", shortcut: KEYBOARD_SHORTCUTS.tools.select },
      { label: "Drag", shortcut: KEYBOARD_SHORTCUTS.tools.drag },
      { label: "Freehand", shortcut: KEYBOARD_SHORTCUTS.tools.freehand },
      { label: "Rectangle", shortcut: KEYBOARD_SHORTCUTS.tools.rectangle },
      { label: "Circle", shortcut: KEYBOARD_SHORTCUTS.tools.circle },
      { label: "Line", shortcut: KEYBOARD_SHORTCUTS.tools.line },
      { label: "Arrow", shortcut: KEYBOARD_SHORTCUTS.tools.arrow },
      { label: "Text", shortcut: KEYBOARD_SHORTCUTS.tools.text },
      { label: "Highlight", shortcut: KEYBOARD_SHORTCUTS.tools.highlight },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { label: "Undo", shortcut: KEYBOARD_SHORTCUTS.actions.undo },
      { label: "Redo", shortcut: KEYBOARD_SHORTCUTS.actions.redo },
      { label: "Delete", shortcut: KEYBOARD_SHORTCUTS.actions.delete },
      { label: "Select All", shortcut: KEYBOARD_SHORTCUTS.actions.selectAll },
      { label: "Cancel/Deselect", shortcut: KEYBOARD_SHORTCUTS.actions.escape },
      { label: "Zoom In", shortcut: KEYBOARD_SHORTCUTS.actions.zoomIn },
      { label: "Zoom Out", shortcut: KEYBOARD_SHORTCUTS.actions.zoomOut },
      { label: "Reset Zoom", shortcut: KEYBOARD_SHORTCUTS.actions.resetZoom },
    ],
  },
];

export const KeyboardShortcutGuide: React.FC<KeyboardShortcutGuideProps> = ({
  onClose,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useClickOutside(modalRef, onClose);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-[500px] max-h-[90vh] overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[70vh]">
          <div className="space-y-8">
            {SHORTCUT_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="text-sm font-medium text-gray-500 mb-3">
                  {section.title}
                </h3>
                <div className="space-y-2">
                  {section.shortcuts.map(({ label, shortcut }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm text-gray-700">{label}</span>
                      <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded">
                        {shortcut}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
