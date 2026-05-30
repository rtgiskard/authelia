package handlers

import (
	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/middlewares"
)

// AdminUsersPOST is the administrator user creation endpoint skeleton.
func AdminUsersPOST(ctx *middlewares.AutheliaCtx) {
	ctx.ReplyStatusCode(fasthttp.StatusNotImplemented)
}
