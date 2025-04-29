import React, { useEffect, useRef, useState, useCallback } from "react";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { Annotation } from "../types/annotation";
import { Point } from "../types/annotation";
import { KeyboardShortcutGuide } from "./KeyboardShortcutGuide";
import { useKeyboardShortcutGuide } from "../hooks/useKeyboardShortcutGuide";
import { ImageControls } from "./ImageViewer/ImageControls";
import { drawAnnotation } from "../utils/drawingUtils";

interface ImageViewerProps {
  file: string;
  documentId: string;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ file, documentId }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [currentAnnotations, setCurrentAnnotations] = useState<Annotation[]>([]);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const grabCursorClassName = "cursor-grabbing";
  const { isShortcutGuideOpen, setIsShortcutGuideOpen } = useKeyboardShortcutGuide();

  const { 
    currentTool,
    currentStyle,
    selectAnnotation,
    selectedAnnotations,
    documents
  } = useAnnotationStore();
  
  // Helper function to get annotations for the current page
  const getAnnotationsForPage = useCallback((docId: string, pageNumber: number) => {
    const documentAnnotations = documents[docId]?.annotations || [];
    return documentAnnotations.filter(annotation => annotation.pageNumber === pageNumber);
  }, [documents]);

  const handleImageLoad = () => {
    if (imageRef.current) {
      // Set dimensions based on the loaded image
      setImageWidth(imageRef.current.naturalWidth);
      setImageHeight(imageRef.current.naturalHeight);
      
      // Calculate initial scale to fit the container
      if (containerRef.current) {
        const containerWidth = scrollContainerRef.current?.clientWidth || containerRef.current.clientWidth;
        const containerHeight = scrollContainerRef.current?.clientHeight || containerRef.current.clientHeight;
        
        // Calculate scale to fit within the container
        const widthScale = containerWidth / imageRef.current.naturalWidth;
        const heightScale = containerHeight / imageRef.current.naturalHeight;
        const initialScale = Math.min(widthScale, heightScale, 1) * 0.9; // 90% of max scale to ensure padding
        
        setScale(initialScale);
      }
      
      setIsLoading(false);
      setIsViewerReady(true);
    }
  };

  // Function to handle the contextmenu (right-click) event
  const handleContextMenu = (e: React.MouseEvent) => {
    // Prevent the default browser context menu
    e.preventDefault();
  };

  // Zoom functions
  const handleZoomIn = () => {
    setScale(prevScale => Math.min(prevScale * 1.2, 5.0)); // Increase by 20%, max 500%
  };

  const handleZoomOut = () => {
    setScale(prevScale => Math.max(prevScale * 0.8, 0.25)); // Decrease by 20%, min 25% 
  };

  const handleResetZoom = () => {
    setScale(1); // Reset to 100%
  };

  const handleFitToWidth = () => {
    if (imageRef.current && scrollContainerRef.current) {
      const containerWidth = scrollContainerRef.current.clientWidth;
      const containerHeight = scrollContainerRef.current.clientHeight;
      
      // Calculate scale to fit
      const widthScale = containerWidth / imageRef.current.naturalWidth;
      const heightScale = containerHeight / imageRef.current.naturalHeight;
      
      // Use the minimum scale to ensure the entire image fits
      const fitScale = Math.min(widthScale, heightScale) * 0.95; // 95% to ensure some padding
      setScale(fitScale);
    }
  };

  // Handle download with annotations - specific to image files
  const downloadAnnotatedImage = () => {
    // Create a canvas that includes the image and annotations
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || !imageRef.current) {
      console.error('Failed to create canvas context or image not loaded');
      alert('Could not download image. Please try again when the image is fully loaded.');
      return;
    }
    
    try {
      // Create a new image with crossOrigin set properly
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      // Set up a promise to handle image loading
      const imageLoadPromise = new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image for download"));
        
        // Start loading the image - use same source as the displayed image
        img.src = file;
        
        // If the image is already loaded, manually resolve
        if (img.complete) resolve(img);
      });
      
      // Process the image once loaded
      imageLoadPromise.then((loadedImg) => {
        // First clear the canvas with a white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, imageWidth, imageHeight);
        
        // Draw the image
        ctx.drawImage(loadedImg as HTMLImageElement, 0, 0, imageWidth, imageHeight);
        
        // Get the annotations
        const annotations = getAnnotationsForPage(documentId, 1);
        
        // Draw the annotations on the canvas
        if (annotations && annotations.length > 0) {
          console.log(`Drawing ${annotations.length} annotations on download canvas`);
          
          // Draw each annotation
          annotations.forEach((annotation) => {
            // Make sure each annotation has a valid style
            if (!annotation.style) {
              console.warn('Annotation missing style:', annotation);
              // Apply default style if needed
              annotation.style = {
                color: '#000000',
                lineWidth: 2,
                opacity: 1
              };
            }
            
            try {
              drawAnnotation(ctx, annotation, 1.0, true); // Use scale 1.0 and isForExport=true
            } catch (error) {
              console.error('Error drawing annotation during download:', error, annotation);
            }
          });
        } else {
          console.log('No annotations to draw on download canvas');
        }
        
        // Convert to data URL and trigger download
        try {
          const dataUrl = canvas.toDataURL('image/png');
          const filename = `annotated-image-${documentId.replace(/[^a-z0-9]/gi, '-')}.png`;
          
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          link.click();
          
          console.log('Image with annotations downloaded successfully');
        } catch (error) {
          console.error('Canvas export error:', error);
          alert('Failed to export the image due to security restrictions. The image may be from a different domain.');
        }
      }).catch(error => {
        console.error('Image loading error:', error);
        alert('Failed to load the image for download. The image may be from a restricted source.');
      });
    } catch (error) {
      console.error('Error during image download:', error);
      alert('Failed to download the image. Please try again.');
    }
  };

  // Add handler for dragging the image when using drag/hand tool
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    
    // Only enable dragging when using drag or hand tool
    if (currentTool === 'drag' || currentTool === 'hand') {
      setIsDragging(true);
      
      // Store initial mouse position
      setDragStart({
        x: e.clientX,
        y: e.clientY
      });
      
      // Store current scroll position
      scrollContainerRef.current.dataset.startScrollLeft = String(scrollContainerRef.current.scrollLeft);
      scrollContainerRef.current.dataset.startScrollTop = String(scrollContainerRef.current.scrollTop);
      
      // Change cursor to grabbing
      if (containerRef.current) {
        containerRef.current.classList.add(grabCursorClassName);
      }
      
      e.preventDefault();
    }
  }, [currentTool]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && dragStart && scrollContainerRef.current) {
      // Calculate how far the mouse has moved
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      // Get the original scroll position
      const startScrollLeft = parseInt(scrollContainerRef.current.dataset.startScrollLeft || '0');
      const startScrollTop = parseInt(scrollContainerRef.current.dataset.startScrollTop || '0');
      
      // Update the scroll position
      scrollContainerRef.current.scrollLeft = startScrollLeft - dx;
      scrollContainerRef.current.scrollTop = startScrollTop - dy;
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    
    // Remove grabbing cursor
    if (containerRef.current) {
      containerRef.current.classList.remove(grabCursorClassName);
    }
  }, []);

  // Update annotations when viewer is ready or scale changes
  useEffect(() => {
    if (isViewerReady) {
      const annotations = getAnnotationsForPage(documentId, 1); // Images have only one page
      setCurrentAnnotations(annotations);
    }
  }, [isViewerReady, scale, documentId, getAnnotationsForPage]);

  // Add event listeners for drag
  useEffect(() => {
    const handleWindowMouseUp = () => {
      handleMouseUp();
    };
    
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        if (scrollContainerRef.current) {
          // Calculate how far the mouse has moved
          const dx = e.clientX - (dragStart?.x || 0);
          const dy = e.clientY - (dragStart?.y || 0);
          
          // Get the original scroll position
          const startScrollLeft = parseInt(scrollContainerRef.current.dataset.startScrollLeft || '0');
          const startScrollTop = parseInt(scrollContainerRef.current.dataset.startScrollTop || '0');
          
          // Update the scroll position
          scrollContainerRef.current.scrollLeft = startScrollLeft - dx;
          scrollContainerRef.current.scrollTop = startScrollTop - dy;
        }
      }
    };
    
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('mousemove', handleWindowMouseMove);
    
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('mousemove', handleWindowMouseMove);
    };
  }, [isDragging, dragStart, handleMouseUp]);

  // Handle zooming with mouse wheel + Ctrl key
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Throttle function to prevent too many zoom operations
    let lastWheelTimestamp = 0;
    const WHEEL_THROTTLE_MS = 50; // Throttle wheel events to 50ms intervals

    const handleWheel = (e: WheelEvent) => {
      // Only handle zooming when Ctrl key is pressed
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        
        // Throttle wheel events
        const now = Date.now();
        if (now - lastWheelTimestamp < WHEEL_THROTTLE_MS) {
          return;
        }
        lastWheelTimestamp = now;
        
        // Get the scroll container
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;
        
        const viewportWidth = scrollContainer.clientWidth;
        const viewportHeight = scrollContainer.clientHeight;
        
        // Get current scroll position
        const scrollLeft = scrollContainer.scrollLeft;
        const scrollTop = scrollContainer.scrollTop;
        
        // Get the position of the mouse relative to the document
        const rect = scrollContainer.getBoundingClientRect();
        const mouseX = e.clientX - rect.left + scrollLeft;
        const mouseY = e.clientY - rect.top + scrollTop;
        
        // Store the current scale for calculating scale factor
        const oldScale = scale;
        
        // Calculate new scale based on wheel direction
        let newScale;
        if (e.deltaY < 0) {
          // Zoom in
          newScale = scale * 1.1; // 10% increase
          newScale = Math.min(newScale, 5.0); // max 500%
        } else {
          // Zoom out
          newScale = scale * 0.9; // 10% decrease
          newScale = Math.max(newScale, 0.25); // min 25%
        }
        
        // Update the scale
        setScale(newScale);
        
        // After scale change, update scroll position to keep mouse position stable
        setTimeout(() => {
          if (!scrollContainer) return;
          
          // Calculate scale factor between old and new scale
          const scaleFactor = newScale / oldScale;
          
          // Calculate new mouse position with new scale
          const newMouseX = mouseX * scaleFactor;
          const newMouseY = mouseY * scaleFactor;
          
          // Calculate difference to adjust scroll position
          const dx = newMouseX - mouseX;
          const dy = newMouseY - mouseY;
          
          // Set new scroll position to keep mouse over the same content
          scrollContainer.scrollLeft = scrollLeft + dx;
          scrollContainer.scrollTop = scrollTop + dy;
        }, 0);
      }
    };

    // Add passive: false to prevent default browser behavior when Ctrl is pressed
    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [scale]);

  // Event handler for annotation changes
  useEffect(() => {
    if (!containerRef.current) return;

    const handleAnnotationChange = (event: CustomEvent) => {
      try {
        // For images, we always treat it as page 1
        const annotations = getAnnotationsForPage(documentId, 1);
        setCurrentAnnotations(annotations);
        
        // Dispatch annotation rendering event
        document.dispatchEvent(
          new CustomEvent('renderAnnotations', {
            detail: { 
              pageNumber: 1,
              annotations 
            },
          })
        );
      } catch (err) {
        console.error('[ImageViewer] Error handling annotation change:', err);
      }
    };
    
    // Add event listeners
    containerRef.current.addEventListener('annotationChanged', handleAnnotationChange as EventListener);
    
    // Also listen on document for events
    document.addEventListener('annotationChanged', handleAnnotationChange as EventListener);
    
    return () => {
      containerRef.current?.removeEventListener('annotationChanged', handleAnnotationChange as EventListener);
      document.removeEventListener('annotationChanged', handleAnnotationChange as EventListener);
    };
  }, [documentId, getAnnotationsForPage]);

  return (
    <div 
      ref={containerRef} 
      className="image-container relative flex flex-col h-full"
      data-current-tool={currentTool}
      data-cursor-state={isDragging ? "grabbing" : currentTool === "drag" ? "grab" : currentTool}
      onContextMenu={handleContextMenu}
    >
      {isShortcutGuideOpen && (
        <KeyboardShortcutGuide onClose={() => setIsShortcutGuideOpen(false)} />
      )}
      
      {/* Image Controls */}
      <ImageControls 
        scale={scale}
        onFitToWidth={handleFitToWidth}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onDownload={downloadAnnotatedImage}
      />
      
      <div 
        ref={scrollContainerRef}
        className="overflow-auto flex-grow"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        )}
        
        <div 
          className="image-viewer-container mx-auto relative"
          style={{ 
            opacity: isLoading ? 0 : 1,
            cursor: isDragging ? 'grabbing' : 
              (currentTool === 'drag' || currentTool === 'hand') ? 'grab' : undefined
          }}
        >
          <img
            ref={imageRef}
            src={file}
            alt="Document"
            className="absolute top-0 left-0 z-10"
            style={{
              width: imageWidth * scale,
              height: imageHeight * scale,
            }}
            onLoad={handleImageLoad}
            onContextMenu={handleContextMenu}
            crossOrigin="anonymous"
          />
          
          {isViewerReady && (
            <AnnotationCanvas
              documentId={documentId}
              pageNumber={1} // Images always use page 1
              scale={scale}
              width={imageWidth * scale}
              height={imageHeight * scale}
            />
          )}
        </div>
      </div>
    </div>
  );
}; 