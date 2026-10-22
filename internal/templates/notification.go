// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package templates

// NotificationLanguage returns the supported language, falling back to English.
func NotificationLanguage(language string) string {
	if language == "zh-CN" {
		return language
	}

	return "en"
}

// NotificationText translates built-in notification copy. Unknown text (including
// custom template content) is preserved.
func NotificationText(language, text string) string {
	if NotificationLanguage(language) == "zh-CN" {
		if translated, ok := notificationChinese[text]; ok {
			return translated
		}
	}

	return text
}

var notificationChinese = map[string]string{
	"Hello":      "你好",
	"Account":    "账户",
	"Request IP": "请求 IP",
	"If the button does not work, open this link in your browser:":                                   "如果按钮无法打开，请在浏览器中打开以下链接：",
	"An administrator made this change to your account.":                                             "管理员对你的账户进行了此项更改。",
	"If you were expecting this change, no action is needed. Otherwise, contact your administrator.": "如果这是你预期的更改，无需操作；否则，请联系管理员。",
	"Expires at":                            "有效期至",
	"Reset your password":                   "重置密码",
	"Reset":                                 "重置密码",
	"Set your password":                     "设置密码",
	"Confirm your identity":                 "确认身份",
	"Validate":                              "继续",
	"Revoke":                                "撤销",
	"Cancel this link":                      "撤销此链接",
	"Cancel this code":                      "撤销此验证码",
	"Use this link to reset your password.": "请使用此链接重置密码。",
	"An administrator has invited you to set a password for your new account.":                                                      "管理员邀请你为新账户设置密码。",
	"An administrator has requested a password reset for your account.":                                                             "管理员为你的账户申请了密码重置。",
	"If you did not request this, you can ignore this email. Your password has not changed.":                                        "如果不是你申请的，无需操作。你的密码尚未更改。",
	"If you were not expecting this invitation, you can ignore this email or contact your administrator.":                           "如果你未预期收到此邀请，可以忽略此邮件，或联系管理员。",
	"If you were not expecting this reset, you can ignore this email or contact your administrator. Your password has not changed.": "如果你未预期收到此重置邮件，可以忽略此邮件，或联系管理员。你的密码尚未更改。",
	"Do not forward this email or share this link.":                                                                                 "请勿转发此邮件或分享此链接。",
	"Enter this code in the page where you requested it.":                                                                           "请在申请验证码的页面输入以下验证码。",
	"Do not share this code.": "请勿分享此验证码。",
	"If you did not request this code, cancel it and contact your administrator.":                           "如果不是你申请的，请撤销此验证码并联系管理员。",
	"If this was you, no action is needed.":                                                                 "如果是你本人操作，无需采取任何行动。",
	"If this was not you, reset your password from your usual sign-in page and contact your administrator.": "如果不是你本人操作，请从你平常使用的登录页面重置密码，并联系管理员。",
	"Event details":                  "事件详情",
	"Password changed successfully":  "密码已更改",
	"Password reset successfully":    "密码已重置",
	"User created successfully":      "账户已创建",
	"Action":                         "操作",
	"Category":                       "类别",
	"Description":                    "说明",
	"Username":                       "用户名",
	"Email":                          "邮箱",
	"User Created":                   "创建账户",
	"Password Change":                "更改密码",
	"Password Reset":                 "重置密码",
	"Second Factor Method Added":     "已添加双重认证方式",
	"Second Factor Method Removed":   "已移除双重认证方式",
	"Second Factor Method":           "双重认证方式",
	"One-Time Password":              "动态密码",
	"WebAuthn Credential":            "WebAuthn 凭据",
	"a":                              "一项",
	"your":                           "你的",
	"was added to your account.":     "已添加到你的账户。",
	"was removed from your account.": "已从你的账户移除。",
	"was successful.":                "已成功。",
}
