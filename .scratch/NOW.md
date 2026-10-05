# NOW - agent focus

**Updated:** 2026-10-05

## Checkpoint state

```text
Implementation: COMPLETE - staging environment + provider-agnostic email + MCPs
  Branch: develop
  Delivered this session (merged):
    - Email is now provider-agnostic. ADR-0068. Two transports selectable by
      config: Email:Transport=api (HTTP JSON, for hosts that block SMTP) | smtp
      (MailKit). No vendor named in source. (#221, #222, #224)
    - Premium, human transactional email: branded HTML + preheader + dark-mode
      meta + schema.org EmailMessage/ViewAction. (#225)
    - Dockerfile installs libgssapi-krb5-2 for SMTP SASL. (#223)
    - Fixed CTA CSP so the Next static export hydrates. (#220)
    - Staging live at https://staging.sonivo.lat (Render free + Neon staging branch,
      isolated). Registration -> email Delivered (Resend). Verified end-to-end.
  Infrastructure configured:
    - Resend: domain sonivo.lat verified in the "sonivo" team; DKIM/SPF/DMARC in
      Namecheap; API key for the backend; Email__Transport=api on Render.
    - Neon: branch "staging" (isolated) wired to Render.
    - Namecheap: CNAME staging -> sonivo.onrender.com.
    - MCPs: Infisical working (global config "infisical-local"); Resend MCP connected.
Human approval: APPROVED (owner authorized full execution)
Git checkpoint: COMMITTED + MERGED (PRs #220, #221, #222, #223, #224, #225)
Remote: PUSHED
CI: PR checks green. develop CI runs intermittently fail with a GitHub runner
    infrastructure error ("job was not acquired by Runner of type hosted"),
    not a code failure -> re-run when runners are available.
```

## Deferred (by owner decision 2026-10-05)
- **Prod is on hold.** Target was GCP Cloud Run (backend) + Vercel (frontend),
  but the GCP billing account is closed and the owner will not pay now. Staging
  (Render) is the live environment. To resume: open GCP billing, then
  `gcloud run deploy` + Vercel with API_ORIGIN + DNS sonivo.lat.

## Follow-ups
- develop CI keeps hitting the GitHub hosted-runner shortage; re-run when green.
- R2 is currently one bucket shared by staging; split prod/staging when prod exists.
- Google sign-in on staging needs the staging origin added to the OAuth client.
- Unrelated untracked files remain: .vscode/, w-h-live-viewer.png, .turbo/, .scratch/shots/.
