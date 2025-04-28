import React from 'react';
import { Bold, Italic, Underline, ChevronDown, Square } from 'lucide-react';
import { AnnotationStyle } from '../types/annotation';
import { useAnnotationStore } from '../store/useAnnotationStore';

interface TextFormatToolbarProps {
  selectedAnnotationId?: string;
}

export const TextFormatToolbar: React.FC<TextFormatToolbarProps> = ({ selectedAnnotationId }) => {
  const { currentStyle, setCurrentStyle, updateAnnotation, currentDocumentId, selectedAnnotations } = useAnnotationStore();
  
  // When a text annotation is selected, get its text options
  const selectedTextOptions = React.useMemo(() => {
    if (selectedAnnotations.length > 0 && selectedAnnotations[0].type === 'text') {
      return selectedAnnotations[0].style.textOptions || {};
    }
    return null;
  }, [selectedAnnotations]);
  
  // Use selected annotation's text options if available, otherwise use currentStyle
  const textOptions = selectedTextOptions || currentStyle.textOptions || {
    fontSize: 14,
    fontFamily: 'Arial',
    bold: false,
    italic: false,
    underline: false,
    backgroundOpacity: 0 // Default background opacity to 0
  };

  const fontSizes = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48];
  const fontFamilies = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Helvetica'];

  // Helper function to update text options
  const updateTextOptions = (newOptions: Partial<AnnotationStyle['textOptions']>) => {
    const updatedTextOptions = {
      ...textOptions,
      ...newOptions
    };

    // Always update current style for new annotations
    setCurrentStyle({ textOptions: updatedTextOptions });

    // Update selected annotations if any
    if (selectedAnnotations.length > 0 && currentDocumentId) {
      selectedAnnotations.forEach(annotation => {
        if (annotation.type === 'text') {
          updateAnnotation(currentDocumentId, {
            ...annotation,
            style: { 
              ...annotation.style, 
              textOptions: {
                ...annotation.style.textOptions,
                ...newOptions
              }
            }
          });
        }
      });
      
      // Dispatch event to force a redraw
      const event = new CustomEvent('annotationChanged', {
        bubbles: true,
        detail: { 
          source: 'textFormatting'
        }
      });
      document.dispatchEvent(event);
    }
  };

  const toggleBold = () => {
    updateTextOptions({ bold: !textOptions.bold });
  };

  const toggleItalic = () => {
    updateTextOptions({ italic: !textOptions.italic });
  };

  const toggleUnderline = () => {
    updateTextOptions({ underline: !textOptions.underline });
  };

  const changeFontSize = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fontSize = parseInt(e.target.value, 10);
    updateTextOptions({ fontSize });
  };

  const changeFontFamily = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateTextOptions({ fontFamily: e.target.value });
  };
  
  const changeBackgroundOpacity = (e: React.ChangeEvent<HTMLInputElement>) => {
    const backgroundOpacity = parseFloat(e.target.value);
    updateTextOptions({ backgroundOpacity });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-white border-t border-gray-200">
      {/* Font Family Dropdown */}
      <div className="relative">
        <select
          value={textOptions.fontFamily || 'Arial'}
          onChange={changeFontFamily}
          className="h-8 pl-2 pr-8 text-sm bg-white border rounded appearance-none border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {fontFamilies.map(font => (
            <option key={font} value={font} style={{ fontFamily: font }}>
              {font}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none" />
      </div>

      {/* Font Size Dropdown */}
      <div className="relative">
        <select
          value={textOptions.fontSize || 14}
          onChange={changeFontSize}
          className="h-8 pl-2 pr-6 text-sm bg-white border rounded appearance-none border-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {fontSizes.map(size => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 pointer-events-none" />
      </div>

      {/* Formatting Buttons */}
      <div className="flex gap-1">
        <button
          onClick={toggleBold}
          className={`p-1.5 rounded ${textOptions.bold ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
          title="Bold"
        >
          <Bold size={16} />
        </button>
        <button
          onClick={toggleItalic}
          className={`p-1.5 rounded ${textOptions.italic ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
          title="Italic"
        >
          <Italic size={16} />
        </button>
        <button
          onClick={toggleUnderline}
          className={`p-1.5 rounded ${textOptions.underline ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
          title="Underline"
        >
          <Underline size={16} />
        </button>
      </div>

      {/* Background Opacity Slider */}
      <div className="flex items-center gap-2 ml-2">
        <Square size={16} className="text-gray-500" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={textOptions.backgroundOpacity !== undefined ? textOptions.backgroundOpacity : 0}
          onChange={changeBackgroundOpacity}
          className="w-20 h-1.5 appearance-none bg-gray-300 rounded outline-none"
          title="Background Opacity"
        />
        <span className="text-xs text-gray-500">{(textOptions.backgroundOpacity !== undefined ? textOptions.backgroundOpacity : 0) * 100}%</span>
      </div>
    </div>
  );
}; 