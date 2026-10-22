// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/authelia/authelia/v4/internal/model"
	"github.com/authelia/authelia/v4/internal/session"
	"github.com/authelia/authelia/v4/internal/templates"
)

// IdentityVerificationStart initiates identity verification without revealing whether an account exists.
func IdentityVerificationStart(args IdentityVerificationStartArgs, delayer Delayer) RequestHandler {
	if args.IdentityRetrieverFunc == nil {
		panic(fmt.Errorf("identity verification requires an identity retriever"))
	}

	return func(ctx *AutheliaCtx) {
		requestTime, success := time.Now(), false
		if delayer != nil {
			defer delayer.Delay(ctx, requestTime, &success)
		}

		identity, err := args.IdentityRetrieverFunc(ctx)
		if err != nil {
			ctx.GetLogger().Error(err)
			ctx.ReplyOK()
			return
		}

		if err = sendIdentityVerificationEmail(ctx, *identity, args, false, false); err != nil {
			ctx.GetLogger().WithError(err).Error("Error occurred sending the identity verification email")
			ctx.SetJSONError(messageOperationFailed)
			return
		}

		success = true
		ctx.ReplyOK()
	}
}

// SendPasswordResetEmail sends an administrator's invitation without changing the current password.
func SendPasswordResetEmail(ctx *AutheliaCtx, identity session.Identity, newAccount bool) error {
	return sendIdentityVerificationEmail(ctx, identity, IdentityVerificationStartArgs{
		MailTitle: "Reset your password", MailButtonContent: "Reset", MailButtonRevokeContent: "Revoke",
		TargetEndpoint: "/reset-password/step2", RevokeEndpoint: "/revoke/reset-password", ActionClaim: "ResetPassword",
	}, true, newAccount)
}

func sendIdentityVerificationEmail(ctx *AutheliaCtx, identity session.Identity, args IdentityVerificationStartArgs, administrator, newAccount bool) error {
	issuerURL, err := ctx.IssuerURL()
	if err != nil {
		return fmt.Errorf("determining issuer: %w", err)
	}

	jti, err := uuid.NewRandom()
	if err != nil {
		return fmt.Errorf("generating identity verification identifier: %w", err)
	}

	now := ctx.GetClock().Now()
	verification := model.IdentityVerification{
		JTI: jti, IssuedAt: now, ExpiresAt: now.Add(ctx.Configuration.IdentityValidation.ResetPassword.JWTExpiration),
		Username: identity.Username, Action: args.ActionClaim, IssuedIP: model.NewIP(ctx.RemoteIP()),
	}
	method := jwt.GetSigningMethod(ctx.Configuration.IdentityValidation.ResetPassword.JWTAlgorithm)
	if method == nil || (method.Alg() != "HS256" && method.Alg() != "HS384" && method.Alg() != "HS512") {
		return fmt.Errorf("unsupported identity verification signing algorithm")
	}

	signedToken, err := jwt.NewWithClaims(method, verification.ToIdentityVerificationClaim(issuerURL)).SignedString([]byte(ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret))
	if err != nil {
		return fmt.Errorf("signing identity verification: %w", err)
	}
	if err = ctx.Providers.StorageProvider.SaveIdentityVerification(ctx, verification); err != nil {
		return fmt.Errorf("saving identity verification: %w", err)
	}

	link := func(endpoint string) string {
		u := issuerURL.JoinPath(endpoint)
		query := u.Query()
		query.Set(queryArgToken, signedToken)
		u.RawQuery = query.Encode()
		return u.String()
	}
	domain, _ := ctx.GetCookieDomain()
	data := templates.EmailIdentityVerificationJWTValues{
		Title: args.MailTitle, LinkURL: link(args.TargetEndpoint), LinkText: args.MailButtonContent,
		RevocationLinkURL: link(args.RevokeEndpoint), RevocationLinkText: args.MailButtonRevokeContent,
		DisplayName: identity.DisplayName, Domain: domain, RemoteIP: ctx.RemoteIP().String(),
		ExpiresAt: verification.ExpiresAt, Administrator: administrator, NewAccount: newAccount,
	}

	return ctx.SendNotification(identity.Address(), args.MailTitle, ctx.Providers.Templates.GetIdentityVerificationJWTEmailTemplate(), data)
}

// IdentityVerificationFinish validates a link without consuming it or granting a session authorization.
func IdentityVerificationFinish(args IdentityVerificationFinishArgs, next func(ctx *AutheliaCtx, username string)) RequestHandler {
	return func(ctx *AutheliaCtx) {
		var body IdentityVerificationFinishBody
		if err := json.Unmarshal(ctx.PostBody(), &body); err != nil {
			ctx.GetLogger().WithError(err).Error("Error occurred parsing the identity verification request")
			ctx.SetJSONError(messageOperationFailed)
			return
		}
		if verification := ValidateIdentityVerificationToken(ctx, body.Token, args); verification != nil {
			next(ctx, verification.Username)
		}
	}
}

// ValidateIdentityVerificationToken checks a signed, unexpired, active verification token.
// A failed check writes the error response. Opening a link never consumes its authorization.
func ValidateIdentityVerificationToken(ctx *AutheliaCtx, value string, args IdentityVerificationFinishArgs) *model.IdentityVerification {
	if value == "" {
		ctx.GetLogger().Error("No token was provided for identity verification")
		ctx.SetJSONError(messageOperationFailed)
		return nil
	}
	issuerURL, err := ctx.IssuerURL()
	if err != nil {
		ctx.GetLogger().WithError(err).Error("Error occurred determining the issuer")
		ctx.SetJSONError(messageOperationFailed)
		return nil
	}

	claims := &model.IdentityVerificationClaim{}
	_, err = jwt.ParseWithClaims(value, claims,
		func(*jwt.Token) (any, error) {
			return []byte(ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret), nil
		},
		jwt.WithIssuedAt(), jwt.WithExpirationRequired(), jwt.WithStrictDecoding(), jwt.WithIssuer(issuerURL.String()),
		jwt.WithValidMethods([]string{ctx.Configuration.IdentityValidation.ResetPassword.JWTAlgorithm}),
		ctx.GetClock().GetJWTWithTimeFuncOption(),
	)
	if err != nil {
		message := messageOperationFailed
		switch {
		case errors.Is(err, jwt.ErrTokenExpired):
			message = messageIdentityVerificationTokenHasExpired
		case errors.Is(err, jwt.ErrTokenNotValidYet):
			message = messageIdentityVerificationTokenNotValidYet
		case errors.Is(err, jwt.ErrTokenSignatureInvalid):
			message = messageIdentityVerificationTokenSig
		}
		ctx.GetLogger().WithError(err).Error("Error occurred validating the identity verification token")
		ctx.SetJSONError(message)
		return nil
	}
	verification, err := claims.ToIdentityVerification()
	if err != nil || verification.Username == "" || verification.Action != args.ActionClaim {
		ctx.GetLogger().WithError(err).Error("Invalid identity verification claims")
		ctx.SetJSONError(messageOperationFailed)
		return nil
	}
	if args.IsTokenUserValidFunc != nil && !args.IsTokenUserValidFunc(ctx, verification.Username) {
		ctx.SetJSONError(messageOperationFailed)
		return nil
	}
	found, err := ctx.Providers.StorageProvider.FindIdentityVerification(ctx, verification.JTI.String())
	if err != nil || !found {
		ctx.GetLogger().WithError(err).Error("Identity verification is no longer available")
		ctx.SetJSONError(messageIdentityVerificationTokenAlreadyUsed)
		return nil
	}
	return verification
}
