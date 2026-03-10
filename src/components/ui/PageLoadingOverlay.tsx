"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type PageLoadingContextType = {
  show: (message?: string) => void;
  hide: () => void;
};

const PageLoadingContext = createContext<PageLoadingContextType>({
  show: () => {},
  hide: () => {},
});

export function usePageLoading() {
  return useContext(PageLoadingContext);
}

export function PageLoadingProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Loading…");

  const show = useCallback((msg?: string) => {
    setMessage(msg ?? "Loading…");
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <PageLoadingContext.Provider value={{ show, hide }}>
      {children}
      {visible ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-xl bg-background border px-6 py-4 shadow-lg">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
            <span className="text-sm font-medium">{message}</span>
          </div>
        </div>
      ) : null}
    </PageLoadingContext.Provider>
  );
}
