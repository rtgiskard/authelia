// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package templates

import (
	"bytes"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLocalizedNotificationTemplates(t *testing.T) {
	provider, err := New(Config{})
	require.NoError(t, err)
	expires := time.Date(2026, time.October, 22, 12, 30, 0, 0, time.FixedZone("offset", 3600))

	for _, lang := range []string{"en", "zh-CN"} {
		for _, tc := range []struct {
			name          string
			template      *EmailTemplate
			data          any
			link          string
			hasExpiration bool
		}{
			{
				"Onboarding", provider.GetUserOnboardingEmailTemplate(),
				EmailUserOnboardingValues{Language: lang, Title: "Envelope title", DisplayName: "John <script>", Username: "john", Email: "john@example.com", LoginURL: "https://auth.example.com/", LinkURL: "https://auth.example.com/reset?token=secret", LinkText: "Action label", ExpiresAt: expires, Validity: NotificationValidity(lang, 90*time.Minute)},
				"https://auth.example.com/reset?token=secret", true,
			},
			{
				"ResetLink", provider.GetIdentityVerificationJWTEmailTemplate(),
				EmailIdentityVerificationJWTValues{Language: lang, Title: "Envelope title", DisplayName: "John <script>", Domain: "example.com", LinkURL: "https://auth.example.com/reset?token=secret", LinkText: "Action label", ExpiresAt: expires},
				"https://auth.example.com/reset?token=secret", true,
			},
			{
				"OneTimeCode", provider.GetIdentityVerificationOTCEmailTemplate(),
				EmailIdentityVerificationOTCValues{Language: lang, Title: "Envelope title", DisplayName: "John <script>", OneTimeCode: "ABC123", ExpiresAt: expires, RevocationLinkURL: "https://auth.example.com/revoke?id=123"},
				"https://auth.example.com/revoke?id=123", true,
			},
			{
				"Event", provider.GetEventEmailTemplate(),
				EmailEventValues{Language: lang, Title: "Envelope title", DisplayName: "John <script>", Details: map[string]any{"Description": "<untrusted description>"}},
				"", false,
			},
		} {
			t.Run(lang+"/"+tc.name, func(t *testing.T) {
				var html, text bytes.Buffer
				require.NoError(t, tc.template.HTML.Execute(&html, tc.data))
				require.NoError(t, tc.template.Text.Execute(&text, tc.data))
				assert.Contains(t, html.String(), `lang="`+lang+`"`)
				assert.Contains(t, html.String(), "Envelope title")
				assert.Contains(t, text.String(), "Envelope title")
				assert.Contains(t, html.String(), "John &lt;script&gt;")
				assert.NotContains(t, html.String(), "John <script>")
				assert.Contains(t, text.String(), "John <script>")
				if tc.link != "" {
					assert.Contains(t, html.String(), `href="`+tc.link+`"`)
					assert.Contains(t, text.String(), tc.link)
				}
				if tc.hasExpiration {
					assert.Contains(t, html.String(), "2026-10-22 11:30:00 UTC")
					assert.Contains(t, text.String(), "2026-10-22 11:30:00 UTC")
				}
			})
		}
	}
}

func TestNotificationValidity(t *testing.T) {
	for _, tc := range []struct {
		language string
		lifetime time.Duration
		expected string
	}{
		{"en", 2 * time.Hour, "2 hours"},
		{"zh-CN", 2 * time.Hour, "2 小时"},
		{"en", 90 * time.Minute, "1 hour 30 minutes"},
		{"zh-CN", 90 * time.Minute, "1 小时 30 分钟"},
		{"en", time.Hour + time.Minute + 1500*time.Millisecond, "1 hour 1 minute 1.5 seconds"},
		{"en", 250 * time.Millisecond, "0.25 seconds"},
	} {
		t.Run(tc.expected, func(t *testing.T) {
			assert.Equal(t, tc.expected, NotificationValidity(tc.language, tc.lifetime))
		})
	}
}
