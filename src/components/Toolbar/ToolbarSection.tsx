import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ToolbarSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export const ToolbarSection: React.FC<ToolbarSectionProps> = ({
  title,
  children,
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(
    title === "Architectural Symbols" ? true : defaultExpanded
  );

  // Add debug logging for Actions section
  if (title === "Actions") {
    console.log("[ToolbarSection] Rendering Actions section:", { children });
  }

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-sm font-medium text-gray-700">{title}</span>
        <div className="text-gray-400 transition-transform duration-200">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isExpanded ? "max-h-96" : "max-h-0"
        }`}
      >
        <div className="p-2">{children}</div>
      </div>
    </div>
  );
};
