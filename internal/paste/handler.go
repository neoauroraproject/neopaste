package paste

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	npcrypto "github.com/neoauroraproject/neopaste/internal/crypto"
	"github.com/neoauroraproject/neopaste/internal/store"
)

const (
	maxCiphertextBytes = 2 << 20 // 2 MiB
	maxFailAttempts    = 8
	lockDuration       = 15 * time.Minute
	idLength           = 12
)

type Handler struct {
	Store *store.Store
	mu    sync.Mutex
	ipHits map[string]*hitBucket
}

type hitBucket struct {
	count int
	reset time.Time
}

func NewHandler(s *store.Store) *Handler {
	return &Handler{
		Store:  s,
		ipHits: make(map[string]*hitBucket),
	}
}

type createRequest struct {
	Ciphertext     string `json:"ciphertext"`
	Salt           string `json:"salt"`
	IV             string `json:"iv"`
	PasswordVerify string `json:"password_verify"`
	ExpiresInSec   int64  `json:"expires_in_sec"`
	BurnAfterRead  bool   `json:"burn_after_read"`
	Kind           string `json:"kind"`
	Lang           string `json:"lang"`
	Mime           string `json:"mime"`
}

type createResponse struct {
	ID        string `json:"id"`
	URL       string `json:"url"`
	ExpiresAt int64  `json:"expires_at"`
	Kind      string `json:"kind"`
}

type unlockRequest struct {
	PasswordVerify string `json:"password_verify"`
}

type pastePayload struct {
	ID            string `json:"id"`
	Ciphertext    string `json:"ciphertext"`
	Salt          string `json:"salt"`
	IV            string `json:"iv"`
	BurnAfterRead bool   `json:"burn_after_read"`
	ExpiresAt     int64  `json:"expires_at"`
	Kind          string `json:"kind"`
	Lang          string `json:"lang"`
	Mime          string `json:"mime"`
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	if !h.allowIP(r, 30, time.Minute) {
		writeErr(w, http.StatusTooManyRequests, "تعداد درخواست‌ها زیاد است")
		return
	}
	var req createRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, (1500<<10)+8192)).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "درخواست نامعتبر")
		return
	}
	if req.Ciphertext == "" || req.Salt == "" || req.IV == "" || req.PasswordVerify == "" {
		writeErr(w, http.StatusBadRequest, "فیلدهای ضروری ناقص است")
		return
	}
	if req.ExpiresInSec <= 0 || req.ExpiresInSec > 365*24*3600 {
		writeErr(w, http.StatusBadRequest, "زمان انقضا نامعتبر است")
		return
	}

	id, err := npcrypto.GenerateShortID(idLength)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "خطای داخلی")
		return
	}
	now := time.Now().UTC()
	kind := req.Kind
	if kind == "" {
		kind = "text"
	}
	if kind != "text" && kind != "code" && kind != "image" {
		writeErr(w, http.StatusBadRequest, "نوع محتوا نامعتبر است")
		return
	}
	maxBytes := maxCiphertextBytes
	if kind == "image" {
		maxBytes = 1500 << 10
	}
	if len(req.Ciphertext) > maxBytes {
		writeErr(w, http.StatusRequestEntityTooLarge, "محتوا خیلی بزرگ است")
		return
	}
	p := store.Paste{
		ID:             id,
		Ciphertext:     req.Ciphertext,
		Salt:           req.Salt,
		IV:             req.IV,
		PasswordVerify: req.PasswordVerify,
		ExpiresAt:      now.Add(time.Duration(req.ExpiresInSec) * time.Second),
		BurnAfterRead:  req.BurnAfterRead,
		CreatedAt:      now,
		Kind:           kind,
		Lang:           req.Lang,
		Mime:           req.Mime,
	}
	if err := h.Store.CreatePaste(p); err != nil {
		writeErr(w, http.StatusInternalServerError, "ذخیره‌سازی ناموفق")
		return
	}
	writeJSON(w, http.StatusCreated, createResponse{
		ID: id, URL: "/p/" + id, ExpiresAt: p.ExpiresAt.Unix(), Kind: kind,
	})
}

