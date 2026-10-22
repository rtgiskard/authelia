// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares_test

import (
	"fmt"
	"net/mail"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"github.com/valyala/fasthttp"
	"go.uber.org/mock/gomock"

	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/mocks"
	"github.com/authelia/authelia/v4/internal/model"
	"github.com/authelia/authelia/v4/internal/session"
)

const testJWTSecret = "abc"

func newArgs(retriever func(ctx *middlewares.AutheliaCtx) (*session.Identity, error)) middlewares.IdentityVerificationStartArgs {
	return middlewares.IdentityVerificationStartArgs{
		ActionClaim:           "Claim",
		MailButtonContent:     "Register",
		MailTitle:             "Title",
		TargetEndpoint:        "/target",
		IdentityRetrieverFunc: retriever,
	}
}

func defaultRetriever(ctx *middlewares.AutheliaCtx) (*session.Identity, error) {
	return &session.Identity{
		Username: "john",
		Email:    "john@example.com",
	}, nil
}

func TestIdentityVerificationStart_ShouldPanic(t *testing.T) {
	assert.PanicsWithError(t, "identity verification requires an identity retriever", func() {
		middlewares.IdentityVerificationStart(newArgs(nil), nil)
	})
}

func TestShouldFailStartingProcessIfUserHasNoEmailAddress(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)
	defer mock.Close()

	retriever := func(ctx *middlewares.AutheliaCtx) (*session.Identity, error) {
		return nil, fmt.Errorf("User does not have any email")
	}

	middlewares.IdentityVerificationStart(newArgs(retriever), nil)(mock.Ctx)

	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
}

func TestShouldFailIfJWTCannotBeSaved(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)
	defer mock.Close()

	mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret = testJWTSecret
	mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTAlgorithm = "HS256"

	mock.StorageMock.EXPECT().
		SaveIdentityVerification(mock.Ctx, gomock.Any()).
		Return(fmt.Errorf("cannot save"))

	args := newArgs(defaultRetriever)
	middlewares.IdentityVerificationStart(args, middlewares.NewTimingAttackDelay(10, time.Millisecond*10))(mock.Ctx)

	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"status":"KO"`)
}

func TestShouldFailSendingAnEmail(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)
	defer mock.Close()

	mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret = testJWTSecret
	mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTAlgorithm = "HS512"
	mock.Ctx.Request.Header.Add(fasthttp.HeaderXForwardedProto, "http")
	mock.Ctx.Request.Header.Add(fasthttp.HeaderXForwardedHost, "host")

	mock.StorageMock.EXPECT().
		SaveIdentityVerification(mock.Ctx, gomock.Any()).
		Return(nil)

	mock.NotifierMock.EXPECT().
		Send(gomock.Eq(mock.Ctx), gomock.Eq(mail.Address{Address: "john@example.com"}), gomock.Eq("Title"), gomock.Any(), gomock.Any()).
		Return(fmt.Errorf("no notif"))

	args := newArgs(defaultRetriever)
	middlewares.IdentityVerificationStart(args, nil)(mock.Ctx)

	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"status":"KO"`)
}

// Test Finish process.
type IdentityVerificationFinishProcess struct {
	suite.Suite

	mock *mocks.MockAutheliaCtx
}

func (s *IdentityVerificationFinishProcess) SetupTest() {
	s.mock = mocks.NewMockAutheliaCtx(s.T())

	s.mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret = testJWTSecret
}

func (s *IdentityVerificationFinishProcess) TearDownTest() {
	s.mock.Close()
}

func createToken(t *testing.T, ctx *mocks.MockAutheliaCtx, username, action string, expiresAt time.Time) (data string, verification model.IdentityVerification) {
	t.Helper()

	verification = model.NewIdentityVerification(uuid.New(), username, action, ctx.Ctx.RemoteIP(), time.Minute*5)

	verification.ExpiresAt = expiresAt

	issuerURL, err := ctx.Ctx.IssuerURL()
	require.NoError(t, err)

	claims := verification.ToIdentityVerificationClaim(issuerURL)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	ss, _ := token.SignedString([]byte(ctx.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret))

	return ss, verification
}

func next(ctx *middlewares.AutheliaCtx, username string) {}

