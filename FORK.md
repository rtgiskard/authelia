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
