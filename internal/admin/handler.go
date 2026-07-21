package admin

import (
	"encoding/json"
	"net/http"
	"os"
	"sync"
	"time"

	npcrypto "github.com/neoauroraproject/neopaste/internal/crypto"
	"github.com/neoauroraproject/neopaste/internal/store"
)

const (
	sessionCookie = "neopaste_session"
	sessionTTL    = 24 * time.Hour
)

type Handler struct {
	Store       *store.Store
	OnTLSChange func()
	mu          sync.Mutex
	loginHits   map[string]*bucket
}

type bucket struct {
	count int
	reset time.Time
}

func NewHandler(s *store.Store) *Handler {
	return &Handler{
		Store:     s,
		loginHits: make(map[string]*bucket),
	}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type settingsRequest struct {
	SiteName     string `json:"site_name"`
	Domain       string `json:"domain"`
	TLSEnabled   bool   `json:"tls_enabled"`
	CertPath     string `json:"cert_path"`
	KeyPath      string `json:"key_path"`
	ToolsEnabled bool   `json:"tools_enabled"`
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.allowLogin(r) {
		writeErr(w, http.StatusTooManyRequests, "تعداد تلاش‌ها زیاد است")
		return
	}
	var req loginRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "درخواست نامعتبر")
		return
	}
	admin, err := h.Store.GetAdmin()
	if err != nil || admin == nil {
		writeErr(w, http.StatusInternalServerError, "ادمین پیکربندی نشده")
		return
	}
	if req.Username != admin.Username || !npcrypto.CheckPassword(admin.PasswordHash, req.Password) {
		writeErr(w, http.StatusUnauthorized, "نام کاربری یا رمز اشتباه است")
		return
	}
	token, err := npcrypto.RandomToken(32)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "خطای داخلی")
		return
	}
	expires := time.Now().UTC().Add(sessionTTL)
	if err := h.Store.CreateSession(token, expires); err != nil {
		writeErr(w, http.StatusInternalServerError, "خطای داخلی")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   r.TLS != nil,
		Expires:  expires,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "username": admin.Username})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		_ = h.Store.DeleteSession(c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(r) {
		writeErr(w, http.StatusUnauthorized, "نیاز به ورود")
		return
	}
	admin, err := h.Store.GetAdmin()
	if err != nil || admin == nil {
		writeErr(w, http.StatusInternalServerError, "خطا")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "username": admin.Username})
}

func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(r) {
		writeErr(w, http.StatusUnauthorized, "نیاز به ورود")
		return
	}
	st, err := h.Store.GetSettings()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "خطا در خواندن تنظیمات")
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *Handler) PutSettings(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(r) {
		writeErr(w, http.StatusUnauthorized, "نیاز به ورود")
		return
	}
	var req settingsRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192)).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "درخواست نامعتبر")
		return
	}
	if req.SiteName == "" {
		writeErr(w, http.StatusBadRequest, "نام سایت الزامی است")
		return
	}
	if req.TLSEnabled {
		if req.CertPath == "" || req.KeyPath == "" {
			writeErr(w, http.StatusBadRequest, "برای SSL مسیر گواهی و کلید الزامی است")
			return
		}
		if _, err := os.Stat(req.CertPath); err != nil {
			writeErr(w, http.StatusBadRequest, "فایل گواهی پیدا نشد")
			return
		}
		if _, err := os.Stat(req.KeyPath); err != nil {
			writeErr(w, http.StatusBadRequest, "فایل کلید پیدا نشد")
			return
		}
	}
	st := store.Settings{
		SiteName:     req.SiteName,
		Domain:       req.Domain,
		TLSEnabled:   req.TLSEnabled,
		CertPath:     req.CertPath,
		KeyPath:      req.KeyPath,
		ToolsEnabled: req.ToolsEnabled,
	}
	if err := h.Store.UpdateSettings(st); err != nil {
		writeErr(w, http.StatusInternalServerError, "ذخیره تنظیمات ناموفق")
		return
	}
	if h.OnTLSChange != nil {
		h.OnTLSChange()
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(r) {
		writeErr(w, http.StatusUnauthorized, "نیاز به ورود")
		return
	}
	st, err := h.Store.GetStats()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "خطا در آمار")
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (h *Handler) PurgeExpired(w http.ResponseWriter, r *http.Request) {
	if !h.authenticated(r) {
		writeErr(w, http.StatusUnauthorized, "نیاز به ورود")
		return
	}
	n, err := h.Store.DeleteExpired(time.Now().UTC())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "پاک‌سازی ناموفق")
		return
	}
	_ = h.Store.Vacuum()
	writeJSON(w, http.StatusOK, map[string]any{"deleted": n})
}

func (h *Handler) Middleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.authenticated(r) {
			writeErr(w, http.StatusUnauthorized, "نیاز به ورود")
			return
		}
		next(w, r)
	}
}

func (h *Handler) authenticated(r *http.Request) bool {
	c, err := r.Cookie(sessionCookie)
	if err != nil || c.Value == "" {
		return false
	}
	ok, err := h.Store.ValidSession(c.Value, time.Now().UTC())
	return err == nil && ok
}

func (h *Handler) allowLogin(r *http.Request) bool {
	ip := r.RemoteAddr
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now()
	b, ok := h.loginHits[ip]
	if !ok || now.After(b.reset) {
		h.loginHits[ip] = &bucket{count: 1, reset: now.Add(time.Minute)}
		return true
	}
	if b.count >= 10 {
		return false
	}
	b.count++
	return true
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
