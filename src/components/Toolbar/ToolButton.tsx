import React, { useEffect, useRef } from "react";
import { useAnnotationStore } from "../../store/useAnnotationStore";
import { Annotation, AnnotationType } from "../../types/annotation"; // Added Annotation type
import { LucideProps } from "lucide-react";
import { Folder, EnhancedFolder } from "../Toolbar";
import { DEFAULT_FOLDER_ACCESS, FolderAccessPermission, PERMISSIONS_MAP, useAuth, UserRole } from "../../contexts/AuthContext";

interface ToolButtonProps {
  tool: AnnotationType;
  icon: React.ComponentType<LucideProps>;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  rightIcon?: React.ComponentType<LucideProps>;
  currentFolder?: Folder | EnhancedFolder | null;
}


// Track last event time globally to prevent multiple rapid dispatches
let lastEventTime = 0;
const EVENT_COOLDOWN = 300; // ms

// Helper function to dispatch annotation change event
const dispatchToolChangeEvent = () => {
  // Apply event throttling
  const now = Date.now();
  if (now - lastEventTime < EVENT_COOLDOWN) {
    console.log('[ToolButton] Ignoring event due to cooldown');
    return;
  }
  
  lastEventTime = now;
  
  // Set the tool change indicator
  const toolChangeIndicator = window.document.getElementById('tool-change-indicator') as HTMLDivElement;
  if (toolChangeIndicator) {
    toolChangeIndicator.dataset.toolChanged = 'true';
    console.log('[ToolButton] Set toolChanged flag on indicator');
  }

  // Create the event
  const event = new CustomEvent('annotationChanged', {
    bubbles: true,
    detail: { 
      pageNumber: getCurrentPageNumber(),
      source: 'toolChange' 
    }
  });
  
  // First try to dispatch to the PDF container
  const pdfContainer = window.document.querySelector('.pdf-container');
  if (pdfContainer) {
    pdfContainer.dispatchEvent(event);
    console.log('[ToolButton] Dispatched annotationChanged event to PDF container');
  }
  
  // Also try to dispatch directly to annotation canvas
  const annotationCanvas = window.document.querySelector('.annotation-canvas-container canvas') as HTMLCanvasElement;
  if (annotationCanvas) {
    annotationCanvas.dataset.forceRender = 'true';
    annotationCanvas.dispatchEvent(event);
    console.log('[ToolButton] Set forceRender flag on annotation canvas');
  }
};

// Get current page number from the DOM
const getCurrentPageNumber = (): number => {
  const pageElement = document.querySelector('.page-number-display');
  return pageElement ? parseInt(pageElement.textContent?.split('/')[0]?.trim() || '1') : 1;
};

export const ToolButton: React.FC<ToolButtonProps> = ({
  tool,
  icon: IconComponent,
  label,
  shortcut,
  onClick,
  rightIcon: RightIconComponent,
  currentFolder,
}) => {
  const { currentTool, setCurrentTool } = useAnnotationStore();
  const { user } = useAuth();

  // Add debug logs
  useEffect(() => {
    if (tool === 'delete') {
      console.log('[ToolButton] Delete tool initialized with props:', {
        tool,
        label,
        shortcut,
        currentTool: currentTool === tool ? 'active' : 'inactive'
      });
    }
  }, [tool, currentTool]);

  const hasFolderWritePermission = (): boolean => {
    if(tool === 'select' || tool === 'drag') {
      return true;
    }
    const role = user?.role as UserRole| undefined;
    const folderPermission = currentFolder?.metadata?.access as FolderAccessPermission;
    let writeAccess = DEFAULT_FOLDER_ACCESS;
    if (role && folderPermission in PERMISSIONS_MAP) {
      writeAccess = PERMISSIONS_MAP[folderPermission][role] ?? DEFAULT_FOLDER_ACCESS;
    }
    return writeAccess.write;
  }  

  const handleClick = () => {
    // Get necessary functions and state from the store
    const {
      addAnnotation,
      setAnnotationToEditImmediately,
      setCurrentTool,
      currentStyle,
      currentDocumentId
    } = useAnnotationStore.getState();

    if (tool === 'text') {
      if (!currentDocumentId) {
        console.error("Cannot add text annotation: No document selected.");
        return;
      }

      // Define default properties for the new text annotation
      const defaultPos = { x: 100, y: 100 }; // Default position (adjust as needed)
      const defaultWidth = 120;
      const defaultHeight = 40;
      const defaultText = "Text";
      const currentPage = getCurrentPageNumber(); // Use existing helper

      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: "text",
        points: [defaultPos],
        text: defaultText,
        style: {
          ...currentStyle,
          text: defaultText,
          textOptions: currentStyle.textOptions || { fontSize: 14, fontFamily: 'Arial' },
        },
        pageNumber: currentPage,
        timestamp: Date.now(),
        userId: "current-user", // Replace with actual user ID later
        version: 1,
        width: defaultWidth,
        height: defaultHeight,
      };

      // Add the annotation to the store
      addAnnotation(currentDocumentId, newAnnotation);
      
      // Signal AnnotationCanvas to start editing this annotation
      setAnnotationToEditImmediately(newAnnotation);
      
      // Switch back to select tool immediately
      setCurrentTool("select");

      // Dispatch event to trigger canvas update for the new tool ('select')
      dispatchToolChangeEvent();

    } else {
      // Default behavior for other tools
      setCurrentTool(tool);
      onClick?.(); // Call any additional onClick handler passed as prop
      dispatchToolChangeEvent(); // Dispatch event for other tool changes
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-md w-full transition-colors ${
        currentTool === tool
          ? "bg-blue-50 text-blue-600"
          : "text-gray-700 hover:bg-gray-50"
      }`}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={!hasFolderWritePermission()}
    >
      <div className="flex-1 flex items-center gap-2">
        <IconComponent size={20} />
        <span className="text-sm font-medium">{label}</span>
        {RightIconComponent && (
          <div className="ml-auto">
            <RightIconComponent size={16} className="text-gray-400" />
          </div>
        )}
      </div>
      {shortcut && <span className="text-xs text-gray-400">{shortcut}</span>}
    </button>
  );
};
