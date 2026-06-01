package handlers

import (
	"errors"
	"fmt"
	"net/mail"
	"strings"

	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/templates"
	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/middlewares"
)

const (
	adminUserPathParamUsername          = "username"
	adminUserNotificationDeliveryFailed = "email notification could not be sent"
)

// AdminUsersPOST is the administrator user creation endpoint.
func AdminUsersPOST(ctx *middlewares.AutheliaCtx) {
	body := adminCreateUserRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		ctx.Error(err, messageUnableToCreateUser)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	}

	if err := ctx.Providers.PasswordPolicy.Check(body.Password); err != nil {
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
		Password:    body.Password,
		DisplayName: strings.TrimSpace(body.DisplayName),
		Email:       strings.TrimSpace(body.Email),
		Groups:      groups,
		Disabled:    body.Disabled,
	}

	err := ctx.GetUserProvider().CreateUser(details)

	switch {
	case err == nil:
		if err = ctx.SetJSONBody(adminCreateUserNotify(ctx, details, body.Notify)); err != nil {
			ctx.Logger.WithError(err).Error(errStrRespBody)
		}
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

func AdminUserPasswordPUT(ctx *middlewares.AutheliaCtx) {
	body := adminResetPasswordRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		ctx.Error(err, messageUnableToResetUserPassword)
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

func adminCreateUserNotify(ctx *middlewares.AutheliaCtx, details authentication.UserDetailsCreate, notify *bool) (response adminCreateUserResponseBody) {
	if notify != nil && !*notify {
		response.NotificationReason = "notification disabled by request"
		return response
	}

	if details.Email == "" {
		response.NotificationReason = "user has no email address configured"
		return response
	}

	data := templates.EmailEventValues{
		Title:       "User created successfully",
		DisplayName: details.DisplayName,
		RemoteIP:    ctx.RemoteIP().String(),
		Details: map[string]any{
			"Action": "User Created",
		},
		BodyPrefix: "your",
		BodyEvent:  "User Account Creation",
		BodySuffix: "was successful.",
	}

	address := mail.Address{Name: details.DisplayName, Address: details.Email}

	if err := ctx.Providers.Notifier.Send(ctx, address, "User created successfully", ctx.Providers.Templates.GetEventEmailTemplate(), data); err != nil {
		ctx.Logger.WithError(err).Error("Error occurred sending user creation notification email")
		response.NotificationError = adminUserNotificationDeliveryFailed
		return response
	}

	response.NotificationSent = true

	return response
}

func adminUserPathUsername(ctx *middlewares.AutheliaCtx) string {
	username, _ := ctx.UserValue(adminUserPathParamUsername).(string)
	return username
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
