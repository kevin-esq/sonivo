/** Shared handle so the Home quick action can focus the top-bar search. */
export const GLOBAL_SEARCH_INPUT_ID = "global-search";

export function focusGlobalSearch(): void {
  document.getElementById(GLOBAL_SEARCH_INPUT_ID)?.focus();
}
