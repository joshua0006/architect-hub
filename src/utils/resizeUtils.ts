import { Point, Annotation } from "../types/annotation";

export type ResizeHandle =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "center"
  | null;

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Get bounds from points
export const getBounds = (points: Point[]): Bounds => {
  return points.reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x),
      right: Math.max(bounds.right, point.x),
      top: Math.min(bounds.top, point.y),
      bottom: Math.max(bounds.bottom, point.y),
    }),
    {
      left: points[0].x,
      right: points[0].x,
      top: points[0].y,
      bottom: points[0].y,
    }
  );
};

// Get cursor style for resize handle
export const getResizeCursor = (handle: ResizeHandle): string => {
  switch (handle) {
    case "topLeft":
    case "bottomRight":
      return "nwse-resize";
    case "topRight":
    case "bottomLeft":
      return "nesw-resize";
    case "top":
    case "bottom":
      return "ns-resize";
    case "left":
    case "right":
      return "ew-resize";
    case "center":
      return "move";
    default:
      return "default";
  }
};

// Check if point is near resize handle
export const getResizeHandle = (
  point: Point,
  annotation: Annotation,
  scale: number
): ResizeHandle => {
  const bounds = getBounds(annotation.points);
  const handleSize = 8 / scale;

  const handles = {
    topLeft: { x: bounds.left, y: bounds.top },
    topRight: { x: bounds.right, y: bounds.top },
    bottomLeft: { x: bounds.left, y: bounds.bottom },
    bottomRight: { x: bounds.right, y: bounds.bottom },
    top: { x: (bounds.left + bounds.right) / 2, y: bounds.top },
    bottom: { x: (bounds.left + bounds.right) / 2, y: bounds.bottom },
    left: { x: bounds.left, y: (bounds.top + bounds.bottom) / 2 },
    right: { x: bounds.right, y: (bounds.top + bounds.bottom) / 2 },
    center: { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 },
  };

  // Check each handle
  for (const [handleType, handlePoint] of Object.entries(handles)) {
    if (isWithinResizeHandle(point, handlePoint, scale)) {
      return handleType as ResizeHandle;
    }
  }

  return null;
};

// Check if resize operation is valid
export const isValidResize = (
  annotation: Annotation,
  handle: ResizeHandle
): boolean => {
  // Don't allow resizing for certain annotation types
  const nonResizableTypes = ["stamp", "freehand"];
  return !nonResizableTypes.includes(annotation.type);
};

