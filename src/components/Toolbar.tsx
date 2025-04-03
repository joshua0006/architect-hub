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
const dispatchAnnotationChangeEvent = (pageNumber: number = 1, source: string = 'toolbar') => {
  // Create the event
  const event = new CustomEvent('annotationChanged', {
    bubbles: true,
    detail: { pageNumber, source }
  });
  
  // First try to dispatch to the PDF container
  const pdfContainer = document.querySelector('.pdf-container');
  if (pdfContainer) {
    pdfContainer.dispatchEvent(event);
    console.log('[Toolbar] Dispatched annotationChanged event to PDF container');
  }
  
  // When using select tool for movement, avoid setting forceRender on the canvas
  // This prevents excessive rerenders during drag operations
  if (source !== 'movement') {
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

  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  // Keep track of the last time we dispatched an event to prevent too many renders
  const lastDispatchTimeRef = useRef<number>(0);
  const dispatchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debounced dispatch function
  const debouncedDispatch = () => {
    // Clear any existing timeout
    if (dispatchTimeoutRef.current) {
      clearTimeout(dispatchTimeoutRef.current);
    }
    
    // Use different timing based on the current tool
    // Longer debounce for select tool to reduce renders during movement
    const debounceTime = currentTool === 'select' ? 500 : 300;
    
    // Don't dispatch more than once every debounceTime
    const now = Date.now();
    const timeSinceLastDispatch = now - lastDispatchTimeRef.current;
    
    // Check if we're using select tool and in a movement operation
    const isMovementOperation = currentTool === 'select' && 
      document.querySelector('.annotation-canvas-container')?.classList.contains('dragging');
    
    // If we're in a movement operation, use throttling instead of dispatching immediately
    if (timeSinceLastDispatch < debounceTime) {
      // Schedule a dispatch after the debounce period
      dispatchTimeoutRef.current = setTimeout(() => {
        const currentPage = getCurrentPageNumber();
        // Pass movement source if relevant
        dispatchAnnotationChangeEvent(currentPage, isMovementOperation ? 'movement' : 'toolbar');
        lastDispatchTimeRef.current = Date.now();
      }, debounceTime - timeSinceLastDispatch);
    } else if (!isMovementOperation) {
      // Only dispatch immediately if not in a movement operation
      const currentPage = getCurrentPageNumber();
      dispatchAnnotationChangeEvent(currentPage, 'toolbar');
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

  // Add an event listener for annotation movement events from PDFViewer
  useEffect(() => {
    const handleAnnotationMovement = (e: Event) => {
      // Use a different reference for movement operations
      // This avoids conflicting with the normal tool change events
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.type === 'movement') {
        // For movement events, we use a higher threshold throttling
        // to dramatically reduce renders during drag operations
        const now = Date.now();
        if (now - lastDispatchTimeRef.current > 300) {
          lastDispatchTimeRef.current = now;
          const currentPage = getCurrentPageNumber();
          dispatchAnnotationChangeEvent(currentPage, 'movement');
        }
      }
    };

    document.addEventListener('annotationMovement', handleAnnotationMovement);
    
    return () => {
      document.removeEventListener('annotationMovement', handleAnnotationMovement);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      <div className="toolbar-fixed bg-white border-r border-gray-200 overflow-y-auto" 
           style={{ flexShrink: 0, minWidth: '16rem', height: screenWidth < 1600 ? '63vh' : '71vh' }}>
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
