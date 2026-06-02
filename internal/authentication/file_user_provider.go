package authentication

import (
	_ "embed" // Embed users_database.template.yml.
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-crypt/crypt/algorithm"
	"github.com/go-crypt/crypt/algorithm/argon2"
	"github.com/go-crypt/crypt/algorithm/bcrypt"
	"github.com/go-crypt/crypt/algorithm/pbkdf2"
	"github.com/go-crypt/crypt/algorithm/scrypt"
	"github.com/go-crypt/crypt/algorithm/shacrypt"

	"github.com/authelia/authelia/v4/internal/configuration/schema"
	"github.com/authelia/authelia/v4/internal/expression"
	"github.com/authelia/authelia/v4/internal/logging"
)

// FileUserProvider is a provider reading details from a file.
type FileUserProvider struct {
	config        *schema.AuthenticationBackendFile
	hash          algorithm.Hash
	database      FileUserProviderDatabase
	mutex         sync.Mutex
	timeoutReload time.Time
}

// NewFileUserProvider creates a new instance of FileUserProvider.
func NewFileUserProvider(config *schema.AuthenticationBackendFile) (provider *FileUserProvider) {
	return &FileUserProvider{
		config:        config,
		timeoutReload: time.Now().Add(-1 * time.Second),
		database:      NewFileUserDatabase(config.Path, config.Search.Email, config.Search.CaseInsensitive, getExtra(config)),
	}
}

func getExtra(config *schema.AuthenticationBackendFile) (extra map[string]expression.ExtraAttribute) {
	extra = make(map[string]expression.ExtraAttribute, len(config.ExtraAttributes))

	if len(config.ExtraAttributes) != 0 {
		for name, attribute := range config.ExtraAttributes {
			extra[name] = attribute
		}
	}

	return extra
}

// Reload the database.
func (p *FileUserProvider) Reload() (reloaded bool, err error) {
	now := time.Now()

	p.mutex.Lock()

	defer p.mutex.Unlock()

	if now.Before(p.timeoutReload) {
		return false, &errReload{err: ErrWatcherCooldown}
	}

	switch err = p.database.Load(); {
	case err == nil:
		p.setTimeoutReload(now)
	case errors.Is(err, ErrWatcherNoContent):
		return false, &errReload{err: err}
	default:
		return false, &errReload{err: fmt.Errorf("failed to reload: %w", err), critical: true}
	}

	p.setTimeoutReload(now)

	return true, nil
}

func (p *FileUserProvider) Close() (err error) {
	return nil
}

// CreateUser creates a new user in the file backend.
func (p *FileUserProvider) CreateUser(details UserDetailsCreate) (err error) {
	if strings.TrimSpace(details.Username) == "" || strings.TrimSpace(details.Password) == "" || strings.TrimSpace(details.DisplayName) == "" || strings.TrimSpace(details.Email) == "" {
		return ErrOperationFailed
	}

	if _, err = p.database.GetUserDetails(details.Username); err == nil {
		return ErrUserAlreadyExists
	} else if !errors.Is(err, ErrUserNotFound) {
		return err
	}

	var digest algorithm.Digest

	if digest, err = p.hash.Hash(details.Password); err != nil {
		return fmt.Errorf("%w : %v", ErrOperationFailed, err)
	}

	user := FileUserDatabaseUserDetails{
		Username:    details.Username,
		Password:    schema.NewPasswordDigest(digest),
		Disabled:    details.Disabled,
		DisplayName: details.DisplayName,
		Email:       details.Email,
		Groups:      details.Groups,
	}

	if err = p.database.CreateUserDetails(details.Username, &user); err != nil {
		if errors.Is(err, ErrUserAlreadyExists) {
			return ErrUserAlreadyExists
		}

		return fmt.Errorf("%w : %v", ErrOperationFailed, err)
	}

	p.mutex.Lock()
	p.setTimeoutReload(time.Now())
	p.mutex.Unlock()

	return nil
}

func (p *FileUserProvider) AdminCapabilities() (capabilities UserProviderAdminCapabilities) {
	return UserProviderAdminCapabilities{Create: true, List: true, Read: true, Update: true, ResetPassword: true, Delete: true}
}

func (p *FileUserProvider) AdminListUsers(filter UserProviderAdminListFilter) (result UserProviderAdminListResult, err error) {
	var users []FileUserDatabaseUserDetails

	if users, err = p.database.ListUserDetails(); err != nil {
		return result, err
	}

	search := strings.ToLower(strings.TrimSpace(filter.Search))

	for _, user := range users {
		details := user.ToAdminUserDetails()
		if search != "" && !details.Matches(search) {
			continue
		}

		result.Users = append(result.Users, details)
	}

	sort.Slice(result.Users, func(i, j int) bool { return result.Users[i].Username < result.Users[j].Username })
	result.Total = len(result.Users)

	return result, nil
}

