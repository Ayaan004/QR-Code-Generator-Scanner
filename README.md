# QuantumQR Pro — Professional QR Code Generator & Scanner

A modern, high-precision, and feature-rich QR Code Studio and Optical Scanner powered by **HTML5 / CSS3 / ES6+ JavaScript** on the frontend and **Python 3 / Flask / OpenCV / Pillow** on the backend.

---

## 🚀 Key Features

### 1. 🎨 Generator Studio (10 Structured Content Types)
- **10 Specialized Data Formats**:
  - 🌐 **URL / Web Links** (with protocol selector)
  - 📝 **Plain Text / Notes**
  - 📶 **Wi-Fi Credentials** (SSID, Password, WPA/WPA2/WEP/Open, Hidden network toggle)
  - 👤 **vCard 3.0 Contact Card** (Name, Phone, Email, Company, Job Title, Address, Website)
  - 📧 **Email** (Pre-filled recipient, subject, and body)
  - 📞 **Phone Call** (One-tap dialer)
  - 💬 **SMS / WhatsApp** (Direct message intent)
  - 📍 **Geolocation** (Latitude, Longitude with Google Maps integration)
  - 💳 **Crypto & Payment** (Bitcoin, Ethereum, Solana, UPI payment URI)
  - 📅 **Calendar Event** (Summary, Start time, End time, Location)

### 2. 💎 Luxury Customization Engine
- **Module Shapes**: Rounded modules, Circular dots, Classic squares, Gapped squares.
- **Color Gradients**:
  - Linear Vertical, Linear Horizontal, Radial Gradient, or Solid colors.
  - Preset designer palettes: *Cyber Glow, Emerald Tech, Sunset Orange, Neon Violet, Midnight Obsidian, Royal Gold*.
  - Alpha transparency toggle for seamless transparent PNG and WebP exports.
- **Brand Logo & Watermarking**:
  - Preset brand icons (Globe, Wi-Fi, WhatsApp, Phone, Mail, Location, GitHub, Star, Heart, Dollar).
  - Custom logo upload (PNG/JPG/SVG) with automatic rounded badge wrapper, background protection, and size scaling.
- **Precision Settings**:
  - Error correction levels: `L` (7%), `M` (15%), `Q` (25%), `H` (30% - optimal for logos).
  - Export resolution slider: `256px` to `2048px` (Ultra-HD 4K print-ready).
  - Quiet zone padding margin slider.

### 3. 📷 Optical Scanner & Computer Vision Inspector
- **Dual Scanning Modes**:
  - **Live Camera Stream**: Real-time 60 FPS viewport with neon targeting reticle, corner brackets, and animated laser sweep. Supports camera switching (front/back) and device torch/flashlight.
  - **Drag & Drop / File Upload**: Upload PNG, JPG, WebP, GIF, or BMP images.
  - **Global Clipboard Paste (`Ctrl + V`)**: Press `Ctrl + V` anywhere on the screen to decode any screenshot or copied image instantly.
- **Smart Result Inspector**:
  - Automatically parses Wi-Fi networks (one-click "Copy Password"), URLs ("Open Link"), vCards ("Download .vcf"), and emails.
  - Web Audio API synthesizer confirmation beeps.
  - One-click "Load into Studio" to edit or re-style scanned QR codes.

### 4. 📦 Bulk / Batch Generator
- Input via multi-line text or CSV spreadsheet.
- Generates high-res QR codes for every row and packs them into a downloadable `.zip` archive containing all codes plus a structured `manifest.csv`.

### 5. 🕒 History & Saved Codes
- LocalStorage persistence with thumbnails, timestamps, and data badges.
- Search query filtering and category tabs (All, Generated, Scanned).
- Export history to **CSV** or **JSON**.

---

## 🛠️ Technical Architecture

```
QR Code Generator & Scanner/
├── app.py                     # Flask backend server, REST APIs, OpenCV vision decoder, ZIP packager
├── requirements.txt           # Python dependencies
├── static/
│   ├── css/
│   │   ├── style.css          # Glassmorphic cyber design system, neon themes, keyframes
│   │   └── toast.css          # Floating notification toast system
│   ├── js/
│   │   ├── app.js             # Core controller, tabs, Web Audio API sound synth, themes
│   │   ├── generator.js       # Generator studio controller, live preview, export pipelines
│   │   ├── scanner.js         # Camera stream scanner, radar laser, drag & drop, paste decoder
│   │   ├── batch.js           # Batch processor, CSV parser, ZIP download trigger
│   │   ├── history.js         # LocalStorage history manager, search, and CSV/JSON export
│   │   ├── jsQR.min.js        # Fast client-side QR decoder
│   │   └── qrcode.min.js      # Client preview fallback engine
└── templates/
    └── index.html             # High-fidelity semantic HTML5 single-page application
```

---

## 🏃 Quick Start Guide

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the Application
```bash
python app.py
```

### 3. Open in Browser
Visit [http://127.0.0.1:5000](http://127.0.0.1:5000) in any web browser.
