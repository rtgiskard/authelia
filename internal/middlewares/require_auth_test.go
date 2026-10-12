// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package middlewares_test

import (
	"encoding/json"
	"errors"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/valyala/fasthttp"

	"github.com/authelia/authelia/v4/internal/authentication"
	"github.com/authelia/authelia/v4/internal/configuration/schema"
	"github.com/authelia/authelia/v4/internal/middlewares"
	"github.com/authelia/authelia/v4/internal/mocks"
	"github.com/authelia/authelia/v4/internal/model"
	"github.com/authelia/authelia/v4/internal/session"
)

func TestRequireElevated(t *testing.T) {
	type elevation struct {
		id      int
		expires time.Duration
		ip      net.IP
	}

	type response struct {
		Status string                                `json:"status"`
		Data   middlewares.ElevatedForbiddenResponse `json:"data"`
	}

	testCases := []struct {
		name              string
		level             authentication.Level
		elevation         *elevation
		require2FA        bool
		skip2fA           bool
		setup             func(t *testing.T, mock *mocks.MockAutheliaCtx)
		expected          int
		expected1FA       bool
		expected2FA       bool
		expectedElevation bool
	}{
		{
			"ShouldPassAuthenticatedElevatedUser",
			authentication.OneFactor,
			&elevation{
				1, time.Minute, net.ParseIP("127.0.0.1"),
			},
			false,
			false,
			nil,
			fasthttp.StatusOK,
			false,
			false,
			false,
		},
		{
			"ShouldRequireElevation",
			authentication.OneFactor,
			nil,
			false,
			false,
			nil,
			fasthttp.StatusForbidden,
			false,
			false,
			true,
		},
		{
			"ShouldRequireElevationExpired",
			authentication.OneFactor,
			&elevation{
				1, time.Minute * -1, net.ParseIP("127.0.0.1"),
			},
			false,
			false,
			nil,
			fasthttp.StatusForbidden,
			false,
			false,
			true,
		},
		{
			"ShouldRequireElevationBadIP",
			authentication.OneFactor,
			&elevation{
				1, time.Minute, net.ParseIP("127.0.0.2"),
			},
			false,
			false,
			nil,
			fasthttp.StatusForbidden,
			false,
			false,
			true,
		},
		{
			"ShouldRequire2FAWhenElevated",
			authentication.OneFactor,
			&elevation{
				1, time.Minute, net.ParseIP("127.0.0.1"),
			},
			true,
			false,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				mock.StorageMock.EXPECT().LoadUserInfo(mock.Ctx, john).
					Return(model.UserInfo{HasWebAuthn: true}, nil)
			},
			fasthttp.StatusForbidden,
			false,
			true,
			false,
		},
		{
			"ShouldNotRequire2FAWhenNotSetup",
			authentication.OneFactor,
			&elevation{
				1, time.Minute, net.ParseIP("127.0.0.1"),
			},
			true,
			false,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				mock.StorageMock.EXPECT().LoadUserInfo(mock.Ctx, john).
					Return(model.UserInfo{}, nil)
			},
			fasthttp.StatusOK,
			false,
			false,
			false,
		},
		{
			"ShouldRequire2FAWhenError",
			authentication.OneFactor,
			&elevation{
				1, time.Minute, net.ParseIP("127.0.0.1"),
			},
			true,
			false,
			func(t *testing.T, mock *mocks.MockAutheliaCtx) {
				mock.StorageMock.EXPECT().LoadUserInfo(mock.Ctx, john).
					Return(model.UserInfo{}, errors.New("example"))
			},
			fasthttp.StatusForbidden,
			false,
			true,
			false,
		},
		{
			"ShouldPass2FAUser",
			authentication.TwoFactor,
			nil,
			false,
			true,
			nil,
			fasthttp.StatusOK,
			false,
			false,
			false,
		},
		{
			"ShouldRequireElevationForTwoFactorWhenSkipDisabled",
			authentication.TwoFactor,
			nil,
			false,
			false,
			nil,
			fasthttp.StatusForbidden,
			false,
			false,
			true,
		},
		{
			"ShouldRequireElevation1FAUser",
			authentication.OneFactor,
			nil,
			false,
			true,
			nil,
			fasthttp.StatusForbidden,
			false,
			false,
			true,
		},
		{
			"ShouldRequireAuthentication",
			authentication.NotAuthenticated,
			nil,
			false,
			true,
			nil,
			fasthttp.StatusForbidden,
			true,
			false,
			false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)

			defer mock.Close()

			mock.Ctx.Configuration.IdentityValidation.ElevatedSession = schema.IdentityValidationElevatedSession{
				CodeLifespan:        time.Minute,
				ElevationLifespan:   time.Minute,
				Characters:          8,
				RequireSecondFactor: tc.require2FA,
				SkipSecondFactor:    tc.skip2fA,
			}

			mock.Ctx.Providers.Clock = &mock.Clock
			mock.Ctx.Request.Header.Set(fasthttp.HeaderXForwardedFor, "127.0.0.1")

			userSession, err := mock.Ctx.GetSession()
			require.NoError(t, err)

			switch tc.level {
			case authentication.OneFactor:
				userSession.Username = john
				userSession.AuthenticationMethodRefs.UsernameAndPassword = true
				userSession.AuthenticationMethodRefs.WebAuthn = false
			case authentication.TwoFactor:
				userSession.Username = john
				userSession.AuthenticationMethodRefs.UsernameAndPassword = true
				userSession.AuthenticationMethodRefs.WebAuthn = true
			case authentication.NotAuthenticated:
				userSession.AuthenticationMethodRefs.UsernameAndPassword = false
				userSession.AuthenticationMethodRefs.WebAuthn = false
			}

			if tc.elevation != nil {
				userSession.Elevations.User = &session.Elevation{
					ID:       tc.elevation.id,
					Expires:  mock.Clock.Now().Add(tc.elevation.expires),
					RemoteIP: tc.elevation.ip,
				}
			}

			require.NoError(t, mock.Ctx.SaveSession(userSession))

			if tc.setup != nil {
				tc.setup(t, mock)
			}

			handler := middlewares.RequireElevated(NilHandler)

			handler(mock.Ctx)

			assert.Equal(t, tc.expected, mock.Ctx.Response.StatusCode())

			if tc.expected == fasthttp.StatusOK {
				assert.Equal(t, "text/plain; charset=utf-8", string(mock.Ctx.Response.Header.Peek(fasthttp.HeaderContentType)))
				assert.Equal(t, "Example Nil", string(mock.Ctx.Response.Body()))
			} else {
				data := &response{}

				require.NoError(t, json.Unmarshal(mock.Ctx.Response.Body(), data))

				assert.Equal(t, tc.expectedElevation, data.Data.Elevation)
				assert.Equal(t, tc.expected1FA, data.Data.FirstFactor)
				assert.Equal(t, tc.expected2FA, data.Data.SecondFactor)
			}
		})
	}
}