func (p *FileUserProvider) AdminGetUser(username string) (details UserProviderAdminUserDetails, err error) {
	var user FileUserDatabaseUserDetails

	if user, err = p.database.GetUserDetails(username); err != nil {
		return details, err
	}

	return user.ToAdminUserDetails(), nil
}

func (p *FileUserProvider) AdminUpdateUser(username string, update UserProviderAdminUserUpdate) (details UserProviderAdminUserDetails, err error) {
	if update.Email != nil && strings.TrimSpace(*update.Email) == "" {
		return details, ErrOperationFailed
	}

	var user FileUserDatabaseUserDetails

	if user, err = p.database.UpdateUserDetails(username, func(current *FileUserDatabaseUserDetails) (err error) {
		if update.DisplayName != nil {
			current.DisplayName = *update.DisplayName
		}

		if update.Email != nil {
			current.Email = *update.Email
		}

		if update.Groups != nil {
			current.Groups = *update.Groups
		}

		if update.Disabled != nil {
			current.Disabled = *update.Disabled
		}

		return nil
	}); err != nil {
		return details, err
	}

	p.mutex.Lock()
	p.setTimeoutReload(time.Now())
	p.mutex.Unlock()

	return user.ToAdminUserDetails(), nil
}

func (p *FileUserProvider) AdminDeleteUser(username string) (err error) {
	if err = p.database.DeleteUserDetails(username); err != nil {
		return err
	}

	p.mutex.Lock()
	p.setTimeoutReload(time.Now())
	p.mutex.Unlock()

	return nil
}

func (p *FileUserProvider) AdminResetUserPassword(username string, password string) (err error) {
	var digest algorithm.Digest

	if digest, err = p.hash.Hash(password); err != nil {
		return err
	}

	if _, err = p.database.UpdateUserDetails(username, func(current *FileUserDatabaseUserDetails) (err error) {
		current.Password = schema.NewPasswordDigest(digest)
		return nil
	}); err != nil {
		return err
	}

	p.mutex.Lock()
	p.setTimeoutReload(time.Now())
	p.mutex.Unlock()

	return nil
}

// CheckUserPassword checks if provided password matches for the given user.
func (p *FileUserProvider) CheckUserPassword(username string, password string) (match bool, err error) {
	var details FileUserDatabaseUserDetails

	if details, err = p.database.GetUserDetails(username); err != nil {
		return false, err
	}

	if details.Disabled {
		return false, ErrUserNotFound
	}

	return details.Password.MatchAdvanced(password)
}

// GetDetails retrieve the groups a user belongs to.
func (p *FileUserProvider) GetDetails(username string) (details *UserDetails, err error) {
	var d FileUserDatabaseUserDetails

	if d, err = p.database.GetUserDetails(username); err != nil {
		return nil, err
	}

	if d.Disabled {
		return nil, ErrUserNotFound
	}

	return d.ToUserDetails(), nil
}

func (p *FileUserProvider) GetDetailsExtended(username string) (details *UserDetailsExtended, err error) {
	var d FileUserDatabaseUserDetails

	if d, err = p.database.GetUserDetails(username); err != nil {
		return nil, err
	}

	if d.Disabled {
		return nil, ErrUserNotFound
	}

	return d.ToExtendedUserDetails(), nil
}

// UpdatePassword update the password of the given user.
func (p *FileUserProvider) UpdatePassword(username string, newPassword string) (err error) {
	var digest algorithm.Digest

	if digest, err = p.hash.Hash(newPassword); err != nil {
		return err
	}

	if _, err = p.database.UpdateUserDetails(username, func(details *FileUserDatabaseUserDetails) (err error) {
		if details.Disabled {
			return ErrUserNotFound
		}

		details.Password = schema.NewPasswordDigest(digest)

		return nil
	}); err != nil {
		return err
	}

	p.mutex.Lock()

	p.setTimeoutReload(time.Now())

	p.mutex.Unlock()

	return nil
}

func (p *FileUserProvider) ChangePassword(username string, oldPassword string, newPassword string) (err error) {
	var details FileUserDatabaseUserDetails

	if details, err = p.database.GetUserDetails(username); err != nil {
		return fmt.Errorf("%w : %v", ErrUserNotFound, err)
	}

	if details.Disabled {
		return ErrUserNotFound
	}

	if strings.TrimSpace(newPassword) == "" {
		return ErrPasswordWeak
	}

	if oldPassword == newPassword {
		return ErrPasswordWeak
	}

	oldPasswordCorrect, err := p.CheckUserPassword(username, oldPassword)
	if err != nil {
		return ErrAuthenticationFailed
	}

	if !oldPasswordCorrect {
		return ErrIncorrectPassword
	}

	var digest algorithm.Digest

	if digest, err = p.hash.Hash(newPassword); err != nil {
		return fmt.Errorf("%w : %v", ErrOperationFailed, err)
	}

	if _, err = p.database.UpdateUserDetails(details.Username, func(current *FileUserDatabaseUserDetails) (err error) {
		current.Password = schema.NewPasswordDigest(digest)

		return nil
	}); err != nil {
		return fmt.Errorf("%w : %v", ErrOperationFailed, err)
	}

	p.mutex.Lock()

	p.setTimeoutReload(time.Now())

	p.mutex.Unlock()

	return nil
}

