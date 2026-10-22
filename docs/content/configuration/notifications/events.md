---
# SPDX-FileCopyrightText: 2026 Authelia
#
# SPDX-License-Identifier: Apache-2.0

title: "Events"
description: "A reference of every notification Authelia sends."
summary: "Authelia sends a fixed set of notifications. This section lists each one, when it is sent, and which template renders it."
date: 2026-09-10T10:00:00+10:00
draft: false
images: []
weight: 108400
toc: true
seo:
  title: "" # custom title (optional)
  description: "" # custom description (recommended)
  canonical: "" # custom canonical URL (optional)
  noindex: false # false (default) or true
---

Authelia sends a fixed set of notifications. Every notification is addressed to the email address recorded for the user
in the [authentication backend](../first-factor/introduction.md), is rendered from one of three
[templates](../../reference/guides/notification-templates.md), and is delivered by whichever
[notifier](introduction.md) you have configured.

Notifications cover identity verification, account invitations, and security-relevant changes; they are not marketing
or digest messages. Security-event notifications have no per-event switch. Administrator-created accounts with a
manually chosen password may omit the account-created notification; password setup links always require delivery.

## Events

|            Event            |             Subject             |         Template          |
| :-------------------------: | :-----------------------------: | :-----------------------: |
|  Password reset requested   |      `Reset your password`      | `IdentityVerificationJWT` |
| Session elevation requested |     `Confirm your identity`     | `IdentityVerificationOTC` |
| Administrator invites a new account | `Set your password` | `IdentityVerificationJWT` |
| Administrator sends a reset link | `Reset your password` | `IdentityVerificationJWT` |
| Administrator creates an account with a manual password | `User created successfully` | `Event` |
| Administrator sets a password directly | `Password reset successfully` | `Event` |
|  Password reset completed   | `Password changed successfully` |          `Event`          |
|      Password changed       | `Password changed successfully` |          `Event`          |
|  Second factor registered   |  `Second Factor Method Added`   |          `Event`          |
|    Second factor removed    | `Second Factor Method Removed`  |          `Event`          |

Subjects above are the English variants; built-in messages also support Simplified Chinese. The localized subject is
used as the `{{ .Title }}` placeholder. See [default_language](introduction.md#default_language).

### Password reset requested

Sent when a user requests a password reset from the sign-in portal, or an administrator sends an existing user a reset
link. Opening or refreshing the form does not use the link; only a successful password change consumes it and revokes
the account's other outstanding reset links. The email includes the expiration time and a link to cancel that request.
Sending a link does not change the current password, even if notification delivery fails.

This notification is sent whether or not the requested user exists, from the perspective of the requester: the portal
always responds identically in order to prevent user enumeration. No notification is sent when the user does not exist.

### Administrator invites a new account

When an administrator chooses to send a password setup link, the account is created with an undisclosed random initial
password. The invitation contains a setup link, never the initial password. Choosing a new password completes the normal
reset flow. Administrators may instead set a password manually; no password is included in the optional creation email.

Failed invitation delivery does not undo account creation. The management portal reports the delivery failure separately
so the administrator can send a fresh setup link without creating the account again.

### Session elevation requested

Sent when a user attempts an operation which requires an elevated session, such as managing their credentials, and
[identity validation](../identity-validation/introduction.md) requires them to confirm their identity. The notification
contains a One-Time Code rather than a link, and a link which revokes the elevation request.

### Password reset completed

Sent to the user after their password has been successfully changed via the password reset flow.

### Password changed

Sent to the user after they have successfully changed their own password from the settings area.

When an administrator directly sets a password, the user receives a security-event notification without the new
password. This is distinct from sending a setup link, which sends no password-change event until the user completes it.

### Second factor registered

Sent when a user registers a new second factor method. The body names which method was registered, either a
One-Time Password or a WebAuthn Credential, and in the case of a WebAuthn Credential the description the user gave it.

### Second factor removed

Sent when a user removes a registered second factor method. As with registration, the body names the method and, for a
WebAuthn Credential, its description.

## Delivery

What a recipient actually receives depends on the configured notifier.

|                  Notifier                  |                                          Delivery                                           |
| :----------------------------------------: | :-----------------------------------------------------------------------------------------: |
|              [SMTP](smtp.md)               |           A multipart message containing both the plaintext and HTML renderings.            |
| [SMTP](smtp.md) with `disable_html_emails` |                                The plaintext rendering only.                                |
|           [Filesystem](file.md)            | The plaintext rendering only, preceded by a header naming the date, recipient, and subject. |

The [filesystem](file.md) notifier is intended for testing and development. It writes every notification to a single
file rather than delivering it to the user, so a deployment using it sends the user nothing.

## Customizing

The content of each notification is controlled by its template. To override one, set
[template_path](introduction.md#template_path) and provide a file named after the template with either a `.html` or
`.txt` extension.

See the [Notification Templates](../../reference/guides/notification-templates.md) reference guide for the available
templates, the placeholder variables each one accepts, and the functions available within them.
