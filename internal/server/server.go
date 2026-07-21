package server

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/neoauroraproject/neopaste/internal/admin"
	"github.com/neoauroraproject/neopaste/internal/config"
	"github.com/neoauroraproject/neopaste/internal/paste"
	"github.com/neoauroraproject/neopaste/internal/store"
)

type Server struct {
	cfg     *config.Config
	store   *store.Store
	paste   *paste.Handler
	admin   *admin.Handler
	webFS   fs.FS
	httpSrv *http.Server
	mu      sync.Mutex
	tlsCert *tls.Certificate
}

func New(cfg *config.Config, st *store.Store, webFS fs.FS) *Server {
	s := &Server{
		cfg:   cfg,
		store: st,
		paste: paste.NewHandler(st),
		admin: admin.NewHandler(st),
		webFS: webFS,
	}
	s.admin.OnTLSChange = s.reloadTLS
	return s
}

func (s *Server) StartExpiryWorker(stop <-chan struct{}) {
	s.paste.StartExpiryWorker(stop)
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/public-config", s.publicConfig)
	mux.HandleFunc("POST /api/pastes", s.paste.Create)
	mux.HandleFunc("GET /api/pastes/{id}", s.paste.Meta)
	mux.HandleFunc("POST /api/pastes/{id}/unlock", s.paste.Unlock)

	mux.HandleFunc("POST /api/admin/login", s.admin.Login)
	mux.HandleFunc("POST /api/admin/logout", s.admin.Logout)
	mux.HandleFunc("GET /api/admin/me", s.admin.Me)
	mux.HandleFunc("GET /api/admin/settings", s.admin.GetSettings)
	mux.HandleFunc("PUT /api/admin/settings", s.admin.PutSettings)

	static, err := fs.Sub(s.webFS, "dist")
	if err != nil {
		log.Printf("web embed missing dist: %v", err)
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			http.Error(w, "UI not built", http.StatusServiceUnavailable)
		})
	} else {
		fileServer := http.FileServer(http.FS(static))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			path := r.URL.Path
			if strings.HasPrefix(path, "/api/") {
				http.NotFound(w, r)
				return
			}
			// SPA fallback
			if path != "/" && !strings.Contains(strings.TrimPrefix(path, "/"), ".") {
				r2 := r.Clone(r.Context())
				r2.URL.Path = "/"
				fileServer.ServeHTTP(w, r2)
				return
			}
			fileServer.ServeHTTP(w, r)
		})
	}

	return s.withSecurityHeaders(mux)
}

func (s *Server) publicConfig(w http.ResponseWriter, r *http.Request) {
	st, err := s.store.GetSettings()
	if err != nil {
		http.Error(w, `{"error":"خطا"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"site_name":   st.SiteName,
		"domain":      st.Domain,
		"tls_enabled": st.TLSEnabled,
	})
}

func (s *Server) withSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")
		if r.TLS != nil {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) ListenAndServe() error {
	handler := s.Handler()
	s.httpSrv = &http.Server{
		Addr:              s.cfg.ListenAddr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	st, err := s.store.GetSettings()
	if err != nil {
		return err
	}
	if st.TLSEnabled && st.CertPath != "" && st.KeyPath != "" {
		cert, err := tls.LoadX509KeyPair(st.CertPath, st.KeyPath)
		if err != nil {
			return fmt.Errorf("load TLS: %w", err)
		}
		s.mu.Lock()
		s.tlsCert = &cert
		s.mu.Unlock()
		s.httpSrv.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
			GetCertificate: func(info *tls.ClientHelloInfo) (*tls.Certificate, error) {
				s.mu.Lock()
				defer s.mu.Unlock()
				if s.tlsCert == nil {
					return nil, fmt.Errorf("no certificate")
				}
				return s.tlsCert, nil
			},
		}
		log.Printf("NeoPaste listening HTTPS on %s", s.cfg.ListenAddr)
		return s.httpSrv.ListenAndServeTLS("", "")
	}

	log.Printf("NeoPaste listening HTTP on %s", s.cfg.ListenAddr)
	return s.httpSrv.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.httpSrv == nil {
		return nil
	}
	return s.httpSrv.Shutdown(ctx)
}

func (s *Server) reloadTLS() {
	st, err := s.store.GetSettings()
	if err != nil {
		log.Printf("reload TLS settings: %v", err)
		return
	}
	if !st.TLSEnabled || st.CertPath == "" || st.KeyPath == "" {
		s.mu.Lock()
		s.tlsCert = nil
		s.mu.Unlock()
		log.Printf("TLS disabled in settings — restart service to apply HTTP mode")
		return
	}
	cert, err := tls.LoadX509KeyPair(st.CertPath, st.KeyPath)
	if err != nil {
		log.Printf("reload TLS cert failed: %v", err)
		return
	}
	s.mu.Lock()
	s.tlsCert = &cert
	s.mu.Unlock()
	log.Printf("TLS certificate reloaded")
}
