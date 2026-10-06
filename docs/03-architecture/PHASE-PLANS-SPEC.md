# PHASE-PLANS-SPEC — Planes y personalización

**Status:** ACCEPTED (definition authorized 2026-10-05 by the owner: "esto definí" + "autorizo todo").
**Date:** 2026-10-05
**Type:** product + architecture spec. **Placeholder v0.1:** all prices, limits and values are
provisional and meant to be implemented now and tuned later without touching the architecture.
**ADRs:** [ADR-0071](DECISIONS.md) (entitlements + personalization levels),
[ADR-0072](DECISIONS.md) (organization), [ADR-0073](DECISIONS.md) (payments IN, supersedes ADR-0042).
**Supersedes:** the ADR-0042 "payments OUT" prohibition and the "no billing" firewalls, only within
the scope of this phase.

This is the single source of truth for plans, limits and personalization. The entitlements catalog
(§6) is the only place numbers live.

---

## 1. Principles

1. **Single source of truth:** plan limits/features live in an *entitlements* catalog, not spread
   through code. Changing a number is editing one place.
2. **The user turns few knobs; the system derives the rest.** One base colour generates every token.
3. **Personalization can never break legibility.** An automatic contrast guard corrects or warns.
4. **No personalization is not a gap:** it is Sonivo's design, part of the product.
5. **Downgrading never deletes data.** Premium access is lost; saved config is kept.

## 2. Plan summary (placeholder)

|  | Starter | Pro | Studio |
| --- | --: | --: | --: |
| **Monthly** | $99 MXN | $199 MXN | $499 MXN |
| **Annual (≈2 months free)** | $990 MXN | $1,990 MXN | $4,990 MXN |
| **For whom** | Small band / personal project | Band or ministry that meets often | Orgs with several groups (churches, music schools, academies) |
| Members | 3 | 15 | Unlimited |
| Groups | 1 | 1 | Up to 3 included |
| **Extra group** | n/a | n/a | +$150 MXN/mo |
| Songs | 50 | 500 | Unlimited |
| Setlists | 5 | 50 | Unlimited |
| Events | 10 / month | Unlimited | Unlimited |
| Storage | 1 GB | 10 GB | 50 GB per organization |
| Library / Resources / Audio / Tasks / Calendar | Yes | Yes | Yes |
| Roles & permissions | Basic | Advanced | Advanced |
| History | Basic | Full | Full |
| Stats | Not included | Included | Included |
| **Personalization** | **Sonivo theme** | **Basic** | **Advanced** |
| Support | Email | Priority | Priority |
| Trial | 14 days Starter | 14 days Pro | 14 days Studio (card required) |

**Open decisions (placeholder):** see §9.

**Cost by group count (placeholder, MXN/mo):**

| Groups | One Pro each | Studio (3 incl. + $150/extra) |
| --: | --: | --: |
| 1 | $199 | not worth it, use Pro |
| 2 | $398 | not worth it, use Pro |
| 3 | $597 | $499 |
| 5 | $995 | $799 |
| 10 | $1,990 | $1,549 |

## 3. Plan detail

### 3.1 Starter ($99 MXN/mo)
- Hard limits: 3 members, 1 group, 50 songs, 5 setlists, 10 events/month, 1 GB.
- Features: library, resources, audio, tasks/kanban, calendar.
- Roles: basic (Owner, Member).
- History: basic (last 30 days, placeholder).
- Stats: not included (section shown with a "Pro" notice).
- Personalization: Sonivo theme only. No colour picker, no own logo. Group **name** can change
  (it is identity, not brand).
- Mark: "Powered by Sonivo" always visible.
- Support: email.

### 3.2 Pro ($199 MXN/mo)
- Hard limits: 15 members, 1 group, 500 songs, 50 setlists, unlimited events, 10 GB.
- Everything in Starter, plus stats and full history.
- Roles: advanced (custom roles with per-module permissions).
- Personalization: **Basic** (§5).
- Mark: "Powered by Sonivo" still visible.
- Support: priority.
- Trial: 14 days of Pro (§4.5).

### 3.3 Studio ($499 MXN/mo)
- Groups: up to 3 included; each extra group +$150 MXN/mo (placeholder). No "Studio+" tier at launch.
- Limits: members/songs/setlists/events unlimited (fair use). 50 GB shared per organization
  (placeholder; decide whether it grows per extra group).
- Organization: Studio represents an organization with several groups (a church, a music school).
  Five unrelated bands are five customers, not one organization. Enforced as a business rule in the
  terms, not a technical lock.
