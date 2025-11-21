import { createContext, useContext, useEffect } from 'react';

interface BlurBackgroundContextType {
  registerOverlay: () => () => void;
  isBlurred: boolean;
}

export const BlurBackgroundContext = createContext<BlurBackgroundContextType | null>(null);

export function useBlurBackground() {
  return useContext(BlurBackgroundContext);
}

export function useRegisterOverlay(isOpen: boolean) {
  const context = useBlurBackground();
  
  useEffect(() => {
    if (isOpen && context) {
      return context.registerOverlay();
    }
  }, [isOpen, context]);
}
