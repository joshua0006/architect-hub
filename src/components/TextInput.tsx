import React, { useEffect, useRef, useState } from "react";
import { Point } from "../types/annotation";

interface TextInputProps {
  position: Point;
  onComplete: (text: string) => void;
  onCancel: () => void;
  scale: number;
  isSticky?: boolean;
  initialText?: string;
  dimensions?: { width: number; height: number } | null;
}

export const TextInput: React.FC<TextInputProps> = ({
  position,
  onComplete,
  onCancel,
  scale,
  isSticky = false,
  initialText = "",
  dimensions = null,
}) => {
  const [text, setText] = useState(initialText);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea based on content
  const adjustTextareaSize = () => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (initialText) {
        inputRef.current.select();
      }
      adjustTextareaSize();
    }
  }, [initialText]);

  useEffect(() => {
    adjustTextareaSize();
  }, [text]);

  // Event handlers
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onComplete(text);
      } else {
        onCancel();
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Check if the related target is within the wrapper
    // This prevents closing when clicking within the component
    if (wrapperRef.current && !wrapperRef.current.contains(e.relatedTarget as Node)) {
      if (text.trim()) {
        onComplete(text);
      } else {
        onCancel();
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  // Render different styles for sticky notes vs regular text
  return (
    <div
      ref={wrapperRef}
      style={{
        position: "absolute",
        left: `${position.x * scale}px`,
        top: `${position.y * scale}px`,
        transformOrigin: "top left",
        zIndex: 1000,
      }}
    >
      <div 
        className={`
          relative
          ${isSticky 
            ? "bg-yellow-200 border border-yellow-400 rounded shadow-md p-1" 
            : ""}
        `}
        style={{
          width: isSticky ? '200px' : 'auto',
          minWidth: '100px',
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={`
            w-full min-h-[20px] p-2
            outline-none resize-none rounded
            transition-colors duration-200
            ${
              isSticky
                ? "bg-yellow-100 focus:bg-yellow-50"
                : "bg-white bg-opacity-70 focus:bg-opacity-90 border border-blue-300"
            }
          `}
          style={{
            fontSize: `${14}px`,
            lineHeight: `${20}px`,
            fontFamily: "Arial",
            boxShadow: isSticky ? "none" : "0 0 0 2px rgba(59, 130, 246, 0.3)",
          }}
          placeholder={isSticky ? "Add note..." : "Add text..."}
          autoFocus
        />
        {isSticky && (
          <div className="absolute top-0 right-0 p-1 text-xs text-gray-500">
            Press Esc to cancel, Enter to save
          </div>
        )}
      </div>
    </div>
  );
};