- Features: everything in Pro, plus centralized group administration (organization view and shared
  members, placeholder).
- Personalization: **Advanced** (§5). Each group has its own identity, with an "Apply to all groups"
  option.
- Mark: "Powered by Sonivo" can be removed.
- Support: priority.
- Fair use (placeholder): a very high technical cap per organization, only triggered in extreme cases.

## 4. Limits, plan changes and billing rules

### 4.1 Reaching a limit
- **80%:** soft notice in the relevant screen ("Llevas 40 de 50 canciones").
- **100%:** create button blocked + a card with the plan that unlocks it + upgrade button.
- **View/edit/delete of existing content is never blocked.**

In Studio, at 3 included groups the create-group button offers +$150 MXN/mo.

### 4.2 Upgrade
Immediate; new limits apply at once; charge prorated (placeholder).

### 4.3 Downgrade
- Scheduled at the end of the paid period.
- Content over the lower plan's limits is kept **read-only** (view/export, no create/edit).
- Excess members are **suspended** (cannot sign in), not deleted; the organizer picks who stays active.
- Excess groups (Studio → Pro/Starter): organizer picks the active one; the rest are archived.
- **Personalization:** saved config is kept but the Sonivo theme is applied while the plan does not
  include it. Upgrading again restores it unchanged.

Removing extra groups inside Studio follows the same rule.

### 4.4 Non-payment
- 7-day grace period (placeholder) with everything working and a visible organizer notice.
- Then read-only. Nothing is deleted.

### 4.5 14-day trial
- Trial the chosen plan (Starter/Pro/Studio), 14 days. One trial per account.
- Starter/Pro without card (placeholder). Studio with card (most expensive, easiest to abuse).
- Shows remaining days in the organizer's rail.
- On expiry without payment, apply §4.3 (Pro/Studio → Starter; a Starter trial goes read-only).

## 5. Personalization

### 5.1 Three levels

| Capability | Sonivo (Starter) | Basic (Pro) | Advanced (Studio) |
| --- | :-: | :-: | :-: |
| Sonivo colours | Yes | Always available as a theme | Always available as a theme |
| 10 predefined themes | No | Yes | Yes |
| Custom accent (one) | No | Yes | Yes |
| Separate primary + secondary | No | No | Yes |
| Intensity (Subtle/Medium/Intense) | No | Yes | Yes, plus fine control |
| Gradient style (liquid glass) | No | Fixed | Selectable |
| Group light/dark | Each user chooses | Each user chooses | Each user chooses + group default |
| Group icon (emoji or library) | No | Yes | Yes |
| Own logo (upload) | No | No | Yes |
| Banner image | No | No | Yes |
| Typography | Sonivo | Sonivo | The 10 available fonts |
| Brand name | No | No | Yes |
| Welcome text | No | No | Yes |
| Group login branding | No | No | Yes |
| Remove "Powered by Sonivo" | No | No | Yes |
| Live preview | n/a | Yes | Yes |
| Floating unsaved-changes bar | n/a | Yes | Yes |
| Contrast guard | n/a | Yes | Yes |

