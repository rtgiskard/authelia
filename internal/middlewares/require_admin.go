package middlewares

import (
	"slices"

	"github.com/authelia/authelia/v4/internal/authentication"
)

// RequireAdministration requires an explicitly configured administrator subject with two-factor authentication.
func RequireAdministration(next RequestHandler) RequestHandler {
	return func(ctx *AutheliaCtx) {
		userSession, err := ctx.GetSession()
		if err != nil {
			ctx.Logger.WithError(err).Warn("Denied administrator control plane access due to insufficient authentication")
			ctx.ReplyForbidden()

			return
		}

		if userSession.AuthenticationLevel(ctx.Configuration.WebAuthn.EnablePasskey2FA) < authentication.TwoFactor {
			ctx.Logger.WithField("username", userSession.Username).Warn("Denied administrator control plane access due to insufficient authentication")
			ctx.ReplyForbidden()

			return
		}

		if slices.Contains(ctx.Configuration.Administration.Users, userSession.Username) {
			next(ctx)

			return
		}

		if len(ctx.Configuration.Administration.Groups) == 0 {
			ctx.Logger.WithField("username", userSession.Username).Warn("Denied administrator control plane access due to missing administrator authorization")
			ctx.ReplyForbidden()

			return
		}

		details, err := ctx.Providers.UserProvider.GetDetails(userSession.Username)
		if err != nil {
			ctx.Logger.WithError(err).WithField("username", userSession.Username).Warn("Denied administrator control plane access due to user details lookup failure")
			ctx.ReplyForbidden()

			return
		}

		if isAdministrationGroupMember(ctx.Configuration.Administration.Groups, details.Groups) {
			next(ctx)

			return
		}

		ctx.Logger.WithField("username", userSession.Username).Warn("Denied administrator control plane access due to missing administrator authorization")
		ctx.ReplyForbidden()
	}
}

func isAdministrationGroupMember(allowed, actual []string) (authorized bool) {
	for _, group := range actual {
		if slices.Contains(allowed, group) {
			return true
		}
	}

	return false
}
