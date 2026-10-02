import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users } from "lucide-react";
import { listMyGroups, type GroupSummary } from "../api/client";
import { useT } from "../i18n";
import { cn } from "../ui/cn";
import { GLOBAL_SEARCH_INPUT_ID } from "./searchFocus";

type SearchResult = {
  id: string;
  label: string;
  to: string;
  kind: "action" | "group";
};

/**
 * Filters the already-loaded groups plus navigation actions (ADR-0053 H7).
 * No cross-entity backend search in this phase.
 */
export function GlobalSearch() {
  const { t } = useT();
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [groups, setGroups] = useState<GroupSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    listMyGroups()
      .then((result) => {
        if (!cancelled) setGroups(result);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const actions: SearchResult[] = [
      { id: "home", label: t("sidebar.home"), to: "/", kind: "action" },
      { id: "groups", label: t("sidebar.myGroups"), to: "/grupos", kind: "action" },
      { id: "join", label: t("sidebar.joinGroup"), to: "/unirse", kind: "action" },
      { id: "account", label: t("sidebar.profile"), to: "/cuenta", kind: "action" },
    ];
    const actionMatches = actions.filter((item) =>
      item.label.toLowerCase().includes(q),
    );
    const groupMatches: SearchResult[] = groups
      .filter((group) => group.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((group) => ({
        id: `group-${group.id}`,
        label: group.name,
        to: `/groups/${group.id}`,
        kind: "group" as const,
      }));
    return [...groupMatches, ...actionMatches].slice(0, 8);
  }, [query, groups, t]);

  function choose(result: SearchResult) {
    setOpen(false);
    setQuery("");
    navigate(result.to);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      choose(results[active]);
    }
  }

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} className="relative w-full">
      <label htmlFor={GLOBAL_SEARCH_INPUT_ID} className="sr-only">
        {t("app.searchLabel")}
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        id={GLOBAL_SEARCH_INPUT_ID}
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        autoComplete="off"
        className="h-10 w-full rounded-full border border-border-subtle bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-muted focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        placeholder={t("app.searchPlaceholder")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {showPanel ? (
        <div
          id="global-search-results"
          role="listbox"
          aria-label={t("app.searchLabel")}
          className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border-subtle bg-surface p-1 shadow-xl"
        >
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">
              {t("app.searchNoResults")}
            </p>
          ) : (
            results.map((result, index) => (
              <button
                key={result.id}
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(result)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-ink",
                  index === active ? "bg-surface-hover" : "hover:bg-surface-hover",
                )}
              >
                {result.kind === "group" ? (
                  <Users className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                )}
                <span className="truncate">{result.label}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
