package handlers

import (
	"encoding/json"
	"fmt"
	"net/mail"
	"net/url"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"
	"go.uber.org/mock/gomock"

	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/configuration/schema"
	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/mocks"
	"github.com/authelia/authelia/v4/internal/model"
	"github.com/authelia/authelia/v4/internal/templates"
)

func TestAdminUserSessionElevationGET(t *testing.T) {
	testCases := []struct {
		name    string
		twoFA   bool
		has2FA  bool
		require bool
		skip    bool
		loadErr error
		admin   bodyGETUserSessionElevate
		generic bodyGETUserSessionElevate
	}{
		{
			name: "OptionalConfiguredSecondFactorOffersChoice", has2FA: true,
			admin:   bodyGETUserSessionElevate{CanSkipSecondFactor: true, FactorKnowledge: true},
			generic: bodyGETUserSessionElevate{FactorKnowledge: true},
		},
		{
			name: "OptionalConfiguredSecondFactorWithGlobalSkip", has2FA: true, skip: true,
			admin:   bodyGETUserSessionElevate{CanSkipSecondFactor: true, FactorKnowledge: true},
			generic: bodyGETUserSessionElevate{CanSkipSecondFactor: true, FactorKnowledge: true},
		},
		{
			name:    "NoConfiguredSecondFactorUsesEmail",
			admin:   bodyGETUserSessionElevate{FactorKnowledge: true},
			generic: bodyGETUserSessionElevate{FactorKnowledge: true},
		},
		{
			name: "RequiredConfiguredSecondFactorDoesNotOfferEmail", has2FA: true, require: true,
			admin:   bodyGETUserSessionElevate{RequireSecondFactor: true, FactorKnowledge: true},
			generic: bodyGETUserSessionElevate{RequireSecondFactor: true, FactorKnowledge: true},
		},
		{
			name: "RequiredWithoutConfiguredSecondFactorUsesEmail", require: true,
			admin:   bodyGETUserSessionElevate{FactorKnowledge: true},
			generic: bodyGETUserSessionElevate{FactorKnowledge: true},
		},
		{
			name: "RequiredSecondFactorLookupFailureDoesNotOfferEmail", require: true, loadErr: fmt.Errorf("lookup failed"),
			admin:   bodyGETUserSessionElevate{RequireSecondFactor: true, FactorKnowledge: true},
			generic: bodyGETUserSessionElevate{RequireSecondFactor: true, FactorKnowledge: true},
		},
		{
			name: "CompletedSecondFactorSkipsEmailOnlyForAdministration", twoFA: true,
			admin: bodyGETUserSessionElevate{SkipSecondFactor: true},
		},
		{
			name: "CompletedRequiredSecondFactorSkipsEmailOnlyForAdministration", twoFA: true, require: true,
			admin: bodyGETUserSessionElevate{SkipSecondFactor: true},
		},
		{
			name: "CompletedSecondFactorWithGlobalSkip", twoFA: true, skip: true,
			admin:   bodyGETUserSessionElevate{SkipSecondFactor: true},
			generic: bodyGETUserSessionElevate{SkipSecondFactor: true},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()

			mock.Ctx.Configuration.Administration = schema.Administration{Enable: true, Users: []string{testUsername}}
			mock.Ctx.Configuration.IdentityValidation.ElevatedSession = schema.IdentityValidationElevatedSession{RequireSecondFactor: tc.require, SkipSecondFactor: tc.skip}
			policy := mock.Ctx.Configuration.IdentityValidation.ElevatedSession
			us, err := mock.Ctx.GetSession()
			require.NoError(t, err)
			us.Username = testUsername
			us.AuthenticationMethodRefs.UsernameAndPassword = true
			us.AuthenticationMethodRefs.WebAuthn = tc.twoFA
			require.NoError(t, mock.Ctx.SaveSession(us))

			if !tc.twoFA {
				mock.StorageMock.EXPECT().LoadUserInfo(mock.Ctx, testUsername).Return(model.UserInfo{HasTOTP: tc.has2FA}, tc.loadErr).Times(2)
			}

			handler := middlewares.Require1FA(middlewares.RequireAdministration(AdminUserSessionElevationGET))
			handler(mock.Ctx)
			assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
			var response struct {
				Data bodyGETUserSessionElevate `json:"data"`
			}
			require.NoError(t, json.Unmarshal(mock.Ctx.Response.Body(), &response))
			assert.Equal(t, tc.admin, response.Data)
			assert.Equal(t, policy, mock.Ctx.Configuration.IdentityValidation.ElevatedSession)

			UserSessionElevationGET(mock.Ctx)
			assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
			require.NoError(t, json.Unmarshal(mock.Ctx.Response.Body(), &response))
			assert.Equal(t, tc.generic, response.Data)
		})
	}
}

