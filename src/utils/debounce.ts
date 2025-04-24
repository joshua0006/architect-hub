/**
 * Creates a debounced function that delays invoking func until after wait milliseconds have elapsed
 * since the last time the debounced function was invoked.
 * @param func The function to debounce.
 * @param wait The number of milliseconds to delay.
 * @returns Returns the new debounced function with a cancel method.
 */
export interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debouncedFunction = function(this: ThisParameterType<T>, ...args: Parameters<T>) {
    const context = this;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(context, args);
      timeoutId = null; // Clear timeoutId after execution
    }, wait);
  } as DebouncedFunction<T>;

  debouncedFunction.cancel = function() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debouncedFunction;
}