package handlers

import (
	"slices"

	"github.com/authelia/authelia/v4/internal/middlewares"
)

// ConfigurationGET get the configuration accessible to authenticated users.
func ConfigurationGET(ctx *middlewares.AutheliaCtx) {
	body := configurationBody{
		AvailableMethods:       make(MethodList, 0, 3),
		PasswordChangeDisabled: false,
		PasswordResetDisabled:  false,
	}

	if ctx.Providers.Authorizer.IsSecondFactorEnabled() {
		body.AvailableMethods = ctx.AvailableSecondFactorMethods()
	}

	body.PasswordChangeDisabled = ctx.Configuration.AuthenticationBackend.PasswordChange.Disable
	body.PasswordResetDisabled = ctx.Configuration.AuthenticationBackend.PasswordReset.Disable
	body.AdministrationEnabled = isAdministrationEnabled(ctx)

	ctx.Logger.WithFields(
		map[string]any{
			"available_methods":        body.AvailableMethods,
			"password_change_disabled": body.PasswordChangeDisabled,
			"password_reset_disabled":  body.PasswordResetDisabled,
		}).Trace("Authelia configuration requested")

	if err := ctx.SetJSONBody(body); err != nil {
		ctx.Logger.Errorf("Unable to set configuration response in body: %s", err)
	}
}

func isAdministrationEnabled(ctx *middlewares.AutheliaCtx) bool {
	if !ctx.Configuration.Administration.Enable {
		return false
	}

	userSession, err := ctx.GetSession()
	if err != nil {
		ctx.Logger.WithError(err).Warn("Unable to determine administrator control plane availability due to missing user session")

		return false
	}

	if slices.Contains(ctx.Configuration.Administration.Users, userSession.Username) {
		return true
	}

	if len(ctx.Configuration.Administration.Groups) == 0 {
		return false
	}

	details, err := ctx.Providers.UserProvider.GetDetails(userSession.Username)
	if err != nil {
		ctx.Logger.WithError(err).WithField("username", userSession.Username).Warn("Unable to determine administrator control plane availability due to user details lookup failure")

		return false
	}

	for _, group := range details.Groups {
		if slices.Contains(ctx.Configuration.Administration.Groups, group) {
			return true
		}
	}

	return false
}
