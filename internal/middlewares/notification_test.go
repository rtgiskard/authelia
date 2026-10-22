// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares_test

import (
	"net/mail"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"

	"github.com/authelia/authelia/v4/internal/mocks"
	"github.com/authelia/authelia/v4/internal/templates"
)

func TestNotificationLanguage(t *testing.T) {
	for _, tc := range []struct {
		name, fallback, header, expected string
	}{
		{"DefaultEnglish", "", "", "en"},
		{"DefaultChinese", "zh-CN", "", "zh-CN"},
		{"Chinese", "en", "zh-CN", "zh-CN"},
		{"RegionalChinese", "en", "zh-Hans", "zh-CN"},
		{"QualityEnglish", "zh-CN", "zh;q=0.3,en-US;q=0.9", "en"},
		{"QualityChinese", "en", "en;q=0.2,zh-CN;q=0.8", "zh-CN"},
		{"UnsupportedFirst", "en", "fr,zh;q=0.8", "zh-CN"},
		{"ExcludedChinese", "en", "zh;q=0,en;q=0.4", "en"},
		{"Unsupported", "zh-CN", "fr", "zh-CN"},
		{"Invalid", "en", "not a language", "en"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()

			mock.Ctx.Configuration.Notifier.DefaultLanguage = tc.fallback
			mock.Ctx.Request.Header.Set("Accept-Language", tc.header)
			assert.Equal(t, tc.expected, mock.Ctx.NotificationLanguage())
		})
	}
}

func TestSendNotificationLocalizesOnlyFixedEventDetails(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)
	defer mock.Close()
	mock.Ctx.Request.Header.Set("Accept-Language", "zh-CN")

	details := map[string]any{"Action": "Second Factor Method Added", "Category": "One-Time Password", "Description": "Password Change", "Username": "Action"}
	mock.NotifierMock.EXPECT().Send(mock.Ctx, gomock.Any(), "已添加双重认证方式", gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ any, _ mail.Address, _ string, _ *templates.EmailTemplate, data any) error {
			values := data.(templates.EmailEventValues)
			assert.Equal(t, "zh-CN", values.Language)
			assert.Equal(t, "已添加双重认证方式", values.Title)
			assert.Equal(t, map[string]any{"操作": "已添加双重认证方式", "类别": "动态密码", "说明": "Password Change", "用户名": "Action"}, values.Details)
			return nil
		})

	require.NoError(t, mock.Ctx.SendNotification(mail.Address{Address: "john@example.com"}, "Second Factor Method Added", nil, templates.EmailEventValues{Title: "Second Factor Method Added", Details: details}))
	assert.Equal(t, "Second Factor Method Added", details["Action"])
}

func TestSendNotificationLocalizesOneTimeCode(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)
	defer mock.Close()
	mock.Ctx.Request.Header.Set("Accept-Language", "zh-CN")
	mock.NotifierMock.EXPECT().Send(mock.Ctx, gomock.Any(), "确认身份", gomock.Any(), templates.EmailIdentityVerificationOTCValues{Language: "zh-CN", Title: "确认身份", RevocationLinkText: "撤销", OneTimeCode: "ABC123"}).Return(nil)
	require.NoError(t, mock.Ctx.SendNotification(mail.Address{Address: "john@example.com"}, "Confirm your identity", nil, templates.EmailIdentityVerificationOTCValues{Title: "Confirm your identity", RevocationLinkText: "Revoke", OneTimeCode: "ABC123"}))
}
