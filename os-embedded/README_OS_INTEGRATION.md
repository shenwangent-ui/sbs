# SBS Browser - Server-Side Web Browser & OS Embedded System Architecture
=============================================================================

> **เปรียบเทียบกับ Google และ Microsoft**:
> - **Google บน ChromeOS & Android**: ฝัง Chromium / Android System WebView และ Google Play Services เข้าไปในระดับ System Daemon เพื่อให้ทุกแอพในระบบเรียกใช้งาน Web Engine และ Identity ได้
> - **Microsoft บน Windows**: ฝัง Microsoft Edge, Edge WebView2 Runtime และ Windows Notification Service เข้าไปในระดับ System Service ของ Windows
> - **SBS Browser บนระบบปฏิบัติการของคุณ (Custom OS)**: ทำงานในรูปแบบ **Server-Side Web Browser & System Identity Engine** โดยรันเป็น `systemd` daemon (`sbs-browser.service`) ที่ `/opt/sbs-browser` คอยให้บริการดึง/เรนเดอร์หน้าเว็บ (Remote Browser Isolation), ค้นหาข้อมูลความเร็วสูง, และจัดการบัญชี Shenwang Account ให้กับทุกส่วนของระบบปฏิบัติการ!

---

## 1. สถาปัตยกรรม "บราวเซอร์ฝั่งเซิร์ฟเวอร์" (Server-Side Browser Engine)

```text
+-------------------------------------------------------------------+
|                        CUSTOM OPERATING SYSTEM                    |
|                                                                   |
|   [OS Shell / Window Manager / File Manager / Terminal / Apps]    |
|                               |                                   |
|              1) sbs-browser <URL> (CLI / MIME Handler)            |
|              2) REST API Calls (/api/v1/search, /api/v1/preview)  |
|                               v                                   |
|  +-------------------------------------------------------------+  |
|  |     SBS Browser System Daemon (sbs-browser.service)         |  |
|  |     Runs on: 127.0.0.1:3000 (Protected Background Service)  |  |
|  |                                                             |  |
|  |  * Server-Side Web Fetcher & Sanitizer (CORS / Ad-block)    |  |
|  |  * Dual-mode Renderer (Real Interactive Web + Reader Mode)  |  |
|  |  * Thai-optimized Search Engine + Gemini Grounding          |  |
|  |  * Standalone Shenwang Account & OAuth 2.0 Identity Server  |  |
|  |  * System Bookmarks & History Store                         |  |
|  +-------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

---

## 2. วิธีการฝังลงในระบบปฏิบัติการ (Custom OS Integration)

### วิธีที่ 1: ฝังลงในขั้นตอนสร้าง Custom OS ISO / Rootfs (Pre-bake into OS Image)
หากคุณกำลังพัฒนา OS ของตัวเอง (เช่น ผ่าน Debian Live-build, Arch chroot, debootstrap, Buildroot หรือ Alpine):

1. ในขั้นตอน `chroot` ลงใน rootfs ของ OS ให้คัดลอกโฟลเดอร์ `sbs-browser` ไปไว้ที่ `/opt/sbs-browser`:
   ```bash
   cp -rf sbs-browser /path/to/custom-os/rootfs/opt/sbs-browser
   ```

2. รันสคริปต์ติดตั้งภายใน chroot:
   ```bash
   chroot /path/to/custom-os/rootfs
   cd /opt/sbs-browser/os-embedded
   bash install-os.sh
   exit
   ```

3. เมื่อบิลด์ OS เป็นไฟล์ `.iso` หรือ `.img` แล้วนำไปบูตบนเครื่องใดก็ตาม:
   - บริการ `sbs-browser.service` จะเริ่มทำงานอัตโนมัติทันทีตั้งแต่เปิดเครื่อง
   - ไอคอน **SBS Browser** จะปรากฏในเมนูแอพและทาสก์บาร์ของ OS ทันที
   - เมื่อดับเบิลคลิกไฟล์ `.html` หรือกดลิงก์ใดๆ ใน OS ระบบจะเปิดผ่าน SBS Browser อัตโนมัติ

---

### วิธีที่ 2: ติดตั้งลงในเครื่องระบบปฏิบัติการที่กำลังทำงาน (One-Line Installer)
```bash
# ดาวน์โหลดแพ็กเกจระบบและติดตั้งทันที:
curl -sSL https://ais-pre-brb74sikfl77hnu7quzboq-74288553499.asia-southeast1.run.app/api/v1/packages/os-embedded.tar.gz | sudo tar -xz -C /opt
sudo bash /opt/sbs-browser/os-embedded/install-os.sh
```

---

### วิธีที่ 3: รันแบบ Containerized Service (สำหรับ OS ที่ใช้ Docker/Podman)
```bash
cd os-embedded
docker compose up -d
```

---

## 3. คำสั่งควบคุมระบบ (System Commands)

| คำสั่ง | ผลลัพธ์ |
|---|---|
| `sbs-browser` | เปิดหน้าหลัก SBS Browser & Search Engine |
| `sbs-browser https://github.com` | เปิดหน้าเว็บเป้าหมายด้วยโหมดพรีวิวฝั่งเซิร์ฟเวอร์ |
| `sbs-browser -s "ค้นหาข่าว"` | ค้นหาข้อมูลทันที |
| `sbs-browser --kiosk` | เปิดโหมด Kiosk เต็มหน้าจอสำหรับ OS Display Shell |
| `sbs-browser --account` | เปิดพอร์ทัล Shenwang Account |
| `sbs-browser --status` | ตรวจสอบสถานะ Daemon (`RUNNING` / `STOPPED`) |
| `sbs-browser --restart` | รีสตาร์ทเซิร์ฟเวอร์ Daemon |
| `systemctl status sbs-browser` | ตรวจสอบสถานะ systemd service |
| `journalctl -u sbs-browser -f` | ดู logs การทำงานแบบเรียลไทม์ |

---

## 4. การเชื่อมต่อของแอพอื่นๆ ภายใน OS (IPC & REST API)

แอพพลิเคชันอื่นๆ ที่คุณพัฒนาใน OS (เช่น แอพพยากรณ์อากาศ, แอพข่าว, File Manager) สามารถเรียกใช้ SBS Engine ได้โดยตรงที่ `http://127.0.0.1:3000`:
- **ค้นหาเว็บ**: `GET http://127.0.0.1:3000/api/v1/search?q=คำค้นหา`
- **ดึงเนื้อหาเว็บและพรีวิว**: `GET http://127.0.0.1:3000/api/v1/preview?url=https://example.com`
- **ยืนยันตัวตน SSO ด้วย Shenwang Account**: `POST http://127.0.0.1:3000/api/v1/oauth/authorize`
