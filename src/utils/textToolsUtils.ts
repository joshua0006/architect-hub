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
  // Ensure textOptions exists and is properly initialized
  const textOptions = {
    fontSize: 14,
    fontFamily: 'Arial',
    bold: false,
    italic: false,
    underline: false,
    backgroundOpacity: 0, // Default background opacity is 0 (transparent)
    // Spread any existing textOptions from style, keeping above as defaults
    ...style.textOptions
  };
  
  return {
    id: uuidv4(),
    type: 'text',
    points: [position],
    style: {
      ...style,
      text,
      textOptions
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
  fontFamily: string = 'Arial',
  isBold: boolean = false,
  isItalic: boolean = false
): { width: number, height: number } => {
  // Create temporary canvas for text measurements
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return { width: 100, height: 20 }; // Default fallback
  
  // Set font properties to match what will be rendered
  let fontStyle = '';
  if (isBold) fontStyle += 'bold ';
  if (isItalic) fontStyle += 'italic ';
  ctx.font = `${fontStyle}${fontSize}px ${fontFamily}`;
  
  // Split text by newlines and measure each line
  const lines = text.split('\n');
  let maxWidth = 0;
  
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    maxWidth = Math.max(maxWidth, metrics.width);
  }
  
  // Calculate height (approximate based on line count and font size)
  const lineHeight = fontSize * 1.2; // Standard line height
  const textHeight = lineHeight * lines.length;
  
  // Add padding to ensure text fits comfortably
  // Use dynamic padding based on font size
  const paddingX = Math.max(10, fontSize * 0.5); // Increase padding for larger fonts
  const paddingY = Math.max(10, fontSize * 0.5);
  
  return {
    width: Math.max(maxWidth + paddingX * 2, 120),
    height: Math.max(textHeight + paddingY * 2, 40)
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
    // Draw sticky note background with more subtle style
    const width = 150 * scale;
    const height = 100 * scale;
    
    // Add shadow for depth
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 5 * scale;
    ctx.shadowOffsetX = 2 * scale;
    ctx.shadowOffsetY = 2 * scale;
    
    // Draw main background with subtle color
    ctx.fillStyle = '#FFFDE7'; // Very light yellow
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x, y, width, height);
    
    // Reset shadow for cleaner elements
    ctx.shadowColor = 'transparent';
    
    // Draw fold corner
    ctx.beginPath();
    ctx.moveTo(x + width - 15*scale, y);
    ctx.lineTo(x + width, y + 15*scale);
    ctx.lineTo(x + width, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fill();
    
    // Draw placeholder lines
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1 * scale;
    
    const lineStartX = x + 10 * scale;
    const lineEndX = x + width - 20 * scale;
    const lineStartY = y + 30 * scale;
    const lineSpacing = 15 * scale;
    
    // Draw 3 placeholder lines
    for (let i = 0; i < 3; i++) {
      const lineY = lineStartY + (i * lineSpacing);
      ctx.beginPath();
      ctx.moveTo(lineStartX, lineY);
      ctx.lineTo(lineEndX - (i * 15 * scale), lineY); // Shorter lines as they go down
      ctx.stroke();
    }
    
    // Add border
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1 * scale;
    ctx.strokeRect(x, y, width, height);
  } else {
    // Draw a more modern text cursor indicator
    const width = 120 * scale;
    const height = 60 * scale;
    
    // Draw subtle background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(x, y, width, height);
    
    // Add border
    ctx.strokeStyle = style.color || 'rgba(33, 150, 243, 0.5)'; // Use the current style color
    ctx.lineWidth = 1 * scale;
    ctx.strokeRect(x, y, width, height);
    
    // Draw text cursor
    const cursorX = x + 10 * scale;
    const cursorStartY = y + 15 * scale;
    const cursorHeight = 20 * scale;
    
    ctx.strokeStyle = style.color || '#2196F3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursorX, cursorStartY);
    ctx.lineTo(cursorX, cursorStartY + cursorHeight);
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
    // Check if annotation already has calculated width and height
    if (annotation.width && annotation.height) {
      width = annotation.width;
      height = annotation.height;
    } else {
      // Text annotation - calculate based on content
      const textOptions = annotation.style.textOptions || {};
      const fontSize = textOptions.fontSize || 14;
      const fontFamily = textOptions.fontFamily || 'Arial';
      const isBold = textOptions.bold || false;
      const isItalic = textOptions.italic || false;
      
      // Use a more accurate calculation that considers all text styling options
      const bounds = getTextAnnotationBounds(
        position, 
        text, 
        fontSize, 
        fontFamily,
        isBold,
        isItalic
      );
      width = bounds.width;
      height = bounds.height;
    }
  }
  
  // Check if point is within bounds with added padding for easier selection
  return (
    point.x >= (position.x - SELECTION_PADDING / scale) &&
    point.x <= (position.x + width / scale + SELECTION_PADDING / scale) &&
    point.y >= (position.y - SELECTION_PADDING / scale) &&
    point.y <= (position.y + height / scale + SELECTION_PADDING / scale)
  );
}; 