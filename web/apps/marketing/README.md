# Sonivo Marketing

Public, server-rendered marketing site for `sonivo.lat`. It is a separate
Next.js workspace and deployable from the product app. Its routes and approved
surface hosts come from `@sonivo/routes`; localized copy comes from
`@sonivo/i18n`.

Run locally from `web/` with `npm run marketing`. The production deployment
belongs to the `sonivo.lat` host only. Sign-in and product links use the fixed
`auth.sonivo.lat` and `app.sonivo.lat` origins; those deployments and DNS must
be configured before public cutover.

The sitemap lists only the three public locale landing pages. Keep private
account, product, tenant, and API paths out of this application and sitemap.
