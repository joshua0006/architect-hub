import { useState, useEffect } from "react";

export const useKeyboardShortcutGuide = () => {
  const [isShortcutGuideOpen, setIsShortcutGuideOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "?" &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setIsShortcutGuideOpen(true);
      } else if (e.key === "Escape") {
        setIsShortcutGuideOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    isShortcutGuideOpen,
    setIsShortcutGuideOpen,
  };
};
