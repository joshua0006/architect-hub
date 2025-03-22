import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface StickyNoteProps {
  x: number;
  y: number;
  type: 'text' | 'stickyNote';
  color: string;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

export const StickyNote: React.FC<StickyNoteProps> = ({
  x,
  y,
  type,
  color,
  onSubmit,
  onClose,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(inputRef.current?.value || '');
    } else if (e.key === 'Escape' || e.key === 'Esc') {
      onClose();
    }
  };

  if (type === 'text') {
    return (
      <div
        className="absolute flex items-center gap-2"
        style={{
          left: x,
          top: y - 12, // Offset to center vertically
        }}
      >
        <input
          ref={inputRef}
          className="px-2 py-1 bg-white/80 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500 w-48"
          placeholder="Type and press Enter..."
          onKeyDown={handleKeyDown}
          style={{ color }}
        />
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="absolute bg-[#FFEB3B]/90 rounded shadow-lg p-2 min-w-[200px]"
      style={{
        left: x,
        top: y,
      }}
    >
      <div className="flex items-center gap-2">
        <textarea
          ref={inputRef}
          className="flex-1 px-2 py-1 bg-transparent border-none text-black text-sm focus:outline-none resize-none"
          placeholder="Type and press Enter..."
          rows={3}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};