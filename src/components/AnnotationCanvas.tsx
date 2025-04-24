import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  useAnnotationStore,
  initialDocumentState,
} from "../store/useAnnotationStore";
import {
  drawAnnotation,
  drawResizeHandles,
  isPointInStamp,
  isPointInHighlight,
  getShapeBounds,
  drawSelectionOutline,
  isPointInsideCircle,
  drawLine,
  drawRectangle,
  drawCircle,
  drawTriangle,
  drawStar,
  drawArrow,
  drawSmoothFreehand,
} from "../utils/drawingUtils";
import { 
  renderTextPreview, 
  handleTextToolCompletion, 
  isPointInTextAnnotation,
  createTextAnnotation,
  createStickyNoteAnnotation
} from "../utils/textToolsUtils";
import { Point, Annotation, AnnotationType } from "../types/annotation";
import { TextInput } from "./TextInput";
import { ContextMenu } from "./ContextMenu";
import {
  ResizeHandle,
  getResizeHandle,
  getResizeCursor,
  getResizedPoints,
  isValidResize,
} from "../utils/resizeUtils";

interface TextInputProps {
  position: Point;
  onComplete: (text: string, finalPosition?: Point) => void;
  onCancel: () => void;
  scale: number;
  isSticky: boolean;
  initialText?: string;
  initialWidth?: number;
  initialHeight?: number;
  textOptions?: AnnotationStyle['textOptions'];
}

interface AnnotationStyle {
  color: string;
  lineWidth: number;
  opacity: number;
  circleDiameterMode?: boolean;
  textOptions?: {
    fontSize?: number;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
    text?: string;
    underline?: boolean;
  };
}

interface AnnotationCanvasProps {
  documentId: string;
  pageNumber: number;
  scale: number;
  width: number;
  height: number;
  onPaste?: (pageNumber: number) => void;
}

