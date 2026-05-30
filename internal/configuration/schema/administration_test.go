package schema

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAdministrationDefaults(t *testing.T) {
	config := Configuration{}

	assert.False(t, config.Administration.Enable)
	assert.Empty(t, config.Administration.Users)
	assert.Empty(t, config.Administration.Groups)
}
