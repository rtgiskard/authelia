// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/model"
	"github.com/authelia/authelia/v4/internal/session"
	"github.com/authelia/authelia/v4/internal/templates"
	"github.com/authelia/authelia/v4/internal/utils"
)

// ResetPasswordDELETE handler for deleting password reset JWT's.
func ResetPasswordDELETE(ctx *middlewares.AutheliaCtx) {
	var (
		issuerURL    *url.URL
		token        *jwt.Token
		verification *model.IdentityVerification
		claims       *model.IdentityVerificationClaim
		ok           bool
		err          error
	)

	body := &bodyRequestPasswordResetDELETE{}

	if err = ctx.ParseBody(body); err != nil {
		ctx.GetLogger().WithError(err).Error("Error occurred parsing reset password delete body")
		ctx.SetJSONError(messageOperationFailed)

		return
	}

	if issuerURL, err = ctx.IssuerURL(); err != nil {
		ctx.GetLogger().WithError(err).Error("Error occurred determining the issuer")
		ctx.SetJSONError(messageOperationFailed)

		return
	}

	token, err = jwt.ParseWithClaims(body.Token, &model.IdentityVerificationClaim{},
		func(token *jwt.Token) (any, error) {
			return []byte(ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret), nil
		},
		jwt.WithIssuedAt(),
		jwt.WithStrictDecoding(),
		jwt.WithIssuer(issuerURL.String()),
		jwt.WithValidMethods([]string{ctx.Configuration.IdentityValidation.ResetPassword.JWTAlgorithm}),
		ctx.GetClock().GetJWTWithTimeFuncOption(),
	)

	switch {
	case err == nil:
		break
	case errors.Is(err, jwt.ErrTokenMalformed):
		ctx.GetLogger().WithError(err).Error("Error occurred validating the identity verification token as it appears to be malformed, this potentially can occur if you've not copied the full link")
		ctx.SetJSONError(messageOperationFailed)

		return
	case errors.Is(err, jwt.ErrTokenExpired):
		ctx.GetLogger().WithError(err).Error("Error occurred validating the identity verification token validity period as it appears to be expired")
		ctx.SetJSONError(messageOperationFailed)

		return
	case errors.Is(err, jwt.ErrTokenNotValidYet):
		ctx.GetLogger().WithError(err).Error("Error occurred validating the identity verification token validity period as it appears to only be valid in the future")
		ctx.SetJSONError(messageOperationFailed)

		return
	case errors.Is(err, jwt.ErrTokenSignatureInvalid):
		ctx.GetLogger().WithError(err).Error("Error occurred validating the identity verification token signature")
		ctx.SetJSONError(messageOperationFailed)

		return
	default:
		ctx.GetLogger().WithError(err).Error("Error occurred validating the identity verification token")
		ctx.SetJSONError(messageOperationFailed)

		return
	}

	if claims, ok = token.Claims.(*model.IdentityVerificationClaim); !ok {
		ctx.GetLogger().WithError(fmt.Errorf("failed to map the %T claims to a *model.IdentityVerificationClaim", claims)).Error("Error occurred validating the identity verification token claims")
		ctx.SetJSONError(messageOperationFailed)

		return
	}

	if verification, err = claims.ToIdentityVerification(); err != nil {
		ctx.GetLogger().WithError(err).Error("Error occurred validating the identity verification token claims as they appear to be malformed")
		ctx.SetJSONError(messageOperationFailed)

		return
	}

	if verification.Action != ActionResetPassword {
		ctx.GetLogger().Errorf("Error occurred revoking the identity verification token, the token action '%s' does not match the endpoint action '%s' which is not allowed", claims.Action, ActionResetPassword)
		ctx.SetJSONError(messageOperationFailed)

		return
	}

	var full *model.IdentityVerification

	if full, err = ctx.Providers.StorageProvider.LoadIdentityVerification(ctx, verification.JTI.String()); err != nil {
		ctx.GetLogger().WithError(err).Error("Error occurred looking up identity verification during the revocation phase")
		ctx.SetJSONError(messageOperationFailed)

		return
	}

	if full.RevokedAt.Valid {
		ctx.GetLogger().Error("Error occurred revoking identity verification token as it's already revoked")
		ctx.SetJSONError(messageOperationFailed)

		return
	}

	if err = ctx.Providers.StorageProvider.RevokeIdentityVerification(ctx, verification.JTI.String(), model.NewNullIP(ctx.RemoteIP())); err != nil {
		ctx.GetLogger().WithError(err).Error("Error occurred revoking identity verification when attempting to save the revocation status to the database")
		ctx.SetJSONError(messageOperationFailed)

		return
	}

	ctx.ReplyOK()
}