func TestAdminUserSessionElevationGET_ShouldRequireAuthorizedAuthenticatedAdministrator(t *testing.T) {
	for _, level := range []authentication.Level{authentication.NotAuthenticated, authentication.OneFactor, authentication.TwoFactor} {
		t.Run(fmt.Sprintf("AuthenticationLevel%d", level), func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()

			mock.Ctx.Configuration.Administration = schema.Administration{Enable: true, Users: []string{"another-admin"}}
			us, err := mock.Ctx.GetSession()
			require.NoError(t, err)
			us.Username = testUsername
			us.AuthenticationMethodRefs.UsernameAndPassword = level >= authentication.OneFactor
			us.AuthenticationMethodRefs.WebAuthn = level >= authentication.TwoFactor
			require.NoError(t, mock.Ctx.SaveSession(us))

			handler := middlewares.Require1FA(middlewares.RequireAdministration(AdminUserSessionElevationGET))
			handler(mock.Ctx)
			assert.Equal(t, fasthttp.StatusForbidden, mock.Ctx.Response.StatusCode())
		})
	}
}

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

	AdminUsersPOST(mock.Ctx)

	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_sent":false`)
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_reason":"notification disabled by request"`)
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
	adminConfigurePasswordLinks(mock)

	notify := true
	body := adminCreateUserRequestBody{
		Username:    "john",
		Password:    testPasswordNew,
		DisplayName: "John Doe",
		Email:       "john@example.com",
		Notify:      &notify,
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
	mock.StorageMock.EXPECT().SaveIdentityVerification(mock.Ctx, gomock.Any()).Return(nil)
	mock.NotifierMock.EXPECT().
		Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, gomock.Any(), mock.Ctx.Providers.Templates.GetUserOnboardingEmailTemplate(), gomock.Any()).
		Return(fmt.Errorf("smtp password leaked: secret-token"))

	AdminUsersPOST(mock.Ctx)

	bodyString := string(mock.Ctx.Response.Body())
	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, bodyString, `"notification_sent":false`)
	assert.Contains(t, bodyString, adminUserNotificationDeliveryFailed)
	assert.NotContains(t, bodyString, "secret-token")
	assert.NotContains(t, bodyString, "smtp password leaked")
}

