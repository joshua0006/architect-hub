import React, { createContext, useContext, useState } from "react";
import { Toast } from "../components/Toast";

interface ToastContextType {
  showToast: (message: string, type?: "success" | "error") => void;
  showAnnotationToast: (message: string, type?: "success" | "error") => void;
  suppressAnnotationToasts: boolean;
  setSuppressAnnotationToasts: (suppress: boolean) => void;
  toggleAnnotationToasts: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [suppressAnnotationToasts, setSuppressAnnotationToasts] = useState<boolean>(true);

  const showToast = (
    message: string,
    type: "success" | "error" = "success"
  ) => {
    setToast({ message, type });
  };

  // Separate function for annotation-related toasts that can be suppressed
  const showAnnotationToast = (
    message: string, 
    type: "success" | "error" = "success"
  ) => {
    // Only show the toast if suppression is disabled
    if (!suppressAnnotationToasts) {
      setToast({ message, type });
    }
  };

  // Helper function to toggle annotation toast visibility
  const toggleAnnotationToasts = () => {
    setSuppressAnnotationToasts(prev => !prev);
    // Show feedback about the change
    const newState = !suppressAnnotationToasts;
    setToast({ 
      message: newState 
        ? "Annotation notifications hidden" 
        : "Annotation notifications visible", 
      type: "success" 
    });
  };

  return (
    <ToastContext.Provider value={{ 
      showToast, 
      showAnnotationToast, 
      suppressAnnotationToasts, 
      setSuppressAnnotationToasts,
      toggleAnnotationToasts
    }}>
      {children}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};
