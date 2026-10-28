/** Keep section identity readable in the compact rail without shifting navigation. */
export function SidebarSectionHeading({ label }: { label: string }) {
  return (
    <p className="desktop-sidebar__heading relative text-[11px] font-semibold uppercase tracking-wide text-shell-foreground/65">
      <span className="desktop-sidebar__label block px-3 pt-2">{label}</span>
      <span
        className="desktop-sidebar__section-short pointer-events-none absolute left-0 top-2 grid w-12 place-items-center text-[10px]"
        aria-hidden="true"
      >
        {Array.from(label.trim()).slice(0, 2).join('').toLocaleUpperCase()}
      </span>
    </p>
  )
}
