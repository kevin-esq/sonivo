# Financial OSS, agent skills, MCPs, and Stripe integration research

**Date:** 2026-11-06. **Status:** OSS fit assessment and implementation decision; not authorization to replace Stripe or run a new billing service.
**Repository baseline:** `feature/stripe-billing`, branched from local `develop` at `bdc766e`.
**Scope:** evaluate tools and reference implementations for Sonivo subscriptions, plans, payment security, reconciliation, and Mexican invoicing.
**Method:** first-party documentation, upstream repositories, selected skill bodies, license files, and public GitHub API metadata. No third-party software was installed or executed. No payment account was connected.

## 1. Decision for Sonivo's current release

**DECISION — consistent with accepted ADR-0111/0115/0116:** keep the configured payment provider as the payment and recurring-renewal authority; keep entitlements, billing records, and Group authorization in Sonivo; send accounting facts to the system of administration only. Sonivo already integrates Stripe.net 53.1.0 in `src/Sonivo.Infrastructure/Sonivo.Infrastructure.csproj`. Its upstream repository identifies it as the .NET client and Apache-2.0 licensed. This is the runtime OSS adopted for payment API access.

**DO NOT ADD Kill Bill, Lago, OpenMeter, or another self-hosted billing engine to this release.** Kill Bill would add a Java service and a second subscription/catalog state model beside the accepted Stripe authority. Lago is centered on usage billing and carries AGPL-3.0; Sonivo's current accepted product uses fixed monthly tiers, not metered charges. This is a fit decision, not a claim that those projects are poor software. Revisit only if Sonivo accepts a requirement that Stripe plus Sonivo cannot satisfy.

**FACT:** Stripe's hosted processing and Billing service are commercial services, not self-hosted OSS. Stripe.net is open-source client code, not a payment processor. Sources: [Stripe.net](https://github.com/stripe/stripe-dotnet), [Checkout](https://docs.stripe.com/payments/checkout), [Customer Portal](https://docs.stripe.com/customer-management).

**ALREADY PRESENT:** the four project-local review skills `stripe-best-practices`, `upgrade-stripe`, `payment-reconciliation`, and `invoice-health-check` are authorized and pinned in the tooling inventory with upstream notices. They are developer guidance, not runtime dependencies. The Stripe MCP stays disabled pending sandbox OAuth. The Stripe CLI was not installed. OSS research does not authorize more tools.

**NEXT:** finish BILL-08 within its accepted phase scope. No new billing engine, accounting platform, metering service, dependency, MCP, or CLI is required for that work. Keep referral/accounting delivery disabled until its existing launch gates pass.

**PROHIBITION:** MCP and an LLM must not become dependencies of customer checkout, webhook verification, entitlement enforcement, or subscription renewal. Agent tooling supports development and reviewed operations; deterministic application code handles payments.

## 2. Evaluation criteria and evidence limits

Candidates were compared on functional fit, license clarity, maintainer provenance, recent repository activity, security boundaries, deployment burden, stack compatibility, and usefulness without adoption. Stars were not used as a security or correctness score.

**FACT:** `archived`, `pushed_at`, and license metadata were queried from `https://api.github.com/repos/{owner}/{repo}` on the research date. A push may be a bot update or a non-default branch change. It does not prove stable releases, correct accounting, responsive support, or production readiness. GitHub license detection can also be incomplete.

The following work was not performed: deployment benchmarks, paid-plan comparison, full dependency/CVE audits, complete source audits, tax advice, production account access, or compatibility builds against Sonivo's .NET 10 target. No candidate is certified secure by this report. Any adoption needs a version-specific review.

## 3. Existing Sonivo foundation

**FACT — accepted constraints:** ADR-0111/0115/0116 and [the Stripe billing spec](PHASE-STRIPE-BILLING-SPEC.md) govern implementation. The billing provider, account billing boundary, plan terms, and in-page card flow are already recorded as accepted decisions.

- One entitlement catalog defines Starter, Pro, and Studio capabilities.
- Organization is an accepted billing/limits container, not an alternate Group ACL engine.
- Group-scoped authorization and Owner/Member security roles remain mandatory.
- Downgrades preserve customer content and saved branding.
- Manual and HMAC-signed sandbox providers exist.
- Provider events pass through an idempotency ledger and a transactional handler.
- CFDI, tax policy, and provisional commercial values remain unresolved in the existing documentation.

**FACT — inspected source:**

