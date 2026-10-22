// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package handlers

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"path/filepath"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"go.uber.org/mock/gomock"

	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/configuration/schema"
	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/mocks"
	"github.com/authelia/authelia/v4/internal/model"
	"github.com/authelia/authelia/v4/internal/session"
	"github.com/authelia/authelia/v4/internal/storage"
)

func TestResetPasswordDELETE(t *testing.T) {
	jti := uuid.Must(uuid.Parse("01020304-0506-4722-8910-111213141500"))

	testCases := []struct {
		name           string
		setup          func(t *testing.T, mock *mocks.MockAutheliaCtx)
		expected       string
		expectedStatus int
		expectedf      func(t *testing.T, mock *mocks.MockAutheliaCtx)
	}{
		{
			"ShouldHandleBodyParseError",
			nil,
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred parsing reset password delete body", "unable to parse body: unexpected end of JSON input")
			},
		},
		{
			"ShouldHandleIssuerError",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				mock.Ctx.Request.Header.Del(fasthttp.HeaderXForwardedHost)
				mock.Ctx.Request.SetBodyString(`{"token":"abc"}`)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred determining the issuer", "missing required X-Forwarded-Host header")
			},
		},
		{
			"ShouldHandleMalformedToken",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				mock.Ctx.Request.SetBodyString(`{"token":"abc"}`)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred validating the identity verification token as it appears to be malformed, this potentially can occur if you've not copied the full link", "token is malformed: token contains an invalid number of segments")
			},
		},
		{
			"ShouldHandleExpiredToken",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)
				claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute))

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, testJWTSecret)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred validating the identity verification token validity period as it appears to be expired", "token has invalid claims: token is expired")
			},
		},
		{
			"ShouldHandleTokenNotValidYet",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)
				claims.NotBefore = jwt.NewNumericDate(time.Now().Add(time.Minute))

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, testJWTSecret)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred validating the identity verification token validity period as it appears to only be valid in the future", "token has invalid claims: token is not valid yet")
			},
		},
		{
			"ShouldHandleInvalidSignature",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, "not-the-configured-secret")
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred validating the identity verification token signature", "token signature is invalid: signature is invalid")
			},
		},
		{
			"ShouldHandleInvalidSigningAlgorithm",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS512, testJWTSecret)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred validating the identity verification token signature", "token signature is invalid: signing method HS512 is invalid")
			},
		},
		{
			"ShouldHandleInvalidIssuerClaim",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)
				claims.Issuer = "https://auth.notexample.com"

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, testJWTSecret)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred validating the identity verification token", "token has invalid claims: token has invalid issuer")
			},
		},
		{
			"ShouldHandleMalformedClaims",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)
				claims.ID = "not-a-uuid"

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, testJWTSecret)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred validating the identity verification token claims as they appear to be malformed", "invalid UUID length: 10")
			},
		},
		{
			"ShouldHandleMismatchedAction",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, "OtherAction")

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, testJWTSecret)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred revoking the identity verification token, the token action 'OtherAction' does not match the endpoint action 'ResetPassword' which is not allowed", nil)
			},
		},
		{
			"ShouldHandleStorageLoadError",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, testJWTSecret)

				mock.StorageMock.
					EXPECT().
					LoadIdentityVerification(mock.Ctx, jti.String()).
					Return(nil, fmt.Errorf("failed to load"))
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred looking up identity verification during the revocation phase", "failed to load")
			},
		},
		{
			"ShouldHandleAlreadyRevoked",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, testJWTSecret)

				mock.StorageMock.
					EXPECT().
					LoadIdentityVerification(mock.Ctx, jti.String()).
					Return(&model.IdentityVerification{
						JTI:       jti,
						Username:  testUsername,
						Action:    ActionResetPassword,
						RevokedAt: sql.NullTime{Valid: true, Time: time.Now()},
					}, nil)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred revoking identity verification token as it's already revoked", nil)
			},
		},
		{
			"ShouldHandleStorageRevokeError",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, testJWTSecret)

				gomock.InOrder(
					mock.StorageMock.
						EXPECT().
						LoadIdentityVerification(mock.Ctx, jti.String()).
						Return(&model.IdentityVerification{JTI: jti, Username: testUsername, Action: ActionResetPassword}, nil),
					mock.StorageMock.
						EXPECT().
						RevokeIdentityVerification(mock.Ctx, jti.String(), model.NewNullIP(net.ParseIP("0.0.0.0"))).
						Return(fmt.Errorf("failed to revoke")),
				)
			},
			`{"status":"KO","message":"Operation failed."}`,
			fasthttp.StatusOK,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				AssertLogEntryMessageAndError(t, mock.Hook.LastEntry(), "Error occurred revoking identity verification when attempting to save the revocation status to the database", "failed to revoke")
			},
		},
		{
			"ShouldHandleValidToken",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				claims := newTestIdentityVerificationClaim(t, mock, jti, ActionResetPassword)

				setTestIdentityVerificationTokenBody(t, mock, claims, jwt.SigningMethodHS256, testJWTSecret)

				gomock.InOrder(
					mock.StorageMock.
						EXPECT().
						LoadIdentityVerification(mock.Ctx, jti.String()).
						Return(&model.IdentityVerification{JTI: jti, Username: testUsername, Action: ActionResetPassword}, nil),
					mock.StorageMock.
						EXPECT().
						RevokeIdentityVerification(mock.Ctx, jti.String(), model.NewNullIP(net.ParseIP("0.0.0.0"))).
						Return(nil),
				)
			},
			`{"status":"OK"}`,
			fasthttp.StatusOK,
			nil,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)

			defer mock.Close()

			mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret = testJWTSecret
			mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTAlgorithm = "HS256"

			if tc.setup != nil {
				tc.setup(t, mock)
			}

			ResetPasswordDELETE(mock.Ctx)

			assert.Equal(t, tc.expectedStatus, mock.Ctx.Response.StatusCode())
			assert.Equal(t, tc.expected, string(mock.Ctx.Response.Body()))

			if tc.expectedf != nil {
				tc.expectedf(t, mock)
			}
		})
	}
}

