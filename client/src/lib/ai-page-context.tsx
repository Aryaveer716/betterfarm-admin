import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";

interface PageContextState {
  pageContext: unknown;
  pageIdentifier: string;
}

interface PageContextValue extends PageContextState {
  setPageContext: (data: unknown) => void;
  clearPageContext: () => void;
}

const Ctx = createContext<PageContextValue | null>(null);

/**
 * Provider for ad-hoc "what data is on the admin's current screen" context
 * passed to the admin AI assistant alongside every chat message.
 *
 * Pages call `useSetAiPageContext(data)` whenever their data changes (e.g.,
 * after a tRPC query resolves). The AI panel reads via `useAiPageContext()`
 * and sends the JSON snapshot as a system message with each turn.
 *
 * The pageIdentifier auto-resolves from wouter's location. Pages don't need
 * to set it manually.
 */
export function AiPageContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<unknown>(undefined);
  const [location] = useLocation();

  // Clear stale page context when route changes — different pages will
  // re-populate via useSetAiPageContext on mount.
  const lastLocationRef = useRef(location);
  useEffect(() => {
    if (lastLocationRef.current !== location) {
      lastLocationRef.current = location;
      setPageContextState(undefined);
    }
  }, [location]);

  const setPageContext = useCallback((data: unknown) => {
    setPageContextState(data);
  }, []);

  const clearPageContext = useCallback(() => {
    setPageContextState(undefined);
  }, []);

  const value = useMemo<PageContextValue>(
    () => ({
      pageContext,
      pageIdentifier: location,
      setPageContext,
      clearPageContext,
    }),
    [pageContext, location, setPageContext, clearPageContext],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAiPageContext(): PageContextValue {
  const v = useContext(Ctx);
  if (!v) {
    // Allow consumers to use the hook without a provider — return inert defaults.
    return {
      pageContext: undefined,
      pageIdentifier: "",
      setPageContext: () => {},
      clearPageContext: () => {},
    };
  }
  return v;
}

/**
 * Convenience hook for pages: call with the data you want the AI to see.
 * The effect re-runs whenever `data` changes (use a stable reference like
 * a tRPC query's `data` field).
 */
export function useSetAiPageContext(data: unknown): void {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (!ctx) return;
    if (data === undefined) {
      ctx.clearPageContext();
    } else {
      ctx.setPageContext(data);
    }
    // Cleanup: when the page unmounts, clear so a different page doesn't
    // inherit stale context if it forgot to set its own.
    return () => {
      ctx.clearPageContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
