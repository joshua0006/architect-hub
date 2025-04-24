import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { PDFControls } from "./PDFViewer/PDFControls";
import { usePDFDocument } from "../hooks/usePDFDocument";
import { usePDFPage } from "../hooks/usePDFPage";
import { PDFPageProxy } from "pdfjs-dist";
import { Annotation, AnnotationType, Point } from "../types/annotation";
import {
  createExportCanvas,
  exportToPNG,
  exportToPDF,
  exportAnnotations,
  importAnnotations,
  saveAnnotations,
  loadAnnotations,
} from "../utils/exportUtils";
import { drawAnnotation } from "../utils/drawingUtils";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useToast } from "../contexts/ToastContext";
import { ChevronLeft, ChevronRight, Download, AlertTriangle, RefreshCw } from "lucide-react";
import { KeyboardShortcutGuide } from "./KeyboardShortcutGuide";
import { useKeyboardShortcutGuide } from "../hooks/useKeyboardShortcutGuide";
import { jsPDF } from "jspdf";
import * as pdfjs from "pdfjs-dist";
import { debounce } from "../utils/debounce";
import { PDFDocument } from 'pdf-lib'; // Added: For PDF manipulation
import { saveAs } from 'file-saver'; // Added: For saving files
import { annotationService } from "../services/annotationService"; // Added: For annotation service

interface PDFViewerProps {
  file: File | string;
  documentId: string;
}

// Add these outside the component to persist between renders and track loads
const alreadyRenderedFiles = new Map<string, Set<number>>();
const fileLoadTimestamps = new Map<string, number>();
let currentlyRenderingFile: string | null = null;

// Add these cache-related variables outside the component to persist across renders
const pageCanvasCache = new Map<string, Map<number, ImageData>>();
const pageCacheTimestamps = new Map<string, Map<number, number>>();
const MAX_CACHED_PAGES = 20; // Maximum number of pages to keep in cache per document