// StartupCheck implements the startup check provider interface.
func (p *FileUserProvider) StartupCheck() (err error) {
	if err = checkDatabase(p.config.Path); err != nil {
		logging.Logger().WithError(err).Errorf("Error checking user authentication YAML database")

		return fmt.Errorf("one or more errors occurred checking the authentication database")
	}

	if p.hash, err = NewFileCryptoHashFromConfig(p.config.Password); err != nil {
		return err
	}

	if p.database == nil {
		p.database = NewFileUserDatabase(p.config.Path, p.config.Search.Email, p.config.Search.CaseInsensitive, getExtra(p.config))
	}

	if err = p.database.Load(); err != nil {
		return err
	}

	return nil
}

func (p *FileUserProvider) setTimeoutReload(now time.Time) {
	p.timeoutReload = now.Add(time.Second / 2)
}

func (m FileUserDatabaseUserDetails) ToAdminUserDetails() (details UserProviderAdminUserDetails) {
	return UserProviderAdminUserDetails{
		Username:    m.Username,
		DisplayName: m.DisplayName,
		Email:       m.Email,
		Groups:      m.Groups,
		Disabled:    m.Disabled,
	}
}

func (m UserProviderAdminUserDetails) Matches(search string) bool {
	return strings.Contains(strings.ToLower(m.Username), search) ||
		strings.Contains(strings.ToLower(m.DisplayName), search) ||
		strings.Contains(strings.ToLower(m.Email), search)
}

// NewFileCryptoHashFromConfig returns a crypt.Hash given a valid configuration.
func NewFileCryptoHashFromConfig(config schema.AuthenticationBackendFilePassword) (hash algorithm.Hash, err error) {
	switch config.Algorithm {
	case hashArgon2, "":
		hash, err = argon2.New(
			argon2.WithVariantName(config.Argon2.Variant),
			argon2.WithT(config.Argon2.Iterations),
			argon2.WithM(uint32(config.Argon2.Memory)), //nolint:gosec // Validated at runtime.
			argon2.WithP(config.Argon2.Parallelism),
			argon2.WithK(config.Argon2.KeyLength),
			argon2.WithS(config.Argon2.SaltLength),
		)
	case hashSHA2Crypt:
		hash, err = shacrypt.New(
			shacrypt.WithVariantName(config.SHA2Crypt.Variant),
			shacrypt.WithIterations(config.SHA2Crypt.Iterations),
			shacrypt.WithSaltLength(config.SHA2Crypt.SaltLength),
		)
	case hashPBKDF2:
		hash, err = pbkdf2.New(
			pbkdf2.WithVariantName(config.PBKDF2.Variant),
			pbkdf2.WithIterations(config.PBKDF2.Iterations),
			pbkdf2.WithSaltLength(config.PBKDF2.SaltLength),
		)
	case hashScrypt:
		hash, err = scrypt.New(
			scrypt.WithVariantName(config.Scrypt.Variant),
			scrypt.WithLN(config.Scrypt.Iterations),
			scrypt.WithP(config.Scrypt.Parallelism),
			scrypt.WithR(config.Scrypt.BlockSize),
			scrypt.WithKeyLength(config.Scrypt.KeyLength),
			scrypt.WithSaltLength(config.Scrypt.SaltLength),
		)
	case hashBcrypt:
		hash, err = bcrypt.New(
			bcrypt.WithVariantName(config.Bcrypt.Variant),
			bcrypt.WithIterations(config.Bcrypt.Cost),
		)
	default:
		return nil, fmt.Errorf("algorithm '%s' is unknown", config.Algorithm)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to initialize hash settings: %w", err)
	}

	return hash, nil
}

func checkDatabase(path string) (err error) {
	if _, err = os.Stat(path); os.IsNotExist(err) {
		if err = os.WriteFile(path, userYAMLTemplate, 0600); err != nil {
			return fmt.Errorf("user authentication database file doesn't exist at path '%s' and could not be generated: %w", path, err)
		}

		return fmt.Errorf("user authentication database file doesn't exist at path '%s' and has been generated", path)
	} else if err != nil {
		return fmt.Errorf("error checking user authentication database file: %w", err)
	}

	return nil
}

//go:embed users_database.template.yml
var userYAMLTemplate []byte
