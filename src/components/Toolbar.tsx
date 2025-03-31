import React, { useEffect, useRef, useState } from "react";
import {
  TOOLS,
  COLORS,
  LINE_WIDTHS,
  OPACITY_LEVELS,
} from "../constants/toolbar";
import { ToolbarSection } from "./Toolbar/ToolbarSection";
import { ToolButton } from "./Toolbar/ToolButton";
import { useKeyboardShortcutGuide } from "../hooks/useKeyboardShortcutGuide";
import { HelpCircle, FolderOpen, ChevronDown, ChevronUp } from "lucide-react";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { KeyboardShortcutGuide } from "./KeyboardShortcutGuide";

// Define Folder interface to match DocumentViewer component
export interface Folder {
  id: string;
  name: string;
  projectId?: string;
  parentId?: string;
  metadata?: any;
}

// Extended folder interface with additional path information
export interface EnhancedFolder extends Folder {
  folderPath: Folder[];
  pathString: string;
  parentFolder: Folder | null;
}

interface ToolbarProps {
  currentFolder?: Folder | EnhancedFolder | null;
}

// Type assertion helper function
const getOptionalShortcut = (tool: any): string | undefined => {
  return tool.shortcut as string | undefined;
};

// Helper function to dispatch annotation change event
const dispatchAnnotationChangeEvent = (pageNumber: number = 1) => {
  // Create the event
  const event = new CustomEvent('annotationChanged', {
    bubbles: true,
    detail: { pageNumber, source: 'toolbar' }
  });
  
  // First try to dispatch to the PDF container
  const pdfContainer = document.querySelector('.pdf-container');
  if (pdfContainer) {
    pdfContainer.dispatchEvent(event);
    console.log('[Toolbar] Dispatched annotationChanged event to PDF container');
  }
  
  // Also try to dispatch directly to annotation canvas
  const annotationCanvas = document.querySelector('.annotation-canvas-container canvas') as HTMLCanvasElement;
  if (annotationCanvas) {
    annotationCanvas.dataset.forceRender = 'true';
    annotationCanvas.dispatchEvent(event);
    console.log('[Toolbar] Set forceRender flag on annotation canvas');
  }
  
  // Set the tool change indicator
  const toolChangeIndicator = document.getElementById('tool-change-indicator') as HTMLDivElement;
  if (toolChangeIndicator) {
    toolChangeIndicator.dataset.toolChanged = 'true';
    console.log('[Toolbar] Set toolChanged flag on indicator');
  }
};