// Specialized function for resizing circles
export const getResizedCirclePoints = (
  originalPoints: Point[],
  handle: ResizeHandle,
  currentPoint: Point,
  isDiameterMode: boolean = false,
  minSize: number = 10,
  keepAspectRatio: boolean = false
): Point[] => {
  if (originalPoints.length < 2) return originalPoints;
  
  const [p1, p2] = originalPoints;
  
  // Make a deep copy to avoid modifying the original points
  const newPoints: Point[] = [
    { x: p1.x, y: p1.y },
    { x: p2.x, y: p2.y }
  ];
  
  if (isDiameterMode) {
    // In diameter mode, both points define the diameter
    // We need to calculate the center and then resize accordingly
    const centerX = (p1.x + p2.x) / 2;
    const centerY = (p1.y + p2.y) / 2;
    
    // Calculate original radius
    const originalRadius = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    ) / 2;
    
    // Check if we're using the special "center" handle
    if (handle === "center") {
      // When dragging from center, we keep the center position
      // but resize the circle based on drag distance
      
      // Calculate distance from center to current point
      const distance = Math.sqrt(
        Math.pow(currentPoint.x - centerX, 2) + 
        Math.pow(currentPoint.y - centerY, 2)
      );
      
      // Ensure minimum circle size
      if (distance < minSize / 2) {
        return originalPoints;
      }
      
      // Calculate direction vector from center to current point
      const dx = currentPoint.x - centerX;
      const dy = currentPoint.y - centerY;
      
      // Normalize the direction vector
      const length = Math.sqrt(dx * dx + dy * dy);
      const normalizedDx = dx / length;
      const normalizedDy = dy / length;
      
      // Calculate new points to maintain center but adjust radius
      newPoints[0] = {
        x: centerX - normalizedDx * distance,
        y: centerY - normalizedDy * distance
      };
      
      newPoints[1] = {
        x: centerX + normalizedDx * distance,
        y: centerY + normalizedDy * distance
      };
      
      return newPoints;
    }
    
    // For regular handle points on the perimeter, maintain the center
    // but update the radius based on the new handle position
    
    // Calculate vector from center to the handle point
    const handleVector = {
      x: currentPoint.x - centerX,
      y: currentPoint.y - centerY
    };
    
    // Calculate the distance from center to current point (new radius)
    const newDistance = Math.sqrt(
      handleVector.x * handleVector.x + 
      handleVector.y * handleVector.y
    );
    
    // Ensure minimum circle size
    if (newDistance < minSize / 2) {
      return originalPoints;
    }
    
    // For uniform resizing (with Shift key), 
    // we want to maintain a perfect circle from the center point
    if (keepAspectRatio) {
      // Create a perfect circle based on the new radius
      // Find angles to place points opposite each other through the center
      let angle = 0;
      
      // Determine the angle based on which handle is being dragged
      switch (handle) {
        case "right": angle = 0; break;
        case "bottomRight": angle = Math.PI / 4; break;
        case "bottom": angle = Math.PI / 2; break;
        case "bottomLeft": angle = 3 * Math.PI / 4; break;
        case "left": angle = Math.PI; break;
        case "topLeft": angle = 5 * Math.PI / 4; break;
        case "top": angle = 3 * Math.PI / 2; break;
        case "topRight": angle = 7 * Math.PI / 4; break;
        default: angle = Math.atan2(handleVector.y, handleVector.x);
      }
      
      // Set both points to create a perfect circle
      if (isDiameterMode) {
        // In diameter mode, points should be on opposite sides
        newPoints[0] = {
          x: centerX + newDistance * Math.cos(angle + Math.PI),
          y: centerY + newDistance * Math.sin(angle + Math.PI)
        };
        
        newPoints[1] = {
          x: centerX + newDistance * Math.cos(angle),
          y: centerY + newDistance * Math.sin(angle)
        };
      } else {
        // In center-radius mode, first point is center, second is perimeter
        newPoints[0] = { x: centerX, y: centerY };
        newPoints[1] = {
          x: centerX + newDistance * Math.cos(angle),
          y: centerY + newDistance * Math.sin(angle)
        };
      }
      
      return newPoints;
    }
    
    // Regular resizing - calculate direction vector and angle to the handle
    const angle = Math.atan2(handleVector.y, handleVector.x);
    
    // For diameter mode, update both points to maintain the center
    if (isDiameterMode) {
      // In diameter mode, points should be on opposite sides
      newPoints[0] = {
        x: centerX + newDistance * Math.cos(angle + Math.PI),
        y: centerY + newDistance * Math.sin(angle + Math.PI)
      };
      
      newPoints[1] = {
        x: centerX + newDistance * Math.cos(angle),
        y: centerY + newDistance * Math.sin(angle)
      };
    } else {
      // In center-radius mode, first point is center, second is on perimeter
      // Keep the center point fixed
      newPoints[0] = { x: centerX, y: centerY };
      newPoints[1] = {
        x: centerX + newDistance * Math.cos(angle),
        y: centerY + newDistance * Math.sin(angle)
      };
    }
    
    return newPoints;
  } else {
    // In center-radius mode, p1 is the center, p2 is a point on the circumference
    const centerX = p1.x;
    const centerY = p1.y;
    
    // Check if we're using the special "center" handle
    if (handle === "center") {
      // For center handle in center-radius mode, we keep the same radius
      // but calculate a new position on the perimeter based on drag direction
      
      // Calculate distance and direction from center to current point
      const dx = currentPoint.x - centerX;
      const dy = currentPoint.y - centerY;
      
      // Get the original radius
      const originalRadius = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
      );
      
      // Normalize the direction vector and scale by original radius
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Avoid division by zero
      if (distance < 0.001) {
        return originalPoints;
      }
      
      const normalizedDx = dx / distance;
      const normalizedDy = dy / distance;
      
      // Update only the second point to maintain radius but change direction
      newPoints[1] = {
        x: centerX + normalizedDx * originalRadius,
        y: centerY + normalizedDy * originalRadius
      };
      
      return newPoints;
    }
    
    // When dragging handles on the circle edge
    // Calculate distance from center to current point
    const dx = currentPoint.x - centerX;
    const dy = currentPoint.y - centerY;
    
    // For uniform resizing (with Shift key)
    if (keepAspectRatio) {
      // Keep the direction the same as the original but update the distance
      const originalVector = {
        x: p2.x - p1.x,
        y: p2.y - p1.y
      };
      
      // Get the original direction
      const originalDistance = Math.sqrt(
        originalVector.x * originalVector.x + originalVector.y * originalVector.y
      );
      
      const newDistance = Math.sqrt(dx * dx + dy * dy);
      
      // Ensure minimum circle size
      if (newDistance < minSize / 2) {
        return originalPoints;
      }
      
      // Maintain the original angle but update the distance
      if (originalDistance > 0) {
        const normalizedOriginalX = originalVector.x / originalDistance;
        const normalizedOriginalY = originalVector.y / originalDistance;
        
        newPoints[1] = {
          x: centerX + normalizedOriginalX * newDistance,
          y: centerY + normalizedOriginalY * newDistance
        };
      }
      
      return newPoints;
    }
    
    // Calculate the normalized distance (direction vector)
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Ensure minimum circle size
    if (distance < minSize / 2) {
      return originalPoints;
    }
    
    // Update the circumference point (p2) based on drag direction
    newPoints[1] = { 
      x: centerX + dx, 
      y: centerY + dy 
    };
  }
  
  // Calculate the new radius to ensure it meets minimum size
  const newRadius = Math.sqrt(
    Math.pow(newPoints[1].x - newPoints[0].x, 2) + 
    Math.pow(newPoints[1].y - newPoints[0].y, 2)
  );
  
  if (isDiameterMode && newRadius < minSize / 2) {
    return originalPoints;
  }
  
  return newPoints;
};