func TestAdminUsersPOST_ShouldCreateWithoutPasswordAndSendSetupLink(t *testing.T) {
	for _, tc := range []struct {
		name          string
		password      string
		minLength     int
		maxLength     int
		notify        bool
		deliveryError error
	}{
		{name: "Default", minLength: 12, password: "ignored-supplied-password"},
		{name: "MinimumLength", minLength: 24},
		{name: "WhitespacePasswordIgnored", minLength: 12, password: " \t\n"},
		{name: "MaximumLength", minLength: 8, maxLength: 10},
		{name: "NotifyFalseStillSends", minLength: 12, notify: false},
		{name: "DeliveryFailure", minLength: 12, deliveryError: fmt.Errorf("smtp password leaked: secret-token")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()
			adminConfigurePasswordLinks(mock)
			policy := schema.PasswordPolicy{Standard: schema.PasswordPolicyStandard{
				Enabled: true, MinLength: tc.minLength, MaxLength: tc.maxLength,
				RequireLowercase: true, RequireUppercase: true, RequireNumber: true, RequireSpecial: true,
			}}
			mock.Ctx.Configuration.PasswordPolicy = policy
			mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(policy)
			bodyBytes, err := json.Marshal(adminCreateUserRequestBody{
				Username: "john", DisplayName: "John Doe", Email: "john@example.com", Password: tc.password, SendPasswordLink: true, Notify: &tc.notify,
			})
			require.NoError(t, err)
			adminSetJSONBody(mock.Ctx, bodyBytes)

			gomock.InOrder(
				mock.UserProviderMock.EXPECT().CreateUser(gomock.Any()).DoAndReturn(func(details authentication.UserDetailsCreate) error {
					assert.Equal(t, "john", details.Username)
					assert.Empty(t, details.Password)
					return nil
				}),
				mock.StorageMock.EXPECT().SaveIdentityVerification(mock.Ctx, gomock.Any()).Return(nil),
				mock.NotifierMock.EXPECT().Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, gomock.Any(), mock.Ctx.Providers.Templates.GetUserOnboardingEmailTemplate(), gomock.Any()).DoAndReturn(func(_ any, _ mail.Address, _ string, _ *templates.EmailTemplate, data any) error {
					values, ok := data.(templates.EmailUserOnboardingValues)
					require.True(t, ok)
					assert.Equal(t, "john", values.Username)
					assert.Equal(t, "john@example.com", values.Email)
					assert.Equal(t, "zh-CN", values.Language)
					assert.Contains(t, values.LinkURL, "/reset-password/step2?")
					serialized, err := json.Marshal(data)
					require.NoError(t, err)
					assert.NotContains(t, string(serialized), "ignored-supplied-password")
					return tc.deliveryError
				}),
			)

			AdminUsersPOST(mock.Ctx)

			body := string(mock.Ctx.Response.Body())
			assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
			assert.NotContains(t, body, "ignored-supplied-password")
			assert.NotContains(t, body, "secret-token")
			if tc.deliveryError != nil {
				assert.Contains(t, body, adminUserNotificationDeliveryFailed)
			} else {
				assert.Contains(t, body, `"notification_sent":true`)
			}
		})
	}
}

func TestAdminUsersPOST_ShouldSendManualPasswordOnboardingWithActualLifetime(t *testing.T) {
	for _, tc := range []struct {
		name     string
		language string
		lifetime time.Duration
		validity string
		basePath string
	}{
		{"Default", "en", schema.DefaultIdentityValidation.ResetPassword.JWTExpiration, "2 hours", ""},
		{"OverrideWithBasePath", "zh-CN", 90 * time.Minute, "1 小时 30 分钟", "/auth"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()
			adminConfigurePasswordLinks(mock)
			mock.Ctx.Providers.Clock = &mock.Clock
			mock.Ctx.Configuration.Notifier.DefaultLanguage = tc.language
			mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTExpiration = tc.lifetime
			mock.Ctx.SetUserValue(middlewares.UserValueKeyBaseURL, tc.basePath)
			mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
			notify := true
			body, err := json.Marshal(adminCreateUserRequestBody{Username: "john", DisplayName: "John Doe", Email: "john@example.com", Password: testPasswordNew, Notify: &notify})
			require.NoError(t, err)
			adminSetJSONBody(mock.Ctx, body)
			var verification model.IdentityVerification
			gomock.InOrder(
				mock.UserProviderMock.EXPECT().CreateUser(gomock.Any()).DoAndReturn(func(details authentication.UserDetailsCreate) error {
					assert.Equal(t, testPasswordNew, details.Password)
					return nil
				}),
				mock.StorageMock.EXPECT().SaveIdentityVerification(mock.Ctx, gomock.Any()).DoAndReturn(func(_ any, value model.IdentityVerification) error {
					verification = value
					return nil
				}),
				mock.NotifierMock.EXPECT().Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, gomock.Any(), mock.Ctx.Providers.Templates.GetUserOnboardingEmailTemplate(), gomock.Any()).DoAndReturn(func(_ any, _ mail.Address, subject string, _ *templates.EmailTemplate, data any) error {
					values, ok := data.(templates.EmailUserOnboardingValues)
					require.True(t, ok)
					assert.Equal(t, tc.language, values.Language)
					assert.Equal(t, values.Title, subject)
					assert.Equal(t, "john", values.Username)
					assert.Equal(t, "john@example.com", values.Email)
					assert.Equal(t, "https://login.example.com:8080"+tc.basePath+"/", values.LoginURL)
					assert.Equal(t, tc.validity, values.Validity)
					assert.Equal(t, mock.Clock.Now().Add(tc.lifetime), values.ExpiresAt)
					assert.Equal(t, values.ExpiresAt, verification.ExpiresAt)
					link, err := url.Parse(values.LinkURL)
					require.NoError(t, err)
					assert.Equal(t, tc.basePath+"/reset-password/step2", link.Path)
					claims := &model.IdentityVerificationClaim{}
					_, err = jwt.ParseWithClaims(link.Query().Get("token"), claims, func(_ *jwt.Token) (any, error) {
						return []byte(mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret), nil
					}, jwt.WithTimeFunc(mock.Clock.Now), jwt.WithIssuer("https://login.example.com:8080"+tc.basePath), jwt.WithValidMethods([]string{"HS256"}))
					require.NoError(t, err)
					signed, err := claims.ToIdentityVerification()
					require.NoError(t, err)
					assert.Equal(t, verification.JTI, signed.JTI)
					assert.Equal(t, "ResetPassword", signed.Action)
					assert.Equal(t, "john", signed.Username)
					serialized, err := json.Marshal(values)
					require.NoError(t, err)
					assert.NotContains(t, string(serialized), testPasswordNew)
					return nil
				}),
			)
			AdminUsersPOST(mock.Ctx)
			assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
			assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_sent":true`)
		})
	}
}

