# NeoPaste

![Visitors](https://visitor-badge.laobi.icu/badge?page_id=neoauroraproject.neopaste&left_color=gray&right_color=teal)
![Release](https://img.shields.io/github/v/release/neoauroraproject/neopaste?label=release)
![License](https://img.shields.io/github/license/neoauroraproject/neopaste)

**Secure self-hosted paste & short links** — end-to-end encrypted in the browser. Password + expiry. Offline-friendly install.

سرویس خودمیزبان برای اشتراک امن متن و لینک با رمز و تایمر. رمزنگاری در مرورگر؛ نصب آسان حتی روی سرور بدون اینترنت بین‌الملل.

---

## English

### One-line install (server has internet)

```bash
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash
```

This downloads the latest release binary and runs the interactive installer (port + site name). At the end you get the site URL, admin URL, username and password.

### Offline install (no international / no internet on the server)

Do the download on a machine that **has** internet, then copy files to the server (USB, local SCP, etc.). The server never needs to reach GitHub.

1. On a PC with internet, download the latest offline package:

```bash
# example — replace VERSION with the latest tag, e.g. v1.0.0
curl -fsSL -o neopaste-linux-amd64.tar.gz \
  https://github.com/neoauroraproject/neopaste/releases/latest/download/neopaste-linux-amd64.tar.gz
```

Or open [Releases](https://github.com/neoauroraproject/neopaste/releases) in a browser and download `neopaste-linux-amd64.tar.gz`.

2. Copy the archive to the server (USB / intranet), then:

```bash
tar -xzf neopaste-linux-amd64.tar.gz
cd neopaste
sudo bash install.sh
```

3. Choose port and site name. The script prints:

```
URL:        http://SERVER_IP:PORT
Admin:      http://SERVER_IP:PORT/admin
Username:   admin
Password:   ********
```

No `git clone`, no `apt` of app dependencies, no runtime download on the server.

### Uninstall

```bash
sudo bash uninstall.sh
```

### Features

- Client-side E2E encryption (server only stores ciphertext)
- Short link, password, expiry presets, burn-after-read
- Expired / burned pastes are deleted from SQLite
- Admin panel: site name, domain, TLS cert/key paths
- Single static Go binary + SQLite

---

## فارسی

### نصب با یک خط (سرور به اینترنت دسترسی دارد)

```bash
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash
```

آخرین نسخه از GitHub دانلود و نصب تعاملی اجرا می‌شود (پورت و نام سایت). در پایان آدرس سایت، پنل ادمین، نام کاربری و رمز چاپ می‌شود.

### نصب آفلاین (سرور اینترنت بین‌الملل ندارد)

دانلود را روی سیستمی انجام دهید که اینترنت دارد؛ فقط فایل‌ها را به سرور منتقل کنید (فلش، شبکه داخلی، …). سرور نیازی به دسترسی به GitHub ندارد.

1. روی سیستم دارای اینترنت، بسته آفلاین را بگیرید:

```bash
# نسخه را با تگ آخرین ریلیز عوض کنید، مثلاً v1.0.0
curl -fsSL -o neopaste-linux-amd64.tar.gz \
  https://github.com/neoauroraproject/neopaste/releases/latest/download/neopaste-linux-amd64.tar.gz
```

یا از صفحه [Releases](https://github.com/neoauroraproject/neopaste/releases) فایل `neopaste-linux-amd64.tar.gz` را دانلود کنید.

2. آرشیو را به سرور کپی کنید، سپس:

```bash
tar -xzf neopaste-linux-amd64.tar.gz
cd neopaste
sudo bash install.sh
```

3. پورت و نام سایت را وارد کنید. خروجی نمونه:

```
آدرس:        http://IP_سرور:PORT
ادمین:       http://IP_سرور:PORT/admin
نام کاربری:  admin
رمز عبور:    ********
```

روی سرور نه `git clone` لازم است، نه نصب وابستگی از اینترنت.

### حذف نصب

```bash
sudo bash uninstall.sh
```

### امکانات

- رمزنگاری end-to-end در مرورگر (سرور متن خام نمی‌بیند)
- لینک کوتاه، رمز، تایمر انقضا، حذف بعد از اولین مشاهده
- حذف واقعی از دیتابیس بعد از انقضا / burn
- پنل ادمین: نام سایت، دامنه، مسیر گواهی SSL
- یک باینری Go + SQLite توکار

---

## Build from source / ساخت از سورس

Requires Go 1.22+ and Node.js 18+.

```bash
make package
# → dist/neopaste/  (binary + install.sh)
```

Local run:

```bash
cd web && npm install && npm run build && cd ..
go run ./cmd/neopaste -listen :8080 -data ./data
```

---

## Security notes / نکات امنیتی

- Decryption key never leaves the browser
- Rate-limited unlock attempts
- Admin password hashed with bcrypt
- Optional TLS via admin panel (cert/key paths on disk)
