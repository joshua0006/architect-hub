import React, { useRef, useState, useEffect } from 'react';
import { Palette } from 'lucide-react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const presetColors = [
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500',
    '#800080', '#008080', '#808000', '#800000',
    '#008000', '#000080', '#FFC0CB', '#A52A2A'
  ];

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 text-sm font-medium text-gray-700 bg-white border rounded hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <div
          className="w-4 h-4 rounded-full border border-gray-300"
          style={{ backgroundColor: color }}
        />
        <Palette size={16} />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 p-3 bg-white rounded-lg shadow-lg border z-50">
          <div className="grid grid-cols-4 gap-2 mb-3">
            {presetColors.map((presetColor) => (
              <button
                key={presetColor}
                onClick={() => {
                  onChange(presetColor);
                  if (inputRef.current) {
                    inputRef.current.value = presetColor;
                  }
                }}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  color === presetColor ? 'border-blue-500' : 'border-transparent'
                }`}
                style={{ backgroundColor: presetColor }}
              />
            ))}
          </div>
          
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
            />
            <input
              type="text"
              value={color}
              onChange={(e) => {
                const newColor = e.target.value;
                if (/^#[0-9A-Fa-f]{6}$/.test(newColor)) {
                  onChange(newColor);
                  if (inputRef.current) {
                    inputRef.current.value = newColor;
                  }
                }
              }}
              className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="#000000"
            />
          </div>
        </div>
      )}
    </div>
  );
};