func TestAdminUsersPOST_ShouldNotSendOnboardingWhenManualNotificationDisabled(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)
	defer mock.Close()
	adminConfigurePasswordLinks(mock)
	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
	notify := false
	body, err := json.Marshal(adminCreateUserRequestBody{Username: "john", DisplayName: "John Doe", Email: "john@example.com", Password: testPasswordNew, Notify: &notify})
	require.NoError(t, err)
	adminSetJSONBody(mock.Ctx, body)
	mock.UserProviderMock.EXPECT().CreateUser(gomock.Any()).Return(nil)
	mock.StorageMock.EXPECT().SaveIdentityVerification(gomock.Any(), gomock.Any()).Times(0)
	mock.NotifierMock.EXPECT().Send(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).Times(0)
	AdminUsersPOST(mock.Ctx)
	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_sent":false`)
	assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_reason":"notification disabled by request"`)
}

func TestAdminUsersPOST_ShouldPreserveCreationWhenOnboardingLinkUnavailable(t *testing.T) {
	for _, reason := range []string{"disabled", "custom URL", "missing secret", "nonpositive lifetime", "unsupported algorithm", "invalid issuer"} {
		for _, setupLink := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/setup=%t", reason, setupLink), func(t *testing.T) {
				mock := mocks.NewMockAutheliaCtx(t)
				defer mock.Close()
				adminConfigurePasswordLinks(mock)
				mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
				switch reason {
				case "disabled":
					mock.Ctx.Configuration.AuthenticationBackend.PasswordReset.Disable = true
				case "custom URL":
					mock.Ctx.Configuration.AuthenticationBackend.PasswordReset.CustomURL.Host = "external.example.com"
				case "missing secret":
					mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret = ""
				case "nonpositive lifetime":
					mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTExpiration = 0
				case "unsupported algorithm":
					mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTAlgorithm = "none"
				case "invalid issuer":
					mock.Ctx.Request.Header.Set(fasthttp.HeaderXForwardedHost, "unconfigured.example.org")
				}
				notify := true
				body, err := json.Marshal(adminCreateUserRequestBody{Username: "john", DisplayName: "John Doe", Email: "john@example.com", Password: testPasswordNew, SendPasswordLink: setupLink, Notify: &notify})
				require.NoError(t, err)
				adminSetJSONBody(mock.Ctx, body)
				mock.UserProviderMock.EXPECT().CreateUser(gomock.Any()).Return(nil)
				mock.StorageMock.EXPECT().SaveIdentityVerification(gomock.Any(), gomock.Any()).Times(0)
				mock.NotifierMock.EXPECT().Send(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).Times(0)
				AdminUsersPOST(mock.Ctx)
				assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
				assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_sent":false`)
				assert.Contains(t, string(mock.Ctx.Response.Body()), adminUserNotificationDeliveryFailed)
			})
		}
	}
}

