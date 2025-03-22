import React, { useEffect, useState } from "react";

export const ShiftKeyIndicator: React.FC = () => {
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setIsShiftPressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setIsShiftPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  if (!isShiftPressed) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg opacity-80">
      Hold Shift for multi-select
    </div>
  );
};
