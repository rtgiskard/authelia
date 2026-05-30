package handlers

import (
	"errors"
	"strings"

	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/middlewares"
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

	err := ctx.GetUserProvider().CreateUser(authentication.UserDetailsCreate{
		Username:    strings.TrimSpace(body.Username),
		Password:    body.Password,
		DisplayName: strings.TrimSpace(body.DisplayName),
		Email:       strings.TrimSpace(body.Email),
		Groups:      groups,
		Disabled:    body.Disabled,
	})

	switch {
	case err == nil:
		ctx.ReplyOK()
	case errors.Is(err, authentication.ErrUserAlreadyExists):
		ctx.SetJSONError(messageUserAlreadyExists)
		ctx.SetStatusCode(fasthttp.StatusConflict)
	default:
		ctx.Error(err, messageUnableToCreateUser)
		ctx.SetStatusCode(fasthttp.StatusBadRequest)
	}
}
