package handlers

import (
	"encoding/json"
	"regexp"
	"testing"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/configuration/schema"
	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/mocks"
)

func TestAdminUsersPOST_ShouldSucceed(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})

	body := adminCreateUserRequestBody{
		Username:    " john ",
		Password:    testPasswordNew,
		DisplayName: " John Doe ",
		Email:       " john@example.com ",
		Groups:      []string{" admins ", "", " users "},
	}

	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	mock.Ctx.Request.SetBody(bodyBytes)

	mock.UserProviderMock.EXPECT().
		CreateUser(authentication.UserDetailsCreate{
			Username:    "john",
			Password:    testPasswordNew,
			DisplayName: "John Doe",
			Email:       "john@example.com",
			Groups:      []string{"admins", "users"},
		}).
		Return(nil)

	AdminUsersPOST(mock.Ctx)

	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
}

func TestAdminUsersPOST_ShouldFailWhenPasswordPolicyNotMet(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{
		Standard: schema.PasswordPolicyStandard{
			Enabled:   true,
			MinLength: 12,
		},
	})

	body := adminCreateUserRequestBody{
		Username:    "john",
		Password:    "weak",
		DisplayName: "John Doe",
	}

	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	mock.Ctx.Request.SetBody(bodyBytes)

	AdminUsersPOST(mock.Ctx)

	errResponse := mock.GetResponseError(t)
	assert.Equal(t, fasthttp.StatusBadRequest, mock.Ctx.Response.StatusCode())
	assert.Equal(t, "KO", errResponse.Status)
	assert.Equal(t, messagePasswordWeak, errResponse.Message)
}

func TestAdminUsersPOST_ShouldFailWhenUserAlreadyExists(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})

	body := adminCreateUserRequestBody{
		Username:    "john",
		Password:    testPasswordNew,
		DisplayName: "John Doe",
	}

	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	mock.Ctx.Request.SetBody(bodyBytes)

	mock.UserProviderMock.EXPECT().
		CreateUser(authentication.UserDetailsCreate{
			Username:    "john",
			Password:    testPasswordNew,
			DisplayName: "John Doe",
			Groups:      []string{},
		}).
		Return(authentication.ErrUserAlreadyExists)

	AdminUsersPOST(mock.Ctx)

	errResponse := mock.GetResponseError(t)
	assert.Equal(t, fasthttp.StatusConflict, mock.Ctx.Response.StatusCode())
	assert.Equal(t, "KO", errResponse.Status)
	assert.Equal(t, messageUserAlreadyExists, errResponse.Message)
}

func TestAdminUsersPOST_ShouldFailWhenRequestBodyIsInvalid(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Request.SetBody([]byte(`{invalid json`))

	AdminUsersPOST(mock.Ctx)

	errResponse := mock.GetResponseError(t)
	assert.Equal(t, fasthttp.StatusBadRequest, mock.Ctx.Response.StatusCode())
	assert.Equal(t, "KO", errResponse.Status)
	assert.Equal(t, messageUnableToCreateUser, errResponse.Message)
	mock.AssertLogEntryAdvanced(t, 0, logrus.ErrorLevel, regexp.MustCompile(`^unable to parse body: .+`), map[string]any{})
}
