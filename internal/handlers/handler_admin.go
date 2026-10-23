package handlers

import (
	"errors"
	"mime"
	"net/mail"
	"strings"

	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/model"
	"github.com/authelia/authelia/v4/internal/session"
	"github.com/authelia/authelia/v4/internal/templates"
	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/middlewares"
)

const (
	adminUserPathParamUsername          = "username"
	adminUserNotificationDeliveryFailed = "email notification could not be sent"
	adminUserEmailRequired              = "Email address is required."
)

// AdminUserSessionElevationGET returns the administrator session elevation status.
func AdminUserSessionElevationGET(ctx *middlewares.AutheliaCtx) {
	userSessionElevationGET(ctx, true)
}

// AdminUsersPOST is the administrator user creation endpoint.
func AdminUsersPOST(ctx *middlewares.AutheliaCtx) {
	if !adminRequireJSONContentType(ctx) {
		return
	}

	body := adminCreateUserRequestBody{}

	if err := ctx.ParseBody(&body); err != nil {
		ctx.GetLogger().WithError(err).Error(messageUnableToCreateUser)
		ctx.SetJSONError(messageUnableToCreateUser)
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
	if body.SendPasswordLink {
		password = ""
	} else if strings.TrimSpace(password) == "" {
		ctx.SetJSONError(messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	} else if err := ctx.Providers.PasswordPolicy.Check(password); err != nil {
		ctx.GetLogger().WithError(err).Debug(messagePasswordWeak)
		ctx.SetJSONError(messagePasswordWeak)
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
		if err = ctx.SetJSONBody(adminCreateUserNotify(ctx, details, body.Notify, body.SendPasswordLink)); err != nil {
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
	if result.Users == nil {
		result.Users = []authentication.UserProviderAdminUserDetails{}
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
		ctx.GetLogger().WithError(err).Error(messageUnableToUpdateUser)
		ctx.SetJSONError(messageUnableToUpdateUser)
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

	if update.Email != nil && strings.TrimSpace(*update.Email) == "" {
		ctx.SetJSONError(adminUserEmailRequired)
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
		ctx.GetLogger().WithError(err).Error(messageUnableToResetUserPassword)
		ctx.SetJSONError(messageUnableToResetUserPassword)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		return
	}

	if body.SendPasswordLink {
		if !adminRequirePasswordLink(ctx) {
			return
		}

		adminUserPasswordLinkPUT(ctx)

		return
	}

	if strings.TrimSpace(body.Password) == "" {
		ctx.SetJSONError(messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)

		return
	}

	if err := ctx.Providers.PasswordPolicy.Check(body.Password); err != nil {
		ctx.GetLogger().WithError(err).Debug(messagePasswordWeak)
		ctx.SetJSONError(messagePasswordWeak)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
		return
	}

	details, err := ctx.GetUserProvider().AdminGetUser(adminUserPathUsername(ctx))
	if err != nil {
		handleAdminUserProviderError(ctx, err, messageUnableToResetUserPassword)
		return
	}

	store := ctx.Providers.StorageProvider
	tx, err := store.BeginTX(ctx)
	if err != nil {
		ctx.Logger.WithError(err).Error("Unable to start administrator password reset transaction")
		ctx.SetJSONError(messageUnableToResetUserPassword)
		return
	}

	committed := false
	defer func() {
		if !committed {
			if rollbackErr := store.Rollback(tx); rollbackErr != nil {
				ctx.Logger.WithError(rollbackErr).Error("Unable to roll back administrator password reset transaction")
			}
		}
	}()

	if err = store.RevokeIdentityVerifications(tx, details.Username, "ResetPassword", model.NewNullIP(ctx.RemoteIP())); err != nil {
		ctx.Logger.WithError(err).Error("Unable to revoke password reset links before administrator password reset")
		ctx.SetJSONError(messageUnableToResetUserPassword)
		return
	}

	if err = ctx.GetUserProvider().AdminResetUserPassword(adminUserPathUsername(ctx), body.Password); err != nil {
		handleAdminUserProviderError(ctx, err, messageUnableToResetUserPassword)
		return
	}

	var revocationError string
	if err = store.Commit(tx); err != nil {
		ctx.Logger.WithError(err).Error("Unable to commit link revocation after administrator password reset")
		revocationError = "password was changed but outstanding reset links could not be invalidated"
	} else {
		committed = true
	}

	response := adminResetPasswordNotify(ctx, details)
	response.ResetLinksRevocationError = revocationError
	if err = ctx.SetJSONBody(response); err != nil {
		ctx.Logger.WithError(err).Error(errStrRespBody)
	}
}

func adminRequirePasswordLink(ctx *middlewares.AutheliaCtx) bool {
	var message string

	switch {
	case ctx.Configuration.AuthenticationBackend.PasswordReset.Disable:
		message = "Password links are unavailable because self-service password reset is disabled."
	case ctx.Configuration.AuthenticationBackend.PasswordReset.CustomURL.String() != "":
		message = "Password links are unavailable because a custom password reset URL is configured."
	case strings.TrimSpace(ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret) == "":
		message = "Password links are unavailable because the password reset signing secret is not configured."
	default:
		return true
	}

	ctx.SetJSONError(message)
	ctx.SetStatusCode(fasthttp.StatusBadRequest)

	return false
}

func adminUserPasswordLinkPUT(ctx *middlewares.AutheliaCtx) {
	details, err := ctx.GetUserProvider().AdminGetUser(adminUserPathUsername(ctx))
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

	response := adminResetPasswordResponseBody{}
	if err = middlewares.SendPasswordResetEmail(ctx, session.Identity{Username: details.Username, DisplayName: details.DisplayName, Email: details.Email}); err != nil {
		ctx.Logger.Error("Error occurred sending administrator-requested password reset link")
		response.NotificationError = adminUserNotificationDeliveryFailed
	} else {
		response.NotificationSent = true
	}

	if err = ctx.SetJSONBody(response); err != nil {
		ctx.Logger.WithError(err).Error(errStrRespBody)
	}
}

func adminCreateUserNotify(ctx *middlewares.AutheliaCtx, details authentication.UserDetailsCreate, notify *bool, sendPasswordLink bool) (response adminCreateUserResponseBody) {
	if !sendPasswordLink && (notify == nil || !*notify) {
		response.NotificationReason = "notification disabled by request"
		return response
	}

	if err := middlewares.SendUserOnboardingEmail(ctx, session.Identity{Username: details.Username, DisplayName: details.DisplayName, Email: details.Email}); err != nil {
		ctx.Logger.Error("Error occurred sending new account onboarding email")
		response.NotificationError = adminUserNotificationDeliveryFailed
	} else {
		response.NotificationSent = true
	}

	return response
}

func adminResetPasswordNotify(ctx *middlewares.AutheliaCtx, details authentication.UserProviderAdminUserDetails) (response adminResetPasswordResponseBody) {
	details.Email = strings.TrimSpace(details.Email)
	if details.Email == "" {
		response.NotificationReason = "user has no email address configured"
		return response
	}

	data := templates.EmailEventValues{
		Language:      templates.NotificationLanguage(ctx.Configuration.Notifier.DefaultLanguage),
		Administrator: true,
		Title:         "Password reset successfully",
		DisplayName:   details.DisplayName,
		RemoteIP:      ctx.RemoteIP().String(),
		Details: map[string]any{
			"Action":   "Password Reset",
			"Username": details.Username,
			"Email":    details.Email,
		},
		BodyPrefix: "your",
		BodyEvent:  "Password Reset",
		BodySuffix: "was successful.",
	}

	address := mail.Address{Name: details.DisplayName, Address: details.Email}

	if err := ctx.SendNotification(address, "Password reset successfully", ctx.Providers.Templates.GetEventEmailTemplate(), data); err != nil {
		ctx.Logger.WithError(err).Error("Error occurred sending administrator password reset notification email")
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
		ctx.GetLogger().WithError(err).Error(fallback)
		ctx.SetJSONError(fallback)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
	}
}
