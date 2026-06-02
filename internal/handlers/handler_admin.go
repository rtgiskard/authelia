package handlers

import (
	"errors"
	"fmt"
	"mime"
	"net/mail"
	"strings"

	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/random"
	"github.com/authelia/authelia/v4/internal/templates"
	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/middlewares"
)

const (
	adminUserPathParamUsername          = "username"
	adminUserNotificationDeliveryFailed = "email notification could not be sent"
	adminUserEmailRequired              = "Email address is required."
	adminGeneratedPasswordAttempts      = 20
	adminGeneratedPasswordCharacters    = random.CharSetAlphaNumeric + random.CharSetSymbolicRFC3986Unreserved
)

var (
	adminGeneratedPasswordLengths       = []int{32, 30, 24, 20, 16, 12, 8}
	errAdminGeneratedPasswordPolicyFail = errors.New("generated password did not meet the password policy")
)

// AdminUsersPOST is the administrator user creation endpoint.
func AdminUsersPOST(ctx *middlewares.AutheliaCtx) {
	if !adminRequireJSONContentType(ctx) {
		return
	}

	body := adminCreateUserRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		ctx.Error(err, messageUnableToCreateUser)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	}

	email := strings.TrimSpace(body.Email)
	if email == "" {
		ctx.SetJSONError(adminUserEmailRequired)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	}

	password := body.Password
	if body.Generate {
		var err error

		if password, err = adminGeneratePassword(ctx); err != nil {
			adminHandleGeneratedPasswordError(ctx, err, messageUnableToCreateUser)

			return
		}
	} else if password == "" {
		ctx.SetJSONError(messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	}

	if err := ctx.Providers.PasswordPolicy.Check(password); err != nil {
		ctx.Error(err, messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	}

	groups := make([]string, 0, len(body.Groups))

	for _, group := range body.Groups {
		if trimmed := strings.TrimSpace(group); trimmed != "" {
			groups = append(groups, trimmed)
		}
	}

	details := authentication.UserDetailsCreate{
		Username:    strings.TrimSpace(body.Username),
		Password:    password,
		DisplayName: strings.TrimSpace(body.DisplayName),
		Email:       email,
		Groups:      groups,
		Disabled:    body.Disabled,
	}

	err := ctx.GetUserProvider().CreateUser(details)

	switch {
	case err == nil:
		generatedPassword := ""
		if body.Generate {
			generatedPassword = password
		}

		if err = ctx.SetJSONBody(adminCreateUserNotify(ctx, details, body.Notify, generatedPassword)); err != nil {
			ctx.Logger.WithError(err).Error(errStrRespBody)
		}
	case body.Generate:
		handleAdminGeneratedPasswordProviderError(ctx, err, messageUnableToCreateUser)
	default:
		handleAdminUserProviderError(ctx, err, messageUnableToCreateUser)
	}
}

func AdminUserCapabilitiesGET(ctx *middlewares.AutheliaCtx) {
	if err := ctx.SetJSONBody(ctx.GetUserProvider().AdminCapabilities()); err != nil {
		ctx.Logger.WithError(err).Error(errStrRespBody)
	}
}

func AdminUsersGET(ctx *middlewares.AutheliaCtx) {
	result, err := ctx.GetUserProvider().AdminListUsers(authentication.UserProviderAdminListFilter{Search: string(ctx.QueryArgs().Peek("search"))})
	if err != nil {
		handleAdminUserProviderError(ctx, err, messageUnableToListUsers)
		return
	}

	if err = ctx.SetJSONBody(result); err != nil {
		ctx.Logger.WithError(err).Error(errStrRespBody)
	}
}

func AdminUserGET(ctx *middlewares.AutheliaCtx) {
	details, err := ctx.GetUserProvider().AdminGetUser(adminUserPathUsername(ctx))
	if err != nil {
		handleAdminUserProviderError(ctx, err, messageUnableToGetUser)
		return
	}

	if err = ctx.SetJSONBody(details); err != nil {
		ctx.Logger.WithError(err).Error(errStrRespBody)
	}
}

func AdminUserPATCH(ctx *middlewares.AutheliaCtx) {
	if !adminRequireJSONContentType(ctx) {
		return
	}

	body := adminUpdateUserRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		ctx.Error(err, messageUnableToUpdateUser)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		return
	}

	update := authentication.UserProviderAdminUserUpdate{
		DisplayName: trimStringPtr(body.DisplayName),
		Email:       trimStringPtr(body.Email),
		Disabled:    body.Disabled,
	}
	if update.DisplayName != nil && *update.DisplayName == "" {
		ctx.SetJSONError(messageDisplayNameRequired)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		return
	}

	if body.Groups != nil {
		groups := normalizeGroups(*body.Groups)
		update.Groups = &groups
	}

	details, err := ctx.GetUserProvider().AdminUpdateUser(adminUserPathUsername(ctx), update)
	if err != nil {
		handleAdminUserProviderError(ctx, err, messageUnableToUpdateUser)
		return
	}

	if err = ctx.SetJSONBody(details); err != nil {
		ctx.Logger.WithError(err).Error(errStrRespBody)
	}
}

