package handlers

import (
	"encoding/json"
	"fmt"
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
	"github.com/authelia/authelia/v4/internal/templates"
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
	adminSetJSONBody(mock.Ctx, bodyBytes)

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

func TestAdminUsersPOST_ShouldRejectBlankEmail(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})

	body := adminCreateUserRequestBody{Username: "john", Password: testPasswordNew, DisplayName: "John Doe"}
	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	AdminUsersPOST(mock.Ctx)

	mock.AssertKO(t, adminUserEmailRequired, fasthttp.StatusBadRequest)
}

func TestAdminUsersPOST_ShouldNotExposeNotifierError(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})

	body := adminCreateUserRequestBody{
		Username:    "john",
		Password:    testPasswordNew,
		DisplayName: "John Doe",
		Email:       "john@example.com",
	}

	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	mock.UserProviderMock.EXPECT().
		CreateUser(authentication.UserDetailsCreate{
			Username:    "john",
			Password:    testPasswordNew,
			DisplayName: "John Doe",
			Email:       "john@example.com",
			Groups:      []string{},
		}).
		Return(nil)
	mock.NotifierMock.EXPECT().
		Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, "User created successfully", gomock.Any(), gomock.Any()).
		Return(fmt.Errorf("smtp password leaked: secret-token"))

	AdminUsersPOST(mock.Ctx)

	bodyString := string(mock.Ctx.Response.Body())
	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, bodyString, `"notification_sent":false`)
	assert.Contains(t, bodyString, adminUserNotificationDeliveryFailed)
	assert.NotContains(t, bodyString, "secret-token")
	assert.NotContains(t, bodyString, "smtp password leaked")
}

func TestAdminUsersPOST_ShouldCreateGeneratedPasswordAndEmailIt(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{Standard: schema.PasswordPolicyStandard{
		Enabled:          true,
		MinLength:        12,
		RequireLowercase: true,
		RequireUppercase: true,
		RequireNumber:    true,
		RequireSpecial:   true,
	}})

	body := adminCreateUserRequestBody{
		Username:    "john",
		DisplayName: "John Doe",
		Email:       "john@example.com",
		Generate:    true,
	}

	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	var generatedPassword string
	mock.UserProviderMock.EXPECT().
		CreateUser(gomock.AssignableToTypeOf(authentication.UserDetailsCreate{})).
		DoAndReturn(func(details authentication.UserDetailsCreate) error {
			assert.Equal(t, "john", details.Username)
			assert.Equal(t, "John Doe", details.DisplayName)
			assert.Equal(t, "john@example.com", details.Email)
			assert.NotEmpty(t, details.Password)
			assert.Len(t, details.Password, adminGeneratedPasswordLength)
			assert.NoError(t, mock.Ctx.Providers.PasswordPolicy.Check(details.Password))
			generatedPassword = details.Password

			return nil
		})
	mock.NotifierMock.EXPECT().
		Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, "User created successfully", gomock.Any(), gomock.AssignableToTypeOf(templates.EmailEventValues{})).
		DoAndReturn(func(_ any, _ mail.Address, _ string, _ *templates.EmailTemplate, data any) error {
			values, ok := data.(templates.EmailEventValues)
			assert.True(t, ok)
			assert.Equal(t, "User Created", values.Details["Action"])
			assert.Equal(t, generatedPassword, values.Details["Password"])

			return nil
		})

	AdminUsersPOST(mock.Ctx)

	bodyString := string(mock.Ctx.Response.Body())
	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, bodyString, `"notification_sent":true`)
	assert.NotContains(t, bodyString, generatedPassword)
}

func TestAdminUsersPOST_ShouldHonorGeneratedPasswordPolicyMinLength(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	policy := schema.PasswordPolicy{Standard: schema.PasswordPolicyStandard{
		Enabled:          true,
		MinLength:        24,
		RequireLowercase: true,
		RequireUppercase: true,
		RequireNumber:    true,
		RequireSpecial:   true,
	}}
	mock.Ctx.Configuration.PasswordPolicy = policy
	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(policy)

	body := adminCreateUserRequestBody{
		Username:    "john",
		DisplayName: "John Doe",
		Email:       "john@example.com",
		Generate:    true,
	}

	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	var generatedPassword string
	mock.UserProviderMock.EXPECT().
		CreateUser(gomock.AssignableToTypeOf(authentication.UserDetailsCreate{})).
		DoAndReturn(func(details authentication.UserDetailsCreate) error {
			assert.Len(t, details.Password, policy.Standard.MinLength)
			assert.NoError(t, mock.Ctx.Providers.PasswordPolicy.Check(details.Password))
			generatedPassword = details.Password

			return nil
		})
	mock.NotifierMock.EXPECT().
		Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, "User created successfully", gomock.Any(), gomock.AssignableToTypeOf(templates.EmailEventValues{})).
		DoAndReturn(func(_ any, _ mail.Address, _ string, _ *templates.EmailTemplate, data any) error {
			values, ok := data.(templates.EmailEventValues)
			assert.True(t, ok)
			assert.Equal(t, generatedPassword, values.Details["Password"])

			return nil
		})

	AdminUsersPOST(mock.Ctx)

	bodyString := string(mock.Ctx.Response.Body())
	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, bodyString, `"notification_sent":true`)
	assert.NotContains(t, bodyString, generatedPassword)
}

