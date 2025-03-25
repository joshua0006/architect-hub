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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Add missing refs
  const renderTaskRef = useRef<any>(null);
  const renderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const renderLockRef = useRef<boolean>(false);
  const renderCooldownActiveRef = useRef<boolean>(false);
  const renderAttemptTimestampRef = useRef<number>(0);
  const initializationStartedRef = useRef<boolean>(false);
  
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

  // Function to center the document in the view
  const scrollToCenterDocument = useCallback(() => {
    if (!containerRef.current || !page) return;
    
    const container = containerRef.current;
    const scrollContainer = container.querySelector('.overflow-auto');
    if (!scrollContainer) return;
    
    // Calculate center position
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
    
    console.log(`[PDFViewer] Centered document: scrollLeft=${scrollLeft}, scrollTop=${scrollTop}`);
  }, [page, viewport]);

  // Helper function to get annotations for a specific page
  const getAnnotationsForPage = useCallback((documentId: string, pageNumber: number) => {
    // Get all annotations for the document
    const documentAnnotations = annotationStore.documents[documentId]?.annotations || [];
    
    // Filter annotations for this specific page
    return documentAnnotations.filter(annotation => annotation.pageNumber === pageNumber);
  }, [annotationStore.documents]);

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
    
    // If we're currently changing pages or rendering, we'll queue this navigation
    if (pageChangeInProgress || isRendering) {
      // If page change is already in progress but seems stuck, force clear it
      if (pageChangeInProgress) {
        const timeSinceLastChange = Date.now() - renderAttemptTimestampRef.current;
        if (timeSinceLastChange > 2000) { // If it's been stuck for more than 2 seconds
          console.log('[PDFViewer] Forcing navigation despite page change in progress');
          // Cancel any current render
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
              renderTaskRef.current = null;
            } catch (error) {
              console.error('[PDFViewer] Error cancelling render task:', error);
            }
          }
          renderLockRef.current = false;
        } else {
          console.log('[PDFViewer] Navigation ignored - page change already in progress');
          return;
        }
      } else {
        console.log('[PDFViewer] Navigation ignored - rendering in progress');
        return;
      }
    }
    
    console.log('[PDFViewer] Navigating to previous page:', prevPage);
    
    // Cancel any current render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (error) {
        console.error('[PDFViewer] Error cancelling render task:', error);
      }
      renderTaskRef.current = null;
    }
    
    // Track when we started this navigation attempt
    renderAttemptTimestampRef.current = Date.now();
    
    // Clear render lock
    renderLockRef.current = false;
    
    // Set flags to indicate page change is in progress
    setPageChangeInProgress(true);
    setIsRendering(false); // Reset any existing render state
    
    // Change the page
    setCurrentPage(prevPage);
  }, [currentPage, isExporting, pageChangeInProgress, isRendering]);

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
    
    // If we're currently changing pages or rendering, we'll queue this navigation
    if (pageChangeInProgress || isRendering) {
      // If page change is already in progress but seems stuck, force clear it
      if (pageChangeInProgress) {
        const timeSinceLastChange = Date.now() - renderAttemptTimestampRef.current;
        if (timeSinceLastChange > 2000) { // If it's been stuck for more than 2 seconds
          console.log('[PDFViewer] Forcing navigation despite page change in progress');
          // Cancel any current render
          if (renderTaskRef.current) {
            try {
              renderTaskRef.current.cancel();
              renderTaskRef.current = null;
            } catch (error) {
              console.error('[PDFViewer] Error cancelling render task:', error);
            }
          }
          renderLockRef.current = false;
        } else {
          console.log('[PDFViewer] Navigation ignored - rendering in progress');
          return;
        }
      } else {
        console.log('[PDFViewer] Navigation ignored - rendering in progress');
        return;
      }
    }
    
    console.log('[PDFViewer] Navigating to next page:', nextPage);
    
    // Cancel any current render
    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (error) {
        console.error('[PDFViewer] Error cancelling render task:', error);
      }
      renderTaskRef.current = null;
    }
    
    // Track when we started this navigation attempt
    renderAttemptTimestampRef.current = Date.now();
    
    // Clear render lock
    renderLockRef.current = false;
    
    // Set flags to indicate page change is in progress
    setPageChangeInProgress(true);
    setIsRendering(false); // Reset any existing render state
    
    // Change the page
    setCurrentPage(nextPage);
  }, [currentPage, pdf?.numPages, isExporting, pageChangeInProgress, isRendering]);

  // Add this at the top, right after refs
  let hasLoggedRenderSkip = false;

  // Update the renderPdfPage function to implement caching
  const renderPdfPage = useCallback(() => {
    try {
      // Skip if we're in the middle of a page change or the page is not properly set
      if (!currentPage) {
        return;
      }

      // Check if render lock is active, which prevents overlapping renders
      if (renderLockRef.current) {
        return;
      }

      // Skip if we don't have all the required elements
      if (!canvasRef.current || !pdf || !fileId) {
        // If we're in the middle of a page change but we don't have required elements,
        // we should reset the flag to avoid getting stuck
        if (pageChangeInProgress) {
          console.log('[PDFViewer] Resetting page change state - missing required elements');
          setPageChangeInProgress(false);
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

      // Generate a cache key based on fileId and scale
      const cacheKey = `${fileId}_${scale.toFixed(2)}`;
      
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
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      // Set render lock to prevent overlapping renders
      renderLockRef.current = true;
      
      // Set state to indicate rendering is in progress
      setIsRendering(true);
      
      // Log only when starting a new render (not for retries)
      console.log(`[PDFViewer] Rendering page ${currentPage}`);

      // Get the PDF page
      pdf.getPage(currentPage).then(
        (page) => {
          try {
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
            const scale = widthScale;
            
            viewport = page.getViewport({ scale });

            // Set canvas dimensions to match viewport exactly
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Define render parameters
            const renderContext = {
              canvasContext: ctx,
              viewport: viewport,
            };

            // Start the render task
            renderTaskRef.current = page.render(renderContext);
            
            // Handle successful render
            renderTaskRef.current.promise.then(
              () => {
                // Cache the rendered page
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const cacheKey = `${fileId}_${scale.toFixed(2)}`;
                
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
                
                // Reset render lock
                renderLockRef.current = false;
                
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
                
                // Center the document after a brief delay to ensure UI is updated
                setTimeout(() => {
                  scrollToCenterDocument();
                }, 50);
              },
              (error: Error) => {
                // Handle render failure
                console.error(`[PDFViewer] Error rendering page ${currentPage}:`, error);
                
                // Reset all state flags on error
                renderLockRef.current = false;
                setIsRendering(false);
                setPageChangeInProgress(false);
                
                // Clear any previous timeout
                if (renderTimeoutRef.current) {
                  clearTimeout(renderTimeoutRef.current);
                  renderTimeoutRef.current = null;
                }
              }
            );
          } catch (err) {
            console.error('[PDFViewer] Error setting up render:', err);
            renderLockRef.current = false;
            setIsRendering(false);
            setPageChangeInProgress(false);
          }
        },
        (error) => {
          console.error(`[PDFViewer] Failed to get page ${currentPage}:`, error);
          renderLockRef.current = false;
          setIsRendering(false);
          setPageChangeInProgress(false);
        }
      );
    } catch (err) {
      console.error('[PDFViewer] Exception during render:', err);
      renderLockRef.current = false;
      setIsRendering(false);
      setPageChangeInProgress(false);
    }
  }, [pdf, currentPage, fileId, pageChangeInProgress, setIsRendering, annotationStore, setCurrentAnnotations, documentId, scrollToCenterDocument, setRenderComplete, scale]);

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
      return;
    }
    
    // Set a timeout to force clear the page change flag if it gets stuck
    const pageChangeTimeout = setTimeout(() => {
      if (pageChangeInProgress) {
        console.log('[PDFViewer] Force clearing page change state after timeout');
        setPageChangeInProgress(false);
      }
    }, 5000); // 5 second safety timeout
    
    // Always attempt to render when the page changes
    if (pageChangeInProgress) {
      console.log(`[PDFViewer] Page change detected to page ${currentPage}, starting render`);
      
      // Reset render tracking state for the new page to force a fresh render
      hasRenderedOnceRef.current[currentPage] = false;
      renderedPagesRef.current.delete(currentPage);
      
      // Allow a small delay for the page change state to take effect before rendering
      setTimeout(() => {
        // Start the render process
        renderPdfPage();
      }, 50);
    }
    
    return () => {
      // Clean up the safety timeout when the effect is cleaned up
      clearTimeout(pageChangeTimeout);
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
    
    // Log the dimensions and scaling for debugging
    console.log(`[PDFViewer] Original PDF dimensions: ${viewport.width}x${viewport.height}`);
    console.log(`[PDFViewer] Aspect ratio: ${aspectRatio.toFixed(3)}`);
    console.log(`[PDFViewer] Container width: ${availableWidth}`);
    console.log(`[PDFViewer] New scale: ${newScale.toFixed(3)}`);
    console.log(`[PDFViewer] New dimensions: ${newWidth.toFixed(0)}x${newHeight.toFixed(0)}`);
    
    // Update the scale
    setScale(newScale);
    
    // Scroll to center after a brief delay to ensure rendering is complete
    setTimeout(() => {
      scrollToCenterDocument();
    }, 100);
    
    // Enable automatic fit for future page changes
    disableFitToWidthRef.current = false;
    
    console.log(`[PDFViewer] Fit to width: scale=${newScale}`);
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
    
    // Reset to 100%
    setScale(1.0);
    
    // Disable automatic fit to width for future page changes
    disableFitToWidthRef.current = true;
    
    // Center the document after resetting zoom
    setTimeout(() => {
      scrollToCenterDocument();
    }, 100);
    
    console.log(`[PDFViewer] Reset zoom: scale=1.0`);
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
      select: "default",
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
        handleFitToWidth();
      }, 200);
    }
  }, [page, handleFitToWidth]);

  // Function to generate a canvas with PDF content and annotations
  const createAnnotatedCanvas = useCallback(async (targetPage: PDFPageProxy, annotations: Annotation[], qualityScale: number = 1.0) => {
    // Create a new canvas for exporting
    const exportCanvas = document.createElement("canvas");
    const viewport = targetPage.getViewport({ scale: scale * qualityScale });
    exportCanvas.width = viewport.width;
    exportCanvas.height = viewport.height;
    
    // Get 2D context with alpha support for better annotation rendering
    const ctx = exportCanvas.getContext("2d", { alpha: true })!;
    
    // Set white background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    // Render PDF
    console.log(`[PDFViewer] Rendering PDF content to export canvas (scale: ${scale * qualityScale})`);
    const renderTask = targetPage.render({
      canvasContext: ctx,
      viewport: viewport,
      intent: "display"
    });
    
    // Wait for PDF rendering to complete
    await renderTask.promise;
    
    // Now draw annotations on top
    console.log(`[PDFViewer] Drawing ${annotations.length} annotations on export canvas`);
    
    // First draw non-highlight annotations
    const regularAnnotations = annotations.filter(a => a.type !== 'highlight');
    regularAnnotations.forEach(annotation => {
      try {
        drawAnnotation(ctx, annotation, scale * qualityScale);
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
          drawAnnotation(ctx, annotation, scale * qualityScale);
        } catch (err) {
          console.error("Error drawing highlight during export:", err);
        }
      });
      
      ctx.restore();
    }
    
    return { canvas: exportCanvas, viewport };
  }, [scale]);
  
  // Export all pages with annotations
  const handleExportAllPages = useCallback(async (quality?: "standard" | "hd") => {
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
      
      // Set scale factor based on requested quality
      const qualityScale = quality === "hd" ? 2.0 : 1.0;
      const qualityLabel = quality === "hd" ? "HD" : "Standard";
      
      showToast(`Starting export of all pages with ${qualityLabel} quality...`, "success");
      
      // Create a PDF with multiple pages
      const multiPagePdf = new jsPDF({
        orientation: viewport.width > viewport.height ? "landscape" : "portrait",
        unit: "px",
        format: [viewport.width, viewport.height],
      });
      
      // Export each page
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          // Get the page
          const pageObj = await pdf.getPage(pageNum);
          
          // Get annotations for this page
          const pageAnnotations = currentDoc.annotations.filter(
            (a: Annotation) => a.pageNumber === pageNum
          );
          
          // Create a canvas with both PDF content and annotations
          // For HD exports, we'll use a higher scale factor when rendering
          const exportCanvas = await createAnnotatedCanvas(pageObj, pageAnnotations, qualityScale);
          
          // If not the first page, add a new page to the PDF
          if (pageNum > 1) {
            multiPagePdf.addPage([viewport.width, viewport.height]);
          }
          
          // Add the page with annotations to the PDF
          // Use higher image quality when exporting HD
          multiPagePdf.addImage(
            exportCanvas.canvas.toDataURL("image/png", quality === "hd" ? 1.0 : 0.92),
            "PNG",
            0,
            0,
            viewport.width,
            viewport.height
          );
          
          // Update progress through console
          console.log(`Processed page ${pageNum} of ${pdf.numPages} with ${pageAnnotations.length} annotations (${qualityLabel} quality)`);
        } catch (error) {
          console.error(`Error processing page ${pageNum}:`, error);
          showToast(`Error on page ${pageNum}: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
      }
      
      // Save the complete PDF with a timestamp and quality indicator
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const qualitySuffix = quality === "hd" ? "-HD" : "";
      multiPagePdf.save(`${documentId}-annotated${qualitySuffix}-${timestamp}.pdf`);
      showToast(`All pages exported successfully with ${qualityLabel} quality`, "success");
    } catch (error) {
      console.error("Export all pages error:", error);
      showToast(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
    } finally {
      setIsExporting(false);
    }
  }, [pdf, canvasRef, viewport, scale, document, documentId, showToast, createAnnotatedCanvas]);

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

  return (
    <div className="relative flex flex-col h-full">
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
        />
      )}
      
      {/* Page indicator for event targeting */}
      {pdf && (
        <div className="hidden">
          <span className="page-number-display">{`${currentPage} / ${pdf.numPages}`}</span>
          <div id="tool-change-indicator" data-tool-changed="false"></div>
        </div>
      )}

      <div className="pdf-container h-full flex-1 overflow-hidden" ref={containerRef}>
        {/* PDF Viewer - Fixed container with scrollable content */}
        <div className="relative flex-1 overflow-auto bg-gray-100 p-2 md:p-4 h-full w-full">
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
            className="pdf-viewer-container mx-auto"
            style={{
              width: page ? `${viewport.width}px` : '100%',
              height: page ? `${viewport.height}px` : '100%',
              position: 'relative',
              maxWidth: '100%',
              marginBottom: '20px',
              opacity: isRendering ? 0.7 : 1,
              transition: 'opacity 0.2s ease-in-out, width 0.15s ease-out, height 0.15s ease-out',
              transformOrigin: 'top left',
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
};