func TestRequireAdministration(t *testing.T) {
	testCases := []struct {
		name                  string
		level                 authentication.Level
		config                schema.Administration
		setup                 func(mock *mocks.MockAutheliaCtx)
		expected              int
		expectedSession       bool
		expectedAuthorization bool
		expectedUserDetails   bool
	}{
		{
			"ShouldDenyAnonymousUser",
			authentication.NotAuthenticated,
			schema.Administration{Enable: true, Users: []string{john}},
			nil,
			fasthttp.StatusForbidden,
			false,
			true,
			false,
		},
		{
			"ShouldAllowConfiguredOneFactorUser",
			authentication.OneFactor,
			schema.Administration{Enable: true, Users: []string{john}},
			nil,
			fasthttp.StatusOK,
			false,
			false,
			false,
		},
		{
			"ShouldAllowConfiguredGroup",
			authentication.OneFactor,
			schema.Administration{Enable: true, Groups: []string{"admins"}},
			func(mock *mocks.MockAutheliaCtx) {
				mock.UserProviderMock.EXPECT().GetDetails(john).Return(&authentication.UserDetails{Username: john, Groups: []string{"admins"}}, nil)
			},
			fasthttp.StatusOK,
			false,
			false,
			false,
		},
		{
			"ShouldDenyUnconfiguredUserWithTwoFactors",
			authentication.TwoFactor,
			schema.Administration{Enable: true, Groups: []string{"admins"}},
			func(mock *mocks.MockAutheliaCtx) {
				mock.UserProviderMock.EXPECT().GetDetails(john).Return(&authentication.UserDetails{Username: john, Groups: []string{"users"}}, nil)
			},
			fasthttp.StatusForbidden,
			false,
			true,
			false,
		},
		{
			"ShouldDenyWhenNoAdministratorsConfigured",
			authentication.TwoFactor,
			schema.Administration{Enable: true},
			nil,
			fasthttp.StatusForbidden,
			false,
			true,
			false,
		},
		{
			"ShouldDenyWhenUserDetailsLookupFails",
			authentication.TwoFactor,
			schema.Administration{Enable: true, Groups: []string{"admins"}},
			func(mock *mocks.MockAutheliaCtx) {
				mock.UserProviderMock.EXPECT().GetDetails(john).Return(nil, errors.New("lookup failed"))
			},
			fasthttp.StatusForbidden,
			false,
			false,
			true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)

			defer mock.Close()

			mock.Ctx.Configuration.Administration = tc.config

			userSession, err := mock.Ctx.GetSession()
			require.NoError(t, err)

			switch tc.level {
			case authentication.OneFactor:
				userSession.Username = john
				userSession.AuthenticationMethodRefs.UsernameAndPassword = true
				userSession.AuthenticationMethodRefs.WebAuthn = false
			case authentication.TwoFactor:
				userSession.Username = john
				userSession.AuthenticationMethodRefs.UsernameAndPassword = true
				userSession.AuthenticationMethodRefs.WebAuthn = true
			case authentication.NotAuthenticated:
				userSession.AuthenticationMethodRefs.UsernameAndPassword = false
				userSession.AuthenticationMethodRefs.WebAuthn = false
			}

			require.NoError(t, mock.Ctx.SaveSession(userSession))

			if tc.setup != nil {
				tc.setup(mock)
			}

			handler := middlewares.RequireAdministration(NilHandler)

			handler(mock.Ctx)

			assert.Equal(t, tc.expected, mock.Ctx.Response.StatusCode())

			if tc.expected == fasthttp.StatusOK {
				assert.Equal(t, "Example Nil", string(mock.Ctx.Response.Body()))
			} else {
				data := &struct {
					Status string                                      `json:"status"`
					Data   middlewares.AdministrationForbiddenResponse `json:"data"`
				}{}

				require.NoError(t, json.Unmarshal(mock.Ctx.Response.Body(), data))

				assert.Equal(t, tc.expectedSession, data.Data.Session)
				assert.Equal(t, tc.expectedAuthorization, data.Data.Authorization)
				assert.Equal(t, tc.expectedUserDetails, data.Data.UserDetails)
			}
		})
	}
}