func (h *Handler) Meta(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := h.Store.GetPaste(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "خطای داخلی")
		return
	}
	if p == nil || time.Now().UTC().After(p.ExpiresAt) {
		if p != nil {
			_ = h.Store.DeletePaste(id)
		}
		writeErr(w, http.StatusNotFound, "این لینک وجود ندارد یا منقضی شده")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":              p.ID,
		"salt":            p.Salt,
		"expires_at":      p.ExpiresAt.Unix(),
		"burn_after_read": p.BurnAfterRead,
		"locked":          p.LockedUntil != nil && time.Now().UTC().Before(*p.LockedUntil),
		"kind":            p.Kind,
		"lang":            p.Lang,
		"mime":            p.Mime,
	})
}

func (h *Handler) Unlock(w http.ResponseWriter, r *http.Request) {
	if !h.allowIP(r, 20, time.Minute) {
		writeErr(w, http.StatusTooManyRequests, "تعداد درخواست‌ها زیاد است")
		return
	}
	id := r.PathValue("id")
	var req unlockRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "درخواست نامعتبر")
		return
	}
	if req.PasswordVerify == "" {
		writeErr(w, http.StatusBadRequest, "رمز الزامی است")
		return
	}

	p, err := h.Store.GetPaste(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "خطای داخلی")
		return
	}
	if p == nil || time.Now().UTC().After(p.ExpiresAt) {
		if p != nil {
			_ = h.Store.DeletePaste(id)
		}
		writeErr(w, http.StatusNotFound, "این لینک وجود ندارد یا منقضی شده")
		return
	}
	if p.LockedUntil != nil && time.Now().UTC().Before(*p.LockedUntil) {
		writeErr(w, http.StatusTooManyRequests, "به دلیل تلاش‌های ناموفق موقتاً قفل شده است")
		return
	}

	verifyBytes, err := npcrypto.DecodeB64(req.PasswordVerify)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "فرمت رمز نامعتبر")
		return
	}
	storedBytes, err := npcrypto.DecodeB64(p.PasswordVerify)
	if err != nil || !npcrypto.ConstantTimeEqual(verifyBytes, storedBytes) {
		fails := p.FailCount + 1
		var locked *time.Time
		if fails >= maxFailAttempts {
			t := time.Now().UTC().Add(lockDuration)
			locked = &t
		}
		_ = h.Store.IncrementFail(id, fails, locked)
		writeErr(w, http.StatusUnauthorized, "رمز اشتباه است")
		return
	}

	_ = h.Store.ResetFails(id)
	payload := pastePayload{
		ID:            p.ID,
		Ciphertext:    p.Ciphertext,
		Salt:          p.Salt,
		IV:            p.IV,
		BurnAfterRead: p.BurnAfterRead,
		ExpiresAt:     p.ExpiresAt.Unix(),
		Kind:          p.Kind,
		Lang:          p.Lang,
		Mime:          p.Mime,
	}
	if p.BurnAfterRead {
		_ = h.Store.DeletePaste(id)
	}
	writeJSON(w, http.StatusOK, payload)
}

func (h *Handler) StartExpiryWorker(stop <-chan struct{}) {
	ticker := time.NewTicker(time.Minute)
	vacuumEvery := 0
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				now := time.Now().UTC()
				_, _ = h.Store.DeleteExpired(now)
				_ = h.Store.CleanSessions(now)
				vacuumEvery++
				if vacuumEvery >= 60 { // roughly hourly
					_ = h.Store.Vacuum()
					vacuumEvery = 0
				}
			}
		}
	}()
}

func (h *Handler) allowIP(r *http.Request, limit int, window time.Duration) bool {
	ip := r.RemoteAddr
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		ip = xff
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now()
	b, ok := h.ipHits[ip]
	if !ok || now.After(b.reset) {
		h.ipHits[ip] = &hitBucket{count: 1, reset: now.Add(window)}
		return true
	}
	if b.count >= limit {
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
