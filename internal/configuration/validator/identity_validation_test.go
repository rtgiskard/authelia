// SPDX-FileCopyrightText: 2026 Authelia
//
// SPDX-License-Identifier: Apache-2.0

package validator

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/authelia/authelia/v4/internal/configuration/schema"
)

func TestShouldRaiseErrorWithUndefinedJWTSecretKey(t *testing.T) {
	validator := schema.NewStructValidator()
	config := newDefaultConfig()
	config.IdentityValidation.ResetPassword.JWTSecret = ""

	ValidateConfiguration(&config, validator)
	require.Len(t, validator.Errors(), 1)
	require.Len(t, validator.Warnings(), 1)

	assert.EqualError(t, validator.Errors()[0], "identity_validation: reset_password: option 'jwt_secret' is required when the reset password functionality isn't disabled")
	assert.EqualError(t, validator.Warnings()[0], "access_control: no rules have been specified so the 'default_policy' of 'two_factor' is going to be applied to all requests")
}

func TestShouldErrorOnInvalidAlgorithms(t *testing.T) {
	validator := schema.NewStructValidator()
	config := newDefaultConfig()
	config.IdentityValidation.ResetPassword.JWTAlgorithm = "RS256"

	ValidateConfiguration(&config, validator)
	require.Len(t, validator.Errors(), 1)
	require.Len(t, validator.Warnings(), 1)

	assert.EqualError(t, validator.Errors()[0], "identity_validation: reset_password: option 'jwt_algorithm' must be one of 'HS256', 'HS384', or 'HS512' but it's configured as 'RS256'")
	assert.EqualError(t, validator.Warnings()[0], "access_control: no rules have been specified so the 'default_policy' of 'two_factor' is going to be applied to all requests")
}

func TestShouldErrorOnInvalidCharLen(t *testing.T) {
	validator := schema.NewStructValidator()
	config := newDefaultConfig()
	config.IdentityValidation.ElevatedSession.Characters = 40

	ValidateConfiguration(&config, validator)
	require.Len(t, validator.Errors(), 1)
	require.Len(t, validator.Warnings(), 1)

	assert.EqualError(t, validator.Errors()[0], "identity_validation: elevated_session: option 'characters' must be 20 or less but it's configured as 40")
	assert.EqualError(t, validator.Warnings()[0], "access_control: no rules have been specified so the 'default_policy' of 'two_factor' is going to be applied to all requests")
}

func TestShouldApplyResetPasswordLifespanFallbackAndPreserveOverrides(t *testing.T) {
	for _, tc := range []struct {
		name     string
		lifespan time.Duration
		expected time.Duration
	}{
		{"unset", 0, schema.DefaultIdentityValidation.ResetPassword.JWTExpiration},
		{"negative", -time.Minute, schema.DefaultIdentityValidation.ResetPassword.JWTExpiration},
		{"shorter override", 5 * time.Minute, 5 * time.Minute},
		{"previous default override", 30 * time.Minute, 30 * time.Minute},
		{"longer override", 4 * time.Hour, 4 * time.Hour},
	} {
		t.Run(tc.name, func(t *testing.T) {
			validator := schema.NewStructValidator()
			config := newDefaultConfig()
			config.IdentityValidation.ResetPassword.JWTExpiration = tc.lifespan

			ValidateIdentityValidation(&config, validator)

			assert.Empty(t, validator.Errors())
			assert.Equal(t, tc.expected, config.IdentityValidation.ResetPassword.JWTExpiration)
		})
	}
}
