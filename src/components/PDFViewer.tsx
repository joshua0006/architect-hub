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
import { KeyboardShortcutGuide } from "./KeyboardShortcutGuide";
import { useKeyboardShortcutGuide } from "../hooks/useKeyboardShortcutGuide";
import { jsPDF } from "jspdf";
import * as pdfjs from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";

interface PDFViewerProps {
  file: File | string;
  documentId: string;
  documentName?: string; // Add this parameter to use for downloaded file names
  onDownloadCompressed?: (url: string, filename: string, annotations?: Annotation[], pageFilter?: number) => Promise<void>;
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

export const PDFViewer: React.FC<PDFViewerProps> = ({ file, documentId, documentName, onDownloadCompressed }) => {
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
        console.log('[PDFViewer] Saved scroll position:', finalScrollPosition);
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
      console.log('[PDFViewer] Restoring saved scroll position:', lastScrollPositionRef.current);
      scrollContainer.scrollLeft = lastScrollPositionRef.current.x;
      scrollContainer.scrollTop = lastScrollPositionRef.current.y;
      return;
    }
    
    // Calculate center position if no saved position exists
    const viewportWidth = scrollContainer.clientWidth;
    const viewportHeight = scrollContainer.clientHeight;
    
    // Make sure we have an accurate viewport size
    if (!viewport) {
      // If no viewport, try to create one with current scale
      try {
        const tempViewport = page.getViewport({ scale });
        const contentWidth = tempViewport.width;
        const contentHeight = tempViewport.height;
        
        // Calculate scroll positions
        const scrollLeft = Math.max(0, (contentWidth - viewportWidth) / 2);
        const scrollTop = Math.max(0, (contentHeight - viewportHeight) / 2);
        
        // Scroll to center
        scrollContainer.scrollLeft = scrollLeft;
        scrollContainer.scrollTop = scrollTop;
        
        console.log(`[PDFViewer] Centered document using temp viewport: scrollLeft=${scrollLeft}, scrollTop=${scrollTop}`);
      } catch (err) {
        console.error('[PDFViewer] Error centering document:', err);
      }
      return;
    }
    
    // Use the existing viewport if available
    const contentWidth = viewport.width;
    const contentHeight = viewport.height;
    
    // Calculate scroll positions
    const scrollLeft = Math.max(0, (contentWidth - viewportWidth) / 2);
    const scrollTop = Math.max(0, (contentHeight - viewportHeight) / 2);
    
    // Scroll to center
    scrollContainer.scrollLeft = scrollLeft;
    scrollContainer.scrollTop = scrollTop;
    
