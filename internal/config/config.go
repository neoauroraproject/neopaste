package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	ListenAddr   string `json:"listen_addr"`
	DataDir      string `json:"data_dir"`
	SiteName     string `json:"site_name"`
	Domain       string `json:"domain"`
	TLSEnabled   bool   `json:"tls_enabled"`
	CertPath     string `json:"cert_path"`
	KeyPath      string `json:"key_path"`
	AdminUser    string `json:"admin_user"`
	AdminPass    string `json:"admin_pass,omitempty"` // only used on first boot via env/install
	SessionSecret string `json:"session_secret"`
}

func Default() Config {
	return Config{
		ListenAddr:    ":8080",
		DataDir:       "data",
		SiteName:      "NeoPaste",
		Domain:        "",
		TLSEnabled:    false,
		CertPath:      "",
		KeyPath:       "",
		AdminUser:     "admin",
		SessionSecret: "",
	}
}

func Load(path string) (Config, error) {
	cfg := Default()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return cfg, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("parse config: %w", err)
	}
	return cfg, nil
}

func (c Config) Save(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	// never persist plaintext admin password
	out := c
	out.AdminPass = ""
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func (c *Config) ApplyEnv() {
	if v := os.Getenv("NEOPASTE_LISTEN"); v != "" {
		c.ListenAddr = v
	}
	if v := os.Getenv("NEOPASTE_PORT"); v != "" {
		c.ListenAddr = ":" + v
	}
	if v := os.Getenv("NEOPASTE_DATA"); v != "" {
		c.DataDir = v
	}
	if v := os.Getenv("NEOPASTE_SITE_NAME"); v != "" {
		c.SiteName = v
	}
	if v := os.Getenv("NEOPASTE_ADMIN_USER"); v != "" {
		c.AdminUser = v
	}
	if v := os.Getenv("NEOPASTE_ADMIN_PASS"); v != "" {
		c.AdminPass = v
	}
	if v := os.Getenv("NEOPASTE_SESSION_SECRET"); v != "" {
		c.SessionSecret = v
	}
	if v := os.Getenv("NEOPASTE_TLS"); v != "" {
		c.TLSEnabled, _ = strconv.ParseBool(v)
	}
	if v := os.Getenv("NEOPASTE_CERT"); v != "" {
		c.CertPath = v
	}
	if v := os.Getenv("NEOPASTE_KEY"); v != "" {
		c.KeyPath = v
	}
	if v := os.Getenv("NEOPASTE_DOMAIN"); v != "" {
		c.Domain = v
	}
}

func (c Config) DBPath() string {
	return filepath.Join(c.DataDir, "neopaste.db")
}

func (c Config) ConfigPath() string {
	return filepath.Join(c.DataDir, "config.json")
}
