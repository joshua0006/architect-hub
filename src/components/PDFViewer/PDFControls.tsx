import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  FileDown,
  FileUp,
  HelpCircle,
  Maximize,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RefreshCw,
} from "lucide-react";
import { useKeyboardShortcutGuide } from "../../hooks/useKeyboardShortcutGuide";

interface PDFControlsProps {
  currentPage: number;
  totalPages: number;
  scale: number;
  isExporting: boolean;
  isImporting: boolean;
  importError: string | null;
  onPrevPage: () => void;
  onNextPage: () => void;
  onFitToWidth: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onExportCurrentPage: (format: "png" | "pdf") => void;
  onExportAllPages: (quality?: "standard" | "hd") => void;
  onExportAnnotations: () => void;
  onImportAnnotations: (file: File) => void;
}

export const PDFControls: React.FC<PDFControlsProps> = ({
  currentPage,
  totalPages,
  scale,
  isExporting,
  isImporting,
  importError,
  onPrevPage,
  onNextPage,
  onFitToWidth,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onExportCurrentPage,
  onExportAllPages,
  onExportAnnotations,
  onImportAnnotations,
}) => {
  const { setIsShortcutGuideOpen } = useKeyboardShortcutGuide();


  

  return (
    <div className="bg-white border-b flex w-full items-center justify-between py-2 px-4 select-none">
      <div className="flex items-center">
        <div className="flex items-center">
          <button
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            className={`p-1 rounded ${
              currentPage <= 1 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100"
            }`}
            title="Previous Page (Left Arrow)"
            aria-label="Previous Page"
          >
            <ChevronLeft className="text-gray-700" size={20} />
          </button>
          <span className="mx-2 text-sm font-medium text-gray-700 min-w-[4rem] text-center">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            className={`p-1 rounded ${
              currentPage >= totalPages ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100"
            }`}
            title="Next Page (Right Arrow)"
            aria-label="Next Page"
          >
            <ChevronRight className="text-gray-700" size={20} />
          </button>

          <div className="h-6 w-px bg-gray-200 ml-1" />
  
        </div>

        <div className="h-6 w-px bg-gray-200" />
        
        {/* Zoom Controls */}
        <div className="flex items-center space-x-1 ml-2">
          <button
            onClick={onZoomOut}
            className="p-1 rounded hover:bg-gray-100 transition-colors duration-200"
            title="Zoom Out (Ctrl+-)"
            aria-label="Zoom Out"
          >
            <ZoomOut className="text-gray-700" size={20} />
          </button>
          
          <span className="text-sm font-medium text-gray-700 min-w-[4rem] text-center">
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
          
          <button
            onClick={onFitToWidth}
            className="p-1 flex items-center gap-2 rounded hover:bg-gray-100 transition-colors duration-200"
            title="Fit to Width"
            aria-label="Fit to Width"
          >
            <Maximize className="text-gray-700" size={20} />
            <span className="text-gray-700 text-sm font-medium">Fit Width</span>
          </button>
          
          <button
            onClick={onResetZoom}
            className="p-1 flex items-center gap-2 rounded hover:bg-gray-100 transition-colors duration-200"
            title="Reset Zoom (Ctrl+0)"
            aria-label="Reset Zoom"
          >
            <RefreshCw className="text-gray-700" size={20} />
            <span className="text-gray-700 text-sm font-medium">Reset</span>
          </button>
        </div>
        
        <div className="h-6 w-px bg-gray-200 ml-2" />
        
        <div className="relative group">
          <div className="flex">
            <button
              onClick={() => onExportAllPages("hd")}
              className="p-1 flex items-center gap-2 rounded-l hover:bg-blue-100 ml-2 transition-colors duration-200"
              title="Download HD PDF with annotations"
              disabled={isExporting}
            >
              <Download size={20} className={isExporting ? "text-gray-400" : "text-blue-600"} /> 
              <span className="text-blue-600 font-medium">Download PDF</span>
              {isExporting && (
                <span className="ml-1 text-xs text-gray-500">Exporting...</span>
              )}
            </button>
            
           
          </div>
       
        </div>
      
      </div>
      
      <div></div>
      
      {importError && (
        <div className="absolute top-full right-0 mt-1 bg-red-100 text-red-600 text-sm p-2 rounded shadow">
          {importError}
        </div>
      )}
    </div>
  );
};