func TestAdminManualPassword_ShouldRejectBlankWithPolicyDisabled(t *testing.T) {
	for _, operation := range []string{"create", "reset"} {
		for _, password := range []string{"", " \t\r\n", "\u00a0\u2003"} {
			t.Run(fmt.Sprintf("%s/password=%q", operation, password), func(t *testing.T) {
				mock := mocks.NewMockAutheliaCtx(t)
				defer mock.Close()
				mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
				body, err := json.Marshal(adminCreateUserRequestBody{
					Username: "john", DisplayName: "John Doe", Email: "john@example.com", Password: password,
				})
				require.NoError(t, err)
				adminSetJSONBody(mock.Ctx, body)
				mock.Ctx.SetUserValue("username", "john")
				if operation == "create" {
					AdminUsersPOST(mock.Ctx)
				} else {
					AdminUserPasswordPUT(mock.Ctx)
				}
				assert.Equal(t, fasthttp.StatusBadRequest, mock.Ctx.Response.StatusCode())
				assert.Equal(t, messagePasswordWeak, mock.GetResponseError(t).Message)
			})
		}
	}
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

func TestAdminUsersGET_ShouldReturnEmptyUsersArrayWhenNoUsersMatch(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.QueryArgs().Set("search", "missing")

	result := authentication.UserProviderAdminListResult{Total: 0}
	mock.UserProviderMock.EXPECT().AdminListUsers(authentication.UserProviderAdminListFilter{Search: "missing"}).Return(result, nil)

	AdminUsersGET(mock.Ctx)

	body := string(mock.Ctx.Response.Body())
	assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
	assert.Contains(t, body, `"users":[]`)
	assert.NotContains(t, body, `"users":null`)
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

func TestAdminUserPasswordPUT_ShouldSendResetLinkWithoutChangingPassword(t *testing.T) {
	for _, deliveryError := range []error{nil, fmt.Errorf("smtp password leaked: secret-token")} {
		t.Run(fmt.Sprint(deliveryError), func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()
			adminConfigurePasswordLinks(mock)
			mock.Ctx.SetUserValue("username", "john")
			body, err := json.Marshal(adminResetPasswordRequestBody{SendPasswordLink: true, Password: "must-not-be-applied"})
			require.NoError(t, err)
			adminSetJSONBody(mock.Ctx, body)
			mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{Username: "john", DisplayName: "John Doe", Email: " john@example.com "}, nil)
			mock.UserProviderMock.EXPECT().AdminResetUserPassword(gomock.Any(), gomock.Any()).Times(0)
			mock.StorageMock.EXPECT().SaveIdentityVerification(mock.Ctx, gomock.Any()).Return(nil)
			mock.NotifierMock.EXPECT().Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, gomock.Any(), mock.Ctx.Providers.Templates.GetIdentityVerificationJWTEmailTemplate(), gomock.Any()).DoAndReturn(func(_ any, _ mail.Address, _ string, _ *templates.EmailTemplate, data any) error {
				values, ok := data.(templates.EmailIdentityVerificationJWTValues)
				require.True(t, ok)
				assert.True(t, values.Administrator)
				assert.Equal(t, "zh-CN", values.Language)
				assert.Contains(t, values.LinkURL, "/reset-password/step2?")
				return deliveryError
			})

			AdminUserPasswordPUT(mock.Ctx)

			assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
			response := string(mock.Ctx.Response.Body())
			assert.NotContains(t, response, "secret-token")
			assert.NotContains(t, response, "must-not-be-applied")
			if deliveryError != nil {
				assert.Contains(t, response, adminUserNotificationDeliveryFailed)
			} else {
				assert.Contains(t, response, `"notification_sent":true`)
			}
		})
	}
}