    console.log(`[PDFViewer] Centered document: scrollLeft=${scrollLeft}, scrollTop=${scrollTop}`);
  }, [page, viewport, isDragging, scale]);

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
      console.log('[PDFViewer] Navigation ignored - export in progress');
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
    
    console.log('[PDFViewer] Navigating to previous page:', prevPage);
    
    // Set the page change flag
    setPageChangeInProgress(true);
    
    // Reset rendering state
    setIsRendering(false);
    
    // Change the page
    setCurrentPage(prevPage);
    
    // Set a timeout to clear the transition flag after navigation is complete
    setTimeout(() => {
      navigationTransitionRef.current = false;
      console.log('[PDFViewer] Navigation transition complete, rendering can proceed');
    }, 300);
  }, [currentPage, isExporting]);

  const handleNextPage = useCallback(() => {
    // Don't allow navigation while exporting
    if (isExporting) {
      console.log('[PDFViewer] Navigation ignored - export in progress');
      return;
    }
    
    // Check if we can navigate to the next page
    const nextPage = Math.min(currentPage + 1, pdf?.numPages || currentPage);
    if (nextPage === currentPage) {
      return; // Already on last page
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
    
    console.log('[PDFViewer] Navigating to next page:', nextPage);
    
    // Set the page change flag
    setPageChangeInProgress(true);
    
    // Reset rendering state
    setIsRendering(false);
    
    // Change the page
    setCurrentPage(nextPage);
    
    // Set a timeout to clear the transition flag after navigation is complete
    setTimeout(() => {
      navigationTransitionRef.current = false;
      console.log('[PDFViewer] Navigation transition complete, rendering can proceed');
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
        console.log('[PDFViewer] Skipping render during navigation transition');
        return;
      }

      // Check if render lock is active, which prevents overlapping renders
      if (renderLockRef.current) {
        // If we're already rendering a different page, cancel that render
        if (currentRenderingPageRef.current !== null && 
            currentRenderingPageRef.current !== currentPage) {
          console.log(`[PDFViewer] Cancelling render of page ${currentRenderingPageRef.current} to render current page ${currentPage}`);
          
          // Cancel the current render task
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
              renderTaskRef.current = null;
            } catch (error) {
              console.warn('[PDFViewer] Error cancelling existing render task:', error);
            }
          }
          
          // Release the render lock
          renderLockRef.current = false;
          currentRenderingPageRef.current = null;
        } else {
          // If we're already rendering the current page, don't start another render
          console.log(`[PDFViewer] Render lock is active for page ${currentRenderingPageRef.current}, skipping render of page ${currentPage}`);
          return;
        }
      }

      // Skip if we don't have all the required elements
      if (!canvasRef.current || !pdf || !fileId) {
        // If we're in the middle of a page change but we don't have required elements,
        // we should reset the flag to avoid getting stuck
        if (pageChangeInProgress) {
          console.log('[PDFViewer] Resetting page change state - missing required elements');
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

      // Calculate quality multiplier based on scale
      // Higher zoom levels use higher quality rendering for better text clarity
      const qualityMultiplier = scale > 2.5 ? 2.0 : 
                               scale > 1.5 ? 1.5 : 
                               scale > 1.0 ? 1.2 : 1.0;
      
      // Generate a cache key based on fileId, scale, and quality multiplier
      const cacheKey = `${fileId}_${scale.toFixed(2)}_${qualityMultiplier.toFixed(1)}`;
      
      // Check if we have this page cached
      if (pageCanvasCache.has(cacheKey)) {
        const pageCache = pageCanvasCache.get(cacheKey)!;
        if (pageCache.has(currentPage)) {
          console.log(`[PDFViewer] Using cached page ${currentPage}`);
          
          // Draw the cached image data
          ctx.putImageData(pageCache.get(currentPage)!, 0, 0);
          
          // Update timestamp to mark this page as recently used
          const timestampMap = pageCacheTimestamps.get(cacheKey) || new Map<number, number>();
          timestampMap.set(currentPage, Date.now());
          pageCacheTimestamps.set(cacheKey, timestampMap);
          
          // Mark this page as rendered
          if (!hasRenderedOnceRef.current[currentPage]) {
            hasRenderedOnceRef.current[currentPage] = true;
          }
          renderedPagesRef.current.add(currentPage);
          cachedPagesRef.current.add(currentPage);
          
          // Update states to reflect completion
          setPageChangeInProgress(false);
          setIsRendering(false);
          setRenderComplete(true);
          
          // Dispatch annotation rendering event
          let annotations: any[] = [];
          try {
            if (documentId && currentPage) {
              annotations = annotationStore.documents[documentId]?.annotations?.filter(
                (a: any) => a.pageNumber === currentPage
              ) || [];
            }
          } catch (err) {
            console.warn('[PDFViewer] Error accessing annotations:', err);
          }
          
          setCurrentAnnotations(annotations);
          document.dispatchEvent(
            new CustomEvent('renderAnnotations', {
              detail: { 
                pageNumber: currentPage,
                annotations 
              },
            })
          );
          
          // Center the document after a brief delay
          setTimeout(() => {
            scrollToCenterDocument();
          }, 50);
          
          return;
        }
      }

      // Cancel any in-progress render tasks
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (error) {
          console.warn('[PDFViewer] Error cancelling existing render task:', error);
        }
        renderTaskRef.current = null;
        currentRenderingPageRef.current = null;
      }

      // Set render lock to prevent overlapping renders
      renderLockRef.current = true;
      currentRenderingPageRef.current = currentPage;
      
      // Set state to indicate rendering is in progress
      setIsRendering(true);
      
      // Log only when starting a new render (not for retries)
      console.log(`[PDFViewer] Rendering page ${currentPage} with quality multiplier ${qualityMultiplier}`);

      // Get the PDF page
      pdf.getPage(currentPage).then(
        (page) => {
          try {
            // Double check we're still rendering the current page
            // If page changed during loading, abort this render
            if (currentPage !== currentRenderingPageRef.current) {
              console.log(`[PDFViewer] Page changed during loading (from ${currentRenderingPageRef.current} to ${currentPage}), aborting render`);
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
            
            // Apply quality multiplier to the viewport scale for better text quality
            // but render at the display scale for proper sizing
            viewport = page.getViewport({ scale: displayScale * qualityMultiplier });

            // Set canvas dimensions to match the high-quality viewport
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Scale down the display canvas size to match the display scale
            // This maintains the same visual size while rendering at higher resolution
            canvas.style.width = `${viewport.width / qualityMultiplier}px`;
            canvas.style.height = `${viewport.height / qualityMultiplier}px`;
            
            // Enable high-quality image rendering on the context
            (ctx as any).imageSmoothingEnabled = true;
            (ctx as any).imageSmoothingQuality = 'high';

            // Define render parameters with enhanced text rendering
            const renderContext = {
              canvasContext: ctx,
              viewport: viewport,
              // Use print intent for better text quality at high zoom levels
              intent: scale > 1.5 ? "print" : "display"
            };

            // Store the timestamp when render started
            const renderStartTime = Date.now();
            
            // Start the render task
            renderTaskRef.current = page.render(renderContext);
            
            // Handle successful render
            renderTaskRef.current.promise.then(
              () => {
                // Check if this is still the current page
                if (currentPage !== currentRenderingPageRef.current) {
                  console.log(`[PDFViewer] Page changed during rendering (from ${currentRenderingPageRef.current} to ${currentPage}), discarding results`);
                  renderLockRef.current = false;
                  currentRenderingPageRef.current = null;
                  return;
                }
              
                // Cache the rendered page
                try {
                  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                  
                  // Initialize cache maps if needed
                  if (!pageCanvasCache.has(cacheKey)) {
                    pageCanvasCache.set(cacheKey, new Map<number, ImageData>());
                    pageCacheTimestamps.set(cacheKey, new Map<number, number>());
                  }
                  
                  const pageCache = pageCanvasCache.get(cacheKey)!;
                  const timestampMap = pageCacheTimestamps.get(cacheKey)!;
                  
                  // Add the page to cache
                  pageCache.set(currentPage, imageData);
                  timestampMap.set(currentPage, Date.now());
                  
                  // Prune cache if it's getting too large
                  if (pageCache.size > MAX_CACHED_PAGES) {
                    // Find the oldest page
                    let oldestPage = currentPage;
                    let oldestTime = Date.now();
                    
                    timestampMap.forEach((timestamp, page) => {
                      if (timestamp < oldestTime) {
                        oldestTime = timestamp;
                        oldestPage = page;
                      }
                    });
                    
                    // Remove the oldest page from cache
                    if (oldestPage !== currentPage) {
                      pageCache.delete(oldestPage);
                      timestampMap.delete(oldestPage);
                      console.log(`[PDFViewer] Removed page ${oldestPage} from cache to free up space`);
                    }
                  }
                  
                  // Mark this page as cached
                  cachedPagesRef.current.add(currentPage);
                } catch (err) {
                  console.error('[PDFViewer] Error caching page:', err);
                  // Continue with rendering even if caching fails
                }
                
                // Log the render timing
                const renderDuration = Date.now() - renderStartTime;
                console.log(`[PDFViewer] Page ${currentPage} rendered successfully in ${renderDuration}ms`);
                
                // Reset render lock
                renderLockRef.current = false;
                currentRenderingPageRef.current = null;
                
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
                  console.log(`[PDFViewer] Will retry rendering page ${currentPage} (attempt ${renderAttempts + 1}/3)`);
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
                    console.log('[PDFViewer] Rendering cancelled due to page change, continuing...');
                  } else if (isCancelled) {
                    console.log('[PDFViewer] Rendering cancelled, but not due to page change. Resetting state.');
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
    pdf, 
    currentPage, 
    scale, 
    canvasRef, 
    containerRef, 
    fileId, 
    documentId, 
    annotationStore, 
    pageChangeInProgress, 
    scrollToCenterDocument,
    renderAttempts
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
      
      console.log(`[PDFViewer] Cleared cache for file ${fileId}`);
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
        console.log('[PDFViewer] Force clearing page change state after timeout');
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
      console.log(`[PDFViewer] Page change detected to page ${currentPage}, preparing render`);
      
      // Reset render tracking state for the new page to force a fresh render
      hasRenderedOnceRef.current[currentPage] = false;
      renderedPagesRef.current.delete(currentPage);
      
      // Wait for a longer delay before initiating rendering to ensure navigation is complete
      const navigationCompleteDelay = 300; // 300ms to ensure navigation is done
      
      // Schedule the render to occur after navigation is complete
      navigationCompleteTimeout = setTimeout(() => {
        // Mark navigation as complete
        navigationTransitionRef.current = false;
        console.log(`[PDFViewer] Navigation transition complete for page ${currentPage}, can safely render now`);
        
        try {
          // Make sure we're not in a page change state anymore
          if (pageChangeInProgress) {
            // Start the render process with a small delay
            const renderDelayMs = 50;
            
            safetyRenderTimeout = setTimeout(() => {
              try {
                // Additional safety check to make sure we're still in a page change
                if (!pageChangeInProgress) {
                  console.log('[PDFViewer] Page change state changed during delay, aborting render');
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
                console.log(`[PDFViewer] Initiating render for page ${currentPage} after navigation complete + ${renderDelayMs}ms delay`);
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
                      console.log('[PDFViewer] Attempting recovery render after state reset');
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
            console.log('[PDFViewer] Page change state cleared before rendering could start');
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
  useEffect(() => {
    // Skip if there's no valid page to render or necessary components
    if (!page || !canvasRef.current || !fileId || !pdf) {
      return;
    }
    
    // If we were navigating to this page, the dedicated page change effect will handle it
    if (pageChangeInProgress) {
      return;
    }
    
    // Don't render if there's an active render
    if (isRendering || renderLockRef.current) {
      console.log("[PDFViewer] Skipping render - already in progress");
      return;
    }
    
    // Check for annotation-only updates from AnnotationCanvas
    const annotationCanvas = document.querySelector('.annotation-canvas-container canvas') as HTMLCanvasElement;
    const isAnnotationUpdate = annotationCanvas?.dataset?.forceRender === 'true';
    
    // Only skip rendering if this isn't an annotation update and the page has already been rendered
    if (!isAnnotationUpdate && 
        hasRenderedOnceRef.current[currentPage] && 
        (renderedPagesRef.current.has(currentPage) || 
          alreadyRenderedFiles.get(fileId)?.has(currentPage))) {
      
      // Ensure state is set correctly
      setRenderComplete(true);
      setIsRendering(false);
      
      // Make sure the page is centered
      setTimeout(() => {
        scrollToCenterDocument();
      }, 100);
      
      return;
    }
    
    // Start the rendering process
    setIsRendering(true);
    
    // Log rendering reason
    if (isAnnotationUpdate) {
      console.log(`[PDFViewer] Rendering page ${currentPage} for annotation update`);
    } else {
      console.log(`[PDFViewer] Rendering page ${currentPage} (initial or forced render)`);
    }
    
    // Initialize file tracking if needed
    if (!alreadyRenderedFiles.has(fileId)) {
      alreadyRenderedFiles.set(fileId, new Set());
    }
    
    // Render the PDF page
    renderPdfPage();
  }, [page, canvasRef, renderPdfPage, isRendering, pageChangeInProgress, fileId, pdf, currentPage, scrollToCenterDocument]);

  // Mark viewer as ready when the PDF is loaded
  useEffect(() => {
    if (!pdf) {
      setIsViewerReady(false);
      return;
    }
    
    console.log(`[PDFViewer] PDF document loaded with ${pdf.numPages} pages`);
    
    // Mark the viewer as ready
    setIsViewerReady(true);
    
    // Reset render state to ensure first page renders properly
    setRenderComplete(false);
    setIsRendering(false);
    
  }, [pdf]);

  // Define function for fitting to width - placed at the top of other functions
  const handleFitToWidth = useCallback(() => {
    if (!page || !containerRef.current) return;
    
    const container = containerRef.current;
    
    // Use the scroll container instead of the outer container for more accurate width
    const scrollContainer = container.querySelector('.overflow-auto') as HTMLElement;
    if (!scrollContainer) {
      console.warn('[PDFViewer] Could not find scroll container, falling back to container width');
    }
    
    // Get the viewable area width from the scroll container if available
    const viewportWidth = scrollContainer ? scrollContainer.clientWidth : container.clientWidth;
    
    // Account for padding (16px total for p-2 or 32px for p-4)
    const padding = 32; 
    const availableWidth = viewportWidth - padding;
    
    // Get the intrinsic dimensions of the PDF page
    const viewport = page.getViewport({ scale: 1 });
    const aspectRatio = viewport.height / viewport.width;
    
    // Calculate scale needed to fit exactly to width
    const newScale = availableWidth / viewport.width;
    
    // Calculate new dimensions
    const newWidth = viewport.width * newScale;
    const newHeight = viewport.height * newScale;
    
    // Log the dimensions and scaling for debugging
    console.log(`[PDFViewer] Viewable width: ${viewportWidth}px (scrollContainer: ${!!scrollContainer})`);
    console.log(`[PDFViewer] Original PDF dimensions: ${viewport.width}x${viewport.height}`);
    console.log(`[PDFViewer] Aspect ratio: ${aspectRatio.toFixed(3)}`);
    console.log(`[PDFViewer] Available width for scaling: ${availableWidth}px`);
    console.log(`[PDFViewer] New scale: ${newScale.toFixed(3)}`);
    console.log(`[PDFViewer] New dimensions: ${newWidth.toFixed(0)}x${newHeight.toFixed(0)}`);
    
    // Force clear ALL rendering caches before changing scale
    hasRenderedOnceRef.current = {};
    renderedPagesRef.current.clear();
    cachedPagesRef.current.clear();
    pageCanvasCache.clear();
    pageCacheTimestamps.clear();
    
    // Clear any existing render task
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    
    // Reset render lock to ensure rendering can proceed
    renderLockRef.current = false;
    
    // Clear last scroll position to ensure proper centering
    lastScrollPositionRef.current = null;
    
    // Update the scale
    setScale(newScale);
    
    // Trigger a fresh render after setting the scale
    setTimeout(() => {
      setIsRendering(true);
      setRenderComplete(false);
      
      // Force a new render
      if (typeof renderPdfPage === 'function') {
        renderPdfPage();
      }
      
      // Then center the document after rendering completes
      setTimeout(() => {
        scrollToCenterDocument();
      }, 200);
    }, 50);
    
    // Enable automatic fit for future page changes
    disableFitToWidthRef.current = false;
    
    console.log(`[PDFViewer] Fit to width: scale=${newScale}`);
  }, [page, scrollToCenterDocument, renderPdfPage]);

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
    
    console.log(`[PDFViewer] Zoom in: scale=${cappedScale}`);
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
    
    console.log(`[PDFViewer] Zoom out: scale=${cappedScale}`);
  }, [page, scale]);

  const handleResetZoom = useCallback(() => {
    if (!page || !containerRef.current) return;
    
    // Force clear ALL rendering caches before changing scale
    hasRenderedOnceRef.current = {};
    renderedPagesRef.current.clear();
    cachedPagesRef.current.clear();
    pageCanvasCache.clear();
    pageCacheTimestamps.clear();
    
    // Clear any existing render task
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    
    // Reset render lock to ensure rendering can proceed
    renderLockRef.current = false;
    
    // Clear last scroll position to ensure proper centering
    lastScrollPositionRef.current = null;
    
    // Reset to 100%
    setScale(1.0);
    
    // Reset rendering state
    setIsRendering(true);
    setRenderComplete(false);
    
    // Disable automatic fit to width for future page changes
    disableFitToWidthRef.current = true;
    
    // Trigger a fresh render and center the document
    setTimeout(() => {
      // Force a new render
      if (typeof renderPdfPage === 'function') {
        renderPdfPage();
      }
      
      // Center the document after rendering completes
      setTimeout(() => {
        scrollToCenterDocument();
      }, 200);
    }, 50);
    
    console.log(`[PDFViewer] Reset zoom: scale=1.0`);
  }, [page, scrollToCenterDocument, renderPdfPage]);

  // Setup container dimensions
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Track previous dimensions to prevent unnecessary rerenders
    let prevWidth = 0;
    let prevHeight = 0;
    
    const updateContainerSize = () => {
      const container = containerRef.current;
      if (!container) return;
      
      // Get the scroll container for more accurate width
      const scrollContainer = container.querySelector('.overflow-auto') as HTMLElement;
      
      // Use a small timeout to ensure DOM is fully updated
      setTimeout(() => {
        // Get dimensions from the actual visible area if available
        const width = scrollContainer ? scrollContainer.clientWidth : container.clientWidth;
        const height = scrollContainer ? scrollContainer.clientHeight : container.clientHeight;
        
        // Skip if the dimensions haven't changed significantly or are zero
        if ((Math.abs(width - prevWidth) < 5 && Math.abs(height - prevHeight) < 5) || 
            width <= 0 || height <= 0) {
          return;
        }
        
        // If width changed significantly, we care more about that for fit-to-width
        const widthChangedSignificantly = Math.abs(width - prevWidth) > 20;
        
        // Update previous dimensions
        prevWidth = width;
        prevHeight = height;
        
        // Update state
        setContainerWidth(width);
        setContainerHeight(height);
        
        // Reapply fit-to-width when container dimensions change
        // and we have a page loaded
        if (page && !disableFitToWidthRef.current) {
          console.log(`[PDFViewer] Container dimensions changed: ${width}x${height}, reapplying fit width`);
          
          // Add a small delay to ensure measurements are accurate
          setTimeout(() => {
            // Clear rendering status to force a fresh render
            hasRenderedOnceRef.current = {};
            renderedPagesRef.current.clear();
            
            // Clear any existing render task
            if (renderTaskRef.current) {
              renderTaskRef.current.cancel();
              renderTaskRef.current = null;
            }
            
            // Reset render lock to ensure rendering can proceed
            renderLockRef.current = false;
            
            // For significant width changes, recalculate fit-to-width
            if (widthChangedSignificantly) {
              // Apply fit to width
              handleFitToWidth();
            } else {
              // Just rerender with current scale
              renderPdfPage();
              
              // Ensure the document is centered properly
              setTimeout(() => {
                scrollToCenterDocument();
              }, 150);
            }
          }, 200);
        }
      }, 0);
    };
    
    // Initial size
    updateContainerSize();
    
    // Update on resize
    const resizeObserver = new ResizeObserver((entries) => {
      // Use requestAnimationFrame for smoother handling
      window.requestAnimationFrame(() => {
        updateContainerSize();
      });
    });
    
    resizeObserver.observe(containerRef.current);
    
    // Also handle window resize events for more reliable updates
    const handleWindowResize = () => {
      // Use debounce technique to avoid too many updates
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(() => {
          updateContainerSize();
        });
      } else {
        // Fallback for browsers without requestAnimationFrame
        setTimeout(updateContainerSize, 50);
      }
    };
    
    window.addEventListener('resize', handleWindowResize);
    
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [page, handleFitToWidth, renderPdfPage, scrollToCenterDocument]);

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
        setScale(newScale);
        
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
      
      console.log(`[PDFViewer] Exporting page ${currentPage} with ${pageAnnotations.length} annotations`);
      
      // Create a canvas with both PDF and annotations
      const exportCanvas = await createExportCanvas(
        page, 
        scale, 
        pageAnnotations
      );

      // Ensure annotations are drawn at the correct scale
      if (pageAnnotations.length > 0) {
        const ctx = exportCanvas.canvas.getContext('2d');
        if (ctx) {
          // Draw annotations on top of the PDF content
          pageAnnotations.forEach(annotation => {
            try {
              drawAnnotation(ctx, annotation, scale);
            } catch (error) {
              console.error("Error drawing annotation for export:", error, annotation);
            }
          });
        }
      }
      
      if (format === "pdf") {
        // Export to PDF with correct dimensions
        exportToPDF(
          exportCanvas.canvas, 
          { width: viewport.width, height: viewport.height },
          currentPage
        );
        showToast("PDF exported successfully with annotations", "success");
      } else {
        // Export to PNG
        exportToPNG(exportCanvas.canvas, currentPage);
        showToast("PNG exported successfully with annotations", "success");
      }
    } catch (error) {
      console.error("Export error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [page, canvasRef, viewport, scale, currentPage, document, documentId, showToast]);
  
  // Create a single optimized download function with quality preservation
  const downloadOptimizedPDF = useCallback(async (highQuality = false) => {
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
      
      console.log(`[PDFViewer] Downloading page ${currentPage} with ${pageAnnotations.length} annotations (high quality: ${highQuality})`);
      
      // Create a new PDF document with just the current page
      const pdfDoc = new jsPDF({
        orientation: viewport.width > viewport.height ? "landscape" : "portrait",
        unit: "pt",
        format: [viewport.width, viewport.height]
      });
      
      // Create a temporary canvas for rendering
      const canvas = document.createElement("canvas");
      
      // For high quality rendering, use a scale factor to improve line rendering
      const qualityScaleFactor = highQuality ? 1.5 : 1.0;
      
      // Set canvas dimensions with some size limits for very large pages
      const MAX_DIMENSION = highQuality ? 3000 : 2000;
      const scaleRatio = Math.min(1 * qualityScaleFactor, MAX_DIMENSION / Math.max(viewport.width, viewport.height));
      
      canvas.width = Math.floor(viewport.width * scaleRatio);
      canvas.height = Math.floor(viewport.height * scaleRatio);
      
      const ctx = canvas.getContext("2d", { alpha: true });
      
      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }
      
      // Enable high-quality image rendering
      (ctx as any).imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = 'high';
      
      // For line preservation, draw with crisp edges
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      // Set white background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // If we needed to scale, adjust the context transform
      if (scaleRatio !== 1.0) {
        ctx.scale(scaleRatio, scaleRatio);
      }
      
      // Render the current page to the canvas with high quality settings
      const renderTask = page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale: scale }),
        intent: "display" // Use "print" for higher quality but possible slower rendering
      });
      
      await renderTask.promise;
      
      // Draw annotations on top if there are any
      if (pageAnnotations.length > 0) {
        console.log(`[PDFViewer] Drawing ${pageAnnotations.length} annotations on download canvas`);
        
        // Use a slightly thicker line width for annotations to ensure they remain visible
        const lineWidthMultiplier = highQuality ? 1.0 : 1.2;
        
        // Draw regular annotations first
        const regularAnnotations = pageAnnotations.filter(a => a.type !== 'highlight');
        regularAnnotations.forEach(annotation => {
          try {
            // Set line width before drawing
            ctx.lineWidth = ((annotation as any).strokeWidth || 1) * lineWidthMultiplier;
            drawAnnotation(ctx, annotation, scale);
          } catch (err) {
            console.error("Error drawing annotation during download:", err);
          }
        });
        
        // Draw highlights with multiply blend mode
        const highlightAnnotations = pageAnnotations.filter(a => a.type === 'highlight');
        if (highlightAnnotations.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          
          highlightAnnotations.forEach(annotation => {
            try {
              drawAnnotation(ctx, annotation, scale);
            } catch (err) {
              console.error("Error drawing highlight during download:", err);
            }
          });
          
          ctx.restore();
        }
      }
      
      // Convert to data URL with format based on content type and quality settings
      const processImage = async () => {
        try {
          // Use PNG format for high quality to preserve line thickness
          // or JPEG with high quality setting for regular quality
          const imageFormat = highQuality ? 'image/png' : 'image/jpeg';
          const imageQuality = highQuality ? undefined : 0.92;  // PNG doesn't use quality, JPEG uses 0.92 (higher quality)
          
          // Create data URL with appropriate format
          const dataUrl = canvas.toDataURL(imageFormat, imageQuality);
          
          // For very large images, convert directly to Blob to avoid string length issues
          if (canvas.width * canvas.height > 4000000) { // 4 million pixels threshold
            // Convert data URL to Blob using chunking
            const byteString = atob(dataUrl.split(',')[1]);
            const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
            
            // Use chunking for large files
            const chunkSize = 1024 * 1024; // 1MB chunks
            const chunks = Math.ceil(byteString.length / chunkSize);
            const byteArrays = new Array(chunks);
            
            for (let i = 0; i < chunks; i++) {
              const offset = i * chunkSize;
              const length = Math.min(byteString.length - offset, chunkSize);
              
              const byteNumbers = new Array(length);
              for (let j = 0; j < length; j++) {
                byteNumbers[j] = byteString.charCodeAt(offset + j);
              }
              
              byteArrays[i] = new Uint8Array(byteNumbers);
            }
            
            // Create blob and convert to data URL
            const blob = new Blob(byteArrays, { type: mimeType });
            
            // Use FileReader to convert Blob to data URL
            return new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
          
          // For smaller images, return the data URL directly
          return dataUrl;
        } catch (error) {
          console.error('[PDFViewer] Error processing image:', error);
          throw error;
        }
      };
      
      // Get the processed image data
      const imgData = await processImage();
      
      // Add the image to the PDF - preserve dimensions
      pdfDoc.addImage(imgData, highQuality ? 'PNG' : 'JPEG', 0, 0, viewport.width, viewport.height);
      
      // Save the PDF with an optimized name
      const qualitySuffix = highQuality ? '-hq' : '-optimized';
      const fileName = `page-${currentPage}${documentId ? `-${documentId}` : ''}${qualitySuffix}.pdf`;
      pdfDoc.save(fileName);
      
      showToast(`Page ${currentPage} downloaded with ${highQuality ? 'high' : 'optimized'} quality`, "success");
    } catch (error) {
      console.error("Download error:", error);
      showToast(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, page, viewport, scale, currentPage, document, documentId, showToast]);
  
  // Add a function to download in high quality
  const downloadHighQualityPDF = useCallback(async () => {
    if (!pdf) {
      showToast("Cannot download - PDF not fully loaded", "error");
      return;
    }
    
    try {
      setIsExporting(true);
      showToast("Preparing full PDF download in high quality...", "success");
      
      // Get all annotations for the document from store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const allAnnotations = currentDoc?.annotations || [];
      
      console.log(`[PDFViewer] Downloading entire document with ${allAnnotations.length} annotations in high quality`);
      
      // Create a new PDF document to hold all pages
      const firstPage = await pdf.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1.0 });
      
      const pdfDoc = new jsPDF({
        orientation: firstViewport.width > firstViewport.height ? "landscape" : "portrait",
        unit: "pt",
        format: [firstViewport.width, firstViewport.height]
      });
      
      // For the first page we don't need to add a new page
      let isFirstPage = true;
      
      // Process each page of the PDF
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        // Show progress in toast
        showToast(`Processing page ${pageNum} of ${pdf.numPages}...`, "success");
        
        // Get the page
        const pageObj = await pdf.getPage(pageNum);
        const viewport = pageObj.getViewport({ scale: 1.0 });
        
        // Add a new page for all pages after the first
        if (!isFirstPage) {
          pdfDoc.addPage([viewport.width, viewport.height]);
        } else {
          isFirstPage = false;
        }
        
        // Get annotations for the current page
        const pageAnnotations = allAnnotations.filter(a => a.pageNumber === pageNum);
        
        // Create a temporary canvas for rendering
        const canvas = document.createElement("canvas");
        
        // For high quality rendering, use a higher scale factor
        const qualityScaleFactor = 1.5;
        
        // Set canvas dimensions with reasonable limits for very large pages
        const MAX_DIMENSION = 3000;
        const scaleRatio = Math.min(qualityScaleFactor, MAX_DIMENSION / Math.max(viewport.width, viewport.height));
        
        canvas.width = Math.floor(viewport.width * scaleRatio);
        canvas.height = Math.floor(viewport.height * scaleRatio);
        
        const ctx = canvas.getContext("2d", { alpha: true });
        
        if (!ctx) {
          throw new Error("Failed to get canvas context");
        }
        
        // Enable high-quality image rendering
        (ctx as any).imageSmoothingEnabled = true;
        (ctx as any).imageSmoothingQuality = 'high';
        
        // For line preservation, draw with crisp edges
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Set white background
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // If we needed to scale, adjust the context transform
        if (scaleRatio !== 1.0) {
          ctx.scale(scaleRatio, scaleRatio);
        }
        
        // Render the page to the canvas with high quality settings
        const renderTask = pageObj.render({
          canvasContext: ctx,
          viewport: viewport,
          intent: "print" // Use "print" for highest quality
        });
        
        await renderTask.promise;
        
        // Draw annotations on top if there are any
        if (pageAnnotations.length > 0) {
          console.log(`[PDFViewer] Drawing ${pageAnnotations.length} annotations for page ${pageNum}`);
          
          // Use standard line width for annotations
          const lineWidthMultiplier = 1.0;
          
          // Draw regular annotations first
          const regularAnnotations = pageAnnotations.filter(a => a.type !== 'highlight');
          regularAnnotations.forEach(annotation => {
            try {
              // Set line width before drawing
              ctx.lineWidth = ((annotation as any).strokeWidth || 1) * lineWidthMultiplier;
              drawAnnotation(ctx, annotation, 1.0); // Use base scale since we've already scaled the canvas
            } catch (err) {
              console.error(`Error drawing annotation on page ${pageNum} during download:`, err);
            }
          });
          
          // Draw highlights with multiply blend mode
          const highlightAnnotations = pageAnnotations.filter(a => a.type === 'highlight');
          if (highlightAnnotations.length > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            
            highlightAnnotations.forEach(annotation => {
              try {
                drawAnnotation(ctx, annotation, 1.0); // Use base scale
              } catch (err) {
                console.error(`Error drawing highlight on page ${pageNum} during download:`, err);
              }
            });
            
            ctx.restore();
          }
        }
        
        // Convert to data URL with high quality format
        let imgData;
        try {
          // Use PNG format for high quality to preserve line thickness
          const dataUrl = canvas.toDataURL('image/png');
          
          // For very large images, use chunking to avoid string length issues
          if (canvas.width * canvas.height > 4000000) {
            const byteString = atob(dataUrl.split(',')[1]);
            const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
            
            // Use chunking for large files
            const chunkSize = 1024 * 1024; // 1MB chunks
            const chunks = Math.ceil(byteString.length / chunkSize);
            const byteArrays = new Array(chunks);
            
            for (let i = 0; i < chunks; i++) {
              const offset = i * chunkSize;
              const length = Math.min(byteString.length - offset, chunkSize);
              
              const byteNumbers = new Array(length);
              for (let j = 0; j < length; j++) {
                byteNumbers[j] = byteString.charCodeAt(offset + j);
              }
              
              byteArrays[i] = new Uint8Array(byteNumbers);
            }
            
            // Create blob and convert to data URL
            const blob = new Blob(byteArrays, { type: mimeType });
            
            // Use FileReader to convert Blob to data URL
            imgData = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } else {
            imgData = dataUrl;
          }
          
          // Add the image to the PDF at the current page
          pdfDoc.addImage(imgData, 'PNG', 0, 0, viewport.width, viewport.height);
          
        } catch (error) {
          console.error(`[PDFViewer] Error processing image for page ${pageNum}:`, error);
          throw error;
        }
      }
      
      // Save the complete PDF with all pages
      const fileName = `full-document${documentId ? `-${documentId}` : ''}-high-quality.pdf`;
      pdfDoc.save(fileName);
      
      showToast(`Complete PDF downloaded with high quality (${pdf.numPages} pages)`, "success");
    } catch (error) {
      console.error("Full PDF download error:", error);
      showToast(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, document, documentId, showToast]);
  
  // Add a function to download in premium (print) quality
  const downloadPremiumQualityPDF = useCallback(async () => {
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
      
      console.log(`[PDFViewer] Downloading page ${currentPage} in premium quality with ${pageAnnotations.length} annotations`);
      
      // Create a new PDF document with just the current page
      const pdfDoc = new jsPDF({
        orientation: viewport.width > viewport.height ? "landscape" : "portrait",
        unit: "pt",
        format: [viewport.width, viewport.height]
      });
      
      // Create a temporary canvas for rendering with premium quality
      const canvas = document.createElement("canvas");
      
      // For premium quality, use the highest possible scale factor
      const qualityScaleFactor = 2.0; // Highest scale factor that's still reasonable
      
      // Set canvas dimensions - don't limit the maximum size for premium quality
      const scaleRatio = qualityScaleFactor;
      
      canvas.width = Math.floor(viewport.width * scaleRatio);
      canvas.height = Math.floor(viewport.height * scaleRatio);
      
      const ctx = canvas.getContext("2d", { alpha: true });
      
      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }
      
      // Use settings optimized for highest quality and line preservation
      (ctx as any).imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = 'high';
      
      // Use round joins and line caps for smoother vector rendering
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.miterLimit = 2;
      
      // Set white background
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Apply scaling for high resolution
      ctx.scale(scaleRatio, scaleRatio);
      
      // Render the current page with "print" intent for maximum quality
      const renderTask = page.render({
        canvasContext: ctx,
        viewport: page.getViewport({ scale: scale }),
        intent: "print" // Use print intent for the highest quality
      });
      
      await renderTask.promise;
      
      // Draw annotations with precise line rendering
      if (pageAnnotations.length > 0) {
        console.log(`[PDFViewer] Drawing ${pageAnnotations.length} annotations with premium quality`);
        
        // For premium quality, preserve exact line widths
        const lineWidthMultiplier = 1.0;
        
        // Draw regular annotations first
        const regularAnnotations = pageAnnotations.filter(a => a.type !== 'highlight');
        regularAnnotations.forEach(annotation => {
          try {
            // Set line width before drawing
            ctx.lineWidth = ((annotation as any).strokeWidth || 1) * lineWidthMultiplier;
            drawAnnotation(ctx, annotation, scale);
          } catch (err) {
            console.error("Error drawing annotation during premium download:", err);
          }
        });
        
        // Draw highlights with multiply blend mode
        const highlightAnnotations = pageAnnotations.filter(a => a.type === 'highlight');
        if (highlightAnnotations.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'multiply';
          
          highlightAnnotations.forEach(annotation => {
            try {
              drawAnnotation(ctx, annotation, scale);
            } catch (err) {
              console.error("Error drawing highlight during premium download:", err);
            }
          });
          
          ctx.restore();
        }
      }
      
      // Process image with maximum quality settings
      const processImage = async () => {
        try {
          // Always use PNG for premium quality as it's lossless
          const pngDataUrl = canvas.toDataURL('image/png', 1.0);
          
          // For large images, use chunking to avoid string length errors
          if (canvas.width * canvas.height > 4000000) {
            const byteString = atob(pngDataUrl.split(',')[1]);
            const mimeType = pngDataUrl.split(',')[0].split(':')[1].split(';')[0];
            
            // Use larger chunks for premium quality
            const chunkSize = 2 * 1024 * 1024; // 2MB chunks
            const chunks = Math.ceil(byteString.length / chunkSize);
            const byteArrays = new Array(chunks);
            
            for (let i = 0; i < chunks; i++) {
              const offset = i * chunkSize;
              const length = Math.min(byteString.length - offset, chunkSize);
              
              const byteNumbers = new Array(length);
              for (let j = 0; j < length; j++) {
                byteNumbers[j] = byteString.charCodeAt(offset + j);
              }
              
              byteArrays[i] = new Uint8Array(byteNumbers);
            }
            
            // Create blob and convert to data URL
            const blob = new Blob(byteArrays, { type: mimeType });
            
            return new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
          
          return pngDataUrl;
        } catch (error) {
          console.error('[PDFViewer] Error processing premium quality image:', error);
          throw error;
        }
      };
      
      // Get the processed image data
      const imgData = await processImage();
      
      // Add the image to the PDF with exact dimensions
      pdfDoc.addImage(imgData, 'PNG', 0, 0, viewport.width, viewport.height);
      
      // Save the PDF with a premium quality indicator
      const fileName = `page-${currentPage}${documentId ? `-${documentId}` : ''}-premium.pdf`;
      pdfDoc.save(fileName);
      
      showToast(`Page ${currentPage} downloaded in premium quality for print`, "success");
    } catch (error) {
      console.error("Premium download error:", error);
      showToast(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, page, viewport, scale, currentPage, documentId, document, showToast]);
  
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

  // Auto fit to width when page is loaded
  useEffect(() => {
    if (page && containerRef.current && !disableFitToWidthRef.current) {
      // Wait a moment for the page to be fully rendered
      setTimeout(() => {
        console.log("[PDFViewer] Auto-applying fit to width for page", currentPage);
        
        // Clear rendering status to force a complete rerender
        hasRenderedOnceRef.current[currentPage] = false;
        renderedPagesRef.current.delete(currentPage);
        
        // Clear any in-progress render
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }
        
        // Reset render lock
        renderLockRef.current = false;
        
        // Get the viewport to check if the page dimensions are different
        const viewport = page.getViewport({ scale: 1 });
        
        // Recalculate fit width if dimensions are significantly different
        // This handles cases where pages have different sizes in the same document
        const container = containerRef.current;
        if (!container) {
          return; // Safety check
        }
        
        const scrollContainer = container.querySelector('.overflow-auto') as HTMLElement;
        const viewportWidth = scrollContainer ? scrollContainer.clientWidth : container.clientWidth;
        const padding = 32; // Increased padding for more reliable fit
        const availableWidth = viewportWidth - padding;
        const newScale = availableWidth / viewport.width;
        
        // If scale is different by more than 5%, or we're on first page, recalculate
        const scaleDifference = Math.abs(newScale - scale) / scale;
        if (isNaN(scaleDifference) || scaleDifference > 0.05 || currentPage === 1) {
          console.log(`[PDFViewer] Page ${currentPage} has different dimensions, recalculating fit width`);
          
          // Force clear cached pages
          if (pageCanvasCache.size > 0) {
            pageCanvasCache.clear();
            pageCacheTimestamps.clear();
          }
          
          // Apply the fit to width
          handleFitToWidth();
        } else {
          // Just rerender with current scale but don't change the scale
          setIsRendering(true);
          setRenderComplete(false);
          renderPdfPage();
          
          // After a delay, ensure the document is centered
          setTimeout(() => {
            scrollToCenterDocument();
          }, 200);
        }
      }, 250); // Increased timeout for more reliable measurements
    }
  }, [page, handleFitToWidth, currentPage, scrollToCenterDocument, scale, renderPdfPage]);

  // Function to generate a canvas with PDF content and annotations
  const createAnnotatedCanvas = useCallback(async (targetPage: PDFPageProxy, annotations: Annotation[], qualityScale: number = 1.0, pageScale: number = scale) => {
    // Create a new canvas for exporting
    const exportCanvas = document.createElement("canvas");
    const viewport = targetPage.getViewport({ scale: pageScale * qualityScale });
    exportCanvas.width = viewport.width;
    exportCanvas.height = viewport.height;
    
    // Get 2D context with alpha support for better annotation rendering
    const ctx = exportCanvas.getContext("2d", { alpha: true })!;
    
    // Set white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    // Configure canvas for high-quality rendering
    console.log(`[PDFViewer] Rendering PDF content to export canvas (scale: ${pageScale * qualityScale}, dimensions: ${viewport.width}x${viewport.height})`);
    
    // Enable high-quality image rendering on the context
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    
    // Use round joins and caps for smoother vector rendering
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;
    
    // Determine the rendering intent based on quality scale
    const renderIntent = qualityScale >= 2.0 ? "print" : "display";
    
    const renderTask = targetPage.render({
      canvasContext: ctx,
      viewport: viewport,
      intent: renderIntent, // Use print intent for better text quality with high-quality exports
      annotationMode: 0 // Enable annotation layer for better text quality
    });
    
    // Wait for PDF rendering to complete
    await renderTask.promise;
    
    // Now draw annotations on top with scale adjustment
    console.log(`[PDFViewer] Drawing ${annotations.length} annotations on export canvas`);
    
    // Calculate adjusted line width multiplier based on quality scale
    // For higher scales, we need thinner relative lines to maintain visual consistency
    const lineWidthMultiplier = qualityScale >= 2.0 ? (1.0 / (qualityScale * 0.5)) : 1.0;
    
    // Check if we need to adjust annotation scaling
    // Annotations are stored at scale 1.0, but we're rendering at pageScale * qualityScale
    const annotationScaleFactor = pageScale * qualityScale;
    
    // First draw non-highlight annotations
    const regularAnnotations = annotations.filter(a => a.type !== 'highlight');
    regularAnnotations.forEach(annotation => {
      try {
        // Set line width based on quality scale
        if (ctx && annotation.style && typeof annotation.style.lineWidth === 'number') {
          ctx.lineWidth = annotation.style.lineWidth * lineWidthMultiplier;
        }
        
        // Draw the annotation with the appropriate scale
        // Clone the annotation if we need to adjust scale
        if (annotationScaleFactor !== 1.0) {
          // Create a temporary copy of the annotation with adjusted positions
          const scaledAnnotation = { ...annotation };
          
          // Scale points if they exist
          if (scaledAnnotation.points && Array.isArray(scaledAnnotation.points)) {
            scaledAnnotation.points = scaledAnnotation.points.map(point => ({
              x: point.x,
              y: point.y
            }));
          }
          
          drawAnnotation(ctx, scaledAnnotation, annotationScaleFactor);
        } else {
          // Use original annotation without scaling
          drawAnnotation(ctx, annotation, annotationScaleFactor);
        }
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
          // Draw the annotation with the appropriate scale, using same scaling as above
          if (annotationScaleFactor !== 1.0) {
            // Create a temporary copy of the annotation with adjusted positions
            const scaledAnnotation = { ...annotation };
            
            // Scale points if they exist
            if (scaledAnnotation.points && Array.isArray(scaledAnnotation.points)) {
              scaledAnnotation.points = scaledAnnotation.points.map(point => ({
                x: point.x,
                y: point.y
              }));
            }
            
            drawAnnotation(ctx, scaledAnnotation, annotationScaleFactor);
          } else {
            // Use original annotation without scaling
            drawAnnotation(ctx, annotation, annotationScaleFactor);
          }
        } catch (err) {
          console.error("Error drawing highlight during export:", err);
        }
      });
      
      ctx.restore();
    }
    
    return { canvas: exportCanvas, viewport };
  }, [scale]);
  
  // Add a new function to handle optimized PDF compression before exportToPDF
  const compressPDF = useCallback(async (canvas: HTMLCanvasElement, quality: number = 0.8): Promise<Blob> => {
    try {
      // For very large canvases, use optimized quality and resolution
      const MAX_DIMENSION = quality >= 0.9 ? 4000 : 3000; // Higher limit for HD/Ultra-HD quality
      
      // Check if canvas is very large
      const isLargeCanvas = canvas.width > MAX_DIMENSION || canvas.height > MAX_DIMENSION;
      
      // Detect if the page is mostly text vs images to optimize compression
      const ctx = canvas.getContext('2d');
      let compressionQuality = quality;
      let sourceCanvas = canvas;
      let imageFormat = 'image/png';
      
      // Create a temporary canvas for scaling if needed
      if (isLargeCanvas) {
        // Create a scaled-down version for large canvases
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { alpha: true });
        
        // Calculate scaling factor to keep aspect ratio
        const scaleFactor = MAX_DIMENSION / Math.max(canvas.width, canvas.height);
        
        // Set dimensions for the temp canvas
        tempCanvas.width = Math.floor(canvas.width * scaleFactor);
        tempCanvas.height = Math.floor(canvas.height * scaleFactor);
        
        if (tempCtx) {
          // Enable high-quality image rendering
          (tempCtx as any).imageSmoothingEnabled = true;
          (tempCtx as any).imageSmoothingQuality = 'high';
          
          // For line preservation, use round line joins and caps
          tempCtx.lineJoin = 'round';
          tempCtx.lineCap = 'round';
          
          // Draw the original canvas onto the temp canvas with scaling
          tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
          sourceCanvas = tempCanvas;
          
          // Adjust compression based on content size and quality level
          if (quality >= 0.95) {
            // Ultra-HD priority is maintaining text and line quality
            compressionQuality = 0.92;
            imageFormat = 'image/png'; // Always use PNG for best text/line quality
          } else if (quality >= 0.9) {
            // HD can use PNG for better text quality but slightly compressed
            compressionQuality = 0.9;
            imageFormat = 'image/png';
          } else if (quality >= 0.7) {
            // Standard quality can use JPEG for much better compression
            compressionQuality = 0.85;
            
            // Use a heuristic to determine if content is mostly text or images
            // Text-heavy pages benefit from PNG, image-heavy from JPEG
            try {
              const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
              const data = imgData.data;
              let edgeCount = 0;
              let colorCount = 0;
              
              // Sample pixels to detect edges and color variation
              for (let i = 0; i < data.length; i += 16) {
                // Count high contrast edges (text usually has high contrast)
                if (i % (imgData.width * 4) < imgData.width * 4 - 8) {
                  const diff = Math.abs(data[i] - data[i + 4]) + 
                               Math.abs(data[i + 1] - data[i + 5]) + 
                               Math.abs(data[i + 2] - data[i + 6]);
                  if (diff > 100) edgeCount++;
                }
                
                // Check for color vs grayscale (text pages tend to be mostly grayscale)
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
                if (maxDiff > 20) colorCount++;
              }
              
              // Calculate edge density and color ratio
              const edgeDensity = edgeCount / (imgData.width * imgData.height / 16);
              const colorRatio = colorCount / (data.length / 64);
              
              // If high edge density and low color ratio, likely text-heavy page
              const isTextHeavy = edgeDensity > 0.05 && colorRatio < 0.3;
              
              // Use PNG for text-heavy pages, JPEG for image-heavy
              imageFormat = isTextHeavy ? 'image/png' : 'image/jpeg';
              
              // Adjust compression based on content type
              if (isTextHeavy) {
                // Text needs higher quality to remain readable
                compressionQuality = Math.max(0.88, compressionQuality);
              } else {
                // Images can be compressed more
                compressionQuality = 0.82;
              }
              
              console.log(`[PDFViewer] Content analysis: ${isTextHeavy ? 'Text-heavy' : 'Image-heavy'}, using ${imageFormat}`);
            } catch (err) {
              // Fallback to safer defaults
              console.error("[PDFViewer] Error during content analysis:", err);
              imageFormat = 'image/png';
              compressionQuality = 0.85;
            }
          } else {
            // Low quality mode - maximize compression
            compressionQuality = 0.65;
            
            // Always use JPEG for maximum compression in low quality mode
            imageFormat = 'image/jpeg';
            
            // Further reduce resolution for low quality mode
            if (tempCanvas.width > 1200 || tempCanvas.height > 1200) {
              const extraScaleFactor = 1200 / Math.max(tempCanvas.width, tempCanvas.height);
              const superTempCanvas = document.createElement('canvas');
              const superTempCtx = superTempCanvas.getContext('2d');
              
              superTempCanvas.width = Math.floor(tempCanvas.width * extraScaleFactor);
              superTempCanvas.height = Math.floor(tempCanvas.height * extraScaleFactor);
              
              if (superTempCtx) {
                // Use lower quality settings for maximum compression
                (superTempCtx as any).imageSmoothingEnabled = true;
                (superTempCtx as any).imageSmoothingQuality = 'medium';
                
                superTempCtx.drawImage(tempCanvas, 0, 0, superTempCanvas.width, superTempCanvas.height);
                sourceCanvas = superTempCanvas;
              }
            }
          }
          
          console.log(`[PDFViewer] Scaled canvas (${canvas.width}x${canvas.height}) to ${tempCanvas.width}x${tempCanvas.height}, format: ${imageFormat}, quality: ${compressionQuality.toFixed(2)}`);
        }
      } else if (quality < 0.7) {
        // For smaller canvases but low quality, still reduce resolution
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { alpha: true });
        
        // Calculate scaling factor based on quality
        // Lower quality = smaller size
        const scaleFactor = 0.5 + (quality * 0.5); // 0.5 at 0 quality, 0.85 at 0.7 quality
        
        tempCanvas.width = Math.floor(canvas.width * scaleFactor);
        tempCanvas.height = Math.floor(canvas.height * scaleFactor);
        
        if (tempCtx) {
          // Lower quality settings for compression
          (tempCtx as any).imageSmoothingEnabled = true;
          (tempCtx as any).imageSmoothingQuality = 'medium';
          
          tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
          sourceCanvas = tempCanvas;
          
          // Always use JPEG for maximum compression in low quality mode
          imageFormat = 'image/jpeg';
          compressionQuality = 0.65;
        }
      } else {
        // For smaller canvases, we can use PNG with high quality
        imageFormat = quality >= 0.9 ? 'image/png' : 'image/jpeg';
        compressionQuality = quality;
      }
      
      // Generate the data URL with the determined format and quality
      const dataUrl = sourceCanvas.toDataURL(imageFormat, compressionQuality);
      
      // Convert data URL to Blob using efficient chunking
      const byteString = atob(dataUrl.split(',')[1]);
      const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      
      // Use chunking to handle large files
      const chunkSize = 1024 * 1024; // 1MB chunks
      const chunks = Math.ceil(byteString.length / chunkSize);
      const byteArrays = new Array(chunks);
      
      for (let i = 0; i < chunks; i++) {
        const offset = i * chunkSize;
        const length = Math.min(byteString.length - offset, chunkSize);
        
        const byteNumbers = new Array(length);
        for (let j = 0; j < length; j++) {
          byteNumbers[j] = byteString.charCodeAt(offset + j);
        }
        
        byteArrays[i] = new Uint8Array(byteNumbers);
      }
      
      // Log the dimensions and format used
      console.log(`[PDFViewer] Compressed page: ${canvas.width}x${canvas.height} using ${imageFormat} (quality: ${compressionQuality.toFixed(2)})`);
      
      // Create the final blob
      return new Blob(byteArrays, { type: mimeType });
    } catch (error) {
      console.error('[PDFViewer] Error compressing PDF:', error);
      throw error;
    }
  }, []);

  // Update handleExportAllPages to use chunking and compression with 50MB file size limit
  const handleExportAllPages = useCallback(async (quality?: "standard" | "hd" | "ultra-hd") => {
    if (!pdf || !canvasRef.current) {
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
      
      // Determine compression and quality settings based on requested quality level
      let compressionQuality, qualityLabel, qualityScale, renderIntent;
      
      // Configure quality settings based on the requested level
      if (quality === "ultra-hd") {
        compressionQuality = 1.0; // No compression for ultra-hd
        qualityLabel = "Ultra HD";
        qualityScale = 3.0; // Maximum scale factor for ultra-high resolution
        renderIntent = "print"; // Print intent for highest quality text rendering
      } else if (quality === "hd") {
        compressionQuality = 0.95; // High quality with minimal compression
        qualityLabel = "HD";
        qualityScale = 2.0; // Higher scale factor for better resolution
        renderIntent = "print"; // Print intent for better text quality
      } else {
        compressionQuality = 0.85; // Better than previous standard quality (was 0.75)
        qualityLabel = "Standard";
        qualityScale = 1.2; // Slightly higher than 1.0 for better quality
        renderIntent = "display"; // Faster rendering
      }
      
      showToast(`Starting export of all ${pdf.numPages} pages with ${qualityLabel} quality...`, "success");
      
      // File size tracking for 50MB limit
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
      let currentBatchSize = 0;
      let batchNumber = 1;
      let pagesInCurrentBatch = 0;
      
      // Create a timestamp for filename
      const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseFileName = `${documentId || 'document'}${quality === "standard" ? "" : (quality === "hd" ? "-HD" : "-ULTRA-HD")}`;
      
      // Track processing start time
      const startTime = Date.now();
      let lastProgressTime = startTime;
      
      // Sample large documents to estimate file size
      let totalEstimatedSize = 0;
      let estimatedBatches = 1;
      
      if (pdf.numPages > 10) {
        // Sample pages for size estimation
        showToast(`Analyzing document to optimize export...`, "success");
        
        const samplePoints = [
          1, 
          Math.floor(pdf.numPages / 2), 
          Math.min(pdf.numPages - 1, Math.max(3, pdf.numPages - 2))
        ];
        
        const pageSizeSamples = [];
        
        for (const pageNum of samplePoints) {
          try {
            const pageObj = await pdf.getPage(pageNum);
            const pageViewport = pageObj.getViewport({ scale: 1.0 });
            const annotations = currentDoc.annotations.filter(a => a.pageNumber === pageNum);
            
            const exportCanvas = await createAnnotatedCanvas(pageObj, annotations, qualityScale, 1.0);
            const imgBlob = await compressPDF(exportCanvas.canvas, compressionQuality);
            
            pageSizeSamples.push(imgBlob.size);
            console.log(`Sample page ${pageNum} size: ${(imgBlob.size / 1024 / 1024).toFixed(2)}MB`);
          } catch (error) {
            console.error(`Error sampling page ${pageNum}:`, error);
          }
        }
        
        if (pageSizeSamples.length > 0) {
          const avgPageSize = pageSizeSamples.reduce((sum, size) => sum + size, 0) / pageSizeSamples.length;
          totalEstimatedSize = avgPageSize * pdf.numPages * 1.1; // Add 10% overhead for PDF container
          estimatedBatches = Math.ceil(totalEstimatedSize / MAX_FILE_SIZE);
          
          if (estimatedBatches > 1) {
            showToast(`Large document detected (est. ${(totalEstimatedSize / 1024 / 1024).toFixed(1)}MB). Will split into ${estimatedBatches} parts.`, "success");
          }
        }
      }
      
      // Get first page to initialize first batch
      const firstPage = await pdf.getPage(1);
      const firstPageViewport = firstPage.getViewport({ scale: 1.0 });
      
      // Initialize the first PDF
      let currentPDF = new jsPDF({
        orientation: firstPageViewport.width > firstPageViewport.height ? "landscape" : "portrait",
        unit: "pt",
        format: [firstPageViewport.width, firstPageViewport.height]
      });
      
      // Process each page
      let isFirstPageInBatch = true;
      
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          // Show progress updates
          const currentTime = Date.now();
          if (currentTime - lastProgressTime > 2000 || pageNum % 5 === 0 || pageNum === 1) {
            const percentComplete = Math.round((pageNum / pdf.numPages) * 100);
            const timeElapsed = (currentTime - startTime) / 1000;
            const estimatedTotal = timeElapsed / (pageNum / pdf.numPages);
            const timeRemaining = Math.round(estimatedTotal - timeElapsed);
            
            showToast(
              `Processing page ${pageNum}/${pdf.numPages} (${percentComplete}%) - Est. ${timeRemaining} seconds remaining`,
              "success"
            );
            lastProgressTime = currentTime;
          }
          
          // Get the page
          const pageObj = await pdf.getPage(pageNum);
          const pageViewport = pageObj.getViewport({ scale: 1.0 });
          
          // Add new page to PDF if not the first page in batch
          if (!isFirstPageInBatch) {
            currentPDF.addPage([pageViewport.width, pageViewport.height]);
          } else {
            isFirstPageInBatch = false;
          }
          
          // Get annotations for this page
          const pageAnnotations = currentDoc.annotations.filter(a => a.pageNumber === pageNum);
          
          // Create the canvas with content
          const exportCanvas = await createAnnotatedCanvas(pageObj, pageAnnotations, qualityScale, 1.0);
          
          // Compress the page image
          const compressedImageBlob = await compressPDF(exportCanvas.canvas, compressionQuality);
          const pageSize = compressedImageBlob.size;
          
          // Convert blob to data URL for adding to PDF
          const reader = new FileReader();
          const imageDataPromise = new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(compressedImageBlob);
          });
          
          const imgData = await imageDataPromise;
          
          // Add image to PDF - use PNG for HD and Ultra-HD
          const imageFormat = quality === "standard" ? "JPEG" : "PNG";
          currentPDF.addImage(
            imgData,
            imageFormat,
            0,
            0,
            pageViewport.width,
            pageViewport.height
          );
          
          // Update batch tracking
          currentBatchSize += pageSize;
          pagesInCurrentBatch++;
          
          // Check if we need to start a new batch (file getting too large)
          const isBatchFull = currentBatchSize > MAX_FILE_SIZE * 0.9;
          const isLastPage = pageNum === pdf.numPages;
          
          // Save current batch if it's full or last page
          if ((isBatchFull && pagesInCurrentBatch > 1) || isLastPage) {
            // File name with batch number if multiple batches
            const fileName = estimatedBatches > 1
              ? `${baseFileName}-part${batchNumber}-${fileTimestamp}.pdf`
              : `${baseFileName}-${fileTimestamp}.pdf`;
            
            // Save the current batch
            currentPDF.save(fileName);
            
            console.log(`Saved batch ${batchNumber} with ${pagesInCurrentBatch} pages (~ ${(currentBatchSize / 1024 / 1024).toFixed(2)}MB)`);
            
            // If not the last page, prepare for next batch
            if (!isLastPage) {
              // Get next page to initialize next batch
              const nextPage = await pdf.getPage(pageNum + 1);
              const nextPageViewport = nextPage.getViewport({ scale: 1.0 });
              
              // Create new PDF for next batch
              currentPDF = new jsPDF({
                orientation: nextPageViewport.width > nextPageViewport.height ? "landscape" : "portrait",
                unit: "pt",
                format: [nextPageViewport.width, nextPageViewport.height]
              });
              
              // Reset batch tracking
              currentBatchSize = 0;
              pagesInCurrentBatch = 0;
              batchNumber++;
              isFirstPageInBatch = true;
              
              showToast(`Created part ${batchNumber} to keep file size under 50MB`, "success");
            }
          }
          
          // Log progress
          console.log(`Processed page ${pageNum}/${pdf.numPages} (batch ${batchNumber}) with ${pageAnnotations.length} annotations (${qualityLabel} quality)`);
        } catch (error) {
          console.error(`Error processing page ${pageNum}:`, error);
          showToast(`Error on page ${pageNum}: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
      }
      
      // Calculate total processing time
      const totalProcessingTime = Math.round((Date.now() - startTime) / 1000);
      
      // Build success message
      let successMessage = `All ${pdf.numPages} pages exported successfully with ${qualityLabel} quality in ${totalProcessingTime} seconds`;
      if (batchNumber > 1) {
        successMessage += ` (split into ${batchNumber} files to maintain quality while staying under 50MB)`;
      }
      
      showToast(successMessage, "success");
    } catch (error) {
      console.error("Export all pages error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, canvasRef, document, documentId, showToast, createAnnotatedCanvas, compressPDF]);

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
      
      console.log(`[PDFViewer] Annotation change detected from ${source} for page ${targetPageNumber}`);
      
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
        console.log(`[PDFViewer] Processing immediate render for user interaction (${source})`);
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
        console.log(`[PDFViewer] Throttling render due to cooldown (${now - lastRenderTime}ms)`);
        
        // Schedule with shorter delay
        renderTimeout = setTimeout(() => {
          console.log('[PDFViewer] Executing delayed render after cooldown');
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
        console.log(`[PDFViewer] Triggering regular render for non-user change (${source})`);
        
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
    
    console.log(`[PDFViewer] All ${annotations.length} annotations on page ${pageNumber} are valid`);
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
      console.log('[PDFViewer] Cannot verify PDF integrity - PDF or page not loaded');
      return false;
    }
  
    try {
      // Basic checks for PDF integrity
      console.log('[PDFViewer] Verifying PDF integrity...');
      console.log(`[PDFViewer] Number of pages: ${pdf.numPages}`);
      console.log(`[PDFViewer] Page ${currentPage} dimensions: ${viewport.width}x${viewport.height}`);
      
      // Check if text content can be extracted (sign of a properly loaded PDF)
      const textContent = await page.getTextContent();
      const hasText = textContent.items.length > 0;
      console.log(`[PDFViewer] Text content extraction: ${hasText ? 'Successful' : 'No text found'}`);
      
      // Check annotations
      const annots = await page.getAnnotations();
      console.log(`[PDFViewer] Annotations found: ${annots.length}`);
      
      // Log successful verification
      console.log('[PDFViewer] PDF integrity verification complete - PDF loaded correctly');
      return true;
    } catch (error) {
      console.error('[PDFViewer] Error verifying PDF integrity:', error);
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
    console.log(`[PDFViewer] New file detected. Initializing with ID: ${currentFileId}`);
    
    // Reset all state for a fresh load
    // PDF and page state are managed by custom hooks (usePDFDocument and usePDFPage)
    setCurrentPage(1);
    setCurrentAnnotations([]);
    setIsViewerReady(false);
    setHasStartedLoading(false);
    setRenderError(null);
    setIsInitialLoading(true); // Start with loading state
    
    // Reset render tracking
    hasRenderedOnceRef.current = {};
    renderedPagesRef.current.clear();
    
    // Simple load process with retry
    const loadPdf = () => {
      console.log(`[PDFViewer] Loading PDF file: ${currentFileId}`);
      
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
      
      console.log(`[PDFViewer] Initializing PDF viewer with file: ${pdfFile.name}`);
      
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
    
    console.log("[PDFViewer] PDF document loaded successfully:", pdf.numPages, "pages");
    
    // Verify PDF integrity only if not already verified for this document
    if (!pdfVerifiedRef.current) {
      verifyPDFIntegrity().then(isValid => {
        if (isValid) {
          console.log('[PDFViewer] PDF integrity check passed');
          pdfVerifiedRef.current = true;
          
          // Set the document ID in the annotation store to load annotations
          annotationStore.setCurrentDocument(documentId);
          
          // Force render of first page with annotations (if renderPdfPage exists)
          if (typeof renderPdfPage === 'function') {
            // Clear any previous render lock that might be blocking rendering
            renderLockRef.current = false;
            
            // Only trigger render if we're not already rendering
            if (!isRendering && !pageChangeInProgress) {
              console.log("[PDFViewer] Triggering initial render");
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
      console.log('[PDFViewer] Stamp annotation added and event dispatched to container');
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
      console.log('[PDFViewer] Event dispatched to annotation canvas');
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
    
    console.log('[PDFViewer] Stamp added successfully, triggered multiple render methods');
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
    
    // Dispatch an event to notify annotation canvas about scale change
    document.dispatchEvent(new CustomEvent('annotationChanged', {
      detail: {
        pageNumber: currentPage,
        source: 'scaleChange',
        forceRender: true,
        scale: scale
      }
    }));
    
    // Re-render PDF content after scale change
    if (!pageChangeInProgress) {
      // Force a fresh render if scale changed and we're not already changing pages
      hasRenderedOnceRef.current[currentPage] = false;
      renderedPagesRef.current.delete(currentPage);
      
      setTimeout(() => {
        renderPdfPage();
      }, 0);
    }
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
  
  // Add this helper function before the return statement
  const prepareAnnotationsForExport = useCallback((annotations: Annotation[]) => {
    if (!annotations || annotations.length === 0) return [];
    
    // Make a deep copy to avoid modifying the original annotations
    return annotations.map(annotation => {
      // Ensure all required properties are present
      const preparedAnnotation = {
        ...annotation,
        // Make sure these essential properties exist
        id: annotation.id || `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: annotation.type,
        pageNumber: annotation.pageNumber,
        // Include style properties
        style: {
          ...annotation.style,
          // Ensure color and other style attributes exist
          color: annotation.style?.color || '#000000',
          lineWidth: annotation.style?.lineWidth || 1,
          opacity: annotation.style?.opacity !== undefined ? annotation.style.opacity : 1
        },
        // Add timestamp if missing
        timestamp: annotation.timestamp || Date.now(),
        // Add version if missing
        version: annotation.version || 1
      };
      
      return preparedAnnotation;
    });
  }, []);

  // Add a handler for downloading page by page with annotations
  const handlePageByPageDownload = useCallback(() => {
    if (pdf && file && typeof file === 'string') {
      // Get all annotations from the annotation store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const allAnnotations = currentDoc?.annotations || [];
      
      // Use document name from props if available, otherwise extract from URL
      const baseFilename = documentName || file.split('/').pop() || 'document.pdf';
      // Clean the filename by removing extension and any special characters
      const cleanName = baseFilename.replace(/\.pdf$/i, '').replace(/[^\w\s-]/g, '').trim();
      // Create the final filename with .pdf extension
      const filename = `${cleanName}.pdf`;
      
      if (allAnnotations.length > 0) {
        console.log(`Including ${allAnnotations.length} annotations in the downloaded PDF: ${filename}`);
        // Prepare annotations for export, ensuring they're properly formatted
        const preparedAnnotations = prepareAnnotationsForExport(allAnnotations);
        // Pass annotations as additional parameter to onDownloadCompressed
        onDownloadCompressed?.(file, filename, preparedAnnotations);
      } else {
        // Original functionality if no annotations exist
        onDownloadCompressed?.(file, filename);
      }
    }
  }, [pdf, file, document, documentId, prepareAnnotationsForExport, onDownloadCompressed, documentName]);

  // Add a new function to download only the current page with annotations
  const handleCurrentPageDownload = useCallback(() => {
    if (pdf && file && typeof file === 'string' && currentPage) {
      // Get annotations only for the current page
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const pageAnnotations = currentDoc?.annotations?.filter(a => a.pageNumber === currentPage) || [];
      
      // Use document name from props if available, otherwise extract from URL
      const baseFilename = documentName || file.split('/').pop() || 'document.pdf';
      // Clean the filename by removing extension and any special characters
      const cleanName = baseFilename.replace(/\.pdf$/i, '').replace(/[^\w\s-]/g, '').trim();
      // Create the final filename with page number and .pdf extension
      const filename = `${cleanName}_page${currentPage}.pdf`;
      
      console.log(`Downloading page ${currentPage}${pageAnnotations.length > 0 ? ' with annotations' : ''} as ${filename}`);
      
      // If we have a download handler in props, use it with filtered annotations
      if (onDownloadCompressed) {
        if (pageAnnotations.length > 0) {
          // Prepare annotations for export to ensure they're properly formatted
          const preparedAnnotations = prepareAnnotationsForExport(pageAnnotations);
          // Pass only current page annotations to onDownloadCompressed with page filter flag
          onDownloadCompressed(file, filename, preparedAnnotations, currentPage);
        } else {
          // Download without annotations but with page filter flag
          onDownloadCompressed(file, filename, undefined, currentPage);
        }
      }
    }
  }, [pdf, file, document, documentId, currentPage, prepareAnnotationsForExport, onDownloadCompressed, documentName]);

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
          onDownloadHighQuality={downloadHighQualityPDF}
          onDownloadPremiumQuality={downloadPremiumQualityPDF}
          onDownloadCurrentPage={handleCurrentPageDownload}
          hasAnnotations={annotationStore.documents[documentId]?.annotations?.length > 0}
          onDownloadPageByPage={onDownloadCompressed ? handlePageByPageDownload : undefined}
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
            
            {/* Loading indicator during rendering */}
            {(isRendering || pageChangeInProgress) && (
              <div className="absolute top-0 left-0 z-50 w-full h-full flex items-center justify-center bg-white bg-opacity-80 backdrop-blur-[1px]">
                <div className="flex flex-col items-center bg-white p-5 rounded-xl shadow-lg">
                  <div className="relative w-16 h-16 mb-3">
                    {/* Rotating rings */}
                    <div className="absolute inset-0 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" style={{ animationDuration: "1s" }}></div>
                    <div className="absolute inset-1 rounded-full border-4 border-transparent border-r-blue-400 animate-spin" style={{ animationDuration: "1.5s", animationDirection: "reverse" }}></div>
                    
                    {/* Page icon */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={1.5} 
                          d={pageChangeInProgress ? "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" : "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"} 
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="text-gray-800 font-medium text-base">
                    {pageChangeInProgress ? `Loading page ${currentPage}...` : 'Rendering content...'}
                  </div>
                  {renderAttempts > 0 && (
                    <div className="text-amber-600 text-xs mt-1 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Attempt {renderAttempts + 1}/3
                    </div>
                  )}
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
    console.log('[PDFViewer] File or documentId changed, resetting viewer state');
    
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
      console.log('[PDFViewer] Document changed, resetting viewer');
      
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
      
      // Force the file to be reloaded
      if (typeof file === 'string') {
        console.log('[PDFViewer] Reloading file from URL:', file);
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
      
      console.log(`[PDFViewer] Downloading page ${currentPage} with ${pageAnnotations.length} annotations in compressed mode`);
      
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
        console.log(`[PDFViewer] Drawing ${pageAnnotations.length} annotations on compressed canvas`);
        
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
      const compressedBlob = await compressPDF(canvas, compressionQuality);
      
      // Convert blob to data URL
      const imageDataPromise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(compressedBlob);
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
      saveAs(blob, `page-${currentPage}-compressed.pdf`);
      
      showToast(`Page ${currentPage} downloaded with maximum compression`, "success");
    } catch (error) {
      console.error("Compressed download error:", error);
      showToast(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, page, viewport, scale, currentPage, document, documentId, showToast, compressPDF]);
  
  // Add optimized function for exporting all pages with better compression
  const handleExportCompressedPDF = useCallback(async () => {
    if (!pdf || !canvasRef.current) {
      showToast("Cannot export - PDF not fully loaded", "error");
      return;
    }
    
    try {
      setIsExporting(true);
      
      // Get all annotations from the store
      const currentDoc = document ? useAnnotationStore.getState().documents[documentId] : null;
      const allAnnotations = currentDoc?.annotations || [];
      
      // Determine if this is mostly a text PDF for optimized compression
      const isTextBased = await isTextBasedPDF(pdf);
      console.log(`[PDFViewer] PDF analysis: ${isTextBased ? 'Text-based' : 'Image-based'} PDF`);
      
      showToast(`Starting compressed export of all ${pdf.numPages} pages...`, "success");
      
      // Create a timestamp for filename
      const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${documentId || 'document'}-compressed-${fileTimestamp}.pdf`;
      
      // Get first page to initialize document
      const firstPage = await pdf.getPage(1);
      const firstPageViewport = firstPage.getViewport({ scale: 1.0 });
      
      // Create an ArrayBuffer to hold the compressed PDF data
      const pdfDoc = await PDFDocument.create();
      
      // Track progress
      let lastProgressTime = Date.now();
      const startTime = lastProgressTime;
      
      // Process each page
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          // Show progress updates
          const currentTime = Date.now();
          if (currentTime - lastProgressTime > 2000 || pageNum % 5 === 0 || pageNum === 1) {
            const percentComplete = Math.round((pageNum / pdf.numPages) * 100);
            showToast(
              `Processing page ${pageNum}/${pdf.numPages} (${percentComplete}%)...`,
              "success"
            );
            lastProgressTime = currentTime;
          }
          
          // Get the page
          const pageObj = await pdf.getPage(pageNum);
          const pageViewport = pageObj.getViewport({ scale: 1.0 });
          
          // Get annotations for this page
          const pageAnnotations = allAnnotations.filter(a => a.pageNumber === pageNum);
          
          // Create a temporary canvas for rendering with reduced dimensions
          const canvas = document.createElement("canvas");
          
          // Use low scale factor for compression
          const qualityScaleFactor = isTextBased ? 0.8 : 0.7; // Keep higher quality for text-based PDFs
          
          // Set maximum dimensions based on content type
          const MAX_DIMENSION = isTextBased ? 1500 : 1200;
          const scaleRatio = Math.min(qualityScaleFactor, MAX_DIMENSION / Math.max(pageViewport.width, pageViewport.height));
          
          canvas.width = Math.floor(pageViewport.width * scaleRatio);
          canvas.height = Math.floor(pageViewport.height * scaleRatio);
          
          const ctx = canvas.getContext("2d", { alpha: true });
          
          if (!ctx) {
            throw new Error("Failed to get canvas context");
          }
          
          // Use medium quality image rendering for compressed mode
          (ctx as any).imageSmoothingEnabled = true;
          (ctx as any).imageSmoothingQuality = 'medium';
          
          // Set white background
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Apply scaling
          if (scaleRatio !== 1.0) {
            ctx.scale(scaleRatio, scaleRatio);
          }
          
          // Render the page with standard quality settings
          const renderTask = pageObj.render({
            canvasContext: ctx,
            viewport: pageViewport,
            intent: "display" // Use display intent for faster rendering
          });
          
          await renderTask.promise;
          
          // Draw annotations if needed
          if (pageAnnotations.length > 0) {
            console.log(`[PDFViewer] Drawing ${pageAnnotations.length} annotations for page ${pageNum}`);
            
            // Use slightly thicker lines for visibility after compression
            const lineWidthMultiplier = 1.25;
            
            pageAnnotations.forEach(annotation => {
              try {
                // Set line width before drawing
                ctx.lineWidth = ((annotation as any).strokeWidth || 1) * lineWidthMultiplier;
                drawAnnotation(ctx, annotation, 1.0); // Use base scale since we've already scaled the canvas
              } catch (err) {
                console.error(`Error drawing annotation on page ${pageNum}:`, err);
              }
            });
          }
          
          // Compress the canvas with aggressive settings for small file sizes
          const compressionQuality = isTextBased ? 0.65 : 0.6;
          const compressedBlob = await compressPDF(canvas, compressionQuality);
          
          // Convert blob to array buffer for PDF-lib
          const arrayBuffer = await compressedBlob.arrayBuffer();
          
          // This uses pdf-lib to embed the compressed image into a PDF page
          const img = await pdfDoc.embedPng(arrayBuffer);
          const pdfPage = pdfDoc.addPage([pageViewport.width, pageViewport.height]);
          
          // Draw the image on the page with proper sizing
          pdfPage.drawImage(img, {
            x: 0,
            y: 0,
            width: pageViewport.width,
            height: pageViewport.height,
          });
        } catch (error) {
          console.error(`Error processing page ${pageNum}:`, error);
          showToast(`Error on page ${pageNum}: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
      }
      
      // Apply maximum compression to the final PDF
      const compressedBytes = await pdfDoc.save({ 
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 100
      });
      
      // Calculate compression ratio if possible
      let compressionRatio = '';
      try {
        // Get original PDF size
        const fileUrl = pdfFile instanceof File ? URL.createObjectURL(pdfFile) : 
                        (typeof pdfFile === 'string' ? pdfFile : '');
        const response = await fetch(fileUrl);
        const originalPdfSize = (await response.blob()).size;
        const finalSize = compressedBytes.byteLength;
        
        // Calculate percentage of original size
        const percentage = Math.round((finalSize / originalPdfSize) * 100);
        compressionRatio = ` (${percentage}% of original size)`;
      } catch (e) {
        // Ignore errors in size calculation
      }
      
      // Create a blob and download with file-saver
      const blob = new Blob([compressedBytes], { type: 'application/pdf' });
      saveAs(blob, fileName);
      
      // Calculate total processing time
      const totalProcessingTime = Math.round((Date.now() - startTime) / 1000);
      
      showToast(`All ${pdf.numPages} pages exported successfully with maximum compression${compressionRatio} in ${totalProcessingTime}s`, "success");
    } catch (error) {
      console.error("Compressed export error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, compressPDF, canvasRef, document, documentId, showToast, pdfFile]);

  useEffect(() => {
    const initializePDFJS = async () => {
      try {
        // Add CMAPS for proper text extraction and better compression
        pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
      } catch (error) {
        console.warn('Could not initialize optional PDF.js components:', error);
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
        console.log('[PDFViewer] Rendering cancellation detected and handled:', event.error.message);
        
        // Help clear any stuck rendering states
        if (renderLockRef.current) {
          console.log('[PDFViewer] Clearing render lock after cancellation');
          renderLockRef.current = false;
        }
        
        // If we're stuck in a page change state for too long, clear it
        if (pageChangeInProgress && Date.now() - renderAttemptTimestampRef.current > 1000) {
          console.log('[PDFViewer] Clearing page change state after cancellation');
          setPageChangeInProgress(false);
        }
        
        // Also clear rendering state if needed
        if (isRendering) {
          console.log('[PDFViewer] Clearing rendering state after cancellation');
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
};