func TestAdminUsersPOST_ShouldNotSuppressGeneratedPasswordEmailWhenNotifyFalse(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
	notify := false
	body := adminCreateUserRequestBody{Username: "john", DisplayName: "John Doe", Email: "john@example.com", Generate: true, Notify: &notify}
	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	mock.UserProviderMock.EXPECT().CreateUser(gomock.AssignableToTypeOf(authentication.UserDetailsCreate{})).Return(nil)
	mock.NotifierMock.EXPECT().Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, "User created successfully", gomock.Any(), gomock.Any()).Return(nil)

	AdminUsersPOST(mock.Ctx)

	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_sent":true`)
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
		Email:       "john@example.com",
	}

	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

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
		Email:       "john@example.com",
	}

	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	mock.UserProviderMock.EXPECT().
		CreateUser(authentication.UserDetailsCreate{
			Username:    "john",
			Password:    testPasswordNew,
			DisplayName: "John Doe",
			Email:       "john@example.com",
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
		Email:       "john@example.com",
	}

	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	mock.UserProviderMock.EXPECT().
		CreateUser(authentication.UserDetailsCreate{
			Username:    "john",
			Password:    testPasswordNew,
			DisplayName: "John Doe",
			Email:       "john@example.com",
			Groups:      []string{},
		}).
		Return(authentication.ErrUnsupportedOperation)

	AdminUsersPOST(mock.Ctx)

	mock.AssertKO(t, messageProviderOperationUnsupported, fasthttp.StatusNotImplemented)
}

func TestAdminUsersPOST_ShouldFailWhenRequestBodyIsInvalid(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	adminSetJSONBody(mock.Ctx, []byte(`{invalid json`))

	AdminUsersPOST(mock.Ctx)

	errResponse := mock.GetResponseError(t)
	assert.Equal(t, fasthttp.StatusBadRequest, mock.Ctx.Response.StatusCode())
	assert.Equal(t, "KO", errResponse.Status)
	assert.Equal(t, messageUnableToCreateUser, errResponse.Message)
	mock.AssertLogEntryAdvanced(t, 0, logrus.ErrorLevel, regexp.MustCompile(`^unable to parse body: .+`), map[string]any{})
}

func TestAdminUsersPOST_ShouldRejectNonJSONContentType(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Request.Header.SetContentType("text/plain")
	mock.Ctx.Request.SetBody([]byte(`{"username":"john","password":"password","display_name":"John Doe"}`))

	AdminUsersPOST(mock.Ctx)

	mock.AssertKO(t, fasthttp.StatusMessage(fasthttp.StatusUnsupportedMediaType), fasthttp.StatusUnsupportedMediaType)
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
	email := " john@example.com "
	groups := []string{" admins ", "", " users "}
	body := adminUpdateUserRequestBody{DisplayName: &displayName, Email: &email, Groups: &groups, Disabled: &disabled}
	bodyBytes, err := json.Marshal(body)
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	trimmed := "John Doe"
	trimmedEmail := "john@example.com"
	normalized := []string{"admins", "users"}
	update := authentication.UserProviderAdminUserUpdate{DisplayName: &trimmed, Email: &trimmedEmail, Groups: &normalized, Disabled: &disabled}
	result := authentication.UserProviderAdminUserDetails{Username: "john", DisplayName: "John Doe", Email: "john@example.com", Groups: normalized, Disabled: true}
	mock.UserProviderMock.EXPECT().AdminUpdateUser("john", update).Return(result, nil)

	AdminUserPATCH(mock.Ctx)

	mock.Assert200OK(t, result)
}

func TestAdminUserPATCH_ShouldAllowDisabledOnlyUpdate(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	disabled := true
	bodyBytes, err := json.Marshal(adminUpdateUserRequestBody{Disabled: &disabled})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	update := authentication.UserProviderAdminUserUpdate{Disabled: &disabled}
	result := authentication.UserProviderAdminUserDetails{Username: "john", DisplayName: "John Doe", Disabled: true}
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
	adminSetJSONBody(mock.Ctx, bodyBytes)

	AdminUserPATCH(mock.Ctx)

	mock.AssertKO(t, messageDisplayNameRequired, fasthttp.StatusBadRequest)
}