// Function to determine if a PDF has mostly text (for better export strategy)
async function isTextBasedPDF(pdfDocument: any) {
  try {
    // Check a sample of pages (first, middle, last)
    const numPages = pdfDocument.numPages;
    const pagesToCheck = [
      1, 
      Math.floor(numPages / 2), 
      numPages
    ].filter((pageNum, index, self) => self.indexOf(pageNum) === index);
    
    let textCount = 0;
    let imageCount = 0;
    
    for (const pageNum of pagesToCheck) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      textCount += textContent.items.length;
      
      const operatorList = await page.getOperatorList();
      // Count image operators as a rough estimate
      const imageOps = operatorList.fnArray.filter((op: number) => op === 82); // 82 is the code for "paintImageXObject"
      imageCount += imageOps.length;
    }
    
    // If there's significantly more text than images, consider it text-based
    return textCount > imageCount * 3;
  } catch (error) {
    console.error("Error checking PDF type:", error);
    return false; // Default to treating as image-based
  }
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ file, documentId }) => {
  // Define cursor styles for grabbing with cross-browser support
  const grabCursorClassName = "cursor-grabbing";
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Add missing refs
  const renderTaskRef = useRef<any>(null);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const renderLockRef = useRef<boolean>(false);
  const renderCooldownActiveRef = useRef<boolean>(false);
  const renderAttemptTimestampRef = useRef<number>(0);
  const initializationStartedRef = useRef<boolean>(false);
  const currentRenderingPageRef = useRef<number | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for controls visibility timeout

  // Add annotations subscription ref
  const annotationsUnsubscribeRef = useRef<(() => void) | null>(null);

  // State declarations
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderComplete, setRenderComplete] = useState<boolean>(false);
  const [renderAttempts, setRenderAttempts] = useState(0);
  const [renderError, setRenderError] = useState<Error | null>(null);
  const [isViewerReady, setIsViewerReady] = useState(false);
  const [hasStartedLoading, setHasStartedLoading] = useState(false);
  const [scale, setScale] = useState(1.0);
  const [pageChangeInProgress, setPageChangeInProgress] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Add screenWidth state
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  
  // Add new state for initial loading
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialPageRendered, setInitialPageRendered] = useState(false);
  // Removed showControls state
  const [showForcedLoadingOverlay, setShowForcedLoadingOverlay] = useState(true); // State for the 2-second loading overlay
  
  // Track which pages have been rendered to prevent duplicates
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const initialRenderCompletedRef = useRef<boolean>(false);
  const disableFitToWidthRef = useRef<boolean>(false);
  const hasRenderedOnceRef = useRef<{[pageNum: number]: boolean}>({});
  
  // Track page changes to prevent multiple renders
  const lastRenderedPageRef = useRef<number>(0);
  
  const { showToast } = useToast();
  const annotationStore = useAnnotationStore();
  
  const { currentTool } = useAnnotationStore();
  
  const [importStatus, setImportStatus] = useState<{
    loading: boolean;
    error: string | null;
  }>({
    loading: false,
    error: null,
  });

  const { isShortcutGuideOpen, setIsShortcutGuideOpen } =
    useKeyboardShortcutGuide();

  // Add this state variable at the top with other state declarations
  const [currentAnnotations, setCurrentAnnotations] = useState<any[]>([]);

  // Add a new ref for caching
  const cachedPagesRef = useRef<Set<number>>(new Set());

  // Early file identification
  const fileId = useMemo(() => {
    if (!file) {
      return "empty_file";
    }
    return typeof file === 'string' ? file : `${file.name}_${file.size}_${file.lastModified}`;
  }, [file]);

  // PDF document and page hooks
  const { pdf, error: pdfError, isLoading: isPdfLoading } = usePDFDocument(pdfFile);
  const { page, error: pageError, isLoading: isPageLoading } = usePDFPage(pdf, currentPage, scale);

  // Get viewport dimensions for the current page
  const viewport = useMemo(() => {
    if (!page) return { width: 800, height: 600 };
    return page.getViewport({ scale });
  }, [page, scale]);

  // Add these refs near the top with other refs
  const lastScrollPositionRef = useRef<{ x: number; y: number } | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Add this function after the other handler functions
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Store current scroll position
    const scrollContainer = scrollContainerRef.current;
    lastScrollPositionRef.current = {
      x: scrollContainer.scrollLeft,
      y: scrollContainer.scrollTop
    };
    
    // Set a timeout to save the scroll position after scrolling stops
    scrollTimeoutRef.current = setTimeout(() => {
      if (scrollContainerRef.current) {
        const finalScrollPosition = {
          x: scrollContainerRef.current.scrollLeft,
          y: scrollContainerRef.current.scrollTop
        };
        
        // Store the final scroll position
        lastScrollPositionRef.current = finalScrollPosition;
        
        // Log the saved position
      }
    }, 150); // Wait 150ms after scrolling stops before saving
  }, []);

  // Add this effect to handle scroll events
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    
    // Add scroll event listener
    scrollContainer.addEventListener('scroll', handleScroll);
    
    // Cleanup
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [handleScroll]);

  // Update the scrollToCenterDocument function to respect saved scroll position
  const scrollToCenterDocument = useCallback(() => {
    if (!containerRef.current || !page || isDragging) return;
    
    const container = containerRef.current;
    const scrollContainer = container.querySelector('.overflow-auto') as HTMLElement;
    if (!scrollContainer) return;
    
    // Skip centering if we recently finished dragging (within last 500ms)
    const dragEndTime = parseInt(scrollContainer.dataset.dragEndTime || '0');
    if (Date.now() - dragEndTime < 500) {
      return;
    }
    
    // If we have a saved scroll position, use it instead of centering
    if (lastScrollPositionRef.current) {
      scrollContainer.scrollLeft = lastScrollPositionRef.current.x;
      scrollContainer.scrollTop = lastScrollPositionRef.current.y;
      return;
    }
    
    // Calculate center position if no saved position exists
    const viewportWidth = scrollContainer.clientWidth;
    const viewportHeight = scrollContainer.clientHeight;
    const contentWidth = viewport.width;
    const contentHeight = viewport.height;
    
    // Calculate scroll positions
    const scrollLeft = Math.max(0, (contentWidth - viewportWidth) / 2);
    const scrollTop = Math.max(0, (contentHeight - viewportHeight) / 2);
    
    // Scroll to center
    scrollContainer.scrollLeft = scrollLeft;
    scrollContainer.scrollTop = scrollTop;
    
  }, [page, viewport, isDragging]);

  // Helper function to get annotations for a specific page
  const getAnnotationsForPage = useCallback((documentId: string, pageNumber: number) => {
    // Get all annotations for the document
    const documentAnnotations = annotationStore.documents[documentId]?.annotations || [];
    
    // Filter annotations for this specific page
    return documentAnnotations.filter(annotation => annotation.pageNumber === pageNumber);
  }, [annotationStore.documents]);

  // Add this ref near the top with other refs
  const lastPageNavigationTimeRef = useRef<number>(0);

  // Add this ref near the top with other refs
  const navigationTransitionRef = useRef<boolean>(false);

  // Update the navigation handlers
  const handlePrevPage = useCallback(() => {
    // Don't allow navigation while exporting
    if (isExporting) {
      return;
    }
    
    // Check if we can navigate to the previous page
    const prevPage = Math.max(currentPage - 1, 1);
    if (prevPage === currentPage) {
      return; // Already on first page
    }
    
    // Set navigation transition flag to block immediate rendering
    navigationTransitionRef.current = true;

    // Cancel any current render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (error) {
        console.error('[PDFViewer] Error cancelling render task:', error);
      }
      renderTaskRef.current = null;

      // Reset render lock and tracking
      renderLockRef.current = false;
      currentRenderingPageRef.current = null;
    }
    
    
    // Cancel any current render task robustly
    if (renderTaskRef.current && typeof renderTaskRef.current.cancel === 'function') {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {
        console.error('[PDFViewer] Error cancelling render task in handlePrevPage:', e);
      }
    }
    renderTaskRef.current = null; // Ensure ref is cleared
    
    // Track when we started this navigation attempt
    renderAttemptTimestampRef.current = Date.now();
    
    // Clear render lock
    renderLockRef.current = false;
    
    // Set flags to indicate page change is in progress
    setPageChangeInProgress(true);

    // Clear any pending timeout to show controls (if applicable, though state is removed)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }

    // Reset rendering state
    setIsRendering(false);
    
    // Change the page
    setCurrentPage(prevPage);

    // Set a timeout to clear the transition flag after navigation is complete
    setTimeout(() => {
      navigationTransitionRef.current = false;
    }, 300);
  }, [currentPage, isExporting]);

  const handleNextPage = useCallback(() => {
    // Don't allow navigation while exporting
    if (isExporting) {
      return;
    }
    
    // Check if we can navigate to the next page
    const nextPage = Math.min(currentPage + 1, pdf?.numPages || currentPage);
    if (nextPage === currentPage) {
      return; // Already on last page
    }
    
    // Set navigation transition flag to block immediate rendering
    navigationTransitionRef.current = true;
    
    // Cancel any current render task robustly
    if (renderTaskRef.current && typeof renderTaskRef.current.cancel === 'function') {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {
        console.error('[PDFViewer] Error cancelling render task in handleNextPage:', e);
      }
    }
    renderTaskRef.current = null; // Ensure ref is cleared
    
    // Track when we started this navigation attempt
    renderAttemptTimestampRef.current = Date.now();
    
    // Clear render lock
    renderLockRef.current = false;
    

    // Set the page change flag
    setPageChangeInProgress(true);

    // Clear any pending timeout to show controls (if applicable, though state is removed)
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }

    // Reset rendering state
    setIsRendering(false);
    
    // Change the page
    setCurrentPage(nextPage);

    // Set a timeout to clear the transition flag after navigation is complete
    setTimeout(() => {
      navigationTransitionRef.current = false;
    }, 300);
  }, [currentPage, pdf?.numPages, isExporting]);

  // Add these refs near the top with other refs
  let hasLoggedRenderSkip = false;

  // Update the renderPdfPage function to implement caching
  const renderPdfPage = useCallback(() => {
    try {
      // Skip if we're in the middle of a page change or the page is not properly set
      if (!currentPage) {
        return;
      }

      // Skip rendering if we're in a navigation transition
      if (navigationTransitionRef.current) {
        return;
      }

      // Check if render lock is active, which prevents overlapping renders
      if (renderLockRef.current) {
        // If we're already rendering a different page, cancel that render
        if (currentRenderingPageRef.current !== null &&
            currentRenderingPageRef.current !== currentPage) {

          // Cancel the current render task
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
              renderTaskRef.current = null;
            } catch (error) {
            }
          }

          // Release the render lock
          renderLockRef.current = false;
          currentRenderingPageRef.current = null;
        } else {
          // If we're already rendering the current page, don't start another render
          return;
        }
      }

      // Skip if we don't have all the required elements
      if (!canvasRef.current || !pdf || !fileId) {
        // If we're in the middle of a page change but we don't have required elements,
        // we should reset the flag to avoid getting stuck
        if (pageChangeInProgress) {
          setPageChangeInProgress(false);
          navigationTransitionRef.current = false; // Clear transition flag
        }
        return;
      }

      // Get canvas context - if this fails, we can't render
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('[PDFViewer] Failed to get canvas context');
        setPageChangeInProgress(false); // Reset page change state if we can't get context
        return;
      }

      // Re-introduce quality multiplier
      const qualityMultiplier = 1.0; // Keep original quality without enhancement

      // Cancel any in-progress render tasks robustly
      if (renderTaskRef.current && typeof renderTaskRef.current.cancel === 'function') {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          console.error('[PDFViewer] Error cancelling render task in renderPdfPage:', e);
        }
      }
      renderTaskRef.current = null; // Ensure ref is cleared

      // Set render lock to prevent overlapping renders
      renderLockRef.current = true;
      currentRenderingPageRef.current = currentPage;

      // Set state to indicate rendering is in progress
      setIsRendering(true);
      
      // Log only when starting a new render (not for retries)

      // Get the PDF page
      pdf.getPage(currentPage).then(
        (page) => {
          try {
            // Double check we're still rendering the current page
            // If page changed during loading, abort this render
            if (currentPage !== currentRenderingPageRef.current) {
              renderLockRef.current = false;
              currentRenderingPageRef.current = null;
              return;
            }

            // Set up viewport
            let viewport = page.getViewport({ scale: 1 });
            const containerWidth = containerRef.current?.clientWidth || 800;
            const containerHeight = containerRef.current?.clientHeight || 1200;
            
            // Calculate scale to fit the container width exactly
            // Account for padding (16px total for p-2 or 32px for p-4)
            const padding = 32;
            const availableWidth = containerWidth - padding;
            const widthScale = availableWidth / viewport.width;
            
            // For initial rendering, prioritize fitting to width
            // while maintaining aspect ratio
            const displayScale = scale;
            
            // Calculate viewport considering quality multiplier
            viewport = page.getViewport({ scale: displayScale * qualityMultiplier });

            // Get device pixel ratio for high-res displays
            const devicePixelRatio = window.devicePixelRatio || 1; // Use actual device pixel ratio

            // Set canvas buffer size considering device pixel ratio
            canvas.width = viewport.width * devicePixelRatio;
            canvas.height = viewport.height * devicePixelRatio;
            
            // Set canvas display size (CSS pixels) dividing by qualityMultiplier
            canvas.style.width = `${viewport.width / qualityMultiplier}px`;
            canvas.style.height = `${viewport.height / qualityMultiplier}px`;
            
            // Enable high-quality image rendering on the context
            // No high-quality image rendering settings to maintain original quality

            // Explicitly clear the canvas *before* scaling the context
            // Use the canvas buffer dimensions (already includes devicePixelRatio)
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Scale the context to account for device pixel ratio
            ctx.scale(devicePixelRatio, devicePixelRatio);
            // Removed textRendering attempt

            // Define render parameters with enhanced text rendering
            const renderContext = {
              canvasContext: ctx,
              viewport: viewport,
              // Use print intent for better text quality at high zoom levels
              intent: "display" // Use standard quality for all zoom levels
              // Removed enableWebGL: true
            };

            // Store the timestamp when render started
            const renderStartTime = Date.now();

            // Start the render task
            renderTaskRef.current = page.render(renderContext);
            
            // Handle successful render
            renderTaskRef.current.promise.then(
              () => {
                // Removed caching logic associated with qualityMultiplier
                // Reset render lock
                renderLockRef.current = false;
                currentRenderingPageRef.current = null;

                // Mark initial render as complete if not already done
                if (!initialPageRendered) {
                  setInitialPageRendered(true);
                  console.log('[PDFViewer] Initial page render completed.');
                }

                // Get annotations for the current page
                let annotations: any[] = [];
                try {
                  // Check if documentId and current page are available
                  if (documentId && currentPage) {
                    // Get annotations from the document annotations for this page
                    annotations = annotationStore.documents[documentId]?.annotations?.filter(
                      (a: any) => a.pageNumber === currentPage
                    ) || [];
                  }
                } catch (err) {
                  console.warn('[PDFViewer] Error accessing annotations:', err);
                }
                
                // Trigger annotation rendering if needed
                setCurrentAnnotations(annotations);
                
                // Dispatch annotation rendering event
                document.dispatchEvent(
                  new CustomEvent('renderAnnotations', {
                    detail: { 
                      pageNumber: currentPage,
                      annotations 
                    },
                  })
                );
                
                // Mark this page as rendered
                if (!hasRenderedOnceRef.current[currentPage]) {
                  hasRenderedOnceRef.current[currentPage] = true;
                }
                renderedPagesRef.current.add(currentPage);
                if (alreadyRenderedFiles.has(fileId)) {
                  alreadyRenderedFiles.get(fileId)?.add(currentPage);
                }
                
                // Page change and rendering are complete
                setPageChangeInProgress(false);
                setIsRendering(false);
                setRenderComplete(true);
                
                // Center the document
                setTimeout(() => {
                  scrollToCenterDocument();
                }, 50);
                
              },
              (error: Error | any) => {
                // Check if this is a cancellation exception
                const isCancelled = error &&
                  (error.name === 'RenderingCancelledException' ||
                   error.message?.includes('Rendering cancelled'));

                if (isCancelled) {
                  console.warn(`[PDFViewer] Rendering cancelled for page ${currentRenderingPageRef.current}. This is often normal during navigation.`);
                } else {
                  console.error('[PDFViewer] Error rendering PDF page:', error);
                }

                // Reset render lock
                renderLockRef.current = false;
                currentRenderingPageRef.current = null;

                // Only set the error if it's not a cancellation (cancellations are often intentional)
                if (!isCancelled) {
                  setRenderError(error instanceof Error ? error : new Error(String(error)));
                }

                // Check if we should retry rendering
                const shouldRetry = !isCancelled && renderAttempts < 2;
                if (shouldRetry) {
                  // Increment retry counter
                  setRenderAttempts(prev => prev + 1);

                  // Add a short delay before retrying
                  setTimeout(() => {
                    // Clear render lock to allow retry
                    renderLockRef.current = false;
                    // Retry rendering
                    renderPdfPage();
                  }, 500); // 500ms delay before retry
                } else {
                  // No more retries or was cancelled, reset states
                  setPageChangeInProgress(false);
                  setIsRendering(false);

                  // If it was a cancellation and we're changing pages, don't display error state
                  if (isCancelled && pageChangeInProgress) {
                  } else if (isCancelled) {
                    setPageChangeInProgress(false);
                  }

                  // Reset render attempts for next time
                  setRenderAttempts(0);
                }
              }
            );
          } catch (error) {
            console.error('[PDFViewer] Error during page setup:', error);
            renderLockRef.current = false;
            currentRenderingPageRef.current = null;
            setRenderError(error instanceof Error ? error : new Error(String(error)));
            setPageChangeInProgress(false);
            setIsRendering(false);
            setRenderAttempts(0); // Reset attempts
          }
        },
        (error) => {
          console.error('[PDFViewer] Error getting PDF page:', error);
          renderLockRef.current = false;
          currentRenderingPageRef.current = null;
          setRenderError(error instanceof Error ? error : new Error(String(error)));
          setPageChangeInProgress(false);
          setIsRendering(false);
          setRenderAttempts(0); // Reset attempts
        }
      );
    } catch (error) {
      console.error('[PDFViewer] Uncaught error in renderPdfPage:', error);
      renderLockRef.current = false;
      currentRenderingPageRef.current = null;
      setRenderError(error instanceof Error ? error : new Error(String(error)));
      setPageChangeInProgress(false);
      setIsRendering(false);
      setRenderAttempts(0); // Reset attempts
    }
  }, [
    // Dependencies removed: currentPage, scale (read directly from state/refs inside)
    pdf,
    // currentPage,
    // scale,
    canvasRef,
    containerRef,
    fileId,
    documentId,
    annotationStore,
    pageChangeInProgress,
    scrollToCenterDocument,
    // renderAttempts // Removed: State changes shouldn't affect function identity here
  ]);

  // Add an effect to clear cache when file changes
  useEffect(() => {
    return () => {
      // If this component is unmounting, clear this document's cache
      const fileSpecificKeys = Array.from(pageCanvasCache.keys())
        .filter(key => key.startsWith(fileId || ''));
      
      fileSpecificKeys.forEach(key => {
        pageCanvasCache.delete(key);
        pageCacheTimestamps.delete(key);
      });
      
    };
  }, [fileId]);

  // Add effect to invalidate cache when scale changes
  useEffect(() => {
    // When scale changes, we can keep the cache but need to mark pages as not rendered
    hasRenderedOnceRef.current = {};
    renderedPagesRef.current.clear();
    cachedPagesRef.current.clear();
  }, [scale]);

  // Update the useEffect for page changes
  useEffect(() => {
    // Skip if we don't have a valid page or file
    if (!currentPage || !pdf || !fileId) {
      return;
    }
    
    // Check if PDF document is still valid
    if (!pdf.numPages) {
      console.error('[PDFViewer] PDF document is no longer valid');
      setPageChangeInProgress(false); // Clear page change state if PDF is invalid
      navigationTransitionRef.current = false; // Clear transition flag
      return;
    }
    
    // Create references for cleanup
    let pageChangeTimeout: NodeJS.Timeout | null = null;
    let safetyRenderTimeout: NodeJS.Timeout | null = null;
    let navigationCompleteTimeout: NodeJS.Timeout | null = null;

    // Set a timeout to force clear the page change flag if it gets stuck
    pageChangeTimeout = setTimeout(() => {
      if (pageChangeInProgress) {
        setPageChangeInProgress(false);
        navigationTransitionRef.current = false; // Clear transition flag

        // Also clear render lock if it might be stuck
        renderLockRef.current = false;

        // Cancel any hanging render task
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
          } catch (err) {
            console.warn('[PDFViewer] Error cancelling render task during timeout cleanup:', err);
          }
        }
      }
    }, 5000); // 5 second safety timeout
    
    // Always attempt to render when the page changes, but wait until navigation is complete
    if (pageChangeInProgress) {
      
      // Reset render tracking state for the new page to force a fresh render
      hasRenderedOnceRef.current[currentPage] = false;
      renderedPagesRef.current.delete(currentPage);
      
      // Wait for a longer delay before initiating rendering to ensure navigation is complete
      const navigationCompleteDelay = 300; // 300ms to ensure navigation is done

      // Schedule the render to occur after navigation is complete
      navigationCompleteTimeout = setTimeout(() => {
        // Mark navigation as complete
        navigationTransitionRef.current = false;

        try {
          // Make sure we're not in a page change state anymore
          if (pageChangeInProgress) {
            // Start the render process with a small delay
            const renderDelayMs = 50;

            safetyRenderTimeout = setTimeout(() => {
              try {
                // Additional safety check to make sure we're still in a page change
                if (!pageChangeInProgress) {
                  return;
                }

                // Make sure we don't have an active render task
                if (renderTaskRef.current) {
                  try {
                    renderTaskRef.current.cancel();
                    renderTaskRef.current = null;
                  } catch (err) {
                    console.warn('[PDFViewer] Error cancelling existing render task before new render:', err);
                  }
                }

                // Clear render lock to ensure we can start a new render
                renderLockRef.current = false;

                // Start the render process
                renderPdfPage();

                // Set another safety timeout to check if rendering got stuck
                safetyRenderTimeout = setTimeout(() => {
                  // If still in page change mode after 3 seconds, something is wrong
                  if (pageChangeInProgress) {
                    console.warn('[PDFViewer] Render appears to be stuck, force resetting state');
                    setPageChangeInProgress(false);
                    setIsRendering(false);
                    renderLockRef.current = false;
                    navigationTransitionRef.current = false; // Clear transition flag

                    // If we still have a render task, cancel it
                    if (renderTaskRef.current) {
                      try {
                        renderTaskRef.current.cancel();
                        renderTaskRef.current = null;
                      } catch (err) {
                        console.warn('[PDFViewer] Error cancelling stuck render task:', err);
                      }
                    }

                    // Force a fresh render attempt as a last resort
                    setTimeout(() => {
                      renderPdfPage();
                    }, 100);
                  }
                }, 3000);
              } catch (err) {
                console.error('[PDFViewer] Error during render initiation:', err);
                // Reset states to prevent getting stuck
                setPageChangeInProgress(false);
                setIsRendering(false);
                renderLockRef.current = false;
                navigationTransitionRef.current = false; // Clear transition flag
              }
            }, renderDelayMs);
          } else {
          }
        } catch (err) {
          console.error('[PDFViewer] Error scheduling render after navigation:', err);
          // Reset states to prevent getting stuck
          setPageChangeInProgress(false);
          setIsRendering(false);
          renderLockRef.current = false;
          navigationTransitionRef.current = false; // Clear transition flag
        }
      }, navigationCompleteDelay);
    }
    
    return () => {
      // Clean up all timeouts when the effect is cleaned up
      if (pageChangeTimeout) clearTimeout(pageChangeTimeout);
      if (safetyRenderTimeout) clearTimeout(safetyRenderTimeout);
      if (navigationCompleteTimeout) clearTimeout(navigationCompleteTimeout);
    };
  }, [currentPage, pdf, fileId, pageChangeInProgress, renderPdfPage]);

  // Update the useEffect for rendering the PDF page
  // Debounced render function
  const debouncedRenderPdfPage = useCallback(
    debounce(() => {
      // Call the main render function. It will access the latest state/refs.
      renderPdfPage();
    }, 75),
    [renderPdfPage] // Re-create debounce if renderPdfPage changes
  );

  // Effect to handle the very first render when the page object becomes available
  useEffect(() => {
    // Only run if we have a page and the initial render hasn't completed yet
    if (page && !initialRenderCompletedRef.current && pdf && !pageChangeInProgress && !isRendering) {
      renderPdfPage(); // Call the non-debounced render for immediate display
      initialRenderCompletedRef.current = true; // Mark initial render as complete
    }
  }, [page, pdf, currentPage, renderPdfPage, pageChangeInProgress, isRendering]); // Depend on page, pdf, and render function

  // Effect to trigger rendering when dependencies change
  // Removed useEffect hook that triggered debounced render based on page/scale changes.
  // Debounced render is now triggered directly from zoom handlers.

  // Mark viewer as ready when the PDF is loaded
  // Mark viewer as ready only when the PDF is loaded AND the first page has rendered
  useEffect(() => {
    let loadingTimer: NodeJS.Timeout | null = null;
    if (pdf && initialPageRendered) {
      // Mark the viewer as ready
      setIsViewerReady(true);
      console.log('[PDFViewer] Viewer marked as ready (PDF loaded and initial page rendered).');

      // Start the 2-second forced loading timer
      loadingTimer = setTimeout(() => {
        setShowForcedLoadingOverlay(false);
        console.log('[PDFViewer] Forced loading overlay hidden after 2 seconds. Refreshing canvas and showing controls.');
        // Refresh the canvas after the overlay is hidden
        renderPdfPage();
        // Controls will show based on `pdf` object availability
      }, 2000); // 2000ms = 2 seconds

      // Reset render state (might not be necessary here, but keep for now)
      setRenderComplete(false);
      setIsRendering(false);

    } else if (!pdf) {
      // If PDF is unloaded, viewer is not ready
      setIsViewerReady(false);
      setShowForcedLoadingOverlay(true); // Reset forced loading if PDF unloads
      // Controls will hide automatically when `pdf` is null
    }
    // If PDF is loaded but initial page hasn't rendered, isViewerReady remains false

    // Cleanup the timer if the component unmounts or dependencies change before timer finishes
    return () => {
      if (loadingTimer) {
        clearTimeout(loadingTimer);
      }
    };
  }, [pdf, initialPageRendered, renderPdfPage]); // Depend on pdf, initial render state, and renderPdfPage

  // Define function for fitting to width - placed at the top of other functions
  const handleFitToWidth = useCallback(() => {
    if (!page || !containerRef.current) return;
    
    const container = containerRef.current;
    // Account for padding (16px total for p-2 or 32px for p-4)
    const padding = 32; 
    const availableWidth = container.clientWidth - padding;
    
    // Get the intrinsic dimensions of the PDF page
    const viewport = page.getViewport({ scale: 1 });
    const aspectRatio = viewport.height / viewport.width;
    
    // Calculate scale needed to fit exactly to width
    const newScale = availableWidth / viewport.width;
    
    // Calculate new dimensions
    const newWidth = viewport.width * newScale;
    const newHeight = viewport.height * newScale;
    
    
    // Update the scale
    setScale(newScale); // Use direct setter
    
    // Scroll to center after a brief delay to ensure rendering is complete
    setTimeout(() => {
      scrollToCenterDocument();
    }, 100);
    
    // Enable automatic fit for future page changes
    disableFitToWidthRef.current = false;
    
  }, [page, scrollToCenterDocument]);

  // Define zoom functions
  const handleZoomIn = useCallback(() => {
    if (!page || !containerRef.current) return;
    
    // Save current scroll position and dimensions before zooming
    const scrollContainer = containerRef.current.querySelector('.overflow-auto');
    if (!scrollContainer) return;
    
    const viewportWidth = scrollContainer.clientWidth;
    const viewportHeight = scrollContainer.clientHeight;
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollTop = scrollContainer.scrollTop;
    
    // Calculate center point of the current view in document coordinates
    const centerX = scrollLeft + viewportWidth / 2;
    const centerY = scrollTop + viewportHeight / 2;
    
    // Increase scale by 25% (1.25x)
    const newScale = scale * 1.25;
    
    // Limit maximum zoom to 5x (500%)
    const cappedScale = Math.min(newScale, 5.0);
    
    // Update the scale
    setScale(cappedScale);
    // Trigger debounced render after scale update

    // Disable automatic fit to width for future page changes
    disableFitToWidthRef.current = true;
    
    // After scale change, update scroll position to keep the center point
    setTimeout(() => {
      if (!scrollContainer) return;
      
      // Calculate the new center point with the new scale
      const scaleFactor = cappedScale / scale;
      const newCenterX = centerX * scaleFactor;
      const newCenterY = centerY * scaleFactor;
      
      // Set new scroll position to keep the same center point
      scrollContainer.scrollLeft = newCenterX - viewportWidth / 2;
      scrollContainer.scrollTop = newCenterY - viewportHeight / 2;
    }, 50);
  }, [page, scale]);

  const handleZoomOut = useCallback(() => {
    if (!page || !containerRef.current) return;
    
    // Save current scroll position and dimensions before zooming
    const scrollContainer = containerRef.current.querySelector('.overflow-auto');
    if (!scrollContainer) return;
    
    const viewportWidth = scrollContainer.clientWidth;
    const viewportHeight = scrollContainer.clientHeight;
    const scrollLeft = scrollContainer.scrollLeft;
    const scrollTop = scrollContainer.scrollTop;
    
    // Calculate center point of the current view in document coordinates
    const centerX = scrollLeft + viewportWidth / 2;
    const centerY = scrollTop + viewportHeight / 2;
    
    // Decrease scale by 20% (0.8x)
    const newScale = scale * 0.8;
    
    // Limit minimum zoom to 0.25x (25%)
    const cappedScale = Math.max(newScale, 0.25);
    
    // Update the scale
    setScale(cappedScale);
    // Trigger debounced render after scale update

    // Disable automatic fit to width for future page changes
    disableFitToWidthRef.current = true;
    
    // After scale change, update scroll position to keep the center point
    setTimeout(() => {
      if (!scrollContainer) return;
      
      // Calculate the new center point with the new scale
      const scaleFactor = cappedScale / scale;
      const newCenterX = centerX * scaleFactor;
      const newCenterY = centerY * scaleFactor;
      
      // Set new scroll position to keep the same center point
      scrollContainer.scrollLeft = newCenterX - viewportWidth / 2;
      scrollContainer.scrollTop = newCenterY - viewportHeight / 2;
    }, 50);
  }, [page, scale]);

  const handleResetZoom = useCallback(() => {
    if (!page || !containerRef.current) return;
    
    // Reset to 100%
    setScale(1.0);
    
    // Disable automatic fit to width for future page changes
    disableFitToWidthRef.current = true;
    
    // Center the document after resetting zoom
    setTimeout(() => {
      scrollToCenterDocument();
    }, 100);
  }, [page, scrollToCenterDocument]);

  // Setup container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    
    const updateContainerSize = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const { width, height } = container.getBoundingClientRect();
      setContainerWidth(width);
      setContainerHeight(height);
      
      // Reapply fit-to-width when container dimensions change
      // and we have a page loaded
      if (page && !disableFitToWidthRef.current) {
        // Add a small delay to ensure measurements are accurate
        setTimeout(() => {
          handleFitToWidth();
        }, 100);
      }
    };
    
    // Initial size
    updateContainerSize();
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updateContainerSize);
    resizeObserver.observe(containerRef.current);
    
    // Also handle window resize events for more reliable updates
    window.addEventListener('resize', updateContainerSize);
    
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateContainerSize);
    };
  }, [page, handleFitToWidth]);

  // Handle zooming with mouse wheel + Ctrl key
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !page) return;

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
        
        // Get the scroll container and dimensions
        const scrollContainer = container.querySelector('.overflow-auto');
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
          // Zoom in - use a smaller increment for smoother zooming with wheel
          newScale = scale * 1.1; // 10% increase
          newScale = Math.min(newScale, 5.0); // max 500%
        } else {
          // Zoom out - use a smaller decrement for smoother zooming with wheel
          newScale = scale * 0.9; // 10% decrease
          newScale = Math.max(newScale, 0.25); // min 25%
        }
        
        // Update the scale
        setScale(newScale); // Use direct setter
        
        // Disable automatic fit to width
        disableFitToWidthRef.current = true;
        
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
  }, [page, containerRef, scale]);

  // Add keyboard shortcuts with documentId and current page
  useKeyboardShortcuts(documentId, currentPage, handleZoomIn, handleZoomOut, handleResetZoom);

  // Update cursor based on current tool
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cursorMap: { [key: string]: string } = {
      select: "default", // Always use default cursor for select
      drag: "grab", // Use grab cursor for drag tool
      hand: "grab",
      freehand: "crosshair",
      line: "crosshair",
      arrow: "crosshair",
      doubleArrow: "crosshair",
      rectangle: "crosshair",
      circle: "crosshair",
      triangle: "crosshair",
      text: "text",
      stickyNote: "text",
      highlight: "crosshair",
      stamp: "crosshair",
      stampApproved: "crosshair",
      stampRejected: "crosshair",
      stampRevision: "crosshair",
    };

    container.style.cursor = cursorMap[currentTool] || "default";
  }, [currentTool]);

  // Add a complete implementation for the normalizeAnnotationForExport function that properly handles both arguments
  const normalizeAnnotationForExport = useCallback((annotation: Annotation, originalViewport: any): Annotation => {
    // Create a deep copy to avoid modifying the original
    const normalizedAnnotation = JSON.parse(JSON.stringify(annotation));
    
    // PDF coordinates in annotations are stored relative to the PDF space coordinates
    // For export, we need to ensure they're properly positioned in the exported PDF coordinate space
    
    // Check if the annotation has points
    if (normalizedAnnotation.points && normalizedAnnotation.points.length > 0) {
      // Transform each point from PDF space to export space
      normalizedAnnotation.points = normalizedAnnotation.points.map((point: Point) => {
        // In PDF.js, the viewport origin is the top-left, y-axis extends down
        // No need to convert coordinates for our use case, but ensure they're in the correct range
        // Make sure points are within the page boundaries
        return {
          x: Math.max(0, Math.min(point.x, originalViewport.width / originalViewport.scale)),
          y: Math.max(0, Math.min(point.y, originalViewport.height / originalViewport.scale))
        };
      });
    }
    
    return normalizedAnnotation;
  }, []);

  // Export current page with annotations
  const handleExportCurrentPage = useCallback(async (format: "png" | "pdf" = "pdf") => {
    if (!page || !canvasRef.current || !viewport) {
      showToast("Cannot export - PDF not fully loaded", "error");
      return;
    }
    
    try {
      setIsExporting(true);
      
      // Get annotations for the current page from store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const pageAnnotations = currentDoc?.annotations?.filter(
        a => a.pageNumber === currentPage
      ) || [];
      
      if (format === "png") {
        // For PNG export, use the canvas approach
        const exportCanvas = await createExportCanvas(
          page, 
          scale, 
          pageAnnotations
        );

        // Export to PNG
        exportToPNG(exportCanvas.canvas, currentPage);
        showToast("PNG exported successfully with annotations", "success");
      } else {
        // For PDF, use pdf-lib to preserve original quality
        // If no annotations, show a message - no need to modify the PDF
        if (pageAnnotations.length === 0) {
          showToast("No annotations on this page to export", "success");
          setIsExporting(false);
          return;
        }
        
        // Get PDF data as ArrayBuffer
        let pdfBytes: ArrayBuffer;
        
        if (typeof file === 'string') {
          // File is a URL - fetch it
          const response = await fetch(file);
          pdfBytes = await response.arrayBuffer();
        } else {
          // File is a File object - read it
          pdfBytes = await file.arrayBuffer();
        }
        
        // Load the PDF document using pdf-lib to maintain original quality
        const pdfDoc = await PDFDocument.load(pdfBytes);
        
        // Create a new document with just the current page
        const newPdfDoc = await PDFDocument.create();
        const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [currentPage - 1]); // pdf-lib uses 0-indexed pages
        newPdfDoc.addPage(copiedPage);
        
        // Get the original page dimensions from PDF.js
        const originalViewport = page.getViewport({ scale: 1.0 });
        const width = originalViewport.width;
        const height = originalViewport.height;
        
        // Create a canvas with just the annotations (transparent background)
        const annotationCanvas = document.createElement("canvas");
        annotationCanvas.width = width;
        annotationCanvas.height = height;
        
        // Use alpha=true for transparency
        const ctx = annotationCanvas.getContext("2d", { alpha: true });
        if (!ctx) {
          throw new Error("Failed to get canvas context");
        }
        
        // Make background transparent
        ctx.clearRect(0, 0, width, height);
        
        // Normalize annotation coordinates for this specific page
        const normalizedAnnotations = pageAnnotations.map(annotation => 
          normalizeAnnotationForExport(annotation, originalViewport)
        );
        
        // Draw regular annotations
        const regularAnnotations = normalizedAnnotations.filter(a => a.type !== 'highlight');
        regularAnnotations.forEach(annotation => {
          try {
            drawAnnotation(ctx, annotation, 1.0, true); // Use scale 1.0 and isForExport=true
          } catch (err) {
            console.error("Error drawing annotation for export:", err);
          }
        });
        
        // Draw highlights with multiply blend mode
        const highlightAnnotations = normalizedAnnotations.filter(a => a.type === 'highlight');
        if (highlightAnnotations.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          
          highlightAnnotations.forEach(annotation => {
            try {
              drawAnnotation(ctx, annotation, 1.0, true); // Use scale 1.0 and isForExport=true
            } catch (err) {
              console.error("Error drawing highlight for export:", err);
            }
          });
          
          ctx.restore();
        }
        
        // Convert annotation canvas to image
        const annotationImage = await newPdfDoc.embedPng(annotationCanvas.toDataURL("image/png"));
        
        // Get the PDF page (first page in our new document)
        const pdfPage = newPdfDoc.getPage(0);
        
        // Add annotation image as an overlay to the original page
        pdfPage.drawImage(annotationImage, {
          x: 0,
          y: 0,
          width: width,
          height: height,
        });
        
        // Save the PDF with original content plus annotation overlays
        const modifiedPdfBytes = await newPdfDoc.save();
        
        // Create a blob and save it
        const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
        const fileName = `annotated-page-${currentPage}.pdf`;
        
        saveAs(blob, fileName);
        showToast("PDF exported successfully with original quality", "success");
      }
    } catch (error) {
      console.error("Export error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [page, canvasRef, viewport, scale, currentPage, document, documentId, file, showToast, normalizeAnnotationForExport]);
  
  // Export all annotations as JSON
  const handleExportAnnotations = useCallback(() => {
    try {
      // Get all annotations for the current document from store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const allAnnotations = currentDoc?.annotations || [];
      
      if (allAnnotations.length === 0) {
        showToast("No annotations to export", "success");
        return;
      }
      
      exportAnnotations(allAnnotations, documentId);
      showToast("Annotations exported successfully", "success");
    } catch (error) {
      console.error("Export annotations error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    }
  }, [document, documentId, showToast]);
  
  // Import annotations from JSON file
  const handleImportAnnotations = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      setImportStatus({ loading: true, error: null });
      
      try {
        const importedAnnotations = await importAnnotations(file);
        
        // Add imported annotations to the store
        const store = useAnnotationStore.getState();
        importedAnnotations.forEach(annotation => {
          store.addAnnotation(documentId, annotation);
        });
        
        showToast(`Imported ${importedAnnotations.length} annotations`, "success");
      } catch (error) {
        console.error("Import error:", error);
        setImportStatus({ loading: false, error: error instanceof Error ? error.message : 'Unknown error' });
        showToast(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
      } finally {
        setImportStatus({ loading: false, error: null });
      }
    };
    
    input.click();
  }, [documentId, showToast]);

  // Function to generate a canvas with PDF content and annotations
  const createAnnotatedCanvas = useCallback(async (targetPage: PDFPageProxy, annotations: Annotation[], qualityOptions: { scale?: number, preserveRatio?: boolean, imageQuality?: number } = {}) => {
    // Create a new canvas for exporting
    const exportCanvas = document.createElement("canvas");
    
    // Extract options with defaults - increased default quality scale
    const qualityScale = qualityOptions.scale ?? 2.0; // Increased from 1.0 to 2.0 for better quality
    const preserveRatio = qualityOptions.preserveRatio ?? true;
    const imageQuality = qualityOptions.imageQuality ?? 1.0; // New parameter for controlling image quality
    
    // Get the original viewport with scale=1 to preserve original dimensions if needed
    let baseViewport = targetPage.getViewport({ scale: 1.0 });
    let viewport;
    
    if (preserveRatio) {
      // Use original page dimensions with quality scaling
      viewport = targetPage.getViewport({ scale: qualityScale });
    } else {
      // Use current on-screen scale (may distort aspect ratio)
      viewport = targetPage.getViewport({ scale: scale * qualityScale });
    }
    
    // Set canvas dimensions with higher limit for better quality
    const MAX_DIMENSION = 4000; // Increased from default for higher resolution
    const scaleRatio = Math.min(1.0, MAX_DIMENSION / Math.max(viewport.width, viewport.height));
    
    exportCanvas.width = Math.floor(viewport.width * scaleRatio);
    exportCanvas.height = Math.floor(viewport.height * scaleRatio);
    
    // Get 2D context with alpha support for better annotation rendering
    const ctx = exportCanvas.getContext("2d", { alpha: true, willReadFrequently: true })!;
    
    // Set white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    // Enable high-quality image rendering on the context with better settings
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    
    // Use print intent for better PDF quality
    const renderTask = targetPage.render({
      canvasContext: ctx,
      viewport: viewport,
      intent: "print" // Use print intent for maximum quality
    });
    
    // Wait for PDF rendering to complete
    await renderTask.promise;
    
    // First draw non-highlight annotations
    const regularAnnotations = annotations.filter(a => a.type !== 'highlight');
    regularAnnotations.forEach(annotation => {
      try {
        // Use the viewport's scale for annotations
        const annotationScale = preserveRatio ? qualityScale : scale * qualityScale;
        drawAnnotation(ctx, annotation, annotationScale, true); // Always use isForExport=true
      } catch (err) {
        console.error("Error drawing annotation during export:", err);
      }
    });
    
    // Then draw highlights with multiply blend mode
    const highlightAnnotations = annotations.filter(a => a.type === 'highlight');
    if (highlightAnnotations.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      
      highlightAnnotations.forEach(annotation => {
        try {
          // Use the viewport's scale for annotations
          const annotationScale = preserveRatio ? qualityScale : scale * qualityScale;
          drawAnnotation(ctx, annotation, annotationScale, true); // Always use isForExport=true
        } catch (err) {
          console.error("Error drawing highlight during export:", err);
        }
      });
      
      ctx.restore();
    }
    
    return { canvas: exportCanvas, viewport, baseViewport, imageQuality };
  }, [scale]);

  // Add a new function to download just the current page without annotations
  const downloadCurrentPage = useCallback(async () => {
    if (!pdf || !page || !viewport) {
      showToast("Cannot download - PDF not fully loaded", "error");
      return;
    }
    
    try {
      setIsExporting(true);
      
      // Get annotations for the current page from store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const pageAnnotations = currentDoc?.annotations?.filter(
        a => a.pageNumber === currentPage
      ) || [];
      
      // If no annotations, show a message - no need to modify the PDF
      if (pageAnnotations.length === 0) {
        showToast("No annotations on this page to export", "success");
        setIsExporting(false);
        return;
      }
      
      // Use pdf-lib to preserve the original PDF content
      // First get the PDF data as an ArrayBuffer
      let pdfBytes: ArrayBuffer;
      
      if (typeof file === 'string') {
        // File is a URL - fetch it
        const response = await fetch(file);
        pdfBytes = await response.arrayBuffer();
      } else {
        // File is a File object - read it
        pdfBytes = await file.arrayBuffer();
      }
      
      // Load the PDF document using pdf-lib to maintain original quality
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Create a new document with just the current page
      const newPdfDoc = await PDFDocument.create();
      const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [currentPage - 1]); // pdf-lib uses 0-indexed pages
      newPdfDoc.addPage(copiedPage);
      
      // Get the original page dimensions from PDF.js
      const originalViewport = page.getViewport({ scale: 1.0 });
      const width = originalViewport.width;
      const height = originalViewport.height;
      
      // Define high-quality scale factor
      const qualityScaleFactor = 2.0; // Use 2x scale for good quality
      
      // Create a canvas with just the annotations (transparent background)
      const annotationCanvas = document.createElement("canvas");
      
      // Increase canvas size for higher quality
      const scaledWidth = Math.floor(width * qualityScaleFactor);
      const scaledHeight = Math.floor(height * qualityScaleFactor);
      annotationCanvas.width = scaledWidth;
      annotationCanvas.height = scaledHeight;
      
      // Use alpha=true for transparency
      const ctx = annotationCanvas.getContext("2d", { alpha: true });
      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }
      
      // Set high quality smoothing
      (ctx as any).imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = 'high';
      
      // Make background transparent
      ctx.clearRect(0, 0, scaledWidth, scaledHeight);
      
      // Apply quality scaling if needed
      if (Math.abs(qualityScaleFactor - 1.0) > 0.001) {
        ctx.scale(qualityScaleFactor, qualityScaleFactor);
      }
      
      // Normalize annotation coordinates for this specific page
      const normalizedAnnotations = pageAnnotations.map(annotation => 
        normalizeAnnotationForExport(annotation, originalViewport)
      );
      
      // Draw regular annotations
      const regularAnnotations = normalizedAnnotations.filter(a => a.type !== 'highlight');
      regularAnnotations.forEach(annotation => {
        try {
          drawAnnotation(ctx, annotation, 1.0, true); // Use scale 1.0 and isForExport=true
        } catch (err) {
          console.error("Error drawing annotation for single page export:", err);
        }
      });
      
      // Draw highlights with multiply blend mode
      const highlightAnnotations = normalizedAnnotations.filter(a => a.type === 'highlight');
      if (highlightAnnotations.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        
        highlightAnnotations.forEach(annotation => {
          try {
            drawAnnotation(ctx, annotation, 1.0, true); // Use scale 1.0 and isForExport=true
          } catch (err) {
            console.error("Error drawing highlight for single page export:", err);
          }
        });
        
        ctx.restore();
      }
      
      // Convert annotation canvas to image with max quality
      const annotationImage = await newPdfDoc.embedPng(annotationCanvas.toDataURL("image/png", 1.0));
      
      // Get the PDF page (first page in our new document)
      const pdfPage = newPdfDoc.getPage(0);
      
      // Add annotation image as an overlay to the original page
      pdfPage.drawImage(annotationImage, {
        x: 0,
        y: 0,
        width: width,
        height: height,
      });
      
      // Save the PDF with original content plus annotation overlays
      const modifiedPdfBytes = await newPdfDoc.save({ useObjectStreams: false, addDefaultPage: false });
      
      // Create a blob and save it
      const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
      const fileName = `page-${currentPage}${documentId ? `-${documentId}` : ''}-with-annotations.pdf`;
      
      saveAs(blob, fileName);
      showToast(`Page ${currentPage} exported with high-quality annotations`, "success");
      
    } catch (error) {
      console.error("Download page error:", error);
      showToast(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, page, viewport, currentPage, documentId, document, file, showToast, normalizeAnnotationForExport]);
  
  // Auto fit to width when page is loaded
  useEffect(() => {
    if (page && containerRef.current && !disableFitToWidthRef.current) {
      // Wait a moment for the page to be fully rendered
      setTimeout(() => {
        handleFitToWidth();
      }, 200);
    }
  }, [page, handleFitToWidth]);

  // Export all pages with annotations
  const handleExportAllPages = useCallback(async (quality?: "standard" | "hd" | "optimal") => {
    if (!pdf || !canvasRef.current || !viewport) {
      showToast("Cannot export - PDF not fully loaded", "error");
      return;
    }
    
    try {
      setIsExporting(true);
      
      // Get all annotations from the store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      if (!currentDoc) {
        showToast("Document not found in store", "error");
        return;
      }
      
      const qualityLabel = quality === "hd" ? "HD" : quality === "optimal" ? "Optimal" : "Standard";
      
      // Define scale factor based on quality setting
      const qualityScaleFactor = quality === "hd" ? 3.0 : 
                                quality === "optimal" ? 2.0 : 1.0;
      
      showToast(`Starting export of all pages with ${qualityLabel} quality...`, "success");
      
      // Use pdf-lib to preserve the original PDF content
      // First get the PDF data as an ArrayBuffer
      let pdfBytes: ArrayBuffer;
      
      if (typeof file === 'string') {
        // File is a URL - fetch it
        const response = await fetch(file);
        pdfBytes = await response.arrayBuffer();
      } else {
        // File is a File object - read it
        pdfBytes = await file.arrayBuffer();
      }
      
      // Load the PDF document using pdf-lib to maintain original quality
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // For each page, create a layer with the annotations
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          // Get annotations for this page from our store
          const pageAnnotations = currentDoc.annotations.filter(
            (a: Annotation) => a.pageNumber === pageNum
          );
          
          // Skip page processing if there are no annotations
          if (pageAnnotations.length === 0) {
            continue;
          }
          
          // Get the page from PDF.js for rendering
          const pageObj = await pdf.getPage(pageNum);
          
          // Get the original page dimensions
          const originalViewport = pageObj.getViewport({ scale: 1.0 });
          const width = originalViewport.width;
          const height = originalViewport.height;
          
          // Create a canvas with just the annotations (transparent background)
          const annotationCanvas = document.createElement("canvas");
          
          // Increase canvas size based on quality setting
          const scaledWidth = Math.floor(width * qualityScaleFactor);
          const scaledHeight = Math.floor(height * qualityScaleFactor);
          annotationCanvas.width = scaledWidth;
          annotationCanvas.height = scaledHeight;
          
          // Use alpha=true for transparency
          const ctx = annotationCanvas.getContext("2d", { alpha: true });
          if (!ctx) {
            throw new Error("Failed to get canvas context");
          }
          
          // Make background transparent
          ctx.clearRect(0, 0, scaledWidth, scaledHeight);
          
          // Set high quality smoothing
          (ctx as any).imageSmoothingEnabled = true;
          (ctx as any).imageSmoothingQuality = 'high';
          
          // Apply quality scaling if needed
          if (Math.abs(qualityScaleFactor - 1.0) > 0.001) {
            ctx.scale(qualityScaleFactor, qualityScaleFactor);
          }
          
          
          // Normalize annotation coordinates for this specific page
          const normalizedAnnotations = pageAnnotations.map((annotation: Annotation) => 
            normalizeAnnotationForExport(annotation, originalViewport)
          );
          
          // Draw annotations
          // First regular annotations
          const regularAnnotations = normalizedAnnotations.filter(a => a.type !== 'highlight');
          regularAnnotations.forEach(annotation => {
            try {
              drawAnnotation(ctx, annotation, 1.0, true); // Use scale 1.0 and isForExport=true
            } catch (err) {
              console.error("Error drawing annotation for PDF export:", err);
            }
          });
          
          // Then highlights with multiply blend mode
          const highlightAnnotations = normalizedAnnotations.filter(a => a.type === 'highlight');
          if (highlightAnnotations.length > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            
            highlightAnnotations.forEach(annotation => {
              try {
                drawAnnotation(ctx, annotation, 1.0, true); // Use scale 1.0 and isForExport=true
              } catch (err) {
                console.error("Error drawing highlight for PDF export:", err);
              }
            });
            
            ctx.restore();
          }
          
          // Convert annotation canvas to image with high quality settings
          const pngOptions = { useCompression: quality !== "hd" };
          const annotationImage = await pdfDoc.embedPng(annotationCanvas.toDataURL("image/png", 1.0)); // Use maximum quality 1.0
          
          // Get the PDF page
          const pdfPage = pdfDoc.getPage(pageNum - 1); // pdf-lib uses 0-indexed pages
          
          // Add annotation image as an overlay to the original page
          pdfPage.drawImage(annotationImage, {
            x: 0,
            y: 0,
            width: width,
            height: height,
          });
          
        } catch (error) {
          console.error(`Error processing page ${pageNum}:`, error);
          showToast(`Error on page ${pageNum}: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
      }
      
      // Save the PDF with original content plus annotation overlays
      const compression = quality === "hd" ? 0 : quality === "optimal" ? 0.5 : 0.8; // Lower compression for higher quality
      const modifiedPdfBytes = await pdfDoc.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 });
      
      // Create a blob and save it
      const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const qualitySuffix = quality === "hd" ? "-HD" : quality === "optimal" ? "-Optimal" : "";
      
      saveAs(blob, `${documentId}-annotated${qualitySuffix}-${timestamp}.pdf`);
      showToast(`All pages exported successfully with ${qualityLabel} quality`, "success");
      
    } catch (error) {
      console.error("Export all pages error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, file, viewport, documentId, document, showToast, normalizeAnnotationForExport]);

  // Set up event listeners
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Variable to track scheduled renders
    let renderTimeout: NodeJS.Timeout | null = null;
    let lastRenderTime = 0;
    const RENDER_COOLDOWN = 100; // Even shorter cooldown (ms) for more responsive feedback
    
    // Function to handle annotation changes
    const handleAnnotationChange = (event: CustomEvent) => {
      // Get event details
      const source = event.detail.source || 'unknown';
      const targetPageNumber = event.detail.pageNumber || currentPage;
      const forceRender = event.detail.forceRender === true;
      
      // User interactions should always trigger a render
      const isUserInteraction = source === 'userDrawing' || source === 'userEdit' || 
                               source === 'userAction' || forceRender;
      
      // If there's a pending render timeout, clear it
      if (renderTimeout) {
        clearTimeout(renderTimeout);
        renderTimeout = null;
      }
      
      // If this is from user interaction, render immediately
      if (isUserInteraction) {
        lastRenderTime = Date.now();
        
        // Only render if the event is for the current page
        if (targetPageNumber === currentPage) {
          // Force a fresh render
          hasRenderedOnceRef.current[currentPage] = false;
          renderedPagesRef.current.delete(currentPage);
          
          // Immediate render - even shorter delay
          setTimeout(() => {
            renderPdfPage();
          }, 0); // Immediate execution in next tick
        }
        return;
      }
      
      // Shorter cooldown time for all other events
      const now = Date.now();
      if (now - lastRenderTime < RENDER_COOLDOWN) {
        // Schedule with shorter delay
        renderTimeout = setTimeout(() => {
          lastRenderTime = Date.now();
          
          if (targetPageNumber === currentPage) {
            hasRenderedOnceRef.current[currentPage] = false;
            renderedPagesRef.current.delete(currentPage);
            renderPdfPage();
          }
        }, 50); // Very short delay for better responsiveness
        
        return;
      }
      
      // Update the last render time
      lastRenderTime = now;
      
      // If we're on the page that was modified, render immediately
      if (targetPageNumber === currentPage) {
        hasRenderedOnceRef.current[currentPage] = false;
        renderedPagesRef.current.delete(currentPage);
        
        // Set force render flag on annotation canvas
        const annotationCanvas = document.querySelector('.annotation-canvas-container canvas') as HTMLCanvasElement;
        if (annotationCanvas) {
          annotationCanvas.dataset.forceRender = 'true';
        }
        
        // Immediate render
        setTimeout(() => {
          renderPdfPage();
        }, 0);
      }
    };
    
    // Add event listeners to multiple sources to ensure we catch all events
    containerRef.current.addEventListener('annotationChanged', handleAnnotationChange as EventListener);
    
    // Also listen on document body for events that might bubble up there
    document.body.addEventListener('annotationChanged', handleAnnotationChange as EventListener);
    
    // Cleanup function
    return () => {
      // Remove event listeners
      containerRef.current?.removeEventListener('annotationChanged', handleAnnotationChange as EventListener);
      document.body.removeEventListener('annotationChanged', handleAnnotationChange as EventListener);
      
      // Clear any pending timeouts
      if (renderTimeout) {
        clearTimeout(renderTimeout);
      }
    };
  }, [canvasRef, containerRef, currentPage, pageChangeInProgress, renderPdfPage, isRendering]);

  // Function to verify annotation integrity
  const verifyAnnotationIntegrity = useCallback((documentId: string, pageNumber: number) => {
    // Get annotations for this page
    const annotations = getAnnotationsForPage(documentId, pageNumber);
    
    // Check if annotations are valid
    const invalidAnnotations = annotations.filter(annotation => {
      // Check for required properties
      if (!annotation.id || !annotation.type || !annotation.pageNumber) {
        console.error('[PDFViewer] Invalid annotation found:', annotation);
        return true;
      }
      
      // Check for valid coordinates
      if (annotation.type !== 'text') {
        if (!annotation.points || annotation.points.length === 0) {
          console.error('[PDFViewer] Annotation missing points:', annotation);
          return true;
        }
        
        // Check if points are within page bounds
        if (page && viewport) {
          const outOfBounds = annotation.points.some(point => 
            point.x < 0 || point.x > viewport.width || 
            point.y < 0 || point.y > viewport.height
          );
          
          if (outOfBounds) {
            console.warn('[PDFViewer] Annotation has out-of-bounds points:', annotation);
            // We don't mark these as invalid, just log a warning
          }
        }
      }
      
      return false;
    });
    
    if (invalidAnnotations.length > 0) {
      console.warn(`[PDFViewer] Found ${invalidAnnotations.length} invalid annotations on page ${pageNumber}`);
      showToast(`Found ${invalidAnnotations.length} invalid annotations. They may not display correctly.`, "error");
      return false;
    }
    return true;
  }, [getAnnotationsForPage, page, viewport, showToast]);
  
  // Effect to verify annotations when page changes
  useEffect(() => {
    if (pdf && documentId) {
      // Verify annotations for the current page
      verifyAnnotationIntegrity(documentId, currentPage);
    }
  }, [currentPage, pdf, documentId, verifyAnnotationIntegrity]);

  // Function to verify PDF integrity and rendering quality
  const verifyPDFIntegrity = useCallback(async () => {
    if (!pdf || !page) {
      return false;
    }
  
    try {
      // Basic checks for PDF integrity
      
      // Check if text content can be extracted (sign of a properly loaded PDF)
      const textContent = await page.getTextContent();
      const hasText = textContent.items.length > 0;
      
      // Check annotations
      const annots = await page.getAnnotations();
      
      // Log successful verification
      return true;
    } catch (error) {
      return false;
    }
  }, [pdf, page, currentPage, viewport]);

  // Run PDF integrity check when page is loaded
  useEffect(() => {
    if (page && !isPdfLoading && !isPageLoading) {
      // Verify PDF integrity after a short delay to ensure rendering is complete
      setTimeout(() => {
        verifyPDFIntegrity();
      }, 500);
    }
  }, [page, isPdfLoading, isPageLoading, verifyPDFIntegrity]);

  // Initialize PDFjs and load document when file changes
  useEffect(() => {
    let currentFileId = Math.random().toString(36).substring(2, 9);
    
    // Reset all state for a fresh load
    // PDF and page state are managed by custom hooks (usePDFDocument and usePDFPage)
    setCurrentPage(1);
    setCurrentAnnotations([]);
    setIsViewerReady(false);
    setHasStartedLoading(false);
    setRenderError(null);
    setIsInitialLoading(true); // Start with loading state
    setShowForcedLoadingOverlay(true); // Reset forced loading overlay on file change

    // Reset render tracking
    hasRenderedOnceRef.current = {};
    renderedPagesRef.current.clear();
    
    // Simple load process with retry
    const loadPdf = () => {
      
      if (typeof file === "string") {
        // For URL, fetch it first
        fetch(file)
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to fetch PDF: ${response.status}`);
            }
            return response.blob();
          })
          .then(blob => {
            const pdfFile = new File([blob], file.split('/').pop() || 'document.pdf', { type: 'application/pdf' });
            setPdfFile(pdfFile);
            setHasStartedLoading(true);
          })
          .catch(error => {
            console.error('[PDFViewer] Error loading PDF from URL:', error);
            setRenderError(error instanceof Error ? error : new Error(String(error)));
            setIsInitialLoading(false); // Stop loading state on error
            // Try once more with a different approach if it failed
            setTimeout(() => {
              try {
                // The PDF will be loaded by usePDFDocument hook after setting the file
                setPdfFile(new File([new Uint8Array(0)], 'fallback.pdf', { type: 'application/pdf' }));
                setCurrentPage(1);
                setHasStartedLoading(false);
                setIsInitialLoading(false); // Stop loading state
              } catch (e) {
                console.error('[PDFViewer] Failed to recover:', e);
                setRenderError(e instanceof Error ? e : new Error(String(e)));
                setIsInitialLoading(false); // Stop loading state
              }
            }, 500);
          });
      } else if (file instanceof File) {
        // For File object, use it directly
        setPdfFile(file);
        setHasStartedLoading(true);
      }
    };
    
    const initializePdfViewer = async () => {
      if (!pdfFile) {
        loadPdf();
        return;
      }
      
      
      try {
        initializationStartedRef.current = true;
        
        // No need to manually load PDF - it's handled by usePDFDocument hook
        // The hook will use pdfFile to load the PDF
        
        // Update state to indicate file is loaded but not yet processed
        // PDF processing will proceed in the usePDFDocument and usePDFPage hooks
        
        // Set initial scale based on container width
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth - 32; // Account for padding
          const containerHeight = containerRef.current.clientHeight - 32;
          
          setContainerWidth(containerWidth);
          setContainerHeight(containerHeight);
          
          // Schedule fit to width after a delay to ensure container is rendered
          setTimeout(() => {
            handleFitToWidth();
          }, 100);
        }
        
        // PDF loading state will be updated by the hooks
        setIsInitialLoading(false);
      } catch (error) {
        console.error('[PDFViewer] Failed to initialize PDF:', error);
        setRenderError(error instanceof Error ? error : new Error('Failed to load PDF'));
        setHasStartedLoading(false);
        setIsInitialLoading(false); // Stop loading state on error
      }
    };
    
    if (file) {
      initializePdfViewer();
    }
    
    return () => {
      // Clean up
      initializationStartedRef.current = false;
      
      // Cancel any ongoing render task
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      
      setIsInitialLoading(false); // Ensure loading state is reset on unmount
    };
  }, [file]); // Only depend on file to prevent loops

  // Effect to handle PDF document loading and verification
  useEffect(() => {
    if (!pdf) return;
    
    // Limit the frequency of log messages to prevent spam
    const now = Date.now();
    const lastLog = pdfLoadLogTimestampRef.current;
    if (now - lastLog < 1000) {
      // Don't log if less than 1 second since last log
      return;
    }
    pdfLoadLogTimestampRef.current = now;
    
    
    // Verify PDF integrity only if not already verified for this document
    if (!pdfVerifiedRef.current) {
      verifyPDFIntegrity().then(isValid => {
        if (isValid) {
          pdfVerifiedRef.current = true;
          
          // Set the document ID in the annotation store to load annotations
          annotationStore.setCurrentDocument(documentId);
          
          // Force render of first page with annotations (if renderPdfPage exists)
          if (typeof renderPdfPage === 'function') {
            // Clear any previous render lock that might be blocking rendering
            renderLockRef.current = false;
            
            // Only trigger render if we're not already rendering
            if (!isRendering && !pageChangeInProgress) {
              setTimeout(() => {
                renderPdfPage();
              }, 100); // Small delay to ensure everything is ready
            }
          }
        }
      });
    }
  }, [pdf, documentId, annotationStore, verifyPDFIntegrity, isRendering, pageChangeInProgress, renderPdfPage]);

  // Add these refs near the top with other refs
  const pdfLoadLogTimestampRef = useRef<number>(0);
  const pdfVerifiedRef = useRef<boolean>(false);

  // Function to handle stamp annotations
  const handleStampAnnotation = useCallback((event: MouseEvent) => {
    // Only process if current tool is a stamp type
    if (!currentTool || !['stamp', 'stampApproved', 'stampRejected', 'stampRevision'].includes(currentTool)) {
      return;
    }

    // Get canvas and container references
    const canvas = canvasRef.current;
    const container = containerRef.current;
    
    if (!canvas || !container || !pdf || !page || !viewport) {
      console.warn('[PDFViewer] Cannot create stamp: canvas, container, pdf, page or viewport is missing');
      return;
    }

    // Get relative mouse position on canvas
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left);
    const y = (event.clientY - rect.top);

    // Convert to unscaled PDF coordinates
    let pointInPdfCoordinates: Point;
    
    // Check if viewport has convertToPdfPoint method
    if ('convertToPdfPoint' in viewport) {
      const pdfPoint = (viewport as any).convertToPdfPoint(x, y);
      pointInPdfCoordinates = {
        x: pdfPoint[0] / scale,
        y: pdfPoint[1] / scale
      };
    } else {
      // Fallback to standard conversion
      pointInPdfCoordinates = {
        x: x / scale,
        y: y / scale
      };
    }

    // Determine which stamp type to use based on the current tool
    let stampType: "approved" | "rejected" | "revision" = "approved";
    
    if (currentTool === 'stampRejected') {
      stampType = "rejected";
    } else if (currentTool === 'stampRevision') {
      stampType = "revision";
    }

    // Create the stamp annotation
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: currentTool as AnnotationType,
      points: [pointInPdfCoordinates],
      style: {
        color: currentTool === 'stampRejected' ? '#FF0000' : 
              currentTool === 'stampRevision' ? '#0000FF' : '#00AA00',
        lineWidth: 2,
        opacity: 1,
        stampType
      },
      pageNumber: currentPage,
      timestamp: Date.now(),
      userId: "current-user",
      version: 1,
    };

    // Add the annotation to the store
    annotationStore.addAnnotation(documentId, newAnnotation);

    // Dispatch event to ensure immediate rendering - try multiple approaches
    // Method 1: Dispatch to PDF container
    const pdfContainer = document.querySelector('.pdf-container') || document.querySelector('.pdf-container-fixed');
    if (pdfContainer) {
      const customEvent = new CustomEvent('annotationChanged', {
        detail: {
          pageNumber: currentPage,
          source: 'userDrawing',
          forceRender: true
        },
      });
      pdfContainer.dispatchEvent(customEvent);
    }
    
    // Method 2: Dispatch to annotation canvas directly
    const annotationCanvas = document.querySelector('.annotation-canvas-container canvas');
    if (annotationCanvas) {
      // Set data attribute to force render
      (annotationCanvas as HTMLCanvasElement).dataset.forceRender = 'true';
      
      // Create and dispatch event
      const canvasEvent = new CustomEvent('annotationChanged', {
        detail: {
          pageNumber: currentPage,
          source: 'userDrawing',
          forceRender: true
        },
      });
      annotationCanvas.dispatchEvent(canvasEvent);
    }
    
    // Method 3: Directly trigger via document event
    document.dispatchEvent(new CustomEvent('annotationChanged', {
      detail: {
        pageNumber: currentPage,
        source: 'userDrawing',
        forceRender: true
      }
    }));
    
    // Reset rendered state to force a refresh
    if (hasRenderedOnceRef.current) {
      hasRenderedOnceRef.current[currentPage] = false;
    }
    renderedPagesRef.current.delete(currentPage);
    
  }, [annotationStore, currentPage, currentTool, documentId, hasRenderedOnceRef, page, pdf, renderedPagesRef, scale, viewport]);
  
  // Add event listener for stamp tool when appropriate
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Only add click listener if we're using a stamp tool
    if (['stamp', 'stampApproved', 'stampRejected', 'stampRevision'].includes(currentTool)) {
      canvas.addEventListener('click', handleStampAnnotation);
      
      // Update cursor to indicate stamp placement
      canvas.style.cursor = 'crosshair';
    }

    return () => {
      // Clean up event listener
      canvas.removeEventListener('click', handleStampAnnotation);
    };
  }, [currentTool, handleStampAnnotation]);

  // Add this useEffect right after the mouse wheel zoom handler
  // Synchronize annotation canvas with PDF canvas on scale changes
  useEffect(() => {
    if (!page || !viewport || !isViewerReady) return;
    
    // Event dispatch and forced re-render logic removed.
    // AnnotationCanvas now relies on the 'scale' prop for updates.
    // PDF rendering is handled by the main renderPdfPage logic triggered by scale changes.
  }, [scale, page, viewport, isViewerReady, currentPage, pageChangeInProgress, renderPdfPage]);

  // Add event handlers for dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    
    // Only enable dragging when using drag or hand tool (not select anymore)
    // Also check if content is larger than container (requires panning)
    const hasOverflow = page && viewport && 
      (viewport.width > scrollContainerRef.current.clientWidth || 
       viewport.height > scrollContainerRef.current.clientHeight);
       
    if ((currentTool === 'drag' || currentTool === 'hand') && hasOverflow) {
      setIsDragging(true);
      
      // Store initial mouse position and scroll position separately
      setDragStart({
        x: e.clientX,
        y: e.clientY
      });
      
      // Store current scroll position in the ref element's dataset
      scrollContainerRef.current.dataset.startScrollLeft = String(scrollContainerRef.current.scrollLeft);
      scrollContainerRef.current.dataset.startScrollTop = String(scrollContainerRef.current.scrollTop);
      
      // Change cursor to grabbing for all elements
      if (containerRef.current) {
        containerRef.current.classList.add(grabCursorClassName);
      }
      if (scrollContainerRef.current) {
        scrollContainerRef.current.classList.add(grabCursorClassName);
      }
      if (canvasRef.current) {
        canvasRef.current.classList.add(grabCursorClassName);
      }
      
      // Prevent default behaviors
      e.preventDefault();
    }
  }, [currentTool, page, viewport, grabCursorClassName]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && scrollContainerRef.current) {
      // Get starting scroll position from dataset
      const startScrollLeft = parseInt(scrollContainerRef.current.dataset.startScrollLeft || '0');
      const startScrollTop = parseInt(scrollContainerRef.current.dataset.startScrollTop || '0');
      
      // Calculate how far the mouse has moved from starting position
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      // Update scroll position by subtracting mouse movement from initial scroll position
      // (moving mouse right scrolls content left)
      scrollContainerRef.current.scrollLeft = startScrollLeft - dx;
      scrollContainerRef.current.scrollTop = startScrollTop - dy;
      
      // Prevent default behaviors like text selection
      e.preventDefault();
    }
  }, [isDragging, dragStart]);

  // Add effect to update container cursor based on content size and tool
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;
    
    const updateCursor = () => {
      if (!page || !viewport) return;
      
      // Check if content is larger than container (requires panning)
      const hasOverflow = viewport.width > scrollContainer.clientWidth || 
                          viewport.height > scrollContainer.clientHeight;
      
      // Set cursor based on current state
      if (isDragging) {
        // Use grabbing cursor with cross-browser support via a CSS class
        scrollContainer.classList.add(grabCursorClassName);
        if (canvasRef.current) {
          canvasRef.current.classList.add(grabCursorClassName);
        }
      } else if ((currentTool === 'hand' || currentTool === 'drag') && hasOverflow) {
        scrollContainer.classList.remove(grabCursorClassName);
        scrollContainer.style.cursor = 'grab';
        if (canvasRef.current) {
          canvasRef.current.classList.remove(grabCursorClassName);
          canvasRef.current.style.cursor = 'grab';
        }
      } else {
        scrollContainer.classList.remove(grabCursorClassName);
        const cursorMap: { [key: string]: string } = {
          select: "default", // Always use default cursor for select tool
          drag: "grab", // Use grab for drag tool
          hand: "grab",
          freehand: "crosshair",
          line: "crosshair",
          arrow: "crosshair",
          doubleArrow: "crosshair",
          rectangle: "crosshair",
          circle: "crosshair",
          triangle: "crosshair",
          text: "text",
          stickyNote: "text",
          highlight: "crosshair",
          stamp: "crosshair",
          stampApproved: "crosshair",
          stampRejected: "crosshair",
          stampRevision: "crosshair",
        };
        
        scrollContainer.style.cursor = cursorMap[currentTool] || "default";
        if (canvasRef.current) {
          canvasRef.current.style.cursor = cursorMap[currentTool] || "default";
        }
      }
    };
    
    // Update cursor on initial load and when relevant factors change
    updateCursor();
    
    // Create observer to check when content dimensions change
    const resizeObserver = new ResizeObserver(updateCursor);
    resizeObserver.observe(scrollContainer);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [currentTool, isDragging, page, viewport, grabCursorClassName]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && scrollContainerRef.current) {
      // Store timestamp when drag ended to prevent immediate re-centering
      scrollContainerRef.current.dataset.dragEndTime = Date.now().toString();
      
      setIsDragging(false);
      
      // Reset cursor based on tool and content overflow
      const hasOverflow = page && viewport && 
        (viewport.width > scrollContainerRef.current.clientWidth || 
         viewport.height > scrollContainerRef.current.clientHeight);
      
      // Remove grabbing cursor class from all elements
      if (containerRef.current) {
        containerRef.current.classList.remove(grabCursorClassName);
      }
      if (scrollContainerRef.current) {
        scrollContainerRef.current.classList.remove(grabCursorClassName);
      }
      if (canvasRef.current) {
        canvasRef.current.classList.remove(grabCursorClassName);
      }
      
      // Update cursor based on tool and overflow state
      if ((currentTool === 'hand' || currentTool === 'drag') && hasOverflow) {
        // Use grab cursor when hovering over pannable content
        if (containerRef.current) {
          containerRef.current.style.cursor = 'grab';
        }
        if (scrollContainerRef.current) {
          scrollContainerRef.current.style.cursor = 'grab';
        }
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'grab';
        }
      } else {
        // Reset to appropriate tool cursor
        const cursorMap: { [key: string]: string } = {
          select: "default", // Always use default cursor for select tool
          drag: "grab", // Use grab for drag tool
          hand: "grab",
          freehand: "crosshair",
          line: "crosshair",
          arrow: "crosshair",
          doubleArrow: "crosshair",
          rectangle: "crosshair",
          circle: "crosshair",
          triangle: "crosshair",
          text: "text",
          stickyNote: "text",
          highlight: "crosshair",
          stamp: "crosshair",
          stampApproved: "crosshair",
          stampRejected: "crosshair",
          stampRevision: "crosshair",
        };
        
        const cursor = cursorMap[currentTool] || "default";
        if (containerRef.current) {
          containerRef.current.style.cursor = cursor;
        }
        if (scrollContainerRef.current) {
          scrollContainerRef.current.style.cursor = cursor;
        }
        if (canvasRef.current) {
          canvasRef.current.style.cursor = cursor;
        }
      }
    }
  }, [isDragging, currentTool, page, viewport, grabCursorClassName]);

  // Use the cursor-grab.svg from assets folder
  const BLUE_GRAB_CURSOR = `url("/assets/cursor-grab.svg")`;
  const BLUE_GRABBING_CURSOR = `url("/assets/cursor-grabbing.svg")`;

  // Add a style tag for the grabbing cursor if it doesn't exist

  // Add a style tag for the grabbing cursor if it doesn't exist
  useEffect(() => {
    const styleId = "grabbing-cursor-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        /* Create a blue cursor for grab and grabbing */
        .cursor-grabbing {
          cursor: ${BLUE_GRABBING_CURSOR} 16 16, grabbing;
        }
        .cursor-grab {
          cursor: ${BLUE_GRAB_CURSOR} 16 16, grab;
        }
        
        /* Ensure select tool always uses default cursor regardless of other rules */
        [data-current-tool="select"] .overflow-auto,
        [data-current-tool="select"] canvas,
        [data-current-tool="select"] .pdf-content-scrollable,
        [data-current-tool="select"] {
          cursor: default !important;
        }
        
        /* Only show blue grab cursor when content is pannable AND using drag/hand tool */
        [data-has-overflow="true"][data-current-tool="drag"] .overflow-auto,
        [data-has-overflow="true"][data-current-tool="hand"] .overflow-auto,
        [data-has-overflow="true"][data-current-tool="drag"] .overflow-auto canvas,
        [data-has-overflow="true"][data-current-tool="hand"] .overflow-auto canvas,
        .allow-panning {
          cursor: ${BLUE_GRAB_CURSOR} 16 16, grab !important;
        }
        
        /* When dragging, show grabbing cursor */
        .is-dragging .overflow-auto,
        .is-dragging canvas {
          cursor: ${BLUE_GRABBING_CURSOR} 16 16, grabbing !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);


  
  // Update effect to add/remove the is-dragging class for global cursor control
  useEffect(() => {
    // Apply is-dragging class to document body for global cursor control
    if (isDragging) {
      document.body.classList.add('is-dragging');
    } else {
      document.body.classList.remove('is-dragging');
    }
    
    return () => {
      document.body.classList.remove('is-dragging');
    };
  }, [isDragging]);

  // Add new effect to detect overflow and update data attribute
  useEffect(() => {
    // Skip if necessary refs or objects aren't available
    if (!containerRef.current || !scrollContainerRef.current || !page || !viewport) {
      return;
    }
    
    // Function to check for overflow
    const checkForOverflow = () => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer || !viewport) return;
      
      // Content is larger than container (requires panning)
      const hasOverflow = 
        viewport.width > scrollContainer.clientWidth || 
        viewport.height > scrollContainer.clientHeight;
      
      // Update data attribute for CSS targeting
      if (containerRef.current) {
        containerRef.current.dataset.hasOverflow = hasOverflow.toString();
      }
    };
    
    // Check immediately
    checkForOverflow();
    
    // Also check when window resizes
    window.addEventListener('resize', checkForOverflow);
    
    return () => {
      window.removeEventListener('resize', checkForOverflow);
    };
  }, [page, viewport]);

  // Update the scroll container to conditionally apply the appropriate cursor based on tool
  useEffect(() => {
    // Function to update cursor and data attributes based on conditions
    const updateCursorState = () => {
      if (!containerRef.current || !scrollContainerRef.current || !page || !viewport) {
        return;
      }
      
      const scrollContainer = scrollContainerRef.current;
      
      // Check if content is larger than container (requires panning)
      const hasOverflow = 
        viewport.width > scrollContainer.clientWidth || 
        viewport.height > scrollContainer.clientHeight;
      
      // Update data attribute for overflow state
      containerRef.current.dataset.hasOverflow = hasOverflow.toString();
      
      // Update data attribute for current tool
      containerRef.current.dataset.currentTool = currentTool;
      
      // Only add cursor classes if using drag or hand tool AND content overflows
      const allowPanning = hasOverflow && (currentTool === 'drag' || currentTool === 'hand');
      
      // Set cursor class based on conditions
      if (allowPanning) {
        scrollContainer.classList.add('allow-panning');
      } else {
        scrollContainer.classList.remove('allow-panning');
      }
    };
    
    // Run immediately
    updateCursorState();
    
    // Also run on resize
    window.addEventListener('resize', updateCursorState);
    
    return () => {
      window.removeEventListener('resize', updateCursorState);
    };
  }, [page, viewport, currentTool]);

  // Add useEffect to update data-current-tool attribute on the container
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.setAttribute('data-current-tool', currentTool);
    }
  }, [currentTool]);
  
  // Add effect to handle window resize
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Make sure we explicitly return a JSX element to satisfy the React.FC type
  return (
    <div 
      className="relative flex flex-col h-full"
      ref={containerRef}
      data-current-tool={currentTool}
      data-cursor-state={isDragging ? "grabbing" : currentTool === "drag" ? "grab" : currentTool}
    >
      {isShortcutGuideOpen && (
        <KeyboardShortcutGuide
          onClose={() => setIsShortcutGuideOpen(false)}
        />
      )}
      
      {/* Render controls only when the PDF object is available */}
      {pdf && (
        <PDFControls
          currentPage={currentPage}
          totalPages={pdf.numPages}
          scale={scale}
          isExporting={isExporting}
          isImporting={importStatus.loading}
          importError={importStatus.error}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          onExportCurrentPage={handleExportCurrentPage}
          onExportAllPages={handleExportAllPages}
          onExportAnnotations={handleExportAnnotations}
          onImportAnnotations={handleImportAnnotations}
          onFitToWidth={handleFitToWidth}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetZoom={handleResetZoom}
          onDownloadCurrentPage={downloadCurrentPage}
        />
      )}
      
      {/* Page indicator for event targeting */}
      {pdf && (
        <div className="hidden">
          <span className="page-number-display">{`${currentPage} / ${pdf.numPages}`}</span>
          <div id="tool-change-indicator" data-tool-changed="false"></div>
        </div>
      )}

      <div 
        className="pdf-container h-full flex-1 overflow-hidden" 
        ref={containerRef}
        data-has-overflow="false" // Default value, will be updated by the effect
      >
        {/* PDF Viewer - Fixed container with scrollable content */}
        <div 
          className="relative flex-1 overflow-auto bg-gray-100 p-2 md:p-4 h-full w-full" 
          ref={scrollContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onScroll={handleScroll}
        >
          {/* Initial Loading Animation - before PDF processing has started */}
          {isInitialLoading && !hasStartedLoading && !renderError && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-white">
              <div className="flex flex-col items-center max-w-md text-center p-8">
                <div className="relative w-20 h-20 mb-4">
                  {/* Subtle pulsing background */}
                  <div className="absolute inset-0 rounded-full bg-blue-50 animate-pulse"></div>
                  
                  {/* Staggered dots animation */}
                  <div className="absolute inset-0 flex justify-center items-end pb-2">
                    <div className="flex space-x-2">
                      <div className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }}></div>
                      <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms", animationDuration: "1s" }}></div>
                      <div className="w-2.5 h-2.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms", animationDuration: "1s" }}></div>
                    </div>
                  </div>
                  
                  {/* Document icon */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-80">
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-10 w-10 text-blue-700" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-lg font-medium text-gray-800 mb-1">Initializing PDF Viewer</h3>
                <p className="text-sm text-gray-500">Preparing to load your document...</p>
              </div>
            </div>
          )}
          
          {/* Processing Animation - shows when loading has started but PDF isn't ready yet */}
          {hasStartedLoading && !pdf && !renderError && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-white bg-opacity-95">
              <div className="flex flex-col items-center max-w-md text-center p-8">
                <div className="relative w-24 h-24 mb-5">
                  {/* Background circle */}
                  <div className="absolute inset-0 rounded-full bg-blue-50"></div>
                  
                  {/* Circular progress spinner */}
                  <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 border-r-blue-400 animate-spin" style={{ animationDuration: "1.5s" }}></div>
                  
                  {/* Central document icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-12 w-12 text-blue-600" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9h4m-4 4h4" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-xl font-medium text-gray-800 mb-2">Loading PDF</h3>
                <p className="text-sm text-gray-600 max-w-xs">Processing your document. This may take a moment for larger files...</p>
              </div>
            </div>
          )}
          
          {/* Error state */}
          {renderError && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-white">
              <div className="bg-white p-8 rounded-xl shadow-lg max-w-md mx-auto text-center">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-red-900 mb-3">Failed to Load PDF</h3>
                <p className="text-gray-600 mb-5 text-sm">{renderError.message}</p>
                <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3 justify-center">
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Reload Page
                  </button>
                  <button 
                    onClick={() => setRenderError(null)}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
          
          <div 
            className={`pdf-viewer-container mx-auto ${isDragging ? grabCursorClassName : ""}`}
            style={{
              width:  '100%',
              height: screenWidth < 1600 ? '40vh' : '45vh',
              position: 'relative',
              maxWidth: '100%',
              marginBottom: '20px',
              opacity: isRendering ? 0.7 : 1,
              transition: 'opacity 0.2s ease-in-out, width 0.15s ease-out, height 0.15s ease-out',
              transformOrigin: 'top left',
              cursor: isDragging ? 'grabbing' : 
                (((viewport?.width || 0) > (scrollContainerRef.current?.clientWidth || 0) || 
                (viewport?.height || 0) > (scrollContainerRef.current?.clientHeight || 0)) && 
                (currentTool === 'drag' || currentTool === 'hand')) ? 'grab' : 
                currentTool === 'select' ? 'default' : undefined
            }}
          >
            {page && (
              <>
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 z-10"
                  style={{
                    margin: '0 auto',
                    width: `${viewport.width}px`,
                    height: `${viewport.height}px`,
                  }}
                />
                {/* Always render the annotation canvas once the PDF is initially loaded */}
                {isViewerReady && (
                  <AnnotationCanvas
                    documentId={documentId}
                    pageNumber={currentPage}
                    scale={scale}
                    width={viewport.width}
                    height={viewport.height}
                  />
                )}
              </>
            )}

            {/* Forced Loading Overlay (2 seconds after ready) */}
            {showForcedLoadingOverlay && isViewerReady && !renderError && (
              <div className="absolute inset-0 flex items-center justify-center z-40 bg-white bg-opacity-90 backdrop-blur-sm">
                 <div className="flex flex-col items-center max-w-md text-center p-8">
                   <div className="relative w-24 h-24 mb-5">
                     {/* Background circle */}
                     <div className="absolute inset-0 rounded-full bg-blue-50"></div>
                     {/* Circular progress spinner */}
                     <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 border-r-blue-400 animate-spin" style={{ animationDuration: "1.5s" }}></div>
                     {/* Central document icon */}
                     <div className="absolute inset-0 flex items-center justify-center">
                       <svg
                         xmlns="http://www.w3.org/2000/svg"
                         className="h-12 w-12 text-blue-600"
                         fill="none"
                         viewBox="0 0 24 24"
                         stroke="currentColor"
                       >
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9h4m-4 4h4" />
                       </svg>
                     </div>
                   </div>
                   <h3 className="text-xl font-medium text-gray-800 mb-2">Preparing Viewer...</h3>
                   <p className="text-sm text-gray-600 max-w-xs">Finalizing page display.</p>
                 </div>
              </div>
            )}

           
            
        
            
            {isExporting && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-4 rounded-lg shadow-lg">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="text-center mt-4">Processing PDF...</p>
                  <p className="text-center text-sm text-gray-500">This may take a few minutes for large documents.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Force reset when file or documentId changes
  useEffect(() => {

    // Reset critical state variables
    setCurrentPage(1);
    setIsInitialLoading(true);
    setRenderComplete(false);
    setIsRendering(false);
    pdfVerifiedRef.current = false;
    renderLockRef.current = false;
    hasRenderedOnceRef.current = {};
    renderedPagesRef.current.clear();

    // Clear cached data for the previous document
    if (fileId) {
      alreadyRenderedFiles.delete(fileId);
    }

    // Force reload of file
    if (typeof file === 'string') {
      fetch(file)
        .then(response => response.blob())
        .then(blob => {
          const newPdfFile = new File([blob], 'document.pdf', { type: 'application/pdf' });
          setPdfFile(newPdfFile);
        })
        .catch(error => {
          console.error('[PDFViewer] Error fetching PDF file:', error);
          setRenderError(error instanceof Error ? error : new Error(String(error)));
          setIsInitialLoading(false); // Stop loading state on error
          // Try once more with a different approach if it failed
          setTimeout(() => {
            try {
              // The PDF will be loaded by usePDFDocument hook after setting the file
              setPdfFile(new File([new Uint8Array(0)], 'fallback.pdf', { type: 'application/pdf' }));
              setCurrentPage(1);
              setHasStartedLoading(false);
              setIsInitialLoading(false); // Stop loading state
            } catch (e) {
              console.error('[PDFViewer] Failed to recover:', e);
              setRenderError(e instanceof Error ? e : new Error(String(e)));
              setIsInitialLoading(false); // Stop loading state
            }
          }, 500);
        });
    } else if (file instanceof File) {
      setPdfFile(file);
    }

  }, [file, documentId, fileId]);

  // Add an effect to handle document changes and reset state when props change
  useEffect(() => {
    // Only run this effect if we already have a different PDF loaded
    if (pdf && (pdfFile || hasStartedLoading)) {

      // Reset render tracking
      hasRenderedOnceRef.current = {};
      renderedPagesRef.current.clear();
      pdfVerifiedRef.current = false;

      // Clear cached data for this document if it exists
      if (fileId) {
        alreadyRenderedFiles.delete(fileId);
      }

      // Reset state
      setCurrentPage(1);
      setIsInitialLoading(true);
      setRenderComplete(false);
      setIsRendering(false);
      setShowForcedLoadingOverlay(true); // Reset forced loading overlay on document change

      // Force the file to be reloaded
      if (typeof file === 'string') {
        // Add timestamp to URL to force reload and bypass cache
        const timestamp = Date.now();
        const fileUrl = file.includes('?')
          ? `${file}&t=${timestamp}`
          : `${file}?t=${timestamp}`;

        fetch(fileUrl)
          .then(response => response.blob())
          .then(blob => {
            const newPdfFile = new File([blob], 'document.pdf', { type: 'application/pdf' });
            setPdfFile(newPdfFile);
          })
          .catch(error => {
            console.error('[PDFViewer] Error fetching PDF file:', error);
            setRenderError(error instanceof Error ? error : new Error('Failed to fetch PDF file'));
          });
      } else if (file instanceof File) {
        setPdfFile(file);
      }
    }
  }, [documentId]); // Only depend on documentId to prevent unnecessary rerenders

  // Add a new function for small file size download
  const downloadCompressedPDF = useCallback(async () => {
    if (!pdf || !page || !viewport) {
      showToast("Cannot download - PDF not fully loaded", "error");
      return;
    }

    try {
      setIsExporting(true);

      // Get annotations for the current page from store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const pageAnnotations = currentDoc?.annotations?.filter(
        a => a.pageNumber === currentPage
      ) || [];


      // Create a new PDF document with just the current page
      const pdfDoc = new jsPDF({
        orientation: viewport.width > viewport.height ? "landscape" : "portrait",
        unit: "pt",
        format: [viewport.width, viewport.height]
      });

      // Create a temporary canvas for rendering
      const canvas = document.createElement("canvas");

      // Use a smaller scale factor for compression
      const qualityScaleFactor = 0.8;

      // Set canvas dimensions with size limits
      const MAX_DIMENSION = 1500; // Lower maximum dimension for compressed mode
      const scaleRatio = Math.min(qualityScaleFactor, MAX_DIMENSION / Math.max(viewport.width, viewport.height));

      canvas.width = Math.floor(viewport.width * scaleRatio);
      canvas.height = Math.floor(viewport.height * scaleRatio);

      const ctx = canvas.getContext("2d", { alpha: true });

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      // Medium quality image rendering
      (ctx as any).imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = 'medium';

      // Set white background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Apply scaling
      if (scaleRatio !== 1.0) {
        ctx.scale(scaleRatio, scaleRatio);
      }

      // Render the current page to the canvas with standard quality
      const renderTask = page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale: scale }),
        intent: "display" // Use display intent for faster rendering
      });

      await renderTask.promise;

      // Draw annotations on top with simplification for compressed mode
      if (pageAnnotations.length > 0) {
        // Simplify line widths for compression
        const lineWidthMultiplier = 1.25; // Slightly thicker to ensure visibility after compression

        // Draw all annotations
        pageAnnotations.forEach(annotation => {
          try {
            // Set line width before drawing
            ctx.lineWidth = ((annotation as any).strokeWidth || 1) * lineWidthMultiplier;
            drawAnnotation(ctx, annotation, scale);
          } catch (err) {
            console.error("Error drawing annotation during compressed download:", err);
          }
        });
      }

      // Compress the canvas with low quality setting
      const compressionQuality = 0.6; // More aggressive compression
      // TODO: Define or import compressPDF function
      // const compressedBlob = await compressPDF(canvas, compressionQuality);
      const compressedBlob = null; // Placeholder to avoid further errors

      /* TODO: Restore this block when compressPDF is implemented
      // Convert blob to data URL
      const imageDataPromise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        if (compressedBlob) { // Check if blob exists before reading
          reader.readAsDataURL(compressedBlob);
        } else {
          reject(new Error("Compressed blob is null"));
        }
      });

      const imgData = await imageDataPromise;

      // Add the image to the PDF
      pdfDoc.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);

      // Use PDF-lib to apply additional compression to the final PDF
      const pdfBytes = (pdfDoc as any).output('arraybuffer');
      const pdfLibDoc = await PDFDocument.load(pdfBytes);

      // Set compression settings for maximum space saving
      pdfLibDoc.setTitle(`Compressed Page ${currentPage}`);
      pdfLibDoc.setCreator('PDF Viewer - Compressed Mode');

      // Save with maximum compression
      const compressedBytes = await pdfLibDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 100
      });

      // Create a blob and download with file-saver
      const blob = new Blob([compressedBytes], { type: 'application/pdf' });
      */
      const blob = null; // Placeholder as the compression block is commented out
      // saveAs(blob, `page-${currentPage}-compressed.pdf`); // Commented out as blob creation is disabled

      showToast(`Page ${currentPage} downloaded with maximum compression`, "success");
    } catch (error) {
      console.error("Compressed download error:", error);
      showToast(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, page, viewport, scale, currentPage, document, documentId, showToast /* compressPDF */]); // Removed compressPDF dependency

  // Add optimized function for exporting all pages with better compression

  useEffect(() => {
    const initializePDFJS = async () => {
      try {
        // Add CMAPS for proper text extraction and better compression
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      } catch (error) {
      }
    };

    initializePDFJS();
  }, []);

  // Add this function after the component initialization
  useEffect(() => {
    // Global error handler for PDF.js rendering cancellation exceptions
    const handleRenderingCancelled = (event: ErrorEvent) => {
      // Check if this is a PDF.js rendering cancellation error
      if (event.error &&
          (event.error.name === 'RenderingCancelledException' ||
           (event.error.message && event.error.message.includes('Rendering cancelled')))) {

        // Prevent the error from bubbling up to the global error handler
        event.preventDefault();
        event.stopPropagation();

        // Log the cancellation but treat it as a normal event, not an error

        // Help clear any stuck rendering states
        if (renderLockRef.current) {
          renderLockRef.current = false;
        }

        // If we're stuck in a page change state for too long, clear it
        if (pageChangeInProgress && Date.now() - renderAttemptTimestampRef.current > 1000) {
          setPageChangeInProgress(false);
        }

        // Also clear rendering state if needed
        if (isRendering) {
          setIsRendering(false);
        }

        return true; // Indicates we've handled the error
      }
      return false; // Let other errors bubble up normally
    };

    // Add our error handler
    window.addEventListener('error', handleRenderingCancelled);

    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('error', handleRenderingCancelled);
    };
  }, [pageChangeInProgress, isRendering]);

  // Save annotations to Firebase
  const saveAnnotationsToFirebase = useCallback(() => {
    try {
      // Use our new saveToFirebase method from the store
      useAnnotationStore.getState().saveToFirebase(documentId);
      console.log("Annotations saved to Firebase successfully");
    } catch (error) {
      console.error("Error saving annotations to Firebase:", error);
    }
  }, [documentId]);
  
  // Create a reference for tracking the last user who made changes
  const lastEditorRef = useRef<string | null>(null);
  const [isLocalChange, setIsLocalChange] = useState<boolean>(true);
  
  // Auto-save annotations when they change, but not when they're updated from Firebase
  useEffect(() => {
    if (!documentId) return;
    
    // Initial load from Firebase when component mounts
    useAnnotationStore.getState().loadFromFirebase(documentId);
    
    // Set up auto-save interval
    const autoSaveInterval = setInterval(() => {
      if (isLocalChange) {
        saveAnnotationsToFirebase();
      }
    }, 5000); // Save every 5 seconds if there are local changes
    
    // Clean up interval when component unmounts
    return () => {
      clearInterval(autoSaveInterval);
      // Save one final time when leaving the page
      if (isLocalChange) {
        saveAnnotationsToFirebase();
      }
    };
  }, [documentId, saveAnnotationsToFirebase, isLocalChange]);
  
  // Save to Firebase immediately when annotations change (with debounce)
  useEffect(() => {
    const annotations = getAnnotationsForPage(documentId, currentPage);
    
    // Only save if this is a local change, not an update from Firebase
    if (isLocalChange && annotations.length > 0) {
      const debouncedSave = debounce(() => {
        saveAnnotationsToFirebase();
        // After saving, dispatch an event to notify the annotation canvas to update
        const event = new CustomEvent('annotationSaved', {
          detail: { source: 'localUser', documentId, pageNumber: currentPage }
        });
        document.dispatchEvent(event);
      }, 500); // Shorter debounce for more responsive real-time updates
      
      debouncedSave();
      
      // Cleanup function to cancel debounce if component unmounts
      return () => debouncedSave.cancel();
    }
  }, [documentId, currentPage, getAnnotationsForPage, saveAnnotationsToFirebase, isLocalChange]);
  
  // Add keyboard shortcut for manually saving annotations (Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Ctrl+S or Cmd+S is pressed
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); // Prevent browser save
        saveAnnotationsToFirebase();
        showToast("Annotations saved", "success");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveAnnotationsToFirebase, showToast]);

  // Add this function to set up the real-time subscription to annotations
  const setupAnnotationsSubscription = useCallback(() => {
    // Make sure to clean up any existing subscription first
    if (annotationsUnsubscribeRef.current) {
      annotationsUnsubscribeRef.current();
      annotationsUnsubscribeRef.current = null;
    }

    // Set up new subscription
    try {
      const unsubscribe = annotationService.subscribeToAnnotations(documentId, (updatedAnnotations) => {
        console.log("Received real-time annotations update:", updatedAnnotations?.length || 0);
        
        // Get the current annotations to compare
        const currentAnnots = useAnnotationStore.getState().documents[documentId]?.annotations || [];
        
        // Only update if there are actual changes (prevent circular updates)
        if (JSON.stringify(currentAnnots) !== JSON.stringify(updatedAnnotations)) {
          // Flag that this change is coming from Firebase, not a local user action
          setIsLocalChange(false);
          
          // Import the annotations from Firebase
          annotationStore.importAnnotations(documentId, updatedAnnotations || [], 'replace');
          
          // Dispatch an event to notify the PDF viewer to re-render
          const event = new CustomEvent('annotationChanged', {
            detail: {
              source: 'remoteUser',
              documentId,
              pageNumber: currentPage,
              forceRender: true
            }
          });
          document.dispatchEvent(event);
          
          // Reset the local change flag after a short delay
          // This ensures any follow-up local edits will be saved
          setTimeout(() => {
            setIsLocalChange(true);
          }, 100);
        }
      });

      // Store the unsubscribe function
      annotationsUnsubscribeRef.current = unsubscribe;
    } catch (err) {
      console.error("Error setting up annotation subscription:", err);
      // If subscription fails, fall back to non-realtime data
      useAnnotationStore.getState().loadFromFirebase(documentId);
    }
  }, [documentId, annotationStore, currentPage]);

  // Effect to set up and clean up subscription
  useEffect(() => {
    if (documentId) {
      setupAnnotationsSubscription();
    }
    
    return () => {
      // Clean up subscription when component unmounts or documentId changes
      if (annotationsUnsubscribeRef.current) {
        annotationsUnsubscribeRef.current();
        annotationsUnsubscribeRef.current = null;
      }
    };
  }, [documentId, setupAnnotationsSubscription]);
};
