import React, { useState } from "react";
import { Point, createAnnotation } from "../types/annotation";
import { TextInput } from "./TextInput";
import { useAnnotationStore } from "../store/useAnnotationStore";
import { v4 as uuidv4 } from "uuid";

interface TextToolProps {
  documentId: string;
  pageNumber: number;
  scale: number;
  onComplete: () => void;
  onCancel: () => void;
}

const TextTool: React.FC<TextToolProps> = ({
  documentId,
  pageNumber,
  scale,
  onComplete,
  onCancel,
}) => {
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isStickyNote, setIsStickyNote] = useState<boolean>(false);
  
  const store = useAnnotationStore();
  const { currentTool, currentStyle } = store;

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (currentTool !== "text" && currentTool !== "stickyNote") return;
    
    // Get position from click
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    setTextPosition({ x, y });
    setIsEditing(true);
    setIsStickyNote(currentTool === "stickyNote");
  };

  const handleTextComplete = (text: string) => {
    if (!textPosition) return;
    
    // Create annotation
    const annotation = createAnnotation(isStickyNote ? "stickyNote" : "text");
    annotation.id = uuidv4();
    annotation.points = [textPosition, { x: textPosition.x + 100, y: textPosition.y + 30 }];
    annotation.text = text;
    annotation.pageNumber = pageNumber;
    annotation.style = {
      ...currentStyle,
      color: isStickyNote ? "#FFD700" : currentStyle.color,
    };
    
    // Add to store
    store.addAnnotation(documentId, annotation);
    
    // Reset state
    setTextPosition(null);
    setIsEditing(false);
    onComplete();
  };

  const handleTextCancel = () => {
    setTextPosition(null);
    setIsEditing(false);
    onCancel();
  };

  return (
    <div 
      className="absolute inset-0 w-full h-full"
      onClick={handleCanvasClick}
      style={{ cursor: (currentTool === "text" || currentTool === "stickyNote") ? "text" : "default" }}
    >
      {isEditing && textPosition && (
        <TextInput
          position={textPosition}
          onComplete={handleTextComplete}
          onCancel={handleTextCancel}
          scale={scale}
          isSticky={isStickyNote}
          initialText=""
        />
      )}
    </div>
  );
};

export default TextTool; 