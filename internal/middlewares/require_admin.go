package middlewares

import (
	"slices"

	"github.com/valyala/fasthttp"
)

// RequireAdministration requires an explicitly configured administrator subject.
func RequireAdministration(next RequestHandler) RequestHandler {
	return func(ctx *AutheliaCtx) {
		userSession, err := ctx.GetSession()
		if err != nil {
			ctx.Logger.WithError(err).Warn("Denied administrator control plane access due to missing administrator session")
			replyAdministrationForbidden(ctx, AdministrationForbiddenResponse{Session: true})

			return
		}

		if slices.Contains(ctx.Configuration.Administration.Users, userSession.Username) {
			next(ctx)

			return
		}

		if len(ctx.Configuration.Administration.Groups) == 0 {
			ctx.Logger.WithField("username", userSession.Username).Warn("Denied administrator control plane access due to missing administrator authorization")
			replyAdministrationForbidden(ctx, AdministrationForbiddenResponse{Authorization: true})

			return
		}

		details, err := ctx.Providers.UserProvider.GetDetails(userSession.Username)
		if err != nil {
			ctx.Logger.WithError(err).WithField("username", userSession.Username).Warn("Denied administrator control plane access due to user details lookup failure")
			replyAdministrationForbidden(ctx, AdministrationForbiddenResponse{UserDetails: true})

			return
		}

		if isAdministrationGroupMember(ctx.Configuration.Administration.Groups, details.Groups) {
			next(ctx)

			return
		}

		ctx.Logger.WithField("username", userSession.Username).Warn("Denied administrator control plane access due to missing administrator authorization")
		replyAdministrationForbidden(ctx, AdministrationForbiddenResponse{Authorization: true})
	}
}

func replyAdministrationForbidden(ctx *AutheliaCtx, data AdministrationForbiddenResponse) {
	if err := ctx.ReplyJSON(OKResponse{Status: "KO", Data: data}, fasthttp.StatusForbidden); err != nil {
		ctx.Logger.WithError(err).Error("Error occurred encoding JSON response during an administration authorization check.")
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
