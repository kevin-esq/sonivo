import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Crown,
  LayoutGrid,
  Link2,
  List,
  ListMusic,
  LogOut,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Settings,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  createGroup,
  listMyGroups,
  problemDetail,
  type CurrentUser,
  type GroupSummary,
} from "../api/client";
import { useT } from "../i18n";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { usePersisted } from "../hooks/usePersisted";
import { formatMembershipRole } from "../repertoire/ui";
import {
  GROUP_COVER_EMOJIS,
  NO_COVER,
  coverUsesLightText,
  groupAppearanceKey,
  groupCoverStyle,
  readGroupAppearance,
} from "../shell/groupAccent";
import { Button } from "../ui/button";
import { fieldClass } from "../ui/field";
import { useToast } from "../ui/toast";

/* ================================================================== */
/* Tipos y contrato de integración                                     */
/* ================================================================== */

/**
 * Campos opcionales que la API puede empezar a devolver en GroupSummary.
 * La tarjeta los muestra solo si existen, así que puedes añadirlos al backend cuando quieras.
 */
export type GroupCardData = GroupSummary & {
  memberCount?: number;
  nextEventAt?: string | null;
  lastActivityAt?: string | null;
};

/**
 * Funciones que debes conectar al backend. Mientras falten, la UI avisa "próximamente"
 * en lugar de fallar. Todas deben lanzar un error si la operación falla.
 */
export type GroupsPageActions = {
  /** Renombrar (solo organizador). */
  onRename?: (group: GroupCardData, name: string) => Promise<void>;
  /** Salir del grupo (solo miembros). */
  onLeave?: (group: GroupCardData) => Promise<void>;
  /** Eliminar el grupo (solo organizador). */
  onDelete?: (group: GroupCardData) => Promise<void>;
  /** Crear un enlace de invitación y devolver su URL completa. */
  onCreateInvite?: (group: GroupCardData) => Promise<string>;
};

type RoleFilter = "all" | "owner" | "member";
type SortKey = "name" | "role" | "recent";
type ViewMode = "grid" | "list";

type DialogState =
  | null
  | { type: "create" }
  | { type: "join" }
  | { type: "rename"; group: GroupCardData }
  | { type: "leave"; group: GroupCardData }
  | { type: "delete"; group: GroupCardData };

const SEARCH_THRESHOLD = 6; // desde aquí aparece el buscador
const TOOLBAR_THRESHOLD = 4; // desde aquí aparecen filtros, orden y vista

const isOwner = (group: GroupCardData) =>
  String(group.role).toLowerCase() === "owner";

/** Acepta un enlace completo (https://…/join/TOKEN) o solo el código. */
function parseInviteToken(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const fromUrl = value.match(/\/join\/([A-Za-z0-9._~-]+)/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9._~-]{8,}$/.test(value) ? value : null;
}

/* ================================================================== */
/* Piezas reutilizables: Modal, menú de acciones                       */
/* ================================================================== */