func TestAdminUserPATCH_ShouldRejectBlankEmail(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	email := "   "
	bodyBytes, err := json.Marshal(adminUpdateUserRequestBody{Email: &email})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	AdminUserPATCH(mock.Ctx)

	mock.AssertKO(t, adminUserEmailRequired, fasthttp.StatusBadRequest)
}

func TestAdminUserPATCH_ShouldFailWhenUserAlreadyExists(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	email := "john@example.com"
	bodyBytes, err := json.Marshal(adminUpdateUserRequestBody{Email: &email})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	update := authentication.UserProviderAdminUserUpdate{Email: &email}
	mock.UserProviderMock.EXPECT().AdminUpdateUser("john", update).Return(authentication.UserProviderAdminUserDetails{}, authentication.ErrUserAlreadyExists)

	AdminUserPATCH(mock.Ctx)

	mock.AssertKO(t, messageUserAlreadyExists, fasthttp.StatusConflict)
}

func TestAdminUserPATCH_ShouldRejectNonJSONContentType(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	mock.Ctx.Request.Header.SetContentType("text/plain")
	mock.Ctx.Request.SetBody([]byte(`{"display_name":"John Doe"}`))

	AdminUserPATCH(mock.Ctx)

	mock.AssertKO(t, fasthttp.StatusMessage(fasthttp.StatusUnsupportedMediaType), fasthttp.StatusUnsupportedMediaType)
}

func TestAdminUserDELETE_ShouldSucceed(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	mock.UserProviderMock.EXPECT().AdminDeleteUser("john").Return(nil)

	AdminUserDELETE(mock.Ctx)

	mock.Assert200OK(t, nil)
}

func TestAdminUserDELETE_ShouldReturnNotFound(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	mock.UserProviderMock.EXPECT().AdminDeleteUser("john").Return(authentication.ErrUserNotFound)

	AdminUserDELETE(mock.Ctx)

	mock.Assert404KO(t, messageUserNotFound)
}

func TestAdminUserDELETE_ShouldReturnUnsupported(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	mock.UserProviderMock.EXPECT().AdminDeleteUser("john").Return(authentication.ErrUnsupportedOperation)

	AdminUserDELETE(mock.Ctx)

	mock.AssertKO(t, messageProviderOperationUnsupported, fasthttp.StatusNotImplemented)
}

func TestAdminUserPasswordPUT_ShouldRejectWeakPassword(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{Standard: schema.PasswordPolicyStandard{Enabled: true, MinLength: 12}})
	mock.Ctx.SetUserValue("username", "john")
	bodyBytes, err := json.Marshal(adminResetPasswordRequestBody{Password: "weak"})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	AdminUserPasswordPUT(mock.Ctx)

	mock.AssertKO(t, messagePasswordWeak, fasthttp.StatusBadRequest)
}

func TestAdminUserPasswordPUT_ShouldResetGeneratedPasswordAndEmailItByDefault(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{Standard: schema.PasswordPolicyStandard{
		Enabled:          true,
		MinLength:        12,
		RequireLowercase: true,
		RequireUppercase: true,
		RequireNumber:    true,
		RequireSpecial:   true,
	}})
	mock.Ctx.SetUserValue("username", "john")
	bodyBytes, err := json.Marshal(adminResetPasswordRequestBody{Generate: true})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{Username: "john", DisplayName: "John Doe", Email: " john@example.com "}, nil)

	var generatedPassword string
	mock.UserProviderMock.EXPECT().
		AdminResetUserPassword("john", gomock.Any()).
		DoAndReturn(func(username, password string) error {
			assert.Equal(t, "john", username)
			assert.NotEmpty(t, password)
			assert.Len(t, password, adminGeneratedPasswordLength)
			assert.NoError(t, mock.Ctx.Providers.PasswordPolicy.Check(password))
			generatedPassword = password

			return nil
		})
	mock.NotifierMock.EXPECT().
		Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, "Password reset successfully", gomock.Any(), gomock.AssignableToTypeOf(templates.EmailEventValues{})).
		DoAndReturn(func(_ any, _ mail.Address, _ string, _ *templates.EmailTemplate, data any) error {
			values, ok := data.(templates.EmailEventValues)
			assert.True(t, ok)
			assert.Equal(t, "Password Reset", values.Details["Action"])
			assert.Equal(t, generatedPassword, values.Details["Password"])

			return nil
		})

	AdminUserPasswordPUT(mock.Ctx)

	bodyString := string(mock.Ctx.Response.Body())
	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, bodyString, `"notification_sent":true`)
	assert.NotContains(t, bodyString, generatedPassword)
}