func TestRequireElevatedAdministrationChain(t *testing.T) {
	type elevation struct {
		expires time.Duration
		ip      net.IP
	}

	testCases := []struct {
		name              string
		config            schema.Administration
		elevation         *elevation
		setup             func(mock *mocks.MockAutheliaCtx)
		expected          int
		expectedElevation bool
	}{
		{
			"ShouldAllowElevatedConfiguredOneFactorUser",
			schema.Administration{Enable: true, Users: []string{john}},
			&elevation{time.Minute, net.ParseIP("127.0.0.1")},
			nil,
			fasthttp.StatusOK,
			false,
		},
		{
			"ShouldRequireElevationForConfiguredOneFactorUser",
			schema.Administration{Enable: true, Users: []string{john}},
			nil,
			nil,
			fasthttp.StatusForbidden,
			true,
		},
		{
			"ShouldDenyElevatedUnconfiguredOneFactorUser",
			schema.Administration{Enable: true, Groups: []string{"admins"}},
			&elevation{time.Minute, net.ParseIP("127.0.0.1")},
			func(mock *mocks.MockAutheliaCtx) {
				mock.UserProviderMock.EXPECT().GetDetails(john).Return(&authentication.UserDetails{Username: john, Groups: []string{"users"}}, nil)
			},
			fasthttp.StatusForbidden,
			false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)

			defer mock.Close()

			mock.Ctx.Configuration.Administration = tc.config
			mock.Ctx.Configuration.IdentityValidation.ElevatedSession = schema.IdentityValidationElevatedSession{
				CodeLifespan:      time.Minute,
				ElevationLifespan: time.Minute,
				Characters:        8,
			}
			mock.Ctx.Providers.Clock = &mock.Clock
			mock.Ctx.Request.Header.Set(fasthttp.HeaderXForwardedFor, "127.0.0.1")

			userSession, err := mock.Ctx.GetSession()
			require.NoError(t, err)

			userSession.Username = john
			userSession.AuthenticationMethodRefs.UsernameAndPassword = true
			userSession.AuthenticationMethodRefs.WebAuthn = false

			if tc.elevation != nil {
				userSession.Elevations.User = &session.Elevation{
					ID:       1,
					Expires:  mock.Clock.Now().Add(tc.elevation.expires),
					RemoteIP: tc.elevation.ip,
				}
			}

			require.NoError(t, mock.Ctx.SaveSession(userSession))

			if tc.setup != nil {
				tc.setup(mock)
			}

			handler := middlewares.RequireAdministrationElevated(middlewares.RequireAdministration(NilHandler))

			handler(mock.Ctx)

			assert.Equal(t, tc.expected, mock.Ctx.Response.StatusCode())

			if tc.expected == fasthttp.StatusOK {
				assert.Equal(t, "Example Nil", string(mock.Ctx.Response.Body()))
			} else if tc.expectedElevation {
				data := &struct {
					Status string                                `json:"status"`
					Data   middlewares.ElevatedForbiddenResponse `json:"data"`
				}{}

				require.NoError(t, json.Unmarshal(mock.Ctx.Response.Body(), data))
				assert.True(t, data.Data.Elevation)
			}
		})
	}
}

