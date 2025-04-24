import React, { useEffect, useRef, useState, forwardRef, ForwardedRef } from "react";
import { Point, AnnotationStyle } from "../types/annotation";
import { useAnnotationStore } from "../store/useAnnotationStore";

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

export interface TextInputRef {
  focus: () => void;
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
    initialWidth,
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
  // Add state for dynamic width and height
  const [textWidth, setTextWidth] = useState(initialWidth || 200);
  const [textHeight, setTextHeight] = useState(initialHeight || 80);

  // Get current style from the store to apply text formatting
  const { currentStyle } = useAnnotationStore();
  const textOptionsMerged = textOptions || currentStyle.textOptions || {};
  const fontSize = textOptionsMerged?.fontSize || 14;

  // Calculate optimal width based on text content and font size
  const calculateTextDimensions = () => {
    // Create a temporary canvas to measure text dimensions
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    
    // Set font properties to match the textarea
    let fontStyle = '';
    if (textOptionsMerged?.bold) fontStyle += 'bold ';
    if (textOptionsMerged?.italic) fontStyle += 'italic ';
    context.font = `${fontStyle}${fontSize}px ${textOptionsMerged?.fontFamily || 'Arial'}`;
    
    // Split text into lines and find the max width
    const lines = text ? text.split('\n') : ['Te'];
    
    // If text is empty or short, use a reasonable default placeholder
    if (!text || text.length < 2) {
      lines.push('Text'); // Ensure we have minimum width for placeholder
    }
    
    let maxWidth = 0;
    
    for (const line of lines) {
      const metrics = context.measureText(line);
      maxWidth = Math.max(maxWidth, metrics.width);
    }
    
    // Calculate the height based on line count and font size
    const lineHeight = fontSize * 1.2;
    const calculatedHeight = Math.max(lines.length * lineHeight + 20, 80);
    
    // Add padding based on font size to ensure text fits comfortably
    const paddingX = Math.max(20, fontSize * 1.2);
    
    // Update width and height states with appropriate minimum values
    setTextWidth(Math.max(maxWidth + paddingX * 2, 180));
    setTextHeight(calculatedHeight);
  };

  // Auto-resize textarea based on content
  const adjustTextareaSize = () => {
    if (internalInputRef.current) {
      internalInputRef.current.style.height = 'auto'; // Reset height
      internalInputRef.current.style.height = `${internalInputRef.current.scrollHeight}px`;
      // Also recalculate the width based on text content
      calculateTextDimensions();
    }
  };

  // Effect to focus and select text on mount
  useEffect(() => {
    if (internalInputRef.current) {
      internalInputRef.current.focus();
      // Only select text if there's content to select
      if (initialText && initialText !== "") {
        internalInputRef.current.select();
      } else {
        // If no initial text, just ensure focus is at the start
        internalInputRef.current.setSelectionRange(0, 0);
      }
      adjustTextareaSize(); // Adjust size on initial focus/mount
    }
  }, [initialText]); // Rerun only if initialText changes

  // Effect to adjust size when text content changes
  useEffect(() => {
    adjustTextareaSize();
  }, [text, fontSize, textOptionsMerged?.bold, textOptionsMerged?.italic, textOptionsMerged?.fontFamily]);

  // Initial dimension calculation on mount
  useEffect(() => {
    calculateTextDimensions();
  }, []);

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
          width: isSticky ? `${initialWidth || 200}px` : `${textWidth}px`,
          minWidth: '160px',
          height: isSticky ? `${initialHeight || 150}px` : 'auto',
          minHeight: '80px', // Ensure minimum height for empty text
          background: isSticky ? undefined : 'transparent'
        }}
      >
        {/* Add drag handle indicator at the top */}
        <div 
          className={`
            w-full h-6 flex items-center justify-center
            ${isSticky ? "bg-yellow-300 rounded-t" : "bg-transparent border-b border-blue-300"}
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
                : "bg-white focus:bg-white border-x border-b border-blue-500"
            }
          `}
          style={{ // Apply dynamic font styles
            fontSize: `${fontSize * scale}px`, // Apply scale
            lineHeight: `${fontSize * 1.2 * scale}px`, // Apply scale
            fontFamily: textOptionsMerged?.fontFamily || "Arial",
            fontWeight: textOptionsMerged?.bold ? 'bold' : 'normal',
            fontStyle: textOptionsMerged?.italic ? 'italic' : 'normal',
            textDecoration: textOptionsMerged?.underline ? 'underline' : 'none',
            cursor: "text", // Ensure cursor is text when over textarea
            maxWidth: '100%', // Ensure text doesn't overflow container width
            overflowWrap: 'break-word', // Allow long words to break
            wordWrap: 'break-word',
            width: '100%',
            background: isSticky ? undefined : 'white',
            backdropFilter: isSticky ? undefined : 'none',
            caretColor: 'black', // Ensure caret is visible
            minHeight: '60px', // Ensure minimum height even when empty
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
