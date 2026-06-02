package authentication

import (
	"github.com/authelia/authelia/v4/internal/model"
)

// UserProvider is the interface for interacting with the authentication backends.
type UserProvider interface {
	model.StartupCheck

	// CreateUser creates a user in the authentication backend.
	CreateUser(details UserDetailsCreate) (err error)

	AdminCapabilities() (capabilities UserProviderAdminCapabilities)

	AdminListUsers(filter UserProviderAdminListFilter) (result UserProviderAdminListResult, err error)

	AdminGetUser(username string) (details UserProviderAdminUserDetails, err error)

	AdminUpdateUser(username string, details UserProviderAdminUserUpdate) (updated UserProviderAdminUserDetails, err error)

	AdminResetUserPassword(username string, password string) (err error)

	AdminDeleteUser(username string) (err error)

	// CheckUserPassword is used to check if a password matches for a specific user.
	CheckUserPassword(username string, password string) (valid bool, err error)

	// GetDetails is used to get a user's information.
	GetDetails(username string) (details *UserDetails, err error)

	GetDetailsExtended(username string) (details *UserDetailsExtended, err error)

	// UpdatePassword is used to change a user's password without verifying their old password.
	UpdatePassword(username string, newPassword string) (err error)

	// ChangePassword is used to change a user's password but requires their old password to be successfully verified.
	ChangePassword(username string, oldPassword string, newPassword string) (err error)

	Close() (err error)
}

// UserDetailsCreate is the model used to create a user in the authentication backend.
type UserDetailsCreate struct {
	Username    string
	Password    string
	DisplayName string
	Email       string
	Groups      []string
	Disabled    bool
}

type UserProviderAdminCapabilities struct {
	Create        bool `json:"create"`
	List          bool `json:"list"`
	Read          bool `json:"read"`
	Update        bool `json:"update"`
	ResetPassword bool `json:"reset_password"`
	Delete        bool `json:"delete"`
}

type UserProviderAdminListFilter struct {
	Search string
}

type UserProviderAdminListResult struct {
	Users []UserProviderAdminUserDetails `json:"users"`
	Total int                            `json:"total"`
}

type UserProviderAdminUserDetails struct {
	Username    string   `json:"username"`
	DisplayName string   `json:"display_name"`
	Email       string   `json:"email"`
	Groups      []string `json:"groups"`
	Disabled    bool     `json:"disabled"`
}

type UserProviderAdminUserUpdate struct {
	DisplayName *string
	Email       *string
	Groups      *[]string
	Disabled    *bool
}
