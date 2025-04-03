import React, { useEffect, useRef, useState, MouseEvent } from "react"; // Added MouseEvent
import { Point, AnnotationStyle } from "../types/annotation"; // Added AnnotationStyle

interface TextInputProps {
  position: Point;
  onComplete: (text: string) => void;
  onCancel: () => void;
  scale: number;
  isSticky?: boolean;
  initialText?: string;
  // dimensions prop is no longer needed here
  initialWidth?: number; // Added for TextInput sizing
  initialHeight?: number; // Added for TextInput sizing
  textOptions?: AnnotationStyle['textOptions']; // Added for font styling
}

export const TextInput: React.FC<TextInputProps> = ({
  position,
  onComplete,
  onCancel,
  scale,
  isSticky = false,
  initialText = "",
  // Removed dimensions prop
  textOptions, // Destructure textOptions here
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

  // Effect to handle clicks outside the component
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        // Clicked outside the text input wrapper
        if (text.trim()) {
          onComplete(text); // Complete with current text
        } else {
          onCancel(); // Cancel if text is empty
        }
      }
    };

    // Add listener when component mounts
    document.addEventListener("mousedown", handleClickOutside);

    // Cleanup listener when component unmounts
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onComplete, onCancel, text, wrapperRef]); // Dependencies

  // Event handlers
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onComplete(text);
      } else {
        onCancel(); // Still cancel if Enter is pressed with no text
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  // Removed handleBlur as click outside is handled by the effect

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
          // onBlur={handleBlur} // Removed onBlur handler
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
          style={{ // Apply dynamic font styles
            fontSize: `${textOptions?.fontSize || 14}px`,
            lineHeight: `${(textOptions?.fontSize || 14) * 1.2}px`, // Adjust line height based on font size
            fontFamily: textOptions?.fontFamily || "Arial",
            fontWeight: textOptions?.bold ? 'bold' : 'normal',
            fontStyle: textOptions?.italic ? 'italic' : 'normal',
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
