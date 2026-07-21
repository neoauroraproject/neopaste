package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	npcrypto "github.com/neoauroraproject/neopaste/internal/crypto"
	"github.com/neoauroraproject/neopaste/internal/config"
	"github.com/neoauroraproject/neopaste/internal/server"
	"github.com/neoauroraproject/neopaste/internal/store"
	"github.com/neoauroraproject/neopaste/web"
)

func main() {
	dataDir := flag.String("data", "", "data directory")
	listen := flag.String("listen", "", "listen address, e.g. :8080")
	flag.Parse()

	cfg := config.Default()
	if *dataDir != "" {
		cfg.DataDir = *dataDir
	}
	cfgPath := filepath.Join(cfg.DataDir, "config.json")
	if loaded, err := config.Load(cfgPath); err == nil {
		cfg = loaded
		if *dataDir != "" {
			cfg.DataDir = *dataDir
		}
	}
	cfg.ApplyEnv()
	if *listen != "" {
		cfg.ListenAddr = *listen
	}
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		log.Fatalf("data dir: %v", err)
	}

	if cfg.SessionSecret == "" {
		secret, err := randomHex(32)
		if err != nil {
			log.Fatalf("session secret: %v", err)
		}
		cfg.SessionSecret = secret
	}

	st, err := store.Open(cfg.DBPath())
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer st.Close()

	// Seed settings only when still defaults / empty certs from install env
	dbSettings, err := st.GetSettings()
	if err != nil {
		log.Fatalf("settings: %v", err)
	}
	seed := store.Settings{
		SiteName:   cfg.SiteName,
		Domain:     cfg.Domain,
		TLSEnabled: cfg.TLSEnabled,
		CertPath:   cfg.CertPath,
		KeyPath:    cfg.KeyPath,
	}
	if dbSettings.SiteName == "NeoPaste" && cfg.SiteName != "" && cfg.SiteName != "NeoPaste" {
		dbSettings.SiteName = seed.SiteName
	}
	if dbSettings.Domain == "" && seed.Domain != "" {
		dbSettings.Domain = seed.Domain
	}
	if !dbSettings.TLSEnabled && seed.TLSEnabled {
		dbSettings.TLSEnabled = seed.TLSEnabled
		dbSettings.CertPath = seed.CertPath
		dbSettings.KeyPath = seed.KeyPath
	}
	_ = st.UpdateSettings(dbSettings)
	// keep cfg in sync for TLS listen decision
	cfg.SiteName = dbSettings.SiteName
	cfg.Domain = dbSettings.Domain
	cfg.TLSEnabled = dbSettings.TLSEnabled
	cfg.CertPath = dbSettings.CertPath
	cfg.KeyPath = dbSettings.KeyPath

	adminUser := cfg.AdminUser
	if adminUser == "" {
		adminUser = "admin"
	}
	pass := cfg.AdminPass
	if pass == "" {
		pass = os.Getenv("NEOPASTE_ADMIN_PASS")
	}
	existing, err := st.GetAdmin()
	if err != nil {
		log.Fatalf("admin: %v", err)
	}
	if existing == nil {
		if pass == "" {
			generated, err := npcrypto.RandomToken(18)
			if err != nil {
				log.Fatalf("generate admin pass: %v", err)
			}
			pass = generated
			fmt.Fprintf(os.Stderr, "\n=== NeoPaste first boot ===\nAdmin user: %s\nAdmin pass: %s\nSave this password!\n===========================\n\n", adminUser, pass)
		}
		hash, err := npcrypto.HashPassword(pass)
		if err != nil {
			log.Fatalf("hash admin: %v", err)
		}
		if err := st.UpsertAdmin(adminUser, hash); err != nil {
			log.Fatalf("create admin: %v", err)
		}
	}

	cfg.AdminPass = ""
	if err := cfg.Save(filepath.Join(cfg.DataDir, "config.json")); err != nil {
		log.Printf("warn: save config: %v", err)
	}

	srv := server.New(&cfg, st, web.Dist)
	stopWorker := make(chan struct{})
	srv.StartExpiryWorker(stopWorker)

	go func() {
		if err := srv.ListenAndServe(); err != nil && err.Error() != "http: Server closed" {
			log.Fatalf("server: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	close(stopWorker)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
