import React from "react";
import {
  Download,
  Maximize,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  HelpCircle
} from "lucide-react";
import { useKeyboardShortcutGuide } from "../../hooks/useKeyboardShortcutGuide";

interface ImageControlsProps {
  scale: number;
  onFitToWidth: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onDownload: () => void;
}

export const ImageControls: React.FC<ImageControlsProps> = ({
  scale,
  onFitToWidth,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onDownload
}) => {
  const { setIsShortcutGuideOpen } = useKeyboardShortcutGuide();

  return (
    <div className="bg-white border-b flex w-full items-center justify-between py-2 px-4 select-none">
      <div className="flex items-center">
        {/* Zoom Controls */}
        <div className="flex items-center">
          <button
            onClick={onZoomOut}
            className="p-1 rounded hover:bg-gray-100 transition-colors duration-200"
            title="Zoom Out (Ctrl+-)"
            aria-label="Zoom Out"
          >
            <ZoomOut className="text-gray-700" size={20} />
          </button>
          
          <span className="mx-2 text-sm font-medium text-gray-700 min-w-[4rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          
          <button
            onClick={onZoomIn}
            className="p-1 rounded hover:bg-gray-100 transition-colors duration-200"
            title="Zoom In (Ctrl++)"
            aria-label="Zoom In"
          >
            <ZoomIn className="text-gray-700" size={20} />
          </button>
        </div>
        
        {/* Separator */}
        <div className="h-6 w-px bg-gray-200 mx-3" />
        
        {/* Fit Width Button */}
        <button
          onClick={onFitToWidth}
          className="p-1 flex items-center gap-2 rounded hover:bg-gray-100 transition-colors duration-200"
          title="Fit to Width"
          aria-label="Fit to Width"
        >
          <Maximize className="text-gray-700" size={20} />
          <span className="text-gray-700 text-sm font-medium">Fit to Screen</span>
        </button>
        
        {/* Separator */}
        <div className="h-6 w-px bg-gray-200 mx-3" />
        
        {/* Reset Button */}
        <button
          onClick={onResetZoom}
          className="p-1 flex items-center gap-2 rounded hover:bg-gray-100 transition-colors duration-200"
          title="Reset Zoom (Ctrl+0)"
          aria-label="Reset Zoom"
        >
          <RefreshCw className="text-gray-700" size={20} />
          <span className="text-gray-700 text-sm font-medium">Reset</span>
        </button>
        
        {/* Separator */}
        <div className="h-6 w-px bg-gray-200 mx-3" />
        
        {/* Download Option */}
        <button
          onClick={onDownload}
          className="p-1 flex items-center gap-2 rounded hover:bg-blue-100 transition-colors duration-200"
          title="Download Image with annotations"
        >
          <Download size={20} className="text-blue-600" /> 
          <span className="text-blue-600 font-medium">Download</span>
        </button>
      </div>
      
      <div className="flex items-center">
        <button
          onClick={() => setIsShortcutGuideOpen(true)}
          className="p-1 rounded hover:bg-gray-100 transition-colors duration-200"
          title="Keyboard Shortcuts (?)"
          aria-label="Keyboard Shortcuts"
        >
          <HelpCircle className="text-gray-700" size={20} />
        </button>
      </div>
    </div>
  );
}; 