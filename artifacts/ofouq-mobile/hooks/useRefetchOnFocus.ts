import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/**
 * Refetch a query every time the screen regains focus, so freshly-published
 * content (new lessons, new notifications, …) shows up without having to close
 * and reopen the app. React Query's window-focus refetch is a no-op in React
 * Native unless `focusManager` is wired to AppState, and stack/tab screens stay
 * mounted, so neither default ever fires — this fills that gap.
 *
 * The very first focus (initial mount) is skipped because `useQuery` already
 * fetches on mount; we only want the *re-focus* refetch, avoiding a redundant
 * double request on first load.
 */
export function useRefetchOnFocus(refetch: () => unknown) {
  const isFirstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