| Surface | Existing behavior | Why it matters for Stripe |
| --- | --- | --- |
| [`IPaymentProvider`](../../src/Sonivo.Domain/Billing/Payments/IPaymentProvider.cs) | Manual/Sandbox enum; synchronous checkout; normalized webhook | Reuse the boundary; review asynchronous network calls and richer provider identity requirements. |
| [`StartCheckoutHandler`](../../src/Sonivo.Application/Billing/Payments/StartCheckoutHandler.cs) | Requires Group Owner; passes plan and caller-supplied return URLs; customer email is null | Keep authorization; establish a stable customer mapping, URL policy, and retry identity. |
| [`ProcessPaymentWebhookHandler`](../../src/Sonivo.Application/Billing/Payments/ProcessPaymentWebhookHandler.cs) | Verifies, checks event ID, applies state, records event in a transaction | Good foundation; review concurrent duplicates, event ordering, correlation, and recovery. |
| [`PlanCatalog`](../../src/Sonivo.Domain/Billing/PlanCatalog.cs) | Default is Studio; unknown IDs resolve to default; monthly MXN placeholders | Legacy fallback must not silently grant paid capabilities to invalid/unmapped provider prices. |
| [`Program.cs`](../../src/Sonivo.Api/Program.cs) | Checkout API validates known plan; webhook reads `X-Sonivo-Signature`; 64 KiB payload limit | Stripe needs its own signature protocol; prove selected event payloads fit the existing limit. |
| [`WebhookEventConfiguration`](../../src/Sonivo.Infrastructure/Persistence/Configurations/WebhookEventConfiguration.cs) | Event ID is the primary key | Database uniqueness exists; this alone does not prove graceful duplicate handling under concurrency. |
| [`EfWebhookEventStore`](../../src/Sonivo.Infrastructure/Persistence/EfWebhookEventStore.cs) | Checks existence separately, then inserts and saves | Test two simultaneous deliveries and transaction behavior on conflict. |

**FACT:** `VerifiedWebhook.CurrentPeriodEndsAt` is present but not used by the inspected `Apply` method. `trialing` calls `StartTrial`, which derives a fresh trial end from the local clock. These are review targets before using real provider events; no exploit or production failure was reproduced.

**FACT:** the inspected domain search found no Organization entity or persisted Stripe customer/subscription IDs. This is a bounded source-search result, not proof that every related concept is absent everywhere. Studio's shared billing requires implementation discovery before assigning a single Stripe Customer per billing account.

**FACT:** the spec's Starter summary lists three members while the current catalog allows five. Prices, annual billing, trial behavior, and capacity need reconciliation before creating commercial Stripe Prices.

## 4. OSS billing, payment orchestration, and financial ledgers

All fit judgments in the final column are **ASSUMPTION — recommendations**, not upstream claims.