// Calculate new points during resize
export const getResizedPoints = (
  originalPoints: Point[],
  handle: ResizeHandle,
  currentPoint: Point,
  keepAspectRatio: boolean = false,
  minSize: number = 10,
  annotation?: Annotation
): Point[] => {
  // Handle circle resizing separately if this is a circle annotation
  if (annotation && annotation.type === "circle") {
    const isDiameterMode = annotation.style.circleDiameterMode as boolean || false;
    return getResizedCirclePoints(originalPoints, handle, currentPoint, isDiameterMode, minSize, keepAspectRatio);
  }

  const bounds = getBounds(originalPoints);
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const aspectRatio = width / height;

  const newBounds = { ...bounds };

  switch (handle) {
    case "topLeft":
      if (keepAspectRatio) {
        const dx = bounds.right - currentPoint.x;
        const dy = bounds.bottom - currentPoint.y;
        const distance = Math.max(dx, dy);
        newBounds.left = bounds.right - distance;
        newBounds.top = bounds.bottom - distance / aspectRatio;
      } else {
        newBounds.left = currentPoint.x;
        newBounds.top = currentPoint.y;
      }
      break;

    case "topRight":
      if (keepAspectRatio) {
        const dx = currentPoint.x - bounds.left;
        const dy = bounds.bottom - currentPoint.y;
        const distance = Math.max(dx, dy);
        newBounds.right = bounds.left + distance;
        newBounds.top = bounds.bottom - distance / aspectRatio;
      } else {
        newBounds.right = currentPoint.x;
        newBounds.top = currentPoint.y;
      }
      break;

    case "bottomLeft":
      if (keepAspectRatio) {
        const dx = bounds.right - currentPoint.x;
        const dy = currentPoint.y - bounds.top;
        const distance = Math.max(dx, dy);
        newBounds.left = bounds.right - distance;
        newBounds.bottom = bounds.top + distance / aspectRatio;
      } else {
        newBounds.left = currentPoint.x;
        newBounds.bottom = currentPoint.y;
      }
      break;

    case "bottomRight":
      if (keepAspectRatio) {
        const dx = currentPoint.x - bounds.left;
        const dy = currentPoint.y - bounds.top;
        const distance = Math.max(dx, dy);
        newBounds.right = bounds.left + distance;
        newBounds.bottom = bounds.top + distance / aspectRatio;
      } else {
        newBounds.right = currentPoint.x;
        newBounds.bottom = currentPoint.y;
      }
      break;

    case "top":
      newBounds.top = currentPoint.y;
      break;

    case "right":
      newBounds.right = currentPoint.x;
      break;

    case "bottom":
      newBounds.bottom = currentPoint.y;
      break;

    case "left":
      newBounds.left = currentPoint.x;
      break;

    case "center":
      // Center handle does not affect bounds
      return originalPoints;

    default:
      return originalPoints;
  }

  // Validate minimum size
  const newWidth = newBounds.right - newBounds.left;
  const newHeight = newBounds.bottom - newBounds.top;

  if (newWidth < minSize || newHeight < minSize) {
    return originalPoints;
  }

  // Return new points maintaining the original order
  const isFlippedX = originalPoints[0].x > originalPoints[1].x;
  const isFlippedY = originalPoints[0].y > originalPoints[1].y;

  return [
    {
      x: isFlippedX ? newBounds.right : newBounds.left,
      y: isFlippedY ? newBounds.bottom : newBounds.top,
    },
    {
      x: isFlippedX ? newBounds.left : newBounds.right,
      y: isFlippedY ? newBounds.top : newBounds.bottom,
    },
  ];
};

// Add helper function to check if point is within resize handle
export const isWithinResizeHandle = (
  point: Point,
  handle: Point,
  scale: number,
  threshold: number = 8
): boolean => {
  const scaledThreshold = threshold / scale;
  return (
    Math.abs(point.x - handle.x) <= scaledThreshold &&
    Math.abs(point.y - handle.y) <= scaledThreshold
  );
};
