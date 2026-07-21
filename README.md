# NeoPaste

![Visitors](https://visitor-badge.laobi.icu/badge?page_id=neoauroraproject.neopaste&left_color=gray&right_color=teal)
![Release](https://img.shields.io/github/v/release/neoauroraproject/neopaste?label=release)
![License](https://img.shields.io/github/license/neoauroraproject/neopaste)

**Secure self-hosted paste & short links** — end-to-end encrypted in the browser. FA/EN UI. Offline-friendly install & update.

سرویس خودمیزبان برای اشتراک امن متن و لینک. رابط فارسی/انگلیسی. نصب و آپدیت آسان حتی بدون اینترنت روی سرور.

![NeoPaste](/neopaste.jpg)

---

## English

### One-line install / update / uninstall

```bash
# Interactive (asks: Update / Install / Uninstall if already installed)
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash

# Force update (keep data & admin password)
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash -s -- --update

# Fresh install
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash -s -- --install

# Uninstall
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash -s -- --uninstall
```

After **update**, hard-refresh the browser: `Ctrl+Shift+R` (old JS may be cached otherwise).

Non-interactive install:

```bash
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh \
  | sudo bash -s -- --install --yes
```

### Offline install / update

1. Download on a machine with internet:

```bash
curl -fsSL -o neopaste-linux-amd64.tar.gz \
  https://github.com/neoauroraproject/neopaste/releases/latest/download/neopaste-linux-amd64.tar.gz
```

2. Copy to the server, then:

```bash
tar -xzf neopaste-linux-amd64.tar.gz && cd neopaste && sudo bash install.sh
sudo bash install.sh            # menu: update / install / uninstall
sudo bash install.sh --update   # update only
sudo bash install.sh --uninstall
```

---

## فارسی

### نصب / آپدیت / حذف با یک خط

```bash
# اگر از قبل نصب باشد منو می‌آید: آپدیت / نصب تازه / حذف
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash

# فقط آپدیت (دیتا و رمز ادمین حفظ می‌شود)
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash -s -- --update

# نصب تازه
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash -s -- --install

# حذف
curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash -s -- --uninstall
```

بعد از آپدیت حتماً مرورگر را سخت‌رفرش کنید: `Ctrl+Shift+R`

### نصب آفلاین

دانلود بسته از Releases روی سیستم دارای نت → کپی به سرور → `sudo bash install.sh` (منوی آپدیت/نصب/حذف).

---

## Features

- Client-side E2E encryption (works on HTTP too)
- Password / expiry / burn-after-read toggles
- Result page with QR + local recent-link cards
- Hub: Paste / Code / Image + optional Toolbox
- Toolbox (browser-only): Base64, URL, Hex, Hash, JWT, JSON, UUID, Diff → share as paste
- Light image share (client compress) + code share with highlight
- Templates, admin stats / purge / tools toggle
- Persian & English UI · single Go binary + SQLite
- Identity: **secure share hub + tiny toolbox**

## Build from source

```bash
make package
```

---

## 💖 Donation (حمایت مالی)

If you find this project helpful and want to support its development, you can donate us via:
اگر این پروژه برای شما مفید بوده و تمایل به حمایت از توسعهی آن دارید، میتوانید از طریق زیر از ما حمایت کنید:

* **USDT (BEP20):**
  `0xacA935a5955a756BedaE4738304274EdeE0223D5`

---
Telegram Channels:  [NeoAurora](https://t.me/neoaurora) / [HMPanel](https://t.me/hmpanel)
*Built with ❤️ for the Freedom.*