### 5.2 How colour works
1. **One base colour generates everything**, derived in OKLCH (hue changes don't move lightness):
   `--color-primary` (clamped if it fails contrast), `--color-primary-hover`/`-pressed`
   (−6%/−12% lightness), `--color-on-primary` (white or near-black by luminance),
   `--color-primary-soft` (10–14% alpha over the surface), `--color-secondary` (+`on`/`soft`;
   derived with a 25–35° hue shift in Basic, chosen in Advanced), `--brand-wash`,
   `--surface-tint`/`--border-tint` (neutrals tinted 6–12% with the brand hue), `--focus-ring`.
2. **Strong wash behind solid cards.** `--brand-wash` can be intense because text lives inside
   opaque cards, giving the liquid-glass effect without harming reading contrast.
3. **Tinted neutrals:** background, sidebar and borders carry a touch of the brand hue.
4. **Colour on large, textless elements:** header banner, active sidebar item, scrollbar, input
   focus, card icons, chips, group avatar.

### 5.3 Intensity
Three prevalidated values (no free slider), each checked for light and dark:

| Intensity | Wash alpha | Neutral mix | When |
| --- | :-: | :-: | --- |
| Subtle | 12% | 4% | Discreet brand, sober |
| Medium (default) | 24% | 8% | Balance |
| Intense | 38% | 12% | Strong identity, visible liquid glass |

*Placeholders; tune visually. Rule: none may push text on an opaque surface below 4.5:1.*

### 5.4 Contrast guard
Runs live on colour choice:
1. Compute `on-primary` by relative luminance.
2. Measure primary/text contrast. Target **4.5:1** (AA normal text); 3:1 for non-text
   (borders, icons, focus ring).
3. If below, **adjust the primary's lightness** in small steps, preserving hue, until it passes.
4. If the adjustment changes the colour too much, warn ("Ajustamos el tono para que se lea bien")
   with a before/after.
5. Computed separately for light and dark (dark lightens the primary; light darkens it).
6. The backend also validates (rejects or corrects values that fail).

### 5.5 Predefined themes (10)
All intended to pass AA with white text in light. Hex are placeholders validated by the guard.

| # | Theme | Primary | Suggested secondary | Character |
| --- | --- | --- | --- | --- |
| 1 | **Sonivo** | current brand colours | current | Default identity |
| 2 | Esmeralda | #047857 | #0E7490 | Fresh, natural |
| 3 | Océano | #0369A1 | #4338CA | Calm, trustworthy |
| 4 | Índigo | #4338CA | #BE185D | Deep, creative |
| 5 | Violeta | #7C3AED | #0369A1 | Expressive, modern |
| 6 | Fucsia | #BE185D | #7C3AED | Energetic, vibrant |
| 7 | Carmesí | #B91C1C | #B45309 | Intense, scenic |
| 8 | Ámbar | #B45309 | #047857 | Warm, cosy |
| 9 | Turquesa | #0F766E | #0369A1 | Balanced, clean |
| 10 | Grafito | #1F2937 | #64748B | Sober, neutral |

### 5.6 Usage flow
**Screen:** Group settings → *Identidad visual*.
- **Pro (Basic):** theme grid (10 cards with mini preview), "Custom colour" picker, intensity
  (3 buttons), group icon, live preview (whole workspace repaints — already implemented with
  `brandPreview`), floating bar "Tienes cambios sin guardar · Descartar cambios · Guardar identidad"
  (already implemented).
- **Studio (Advanced):** the above plus collapsible sections: Colours (primary+secondary with a
  visible ratio indicator), Background (gradient style + intensity), Typography (10 fonts, real-text
  preview), Brand (name/logo/banner), Welcome & login, Remove Sonivo mark, and
  **Restablecer a Sonivo**.
- **Starter:** shows the Sonivo theme selected and locked, with a clear card "Personaliza los
  colores de tu grupo con Pro" and a preview of 3 themes. No "lack" tone.

### 5.7 Behaviour rules
- **Theme applies to all members of the group.** The personal account and screens outside the group
  (Mis grupos, Cuenta) always use the Sonivo theme.
- **Light/dark:** each user chooses; tokens derive for both from the same base colour.
- **Who edits:** Owner, or a role with the "Gestionar identidad" permission.
- **Save:** nothing persists until "Guardar identidad"; the live preview is local.
- **On downgrade:** Sonivo theme applied, saved config kept (§4.3). Basic fields kept, Advanced
  fields disabled but not deleted.
- **Images:** size/type limits (placeholder: 2 MB; PNG/JPG/WebP/SVG); cropped/compressed on upload;
  count toward storage.
- **Accessibility:** focus ring always visible, ≥3:1; gradient motion respects
  `prefers-reduced-motion`.
- **Studio multi-group:** each group has its own identity; an "Apply to all groups" switch copies the
  current config to the rest (placeholder), after which each can diverge.

## 6. Data model (placeholder)

### 6.1 Plan catalog
```json
{
  "starter": {
    "priceMonthlyMXN": 99,
    "trial": { "days": 14, "requiresCard": false },
    "limits": { "members": 3, "groups": 1, "songs": 50, "setlists": 5, "eventsPerMonth": 10, "storageGB": 1, "storageScope": "group" },
    "features": { "rolesLevel": "basic", "historyLevel": "basic", "stats": false, "support": "email", "branding": "none", "removePoweredBy": false }
  },
  "pro": {
    "priceMonthlyMXN": 199,
    "trial": { "days": 14, "requiresCard": false },
    "limits": { "members": 15, "groups": 1, "songs": 500, "setlists": 50, "eventsPerMonth": null, "storageGB": 10, "storageScope": "group" },
    "features": { "rolesLevel": "advanced", "historyLevel": "full", "stats": true, "support": "priority", "branding": "basic", "removePoweredBy": false }
  },
  "studio": {
    "priceMonthlyMXN": 499,
    "trial": { "days": 14, "requiresCard": true },
    "limits": { "members": null, "groups": 3, "songs": null, "setlists": null, "eventsPerMonth": null, "storageGB": 50, "storageScope": "organization" },
    "addons": { "extraGroup": { "priceMonthlyMXN": 150, "max": null } },
    "features": { "rolesLevel": "advanced", "historyLevel": "full", "stats": true, "support": "priority", "branding": "advanced", "removePoweredBy": true }
  }
}
```
`null` = unlimited. `storageGB` is per group in Starter/Pro and per organization in Studio.
**Organization:** Studio introduces a container that groups several groups sharing plan, billing and
storage. In Starter/Pro the group is the only customer. Group limit and extra-group add-on validate
against the organization, not the user.

### 6.2 Personalization capabilities per level
```json
{
  "none":     { "themes": false, "accent": false, "intensity": false, "icon": false, "splitColors": false, "gradientStyle": false, "font": false, "brandName": false, "welcomeText": false, "loginBranding": false, "logo": false, "banner": false },
  "basic":    { "themes": true,  "accent": true,  "intensity": true,  "icon": true,  "splitColors": false, "gradientStyle": false, "font": false, "brandName": false, "welcomeText": false, "loginBranding": false, "logo": false, "banner": false },
  "advanced": { "themes": true,  "accent": true,  "intensity": true,  "icon": true,  "splitColors": true,  "gradientStyle": true,  "font": true,  "brandName": true,  "welcomeText": true,  "loginBranding": true,  "logo": true,  "banner": true }
}
```

### 6.3 Saved brand config per group
```json
{
  "themeId": "ocean", "primary": "#0369A1", "secondary": "#4338CA", "intensity": "medium",
  "gradientStyle": "liquid", "iconId": "music-note", "fontId": "inter", "brandName": null,
  "welcomeText": null, "logoAssetId": null, "bannerAssetId": null, "hidePoweredBy": false
}
```
**Read rule:** effective value = `saved config` filtered by `current plan capabilities`. What the
plan does not allow is ignored at render, but not deleted from storage.

### 6.4 Backend validations
- Every submitted field is permitted by the group's plan (else 403 with the required plan).
- Colours are valid hex and pass the contrast guard (or are corrected and the corrected value
  returned).
- `fontId` is in the allowed list (the 10-id allowlist already exists).
- `intensity` is one of the three values.
- Assets belong to the group and respect size/type.

## 7. How the plan is shown in-app (placeholder)
- **Organizer rail:** small badge with the current plan (Starter/Pro/Studio) and, when trialling,
  days remaining.
- **Group settings → Plan:** card with plan, current usage vs limits (progress bars: members, songs,
  setlists, storage, monthly events, and groups in Studio) and a change-plan button.
- **Locked features:** visible with a discreet lock and the plan that includes them; never silently
  disappear.
- **Plans page:** the §2 table, Pro highlighted as recommended, monthly/annual toggle.

## 8. Marketing placeholders
- **Starter:** "Todo lo esencial para organizar tu banda."
- **Pro:** "Tu grupo, con tu identidad. Más espacio, estadísticas y roles avanzados."
- **Studio:** "Para organizaciones con varios equipos. Hasta 3 grupos, marca propia completa y miembros ilimitados."
- **Personalization:** Starter "Tema Sonivo", Pro "Temas y color de acento", Studio "Marca completa".

## 9. Open decisions (placeholder)
1. Does Starter go to 5 members?
2. Confirm annual price/discount, including the extra-group annual.
3. Confirm the extra-group price (+$150) and whether Studio includes 3 or 2 groups.
4. Does Studio storage grow per extra group?
5. Do Starter/Pro trials need a card (proposed: only Studio)?
6. Tune intensity (wash alpha) visually in light and dark.
7. Confirm the 10 theme hex with the contrast guard.
8. Define the "Gestionar identidad" permission within advanced roles.
9. Define the technical cap for Studio "unlimited".
10. Is the Basic group icon a closed library or free emoji?
11. What happens to archived groups (retention and for how long)?
12. Write the terms rule that Studio is for one organization, and how it is enforced.
13. Billing integration (provider, CFDI invoicing for Mexico, taxes).

## 10. Suggested implementation order
1. Plan catalog + entitlements (§6.1/6.2) as a single source of truth.
2. Organization model: group limit + extra-group add-on (§3.3, §6).
3. Read the group's effective plan and filter capabilities when rendering the brand.
4. Token derivation from a base colour + contrast guard (§5.2, §5.4).
5. Predefined themes + intensity (§5.3, §5.5).
6. Identity tab per level, with locks and upgrade card.
7. Backend validation per plan.
8. Usage meters + limit notices (§4.1, §7).
9. Downgrade rules + grace period.