/** Modal accesible basado en <dialog> nativo (foco atrapado, Esc y backdrop gratis). */
function Modal({
  open,
  onClose,
  title,
  closeLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // clic en el fondo
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border-subtle bg-surface p-0 text-ink shadow-xl backdrop:bg-slate-900/40"
    >
      {open ? (
        <div className="space-y-4 p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="-m-1 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

type MenuItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  to?: string;
  onSelect?: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
};

/** Menú "⋮" con teclado: flechas, Inicio/Fin, Esc y clic fuera. */
function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    const entries = Array.from(
      wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      e.preventDefault();
      entries[(i + entries.length) % entries.length]?.focus();
    };
    if (e.key === "ArrowDown") go(index + 1);
    else if (e.key === "ArrowUp") go(index - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(entries.length - 1);
    else if (e.key === "Tab") setOpen(false);
  }

  const itemClass = (danger?: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm no-underline focus-visible:outline-2 focus-visible:outline-primary ${
      danger
        ? "text-error-ink hover:bg-error/10"
        : "text-ink hover:bg-surface-hover"
    }`;

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative z-10 grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-30 mt-1 w-60 rounded-xl border border-border-subtle bg-surface p-1 shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </>
            );
            return (
              <div key={item.key}>
                {item.separatorBefore ? (
                  <hr className="my-1 border-border-subtle" />
                ) : null}
                {item.to ? (
                  <Link
                    role="menuitem"
                    to={item.to}
                    className={itemClass()}
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className={itemClass(item.danger)}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect?.();
                    }}
                  >
                    {content}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ================================================================== */
/* Formularios dentro de los modales                                   */
/* ================================================================== */

type TFn = ReturnType<typeof useT>["t"];

function NameForm({
  initial,
  hint,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
  t,
}: {
  initial: string;
  hint?: string;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
  t: TFn;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Se espera a que el <dialog> esté abierto antes de enfocar.
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const value = name.trim();
    if (!value) {
      setError(t("grupos.nameRequired"));
      inputRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (err) {
      setError(problemDetail(err));
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {hint ? <p className="text-sm text-slate-500">{hint}</p> : null}
      <div className="space-y-1.5">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700"
        >
          {t("grupos.nameLabel")}
        </label>
        <input
          id={id}
          ref={inputRef}
          className={fieldClass}
          value={name}
          maxLength={200}
          autoComplete="off"
          disabled={pending}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <div role="alert">
          {error ? (
            <p id={`${id}-error`} className="text-sm text-error-ink">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {t("grupos.cancel")}
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function JoinForm({ onCancel, t }: { onCancel: () => void; t: TFn }) {
  const id = useId();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const token = parseInviteToken(value);
    if (!token) {
      setError(t("grupos.joinInvalid"));
      inputRef.current?.focus();
      return;
    }
    navigate(`/join/${token}`);
  }

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <p className="text-sm text-slate-500">{t("grupos.joinDialogHint")}</p>
      <div className="space-y-1.5">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700"
        >
          {t("grupos.joinLabel")}
        </label>
        <input
          id={id}
          ref={inputRef}
          className={fieldClass}
          value={value}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <div role="alert">
          {error ? (
            <p id={`${id}-error`} className="text-sm text-error-ink">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("grupos.cancel")}
        </Button>
        <Button type="submit" disabled={!value.trim()}>
          {t("grupos.joinSubmit")}
        </Button>
      </div>
    </form>
  );
}

function ConfirmForm({
  body,
  confirmLabel,
  pendingLabel,
  onConfirm,
  onCancel,
  t,
}: {
  body: string;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  t: TFn;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(problemDetail(err));
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{body}</p>
      <div role="alert">
        {error ? <p className="text-sm text-error-ink">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          {t("grupos.cancel")}
        </Button>
        <Button
          type="button"
          className="bg-error-strong text-white hover:bg-error-strong/90"
          onClick={() => void confirm()}
          disabled={pending}
        >
          {pending ? pendingLabel : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Tarjeta de grupo                                                    */
/* ================================================================== */

/* ---- Ayudas visuales de la tarjeta ---- */

// Clases completas y literales para que Tailwind las detecte.
const AVATAR_TINTS = [
  "bg-primary/15 text-primary-ink",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
];

/** Color estable por grupo: el mismo grupo siempre tiene el mismo color. */
function tintFor(id: string | number): string {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

/** "Banda de Rock" → "BR"; "Coro" → "CO". */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Próximo evento en lenguaje natural ("hoy", "mañana", "dentro de 3 días") o fecha corta si falta mucho. */
function describeNextEvent(
  date: Date,
  lang: string,
): { text: string; soon: boolean } | null {
  const days = Math.round(
    (startOfDay(date) - startOfDay(new Date())) / 86_400_000,
  );
  if (days < 0) return null; // eventos pasados no se muestran
  if (days <= 6) {
    return {
      text: new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(
        days,
        "day",
      ),
      soon: days <= 1,
    };
  }
  return {
    text: new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "short",
    }).format(date),
    soon: false,
  };
}

/** "hace 5 min", "hace 2 h", "hace 3 días"; fecha corta pasado un mes. */
function describeActivity(date: Date, lang: string): string | null {
  const diff = Date.now() - date.getTime();
  if (diff < 0) return null;
  // Estilo corto: "hace 3 min", "hace 2 h" (mismos tramos: min, h, d).
  const rtf = new Intl.RelativeTimeFormat(lang, {
    style: "short",
    numeric: "auto",
  });
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return rtf.format(0, "minute");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days <= 30) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat(lang, {
    day: "numeric",
    month: "short",
  }).format(date);
}

/** True cuando el usuario ya guardó una identidad para este grupo en el dispositivo. */
function hasStoredAppearance(groupId: string | number): boolean {
  try {
    return (
      window.localStorage.getItem(groupAppearanceKey(String(groupId))) !== null
    );
  } catch {
    return false;
  }
}

/**
 * Avatar con la identidad del grupo: emoji y/o acento guardados en este dispositivo
 * (los mismos que edita GroupSettingsPage). Si no hay identidad guardada se mantiene
 * el comportamiento anterior: iniciales con el color estable derivado del id.
 */
function GroupAvatar({ group }: { group: GroupCardData }) {
  const key = String(group.id);
  const appearance = readGroupAppearance(key);
  const cover = hasStoredAppearance(key) ? appearance.cover : null;
  const isEmoji =
    cover !== null && (GROUP_COVER_EMOJIS as readonly string[]).includes(cover);
  const tinted = cover !== null && cover !== NO_COVER;

  return (
    <span
      className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
        tinted
          ? coverUsesLightText(appearance.cover)
            ? "text-white"
            : "text-ink"
          : tintFor(group.id)
      }`}
      style={
        tinted
          ? groupCoverStyle(appearance.cover, appearance.accent)
          : undefined
      }
      aria-hidden="true"
    >
      <span
        className={`font-bold tracking-wide ${isEmoji ? "text-2xl leading-none" : "text-sm"}`}
      >
        {isEmoji ? appearance.cover : initialsOf(group.name)}
      </span>
    </span>
  );
}

function GroupCardItem({
  group,
  pinned,
  lang,
  t,
  menu,
  onTogglePin,
  onOpen,
  view,
}: {
  group: GroupCardData;
  pinned: boolean;
  lang: string;
  t: TFn;
  menu: MenuItem[];
  onTogglePin: () => void;
  onOpen: () => void;
  view: ViewMode;
}) {
  const roleId = `group-role-${group.id}`;
  const metaId = `group-meta-${group.id}`;
  const owner = isOwner(group);

  const nextEvent = useMemo(() => {
    if (!group.nextEventAt) return null;
    const date = new Date(group.nextEventAt);
    return Number.isNaN(date.getTime()) ? null : describeNextEvent(date, lang);
  }, [group.nextEventAt, lang]);

  const activity = useMemo(() => {
    if (!group.lastActivityAt) return null;
    const date = new Date(group.lastActivityAt);
    return Number.isNaN(date.getTime()) ? null : describeActivity(date, lang);
  }, [group.lastActivityAt, lang]);

  const hasMembers = typeof group.memberCount === "number";

  const cardClass = `group relative rounded-2xl border bg-surface transition duration-150 focus-within:border-primary/40 hover:border-primary/40 hover:bg-surface-hover hover:shadow-sm active:scale-[0.995] motion-reduce:transform-none motion-reduce:transition-none ${
    pinned ? "border-primary/30" : "border-border-subtle"
  }`;

  // Enlace "estirado": toda la tarjeta es clicable sin anidar botones dentro de <a>.
  // El recorte del nombre vive en un <span> interior para no recortar el ::after.
  const linkClass =
    "block min-w-0 text-base font-semibold text-ink no-underline after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-primary-ink focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary focus-visible:after:ring-offset-2";

  const stretchyLink = (clamp: "clamp" | "truncate") => (
    <Link
      to={`/groups/${group.id}`}
      title={group.name}
      aria-describedby={`${roleId} ${metaId}`}
      onClick={onOpen}
      className={linkClass}
    >
      <span className={clamp === "clamp" ? "line-clamp-2" : "block truncate"}>
        {group.name}
      </span>
    </Link>
  );

  const roleChip = (
    <span
      id={roleId}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium ${
        owner ? "bg-primary/10 text-primary-ink" : "bg-slate-100 text-slate-600"
      }`}
    >
      {owner ? <Crown className="h-3 w-3" aria-hidden="true" /> : null}
      {formatMembershipRole(group.role)}
    </span>
  );

  const meta = (
    <span
      id={metaId}
      className="inline-flex min-w-0 items-center gap-x-3 gap-y-1 whitespace-nowrap text-xs text-slate-500"
    >
      {hasMembers ? (
        <span className="inline-flex shrink-0 items-center gap-1">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {group.memberCount === 1
            ? t("grupos.membersOne")
            : t("grupos.members", { count: group.memberCount as number })}
        </span>
      ) : null}

      {nextEvent ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1 ${
            nextEvent.soon
              ? "rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary-ink"
              : ""
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {t("grupos.nextEvent", { date: nextEvent.text })}
        </span>
      ) : activity ? (
        // Sin evento próximo, la última actividad ocupa su lugar. Solo se ve "hace 3 min";
        // la frase completa ("Última actividad: …") va para lectores de pantalla.
        <span className="inline-flex shrink-0 items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span aria-hidden="true">{activity}</span>
          <span className="sr-only">
            {t("grupos.activity", { when: activity })}
          </span>
        </span>
      ) : null}
    </span>
  );

  const actions = (
    <div className="relative z-10 flex shrink-0 items-center">
      {/* La estrella solo estorba cuando no está fijada: en escritorio aparece al pasar o enfocar. */}
      <button
        type="button"
        onClick={onTogglePin}
        aria-pressed={pinned}
        aria-label={`${t("grupos.pin")}: ${group.name}`}
        title={pinned ? t("grupos.unpin") : t("grupos.pin")}
        className={`grid h-10 w-10 place-items-center rounded-lg transition motion-reduce:transition-none focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary sm:h-9 sm:w-9 ${
          pinned
            ? "text-amber-500 hover:bg-amber-50"
            : "text-slate-300 hover:bg-slate-100 hover:text-slate-500 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
        }`}
      >
        <Star
          className="h-5 w-5"
          fill={pinned ? "currentColor" : "none"}
          aria-hidden="true"
        />
      </button>
      <ActionMenu
        label={t("grupos.menuLabel", { name: group.name })}
        items={menu}
      />
      {/* La flecha solo acompaña a la fila horizontal; en cuadrícula no aporta. */}
      {view === "list" ? (
        <ChevronRight
          className="ml-0.5 hidden h-5 w-5 shrink-0 text-slate-300 transition duration-150 group-hover:translate-x-0.5 group-hover:text-primary-ink motion-reduce:transform-none motion-reduce:transition-none sm:block"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );

  if (view === "list") {
    // Fila horizontal: avatar · nombre · rol · metadatos · acciones.
    // En móvil los metadatos bajan a su propia línea (order-last + ancho completo).
    return (
      <div
        className={`${cardClass} flex h-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-3 sm:px-4`}
      >
        <GroupAvatar group={group} />
        <div className="min-w-0 flex-1">{stretchyLink("truncate")}</div>
        <div className="order-last flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:order-none sm:w-auto">
          {roleChip}
          {meta}
        </div>
        {actions}
      </div>
    );
  }

  // Tarjeta vertical: avatar y acciones arriba, nombre a ancho completo,
  // luego el rol y, separados por un borde, los metadatos en una sola línea.
  return (
    <div
      className={`${cardClass} flex h-full flex-col gap-3 px-3 py-3.5 sm:px-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <GroupAvatar group={group} />
        {actions}
      </div>

      <div className="min-w-0 text-base">
        {stretchyLink("clamp")}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {roleChip}
        </div>
      </div>

      <div className="mt-auto flex min-w-0 items-center gap-3 border-t border-border-subtle/70 pt-2.5">
        {meta}
      </div>
    </div>
  );
}

/** Esqueleto con la misma cuadrícula y estructura que la tarjeta vertical. */
function GroupCardSkeleton({ label }: { label: string }) {
  const slots = [0, 1, 2, 3, 4, 5];
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] auto-rows-fr gap-3"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      {slots.map((slot) => (
        <div
          key={slot}
          className="flex h-full flex-col gap-3 rounded-2xl border border-border-subtle bg-surface px-3 py-3.5 sm:px-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="h-12 w-12 animate-pulse rounded-xl bg-slate-200/80 motion-reduce:animate-none" />
            <div className="flex items-center gap-1">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200/80 motion-reduce:animate-none" />
              <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200/80 motion-reduce:animate-none" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200/80 motion-reduce:animate-none" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200/80 motion-reduce:animate-none" />
          </div>
          <div className="mt-auto flex items-center gap-3 border-t border-border-subtle/70 pt-2.5">
            <div className="h-3 w-20 animate-pulse rounded bg-slate-200/80 motion-reduce:animate-none" />
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200/80 motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}
/* ================================================================== */
/* Página                                                              */
/* ================================================================== */