export const AnnotationCanvas: React.FC<AnnotationCanvasProps> = ({
  documentId,
  pageNumber,
  scale,
  width,
  height,
  onPaste,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [selectedAnnotations, setSelectedAnnotations] = useState<Annotation[]>(
    []
  );
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null);
  const lastPointRef = useRef<Point | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null); // Ref for the TextInput component
  // Removed duplicate textInputRef declaration
  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const [textInputPosition, setTextInputPosition] = useState<Point | null>(null);
  const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(null);
  const [stickyNoteScale, setStickyNoteScale] = useState<number>(1);
  const [selectionBox, setSelectionBox] = useState<{ start: Point; end: Point } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
  } | null>(null);
  const [isCircleCenterMode, setIsCircleCenterMode] = useState<boolean>(false);
  const [moveOffset, setMoveOffset] = useState<Point | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  // Removed text dragging state variables
  const [cursorPosition, setCursorPosition] = useState<Point | null>(null);
  const [scrollPosition, setScrollPosition] = useState({ left: 0, top: 0 });
  const lastScrollPosition = useRef({ left: 0, top: 0 });
  const store = useAnnotationStore();
  const { currentTool, currentStyle, currentDrawMode, selectAnnotation, setCurrentTool } = store;
  const documentState = store.documents[documentId] || initialDocumentState();

  // Add these refs for optimized auto-scrolling
  const autoScrollingRef = useRef<boolean>(false);
  const scrollSpeedRef = useRef({ x: 0, y: 0 });
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const SCROLL_THRESHOLD = 80; // Increased threshold for earlier scroll trigger
  const MAX_SCROLL_SPEED = 15; // Reduced max speed for smoother scrolling
  const MIN_SCROLL_SPEED = 2; // Minimum scroll speed
  const ACCELERATION = 0.2; // Reduced acceleration for smoother ramping
  const DECELERATION = 0.92; // Smooth deceleration factor
  const AUTOSAVE_DELAY = 2000; // Delay in ms before triggering autosave

  // Add state for save button UI feedback
  const [showSaveButton, setShowSaveButton] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAutosaving, setIsAutosaving] = useState(false);
  
  // Function to mark changes as unsaved and show save button
  const markUnsavedChanges = useCallback(() => {
    setHasUnsavedChanges(true);
    setShowSaveButton(true);
  }, []);

  // Effect to focus the text input when editing starts
  useEffect(() => {
    if (isEditingText && textInputRef.current) {
      // Use a short timeout to ensure the element is fully rendered and focusable
      // Use a slightly longer timeout to ensure focus after potential rendering delays
      setTimeout(() => {
        textInputRef.current?.focus();
        // Select text only if it's the default placeholder
        if (editingAnnotation?.text === "Text" || editingAnnotation?.text === "Type here...") {
             textInputRef.current?.select();
        }
      }, 100); // Increased timeout to 100ms
    }
  }, [isEditingText, editingAnnotation]); // Depend on editing state and the annotation being edited

  const dispatchAnnotationChangeEvent = useCallback(
    (source: string, forceRender: boolean = false) => {
      // Create a custom event with the annotation change details
      const event = new CustomEvent("annotationChanged", {
        detail: {
          pageNumber,
          documentId,
          source,
          forceRender,
          timestamp: Date.now(),
        },
      });

      // Dispatch the event to both the canvas element and the PDF container
      // This ensures that all components that need to know about the annotation change will be notified
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.dispatchEvent(event);
      }

      // Also try to dispatch to the PDF container for broader notification
      try {
        const pdfContainer = document.querySelector(".pdf-container, .pdf-container-fixed");
        if (pdfContainer) {
          pdfContainer.dispatchEvent(event);
        } else {
          console.warn("[AnnotationCanvas] Could not find PDF container to dispatch event");
        }
      } catch (err) {
        console.error("[AnnotationCanvas] Error dispatching event:", err);
      }

      // Also dispatch to document for components that might be listening globally
      document.dispatchEvent(event);
    },
    [pageNumber, documentId]
  );

  const getCanvasPoint = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scrollContainer = canvas.parentElement?.parentElement;
    
    if (!scrollContainer) return { x: 0, y: 0 };
    
    // Get the current scroll values
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollTop = scrollContainer.scrollTop;
    
    // Store the initial scroll position when drawing starts
    if (!isDrawing) {
      lastScrollPosition.current = { left: scrollLeft, top: scrollTop };
    }
    
    // Calculate the scroll delta since drawing started
    const scrollDeltaX = scrollLeft - lastScrollPosition.current.left;
    const scrollDeltaY = scrollTop - lastScrollPosition.current.top;
    
    // Get correct scale between displayed size and actual canvas size
    const scaleFactorX = canvas.width / rect.width;
    const scaleFactorY = canvas.height / rect.height;
    
    // Mouse position relative to visible canvas
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate final PDF coordinates, adjusting for scroll movement during drawing
    const pdfX = mouseX * scaleFactorX / scale;
    const pdfY = mouseY * scaleFactorY / scale;
    
    
    return { x: pdfX, y: pdfY };
  };

  const getResizeHandle = (
    point: Point,
    annotation: Annotation
  ): ResizeHandle => {
    if (!annotation.points || annotation.points.length < 2) return null;

    const [start, end] = annotation.points;
    const handleSize = 8 / scale; // Resize handle hit area

    const bounds = {
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x),
      top: Math.min(start.y, end.y),
      bottom: Math.max(start.y, end.y),
    };

    // Check corners first
    if (
      Math.abs(point.x - bounds.left) <= handleSize &&
      Math.abs(point.y - bounds.top) <= handleSize
    )
      return "topLeft";
    if (
      Math.abs(point.x - bounds.right) <= handleSize &&
      Math.abs(point.y - bounds.top) <= handleSize
    )
      return "topRight";
    if (
      Math.abs(point.x - bounds.left) <= handleSize &&
      Math.abs(point.y - bounds.bottom) <= handleSize
    )
      return "bottomLeft";
    if (
      Math.abs(point.x - bounds.right) <= handleSize &&
      Math.abs(point.y - bounds.bottom) <= handleSize
    )
      return "bottomRight";

    // Then check edges
    if (Math.abs(point.x - bounds.left) <= handleSize) return "left";
    if (Math.abs(point.x - bounds.right) <= handleSize) return "right";
    if (Math.abs(point.y - bounds.top) <= handleSize) return "top";
    if (Math.abs(point.y - bounds.bottom) <= handleSize) return "bottom";

    return null;
  };

  const isPointInAnnotation = (point: Point, annotation: Annotation): boolean => {
    if (!annotation.points.length) return false;

    if (annotation.type === "stamp" || annotation.type === "stampApproved" || 
        annotation.type === "stampRejected" || annotation.type === "stampRevision") {
      return isPointInStamp(point, annotation);
    } else if (annotation.type === "highlight") {
      return isPointInHighlight(point, annotation);
    } else if (annotation.type === "circle") {
      return isPointInsideCircle(point, annotation, scale);
    } else if (annotation.type === "text" || annotation.type === "stickyNote") {
      return isPointInTextAnnotation(point, annotation, scale);
    }

    // Handle rectangles, lines, and other shapes with bounding box approach
    if (annotation.points.length < 2) return false;
    
    const bounds = getShapeBounds(annotation.points);
    
    // Add a small buffer for selection (scaled by the lineWidth)
    const buffer = Math.max(annotation.style.lineWidth, 5) / scale;
    
    return (
      point.x >= bounds.left - buffer &&
      point.x <= bounds.right + buffer &&
      point.y >= bounds.top - buffer &&
      point.y <= bounds.bottom + buffer
    );
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    // Prevent default behavior to avoid selections
    e.preventDefault();
    
    // If drag tool is active, don't do any annotation operations
    // Let the PDFViewer component handle the panning
    if (currentTool === "drag") {
      return;
    }
    
    const point = getCanvasPoint(e);
    
    // We no longer need the text and sticky note handling code here since it's done in the useEffect
    // The text tools now automatically center the annotation when selected
    
    if (currentTool === "select") {
      // Check if we're clicking on a selected annotation
      const clickedAnnotation = selectedAnnotations.find(
        (annotation) => isPointInAnnotation(point, annotation)
      );
      
      if (clickedAnnotation) {
        // For circles, we need to check for resize handles first before allowing move
        if (clickedAnnotation.type === "circle") {
          // Check if clicking on a resize handle
          const handle = getResizeHandleForCircle(point, clickedAnnotation);
          
          if (handle) {
            // Start resizing operation
            setIsResizing(true);
            setActiveHandle(handle);
            return;
          }
          
          // If not on a handle, then allow moving
          setMoveOffset(point);
          return;
        }
        
        // For other shapes, check for resize handles first
        const handle = getResizeHandle(point, clickedAnnotation);
        
        if (handle) {
          // Start resizing operation
          setIsResizing(true);
          setActiveHandle(handle);
        } else {
          // Start moving operation
          setMoveOffset(point);
        }
        return;
      }
      
      // If not clicking on a selected annotation, check if clicking on any annotation
      const clickedOnAny = documentState.annotations.find(
        (annotation) =>
          annotation.pageNumber === pageNumber &&
          isPointInAnnotation(point, annotation)
      );
      
      if (clickedOnAny) {
        // Select this annotation and prepare to move it
        store.selectAnnotations([clickedOnAny]);
        setMoveOffset(point);
        return;
      }

      // If clicking empty space
      if (!e.shiftKey) { // Clear selection only if Shift is not pressed
        store.clearSelection();
      }
      // Start a selection box
      setSelectionBox({ start: point, end: point });
      return;
    } else {
      setIsDrawing(true);
      lastPointRef.current = point;

      if (currentTool === "freehand") {
        // For freehand drawing, start with just the initial point
        // Clear any previous points first to ensure a fresh drawing
        setCurrentPoints([point]);
        
      } else {
        // For other shapes, initialize with start and end at the same point
        // End point will be updated during mouse move
        setCurrentPoints([
          { x: point.x, y: point.y },
          { x: point.x, y: point.y },
        ]);
      }
    }
  };

  const handleFreehandDraw = (point: Point) => {
    if (!isDrawing || currentTool !== "freehand") return;
    
    // Get the last point from the current points array
    const lastPoint = currentPoints[currentPoints.length - 1];
    
    // Calculate distance between new point and last point
    const dx = point.x - lastPoint.x;
    const dy = point.y - lastPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Get scroll container to check if scrolling occurred
    const scrollContainer = canvasRef.current?.parentElement?.parentElement;
    const isScrolling = scrollContainer && 
      (scrollContainer.scrollLeft !== lastScrollPosition.current.left || 
       scrollContainer.scrollTop !== lastScrollPosition.current.top);
    
    // Add point if:
    // 1. It's a minimum distance away from the last point (prevents too many points)
    // 2. OR if scrolling occurred (ensures proper line connection during scrolling)
    const MIN_DISTANCE = 2; // minimum pixels in PDF coordinate space
    
    if (distance >= MIN_DISTANCE || isScrolling) {
      // If scrolling occurred, add a point at the new location
      setCurrentPoints((prev) => [...prev, point]);
      
      // Update the last scroll position
      if (scrollContainer) {
        lastScrollPosition.current = {
          left: scrollContainer.scrollLeft,
          top: scrollContainer.scrollTop
        };
      }
    }
    
    // Force a render to show the drawing in real-time
    render();
  };

  // Move render function declaration to the top, before it's used
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get annotations for this page
    const annotations = documentState.annotations.filter(
      (a) => a.pageNumber === pageNumber
    );

    // Draw all annotations
    annotations.forEach((annotation) => {
      // Skip drawing the annotation being edited
      if (editingAnnotation?.id === annotation.id) return;
      
      // Use custom rendering for text and sticky notes
      if (annotation.type === "text") {
        // Draw the text annotation using our custom renderer
        drawTextAnnotation(ctx, annotation, scale);
      } else if (annotation.type === "stickyNote") {
        // Draw the sticky note using our custom renderer
        drawStickyNoteAnnotation(ctx, annotation, scale);
      } else {
        // Draw other annotation types with the standard renderer
        drawAnnotation(ctx, annotation, scale);
      }

      // Draw selection indicator if selected
      if (
        annotation.selected ||
        selectedAnnotations.some((a) => a.id === annotation.id)
      ) {
        // Check if it's a text or sticky note annotation
        if (annotation.type === "text" || annotation.type === "stickyNote") {
          // Call our custom text selection outline function
          drawTextSelectionOutline(ctx, annotation, scale, selectedAnnotations.length > 1);
        } else {
          // For other annotation types, use the regular outline
          drawSelectionOutline(
            ctx,
            annotation,
            scale,
            selectedAnnotations.length > 1
          );
        }
        
        // Draw resize handles for shapes if only one selected
        if (selectedAnnotations.length <= 1 && 
            annotation.type !== "text" && annotation.type !== "stickyNote") {
          drawResizeHandles(
            ctx,
            annotation,
            scale,
            annotation.type === "highlight"
          );
        }
      }
    });

    // Draw tool cursor indicators when tool is selected but not yet drawing
    // Removed isTextDragging check from cursor indicator condition
    if (cursorPosition && !isDrawing &&
        (currentTool === "text" || currentTool === "stickyNote")) {
      ctx.save();
      
      const isSticky = currentTool === "stickyNote";
      const x = cursorPosition.x * scale;
      const y = cursorPosition.y * scale;
      
      // Get text options from current style
      const { textOptions = {} } = currentStyle;
      const fontSize = (textOptions.fontSize || 14) * scale;
      
      // Draw the tool indicator
      if (isSticky) {
        // Show sticky note preview with fixed style
        ctx.fillStyle = '#FFD700'; // Fixed yellow color
        ctx.globalAlpha = 0.5; // More transparent for preview
        
        // Draw rectangle with folded corner - show exactly where it will be placed
        const width = 200 * scale; // Match actual sticky note size
        const height = 150 * scale;
        
        // Draw main rectangle exactly at cursor position (will be top-left)
        ctx.fillRect(x, y, width, height);
        
        // Draw folded corner
        ctx.beginPath();
        ctx.moveTo(x + width - 20*scale, y);
        ctx.lineTo(x + width, y + 20*scale);
        ctx.lineTo(x + width, y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.fill();
        
        // Draw placeholder text lines with proper padding to match actual rendering
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "#000000";
        const padding = 10 * scale; // Match padding in drawStickyNoteAnnotation
        const lineY = y + padding;
        const lineHeight = 16 * scale; // Match line height in drawStickyNoteAnnotation
        
        for (let i = 0; i < 3; i++) {
          const lineWidth = (150 - i*25) * scale;
          ctx.fillRect(x + padding, lineY + (i*lineHeight), lineWidth, 2*scale);
        }
        
        // Add subtle border without positioning indicators
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.5 * scale;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, width, height);
      }
      
      ctx.restore();
    }

    // Draw current annotation being created (preview)
    if (isDrawing && currentPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = currentStyle.color;
      ctx.fillStyle = currentStyle.color;
      ctx.lineWidth = currentStyle.lineWidth * scale;
      ctx.globalAlpha = currentStyle.opacity;

      // Handle different drawing modes
      if (currentTool === "freehand") {
        // For freehand drawing, use simpler drawing to ensure exact correspondence with cursor
        ctx.beginPath();
        
        // Start at the first point
        if (currentPoints.length > 0) {
          const firstPoint = currentPoints[0];
          ctx.moveTo(firstPoint.x * scale, firstPoint.y * scale);
          
          // Draw straight line segments to all points
          for (let i = 1; i < currentPoints.length; i++) {
            const point = currentPoints[i];
            ctx.lineTo(point.x * scale, point.y * scale);
          }
          
          // Use rounded line joins and caps for smoother appearance
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
        }
      } else if (currentTool === "line") {
        drawLine(ctx, currentPoints, scale, currentStyle);
      } else if (currentTool === "rectangle") {
        drawRectangle(ctx, currentPoints, scale);
      } else if (currentTool === "circle") {
        drawCircle(ctx, currentPoints, scale);
      } else if (currentTool === "triangle") {
        drawTriangle(ctx, currentPoints, scale);
      } else if (currentTool === "star") {
        drawStar(ctx, currentPoints, scale);
      } else if (currentTool === "highlight") {
        // For highlight tool, use special rendering with different opacity
        const originalAlpha = ctx.globalAlpha;
        ctx.globalAlpha = 0.3; // Highlights are semi-transparent
        ctx.lineWidth = 12 * scale; // Highlights are thicker
        
        // Draw the highlight as a rectangle to match the final shape
        if (currentPoints.length >= 2) {
          const [start, end] = currentPoints;
          
          // Calculate rectangle dimensions
          const x = Math.min(start.x, end.x) * scale;
          const y = Math.min(start.y, end.y) * scale;
          const width = Math.abs(end.x - start.x) * scale;
          const height = Math.abs(end.y - start.y) * scale;
          
          // Fill highlight rectangle with color
          ctx.fillStyle = currentStyle.color;
          ctx.fillRect(x, y, width, height);
        }
        
        // Restore original alpha
        ctx.globalAlpha = originalAlpha;
      } else if (currentTool === "arrow" || currentTool === "doubleArrow") {
        // Draw arrow preview
        drawArrow(ctx, currentPoints, scale, currentTool === "doubleArrow", currentStyle);
      }
      
      ctx.restore();
    }
    
    // Removed text dragging preview logic

    // Draw selection box if active
    if (selectionBox) {
      ctx.save();
      ctx.strokeStyle = "#0066FF";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      
      const x = Math.min(selectionBox.start.x, selectionBox.end.x) * scale;
      const y = Math.min(selectionBox.start.y, selectionBox.end.y) * scale;
      const width = Math.abs(selectionBox.end.x - selectionBox.start.x) * scale;
      const height = Math.abs(selectionBox.end.y - selectionBox.start.y) * scale;
      
      ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = "rgba(0, 102, 255, 0.1)";
      ctx.fillRect(x, y, width, height);
      ctx.restore();
    }
    
    // Draw uniform scaling indicator when shift is pressed during resize
    if (isResizing && isShiftPressed && selectedAnnotations.length === 1) {
      const annotation = selectedAnnotations[0];
      if (annotation.type === "circle") {
        ctx.save();
        
        // Find the center of the circle
        const [p1, p2] = annotation.points;
        const diameterMode = annotation.style.circleDiameterMode as boolean || false;
        
        let centerX, centerY;
        
        if (diameterMode) {
          centerX = (p1.x + p2.x) / 2 * scale;
          centerY = (p1.y + p2.y) / 2 * scale;
        } else {
          centerX = p1.x * scale;
          centerY = p1.y * scale;
        }
        
        // Draw uniform scaling indicator
        ctx.fillStyle = 'rgba(37, 99, 235, 0.3)';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1;
        
        // Draw small "uniform scaling" badge
        const badgeText = "Uniform";
        const textMetrics = ctx.measureText(badgeText);
        const badgeWidth = textMetrics.width + 16;
        const badgeHeight = 24;
        
        ctx.beginPath();
        ctx.roundRect(
          centerX - badgeWidth / 2,
          centerY - badgeHeight / 2,
          badgeWidth,
          badgeHeight,
          4
        );
        ctx.fill();
        ctx.stroke();
        
        // Draw text
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, centerX, centerY);
        
        ctx.restore();
      }
    }
  };

  // Add effect to listen for real-time annotation updates from other users
  // This is now correctly placed after the render function is defined
  useEffect(() => {
    // Function to handle remote annotation updates
    const handleRemoteAnnotationUpdate = (event: CustomEvent) => {
      // Extract details from the event
      const { source, documentId: eventDocId, pageNumber: eventPageNum, forceRender } = event.detail || {};
      
      // Only process if this update is from a remote user (not our own changes)
      // and if it's for our current document and page
      if (source === 'remoteUser' && eventDocId === documentId && eventPageNum === pageNumber) {
        console.log("Received real-time annotation update from another user");
        
        // Force rerender the canvas to show the updated annotations
        render();
        
        // If we're currently editing or have selections, check if they're still valid
        if (editingAnnotation || selectedAnnotations.length > 0) {
          // Get the updated annotations from the store
          const updatedAnnots = store.documents[documentId]?.annotations || [];
          
          // If we're editing a text annotation, check if it still exists
          if (editingAnnotation) {
            const stillExists = updatedAnnots.some(a => a.id === editingAnnotation.id);
            if (!stillExists) {
              // The annotation being edited was deleted by another user
              setIsEditingText(false);
              setTextInputPosition(null);
              setEditingAnnotation(null);
            }
          }
          
          // Update selected annotations if they changed
          if (selectedAnnotations.length > 0) {
            // Filter selected annotations to only include ones that still exist
            const updatedSelections = selectedAnnotations.filter(sel => 
              updatedAnnots.some(a => a.id === sel.id)
            );
            
            // If any were removed, update our selection
            if (updatedSelections.length !== selectedAnnotations.length) {
              setSelectedAnnotations(updatedSelections);
              
              // If all selections were removed, clear any resize/move state
              if (updatedSelections.length === 0) {
                setIsResizing(false);
                setActiveHandle(null);
                setMoveOffset(null);
              }
            } else {
              // Update the selected annotations with their new properties
              const updatedSelObjects = updatedSelections.map(sel => {
                const updated = updatedAnnots.find(a => a.id === sel.id);
                return updated || sel;
              });
              setSelectedAnnotations(updatedSelObjects);
            }
          }
        }
      }
    };

    // Add event listener to document to catch all annotation change events
    document.addEventListener('annotationChanged', 
      handleRemoteAnnotationUpdate as EventListener);
    
    // Clean up the event listener when component unmounts
    return () => {
      document.removeEventListener('annotationChanged', 
        handleRemoteAnnotationUpdate as EventListener);
    };
  }, [documentId, pageNumber, render, editingAnnotation, selectedAnnotations, store.documents]);

  // Update the handleAutoScroll function for smoother behavior
  const handleAutoScroll = useCallback((e: React.MouseEvent) => {
    const scrollContainer = canvasRef.current?.parentElement?.parentElement;
    if (!scrollContainer || !moveOffset) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const { top, right, bottom, left } = containerRect;

    // Calculate distances from edges
    const distanceFromTop = e.clientY - top;
    const distanceFromBottom = bottom - e.clientY;
    const distanceFromLeft = e.clientX - left;
    const distanceFromRight = right - e.clientX;

    // Calculate scroll speeds with smooth acceleration
    const calculateSpeed = (distance: number, currentSpeed: number): number => {
      if (distance > SCROLL_THRESHOLD) return 0;
      
      // Calculate base speed using quadratic easing
      const normalizedDistance = (SCROLL_THRESHOLD - distance) / SCROLL_THRESHOLD;
      const targetSpeed = normalizedDistance * normalizedDistance * MAX_SCROLL_SPEED;
      
      // Apply smooth acceleration/deceleration
      if (targetSpeed > Math.abs(currentSpeed)) {
        // Accelerating
        return currentSpeed + (targetSpeed - Math.abs(currentSpeed)) * ACCELERATION;
      } else {
        // Decelerating
        return targetSpeed;
      }
    };

    // Calculate new speeds with inertia
    const newSpeedY = calculateSpeed(
      Math.min(distanceFromTop, distanceFromBottom),
      scrollSpeedRef.current.y
    ) * (distanceFromTop < distanceFromBottom ? -1 : 1);

    const newSpeedX = calculateSpeed(
      Math.min(distanceFromLeft, distanceFromRight),
      scrollSpeedRef.current.x
    ) * (distanceFromLeft < distanceFromRight ? -1 : 1);

    // Apply minimum speed threshold for smoother movement
    const applyMinSpeed = (speed: number) => {
      if (Math.abs(speed) < MIN_SCROLL_SPEED) return 0;
      return speed;
    };

    // Update scroll speeds with smooth transitions
    scrollSpeedRef.current = {
      x: applyMinSpeed(newSpeedX),
      y: applyMinSpeed(newSpeedY)
    };

    // Start auto-scrolling if not already started
    if (!autoScrollingRef.current && (scrollSpeedRef.current.x !== 0 || scrollSpeedRef.current.y !== 0)) {
      autoScrollingRef.current = true;
      
      const scroll = () => {
        if (!autoScrollingRef.current || !moveOffset) {
          if (scrollAnimationFrameRef.current) {
            cancelAnimationFrame(scrollAnimationFrameRef.current);
            scrollAnimationFrameRef.current = null;
          }
          return;
        }

        // Apply scrolling with smooth transitions
        if (scrollSpeedRef.current.y !== 0) {
          scrollContainer.scrollTop += scrollSpeedRef.current.y;
        }
        if (scrollSpeedRef.current.x !== 0) {
          scrollContainer.scrollLeft += scrollSpeedRef.current.x;
        }

        // Update selected annotations position during scroll
        if (selectedAnnotations.length > 0) {
          const updatedAnnotations = selectedAnnotations.map(annotation => ({
            ...annotation,
            points: annotation.points.map(p => ({
              x: p.x + scrollSpeedRef.current.x / scale,
              y: p.y + scrollSpeedRef.current.y / scale,
            })),
          }));

          // Update store and selection state
          updatedAnnotations.forEach(annotation => {
            store.updateAnnotation(documentId, annotation);
          });
          setSelectedAnnotations(updatedAnnotations);

          // Force render to update visual position
          render();
        }

        // Continue animation
        scrollAnimationFrameRef.current = requestAnimationFrame(scroll);
      };

      scrollAnimationFrameRef.current = requestAnimationFrame(scroll);
    }
  }, [moveOffset, scale, selectedAnnotations, documentId, store]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const point = getCanvasPoint(e);
    
    // Update cursor position for tool indicators
    setCursorPosition(point);
    
    // If drag tool is active, don't perform annotation operations
    if (currentTool === "drag") {
      return;
    }
    
    // Removed text dragging logic from mouse move

    // Handle auto-scrolling during object movement
    if (moveOffset && selectedAnnotations.length > 0) {
      handleAutoScroll(e);
    } else {
      // Stop auto-scrolling if not moving objects
      autoScrollingRef.current = false;
      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
    }

    if (selectionBox) {
      // Update selection box end point
      setSelectionBox((prev) => (prev ? { ...prev, end: point } : null));

      // Find annotations within selection box
      const annotations = documentState.annotations.filter((annotation) => {
        if (annotation.pageNumber !== pageNumber) return false;
        return isAnnotationInSelectionBox(
          annotation,
          selectionBox.start,
          point
        );
      });

      // Update selected annotations
      store.selectAnnotations(annotations);
      return;
    }

    if (currentTool === "select") {
      // Handle circle center mode
      if (isCircleCenterMode && moveOffset && selectedAnnotations.length === 1) {
        const annotation = selectedAnnotations[0];
        if (annotation.type === "circle") {
          const dx = point.x - moveOffset.x;
          const dy = point.y - moveOffset.y;
          
          // Create new points by moving both points by the same offset
          const newPoints = annotation.points.map(p => ({
            x: p.x + dx,
            y: p.y + dy
          }));
          
          // Update the annotation
          const updatedAnnotation = {
            ...annotation,
            points: newPoints
          };
          
          store.updateAnnotation(documentId, updatedAnnotation);
          setSelectedAnnotations([updatedAnnotation]);
          setMoveOffset(point);
          return;
        }
      }
      
      // Handle resizing
      if (isResizing && selectedAnnotations.length === 1) {
        const annotation = selectedAnnotations[0];

        if (!isValidResize(annotation, activeHandle!)) {
          return;
        }

        const newPoints = getResizedPoints(
          annotation.points,
          activeHandle!,
          point,
          e.shiftKey,
          10,
          annotation
        );

        const updatedAnnotation = {
          ...annotation,
          points: newPoints,
        };

        store.updateAnnotation(documentId, updatedAnnotation);
        setSelectedAnnotations([updatedAnnotation]);
        
        // Mark changes as unsaved
        markUnsavedChanges();
        
        render();
        return;
      }

      // Handle moving
      if (moveOffset && selectedAnnotations.length > 0) {
        const dx = point.x - moveOffset.x;
        const dy = point.y - moveOffset.y;

        // Update selected annotations positions
        const updatedAnnotations = selectedAnnotations.map(annotation => {
          // Create a new object with modified points
          return {
            ...annotation,
            points: annotation.points.map(p => ({
              x: p.x + dx,
              y: p.y + dy,
            })),
          };
        });

        // Update store and selection state
        updatedAnnotations.forEach(annotation => {
          store.updateAnnotation(documentId, annotation);
        });
        setSelectedAnnotations(updatedAnnotations);
        setMoveOffset(point);
        
        // Mark changes as unsaved
        markUnsavedChanges();
        
        // Force render for visual feedback
        render();
        dispatchAnnotationChangeEvent("move");
        return;
      }

      // Update cursor based on hover
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Update cursor for selected circles
      if (selectedAnnotations.length === 1 && selectedAnnotations[0].type === "circle") {
        const circleAnnotation = selectedAnnotations[0];
        const handle = getResizeHandleForCircle(point, circleAnnotation);
        
        if (handle) {
          // Show resize cursor based on the handle position
          canvas.style.cursor = getResizeCursor(handle);
          return;
        } else if (isPointInsideCircle(point, circleAnnotation)) {
          // Show move cursor when inside the circle but not on a handle
          canvas.style.cursor = "move";
          return;
        }
      }

      // For other annotations, use the existing code
      if (selectedAnnotations.length === 1) {
        const handle = getResizeHandle(point, selectedAnnotations[0]);
        if (handle) {
          canvas.style.cursor = getResizeCursor(handle);
          return;
        }
      }

      const isOverSelected = selectedAnnotations.some((annotation) =>
        isPointInAnnotation(point, annotation)
      );
      
      // Set the cursor based on hover state - use move only when over annotations
      canvas.style.cursor = isOverSelected ? "move" : "default";
      
      // If not over selected annotations, check if hovering over any annotation
      if (!isOverSelected) {
        const hoverAnnotation = documentState.annotations.find(
          (annotation) =>
            annotation.pageNumber === pageNumber &&
            isPointInAnnotation(point, annotation)
        );
        
        // Use move cursor if hovering over any annotation, otherwise default cursor
        canvas.style.cursor = hoverAnnotation ? "move" : "default";
      }
    } else if (isDrawing) {
      if (currentTool === "freehand") {
        // Use the dedicated freehand drawing handler
        handleFreehandDraw(point);
      } else {
        // For other tools, just update end point while keeping start point fixed
        setCurrentPoints((prev) => [prev[0], { x: point.x, y: point.y }]);
        render();
      }
    } else if (currentTool === "select" as AnnotationType) {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Check for resize handles first when a single annotation is selected
      if (selectedAnnotations.length === 1) {
        const handle = getResizeHandle(point, selectedAnnotations[0]);
        if (handle) {
          canvas.style.cursor = getResizeCursor(handle);
          return;
        }
      }

      // Check if hovering over any selected annotation
      const hoverSelected = selectedAnnotations.some((annotation) =>
        isPointInAnnotation(point, annotation)
      );

      if (hoverSelected) {
        canvas.style.cursor = "move"; // Keep move cursor for draggable annotations
        return;
      }

      // Check if hovering over any annotation
      const hoverAnnotation = documentState.annotations.find(
        (annotation) =>
          annotation.pageNumber === pageNumber &&
          isPointInAnnotation(point, annotation)
      );

      canvas.style.cursor = hoverAnnotation ? "move" : "default"; // Use default cursor when not over any annotation
    }
  };

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;

    // Stop auto-scrolling with smooth deceleration
    if (autoScrollingRef.current) {
      const decelerate = () => {
        scrollSpeedRef.current = {
          x: scrollSpeedRef.current.x * DECELERATION,
          y: scrollSpeedRef.current.y * DECELERATION
        };

        if (Math.abs(scrollSpeedRef.current.x) < 0.1 && Math.abs(scrollSpeedRef.current.y) < 0.1) {
          autoScrollingRef.current = false;
          if (scrollAnimationFrameRef.current) {
            cancelAnimationFrame(scrollAnimationFrameRef.current);
            scrollAnimationFrameRef.current = null;
          }
          return;
        }

        requestAnimationFrame(decelerate);
      };

      decelerate();
    }

    // Handle completion of drawing operations
    if (isDrawing && currentPoints.length > 0) {
      // Create new annotation based on the current tool
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: currentTool as AnnotationType,
        points: currentPoints,
        style: currentStyle,
        pageNumber,
        timestamp: Date.now(),
        userId: "current-user",
        version: 1,
      };

      // Add the annotation to the store
      store.addAnnotation(documentId, newAnnotation);

      // Select the newly created annotation
      store.selectAnnotation(newAnnotation);

      // Dispatch event to notify about the change
      dispatchAnnotationChangeEvent("userDrawing", true); // Dispatch event *after* state changes

      // Mark changes as unsaved
      markUnsavedChanges();
    }

    // Removed text dragging completion logic

    // Reset all movement and drawing states
    setMoveOffset(null);
    setIsResizing(false);
    setActiveHandle(null);
    setSelectionBox(null);
    setIsDrawing(false);
    setCurrentPoints([]);
    lastPointRef.current = null;

    // Force render to ensure clean state
    render();
  }, [isDrawing, currentPoints, currentTool, currentStyle, pageNumber, documentId, store, scale, dispatchAnnotationChangeEvent, render, markUnsavedChanges]); // Removed text dragging dependencies

  const handleMouseLeave = () => {
    if (isDrawing && currentTool === "freehand" && currentPoints.length >= 2) {
      // Save the drawing if we have points
      // For freehand drawings, we just use the raw points since there's no smoothPoints function
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: "freehand",
        points: currentPoints,
        style: currentStyle,
        pageNumber,
        timestamp: Date.now(),
        userId: "current-user",
      };

      store.addAnnotation(documentId, newAnnotation);
    }

    // Clean up all states
    setIsDrawing(false);
    setCurrentPoints([]);
    lastPointRef.current = null;
    setMoveOffset(null);
    setActiveHandle(null);
    setSelectionBox(null);
    setIsResizing(false);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isEditingText) return;
    
    const point = getCanvasPoint(e);
    const annotations = documentState.annotations.filter(
      (a) => a.pageNumber === pageNumber
    );
    
    // Find if user clicked on an existing text or sticky note annotation
    const textAnnotation = annotations.find(
      (a) => 
        (a.type === "text" || a.type === "stickyNote") && 
        isPointInTextAnnotation(point, a, scale)
    );
    
    if (textAnnotation) {
      setEditingAnnotation(textAnnotation);
      setTextInputPosition(textAnnotation.points[0]);
      setIsEditingText(true);
      setStickyNoteScale(textAnnotation.type === "stickyNote" ? 1 : 0);
    }
  };

  const handleTextComplete = (text: string, finalPosition?: Point) => {
    setIsEditingText(false);
    
    // Use the finalPosition if provided (from dragging), otherwise use original position
    const position = finalPosition || textInputPosition;
    let completedAnnotation: Annotation | null = null;
    
    if (editingAnnotation) {
      // Handle editing existing text annotation
      const updatedAnnotation = { 
        ...editingAnnotation,
        text,
        // Update position if the text was moved
        points: finalPosition ? [finalPosition] : editingAnnotation.points,
        style: {
          ...editingAnnotation.style,
          text,
          // Preserve existing textOptions which includes underline setting
          textOptions: {
            ...editingAnnotation.style.textOptions
          }
        },
      };
      store.updateAnnotation(documentId, updatedAnnotation);
      completedAnnotation = updatedAnnotation;
    } else if (position) {
      // Handle creating new text annotation
      const isSticky = stickyNoteScale > 0;
      
      // For regular text, preserve user style. Sticky notes use fixed style.
      const textStyle = isSticky 
        ? { color: '#FFD700', lineWidth: 1, opacity: 1 } // Minimal style - the createStickyNoteAnnotation will replace it
        : { ...currentStyle };
      
      // Create the annotation
      const newAnnotation = isSticky 
        ? createStickyNoteAnnotation(position, text, textStyle, pageNumber, "current-user")
        : createTextAnnotation(position, text, textStyle, pageNumber, "current-user");
        
      // Add it to the store
      store.addAnnotation(documentId, newAnnotation);
      completedAnnotation = newAnnotation;
    }
    
    // Mark changes as unsaved
    markUnsavedChanges();
    
    setTextInputPosition(null);
    setEditingAnnotation(null);
    
    // Select the annotation we just created/edited instead of clearing selection
    if (completedAnnotation) {
      store.selectAnnotations([completedAnnotation]);
    }
    
    // Ensure we're in select mode to make formatting tools available
    store.setCurrentTool("select");
    
    dispatchAnnotationChangeEvent("textComplete");
    setStickyNoteScale(0);
  };

  const handleTextCancel = () => {
    setTextInputPosition(null);
    setIsEditingText(false);
    setEditingAnnotation(null);
  };

  const isAnnotationInSelectionBox = (
    annotation: Annotation,
    start: Point,
    end: Point
  ): boolean => {
    const bounds = getShapeBounds(annotation.points);
    const selectionBounds = {
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x),
      top: Math.min(start.y, end.y),
      bottom: Math.max(start.y, end.y),
    };

    // For text and sticky notes, use center point
    if (annotation.type === "text" || annotation.type === "stickyNote") {
      const center = {
        x: bounds.left + (bounds.right - bounds.left) / 2,
        y: bounds.top + (bounds.bottom - bounds.top) / 2,
      };
      return (
        center.x >= selectionBounds.left &&
        center.x <= selectionBounds.right &&
        center.y >= selectionBounds.top &&
        center.y <= selectionBounds.bottom
      );
    }

    // For stamps, require full containment
    if (annotation.type === "stamp" || annotation.type === "stampApproved" || 
        annotation.type === "stampRejected" || annotation.type === "stampRevision") {
      return (
        bounds.left >= selectionBounds.left &&
        bounds.right <= selectionBounds.right &&
        bounds.top >= selectionBounds.top &&
        bounds.bottom <= selectionBounds.bottom
      );
    }

    // For other shapes, check if any corner is inside the selection box
    // or if the selection box intersects with any edge
    const corners = [
      { x: bounds.left, y: bounds.top },
      { x: bounds.right, y: bounds.top },
      { x: bounds.left, y: bounds.bottom },
      { x: bounds.right, y: bounds.bottom },
    ];

    // Check if any corner is inside selection box
    const anyCornerInside = corners.some(
      (corner) =>
        corner.x >= selectionBounds.left &&
        corner.x <= selectionBounds.right &&
        corner.y >= selectionBounds.top &&
        corner.y <= selectionBounds.bottom
    );

    if (anyCornerInside) return true;

    // Check for intersection with selection box edges
    const edges = [
      [corners[0], corners[1]], // Top
      [corners[1], corners[3]], // Right
      [corners[2], corners[3]], // Bottom
      [corners[0], corners[2]], // Left
    ];

    const selectionEdges = [
      [
        { x: selectionBounds.left, y: selectionBounds.top },
        { x: selectionBounds.right, y: selectionBounds.top },
      ],
      [
        { x: selectionBounds.right, y: selectionBounds.top },
        { x: selectionBounds.right, y: selectionBounds.bottom },
      ],
      [
        { x: selectionBounds.left, y: selectionBounds.bottom },
        { x: selectionBounds.right, y: selectionBounds.bottom },
      ],
      [
        { x: selectionBounds.left, y: selectionBounds.top },
        { x: selectionBounds.left, y: selectionBounds.bottom },
      ],
    ];

    return edges.some((edge) =>
      selectionEdges.some((selEdge) =>
        doLinesIntersect(edge[0], edge[1], selEdge[0], selEdge[1])
      )
    );
  };

  // Helper function to check if two line segments intersect
  const doLinesIntersect = (
    p1: Point,
    p2: Point,
    p3: Point,
    p4: Point
  ): boolean => {
    const denominator =
      (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
    if (denominator === 0) return false;

    const ua =
      ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) /
      denominator;
    const ub =
      ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) /
      denominator;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();

    const point = getCanvasPoint(e);

    // Check if clicking on a selected annotation
    const clickedAnnotation = documentState.annotations.find(
      (annotation) =>
        annotation.pageNumber === pageNumber &&
        isPointInAnnotation(point, annotation)
    );

    if (clickedAnnotation) {
      // If clicking on an unselected annotation, select it
      if (!selectedAnnotations.some((a) => a.id === clickedAnnotation.id)) {
        store.selectAnnotation(clickedAnnotation, e.shiftKey);
      }

      // Show context menu
      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
      });
    } else {
      // Clear selection if clicking outside annotations
      store.clearSelection();
      setContextMenu(null);
    }

    // When deleting annotations from context menu
    const deleteAnnotation = (annotationId: string) => {
      store.deleteAnnotation(documentId, annotationId);
      markUnsavedChanges();
      setContextMenu(null);
      dispatchAnnotationChangeEvent("delete");
    };
  };

  // Effect to handle immediate editing requested from toolbar
  // Effect to handle immediate editing requested from toolbar
  useEffect(() => {
    const annotation = store.annotationToEditImmediately;
    let timeoutId: NodeJS.Timeout | undefined;

    // Ensure annotation exists, canvas is ready, and scale is valid before activating
    if (annotation &&
        (annotation.type === 'text' || annotation.type === 'stickyNote') &&
        canvasRef.current && // Check if canvas ref is available
        scale > 0) { // Check if scale prop is valid (passed from PDFViewer)
      // Use a minimal timeout to allow the current render cycle to complete
      timeoutId = setTimeout(() => {
        setEditingAnnotation(annotation);
        setTextInputPosition(annotation.points[0]); // Position uses annotation's base points
        setIsEditingText(true);
        setStickyNoteScale(annotation.type === 'stickyNote' ? 1 : 0);
        
        // Reset the trigger in the store
        store.setAnnotationToEditImmediately(null);
      }, 10); // Minimal delay (10ms)

    } else if (annotation) {
      // Log if activation was deferred due to readiness checks
    }

    // Cleanup function for the timeout if the component unmounts or dependencies change
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    store.annotationToEditImmediately,
    store.setAnnotationToEditImmediately,
    setEditingAnnotation,
    setTextInputPosition,
    setIsEditingText,
    setStickyNoteScale,
    scale,
    pageNumber // Keep dependencies
  ]);

  // Re-render when scale changes or page changes
  useEffect(() => {
    // Request animation frame for smoother transitions during scale changes
    const animationFrame = requestAnimationFrame(() => {
      render();
    });
    
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [
    scale,
    width,
    height,
    pageNumber,
    documentState.annotations,
    currentPoints,
    selectedAnnotations,
  ]);

  // Update the useEffect for selection state sync
  useEffect(() => {
    setSelectedAnnotations(store.selectedAnnotations);
  }, [store.selectedAnnotations]);

  // Add useEffect to sync local selection with store
  useEffect(() => {
    if (selectedAnnotations.length > 0) {
      store.selectAnnotations(selectedAnnotations);
    }
  }, [selectedAnnotations, store.selectAnnotations]);

  // Reset selection when changing tools
  // useEffect(() => {
  //   if (currentTool !== "select") {
  //     setSelectedAnnotations([]);
  //   }
  // }, [currentTool]);

  // Add paste event handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (onPaste) {
        e.preventDefault();
        onPaste(pageNumber);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [pageNumber, onPaste]);

  // Update the keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Track shift key state for constrained drawing/moving
      if (e.key === "Shift") {
        setIsShiftPressed(true);
      }
      
      // Handle delete/backspace key for selected annotations
      if ((e.key === "Delete" || e.key === "Backspace") && selectedAnnotations.length > 0) {
        e.preventDefault();
        
        // Delete all selected annotations
        selectedAnnotations.forEach(annotation => {
          store.deleteAnnotation(documentId, annotation.id);
        });
        
        // Mark changes as unsaved
        markUnsavedChanges();
        
        // Clear selection and update UI
        store.clearSelection();
        setSelectedAnnotations([]);
        dispatchAnnotationChangeEvent("delete");
      }
      
      // ... rest of the function ...
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Reset shift key state
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.addEventListener("keyup", handleKeyUp);
    };
  }, [documentId, selectedAnnotations, store, markUnsavedChanges]);

  // Add function to detect circle resize handles specifically
  const getResizeHandleForCircle = (point: Point, annotation: Annotation): ResizeHandle => {
    if (annotation.type !== "circle" || annotation.points.length < 2) return null;
    
    const [p1, p2] = annotation.points;
    const diameterMode = annotation.style.circleDiameterMode as boolean || false;
    
    let centerX, centerY, radius;
    
    if (diameterMode) {
      // In diameter mode, center is midpoint between two points
      centerX = (p1.x + p2.x) / 2;
      centerY = (p1.y + p2.y) / 2;
      radius = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
      ) / 2;
    } else {
      // In center-radius mode, first point is center
      centerX = p1.x;
      centerY = p1.y;
      radius = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
      );
    }
    
    // Check if point is near any of the 8 resize handles on the circle perimeter
    const handleSize = 8 / scale;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const handleX = centerX + Math.cos(angle) * radius;
      const handleY = centerY + Math.sin(angle) * radius;
      
      if (
        Math.abs(point.x - handleX) <= handleSize &&
        Math.abs(point.y - handleY) <= handleSize
      ) {
        // Map the angle to the appropriate resize handle type
        if (i === 0) return "right";
        if (i === 1) return "bottomRight";
        if (i === 2) return "bottom";
        if (i === 3) return "bottomLeft";
        if (i === 4) return "left";
        if (i === 5) return "topLeft";
        if (i === 6) return "top";
        if (i === 7) return "topRight";
      }
    }
    
    return null;
  };

  // Clear selected annotations when page changes
  useEffect(() => {
    // Clear any selected annotations when changing pages
    setSelectedAnnotations([]);
    setActiveHandle(null);
    setIsResizing(false);
    setMoveOffset(null);
    // Force a new render
    render();
  }, [pageNumber]);

  // Add the drawFreehand function back
  const drawSmoothFreehand = (ctx: CanvasRenderingContext2D, points: Point[], scale: number, style: any) => {
    if (!points || points.length < 2) return;
    
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    
    // Start the path at the first point
    ctx.beginPath();
    ctx.moveTo(points[0].x * scale, points[0].y * scale);
    
    // Draw lines to all subsequent points
    points.slice(1).forEach(point => {
      ctx.lineTo(point.x * scale, point.y * scale);
    });
    
    // Stroke the path
    ctx.stroke();
    ctx.restore();
  };

  // Add useRef for animation frame
  const animationFrameRef = useRef<number | null>(null);

  // Add useEffect to handle cursor animation
  useEffect(() => {
    // Only set up animation if text or sticky note tools are selected
    if (currentTool === "text" || currentTool === "stickyNote") {
      const animate = () => {
        render();
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      
      animationFrameRef.current = requestAnimationFrame(animate);
      
      // Clean up on unmount or tool change
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [currentTool]);

  // Update cleanup for unmounting
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Final fix for text selection box display
  const drawTextSelectionOutline = (
    ctx: CanvasRenderingContext2D,
    annotation: Annotation,
    scale: number,
    isMultiSelect: boolean = false
  ) => {
    if (annotation.points.length === 0) return;
    const position = annotation.points[0];
    
    ctx.save();
    
    // Use a more visible selection style
    const selectionColor = isMultiSelect ? "#4299e1" : "#3b82f6"; 
    ctx.strokeStyle = selectionColor;
    ctx.lineWidth = 1.5 * scale;
    ctx.setLineDash([4 * scale, 3 * scale]);
    
    // Calculate dimensions based on annotation type
    let width, height;
    
    if (annotation.type === "stickyNote") {
      // Fixed dimensions for sticky notes
      width = 200;
      height = 150;
    } else {
      // For text annotations, calculate based on content
      const text = annotation.text || "";
      const textOptions = annotation.style.textOptions || {};
      const fontSize = textOptions.fontSize || 14;
      
      // Create a temporary canvas to measure text
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      
      if (tempCtx) {
        // Set font for measurement
        let fontStyle = "";
        if (textOptions.bold) fontStyle += "bold ";
        if (textOptions.italic) fontStyle += "italic ";
        tempCtx.font = `${fontStyle}${fontSize}px ${textOptions.fontFamily || "Arial"}`;
        
        // Measure each line to find max width
        const lines = text.split("\n");
        let maxWidth = 0;
        
        for (const line of lines) {
          const metrics = tempCtx.measureText(line);
          maxWidth = Math.max(maxWidth, metrics.width);
        }
        
        // Calculate height based on line count
        const lineHeight = fontSize * 1.2;
        const textHeight = lineHeight * lines.length;
        
        // Add padding - increased padding for larger font sizes
        const paddingX = Math.max(20, fontSize * 0.5);
        const paddingY = Math.max(20, fontSize * 0.5);
        width = Math.max(maxWidth + paddingX * 2, 100);
        height = Math.max(textHeight + paddingY * 2, 40);
        
        // Store the calculated width and height on the annotation for consistency
        annotation.width = width;
        annotation.height = height;
      } else {
        // Fallback if context not available
        width = 120;
        height = 60;
      }
    }
    
    // Draw selection highlight first (subtle background)
    ctx.fillStyle = `${selectionColor}20`; // 12.5% opacity
    ctx.fillRect(
      position.x * scale,
      position.y * scale,
      width * scale,
      height * scale
    );
    
    // Draw selection rectangle outline
    ctx.beginPath();
    ctx.rect(
      position.x * scale,
      position.y * scale,
      width * scale,
      height * scale
    );
    ctx.stroke();
    
    // Draw resize handles if not multiselect
    if (!isMultiSelect) {
      // Draw circular handles at corners
      const handleSize = 8; // Slightly larger handles
      ctx.fillStyle = "white";
      ctx.strokeStyle = selectionColor;
      ctx.lineWidth = 1 * scale;
      ctx.setLineDash([]);
      
      // Corners only for text
      const handlePositions = [
        { x: position.x, y: position.y }, // top-left
        { x: position.x + width, y: position.y }, // top-right
        { x: position.x, y: position.y + height }, // bottom-left
        { x: position.x + width, y: position.y + height }, // bottom-right
      ];
      
      // Draw the handles
      handlePositions.forEach((point) => {
        ctx.beginPath();
        ctx.arc(
          point.x * scale,
          point.y * scale,
          handleSize / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
      });
    }
    
    ctx.restore();
  };

  // Render text annotations directly inside the selection box
  const drawTextAnnotation = (
    ctx: CanvasRenderingContext2D,
    annotation: Annotation,
    scale: number
  ): void => {
    if (annotation.points.length === 0) return;
    
    const position = annotation.points[0];
    const text = annotation.text || "";
    const textOptions = annotation.style.textOptions || {};
    
    // Set up text rendering styles
    ctx.save();
    
    // Calculate the width and height if not already determined
    if (!annotation.width || !annotation.height) {
      // Calculate dimensions based on content
      const fontSize = textOptions.fontSize || 14;
      
      // Create a temporary canvas to measure text
      const tempCanvas = document.createElement("canvas");
      const tempCtx = tempCanvas.getContext("2d");
      
      if (tempCtx) {
        // Set font for measurement
        let fontStyle = "";
        if (textOptions.bold) fontStyle += "bold ";
        if (textOptions.italic) fontStyle += "italic ";
        tempCtx.font = `${fontStyle}${fontSize}px ${textOptions.fontFamily || "Arial"}`;
        
        // Measure each line to find max width
        const lines = text.split("\n");
        let maxWidth = 0;
        
        for (const line of lines) {
          const metrics = tempCtx.measureText(line);
          maxWidth = Math.max(maxWidth, metrics.width);
        }
        
        // Calculate height based on line count
        const lineHeight = fontSize * 1.2;
        const textHeight = Math.max(lineHeight * lines.length, lineHeight); // At least one line height
        
        // Add padding - increased padding for larger font sizes
        const paddingX = Math.max(20, fontSize * 0.5);
        const paddingY = Math.max(20, fontSize * 0.5);
        annotation.width = Math.max(maxWidth + paddingX * 2, 120); // Minimum width even with empty text
        annotation.height = Math.max(textHeight + paddingY * 2, 60); // Minimum height even with empty text
      } else {
        // Fallback dimensions
        annotation.width = 120;
        annotation.height = 60;
      }
    }
    
    // Draw a subtle background for the text box for better readability
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)"; // More opaque for better visibility
    ctx.fillRect(
      position.x * scale,
      position.y * scale,
      annotation.width * scale,
      annotation.height * scale
    );
    
    // Only render text if there's actually content
    if (text) {
      // Font settings
      let fontStyle = '';
      if (textOptions.bold) fontStyle += 'bold ';
      if (textOptions.italic) fontStyle += 'italic ';
      const baseFontSize = textOptions.fontSize || 14;
      const scaledFontSize = baseFontSize * scale; // Scale font size
      const fontFamily = textOptions.fontFamily || 'Arial';
      ctx.font = `${fontStyle}${scaledFontSize}px ${fontFamily}`; // Use scaled font size
      
      // Calculate text dimensions
      const lines = text.split('\n');
      const scaledLineHeight = scaledFontSize * 1.2; // Use scaled font size for line height
      
      // Color settings
      ctx.fillStyle = annotation.style.color || '#000000';
      ctx.textBaseline = 'top';
      
      // Position inside the bounding box with padding
      const paddingX = Math.max(8, baseFontSize * 0.3) * scale;
      const paddingY = Math.max(8, baseFontSize * 0.3) * scale;
      const textX = position.x * scale + paddingX;
      const textY = position.y * scale + paddingY;
      
      // Available width for text wrapping (accounting for padding on both sides)
      const availableWidth = (annotation.width * scale) - (paddingX * 2);
      
      // Track rendered lines and their positions for underline
      const renderedLineInfo: {text: string, x: number, y: number}[] = [];
      
      // Render each line of text with word wrapping for very long lines
      let yOffset = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if the line needs wrapping
        const lineWidth = ctx.measureText(line).width;
        if (lineWidth <= availableWidth) {
          // Line fits, draw it normally
          ctx.fillText(line, textX, textY + yOffset);
          renderedLineInfo.push({text: line, x: textX, y: textY + yOffset});
          yOffset += scaledLineHeight;
        } else {
          // Line needs wrapping
          const words = line.split(' ');
          let currentLine = '';
          
          for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const testWidth = ctx.measureText(testLine).width;
            
            if (testWidth <= availableWidth) {
              currentLine = testLine;
            } else {
              // Draw the current line and move to next line
              if (currentLine) {
                ctx.fillText(currentLine, textX, textY + yOffset);
                renderedLineInfo.push({text: currentLine, x: textX, y: textY + yOffset});
                yOffset += scaledLineHeight;
                currentLine = word;
              } else {
                // If a single word is too long, just draw it anyway
                ctx.fillText(word, textX, textY + yOffset);
                renderedLineInfo.push({text: word, x: textX, y: textY + yOffset});
                yOffset += scaledLineHeight;
                currentLine = '';
              }
            }
          }
          
          // Draw any remaining text
          if (currentLine) {
            ctx.fillText(currentLine, textX, textY + yOffset);
            renderedLineInfo.push({text: currentLine, x: textX, y: textY + yOffset});
            yOffset += scaledLineHeight;
          }
        }
      }
      
      // Add underline if specified in textOptions
      if (textOptions.underline) {
        ctx.strokeStyle = annotation.style.color || '#000000';
        ctx.lineWidth = Math.max(1, scaledFontSize * 0.05);
        
        for (const line of renderedLineInfo) {
          const metrics = ctx.measureText(line.text);
          ctx.beginPath();
          // Position the line slightly below the text baseline
          const underlineY = line.y + scaledFontSize + 1;
          ctx.moveTo(line.x, underlineY);
          ctx.lineTo(line.x + metrics.width, underlineY);
          ctx.stroke();
        }
      }
    } else {
      // For empty text, draw a subtle placeholder or cursor indicator
      const paddingY = Math.max(8, (textOptions.fontSize || 14) * 0.3) * scale;
      const textY = position.y * scale + paddingY;
      const paddingX = Math.max(8, (textOptions.fontSize || 14) * 0.3) * scale;
      const textX = position.x * scale + paddingX;
      
      // Draw a subtle cursor indicator for empty text
      ctx.strokeStyle = "#888888";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(textX, textY);
      ctx.lineTo(textX, textY + 16 * scale); // Draw cursor indicator
      ctx.stroke();
    }
    
    ctx.restore();
  };

  // Render sticky note annotations with better positioning
  const drawStickyNoteAnnotation = (
    ctx: CanvasRenderingContext2D,
    annotation: Annotation,
    scale: number
  ): void => {
    if (!annotation.text || annotation.points.length === 0) return;
    
    const position = annotation.points[0];
    const text = annotation.text;
    
    ctx.save();
    
    // Sticky note background
    const width = 200 * scale;
    const height = 150 * scale;
    const x = position.x * scale;
    const y = position.y * scale;
    
    // Draw yellow background
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(x, y, width, height);
    
    // Draw the folded corner
    ctx.beginPath();
    ctx.moveTo(x + width - 20 * scale, y);
    ctx.lineTo(x + width, y + 20 * scale);
    ctx.lineTo(x + width, y);
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.1)";
    ctx.fill();
    
    // Draw text content
    ctx.fillStyle = "#000000";
    // Font settings for sticky note
    const textOptions = annotation.style.textOptions || {};
    let fontStyle = '';
    if (textOptions.bold) fontStyle += 'bold ';
    if (textOptions.italic) fontStyle += 'italic ';
    const baseFontSize = textOptions.fontSize || 12; // Default sticky note font size
    const scaledFontSize = baseFontSize * scale; // Scale font size
    const fontFamily = textOptions.fontFamily || 'Arial';
    ctx.font = `${fontStyle}${scaledFontSize}px ${fontFamily}`; // Use scaled font size (set before measurement)
    ctx.textBaseline = 'top';
    
    // Split text into lines and render with padding
    const lines = text.split('\n');
    const scaledLineHeight = scaledFontSize * 1.2; // Scaled line height based on scaled font
    const padding = 10 * scale;
    
    // Apply text wrapping for sticky notes
    const maxWidth = width - (padding * 2);
    let renderedLines: string[] = [];
    
    for (const line of lines) {
      if (line.length === 0) {
        renderedLines.push('');
        continue;
      }
      
      let testWidth = ctx.measureText(line).width;
      if (testWidth <= maxWidth) {
        renderedLines.push(line);
        continue;
      }
      
      // Need to wrap this line
      let words = line.split(' ');
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        testWidth = ctx.measureText(testLine).width;
        
        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          renderedLines.push(currentLine);
          currentLine = word;
        }
      }
      
      if (currentLine) {
        renderedLines.push(currentLine);
      }
    }
    
    // Track rendered line positions for underline
    const renderedLineInfo: {text: string, x: number, y: number}[] = [];
    
    // Render each line
    for (let i = 0; i < renderedLines.length; i++) {
      const lineX = x + padding;
      const lineY = y + padding + (i * scaledLineHeight);
      
      ctx.fillText(
        renderedLines[i],
        lineX,
        lineY
      );
      
      renderedLineInfo.push({
        text: renderedLines[i],
        x: lineX,
        y: lineY
      });
    }
    
    // Add underline if specified in textOptions
    if (textOptions.underline) {
      ctx.strokeStyle = "#000000"; // Always black for sticky notes
      ctx.lineWidth = Math.max(1, scaledFontSize * 0.05);
      
      for (const line of renderedLineInfo) {
        const metrics = ctx.measureText(line.text);
        ctx.beginPath();
        // Position the line slightly below the text baseline
        const underlineY = line.y + scaledFontSize + 1;
        ctx.moveTo(line.x, underlineY);
        ctx.lineTo(line.x + metrics.width, underlineY);
        ctx.stroke();
      }
    }
    
    ctx.restore();
  };

  // Add effect to listen for scroll events
  useEffect(() => {
    const scrollContainer = canvasRef.current?.parentElement?.parentElement;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const newScrollLeft = scrollContainer.scrollLeft;
      const newScrollTop = scrollContainer.scrollTop;
      
      // Update last scroll position for drawing calculations
      lastScrollPosition.current = { left: newScrollLeft, top: newScrollTop };
      
      // Update state to trigger re-render
      setScrollPosition({ left: newScrollLeft, top: newScrollTop });
      
      // If currently drawing, force re-render to ensure drawing follows cursor
      if (isDrawing) {
        render();
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [isDrawing]);

  // Add effect to handle scrolling during drawing
  useEffect(() => {
    const scrollContainer = canvasRef.current?.parentElement?.parentElement;
    if (!scrollContainer) return;
    
    // Function to prevent scrolling during active drawing
    const preventScroll = (e: WheelEvent) => {
      if (isDrawing && currentTool === 'freehand') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    // Add wheel event listener with passive: false to allow preventDefault
    scrollContainer.addEventListener('wheel', preventScroll, { passive: false });
    
    return () => {
      scrollContainer.removeEventListener('wheel', preventScroll);
    };
  }, [isDrawing, currentTool]);

  // Enhance mouseDown to record initial scroll position
  const handleMouseDownEnhanced = (e: React.MouseEvent) => {
    // Initialize scroll position when drawing starts
    const scrollContainer = canvasRef.current?.parentElement?.parentElement;
    if (scrollContainer) {
      lastScrollPosition.current = {
        left: scrollContainer.scrollLeft,
        top: scrollContainer.scrollTop
      };
    }
    
    // Call the original handler
    handleMouseDown(e);
  };

  // Add cleanup for animation frame
  useEffect(() => {
    return () => {
      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
    };
  }, []);

  // Function to save annotations to Firebase
  const saveAnnotations = useCallback(() => {
    if (!hasUnsavedChanges) return;
    
    setIsSaving(true);
    setSaveSuccess(false);
    
    try {
      // Save to Firebase
      store.saveToFirebase(documentId)
        .then(() => {
          // Show success state
          setIsSaving(false);
          setSaveSuccess(true);
          setHasUnsavedChanges(false); // Clear unsaved changes flag
          
          // Hide button after success message shown
          setTimeout(() => {
            setSaveSuccess(false);
            setShowSaveButton(false);
          }, 1500);
          
          // Dispatch events
          dispatchAnnotationChangeEvent("save", true);
          
          // Optional success event
          const saveSuccessEvent = new CustomEvent("annotationSaved", {
            detail: {
              success: true,
              documentId,
              timestamp: Date.now(),
            },
          });
          document.dispatchEvent(saveSuccessEvent);
        })
        .catch((error) => {
          console.error("Error saving annotations:", error);
          setIsSaving(false);
          
          // Optional error event
          const saveErrorEvent = new CustomEvent("annotationSaved", {
            detail: {
              success: false,
              error,
              documentId,
              timestamp: Date.now(),
            },
          });
          document.dispatchEvent(saveErrorEvent);
        });
    } catch (error) {
      console.error("Error initiating save:", error);
      setIsSaving(false);
    }
  }, [documentId, dispatchAnnotationChangeEvent, store, hasUnsavedChanges]);
  
  // Autosave functionality
  const autosave = useCallback(() => {
    if (!hasUnsavedChanges || isSaving) return;
    
    setIsAutosaving(true);
    
    try {
      // Save to Firebase
      store.saveToFirebase(documentId)
        .then(() => {
          setIsAutosaving(false);
          setHasUnsavedChanges(false);
          
          // Dispatch events
          dispatchAnnotationChangeEvent("autosave", true);
        })
        .catch((error) => {
          console.error("Error autosaving annotations:", error);
          setIsAutosaving(false);
          // Leave hasUnsavedChanges true so user can try manual save
        });
    } catch (error) {
      console.error("Error initiating autosave:", error);
      setIsAutosaving(false);
    }
  }, [documentId, dispatchAnnotationChangeEvent, store, hasUnsavedChanges, isSaving]);
  
  // Debounced autosave effect - triggers autosave after delay when changes are made
  useEffect(() => {
    if (hasUnsavedChanges && !isSaving && !isAutosaving) {
      const timer = setTimeout(() => {
        autosave();
      }, AUTOSAVE_DELAY);
      
      return () => clearTimeout(timer);
    }
  }, [hasUnsavedChanges, isSaving, isAutosaving, autosave]);
  
  // Show save button when annotations change and reset autosave timer
  useEffect(() => {
    const annotations = documentState.annotations.filter(
      (a) => a.pageNumber === pageNumber
    );
    
    if (annotations.length > 0) {
      markUnsavedChanges();
    }
  }, [documentState.annotations, pageNumber, markUnsavedChanges]);

  // Add a ref to track previous tool to prevent duplicate text annotations
  const prevToolRef = useRef<string | null>(null);

  // Add effect to create centered text annotation when text tool is selected
  useEffect(() => {
    // Only create text annotation when the text tool is newly selected
    // (not when it was already selected or when switching from one to the other)
    if ((currentTool === "text" || currentTool === "stickyNote") && 
        prevToolRef.current !== "text" && 
        prevToolRef.current !== "stickyNote") {
      
      const isSticky = currentTool === "stickyNote";
      const defaultText = "";
      
      // Calculate center of the visible canvas
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      // Get canvas dimensions
      const canvasRect = canvas.getBoundingClientRect();
      const canvasCenterX = canvasRect.width / 2;
      const canvasCenterY = canvasRect.height / 2;
      
      // Convert to PDF coordinates
      const centerX = canvasCenterX / scale;
      const centerY = canvasCenterY / scale;
      
      // Define dimensions for the annotation
      const defaultWidth = isSticky ? 200 : 120;
      const defaultHeight = isSticky ? 150 : 40;
      
      // Calculate a position that will center the annotation
      const centerPos = {
        x: centerX - defaultWidth / 2,
        y: centerY - defaultHeight / 2
      };
      
      // Create annotation
      const newAnnotation: Annotation = {
        id: Date.now().toString(),
        type: currentTool as AnnotationType,
        points: [centerPos],
        text: defaultText,
        style: {
          ...currentStyle,
          text: defaultText,
          textOptions: currentStyle.textOptions || { fontSize: 14, fontFamily: 'Arial' },
          ...(isSticky && { color: '#000000', backgroundColor: '#FFD700' })
        },
        pageNumber,
        timestamp: Date.now(),
        userId: "current-user",
        version: 1,
        width: defaultWidth,
        height: defaultHeight,
      };
      
      // Add to store
      store.addAnnotation(documentId, newAnnotation);
      
      // Start editing
      setEditingAnnotation(newAnnotation);
      setTextInputPosition(centerPos);
      setIsEditingText(true);
      setStickyNoteScale(isSticky ? 1 : 0);
      
      // Switch to select tool so we don't create additional text boxes when clicking
      store.setCurrentTool("select");
      
      // Notify about the change
      dispatchAnnotationChangeEvent("textCreate", true);
    }
    
    // Update the previous tool reference
    prevToolRef.current = currentTool;
  }, [currentTool, scale, currentStyle, documentId, pageNumber, dispatchAnnotationChangeEvent]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 z-10"
        onMouseDown={handleMouseDownEnhanced}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={{
          cursor: getCursor(
            currentTool,
            isResizing,
            activeHandle,
            !!moveOffset
          ),
          width: `${width}px`,
          height: `${height}px`,
        }}
      />
      {isEditingText && textInputPosition && (
        <TextInput
          ref={textInputRef} // Pass the ref here
          position={textInputPosition}
          onComplete={handleTextComplete}
          onCancel={handleTextCancel}
          scale={scale}
          isSticky={editingAnnotation?.type === "stickyNote"} // Use editingAnnotation directly
          initialText={editingAnnotation?.text} // Use .text directly
          initialWidth={editingAnnotation?.width} // Pass initial size
          initialHeight={editingAnnotation?.height} // Pass initial size
          textOptions={editingAnnotation?.style.textOptions} // Pass text options
        />
      )}
      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}
      {/* Show save button or autosave indicator */}
      {(showSaveButton && hasUnsavedChanges) || isAutosaving || saveSuccess ? (
        <button
          className={`fixed top-100 right-20 z-50 font-medium py-2 px-4 rounded-md shadow-md transition-all duration-200 flex items-center
            ${isSaving || isAutosaving
              ? 'bg-gray-500 cursor-wait' 
              : saveSuccess 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-indigo-600 hover:bg-indigo-700'
            } text-white`}
          onClick={saveAnnotations}
          disabled={isSaving || isAutosaving || saveSuccess}
          aria-label={isSaving ? "Saving annotations" : isAutosaving ? "Autosaving annotations" : saveSuccess ? "Annotations saved" : "Save annotations"}
          title={isSaving ? "Saving annotations to cloud" : isAutosaving ? "Autosaving annotations to cloud" : saveSuccess ? "Annotations saved to cloud" : "Save annotations to cloud (Autosave enabled)"}
        >
          {isSaving || isAutosaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {isSaving ? "Saving..." : "Autosaving..."}
            </>
          ) : saveSuccess ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Saved!
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7.707 10.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V6h5a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2h5v5.586l-1.293-1.293z" />
              </svg>
              Save Now
            </>
          )}
        </button>
      ) : null}
    </>
  );
};

// Helper function to determine cursor style
const getCursor = (
  tool: string,
  isResizing: boolean,
  activeHandle: ResizeHandle | null,
  isMoving: boolean
): string => {
  if (isMoving) return "move";
  if (isResizing && activeHandle) {
    return getResizeCursor(activeHandle);
  }

  switch (tool) {
    case "select":
      return "default";
    case "drag":
      return "grab";
    case "freehand":
      return "crosshair";
    case "text":
      return "text";
    case "stickyNote":
      return "cell";
    default:
      return "crosshair";
  }
};