func TestAdminUserPasswordPUT_ShouldRejectLinkWhenUserEmailBlank(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)
	defer mock.Close()
	adminConfigurePasswordLinks(mock)
	mock.Ctx.SetUserValue("username", "john")
	body, err := json.Marshal(adminResetPasswordRequestBody{SendPasswordLink: true})
	require.NoError(t, err)
	adminSetJSONBody(mock.Ctx, body)
	mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{Username: "john", Email: "   "}, nil)
	AdminUserPasswordPUT(mock.Ctx)
	mock.AssertKO(t, adminUserEmailRequired, fasthttp.StatusBadRequest)
}

func TestAdminUserPasswordPUT_ShouldRejectUnavailableConfigurationBeforeMutations(t *testing.T) {
	for _, reason := range []string{"disabled", "custom URL", "missing secret"} {
		t.Run(reason, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()
			adminConfigurePasswordLinks(mock)
			switch reason {
			case "disabled":
				mock.Ctx.Configuration.AuthenticationBackend.PasswordReset.Disable = true
			case "custom URL":
				mock.Ctx.Configuration.AuthenticationBackend.PasswordReset.CustomURL.Host = "external.example.com"
			case "missing secret":
				mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret = ""
			}
			mock.Ctx.SetUserValue("username", "john")
			adminSetJSONBody(mock.Ctx, []byte(`{"send_password_link":true}`))
			AdminUserPasswordPUT(mock.Ctx)
			assert.Equal(t, fasthttp.StatusBadRequest, mock.Ctx.Response.StatusCode())
			assert.Contains(t, string(mock.Ctx.Response.Body()), "Password links are unavailable")
		})
	}
}

func TestAdminUserPasswordPUT_ShouldSendOneSafetyNotificationAfterManualReset(t *testing.T) {
	for _, deliveryError := range []error{nil, fmt.Errorf("smtp password leaked: secret-token")} {
		t.Run(fmt.Sprint(deliveryError), func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()
			mock.Ctx.Configuration.Notifier.DefaultLanguage = "zh-CN"
			mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
			mock.Ctx.SetUserValue("username", "john")
			body, err := json.Marshal(adminResetPasswordRequestBody{Password: testPasswordNew})
			require.NoError(t, err)
			adminSetJSONBody(mock.Ctx, body)
			gomock.InOrder(
				mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{Username: "john", DisplayName: "John Doe", Email: "john@example.com"}, nil),
				mock.StorageMock.EXPECT().BeginTX(mock.Ctx).Return(mock.Ctx, nil),
				mock.StorageMock.EXPECT().RevokeIdentityVerifications(mock.Ctx, "john", "ResetPassword", gomock.Any()).Return(nil),
				mock.UserProviderMock.EXPECT().AdminResetUserPassword("john", testPasswordNew).Return(nil),
				mock.StorageMock.EXPECT().Commit(mock.Ctx).Return(nil),
				mock.NotifierMock.EXPECT().Send(mock.Ctx, mail.Address{Name: "John Doe", Address: "john@example.com"}, gomock.Any(), gomock.Any(), gomock.Any()).DoAndReturn(func(_ any, _ mail.Address, _ string, _ *templates.EmailTemplate, data any) error {
					values, ok := data.(templates.EmailEventValues)
					require.True(t, ok)
					assert.True(t, values.Administrator)
					assert.Equal(t, "zh-CN", values.Language)
					assert.NotContains(t, values.Details, "Password")
					return deliveryError
				}),
			)
			AdminUserPasswordPUT(mock.Ctx)
			assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
			response := string(mock.Ctx.Response.Body())
			assert.NotContains(t, response, testPasswordNew)
			assert.NotContains(t, response, "secret-token")
			if deliveryError != nil {
				assert.Contains(t, response, adminUserNotificationDeliveryFailed)
			} else {
				assert.Contains(t, response, `"notification_sent":true`)
			}
		})
	}
}

