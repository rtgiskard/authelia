package handlers

import (
	"encoding/json"
	"net/mail"
	"regexp"
	"testing"

	"github.com/sirupsen/logrus"
	"github.com/stretchr/testify/assert"
	"github.com/valyala/fasthttp"
	"go.uber.org/mock/gomock"

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
	mock.NotifierMock.EXPECT().Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, "User created successfully", gomock.Any(), gomock.Any()).Return(nil)

	AdminUsersPOST(mock.Ctx)

	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_sent":true`)
}

func TestAdminUsersPOST_ShouldSucceedWithoutEmailNotificationWhenBlank(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})

	body := adminCreateUserRequestBody{Username: "john", Password: testPasswordNew, DisplayName: "John Doe"}
	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	mock.Ctx.Request.SetBody(bodyBytes)

	mock.UserProviderMock.EXPECT().CreateUser(authentication.UserDetailsCreate{Username: "john", Password: testPasswordNew, DisplayName: "John Doe", Groups: []string{}}).Return(nil)

	AdminUsersPOST(mock.Ctx)

	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_sent":false`)
	assert.Contains(t, string(mock.Ctx.Response.Body()), `user has no email address configured`)
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

func TestAdminUsersPOST_ShouldReturnUnsupported(t *testing.T) {
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
		Return(authentication.ErrUnsupportedOperation)

	AdminUsersPOST(mock.Ctx)

	mock.AssertKO(t, messageProviderOperationUnsupported, fasthttp.StatusNotImplemented)
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

func TestAdminUserCapabilitiesGET_ShouldSucceed(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	capabilities := authentication.UserProviderAdminCapabilities{Create: true, List: true, Read: true, Update: true, ResetPassword: true}
	mock.UserProviderMock.EXPECT().AdminCapabilities().Return(capabilities)

	AdminUserCapabilitiesGET(mock.Ctx)

	mock.Assert200OK(t, capabilities)
}

func TestAdminUsersGET_ShouldSucceed(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.QueryArgs().Set("search", "john")

	result := authentication.UserProviderAdminListResult{Users: []authentication.UserProviderAdminUserDetails{{Username: "john", DisplayName: "John Doe"}}, Total: 1}
	mock.UserProviderMock.EXPECT().AdminListUsers(authentication.UserProviderAdminListFilter{Search: "john"}).Return(result, nil)

	AdminUsersGET(mock.Ctx)

	mock.Assert200OK(t, result)
}

func TestAdminUserGET_ShouldReturnNotFound(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{}, authentication.ErrUserNotFound)

	AdminUserGET(mock.Ctx)

	mock.Assert404KO(t, messageUserNotFound)
}

func TestAdminUserPATCH_ShouldSucceed(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	disabled := true
	displayName := " John Doe "
	groups := []string{" admins ", "", " users "}
	body := adminUpdateUserRequestBody{DisplayName: &displayName, Groups: &groups, Disabled: &disabled}
	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	mock.Ctx.Request.SetBody(bodyBytes)

	trimmed := "John Doe"
	normalized := []string{"admins", "users"}
	update := authentication.UserProviderAdminUserUpdate{DisplayName: &trimmed, Groups: &normalized, Disabled: &disabled}
	result := authentication.UserProviderAdminUserDetails{Username: "john", DisplayName: "John Doe", Groups: normalized, Disabled: true}
	mock.UserProviderMock.EXPECT().AdminUpdateUser("john", update).Return(result, nil)

	AdminUserPATCH(mock.Ctx)

	mock.Assert200OK(t, result)
}

func TestAdminUserPATCH_ShouldRejectBlankDisplayName(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	displayName := "   "
	bodyBytes, err := json.Marshal(adminUpdateUserRequestBody{DisplayName: &displayName})
	assert.NoError(t, err)
	mock.Ctx.Request.SetBody(bodyBytes)

	AdminUserPATCH(mock.Ctx)

	mock.AssertKO(t, messageDisplayNameRequired, fasthttp.StatusBadRequest)
}

func TestAdminUserPasswordPUT_ShouldRejectWeakPassword(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{Standard: schema.PasswordPolicyStandard{Enabled: true, MinLength: 12}})
	mock.Ctx.SetUserValue("username", "john")
	bodyBytes, err := json.Marshal(adminResetPasswordRequestBody{Password: "weak"})
	assert.NoError(t, err)
	mock.Ctx.Request.SetBody(bodyBytes)

	AdminUserPasswordPUT(mock.Ctx)

	mock.AssertKO(t, messagePasswordWeak, fasthttp.StatusBadRequest)
}

func TestAdminUserPasswordPUT_ShouldReturnUnsupported(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
	mock.Ctx.SetUserValue("username", "john")
	bodyBytes, err := json.Marshal(adminResetPasswordRequestBody{Password: testPasswordNew})
	assert.NoError(t, err)
	mock.Ctx.Request.SetBody(bodyBytes)
	mock.UserProviderMock.EXPECT().AdminResetUserPassword("john", testPasswordNew).Return(authentication.ErrUnsupportedOperation)

	AdminUserPasswordPUT(mock.Ctx)

	mock.AssertKO(t, messageProviderOperationUnsupported, fasthttp.StatusNotImplemented)
}
