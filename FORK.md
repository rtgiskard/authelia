# Fork Notes

This repository is the `rtgiskard/authelia` development fork of Authelia.

The current approach is a minimal governance fork, not a full rebrand. The fork keeps the Authelia binary,
configuration, environment variable, and Go module names for deployment compatibility and easier upstream security
syncs.

## Scope

- Fork-owned releases and artifacts may be published from this repository, including `ghcr.io/rtgiskard/authelia`.
- Fork-only work is focused on self-hosted control-plane improvements, with File-backed user storage as the primary
  product path for admin user management.
- Upstream license, contributor, and attribution material must be preserved.
- Fork-only features do not need to assume upstream acceptance.

## LDAP

The fork is File backend-first for user administration. LDAP is not a supported admin user management backend and should
not be expanded into one. New admin user management features should target the File backend unless a separate fork-owned
product decision says otherwise.

The near-term boundary is the LDAP provider contract itself: LDAP should report no admin user management capabilities and
should reject admin user management mutations as unsupported. This keeps the UI and handlers generic while preventing
LDAP from entering the admin management surface.

The longer-term direction is to weaken LDAP's role in the fork, and potentially remove the LDAP backend when the
remaining compatibility and migration costs are understood. Until then, do not solve LDAP admin management by adding
frontend special cases, reset-only exceptions, or broader LDAP management support. Keep LDAP outside the admin management
surface and reduce it deliberately.

## Upstream Sync

The fork may keep a dedicated upstream-sync branch that tracks upstream continuously. Fork feature and release branches
should stay separate from that branch.

Default sync policy:

1. Keep upstream fetchable for security and maintenance tracking.
2. Update the upstream-sync branch close to upstream.
3. Import upstream changes into fork branches deliberately, preferably as small cherry-picks or reviewed merges.
4. Do not rewrite published fork history by default.
5. Do not push to upstream remotes.
6. Resolve conflicts using upstream implementations and dependencies as the baseline, migrating fork features rather
   than dropping them or retaining obsolete upstream code.

The portal follows upstream's Tailwind CSS / Base UI components and `react-router` package. Fork user management keeps
its administrator authorization and elevated-session requirements, user creation, editing, deletion, enablement,
disablement, password reset, password-policy validation, and notification feedback. The File backend keeps atomic
persistence, unique identities, and upstream user-database format and schema metadata support.

Admin user payloads always encode an ungrouped user's `groups` as an empty JSON array, including list, read, and update
responses. File databases may omit groups without breaking the management portal.

File-backed user creation records an optional UTC `created_at` timestamp in the user database, preserving it across
YAML, TOML, and JSON reloads, profile/status updates, and password changes. Admin list, read, and update payloads expose
the timestamp as an RFC 3339 date-time when known; it is not a writable API field. Legacy/manual users without a timestamp
are not backfilled and display Unknown. Desktop lists and mobile cards show Added Time in the browser's local timezone,
including the Simplified Chinese 添加时间 label. Deleting and recreating a user records a new creation time.

Desktop user lists support ascending and descending sorting by Username, Added Time, or Status before pagination.
The existing enabled-first status order remains the default. Added Time initially shows newest users first, keeps
unknown times last in both directions, and breaks equal-time ties by username. Changing sort returns to the first page.
Sortable headers show a muted bidirectional arrow when inactive and a higher-contrast up/down arrow for the active
ascending/descending sort, while retaining `aria-sort` for assistive technology.

Identity verification retains upstream's cancellation guard: a verification response received after cancellation must
not complete the parent action. Failed verification re-enables the input and controls while preserving fork code
generation guards and rate-limit feedback.

The OIDC consent portal shows the client description without its technical client ID, using the localized consent
request label when the description is empty. Token audiences matching the requesting client ID are omitted; other
services remain visible. Permission and audience sections retain their headings and entries without redundant
explanatory subtitles, with Simplified Chinese headings provided by the portal locale.

User management accepts either completed second-factor authentication or email session elevation. When second-factor
verification is optional and a method is configured, the administrator chooses the method explicitly; failed or
cancelled second-factor authentication never falls back to email. Without a configured method, only email verification
is offered. A configured `identity_validation.elevated_session.require_second_factor` policy still applies to email
elevation. Existing two-factor sessions enter management without an additional email challenge.

This policy is scoped to administrator routes. `GET /admin/api/v1/session/elevation` requires first-factor authentication
and administrator authorization, while user-management operations require both administrator authorization and the
selected verification. Other settings keep the global elevated-session policy; do not enable global
`skip_second_factor` merely to use this management flow.

Password setup emails contain links, never generated or manually chosen passwords. Administrator link requests leave
the current password unchanged; creation and delivery results are reported independently. The admin API uses
`send_password_link` instead of the removed `generate_password` field. Password-reset submissions carry the original
`token` alongside `password`; session state no longer grants password-reset authorization. Links expire after 30 minutes
by default, survive form reloads and unsuccessful attempts, and all outstanding account reset links are invalidated
after a successful password reset. Built-in emails support English and Simplified Chinese through
`notifier.default_language` and supported self-service language preferences.

Fork container builds follow the upstream toolchain and frontend lockfile. Port-specific Authelia URLs, default-port
normalization, and elevation rate-limit feedback remain supported.

Sync verification must package upstream API documentation assets as well as portal output before starting the server.
Compare failing tests with an untouched upstream checkout before attributing them to fork changes, and report upstream
failures explicitly rather than treating the complete suite as passing.