func TestAdminUserPasswordPUT_ShouldKeepMutationAndRevocationFailuresDistinct(t *testing.T) {
	for _, stage := range []string{"begin", "revoke", "commit"} {
		t.Run(stage, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()
			mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
			mock.Ctx.SetUserValue("username", "john")
			body, err := json.Marshal(adminResetPasswordRequestBody{Password: testPasswordNew})
			require.NoError(t, err)
			adminSetJSONBody(mock.Ctx, body)
			mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{Username: "john", Email: "john@example.com"}, nil)
			failure := fmt.Errorf("storage unavailable")
			if stage == "begin" {
				mock.StorageMock.EXPECT().BeginTX(mock.Ctx).Return(nil, failure)
			} else {
				mock.StorageMock.EXPECT().BeginTX(mock.Ctx).Return(mock.Ctx, nil)
				mock.StorageMock.EXPECT().Rollback(mock.Ctx).Return(nil)
				if stage == "revoke" {
					mock.StorageMock.EXPECT().RevokeIdentityVerifications(mock.Ctx, "john", "ResetPassword", gomock.Any()).Return(failure)
				} else {
					gomock.InOrder(
						mock.StorageMock.EXPECT().RevokeIdentityVerifications(mock.Ctx, "john", "ResetPassword", gomock.Any()).Return(nil),
						mock.UserProviderMock.EXPECT().AdminResetUserPassword("john", testPasswordNew).Return(nil),
						mock.StorageMock.EXPECT().Commit(mock.Ctx).Return(failure),
						mock.NotifierMock.EXPECT().Send(mock.Ctx, gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).Return(nil),
					)
				}
			}

			AdminUserPasswordPUT(mock.Ctx)

			if stage == "commit" {
				assert.Equal(t, fasthttp.StatusOK, mock.Ctx.Response.StatusCode())
				assert.Contains(t, string(mock.Ctx.Response.Body()), `"reset_links_revocation_error"`)
				assert.Contains(t, string(mock.Ctx.Response.Body()), `"notification_sent":true`)
			} else {
				mock.AssertKO(t, messageUnableToResetUserPassword, fasthttp.StatusOK)
			}
		})
	}
}

func adminConfigurePasswordLinks(mock *mocks.MockAutheliaCtx) {
	mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTSecret = "test-reset-secret"
	mock.Ctx.Configuration.IdentityValidation.ResetPassword.JWTExpiration = 5 * time.Minute
	mock.Ctx.Configuration.Notifier.DefaultLanguage = "zh-CN"
	mock.Ctx.Request.Header.Set(fasthttp.HeaderXForwardedProto, "https")
	mock.Ctx.Request.Header.Set(fasthttp.HeaderXForwardedHost, "login.example.com:8080")
}

func TestAdminUserPasswordPUT_ShouldReturnUnsupported(t *testing.T) {
	mock := mocks.NewMockAutheliaCtx(t)

	defer mock.Close()

	mock.Ctx.Providers.PasswordPolicy = middlewares.NewPasswordPolicyProvider(schema.PasswordPolicy{})
	mock.Ctx.SetUserValue("username", "john")
	bodyBytes, err := json.Marshal(adminResetPasswordRequestBody{Password: testPasswordNew})
	assert.NoError(t, err)
	adminSetJSONBody(mock.Ctx, bodyBytes)
	mock.UserProviderMock.EXPECT().AdminGetUser("john").Return(authentication.UserProviderAdminUserDetails{Username: "john", Email: "john@example.com"}, nil)
	mock.StorageMock.EXPECT().BeginTX(mock.Ctx).Return(mock.Ctx, nil)
	mock.StorageMock.EXPECT().RevokeIdentityVerifications(mock.Ctx, "john", "ResetPassword", gomock.Any()).Return(nil)
	mock.StorageMock.EXPECT().Rollback(mock.Ctx).Return(nil)
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