// ResetPasswordPOST handler for resetting passwords.
func ResetPasswordPOST(ctx *middlewares.AutheliaCtx) {
	var requestBody resetPasswordStep2RequestBody
	if err := ctx.ParseBody(&requestBody); err != nil {
		ctx.GetLogger().WithError(err).Error("Error occurred parsing the reset password request body")
		ctx.SetJSONError(messageUnableToResetPassword)
		return
	}
	verification := middlewares.ValidateIdentityVerificationToken(ctx, requestBody.Token, middlewares.IdentityVerificationFinishArgs{ActionClaim: ActionResetPassword})
	if verification == nil {
		return
	}
	if strings.TrimSpace(requestBody.Password) == "" {
		ctx.SetJSONError(messagePasswordWeak)
		return
	}
	username := verification.Username
	if err := ctx.Providers.PasswordPolicy.Check(requestBody.Password); err != nil {
		ctx.GetLogger().WithError(err).Error("Error occurred checking the new password against the password policy")
		ctx.SetJSONError(messagePasswordWeak)
		return
	}

	store := ctx.Providers.StorageProvider
	tx, err := store.BeginTX(ctx)
	if err != nil {
		ctx.GetLogger().WithError(err).Error("Unable to start the password reset transaction")
		ctx.SetJSONError(messageUnableToResetPassword)
		return
	}
	committed := false
	defer func() {
		if !committed {
			if rollbackErr := store.Rollback(tx); rollbackErr != nil {
				ctx.GetLogger().WithError(rollbackErr).Error("Unable to roll back the password reset transaction")
			}
		}
	}()

	// The conditional update serializes concurrent uses of a link. Revoking the other links
	// in the same transaction also prevents already-open forms from resetting the password again.
	if err = store.ConsumeIdentityVerification(tx, verification.JTI.String(), model.NewNullIP(ctx.RemoteIP())); err != nil {
		ctx.GetLogger().WithError(err).Error("The password reset link is no longer available")
		ctx.SetJSONError(messageUnableToResetPassword)
		return
	}
	if err = store.RevokeIdentityVerifications(tx, username, ActionResetPassword, model.NewNullIP(ctx.RemoteIP())); err != nil {
		ctx.GetLogger().WithError(err).Error("Unable to revoke outstanding password reset links")
		ctx.SetJSONError(messageUnableToResetPassword)
		return
	}

	if err = ctx.Providers.UserProvider.UpdatePassword(username, requestBody.Password); err != nil {
		switch {
		case utils.IsStringInSliceContains(err.Error(), ldapPasswordComplexityCodes),
			utils.IsStringInSliceContains(err.Error(), ldapPasswordComplexityErrors):
			ctx.GetLogger().WithError(err).Error("Error occurred updating the user password as it does not meet the complexity requirements of the backend")
			ctx.SetJSONError(ldapPasswordComplexityCode)
		default:
			ctx.GetLogger().WithError(err).Error("Error occurred updating the user password")
			ctx.SetJSONError(messageUnableToResetPassword)
		}

		return
	}

	response := resetPasswordResponseBody{}
	defer func() {
		if response.ResetLinksRevocationError == "" {
			ctx.ReplyOK()
		} else if replyErr := ctx.SetJSONBody(response); replyErr != nil {
			ctx.GetLogger().WithError(replyErr).Error(errStrRespBody)
		}
	}()
	if err = store.Commit(tx); err != nil {
		ctx.GetLogger().WithError(err).Error("Unable to commit link revocation after the password was changed")
		response.ResetLinksRevocationError = "password was changed but outstanding reset links could not be invalidated"
	} else {
		committed = true
	}
	ctx.GetLogger().Debugf("Password of user %s has been reset", username)

	userInfo, err := ctx.Providers.UserProvider.GetDetails(username)
	if err != nil {
		ctx.GetLogger().WithError(err).WithFields(map[string]any{"username": username}).Error("Error occurred retrieving user details")

		return
	}

	if len(userInfo.Emails) == 0 {
		ctx.GetLogger().WithFields(map[string]any{"username": username}).Error("Error occurred retrieving user details: user has no email address configured")

		return
	}

	data := templates.EmailEventValues{
		Title:       "Password changed successfully",
		Language:    ctx.NotificationLanguage(),
		DisplayName: userInfo.DisplayName,
		RemoteIP:    ctx.RemoteIP().String(),
		Details: map[string]any{
			"Action": "Password Reset",
		},
		BodyPrefix: eventEmailActionPasswordModifyPrefix,
		BodyEvent:  eventEmailActionPasswordReset,
		BodySuffix: eventEmailActionPasswordModifySuffix,
	}

	addresses := userInfo.Addresses()

	ctx.GetLogger().Debugf("Sending an email to user %s (%s) to inform that the password has changed.",
		username, addresses[0].String())

	if err = ctx.SendNotification(addresses[0], "Password changed successfully", ctx.Providers.Templates.GetEventEmailTemplate(), data); err != nil {
		ctx.GetLogger().Error(err)

		return
	}
}

