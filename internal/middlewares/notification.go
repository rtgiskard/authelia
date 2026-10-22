// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares

import (
	"net/mail"

	"github.com/authelia/authelia/v4/internal/templates"
)

// SendNotification selects the account invitation title before sending an email.
func (ctx *AutheliaCtx) SendNotification(recipient mail.Address, subject string, et *templates.EmailTemplate, data any) error {
	if values, ok := data.(templates.EmailIdentityVerificationJWTValues); ok && values.NewAccount {
		subject = "Set your password"
		values.Title = subject
		values.LinkText = subject
		data = values
	}

	return ctx.Providers.Notifier.Send(ctx, recipient, subject, et, data)
}
