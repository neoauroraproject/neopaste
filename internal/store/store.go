package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

type Paste struct {
	ID              string
	Ciphertext      string
	Salt            string
	IV              string
	PasswordVerify  string
	ExpiresAt       time.Time
	BurnAfterRead   bool
	CreatedAt       time.Time
	FailCount       int
	LockedUntil     *time.Time
}

type Settings struct {
	SiteName   string `json:"site_name"`
	Domain     string `json:"domain"`
	TLSEnabled bool   `json:"tls_enabled"`
	CertPath   string `json:"cert_path"`
	KeyPath    string `json:"key_path"`
}

type Admin struct {
	Username     string
	PasswordHash string
}

func Open(dbPath string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", dbPath+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	schema := `
CREATE TABLE IF NOT EXISTS pastes (
  id TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  salt TEXT NOT NULL,
  iv TEXT NOT NULL,
  password_verify TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  burn_after_read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  site_name TEXT NOT NULL DEFAULT 'NeoPaste',
  domain TEXT NOT NULL DEFAULT '',
  tls_enabled INTEGER NOT NULL DEFAULT 0,
  cert_path TEXT NOT NULL DEFAULT '',
  key_path TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS admin (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings (id, site_name) VALUES (1, 'NeoPaste');
`
	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) CreatePaste(p Paste) error {
	_, err := s.db.Exec(`
INSERT INTO pastes (id, ciphertext, salt, iv, password_verify, expires_at, burn_after_read, created_at, fail_count)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
		p.ID, p.Ciphertext, p.Salt, p.IV, p.PasswordVerify,
		p.ExpiresAt.Unix(), boolToInt(p.BurnAfterRead), p.CreatedAt.Unix(),
	)
	return err
}

func (s *Store) GetPaste(id string) (*Paste, error) {
	row := s.db.QueryRow(`
SELECT id, ciphertext, salt, iv, password_verify, expires_at, burn_after_read, created_at, fail_count, locked_until
FROM pastes WHERE id = ?`, id)

	var p Paste
	var expires, created int64
	var burn int
	var locked sql.NullInt64
	err := row.Scan(&p.ID, &p.Ciphertext, &p.Salt, &p.IV, &p.PasswordVerify,
		&expires, &burn, &created, &p.FailCount, &locked)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	p.ExpiresAt = time.Unix(expires, 0)
	p.CreatedAt = time.Unix(created, 0)
	p.BurnAfterRead = burn == 1
	if locked.Valid {
		t := time.Unix(locked.Int64, 0)
		p.LockedUntil = &t
	}
	return &p, nil
}

func (s *Store) DeletePaste(id string) error {
	_, err := s.db.Exec(`DELETE FROM pastes WHERE id = ?`, id)
	return err
}

func (s *Store) IncrementFail(id string, failCount int, lockedUntil *time.Time) error {
	var locked any
	if lockedUntil != nil {
		locked = lockedUntil.Unix()
	}
	_, err := s.db.Exec(`UPDATE pastes SET fail_count = ?, locked_until = ? WHERE id = ?`, failCount, locked, id)
	return err
}

func (s *Store) ResetFails(id string) error {
	_, err := s.db.Exec(`UPDATE pastes SET fail_count = 0, locked_until = NULL WHERE id = ?`, id)
	return err
}

func (s *Store) DeleteExpired(now time.Time) (int64, error) {
	res, err := s.db.Exec(`DELETE FROM pastes WHERE expires_at <= ?`, now.Unix())
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (s *Store) Vacuum() error {
	_, err := s.db.Exec(`VACUUM`)
	return err
}

func (s *Store) GetSettings() (Settings, error) {
	var st Settings
	var tls int
	err := s.db.QueryRow(`SELECT site_name, domain, tls_enabled, cert_path, key_path FROM settings WHERE id = 1`).
		Scan(&st.SiteName, &st.Domain, &tls, &st.CertPath, &st.KeyPath)
	if err != nil {
		return st, err
	}
	st.TLSEnabled = tls == 1
	return st, nil
}

func (s *Store) UpdateSettings(st Settings) error {
	_, err := s.db.Exec(`
UPDATE settings SET site_name = ?, domain = ?, tls_enabled = ?, cert_path = ?, key_path = ? WHERE id = 1`,
		st.SiteName, st.Domain, boolToInt(st.TLSEnabled), st.CertPath, st.KeyPath,
	)
	return err
}

func (s *Store) GetAdmin() (*Admin, error) {
	var a Admin
	err := s.db.QueryRow(`SELECT username, password_hash FROM admin WHERE id = 1`).Scan(&a.Username, &a.PasswordHash)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *Store) UpsertAdmin(username, passwordHash string) error {
	_, err := s.db.Exec(`
INSERT INTO admin (id, username, password_hash) VALUES (1, ?, ?)
ON CONFLICT(id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash`,
		username, passwordHash,
	)
	return err
}

func (s *Store) CreateSession(token string, expires time.Time) error {
	_, err := s.db.Exec(`INSERT INTO sessions (token, expires_at) VALUES (?, ?)`, token, expires.Unix())
	return err
}

func (s *Store) ValidSession(token string, now time.Time) (bool, error) {
	var expires int64
	err := s.db.QueryRow(`SELECT expires_at FROM sessions WHERE token = ?`, token).Scan(&expires)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if expires <= now.Unix() {
		_, _ = s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
		return false, nil
	}
	return true, nil
}

func (s *Store) DeleteSession(token string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func (s *Store) CleanSessions(now time.Time) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE expires_at <= ?`, now.Unix())
	return err
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func EnsureAdmin(s *Store, username, passwordHash string) error {
	a, err := s.GetAdmin()
	if err != nil {
		return err
	}
	if a != nil {
		return nil
	}
	if passwordHash == "" {
		return fmt.Errorf("admin password required on first run")
	}
	return s.UpsertAdmin(username, passwordHash)
}
