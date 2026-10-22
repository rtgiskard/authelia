// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares

import (
	"net/mail"

	"golang.org/x/text/language"

	"github.com/authelia/authelia/v4/internal/templates"
)

// NotificationLanguage negotiates self-service email language using the site
// default when the request does not express a supported preference.
func (ctx *AutheliaCtx) NotificationLanguage() string {
	fallback := templates.NotificationLanguage(ctx.Configuration.Notifier.DefaultLanguage)
	tags, _, err := language.ParseAcceptLanguage(string(ctx.Request.Header.Peek("Accept-Language")))
	if err != nil {
		return fallback
	}

	for _, tag := range tags {
		base, _ := tag.Base()

		switch base.String() {
		case "zh":
			return "zh-CN"
		case "en":
			return "en"
		}
	}

	return fallback
}

// SendNotification localizes built-in email values before passing them to the
// configured notifier. Explicit Language values take precedence over the request
// so administrator actions can use the recipient's site default.
func (ctx *AutheliaCtx) SendNotification(recipient mail.Address, subject string, et *templates.EmailTemplate, data any) error {
	var lang string

	switch values := data.(type) {
	case templates.EmailEventValues:
		lang = ctx.notificationLanguage(values.Language)
		values.Language = lang
		values.Title = templates.NotificationText(lang, values.Title)
		values.BodyPrefix = templates.NotificationText(lang, values.BodyPrefix)
		values.BodyEvent = templates.NotificationText(lang, values.BodyEvent)
		values.BodySuffix = templates.NotificationText(lang, values.BodySuffix)

		if lang == "zh-CN" && values.Details != nil {
			details := make(map[string]any, len(values.Details))

			for key, value := range values.Details {
				// Only fixed event values are translated; user-entered content
				// such as usernames and credential descriptions is unchanged.
				if text, ok := value.(string); ok && (key == "Action" || key == "Category") {
					value = templates.NotificationText(lang, text)
				}

				details[templates.NotificationText(lang, key)] = value
			}

			values.Details = details
		}

		data = values
	case templates.EmailUserOnboardingValues:
		lang = ctx.notificationLanguage(values.Language)
		values.Language = lang
		values.Title = templates.NotificationText(lang, values.Title)
		values.LinkText = templates.NotificationText(lang, values.LinkText)
		data = values
	case templates.EmailIdentityVerificationJWTValues:
		lang = ctx.notificationLanguage(values.Language)
		values.Language = lang

		values.Title = templates.NotificationText(lang, values.Title)
		values.LinkText = templates.NotificationText(lang, values.LinkText)
		values.RevocationLinkText = templates.NotificationText(lang, values.RevocationLinkText)
		data = values
	case templates.EmailIdentityVerificationOTCValues:
		lang = ctx.notificationLanguage(values.Language)
		values.Language = lang
		values.Title = templates.NotificationText(lang, values.Title)
		values.RevocationLinkText = templates.NotificationText(lang, values.RevocationLinkText)
		data = values
	default:
		lang = ctx.NotificationLanguage()
	}

	return ctx.Providers.Notifier.Send(ctx, recipient, templates.NotificationText(lang, subject), et, data)
}

func (ctx *AutheliaCtx) notificationLanguage(explicit string) string {
	if explicit != "" {
		return templates.NotificationLanguage(explicit)
	}

	return ctx.NotificationLanguage()
}
