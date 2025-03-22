import { useState } from 'react';
import { Point, Annotation } from '../../types/annotation';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import { isPointInAnnotation } from './selectionUtils';

export const useCanvasDrawing = (pageNumber: number, scale: number) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [stickyNote, setStickyNote] = useState<{
    x: number;
    y: number;
    type: 'text' | 'stickyNote';
    visible: boolean;
  }>({ x: 0, y: 0, visible: false });

  const {
    currentTool,
    currentStyle,
    selectedAnnotationId,
    addAnnotation,
    setSelectedAnnotation,
    moveAnnotation,
    annotations,
  } = useAnnotationStore();

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const point = {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };

    if (currentTool === 'select') {
      const clickedAnnotation = annotations
        .filter((a) => a.pageNumber === pageNumber)
        .find((annotation) => isPointInAnnotation(point, annotation, scale));

      setSelectedAnnotation(clickedAnnotation?.id || null);
      
      if (clickedAnnotation) {
        setIsDragging(true);
        setDragStart(point);
      }
      return;
    }

    if (currentTool === 'text' || currentTool === 'stickyNote') {
      setStickyNote({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        type: currentTool,
        visible: true
      });
      return;
    }

    setStartPoint(point);
    setIsDrawing(true);
    
    if (currentTool === 'freehand') {
      setCurrentPoints([point]);
    } else {
      setCurrentPoints([point, point]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDragging && selectedAnnotationId && dragStart) {
      const rect = e.currentTarget.getBoundingClientRect();
      const currentPoint = {
        x: (e.clientX - rect.left) / scale,
        y: (e.clientY - rect.top) / scale,
      };
      
      const dx = currentPoint.x - dragStart.x;
      const dy = currentPoint.y - dragStart.y;
      
      moveAnnotation(selectedAnnotationId, dx, dy);
      setDragStart(currentPoint);
      return;
    }

    if (!isDrawing) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const point = {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
    
    if (currentTool === 'freehand') {
      setCurrentPoints((prev) => [...prev, point]);
    } else {
      setCurrentPoints([startPoint!, point]);
    }
  };

  const handlePointerUp = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    setStartPoint(null);

    if (currentPoints.length < 2) return;

    let points = currentPoints;
    if (currentTool !== 'freehand') {
      points = [currentPoints[0], currentPoints[currentPoints.length - 1]];
    }

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: currentTool,
      points,
      style: currentStyle,
      pageNumber,
      timestamp: Date.now(),
      userId: 'current-user',
    };

    addAnnotation(annotation);
    setCurrentPoints([]);
  };

  const handleStickyNoteSubmit = (text: string) => {
    if (!text.trim()) return;
    
    const annotation: Annotation = {
      id: crypto.randomUUID(),
      type: currentTool === 'stickyNote' ? 'stickyNote' : 'text',
      points: [{
        x: stickyNote.x / scale,
        y: stickyNote.y / scale
      }],
      text,
      style: currentStyle,
      pageNumber,
      timestamp: Date.now(),
      userId: 'current-user',
    };

    addAnnotation(annotation);
    setStickyNote(prev => ({ ...prev, visible: false }));
  };

  const handleStickyNoteClose = () => {
    setStickyNote(prev => ({ ...prev, visible: false }));
  };

  return {
    isDrawing,
    startPoint,
    currentPoints,
    stickyNote,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleStickyNoteSubmit,
    handleStickyNoteClose,
  };
};