func TestRequireAdministrationElevated(t *testing.T) {
	testCases := []struct {
		name       string
		level      authentication.Level
		authorized bool
		require2FA bool
		has2FA     bool
		lookupErr  error
		elevated   bool
		expires    time.Duration
		ip         string
		expected   int
		first      bool
		second     bool
		elevation  bool
	}{
		{name: "Anonymous", authorized: true, expected: fasthttp.StatusForbidden, first: true},
		{name: "OneFactorWithoutElevation", level: authentication.OneFactor, authorized: true, expected: fasthttp.StatusForbidden, elevation: true},
		{name: "TwoFactorWithoutElevation", level: authentication.TwoFactor, authorized: true, expected: fasthttp.StatusOK},
		{name: "TwoFactorWithRequiredPolicy", level: authentication.TwoFactor, authorized: true, require2FA: true, expected: fasthttp.StatusOK},
		{name: "TwoFactorWithoutAuthorization", level: authentication.TwoFactor, expected: fasthttp.StatusForbidden},
		{name: "EmailElevation", level: authentication.OneFactor, authorized: true, elevated: true, expires: time.Minute, ip: "127.0.0.1", expected: fasthttp.StatusOK},
		{name: "EmailElevationWithoutAuthorization", level: authentication.OneFactor, elevated: true, expires: time.Minute, ip: "127.0.0.1", expected: fasthttp.StatusForbidden},
		{name: "ExpiredEmailElevation", level: authentication.OneFactor, authorized: true, elevated: true, expires: -time.Minute, ip: "127.0.0.1", expected: fasthttp.StatusForbidden, elevation: true},
		{name: "EmailElevationWrongIP", level: authentication.OneFactor, authorized: true, elevated: true, expires: time.Minute, ip: "127.0.0.2", expected: fasthttp.StatusForbidden, elevation: true},
		{name: "RequiredSecondFactorDeniesEmail", level: authentication.OneFactor, authorized: true, require2FA: true, has2FA: true, elevated: true, expires: time.Minute, ip: "127.0.0.1", expected: fasthttp.StatusForbidden, second: true},
		{name: "RequiredSecondFactorLookupError", level: authentication.OneFactor, authorized: true, require2FA: true, lookupErr: errors.New("lookup failed"), elevated: true, expires: time.Minute, ip: "127.0.0.1", expected: fasthttp.StatusForbidden, second: true},
		{name: "RequiredSecondFactorNotConfiguredAllowsEmail", level: authentication.OneFactor, authorized: true, require2FA: true, elevated: true, expires: time.Minute, ip: "127.0.0.1", expected: fasthttp.StatusOK},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			mock := mocks.NewMockAutheliaCtx(t)
			defer mock.Close()

			mock.Ctx.Providers.Clock = &mock.Clock
			mock.Ctx.Request.Header.Set(fasthttp.HeaderXForwardedFor, "127.0.0.1")
			mock.Ctx.Configuration.Administration = schema.Administration{Enable: true}
			if tc.authorized {
				mock.Ctx.Configuration.Administration.Users = []string{john}
			}
			mock.Ctx.Configuration.IdentityValidation.ElevatedSession = schema.IdentityValidationElevatedSession{RequireSecondFactor: tc.require2FA}
			policy := mock.Ctx.Configuration.IdentityValidation.ElevatedSession

			userSession, err := mock.Ctx.GetSession()
			require.NoError(t, err)
			if tc.level >= authentication.OneFactor {
				userSession.Username = john
				userSession.AuthenticationMethodRefs.UsernameAndPassword = true
				userSession.AuthenticationMethodRefs.WebAuthn = tc.level >= authentication.TwoFactor
			}
			if tc.elevated {
				userSession.Elevations.User = &session.Elevation{ID: 1, Expires: mock.Clock.Now().Add(tc.expires), RemoteIP: net.ParseIP(tc.ip)}
			}
			require.NoError(t, mock.Ctx.SaveSession(userSession))

			if tc.require2FA && tc.level == authentication.OneFactor {
				mock.StorageMock.EXPECT().LoadUserInfo(mock.Ctx, john).Return(model.UserInfo{HasTOTP: tc.has2FA}, tc.lookupErr)
			}

			handler := middlewares.RequireAdministrationElevated(middlewares.RequireAdministration(NilHandler))
			handler(mock.Ctx)

			assert.Equal(t, tc.expected, mock.Ctx.Response.StatusCode())
			assert.Equal(t, policy, mock.Ctx.Configuration.IdentityValidation.ElevatedSession)
			if tc.expected == fasthttp.StatusOK {
				assert.Equal(t, "Example Nil", string(mock.Ctx.Response.Body()))
			} else if tc.first || tc.second || tc.elevation {
				var response struct {
					Data middlewares.ElevatedForbiddenResponse `json:"data"`
				}
				require.NoError(t, json.Unmarshal(mock.Ctx.Response.Body(), &response))
				assert.Equal(t, tc.first, response.Data.FirstFactor)
				assert.Equal(t, tc.second, response.Data.SecondFactor)
				assert.Equal(t, tc.elevation, response.Data.Elevation)
			} else {
				var response struct {
					Data middlewares.AdministrationForbiddenResponse `json:"data"`
				}
				require.NoError(t, json.Unmarshal(mock.Ctx.Response.Body(), &response))
				assert.True(t, response.Data.Authorization)
			}

			if tc.elevation && tc.elevated {
				userSession, err = mock.Ctx.GetSession()
				require.NoError(t, err)
				assert.Nil(t, userSession.Elevations.User)
			}
		})
	}
}

func NilHandler(ctx *middlewares.AutheliaCtx) {
	ctx.SetContentTypeTextPlain()
	ctx.Response.SetBodyString("Example Nil")
}
