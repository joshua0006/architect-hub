import { v4 as uuidv4 } from 'uuid';
import { Point, Annotation, AnnotationStyle } from '../types/annotation';

/**
 * Creates a text annotation at the specified position
 */
export const createTextAnnotation = (
  position: Point,
  text: string,
  style: AnnotationStyle,
  pageNumber: number,
  userId: string
): Annotation => {
  return {
    id: uuidv4(),
    type: 'text',
    points: [position],
    style: {
      ...style,
      text
    },
    pageNumber,
    text,
    timestamp: Date.now(),
    userId,
    version: 1
  };
};

/**
 * Creates a sticky note annotation at the specified position
 */
export const createStickyNoteAnnotation = (
  position: Point,
  text: string,
  style: AnnotationStyle,
  pageNumber: number,
  userId: string
): Annotation => {
  // Fixed style for sticky notes - ignore any user style
  const stickyNoteStyle: AnnotationStyle = {
    color: '#FFD700', // Fixed yellow color
    lineWidth: 1,
    opacity: 1,
    text,
    textOptions: {
      fontSize: 14,
      fontFamily: 'Arial',
      bold: false,
      italic: false,
      underline: false
    }
  };
  
  return {
    id: uuidv4(),
    type: 'stickyNote',
    points: [position],
    style: stickyNoteStyle,
    pageNumber,
    text,
    timestamp: Date.now(),
    userId,
    version: 1
  };
};

/**
 * Calculates the bounding box for a text annotation based on its content
 */
export const getTextAnnotationBounds = (
  position: Point,
  text: string,
  fontSize: number = 14,
  fontFamily: string = 'Arial'
): { width: number, height: number } => {
  // Create temporary canvas for text measurements
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return { width: 100, height: 20 }; // Default fallback
  
  // Set font properties to match what will be rendered
  ctx.font = `${fontSize}px ${fontFamily}`;
  
  // Split text by newlines and measure each line
  const lines = text.split('\n');
  let maxWidth = 0;
  
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    maxWidth = Math.max(maxWidth, metrics.width);
  }
  
  // Calculate height (approximate based on line count and font size)
  const lineHeight = fontSize * 1.2; // Standard line height
  const height = lineHeight * lines.length;
  
  // Add padding to ensure text fits comfortably
  // Use 8px padding to match the exact padding used in drawTextAnnotation
  const padding = 8;
  
  return {
    width: Math.max(maxWidth + padding * 2, 120),
    height: Math.max(height + padding * 2, 40)
  };
};

/**
 * Handles text input completion and creates appropriate annotation
 */
export const handleTextToolCompletion = (
  position: Point,
  text: string,
  isSticky: boolean,
  style: AnnotationStyle,
  pageNumber: number,
  userId: string,
  documentId: string,
  addAnnotation: (documentId: string, annotation: Annotation) => void
): void => {
  if (!text.trim()) return;
  
  const annotation = isSticky 
    ? createStickyNoteAnnotation(position, text, style, pageNumber, userId)
    : createTextAnnotation(position, text, style, pageNumber, userId);
  
  addAnnotation(documentId, annotation);
};

/**
 * Renders text annotation preview during placement
 */
export const renderTextPreview = (
  ctx: CanvasRenderingContext2D,
  position: Point,
  isSticky: boolean,
  scale: number,
  style: AnnotationStyle
): void => {
  const x = position.x * scale;
  const y = position.y * scale;
  
  ctx.save();
  
  if (isSticky) {
    // Draw sticky note background with fixed style
    ctx.fillStyle = '#FFD700'; // Fixed yellow color
    ctx.globalAlpha = 1;
    ctx.fillRect(x, y, 100 * scale, 100 * scale);
    
    // Draw fold corner
    ctx.beginPath();
    ctx.moveTo(x + 80 * scale, y);
    ctx.lineTo(x + 100 * scale, y + 20 * scale);
    ctx.lineTo(x + 100 * scale, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fill();
  } else {
    // Draw simple text cursor indicator
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 20 * scale);
    ctx.stroke();
  }
  
  ctx.restore();
};

/**
 * Checks if a point is inside a text or sticky note annotation
 */
export const isPointInTextAnnotation = (
  point: Point,
  annotation: Annotation,
  scale: number = 1
): boolean => {
  if (annotation.points.length === 0) return false;
  
  const position = annotation.points[0];
  const text = annotation.text || '';
  
  // Get bounds based on annotation type
  let width = 100;
  let height = 100;
  
  // Add padding to make selection easier (increased from previous values)
  const SELECTION_PADDING = 20; // Extra padding to make selection even easier
  
  if (annotation.type === 'stickyNote') {
    // Standard sticky note size
    width = 200;
    height = 150;
  } else {
    // Text annotation - calculate based on content
    const bounds = getTextAnnotationBounds(position, text);
    width = bounds.width;
    height = bounds.height;
  }
  
  // Check if point is within bounds with added padding for easier selection
  return (
    point.x >= (position.x - SELECTION_PADDING / scale) &&
    point.x <= (position.x + width / scale + SELECTION_PADDING / scale) &&
    point.y >= (position.y - SELECTION_PADDING / scale) &&
    point.y <= (position.y + height / scale + SELECTION_PADDING / scale)
  );
}; 