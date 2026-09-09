/** Screen-level host for error toasts, and the hook that shows one from anywhere beneath it. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { ErrorToast } from "./ErrorToast";

/** What the provider hands to descendants. */
interface ToastHandle {
  /** Shows an error toast; a new message replaces the current one. */
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastHandle>({ showError: () => undefined });

/**
 * Hosts one error toast over its children. Screen mounts it around the
 * header and scroll view, so a toast paints above both and never scrolls
 * away with the content that raised it.
 *
 * @param props - Component props.
 * @returns The children with a toast layer on top.
 */
export function ToastProvider({
  children,
}: {
  /** The screen content the toast may overlay. */
  children: ReactNode;
}) {
  const [message, setMessage] = useState("");
  const dismiss = useCallback(() => setMessage(""), []);
  const handle = useMemo<ToastHandle>(() => ({ showError: setMessage }), []);
  return (
    <ToastContext.Provider value={handle}>
      <View style={styles.host}>
        {children}
        <ErrorToast message={message} onDismiss={dismiss} />
      </View>
    </ToastContext.Provider>
  );
}

/**
 * Returns the nearest toast host's handle. Outside a provider the handle is
 * inert, so a component rendered without a Screen does not crash.
 *
 * @returns The toast handle.
 */
export function useToast(): ToastHandle {
  return useContext(ToastContext);
}

/**
 * Forwards an error-state string to the toast whenever it becomes non-empty.
 * Hooks that own mutations keep exposing a plain `error` string; the screen
 * calls this once with it and the toast takes over the presentation.
 *
 * @param error - The current error message, "" when there is none.
 */
export function useErrorToast(error: string): void {
  const { showError } = useToast();
  useEffect(() => {
    if (error) showError(error);
  }, [error, showError]);
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