func TestResetPasswordPOST_LinkLifecycle(t *testing.T) {
	mock, store := newTestPasswordResetFlow(t)
	token, verification := issueTestPasswordResetLink(t, mock, store)
	otherToken, other := issueTestPasswordResetLink(t, mock, store)

	for range 2 {
		mock.Ctx.Response.Reset()
		mock.Ctx.Request.SetBodyString(fmt.Sprintf(`{"token":%q}`, token))
		ResetPasswordIdentityFinish(mock.Ctx)
		assert.JSONEq(t, `{"status":"OK"}`, string(mock.Ctx.Response.Body()))
	}
	record, err := store.LoadIdentityVerification(context.Background(), verification.JTI.String())
	require.NoError(t, err)
	assert.False(t, record.ConsumedAt.Valid)

	mock.Ctx.Response.Reset()
	mock.Ctx.Request.SetBodyString(fmt.Sprintf(`{"token":%q,"password":"short"}`, token))
	ResetPasswordPOST(mock.Ctx)
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"status":"KO"`)
	active, err := store.FindIdentityVerification(context.Background(), verification.JTI.String())
	require.NoError(t, err)
	assert.True(t, active, "password policy rejection must preserve the link")

	mock.UserProviderMock.EXPECT().UpdatePassword(testUsername, "password123").Return(nil)
	mock.UserProviderMock.EXPECT().GetDetails(testUsername).Return(&authentication.UserDetails{Username: testUsername}, nil)
	mock.Ctx.Response.Reset()
	mock.Ctx.Request.SetBodyString(fmt.Sprintf(`{"token":%q,"password":"password123"}`, token))
	ResetPasswordPOST(mock.Ctx)
	assert.JSONEq(t, `{"status":"OK"}`, string(mock.Ctx.Response.Body()))
	used, err := store.LoadIdentityVerification(context.Background(), verification.JTI.String())
	require.NoError(t, err)
	assert.True(t, used.ConsumedAt.Valid)
	revoked, err := store.LoadIdentityVerification(context.Background(), other.JTI.String())
	require.NoError(t, err)
	assert.True(t, revoked.RevokedAt.Valid)

	for _, old := range []string{token, otherToken} {
		mock.Ctx.Response.Reset()
		mock.Ctx.Request.SetBodyString(fmt.Sprintf(`{"token":%q,"password":"different-password"}`, old))
		ResetPasswordPOST(mock.Ctx)
		assert.Contains(t, string(mock.Ctx.Response.Body()), `"status":"KO"`)
	}
}

func TestResetPasswordPOST_BackendRejectionPreservesLinks(t *testing.T) {
	for _, backendErr := range []error{fmt.Errorf("LDAP Result Code 19: Password fails quality checking policy"), fmt.Errorf("backend unavailable")} {
		t.Run(backendErr.Error(), func(t *testing.T) {
			mock, store := newTestPasswordResetFlow(t)
			token, verification := issueTestPasswordResetLink(t, mock, store)
			_, other := issueTestPasswordResetLink(t, mock, store)
			mock.UserProviderMock.EXPECT().UpdatePassword(testUsername, "password123").Return(backendErr)
			mock.Ctx.Request.SetBodyString(fmt.Sprintf(`{"token":%q,"password":"password123"}`, token))
			ResetPasswordPOST(mock.Ctx)
			assert.Contains(t, string(mock.Ctx.Response.Body()), `"status":"KO"`)
			for _, link := range []model.IdentityVerification{verification, other} {
				active, err := store.FindIdentityVerification(context.Background(), link.JTI.String())
				require.NoError(t, err)
				assert.True(t, active, "a failed password update must not consume or revoke links")
			}
		})
	}
}

func TestResetPasswordPOST_RejectsInvalidAuthorization(t *testing.T) {
	for _, mode := range []string{"missing", "expired", "revoked", "wrong-action", "wrong-signature", "missing-expiry"} {
		t.Run(mode, func(t *testing.T) {
			mock, store := newTestPasswordResetFlow(t)
			token, verification := issueTestPasswordResetLink(t, mock, store)
			issuer, err := mock.Ctx.IssuerURL()
			require.NoError(t, err)
			claims := verification.ToIdentityVerificationClaim(issuer)
			secret := testJWTSecret
			switch mode {
			case "missing":
				token = ""
			case "expired":
				claims.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Minute))
			case "revoked":
				require.NoError(t, store.RevokeIdentityVerification(context.Background(), verification.JTI.String(), model.NullIP{}))
			case "wrong-action":
				claims.Action = "OtherAction"
			case "wrong-signature":
				secret = "a-different-secret"
			case "missing-expiry":
				claims.ExpiresAt = nil
			}
			if mode != "missing" {
				token, err = jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
				require.NoError(t, err)
			}
			mock.Ctx.Request.SetBodyString(fmt.Sprintf(`{"token":%q,"password":"password123"}`, token))
			ResetPasswordPOST(mock.Ctx)
			assert.Contains(t, string(mock.Ctx.Response.Body()), `"status":"KO"`)
		})
	}
}

func newTestPasswordResetFlow(t *testing.T) (*mocks.MockAutheliaCtx, *storage.SQLiteProvider) {
	t.Helper()
	mock := mocks.NewMockAutheliaCtx(t)
	t.Cleanup(mock.Close)
	mock.Ctx.RequestCtx.Init(&fasthttp.Request{}, nil, nil)
	mock.Ctx.Request.Header.Set("X-Forwarded-Proto", "https")
	mock.Ctx.Request.Header.Set("X-Forwarded-Host", "login.example.com:8080")
	mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret = testJWTSecret
	mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTAlgorithm = "HS256"
	mock.Ctx.Configuration.Storage.Local = &schema.StorageLocal{Path: filepath.Join(t.TempDir(), "reset.sqlite3")}
	mock.Ctx.Configuration.Storage.EncryptionKey = "test-password-reset-storage-encryption-key"
	store, err := storage.NewSQLiteProvider(&mock.Ctx.Configuration)
	require.NoError(t, err)
	require.NoError(t, store.StartupCheck())
	t.Cleanup(func() { require.NoError(t, store.Close()) })
	mock.Ctx.Providers.StorageProvider = store
	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{Standard: schema.PasswordPolicyStandard{Enabled: true, MinLength: 8}})
	return mock, store
}

func issueTestPasswordResetLink(t *testing.T, mock *mocks.MockAutheliaCtx, store *storage.SQLiteProvider) (string, model.IdentityVerification) {
	t.Helper()
	verification := model.NewIdentityVerification(uuid.New(), testUsername, ActionResetPassword, net.ParseIP("192.0.2.1"), 30*time.Minute)
	require.NoError(t, store.SaveIdentityVerification(context.Background(), verification))
	issuer, err := mock.Ctx.IssuerURL()
	require.NoError(t, err)
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, verification.ToIdentityVerificationClaim(issuer)).SignedString([]byte(testJWTSecret))
	require.NoError(t, err)
	return token, verification
}

func TestIdentityRetrieverFromStorage(t *testing.T) {
	testCases := []struct {
		name     string
		setup    func(t *testing.T, mock *mocks.MockAutheliaCtx)
		expected *session.Identity
		err      string
	}{
		{
			"ShouldHandleBodyParseError",
			nil,
			nil,
			"unexpected end of JSON input",
		},
		{
			"ShouldHandleUserProviderError",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				mock.Ctx.Request.SetBodyString(`{"username":"john"}`)

				mock.UserProviderMock.
					EXPECT().
					GetDetails(testUsername).
					Return(nil, fmt.Errorf("failed to get details"))
			},
			nil,
			"failed to get details",
		},
		{
			"ShouldHandleUserWithoutEmail",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				mock.Ctx.Request.SetBodyString(`{"username":"john"}`)

				mock.UserProviderMock.
					EXPECT().
					GetDetails(testUsername).
					Return(&authentication.UserDetails{Username: testUsername, DisplayName: testDisplayName}, nil)
			},
			nil,
			"user john has no email address configured",
		},
		{
			"ShouldReturnIdentity",
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				mock.Ctx.Request.SetBodyString(`{"username":"john"}`)

				mock.UserProviderMock.
					EXPECT().
					GetDetails(testUsername).
					Return(&authentication.UserDetails{Username: testUsername, DisplayName: testDisplayName, Emails: []string{testEmail}}, nil)
			},
			&session.Identity{Username: testUsername, DisplayName: testDisplayName, Email: testEmail},
			"",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)

			defer mock.Close()

			if tc.setup != nil {
				tc.setup(t, mock)
			}

			identity, err := identityRetrieverFromStorage(mock.Ctx)

			if tc.err == "" {
				require.NoError(t, err)
				assert.Equal(t, tc.expected, identity)
			} else {
				assert.EqualError(t, err, tc.err)
				assert.Nil(t, identity)
			}
		})
	}
}

func newTestIdentityVerificationClaim(t *testing.T, mock *mocks.MockAutheliaCtx, jti uuid.UUID, action string) *model.IdentityVerificationClaim {
	t.Helper()

	var (
		issuerURL *url.URL
		err       error
	)

	issuerURL, err = mock.Ctx.IssuerURL()

	require.NoError(t, err)

	verification := model.NewIdentityVerification(jti, testUsername, action, mock.Ctx.RemoteIP(), time.Minute*5)

	return verification.ToIdentityVerificationClaim(issuerURL)
}

func setTestIdentityVerificationTokenBody(t *testing.T, mock *mocks.MockAutheliaCtx, claims *model.IdentityVerificationClaim, method jwt.SigningMethod, secret string) {
	t.Helper()

	signed, err := jwt.NewWithClaims(method, claims).SignedString([]byte(secret))

	require.NoError(t, err)

	mock.Ctx.Request.SetBodyString(fmt.Sprintf(`{"token":"%s"}`, signed))
}