export function GroupsPage({
  user,
  actions,
}: {
  user: CurrentUser;
  actions?: GroupsPageActions;
}) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const searchId = useId();

  const [groups, setGroups] = useState<GroupCardData[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");
  const [sort, setSort] = usePersisted<SortKey>("sonivo:groups:sort", "name");
  const [view, setView] = usePersisted<ViewMode>("sonivo:groups:view", "grid");
  const [pinned, setPinned] = usePersisted<string[]>(
    "sonivo:groups:pinned",
    [],
  );
  const [lastGroupId, setLastGroupId] = usePersisted<string | null>(
    "sonivo:groups:last",
    null,
  );

  const [dialog, setDialog] = useState<DialogState>(null);
  const { showToast } = useToast();
  const { copy } = useCopyToClipboard();

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    listMyGroups()
      .then((data) => {
        if (!cancelled) setGroups(data as GroupCardData[]);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(problemDetail(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, reloadKey]);

  const notify = (kind: "ok" | "error" | "info", text: string) =>
    showToast({ kind, text });
  const soon = () => notify("info", t("grupos.comingSoon"));

  function retry() {
    setGroups(null);
    setReloadKey((key) => key + 1);
  }

  const togglePin = (id: string) =>
    setPinned(
      pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id],
    );

  const hasRecent = useMemo(
    () => !!groups?.some((g) => g.lastActivityAt),
    [groups],
  );

  const visible = useMemo(() => {
    if (!groups) return [];
    const q = query.trim().toLowerCase();
    const list = groups.filter(
      (g) =>
        (!q || g.name.toLowerCase().includes(q)) &&
        (filter === "all" || (filter === "owner") === isOwner(g)),
    );
    return [...list].sort((a, b) => {
      const pa = pinned.includes(String(a.id));
      const pb = pinned.includes(String(b.id));
      if (pa !== pb) return pa ? -1 : 1;
      if (sort === "role") {
        const d = Number(isOwner(b)) - Number(isOwner(a));
        if (d) return d;
      }
      if (sort === "recent") {
        const d =
          (Date.parse(b.lastActivityAt ?? "") || 0) -
          (Date.parse(a.lastActivityAt ?? "") || 0);
        if (d) return d;
      }
      return a.name.localeCompare(b.name, lang);
    });
  }, [groups, query, filter, sort, pinned, lang]);

  const lastGroup = useMemo(
    () =>
      lastGroupId
        ? (groups?.find((g) => String(g.id) === lastGroupId) ?? null)
        : null,
    [groups, lastGroupId],
  );

  // Fijados y resto se pintan como secciones separadas cuando hay fijados.
  const pinnedGroups = useMemo(
    () => visible.filter((g) => pinned.includes(String(g.id))),
    [visible, pinned],
  );
  const otherGroups = useMemo(
    () => visible.filter((g) => !pinned.includes(String(g.id))),
    [visible, pinned],
  );

  async function copyInvite(group: GroupCardData) {
    if (!actions?.onCreateInvite) return soon();
    try {
      const url = await actions.onCreateInvite(group);
      const copied = await copy(url);
      notify(
        copied ? "ok" : "error",
        copied ? t("grupos.inviteCopied") : t("grupos.copyFailed"),
      );
    } catch (err) {
      notify("error", problemDetail(err));
    }
  }

  function menuFor(group: GroupCardData): MenuItem[] {
    const base = `/groups/${group.id}`;
    const owner = isOwner(group);
    const items: MenuItem[] = [
      {
        key: "library",
        label: t("nav.library"),
        icon: BookOpen,
        to: `${base}/library`,
      },
      {
        key: "setlists",
        label: t("nav.setlists"),
        icon: ListMusic,
        to: `${base}/setlists`,
      },
      {
        key: "events",
        label: t("nav.events"),
        icon: CalendarDays,
        to: `${base}/events`,
      },
      {
        key: "people",
        label: t("nav.people"),
        icon: Users,
        to: `${base}/people`,
      },
      {
        key: "invite",
        label: t("grupos.actionInvite"),
        icon: Link2,
        separatorBefore: true,
        onSelect: () => void copyInvite(group),
      },
    ];
    if (owner) {
      items.push(
        {
          key: "rename",
          label: t("grupos.actionRename"),
          icon: Pencil,
          onSelect: () =>
            actions?.onRename ? setDialog({ type: "rename", group }) : soon(),
        },
        {
          key: "settings",
          label: t("grupo.ajustes"),
          icon: Settings,
          to: `${base}/ajustes`,
        },
        {
          key: "delete",
          label: t("grupos.actionDelete"),
          icon: Trash2,
          danger: true,
          separatorBefore: true,
          onSelect: () =>
            actions?.onDelete ? setDialog({ type: "delete", group }) : soon(),
        },
      );
    } else {
      items.push({
        key: "leave",
        label: t("grupos.actionLeave"),
        icon: LogOut,
        danger: true,
        separatorBefore: true,
        onSelect: () =>
          actions?.onLeave ? setDialog({ type: "leave", group }) : soon(),
      });
    }
    return items;
  }

  const closeDialog = () => setDialog(null);
  const loading = groups === null && !loadError;
  const total = groups?.length ?? 0;
  const showSearch = total >= SEARCH_THRESHOLD;
  const showToolbar = total >= TOOLBAR_THRESHOLD;
  const resultsActive = !!query || filter !== "all";

  const chip = (active: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-3 text-sm font-medium transition motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-primary ${
      active
        ? "border-primary bg-primary/10 text-shell-link"
        : "border-border-subtle bg-surface text-slate-600 hover:border-primary/40"
    }`;

  const renderCards = (list: GroupCardData[]) => (
    <ul
      className={
        view === "grid"
          ? "grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] auto-rows-fr gap-3"
          : "space-y-2"
      }
      aria-label={t("grupos.listLabel")}
    >
      {list.map((group) => (
        <li key={group.id} className="h-full">
          <GroupCardItem
            group={group}
            pinned={pinned.includes(String(group.id))}
            lang={lang}
            t={t}
            menu={menuFor(group)}
            onTogglePin={() => togglePin(String(group.id))}
            onOpen={() => setLastGroupId(String(group.id))}
            view={view}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <section
      className="space-y-6"
      aria-labelledby="groups-heading"
      aria-busy={loading}
    >
      {/* Cabecera con las acciones principales (sustituye al formulario fijo de abajo) */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h1
              id="groups-heading"
              className="text-3xl font-bold tracking-tight text-shell-foreground"
            >
              {t("grupos.title")}
            </h1>
            {total > 0 ? (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-shell-link">
                {total}
              </span>
            ) : null}
          </div>
          <p className="max-w-lg text-sm text-shell-foreground/70">
            {t("grupos.subtitle")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {/* Secundaria discreta: unirse con enlace. */}
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-center sm:w-auto"
            onClick={() => setDialog({ type: "join" })}
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            {t("grupos.join")}
          </Button>
          {/* Acción principal. */}
          <Button
            type="button"
            className="w-full justify-center sm:w-auto"
            onClick={() => setDialog({ type: "create" })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("grupos.new")}
          </Button>
        </div>
      </header>

      {loadError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-error/20 bg-error/10 px-5 py-4"
        >
          <p className="text-sm text-error-ink">{loadError}</p>
          <Button type="button" variant="outline" onClick={retry}>
            {t("grupos.retry")}
          </Button>
        </div>
      ) : null}

      {loading ? (
        <GroupCardSkeleton label={t("grupos.loading")} />
      ) : groups && groups.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-slate-300 bg-surface-hover/60 px-5 py-8">
          <span
            className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-shell-link"
            aria-hidden="true"
          >
            <Users className="h-6 w-6" />
          </span>
          <div className="space-y-1">
            <p className="font-semibold text-shell-foreground">
              {t("grupos.emptyTitle")}
            </p>
            <p className="max-w-md text-sm text-slate-500">
              {t("grupos.empty")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setDialog({ type: "create" })}>
              {t("grupos.emptyCta")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog({ type: "join" })}
            >
              {t("grupos.join")}
            </Button>
          </div>
          <p className="max-w-md text-xs text-slate-500">
            {t("grupos.joinHint")}
          </p>
        </div>
      ) : groups ? (
        <div className="space-y-4">
          {/* Acceso rápido al último grupo abierto */}
          {lastGroup && total > 1 ? (
            <Link
              to={`/groups/${lastGroup.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 no-underline hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium uppercase tracking-wide text-shell-link">
                  {t("grupos.continue")}
                </span>
                <span className="block truncate font-semibold text-shell-foreground">
                  {lastGroup.name}
                </span>
              </span>
              <ChevronRight
                className="h-5 w-5 shrink-0 text-shell-link"
                aria-hidden="true"
              />
            </Link>
          ) : null}

          {showToolbar ? (
            <div className="flex flex-wrap items-center gap-2">
              {showSearch ? (
                <div className="relative min-w-[12rem] flex-1">
                  <label htmlFor={searchId} className="sr-only">
                    {t("grupos.searchLabel")}
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id={searchId}
                    type="search"
                    className={`${fieldClass} h-9 pl-9`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("grupos.searchPlaceholder")}
                    autoComplete="off"
                  />
                </div>
              ) : null}

              <div
                role="group"
                aria-label={t("grupos.filterLabel")}
                className="flex gap-1.5"
              >
                {(["all", "owner", "member"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className={chip(filter === value)}
                  >
                    {t(
                      value === "all"
                        ? "grupos.filterAll"
                        : value === "owner"
                          ? "grupos.filterOwner"
                          : "grupos.filterMember",
                    )}
                  </button>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-2">
                {/* Selector de orden: <select> real (accesible y usable en móvil) con
                    apariencia propia y una etiqueta visible "Ordenar: Nombre". */}
                <div className="flex h-9 items-center gap-1.5 rounded-xl border border-border-subtle bg-surface pl-3 pr-2 text-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
                  <label
                    htmlFor={`${searchId}-sort`}
                    className="whitespace-nowrap text-shell-foreground/70"
                  >
                    {t("grupos.sortLabel")}:
                  </label>
                  <span className="relative flex h-full items-center">
                    <select
                      id={`${searchId}-sort`}
                      className="h-full appearance-none rounded-lg bg-transparent pr-6 text-sm font-medium text-ink outline-none"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortKey)}
                    >
                      <option value="name">{t("grupos.sortName")}</option>
                      <option value="role">{t("grupos.sortRole")}</option>
                      {hasRecent ? (
                        <option value="recent">{t("grupos.sortRecent")}</option>
                      ) : null}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-0.5 h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                  </span>
                </div>
                <div
                  role="group"
                  aria-label={t("grupos.viewLabel")}
                  className="flex overflow-hidden rounded-xl border border-border-subtle"
                >
                  {(["grid", "list"] as const).map((mode) => {
                    const Icon = mode === "grid" ? LayoutGrid : List;
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={view === mode}
                        aria-label={t(
                          mode === "grid"
                            ? "grupos.viewGrid"
                            : "grupos.viewList",
                        )}
                        onClick={() => setView(mode)}
                        className={`grid h-9 w-9 place-items-center transition duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-primary ${
                          view === mode
                            ? "bg-primary/10 text-shell-link"
                            : "bg-surface text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <p role="status" aria-live="polite" className="sr-only">
            {resultsActive
              ? t("grupos.resultsCount", { count: visible.length })
              : ""}
          </p>

          {/* Recuento visible cuando hay búsqueda o filtro activos. */}
          {resultsActive ? (
            <p
              className="text-sm font-medium text-shell-foreground/70"
              aria-hidden="true"
            >
              {t("grupos.resultsCount", { count: visible.length })}
            </p>
          ) : null}

          {visible.length === 0 ? (
            <div className="space-y-2 rounded-2xl border border-dashed border-slate-300 bg-surface-hover/60 px-5 py-6">
              <p className="text-sm text-slate-600">{t("grupos.noMatches")}</p>
              <button
                type="button"
                className="text-sm font-semibold text-shell-link hover:underline"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                {t("grupos.clearSearch")}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {pinnedGroups.length > 0 ? (
                <section
                  className="space-y-2"
                  aria-labelledby="groups-pinned-heading"
                >
                  <h2
                    id="groups-pinned-heading"
                    className="flex items-center gap-1.5 text-sm font-semibold text-shell-foreground"
                  >
                    <Star
                      className="h-4 w-4 text-amber-500"
                      fill="currentColor"
                      aria-hidden="true"
                    />
                    {t("grupos.pinnedSection")}
                  </h2>
                  {renderCards(pinnedGroups)}
                </section>
              ) : null}

              {pinnedGroups.length > 0 && otherGroups.length > 0 ? (
                <h2 className="text-sm font-semibold text-shell-foreground">
                  {t("grupos.allSection")}
                </h2>
              ) : null}

              {renderCards(pinnedGroups.length > 0 ? otherGroups : visible)}
            </div>
          )}
        </div>
      ) : null}

      {/* ---------------- Diálogos ---------------- */}
      <Modal
        open={dialog?.type === "create"}
        onClose={closeDialog}
        title={t("grupos.createTitle")}
        closeLabel={t("grupos.close")}
      >
        <NameForm
          initial=""
          hint={t("grupos.createHint")}
          submitLabel={t("grupos.create")}
          pendingLabel={t("grupos.creating")}
          t={t}
          onCancel={closeDialog}
          onSubmit={async (name) => {
            const created = await createGroup(name);
            closeDialog();
            navigate(`/groups/${created.id}`);
          }}
        />
      </Modal>

      <Modal
        open={dialog?.type === "join"}
        onClose={closeDialog}
        title={t("grupos.joinTitle")}
        closeLabel={t("grupos.close")}
      >
        <JoinForm t={t} onCancel={closeDialog} />
      </Modal>

      <Modal
        open={dialog?.type === "rename"}
        onClose={closeDialog}
        title={t("grupos.renameTitle")}
        closeLabel={t("grupos.close")}
      >
        {dialog?.type === "rename" ? (
          <NameForm
            initial={dialog.group.name}
            submitLabel={t("grupos.renameSubmit")}
            pendingLabel={t("inicio.working")}
            t={t}
            onCancel={closeDialog}
            onSubmit={async (name) => {
              await actions!.onRename!(dialog.group, name);
              setGroups(
                (prev) =>
                  prev?.map((g) =>
                    g.id === dialog.group.id ? { ...g, name } : g,
                  ) ?? prev,
              );
              closeDialog();
              notify("ok", t("grupos.renamed"));
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={dialog?.type === "leave"}
        onClose={closeDialog}
        title={t("grupos.leaveTitle")}
        closeLabel={t("grupos.close")}
      >
        {dialog?.type === "leave" ? (
          <ConfirmForm
            body={t("grupos.leaveBody", { name: dialog.group.name })}
            confirmLabel={t("grupos.leaveConfirm")}
            pendingLabel={t("inicio.working")}
            t={t}
            onCancel={closeDialog}
            onConfirm={async () => {
              await actions!.onLeave!(dialog.group);
              setGroups(
                (prev) => prev?.filter((g) => g.id !== dialog.group.id) ?? prev,
              );
              closeDialog();
              notify("ok", t("grupos.left"));
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={dialog?.type === "delete"}
        onClose={closeDialog}
        title={t("grupos.deleteTitle")}
        closeLabel={t("grupos.close")}
      >
        {dialog?.type === "delete" ? (
          <ConfirmForm
            body={t("grupos.deleteBody", { name: dialog.group.name })}
            confirmLabel={t("grupos.deleteConfirm")}
            pendingLabel={t("inicio.deleting")}
            t={t}
            onCancel={closeDialog}
            onConfirm={async () => {
              await actions!.onDelete!(dialog.group);
              setGroups(
                (prev) => prev?.filter((g) => g.id !== dialog.group.id) ?? prev,
              );
              closeDialog();
              notify("ok", t("grupos.deleted"));
            }}
          />
        ) : null}
      </Modal>
    </section>
  );
}