func identityRetrieverFromStorage(ctx *middlewares.AutheliaCtx) (*session.Identity, error) {
	var requestBody resetPasswordStep1RequestBody

	err := json.Unmarshal(ctx.PostBody(), &requestBody)
	if err != nil {
		return nil, err
	}

	details, err := ctx.Providers.UserProvider.GetDetailsForPasswordReset(requestBody.Username)
	if err != nil {
		return nil, err
	}

	if len(details.Emails) == 0 {
		return nil, fmt.Errorf("user %s has no email address configured", requestBody.Username)
	}

	return &session.Identity{
		Username:    details.Username,
		DisplayName: details.DisplayName,
		Email:       details.Emails[0],
	}, nil
}

// ResetPasswordIdentityStart is the handler for initiating the identity validation for resetting a password.
// We need to ensure the attacker cannot perform user enumeration by always replying with 200 whatever what happens in backend.
var ResetPasswordIdentityStart = middlewares.IdentityVerificationStart(middlewares.IdentityVerificationStartArgs{
	MailTitle:               "Reset your password",
	MailButtonContent:       "Reset",
	MailButtonRevokeContent: "Revoke",
	TargetEndpoint:          "/reset-password/step2",
	RevokeEndpoint:          "/revoke/reset-password",
	ActionClaim:             ActionResetPassword,
	IdentityRetrieverFunc:   identityRetrieverFromStorage,
}, middlewares.NewTimingAttackDelay(10, time.Millisecond*500))

// ResetPasswordIdentityFinish validates the link without consuming it. The password submission
// revalidates the token, so refreshes and new browsers do not require another email.
var ResetPasswordIdentityFinish = middlewares.IdentityVerificationFinish(
	middlewares.IdentityVerificationFinishArgs{ActionClaim: ActionResetPassword},
	func(ctx *middlewares.AutheliaCtx, _ string) { ctx.ReplyOK() },
)