func newFinishArgs() middlewares.IdentityVerificationFinishArgs {
	return middlewares.IdentityVerificationFinishArgs{
		ActionClaim:          "EXP_ACTION",
		IsTokenUserValidFunc: func(ctx *middlewares.AutheliaCtx, username string) bool { return true },
	}
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfJSONBodyIsMalformed() {
	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "Operation failed")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfTokenIsNotProvided() {
	s.mock.Ctx.Request.SetBodyString("{}")
	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "Operation failed")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfTokenIsNotFoundInDB() {
	token, verification := createToken(s.T(), s.mock, "john", "EXP_ACTION",
		time.Now().Add(1*time.Minute))

	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", token))

	s.mock.StorageMock.EXPECT().
		FindIdentityVerification(s.mock.Ctx, gomock.Eq(verification.JTI.String())).
		Return(false, nil)

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "The identity verification token has already been used")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfTokenIsInvalid() {
	s.mock.Ctx.Request.SetBodyString("{\"token\":\"abc\"}")

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "Operation failed")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfTokenExpired() {
	args := newArgs(defaultRetriever)
	token, _ := createToken(s.T(), s.mock, "john", args.ActionClaim,
		time.Now().Add(-1*time.Minute))
	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", token))

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "The identity verification token has expired")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailForWrongAction() {
	token, _ := createToken(s.T(), s.mock, "john", "WrongAction",
		time.Now().Add(1*time.Minute))
	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", token))

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "Operation failed")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailForWrongUser() {
	token, _ := createToken(s.T(), s.mock, "harry", "EXP_ACTION",
		time.Now().Add(1*time.Minute))
	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", token))

	args := newFinishArgs()
	args.IsTokenUserValidFunc = func(ctx *middlewares.AutheliaCtx, username string) bool { return false }
	middlewares.IdentityVerificationFinish(args, next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "Operation failed")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfIssuerCannotBeDetermined() {
	s.mock.Ctx.Request.Header.Del(fasthttp.HeaderXForwardedHost)
	s.mock.Ctx.Request.SetBodyString("{\"token\":\"abc\"}")

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "Operation failed")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfTokenIsNotValidYet() {
	claims := createClaims(s.T(), s.mock, uuid.New(), time.Now().Add(1*time.Minute))
	claims.NotBefore = jwt.NewNumericDate(time.Now().Add(1 * time.Minute))

	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", createTokenFromClaims(s.T(), claims, jwt.SigningMethodHS256, testJWTSecret)))

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "The identity verification token is only valid in the future")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfTokenSignatureIsInvalid() {
	claims := createClaims(s.T(), s.mock, uuid.New(), time.Now().Add(1*time.Minute))

	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", createTokenFromClaims(s.T(), claims, jwt.SigningMethodHS256, "not-the-configured-secret")))

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "The identity verification token has an invalid signature")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfTokenSigningAlgorithmIsNotConfigured() {
	claims := createClaims(s.T(), s.mock, uuid.New(), time.Now().Add(1*time.Minute))

	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", createTokenFromClaims(s.T(), claims, jwt.SigningMethodHS512, testJWTSecret)))

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "The identity verification token has an invalid signature")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfTokenIssuerIsInvalid() {
	claims := createClaims(s.T(), s.mock, uuid.New(), time.Now().Add(1*time.Minute))
	claims.Issuer = "https://auth.notexample.com"

	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", createTokenFromClaims(s.T(), claims, jwt.SigningMethodHS256, testJWTSecret)))

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "Operation failed")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfTokenClaimsAreMalformed() {
	claims := createClaims(s.T(), s.mock, uuid.New(), time.Now().Add(1*time.Minute))
	claims.ID = "not-a-uuid"

	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", createTokenFromClaims(s.T(), claims, jwt.SigningMethodHS256, testJWTSecret)))

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	s.mock.Assert200KO(s.T(), "Operation failed")
}

func (s *IdentityVerificationFinishProcess) TestShouldFailIfLookupErrors() {
	token, verification := createToken(s.T(), s.mock, "john", "EXP_ACTION",
		time.Now().Add(1*time.Minute))
	s.mock.Ctx.Request.SetBodyString(fmt.Sprintf("{\"token\":\"%s\"}", token))

	s.mock.StorageMock.EXPECT().
		FindIdentityVerification(s.mock.Ctx, gomock.Eq(verification.JTI.String())).
		Return(false, fmt.Errorf("failed to lookup"))

	middlewares.IdentityVerificationFinish(newFinishArgs(), next)(s.mock.Ctx)

	assert.Contains(s.T(), string(s.mock.Ctx.Response.Body()), `"status":"KO"`)
}

func TestRunIdentityVerificationFinish(t *testing.T) {
	s := new(IdentityVerificationFinishProcess)
	suite.Run(t, s)
}

func createClaims(t *testing.T, ctx *mocks.MockAutheliaCtx, jti uuid.UUID, expiresAt time.Time) (claims *model.IdentityVerificationClaim) {
	t.Helper()

	issuerURL, err := ctx.Ctx.IssuerURL()
	require.NoError(t, err)

	verification := model.NewIdentityVerification(jti, "john", "EXP_ACTION", ctx.Ctx.RemoteIP(), time.Minute*5)

	verification.ExpiresAt = expiresAt

	return verification.ToIdentityVerificationClaim(issuerURL)
}

func createTokenFromClaims(t *testing.T, claims *model.IdentityVerificationClaim, method jwt.SigningMethod, secret string) (data string) {
	t.Helper()

	data, err := jwt.NewWithClaims(method, claims).SignedString([]byte(secret))
	require.NoError(t, err)

	return data
}
