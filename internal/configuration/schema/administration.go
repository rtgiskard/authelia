package schema

// Administration represents the administrator control plane configuration.
type Administration struct {
	Enable bool `koanf:"enable" yaml:"enable,omitempty" toml:"enable,omitempty" json:"enable,omitempty" jsonschema:"default=false,title=Enable" jsonschema_description:"Enables the administrator control plane API. This is disabled by default."`

	Users  []string `koanf:"users" yaml:"users,omitempty" toml:"users,omitempty" json:"users,omitempty" jsonschema:"title=Users" jsonschema_description:"The users allowed to access the administrator control plane."`
	Groups []string `koanf:"groups" yaml:"groups,omitempty" toml:"groups,omitempty" json:"groups,omitempty" jsonschema:"title=Groups" jsonschema_description:"The groups allowed to access the administrator control plane."`
}