export const Toolbar = ({ currentFolder }: ToolbarProps) => {
  const { isShortcutGuideOpen, setIsShortcutGuideOpen } = useKeyboardShortcutGuide();
  const { 
    currentStyle, 
    setCurrentStyle, 
    currentTool, 
    setCurrentTool,
    currentDocumentId,
    documents
  } = useAnnotationStore();
  
  // State for folder info dropdown
  const [showFolderInfo, setShowFolderInfo] = useState(false);
  
  // Get current page number from the DOM if available
  const getCurrentPageNumber = (): number => {
    const pageElement = document.querySelector('.page-number-display');
    return pageElement ? parseInt(pageElement.textContent?.split('/')[0]?.trim() || '1') : 1;
  };

  // Keep track of the last time we dispatched an event to prevent too many renders
  const lastDispatchTimeRef = useRef<number>(0);
  const dispatchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debounced dispatch function
  const debouncedDispatch = () => {
    // Clear any existing timeout
    if (dispatchTimeoutRef.current) {
      clearTimeout(dispatchTimeoutRef.current);
    }
    
    // Don't dispatch more than once every 300ms
    const now = Date.now();
    const timeSinceLastDispatch = now - lastDispatchTimeRef.current;
    
    if (timeSinceLastDispatch < 300) {
      // Schedule a dispatch after the debounce period
      dispatchTimeoutRef.current = setTimeout(() => {
        const currentPage = getCurrentPageNumber();
        dispatchAnnotationChangeEvent(currentPage);
        lastDispatchTimeRef.current = Date.now();
      }, 300 - timeSinceLastDispatch);
    } else {
      // Dispatch immediately
      const currentPage = getCurrentPageNumber();
      dispatchAnnotationChangeEvent(currentPage);
      lastDispatchTimeRef.current = now;
    }
  };

  // Trigger re-render when tool changes, but debounced
  useEffect(() => {
    if (currentDocumentId) {
      debouncedDispatch();
    }
    
    // Cleanup
    return () => {
      if (dispatchTimeoutRef.current) {
        clearTimeout(dispatchTimeoutRef.current);
      }
    };
  }, [currentTool, currentStyle, currentDocumentId]);

  const renderStyleSection = () => (
    <div className="space-y-4 p-2">
      {/* Color Picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Color
        </label>
        <div className="grid grid-cols-8 gap-1.5">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setCurrentStyle({ color })}
              className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${
                currentStyle.color === color
                  ? "border-blue-500 ring-2 ring-blue-200"
                  : "border-transparent"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Line Width */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Line Width
        </label>
        <div className="flex gap-1.5">
          {LINE_WIDTHS.map((width) => (
            <button
              key={width}
              onClick={() => setCurrentStyle({ lineWidth: width })}
              className={`h-8 flex-1 flex items-center justify-center border rounded-md transition-colors ${
                currentStyle.lineWidth === width
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div
                className="rounded-full"
                style={{
                  backgroundColor: currentStyle.color,
                  width: `${width * 4}px`,
                  height: `${width * 4}px`,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Opacity
        </label>
        <div className="flex gap-1.5">
          {OPACITY_LEVELS.map((opacity) => (
            <button
              key={opacity}
              onClick={() => setCurrentStyle({ opacity })}
              className={`h-8 flex-1 border rounded-md transition-colors ${
                currentStyle.opacity === opacity
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div
                className="w-full h-full rounded-md"
                style={{
                  backgroundColor: currentStyle.color,
                  opacity: opacity,
                }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="toolbar-fixed bg-white border-r border-gray-200 overflow-y-auto" style={{ flexShrink: 0, minWidth: '16rem' }}>
        {/* Folder information section */}
        {currentFolder && (
          <div className="p-3 border-b border-gray-200">
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowFolderInfo(!showFolderInfo)}
            >
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-blue-500" />
                <span className="font-medium text-gray-800">{currentFolder.name}</span>
              </div>
              <button className="text-gray-400 hover:text-gray-600">
                {showFolderInfo ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>
        )}
        
        <ToolbarSection title="Basic Tools" defaultExpanded>
          {TOOLS.basic.map((tool) => (
            <ToolButton
              key={tool.tool}
              tool={tool.tool}
              icon={tool.icon}
              label={tool.label}
              shortcut={getOptionalShortcut(tool)}
              currentFolder={currentFolder}
            />
          ))}
        </ToolbarSection>
        
        <ToolbarSection title="Shapes">
          {TOOLS.shapes.map((tool) => (
            <ToolButton
              key={tool.tool}
              tool={tool.tool}
              icon={tool.icon}
              label={tool.label}
              shortcut={getOptionalShortcut(tool)}
              currentFolder={currentFolder}
            />
          ))}
        </ToolbarSection>
        <ToolbarSection title="Lines & Arrows">
          {TOOLS.lines.map((tool) => (
            <ToolButton
              key={tool.tool}
              tool={tool.tool}
              icon={tool.icon}
              label={tool.label}
              shortcut={getOptionalShortcut(tool)}
              currentFolder={currentFolder}
            />
          ))}
        </ToolbarSection>
        <ToolbarSection title="Text & Notes">
          {TOOLS.text.map((tool) => (
            <ToolButton
              key={tool.tool}
              tool={tool.tool}
              icon={tool.icon}
              label={tool.label}
              shortcut={getOptionalShortcut(tool)}
              currentFolder={currentFolder}
            />
          ))}
        </ToolbarSection>
        <ToolbarSection title="Style">{renderStyleSection()}</ToolbarSection>
        <div className="mt-auto border-t border-gray-200 p-2 space-y-2">
          <button
            onClick={() => setIsShortcutGuideOpen(true)}
            className="w-full flex items-center justify-between gap-1 p-2 rounded hover:bg-gray-50 text-gray-600 hover:text-gray-700"
            title="Show keyboard shortcuts (?)"
          >
            <div className="flex items-center gap-1">
              <HelpCircle size={16} />
              <span className="text-sm">Keyboard Shortcuts</span>
            </div>
            <kbd className="px-2 py-0.5 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-200 rounded shadow-sm">?</kbd>
          </button>
        </div>
      </div>
      
      {isShortcutGuideOpen && (
        <KeyboardShortcutGuide onClose={() => setIsShortcutGuideOpen(false)} />
      )}
    </>
  );
};