| Candidate | Verified purpose and license | Best reference value | Fit for Sonivo now |
| --- | --- | --- | --- |
| [Kill Bill](https://github.com/killbill/killbill) | Apache-2.0 subscription billing/payment platform; Java; catalogs, invoicing, overdue handling and gateway plugins | Billing lifecycle, catalog evolution, retry/overdue policy | Strongest shortlist candidate for a future independent subscription engine. Operating a separate service is unnecessary for the initial Stripe integration. |
| [Lago](https://github.com/getlago/lago) | AGPL-3.0 billing platform, particularly usage/metering; separate MIT agent tooling | Pricing models, usage aggregation, credits, invoice lifecycle | Strong candidate if Sonivo later sells metered consumption. Current fixed tiers do not establish that need. Review exact OSS/Premium boundaries. |
| [OpenMeter](https://github.com/openmeterio/openmeter/blob/main/README.md) | Apache-2.0 metering, entitlements and billing; releases described as beta | Usage events, allowance balances, versioned product catalog | Defer. Runtime includes Kafka, ClickHouse and PostgreSQL; too much operational burden for three recurring tiers. |
| [Polar](https://github.com/polarsource/polar) | Apache-2.0 billing platform; hosted offering acts as Merchant of Record | Checkout/subscription flows and benefit provisioning | Useful reference. Switching to hosted Polar would change the commercial/provider model. Self-hosting source does not itself supply Polar's Merchant of Record service. |
| [Hyperswitch](https://github.com/juspay/hyperswitch) | Apache-2.0 payment orchestration with multiple processor connections | Provider isolation, routing, failure handling | Defer unless multi-processor routing becomes an actual requirement. Not the simplest Stripe subscription adapter. |
| [TigerBeetle](https://github.com/tigerbeetle/tigerbeetle) | Apache-2.0 financial transaction database | Transfer/account invariants and durable financial records | Reference only. Sonivo has not established a high-volume transfer or wallet requirement. It is not a subscription product or tax system. |
| [Formance Ledger](https://github.com/formancehq/ledger) | Current main describes Ledger v3 with Raft/Pebble. Current license verification is unresolved | Programmable ledger design and idempotency | Hold adoption. Do not infer today's license from an old search result. Pin and inspect a specific release first. |

**FACT:** OpenMeter's own README says direct provider integration is usually simpler for fixed subscriptions. It also describes beta releases and its infrastructure. This directly supports the recommendation to defer metering infrastructure. [Source](https://github.com/openmeterio/openmeter/blob/main/README.md).

**FACT:** Kill Bill has an official [Stripe plugin](https://github.com/killbill/killbill-stripe-plugin). That proves an integration path exists; it does not prove the plugin's entire configuration or examples meet Sonivo's requirements. Its README describes optional environment references for secrets, while existing plaintext tenant configuration remains possible.

**FACT — Formance discrepancy:** a crawled [LICENSE result](https://github.com/formancehq/ledger/blob/main/LICENSE) reported MIT. Direct retrieval of that path returned 404; root contents and repository API metadata did not confirm a current license. The inspected main commit was `629819efe3f44a2cb4a24de5e0829b041673c408`. Treat current licensing as **OPEN QUESTION**, not as MIT or as evidence that historical versions lacked licenses. [Current README](https://raw.githubusercontent.com/formancehq/ledger/main/README.md).

## 5. Accounting and invoicing software

Accounting applications solve a different problem from collecting Sonivo subscriptions. They can support the company's bookkeeping separately without becoming embedded product dependencies.

| Candidate | Verified classification/license | Assessment for this task |
| --- | --- | --- |
| [LedgerSMB](https://github.com/ledgersmb/LedgerSMB/blob/master/README.md) | Web double-entry accounting using PostgreSQL; GPL v2 license text | Focused accounting candidate. Review license declarations per release; GitHub detection returned NOASSERTION. [License](https://raw.githubusercontent.com/ledgersmb/LedgerSMB/master/LICENSE). |
| [Bigcapital](https://github.com/bigcapitalhq/bigcapital) | AGPL accounting/inventory application | Candidate for back-office accounting and report references. Separate evaluation needed for local accounting requirements. |
| [SolidInvoice](https://github.com/SolidInvoice/SolidInvoice) | MIT invoicing application; PHP/Symfony | Best permissively licensed invoice-workflow reference in this shortlist. Not a substitute for Stripe subscription state or CFDI certification. |
| [InvoicePlane](https://github.com/invoiceplane/InvoicePlane) | MIT self-hosted clients, invoices and payments application | Another permissive invoicing reference. A second invoice system would need a clear ownership and synchronization policy. |
| [Odoo Community](https://github.com/odoo/odoo) | LGPL-3.0 core; Enterprise is separate | Consider only for broader back-office needs. Verify exact accounting modules and localization by edition; do not assume Enterprise features are Community OSS. [Core license](https://github.com/odoo/odoo/blob/19.0/LICENSE). |
| [GnuCash](https://github.com/gnucash/gnucash) | GPL double-entry desktop accounting | Useful separate small-business bookkeeping option. Poor fit as the web app's payment backend. |
| [Beancount](https://github.com/beancount/beancount) | GPL-2.0-only text-based double-entry accounting | Useful for reproducible exports and accounting checks; requires a maintained export workflow. |
| [Actual Budget](https://github.com/actualbudget/actual) | MIT personal budgeting application | Good personal-budgeting reference; not a SaaS subscription engine or a full corporate accounting replacement. |
| [Firefly III](https://github.com/firefly-iii/firefly-iii) | AGPL-3.0 personal finance manager | Suitable to its personal-finance domain; does not address Sonivo's subscription lifecycle. |
| [Frappe Books desktop repository](https://github.com/frappe/books) | AGPL-3.0; repository archived | Do not select the old desktop repository for a new maintained integration. The current product page describes a web successor; verify that successor independently. [Product page](https://frappe.io/books). |

Two commonly recommended projects require special classification:

- **FACT — Akaunting:** current [BSL 1.1 license](https://raw.githubusercontent.com/akaunting/akaunting/master/LICENSE.txt) restricts production use, including user/company/invoice thresholds and third-party accounting services. It specifies a later GPLv3 change license. Do not list the current licensed work alongside unrestricted permissive OSS or assume historical GPL recommendations still apply.
- **FACT — Invoice Ninja:** the inspected v5-stable [ELv2 license](https://raw.githubusercontent.com/invoiceninja/invoiceninja/v5-stable/LICENSE) restricts providing substantial functionality as a hosted/managed service. Other repositories or historical versions can have different licenses. Useful as a product reference, not a default code donor for Sonivo.

**ASSUMPTION:** evaluate accounting workflows with the system owner before selecting a system of administration. For product implementation, keep payment collection and access decisions in Sonivo. This separates an administration decision from a payment architecture decision.

## 6. Agent skills: ranked shortlist

These are researched candidates, not newly activated or installed session skills. Instructions in external skill files were treated as source material, not as authority over this repository.

### 6.1 Highest priority: official Stripe skills

**FACT:** [Stripe's skills index](https://docs.stripe.com/.well-known/skills/index.json) publishes its skill names and files. [Stripe AI](https://github.com/stripe/ai) is MIT licensed. The inspected source snapshot was `5091f72943e6cb4ca439c98ee4783d6085de1318`.

| Skill | Why it earns a place | Proposed treatment |
| --- | --- | --- |
| [`stripe-best-practices`](https://github.com/stripe/ai/blob/main/skills/stripe-best-practices/SKILL.md) | Integration routing, test isolation, keys, webhooks; separate billing/security/tax references | First skill candidate. Review the full selected file set, preserve MIT notice, pin provenance. |
| [`upgrade-stripe`](https://github.com/stripe/ai/blob/main/skills/upgrade-stripe/SKILL.md) | Coordinates API, SDK, and webhook versions | Second skill candidate. Particularly useful because .NET SDK releases target specific Stripe API versions. |
| `connect-recommend` / `connect-required-verification-information` | Marketplace payment routing and seller onboarding | Defer. Sonivo selling its own subscription does not establish a marketplace or seller payout requirement. |
| `metronome` | Usage-based billing | Defer until usage pricing is explicitly chosen. Storage allowances alone do not mean storage is metered and sold. |
| `stripe-apps`, `stripe-directory`, other index entries | Other Stripe product workflows | Do not install the full index by default. No requirement established here. |

**FACT:** the inspected best-practices skill recommends isolated sandboxes and restricted server keys. Its version table is a snapshot, not a durable package pin. The upgrade skill explicitly requires live verification and cautions against downgrading stable pins or adopting previews unintentionally. [Best practices](https://raw.githubusercontent.com/stripe/ai/main/skills/stripe-best-practices/SKILL.md), [upgrade guidance](https://github.com/stripe/ai/blob/main/skills/upgrade-stripe/SKILL.md).

**ASSUMPTION:** use the billing, security, and tax reference files as implementation review material, while preserving Sonivo's accepted architecture and explicit scope. Do not import unrelated Connect, Treasury, or metering functionality because a bundled skill mentions it.

### 6.2 Finance operations: Anthropic and JustPaid

| Source | Concrete skills | Recommendation and limitation |
| --- | --- | --- |
| [Anthropic Finance & Accounting](https://github.com/anthropics/knowledge-work-plugins/blob/main/finance/README.md) | `reconciliation`, `journal-entry-prep`, `financial-statements`, `variance-analysis`, `close-management`, `audit-support` | Prefer reconciliation and close methodology when operating finance. These guide reviewed work; they are not a payment adapter. Repository is Apache-2.0. |
| [JustPaid / Loopfour](https://github.com/loopfour/finance-skills) | `payment-reconciliation`, `invoice-health-check`, `contract-to-invoice`, `ar-collections`, `finance-close-checklist`, `revenue-recognition-qa`, `usage-billing-review`, `dunning-emails`, `cfo-briefing` | Most directly relevant lightweight finance-operations collection found. MIT. Prioritize the first two; retain human review and evidence requirements. |
| [Anthropic Financial Services](https://github.com/anthropics/financial-services) | Financial models, fund administration, reconciliation, unit economics, investment research | Reference only for this integration. Most workflows target financial institutions rather than SaaS payment engineering. Apache-2.0 repository metadata; check per-package notices before copying. |
| [JoelLewis finance_skills](https://github.com/JoelLewis/finance_skills) | Investment management, mathematical foundations, compliance and advisory workflows | Lower priority. MIT, but domain fit is weaker than Stripe/finance-operations sources. No full content audit was performed. |

**FACT — inspected skill bodies:** Anthropic's [reconciliation](https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/finance/skills/reconciliation/SKILL.md) distinguishes bank, subledger, and intercompany differences. Its [journal-entry preparation](https://raw.githubusercontent.com/anthropics/knowledge-work-plugins/main/finance/skills/journal-entry-prep/SKILL.md) includes review and supporting documentation. It contains US-specific examples, so it is not Mexican fiscal policy.

**FACT — inspected skill bodies:** JustPaid's [payment reconciliation](https://raw.githubusercontent.com/loopfour/finance-skills/main/skills/payment-reconciliation/SKILL.md) separates fees, refunds, disputes and unmatched cash, preserves evidence, and prohibits posting entries/refunds. Its [invoice health check](https://raw.githubusercontent.com/loopfour/finance-skills/main/skills/invoice-health-check/SKILL.md) checks billing terms and supporting evidence without sending invoices. Treat numerical confidence/health scores as review aids, not financial truth.

**ASSUMPTION — smallest useful initial skill set:** `stripe-best-practices`, `upgrade-stripe`, `payment-reconciliation`, and `invoice-health-check`. Add Anthropic `reconciliation` only if its broader GL/bank methodology is actually needed. Avoid loading overlapping whole collections.

**FACT — maintenance snapshots:** Anthropic knowledge-work-plugins main was `2574e29377c7173d0cecffef29a6ecbd7f8ccb5d`; JustPaid main was `6f02e8a0ac9f306a6d2d20bc3d9b7c8aec6f6065`. JustPaid's last reported repository push was 2026-05-06, substantially older than Stripe's. That is a review consideration, not proof of abandonment.

### 6.3 Reuse existing Sonivo skills

**ASSUMPTION:** reuse `dotnet-secure-architecture`, `group-tenancy-isolation`, `validation-symmetry`, `tdd`, `differential-review`, and `react-frontend-security` during implementation. These already encode the project's boundaries. A generic finance skill does not replace security engineering or transaction tests. No additional general-purpose security toolkit was justified by this research.

## 7. MCP and plugin comparison

**FACT:** the connected plugin directory returned the official Stripe plugin as available and not installed. It includes integration skills and a remote MCP configuration. A suggestion was surfaced; no installation, OAuth connection, or tool invocation against a Stripe account occurred. [Official plugin](https://chatgpt.com/plugins/plugin_connector_690ab09fa43c8191bca40280e4563238).

| Candidate | Verified capability and boundary | Recommendation |
| --- | --- | --- |
| [Stripe official MCP](https://docs.stripe.com/mcp) | Remote `https://mcp.stripe.com`; OAuth or agent API keys; documentation and account API tools, including writes | First choice. Sandbox environment only initially; grant minimum permissions and review financial writes. Hosted MCP is not established here as self-hostable OSS. |
| [Lago Docs MCP](https://github.com/getlago/lago-doc/blob/main/llms.txt) | Read-only documentation discovery/retrieval, separate from product operations | Reference research only if Lago is evaluated further. Documentation access does not need customer credentials. |
| [Lago Product MCP](https://github.com/getlago/lago-agent-toolkit) | MIT tooling; billing read/write operations inherit Lago API-key permissions | Defer with the Lago runtime decision. Do not assume a prompt instruction makes a privileged API key read-only. |
| [Xero official MCP](https://github.com/XeroAPI/xero-mcp-server) | Official accounting connector; MIT package, Node/OAuth dependencies | Consider only if Xero becomes the accounting system. Open connector does not make Xero's commercial service OSS. |
| [PayPal official MCP](https://developer.paypal.com/ai-tools/mcp-server) | Local/remote options; sandbox and production endpoints; financial operations | Credible alternative-provider reference. Do not add a second processor without a requirement. |
| [Square official MCP](https://developer.squareup.com/docs/mcp) | Beta; local/remote; local supports sandbox and `DISALLOW_WRITES`; remote documented as production-only | Defer. Its remote default is unsuitable for this sandbox-first task. |
| Generic community accounting, banking or market-data MCPs | Quality, authorization and licenses vary by implementation | No additional server cleared an adoption review here. Search results are discovery, not authorization or security evidence. |

**FACT — time-sensitive Stripe authentication:** official docs state a migration deadline of **2026-11-30**. Starting in December, full-access secret keys and restricted keys without an Agent tag will not authenticate to Stripe MCP. Prefer OAuth for interactive use or the supported agent-key flow. Ordinary application SDK credentials and webhook signing secrets are different credentials with different purposes. [MCP authentication](https://docs.stripe.com/mcp), [API keys](https://docs.stripe.com/keys).

**ASSUMPTION — MCP permission design:** begin with documentation and sandbox reads. Add sandbox writes only for approved fixtures or configuration work. Production reads require separate consideration of customer data; production refunds, cancellations, prices, transfers, and tax registrations require concrete authorization. A tool visible in the client is not proof its financial effect is allowed.

**FACT:** MCP's upstream security documentation explains that local stdio servers run with client privileges and connected servers can have significant side effects. Reference servers are not automatically production-ready. Pin packages, review scripts/dependencies, and avoid arbitrary filesystem/database access combined with payment credentials. [Protocol security](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/SECURITY.md), [reference-server policy](https://github.com/modelcontextprotocol/servers/security).

## 8. Developer tools and testing

| Tool/service | Classification | Recommended role |
| --- | --- | --- |
| [Stripe.net](https://github.com/stripe/stripe-dotnet) | Official Apache-2.0 SDK | Adapter implementation; use a compatible stable release and SDK signature verification. Validate with .NET 10 before adoption. |
| [Stripe CLI](https://github.com/stripe/stripe-cli) | Official Apache-2.0 developer tool | Forward local events, inspect requests, resend events and run fixtures. Review telemetry and keep secrets out of terminal output. |
| [Stripe Billing sandbox/test clocks](https://docs.stripe.com/billing/testing) | Hosted testing capability | Trials, renewal, failures, recovery, upgrades, schedules and portal behavior. Separate local and CI environments. |
| [stripe-mock](https://github.com/stripe/stripe-mock) | OSS mock server | Optional request-shape sanity checks only. Upstream says responses are hardcoded and it does not reproduce payment behavior. It cannot prove the lifecycle works. |
| Existing .NET/PostgreSQL tests and Playwright | Already adopted project workflow | Prove server authorization, database atomicity and real browser/BFF/API boundaries. Reuse before adding another test framework. |
| Stripe Dashboard/Workbench | Commercial platform tooling | Inspect sandbox objects and event delivery; operational support alongside deterministic reconciliation. |

**FACT:** no `stripe` executable was returned by `Get-Command stripe` on this host. That only checks command discovery on this shell's PATH. No Stripe package/reference was found in the inspected Infrastructure project, web root package file, or `opencode.json`. No installation was attempted.

**ASSUMPTION — minimum acceptance scenarios for the future implementation:**

1. Owner can start checkout; Member, guest, removed member, and unrelated Group Owner cannot.
2. Caller cannot submit an arbitrary amount, price, currency, Customer ID, or unrelated billing account.
3. Repeated checkout submissions and network retries do not create unintended duplicate subscriptions.
4. Forged, modified, wrong-environment, and expired-signature events cannot change billing state.
5. Duplicate and simultaneous deliveries have one committed business effect and safe retry responses.
6. Events arriving out of order do not revive a canceled subscription or extend a trial incorrectly.
7. Payment failure, recovery, cancellation scheduling/reversal, and period-end expiry preserve the accepted content-access rules.
8. Checkout success redirects alone cannot grant a paid plan.
9. Unknown provider Prices and mismatched account/subscription mappings fail closed.
10. Refund, dispute, and fraud events create the specified operational response without inventing entitlement policy.
11. Invalid return URLs, payload overflow, timeouts and provider outages fail safely.
12. Annual/extra-Group scenarios are tested only after those commercial rules and Organization ownership are defined.

Stripe documents asynchronous subscription events, duplicate/unordered delivery, and sandbox lifecycle tests. API idempotency keys protect provider request retries; they do not replace local uniqueness and transaction design. [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [delivery behavior](https://docs.stripe.com/webhooks), [idempotent requests](https://docs.stripe.com/api/idempotent_requests), [testing](https://docs.stripe.com/billing/testing).

## 9. Mexico: taxes and CFDI

**FACT:** Stripe currently lists Mexico as supported for Stripe Tax and describes domestic/cross-border calculations for Mexican businesses. Product tax codes, customer information, and active registrations affect the result. Do not repeat older claims that Stripe Tax cannot support a Mexican business. [Supported countries](https://docs.stripe.com/tax/supported-countries), [LATAM guidance](https://docs.stripe.com/tax/supported-countries/latin-america-and-caribbean).

**FACT:** the SAT publishes CFDI 4.0 services and a directory of authorized certification providers. Calculating tax or downloading an invoice PDF does not establish that a particular document is a certified CFDI. This report did not verify a Stripe-native CFDI issuing flow. [SAT CFDI 4.0](https://wwwmat.sat.gob.mx/aplicacion/75169/servicio-de-facturacion-cfdi-version-4.0-%28vigente-a-partir-del-1-de-enero-de-2022%29), [PAC directory](https://wwwmat.sat.gob.mx/aplicacion/30796/proveedor-de-certificacion-de-factura-electronica-).

Useful OSS references:

- [SAT-CFDI/python-satcfdi](https://github.com/SAT-CFDI/python-satcfdi): MIT Python library; CFDI 4.0 processing/generation, validation and documented PAC integrations. Community software, not the tax authority. Reference only for Sonivo's .NET backend.
- [eclipxe13/CfdiUtils](https://github.com/eclipxe13/CfdiUtils): MIT PHP utilities for Mexican CFDI. The README says a future move to `phpcfdi/cfdiutils` is planned; do not assume the destination is already the canonical maintained package.

**OPEN QUESTION:** seller legal entity/country, target markets, tax-inclusive versus tax-exclusive prices, fiscal invoicing workflow, PAC or other authorized issuance path, customer fiscal fields, cancellations/credit notes, and responsibilities for filing/remittance. A qualified accountant must settle the policy; tools implement it.

**PROHIBITION:** do not let an agent possess or export CSD/e.firma private keys merely to research CFDI. No certificate access is needed for this report.

## 10. Plan, billing ownership, and role decisions

The following is a proposed decision worksheet, not an accepted ACL change.

| Decision | Existing constraint | Proposed direction / open choice |
| --- | --- | --- |
| Billing subject | Organization accepted as billing container; current handlers are Group-based | Determine persisted ownership and migration before choosing one Stripe Customer per billing subject. |
| Product roles | Group Owner/Member security rules remain binding | Keep roles separate from paid features. Do not grant authorization by buying Pro/Studio. |
| Billing authority | Current checkout requires Owner | Define who controls shared Studio billing when different Groups have different Owners. Do not invent BillingAdmin implicitly. |
| Stripe Dashboard roles | Separate from Sonivo roles | Human finance operators get platform permissions according to their job; app members receive no Dashboard access automatically. |
| Agent access | Separate from application credentials | Dedicated sandbox authorization; no shared all-powerful production key. |
| Catalog | One Sonivo entitlement catalog | Map approved plan/currency/interval to server-owned Stripe Product/Price IDs. Avoid two competing entitlement catalogs. |
| Prices | Monthly amounts and other values remain provisional | Confirm monthly/annual prices, tax treatment, add-on quantity, discounts and legacy customers. |
| Trials | Existing 14-day placeholders and card rules | Define one authoritative trial end and retry-safe eligibility; do not restart trial on event replay. |
| Upgrade/downgrade | Proration and scheduled downgrade are accepted in principle | Define precise timing, confirmation and behavior after a failed upgrade payment. |
| Nonpayment/cancellation | Existing content must remain available under accepted rules | Specify grace, restricted operations, reactivation and retention without silently deleting data. |
| Refunds/disputes | Provider financial events can diverge from subscription status | Define reconciliation/notification/access responses before implementation. |

**ASSUMPTION:** a Stripe Product per tier with Prices for approved interval/currency variants is a clear initial model. Keep external IDs configurable and separate test/live mappings. Version commercial changes rather than silently rewriting existing customer terms. [Stripe billing reference](https://raw.githubusercontent.com/stripe/ai/main/skills/stripe-best-practices/references/billing.md).

## 11. Security design derived from the research

These are proposed implementation requirements to reconcile with accepted specs:

- Keep raw card data out of Sonivo by using hosted Checkout. Stripe reduces PCI scope; it does not remove the merchant's compliance responsibilities. [Integration security](https://docs.stripe.com/security/guide).
- Authenticate user-facing billing mutations with existing cookies/antiforgery and server-side authorization. Derive customer and billing subject from persisted, authorized relationships.
- Verify Stripe's actual signature header over the unmodified body with the SDK, timestamp tolerance, environment-specific endpoint secret and tested rotation behavior. Do not reuse the sandbox wire protocol.
- Treat a signed event as authentic provider data, not automatic proof that a supplied Group selector matches the persisted Stripe customer/subscription relationship.
- Store event receipt and business-state effects atomically. Handle unique conflicts deliberately. Do not promise end-to-end exactly-once delivery across the network.
- Account for unordered events using provider object reconciliation and explicit state rules. Timestamps alone are not a total ordering.
- Return success only after the event is durably recorded/applied or durably queued. Acknowledge unsupported events according to a documented policy. Preserve retries on transient failures.
- Use server-owned allowed plan/Price/currency/interval combinations. Reject unknown mappings; review the existing Studio fallback separately for legacy compatibility.
- Restrict return URLs to approved origins/routes, protect portal creation, and prevent cross-customer session creation.
- Keep money as integer minor units with explicit currency at provider boundaries. Use deterministic decimal calculations and explicit rounding where business calculations are necessary.
- Separate API credentials, webhook secrets, MCP authorization and fiscal certificates. Redact secrets/PII from logs; retain minimal IDs and audit information.
- Use a durable inbox/worker only if chosen processing or retry requirements need it. Reuse PostgreSQL/application patterns before adding a broker.

Sources for provider-specific behavior: [webhooks](https://docs.stripe.com/webhooks), [keys](https://docs.stripe.com/keys), [security reference](https://raw.githubusercontent.com/stripe/ai/main/skills/stripe-best-practices/references/security.md). Source for local boundaries: [AGENTS.md](../../AGENTS.md), accepted ADRs, and the inspected source in section 3.

## 12. Concrete adoption proposal and stop conditions

**DECISION — development aids:** use the four already authorized, pinned project-local skills. Do not install additional tools for this phase. Enable the Stripe MCP only after a separate sandbox-auth and least-permission review; it is not required for runtime or accepted code behavior.

**FACT — current runtime:** Stripe.net 53.1.0, Stripe Billing API adapter, authenticated billing endpoints, durable webhook inbox and reconciliation already exist in this worktree. Remaining work is lifecycle, RLS, release-safety and external sandbox proof recorded in `NOW.md` and the phase spec. Those are not solved by adding another OSS billing engine.

**PROHIBITION:** do not treat Stripe.net's OSS license as meaning Stripe Billing is free or self-hostable. Do not install a competing billing engine, activate accounting delivery through the system of administration, or use tax calculation as a substitute for an authorized Mexican CFDI workflow.

After approval, the adoption review should:

1. Pin selected skill commits/package releases and inspect exact files, scripts, dependencies, licenses and notices.
2. Keep project skills under `.agents/skills/`; repository MCP configuration follows `opencode.json`. Host plugins remain optional host aids unless a new accepted decision says otherwise.
3. Review what an official plugin's automatic configuration/updating changes before using it. Do not run a blanket setup command that recreates prohibited vendor directories.
4. Record provenance in the existing tooling inventory/audit, following the approved installation method. Avoid unreviewed `latest` or auto-update changes in a reproducible project workflow.
5. Prove sandbox identity and effective permissions without printing credentials. Keep application tests independent of the agent's plugin connection.
6. Allow a rollback by removing only the newly approved tool configuration/files. Never delete unrelated host settings or change production financial data as part of tool rollback.

**OPEN QUESTION:** sandbox OAuth availability for the optional Stripe MCP, tax/CFDI workflow, and legal seller disclosures. These do not change the OSS runtime decision.

**Stop condition for this assessment:** identify OSS actually used, choose whether another runtime is needed, and record why. Current result: use existing Stripe.net and project-local skills; add no separate billing service.

## 13. Maintenance snapshot

**FACT:** public GitHub API responses on 2026-11-03 reported the following. Dates are repository push dates, not audited release dates. Consult the linked repository and release/license files before adoption.

| Repository | Last reported push | Archived | License evidence |
| --- | --- | --- | --- |
| stripe/ai | 2026-11-03 | No | MIT |
| stripe/stripe-dotnet | 2026-11-03 | No | Apache-2.0 |
| stripe/stripe-cli | 2026-11-03 | No | Apache-2.0 |
| killbill/killbill | 2026-10-28 | No | Apache-2.0 |
| getlago/lago | 2026-11-03 | No | AGPL-3.0 |
| openmeterio/openmeter | 2026-11-03 | No | Apache-2.0 |
| polarsource/polar | 2026-11-03 | No | Apache-2.0 |
| formancehq/ledger | 2026-11-03 | No | Unresolved current main; see section 4 |
| tigerbeetle/tigerbeetle | 2026-10-30 | No | Apache-2.0 |
| frappe/books | 2026-10-02 | Yes | AGPL-3.0; archived desktop source |
| bigcapitalhq/bigcapital | 2026-11-02 | No | AGPL-3.0 |
| ledgersmb/LedgerSMB | 2026-11-03 | No | API NOASSERTION; inspected GPL v2 text |
| SolidInvoice/SolidInvoice | 2026-11-03 | No | MIT |
| actualbudget/actual | 2026-11-03 | No | MIT |
| firefly-iii/firefly-iii | 2026-11-03 | No | AGPL-3.0 |
| anthropics/knowledge-work-plugins | 2026-11-03 | No | Apache-2.0 |
| anthropics/financial-services | 2026-10-28 | No | Apache-2.0 |
| loopfour/finance-skills | 2026-05-06 | No | MIT |
| XeroAPI/xero-mcp-server | 2026-10-26 | No | MIT |
| getlago/lago-agent-toolkit | 2026-11-02 | No | MIT |
| SAT-CFDI/python-satcfdi | 2026-10-24 | No | MIT |
| eclipxe13/CfdiUtils | 2026-09-13 | No | MIT |

**Validation:** source/document inspection only. No builds, application tests, provider sandbox operations, or tax calculations were run. Link existence was checked through primary-source retrieval; this is not a guarantee of future link availability. No commit, push, PR, production charge, refund, deployment, or database change was performed.
