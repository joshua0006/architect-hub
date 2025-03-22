import React, { useRef } from "react";
import { useAnnotationStore } from "../../store/useAnnotationStore";
import { AnnotationType } from "../../types/annotation";
import { LucideProps } from "lucide-react";

interface ToolButtonProps {
  tool: AnnotationType;
  icon: React.ComponentType<LucideProps>;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  rightIcon?: React.ComponentType<LucideProps>;
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
}) => {
  const { currentTool, setCurrentTool } = useAnnotationStore();

  return (
    <button
      onClick={() => {
        setCurrentTool(tool);
        onClick?.();
        
        // Dispatch event to trigger re-rendering of the PDF canvas
        dispatchToolChangeEvent();
      }}
      className={`flex items-center gap-2 px-3 py-2 rounded-md w-full transition-colors ${
        currentTool === tool
          ? "bg-blue-50 text-blue-600"
          : "text-gray-700 hover:bg-gray-50"
      }`}
      title={shortcut ? `${label} (${shortcut})` : label}
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