func AdminUserDELETE(ctx *middlewares.AutheliaCtx) {
	if err := ctx.GetUserProvider().AdminDeleteUser(adminUserPathUsername(ctx)); err != nil {
		handleAdminUserProviderError(ctx, err, messageUnableToDeleteUser)
		return
	}

	ctx.ReplyOK()
}

func AdminUserPasswordPUT(ctx *middlewares.AutheliaCtx) {
	if !adminRequireJSONContentType(ctx) {
		return
	}

	body := adminResetPasswordRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		ctx.Error(err, messageUnableToResetUserPassword)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		return
	}

	if body.Generate {
		adminUserGeneratedPasswordPUT(ctx, body)

		return
	}

	if body.Password == "" {
		ctx.SetJSONError(messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	}

	if err := ctx.Providers.PasswordPolicy.Check(body.Password); err != nil {
		ctx.Error(err, messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		return
	}

	if err := ctx.GetUserProvider().AdminResetUserPassword(adminUserPathUsername(ctx), body.Password); err != nil {
		handleAdminUserProviderError(ctx, err, messageUnableToResetUserPassword)
		return
	}

	ctx.ReplyOK()
}

func adminUserGeneratedPasswordPUT(ctx *middlewares.AutheliaCtx, body adminResetPasswordRequestBody) {
	username := adminUserPathUsername(ctx)

	details, err := ctx.GetUserProvider().AdminGetUser(username)
	if err != nil {
		handleAdminUserProviderError(ctx, err, messageUnableToResetUserPassword)
		return
	}

	details.Email = strings.TrimSpace(details.Email)
	if details.Email == "" {
		ctx.SetJSONError(adminUserEmailRequired)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	}

	password, err := adminGeneratePassword(ctx)
	if err != nil {
		adminHandleGeneratedPasswordError(ctx, err, messageUnableToResetUserPassword)

		return
	}

	if err = ctx.GetUserProvider().AdminResetUserPassword(username, password); err != nil {
		handleAdminGeneratedPasswordProviderError(ctx, err, messageUnableToResetUserPassword)
		return
	}

	if err = ctx.SetJSONBody(adminResetPasswordNotify(ctx, details, body.Notify, password)); err != nil {
		ctx.Logger.WithError(err).Error(errStrRespBody)
	}
}

func adminCreateUserNotify(ctx *middlewares.AutheliaCtx, details authentication.UserDetailsCreate, notify *bool, generatedPassword string) (response adminCreateUserResponseBody) {
	if generatedPassword == "" && notify != nil && !*notify {
		response.NotificationReason = "notification disabled by request"
		return response
	}

	if details.Email == "" {
		response.NotificationReason = "user has no email address configured"
		return response
	}

	detailValues := map[string]any{
		"Action": "User Created",
	}
	if generatedPassword != "" {
		detailValues["Password"] = generatedPassword
	}

	data := templates.EmailEventValues{
		Title:       "User created successfully",
		DisplayName: details.DisplayName,
		RemoteIP:    ctx.RemoteIP().String(),
		Details:     detailValues,
		BodyPrefix:  "your",
		BodyEvent:   "User Account Creation",
		BodySuffix:  "was successful.",
	}

	address := mail.Address{Name: details.DisplayName, Address: details.Email}

	if err := ctx.Providers.Notifier.Send(ctx, address, "User created successfully", ctx.Providers.Templates.GetEventEmailTemplate(), data); err != nil {
		if generatedPassword == "" {
			ctx.Logger.WithError(err).Error("Error occurred sending user creation notification email")
		} else {
			ctx.Logger.Error("Error occurred sending generated password notification email")
		}

		response.NotificationError = adminUserNotificationDeliveryFailed
		return response
	}

	response.NotificationSent = true

	return response
}

func adminResetPasswordNotify(ctx *middlewares.AutheliaCtx, details authentication.UserProviderAdminUserDetails, notify *bool, generatedPassword string) (response adminResetPasswordResponseBody) {
	if generatedPassword == "" && notify != nil && !*notify {
		response.NotificationReason = "notification disabled by request"
		return response
	}

	if details.Email == "" {
		response.NotificationReason = "user has no email address configured"
		return response
	}

	data := templates.EmailEventValues{
		Title:       "Password reset successfully",
		DisplayName: details.DisplayName,
		RemoteIP:    ctx.RemoteIP().String(),
		Details: map[string]any{
			"Action":   "Password Reset",
			"Password": generatedPassword,
		},
		BodyPrefix: "your",
		BodyEvent:  "Password Reset",
		BodySuffix: "was successful.",
	}

	address := mail.Address{Name: details.DisplayName, Address: details.Email}

	if err := ctx.Providers.Notifier.Send(ctx, address, "Password reset successfully", ctx.Providers.Templates.GetEventEmailTemplate(), data); err != nil {
		ctx.Logger.Error("Error occurred sending generated password notification email")
		response.NotificationError = adminUserNotificationDeliveryFailed
		return response
	}

	response.NotificationSent = true

	return response
}

func adminGeneratePassword(ctx *middlewares.AutheliaCtx) (password string, err error) {
	for attempt := range adminGeneratedPasswordAttempts {
		if password, err = adminGeneratedPassword(ctx, adminGeneratedPasswordLengths[attempt%len(adminGeneratedPasswordLengths)]); err != nil {
			return "", err
		}

		if err = ctx.Providers.PasswordPolicy.Check(password); err == nil {
			return password, nil
		}
	}

	return "", errAdminGeneratedPasswordPolicyFail
}

func adminGeneratedPassword(ctx *middlewares.AutheliaCtx, length int) (password string, err error) {
	if length < 4 {
		length = 4
	}

	parts := make([]string, 0, 5)

	for _, characters := range []string{random.CharSetAlphabeticLower, random.CharSetAlphabeticUpper, random.CharSetNumeric, random.CharSetSymbolicRFC3986Unreserved} {
		part, err := ctx.Providers.Random.StringCustomErr(1, characters)
		if err != nil {
			return "", err
		}

		parts = append(parts, part)
	}

	remainder, err := ctx.Providers.Random.StringCustomErr(length-4, adminGeneratedPasswordCharacters)
	if err != nil {
		return "", err
	}

	parts = append(parts, remainder)

	return strings.Join(parts, ""), nil
}

func adminHandleGeneratedPasswordError(ctx *middlewares.AutheliaCtx, err error, fallback string) {
	if errors.Is(err, errAdminGeneratedPasswordPolicyFail) {
		ctx.SetJSONError(messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	}

	ctx.Error(fmt.Errorf("%s: %w", strings.TrimSuffix(fallback, "."), err), fallback)
	ctx.SetStatusCode(fasthttp.StatusBadRequest)
}

func handleAdminGeneratedPasswordProviderError(ctx *middlewares.AutheliaCtx, err error, fallback string) {
	switch {
	case errors.Is(err, authentication.ErrUnsupportedOperation):
		ctx.SetJSONError(messageProviderOperationUnsupported)
		ctx.SetStatusCode(fasthttp.StatusNotImplemented)
	case errors.Is(err, authentication.ErrUserNotFound):
		ctx.SetJSONError(messageUserNotFound)
		ctx.SetStatusCode(fasthttp.StatusNotFound)
	case errors.Is(err, authentication.ErrUserAlreadyExists):
		ctx.SetJSONError(messageUserAlreadyExists)
		ctx.SetStatusCode(fasthttp.StatusConflict)
	case errors.Is(err, authentication.ErrPasswordWeak):
		ctx.SetJSONError(messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
	default:
		ctx.Logger.Error(fallback)
		ctx.SetJSONError(fallback)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
	}
}

func adminUserPathUsername(ctx *middlewares.AutheliaCtx) string {
	username, _ := ctx.UserValue(adminUserPathParamUsername).(string)
	return username
}

func adminRequireJSONContentType(ctx *middlewares.AutheliaCtx) bool {
	mediaType, _, err := mime.ParseMediaType(string(ctx.Request.Header.ContentType()))
	if err == nil && mediaType == "application/json" {
		return true
	}

	ctx.SetJSONError(fasthttp.StatusMessage(fasthttp.StatusUnsupportedMediaType))
	ctx.SetStatusCode(fasthttp.StatusUnsupportedMediaType)

	return false
}

func normalizeGroups(groups []string) []string {
	normalized := make([]string, 0, len(groups))

	for _, group := range groups {
		if trimmed := strings.TrimSpace(group); trimmed != "" {
			normalized = append(normalized, trimmed)
		}
	}

	return normalized
}

func trimStringPtr(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)

	return &trimmed
}

func handleAdminUserProviderError(ctx *middlewares.AutheliaCtx, err error, fallback string) {
	switch {
	case errors.Is(err, authentication.ErrUnsupportedOperation):
		ctx.SetJSONError(messageProviderOperationUnsupported)
		ctx.SetStatusCode(fasthttp.StatusNotImplemented)
	case errors.Is(err, authentication.ErrUserNotFound):
		ctx.SetJSONError(messageUserNotFound)
		ctx.SetStatusCode(fasthttp.StatusNotFound)
	case errors.Is(err, authentication.ErrUserAlreadyExists):
		ctx.SetJSONError(messageUserAlreadyExists)
		ctx.SetStatusCode(fasthttp.StatusConflict)
	case errors.Is(err, authentication.ErrPasswordWeak):
		ctx.SetJSONError(messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
	default:
		ctx.Error(fmt.Errorf("%s: %w", strings.TrimSuffix(fallback, "."), err), fallback)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
	}
}
