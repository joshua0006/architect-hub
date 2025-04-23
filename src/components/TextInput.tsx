import React, { useEffect, useRef, useState, forwardRef, ForwardedRef } from "react";
import { Point, AnnotationStyle } from "../types/annotation";

interface TextInputProps {
  position: Point;
  onComplete: (text: string, finalPosition?: Point) => void;
  onCancel: () => void;
  scale: number;
  isSticky?: boolean;
  initialText?: string;
  initialWidth?: number;
  initialHeight?: number;
  textOptions?: AnnotationStyle['textOptions'];
}

// Use forwardRef correctly
const TextInputComponent: React.ForwardRefRenderFunction<HTMLTextAreaElement, TextInputProps> = (
  {
    position,
    onComplete,
    onCancel,
    scale,
    isSticky = false,
    initialText = "",
    textOptions,
    initialWidth, // Destructure but might not be used directly for styling textarea
    initialHeight,
  },
  ref // Receive the forwarded ref
) => {
  const [text, setText] = useState(initialText);
  // Use an internal ref for component logic like size adjustment
  const internalInputRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Add position state for dragging
  const [currentPosition, setCurrentPosition] = useState<Point>(position);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

  // Combine forwarded ref and internal ref if necessary, or just use internal for logic
  // For simplicity and direct control, we'll use internalInputRef for focus/size logic
  // and assign the forwarded ref (if provided) directly to the textarea element.

  // Auto-resize textarea based on content
  const adjustTextareaSize = () => {
    if (internalInputRef.current) {
      internalInputRef.current.style.height = 'auto'; // Reset height
      internalInputRef.current.style.height = `${internalInputRef.current.scrollHeight}px`;
    }
  };

  // Effect to focus and select text on mount
  useEffect(() => {
    if (internalInputRef.current) {
      internalInputRef.current.focus();
      // Select text only if it's the default placeholder
      if (initialText === "Text" || initialText === "Type here...") {
        internalInputRef.current.select();
      }
      adjustTextareaSize(); // Adjust size on initial focus/mount
    }
  }, [initialText]); // Rerun only if initialText changes

  // Effect to adjust size when text content changes
  useEffect(() => {
    adjustTextareaSize();
  }, [text]);

  // Effect to handle clicks outside the component
  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        if (text.trim()) {
          onComplete(text, currentPosition);
        } else {
          onCancel();
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onComplete, onCancel, text, wrapperRef, currentPosition]); // Dependencies

  // Add drag event handlers
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newX = e.clientX / scale - dragOffset.x;
      const newY = e.clientY / scale - dragOffset.y;
      setCurrentPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset, scale]);

  // Event handlers
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onComplete(text, currentPosition);
      } else {
        onCancel();
      }
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
  };

  // Handle start dragging
  const handleWrapperMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // If clicking directly on the textarea, don't start dragging
    if (e.target === internalInputRef.current) return;
    
    e.stopPropagation();
    const offsetX = e.clientX / scale - currentPosition.x;
    const offsetY = e.clientY / scale - currentPosition.y;
    setDragOffset({ x: offsetX, y: offsetY });
    setIsDragging(true);
  };

  // Assign forwarded ref to the textarea element
  // This allows the parent component (AnnotationCanvas) to access the textarea if needed
  const assignRef = (el: HTMLTextAreaElement | null) => {
    // Assign to internal ref
    (internalInputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    // Assign to forwarded ref
    if (typeof ref === 'function') {
      ref(el);
    } else if (ref) {
      (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
    }
  };

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "absolute",
        left: `${currentPosition.x * scale}px`,
        top: `${currentPosition.y * scale}px`,
        transformOrigin: "top left",
        zIndex: 1000,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleWrapperMouseDown}
    >
      <div
        className={`
          relative
          ${isSticky
            ? "bg-yellow-200 border border-yellow-400 rounded shadow-md p-1"
            : "border border-blue-500 rounded shadow-md"}
        `}
        style={{
          width: isSticky ? `${initialWidth || 200}px` : (initialWidth ? `${initialWidth}px` : '160px'), // Use initialWidth if provided or default to 160px
          minWidth: '100px',
          height: isSticky ? `${initialHeight || 150}px` : 'auto', // Use initialHeight for sticky
          minHeight: '80px', // Ensure minimum height for empty text
        }}
      >
        {/* Add drag handle indicator at the top */}
        <div 
          className={`
            w-full h-6 flex items-center justify-center
            ${isSticky ? "bg-yellow-300 rounded-t" : "bg-blue-100 border-b border-blue-300"}
            cursor-grab select-none
          `}
          onMouseDown={(e) => {
            e.stopPropagation();
            const offsetX = e.clientX / scale - currentPosition.x;
            const offsetY = e.clientY / scale - currentPosition.y;
            setDragOffset({ x: offsetX, y: offsetY });
            setIsDragging(true);
          }}
          title="Drag to move"
        >
          <div className="flex space-x-1">
            <div className="w-6 h-1 bg-gray-400 rounded-full"></div>
            <div className="w-6 h-1 bg-gray-400 rounded-full"></div>
            <div className="w-6 h-1 bg-gray-400 rounded-full"></div>
          </div>
        </div>
        
        <textarea
          ref={assignRef} // Assign refs here
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={`
            w-full min-h-[20px] p-2
            outline-none resize-none rounded-b
            transition-colors duration-200
            ${
              isSticky
                ? "bg-yellow-100 focus:bg-yellow-50"
                : "bg-white bg-opacity-90 focus:bg-opacity-100 border-x border-b border-blue-500 shadow-lg" // Enhanced focus style
            }
          `}
          style={{ // Apply dynamic font styles
            fontSize: `${(textOptions?.fontSize || 14) * scale}px`, // Apply scale
            lineHeight: `${(textOptions?.fontSize || 14) * 1.2 * scale}px`, // Apply scale
            fontFamily: textOptions?.fontFamily || "Arial",
            fontWeight: textOptions?.bold ? 'bold' : 'normal',
            fontStyle: textOptions?.italic ? 'italic' : 'normal',
            cursor: "text", // Ensure cursor is text when over textarea
          }}
          placeholder={isSticky ? "Add note..." : "Add text..."}
          autoFocus // Rely on this for initial focus
          onClick={(e) => e.stopPropagation()} // Prevent click from triggering drag
        />
        
        {isSticky && (
          <div className="absolute top-6 right-0 p-1 text-xs text-gray-500 opacity-75">
            Esc/Click outside=Cancel, Enter=Save
          </div>
        )}
      </div>
    </div>
  );
};

export const TextInput = forwardRef(TextInputComponent);
TextInput.displayName = 'TextInput'; // Add display name for DevTools