func TestAdminUserPasswordPUT_ShouldRejectGeneratedPasswordWhenUserEmailBlank(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
	mock.Ctx.SetUserValue("username", "john")
	bodyBytes, err := json.Marshal(adminResetPasswordRequestBody{Generate: true})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)
	mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{Username: "john", DisplayName: "John Doe", Email: "   "}, nil)

	AdminUserPasswordPUT(mock.Ctx)

	mock.AssertKO(t, adminUserEmailRequired, fasthttp.StatusBadRequest)
}

func TestAdminUserPasswordPUT_ShouldReturnSafeNotificationErrorForGeneratedPassword(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
	mock.Ctx.SetUserValue("username", "john")
	bodyBytes, err := json.Marshal(adminResetPasswordRequestBody{Generate: true})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{Username: "john", DisplayName: "John Doe", Email: "john@example.com"}, nil)

	var generatedPassword string
	mock.UserProviderMock.EXPECT().
		AdminResetUserPassword("john", gomock.Any()).
		DoAndReturn(func(_ string, password string) error {
			generatedPassword = password
			return nil
		})
	mock.NotifierMock.EXPECT().
		Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, "Password reset successfully", gomock.Any(), gomock.Any()).
		Return(fmt.Errorf("smtp rejected generated password: %s", generatedPassword))

	AdminUserPasswordPUT(mock.Ctx)

	bodyString := string(mock.Ctx.Response.Body())
	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, bodyString, adminUserNotificationDeliveryFailed)
	assert.NotContains(t, bodyString, generatedPassword)
	assert.NotContains(t, bodyString, "smtp rejected")
	mock.AssertLogEntryAdvanced(t, 0, logrus.ErrorLevel, "Error occurred sending generated password notification email", map[string]any{})
}

func TestAdminUserPasswordPUT_ShouldNotSuppressGeneratedPasswordEmailWhenNotifyFalse(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
	mock.Ctx.SetUserValue("username", "john")
	notify := false
	bodyBytes, err := json.Marshal(adminResetPasswordRequestBody{Generate: true, Notify: &notify})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)

	mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{Username: "john", DisplayName: "John Doe", Email: "john@example.com"}, nil)

	var generatedPassword string
	mock.UserProviderMock.EXPECT().
		AdminResetUserPassword("john", gomock.Any()).
		DoAndReturn(func(_ string, password string) error {
			generatedPassword = password
			return nil
		})
	mock.NotifierMock.EXPECT().
		Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, "Password reset successfully", gomock.Any(), gomock.AssignableToTypeOf(templates.EmailEventValues{})).
		DoAndReturn(func(_ any, _ mail.Address, _ string, _ *templates.EmailTemplate, data any) error {
			values, ok := data.(templates.EmailEventValues)
			assert.True(t, ok)
			assert.Equal(t, "Password Reset", values.Details["Action"])
			assert.Equal(t, generatedPassword, values.Details["Password"])

			return nil
		})

	AdminUserPasswordPUT(mock.Ctx)

	bodyString := string(mock.Ctx.Response.Body())
	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, bodyString, `"notification_sent":true`)
	assert.NotContains(t, bodyString, generatedPassword)
}

func TestAdminUserPasswordPUT_ShouldReturnUnsupported(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
	mock.Ctx.SetUserValue("username", "john")
	bodyBytes, err := json.Marshal(adminResetPasswordRequestBody{Password: testPasswordNew})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)
	mock.UserProviderMock.EXPECT().AdminResetUserPassword("john", testPasswordNew).Return(authentication.ErrUnsupportedOperation)

	AdminUserPasswordPUT(mock.Ctx)

	mock.AssertKO(t, messageProviderOperationUnsupported, fasthttp.StatusNotImplemented)
}

func TestAdminUserPasswordPUT_ShouldRejectNonJSONContentType(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.SetUserValue("username", "john")
	mock.Ctx.Request.Header.SetContentType("text/plain")
	mock.Ctx.Request.SetBody([]byte(`{"password":"password"}`))

	AdminUserPasswordPUT(mock.Ctx)

	mock.AssertKO(t, fasthttp.StatusMessage(fasthttp.StatusUnsupportedMediaType), fasthttp.StatusUnsupportedMediaType)
}

func adminSetJSONBody(ctx *middlewares.AutheliaCtx, body []byte) {
	ctx.Request.Header.SetContentType("application/json")
	ctx.Request.SetBody(body)
}
