import os
import io
import re
import base64
import zipfile
from datetime import datetime
from urllib.parse import urlparse, parse_qs, unquote

from flask import Flask, request, jsonify, send_file, render_template
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageOps
import numpy as np
import cv2

import qrcode
from qrcode.constants import ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q, ERROR_CORRECT_H
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import (
    SquareModuleDrawer,
    RoundedModuleDrawer,
    CircleModuleDrawer,
    GappedSquareModuleDrawer
)
from qrcode.image.styles.colormasks import (
    SolidFillColorMask,
    RadialGradiantColorMask,
    VerticalGradiantColorMask,
    HorizontalGradiantColorMask
)
import qrcode.image.svg

app = Flask(__name__, static_folder="static", template_folder="templates")
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024  # 32MB max upload

ERROR_MAP = {
    'L': ERROR_CORRECT_L,
    'M': ERROR_CORRECT_M,
    'Q': ERROR_CORRECT_Q,
    'H': ERROR_CORRECT_H
}

DRAWER_MAP = {
    'square': SquareModuleDrawer,
    'rounded': RoundedModuleDrawer,
    'circle': CircleModuleDrawer,
    'gapped': GappedSquareModuleDrawer
}


def hex_to_rgb(hex_val, default=(0, 0, 0)):
    """Convert hex string (e.g. '#6366f1' or '6366f1') to RGB tuple."""
    if not hex_val:
        return default
    clean = hex_val.strip().lstrip('#')
    if len(clean) == 3:
        clean = ''.join([c * 2 for c in clean])
    if len(clean) != 6:
        return default
    try:
        return (int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16))
    except ValueError:
        return default


def parse_qr_content(raw_text):
    """
    Intelligently analyzes and categorizes QR code text into structured types:
    URL, Wi-Fi, vCard, Email, Phone, SMS, WhatsApp, Geo, Crypto, Calendar, or Plain Text.
    """
    if not raw_text:
        return {"type": "empty", "title": "Empty", "data": {}}

    text = raw_text.strip()

    # 1. Wi-Fi Network
    if text.startswith("WIFI:"):
        ssid_match = re.search(r'S:([^;]*);', text)
        type_match = re.search(r'T:([^;]*);', text)
        pass_match = re.search(r'P:([^;]*);', text)
        hidden_match = re.search(r'H:([^;]*);', text)
        return {
            "type": "wifi",
            "title": "Wi-Fi Network",
            "icon": "wifi",
            "data": {
                "ssid": ssid_match.group(1) if ssid_match else "",
                "auth": type_match.group(1) if type_match else "WPA",
                "password": pass_match.group(1) if pass_match else "",
                "hidden": hidden_match.group(1).lower() in ["true", "1"] if hidden_match else False
            }
        }

    # 2. vCard Contact
    if text.upper().startswith("BEGIN:VCARD"):
        fn_match = re.search(r'(?:^|\n)FN:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        tel_match = re.search(r'(?:^|\n)TEL[^:]*:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        email_match = re.search(r'(?:^|\n)EMAIL[^:]*:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        org_match = re.search(r'(?:^|\n)ORG:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        title_match = re.search(r'(?:^|\n)TITLE:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        url_match = re.search(r'(?:^|\n)URL:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        adr_match = re.search(r'(?:^|\n)ADR[^:]*:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        note_match = re.search(r'(?:^|\n)NOTE:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        return {
            "type": "vcard",
            "title": "Contact Card (vCard)",
            "icon": "contact",
            "data": {
                "name": fn_match.group(1).strip() if fn_match else "Contact",
                "phone": tel_match.group(1).strip() if tel_match else "",
                "email": email_match.group(1).strip() if email_match else "",
                "organization": org_match.group(1).strip() if org_match else "",
                "title": title_match.group(1).strip() if title_match else "",
                "website": url_match.group(1).strip() if url_match else "",
                "address": adr_match.group(1).replace(';', ' ').strip() if adr_match else "",
                "note": note_match.group(1).strip() if note_match else "",
                "raw_vcf": text
            }
        }

    # 3. URL / Website
    if re.match(r'^(https?://|www\.)', text, re.IGNORECASE) or ('.' in text and ' ' not in text and '/' in text):
        full_url = text if re.match(r'^https?://', text, re.IGNORECASE) else f"https://{text}"
        parsed = urlparse(full_url)
        return {
            "type": "url",
            "title": "Web Link",
            "icon": "link",
            "data": {
                "url": full_url,
                "domain": parsed.netloc or parsed.path.split('/')[0],
                "path": parsed.path
            }
        }

    # 4. Email
    if text.lower().startswith("mailto:") or text.startswith("MATMSG:"):
        to_email = ""
        subject = ""
        body = ""
        if text.lower().startswith("mailto:"):
            url_part = text[7:]
            if '?' in url_part:
                to_email, query = url_part.split('?', 1)
                params = parse_qs(query)
                subject = params.get('subject', [''])[0]
                body = params.get('body', [''])[0]
            else:
                to_email = url_part
        else:  # MATMSG
            to_m = re.search(r'TO:([^;]*);', text, re.IGNORECASE)
            sub_m = re.search(r'SUB:([^;]*);', text, re.IGNORECASE)
            body_m = re.search(r'BODY:([^;]*);', text, re.IGNORECASE)
            to_email = to_m.group(1) if to_m else ""
            subject = sub_m.group(1) if sub_m else ""
            body = body_m.group(1) if body_m else ""

        return {
            "type": "email",
            "title": "Email Message",
            "icon": "mail",
            "data": {
                "to": to_email,
                "subject": subject,
                "body": body
            }
        }

    # 5. Phone Call
    if text.lower().startswith("tel:"):
        return {
            "type": "phone",
            "title": "Phone Call",
            "icon": "phone",
            "data": {
                "phone": text[4:].strip()
            }
        }

    # 6. SMS or WhatsApp
    if text.lower().startswith("sms:") or text.lower().startswith("smsto:"):
        phone = ""
        msg = ""
        clean = text[4:] if text.lower().startswith("sms:") else text[6:]
        if '?' in clean or ':' in clean:
            sep = '?' if '?' in clean else ':'
            parts = clean.split(sep, 1)
            phone = parts[0]
            if sep == '?':
                params = parse_qs(parts[1])
                msg = params.get('body', [''])[0]
            else:
                msg = parts[1]
        else:
            phone = clean
        return {
            "type": "sms",
            "title": "SMS Message",
            "icon": "sms",
            "data": {
                "phone": phone.strip(),
                "message": msg.strip()
            }
        }

    # 7. Geolocation
    if text.lower().startswith("geo:"):
        coords = text[4:].split('?')[0].split(',')
        lat = coords[0].strip() if len(coords) > 0 else "0"
        lon = coords[1].strip() if len(coords) > 1 else "0"
        return {
            "type": "geo",
            "title": "Geo Location",
            "icon": "map-pin",
            "data": {
                "latitude": lat,
                "longitude": lon,
                "maps_url": f"https://www.google.com/maps?q={lat},{lon}"
            }
        }

    # 8. Crypto payment
    if any(text.lower().startswith(c) for c in ['bitcoin:', 'ethereum:', 'solana:', 'upi://']):
        scheme = text.split(':', 1)[0].lower()
        return {
            "type": "crypto",
            "title": f"Payment / {scheme.upper()}",
            "icon": "credit-card",
            "data": {
                "scheme": scheme,
                "raw": text
            }
        }

    # 9. Calendar Event
    if text.upper().startswith("BEGIN:VEVENT") or text.upper().startswith("BEGIN:VCALENDAR"):
        summary_m = re.search(r'(?:^|\n)SUMMARY:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        location_m = re.search(r'(?:^|\n)LOCATION:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        dtstart_m = re.search(r'(?:^|\n)DTSTART:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        dtend_m = re.search(r'(?:^|\n)DTEND:(.*?)(?:\r?\n|$)', text, re.IGNORECASE)
        return {
            "type": "event",
            "title": "Calendar Event",
            "icon": "calendar",
            "data": {
                "title": summary_m.group(1).strip() if summary_m else "Event",
                "location": location_m.group(1).strip() if location_m else "",
                "start": dtstart_m.group(1).strip() if dtstart_m else "",
                "end": dtend_m.group(1).strip() if dtend_m else ""
            }
        }

    # 10. Default Plain Text
    return {
        "type": "text",
        "title": "Plain Text",
        "icon": "file-text",
        "data": {
            "text": text,
            "length": len(text)
        }
    }


def generate_qr_image(data, options):
    """
    Core generation engine supporting:
    - Custom module drawers (square, rounded, circle, gapped)
    - Custom color gradients (linear vertical, horizontal, radial)
    - Logo watermarking with styled badge and alpha blending
    - Transparent backgrounds
    - Scalable high-res dimensions
    """
    error_level = options.get('error_correction', 'H').upper()
    ec = ERROR_MAP.get(error_level, ERROR_CORRECT_H)

    drawer_name = options.get('style', 'rounded').lower()
    drawer_cls = DRAWER_MAP.get(drawer_name, RoundedModuleDrawer)

    color_mode = options.get('color_mode', 'gradient').lower()
    fg1 = hex_to_rgb(options.get('fg_color', '#6366f1'), default=(99, 102, 241))
    fg2 = hex_to_rgb(options.get('fg_color_2', '#06b6d4'), default=(6, 182, 212))
    bg = hex_to_rgb(options.get('bg_color', '#ffffff'), default=(255, 255, 255))
    transparent_bg = bool(options.get('transparent_bg', False))

    margin = int(options.get('margin', 2))
    target_size = int(options.get('size', 512))

    # Base QRCode setup
    qr = qrcode.QRCode(
        version=None,
        error_correction=ec,
        box_size=10,
        border=margin
    )
    qr.add_data(data)
    qr.make(fit=True)

    # Color Mask setup
    if color_mode == 'solid':
        color_mask = SolidFillColorMask(front_color=fg1, back_color=bg)
    elif color_mode == 'horizontal':
        color_mask = HorizontalGradiantColorMask(back_color=bg, left_color=fg1, right_color=fg2)
    elif color_mode == 'radial':
        color_mask = RadialGradiantColorMask(back_color=bg, center_color=fg1, edge_color=fg2)
    else:  # default vertical gradient
        color_mask = VerticalGradiantColorMask(back_color=bg, top_color=fg1, bottom_color=fg2)

    # Generate styled PIL image
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=drawer_cls(),
        color_mask=color_mask
    )

    # Convert to RGBA PIL image
    base_img = img.convert('RGBA')

    # Apply Transparent Background if requested
    if transparent_bg:
        arr = np.array(base_img)
        # Match background color with small tolerance
        mask = (np.abs(arr[:, :, 0] - bg[0]) < 10) & \
               (np.abs(arr[:, :, 1] - bg[1]) < 10) & \
               (np.abs(arr[:, :, 2] - bg[2]) < 10)
        arr[mask, 3] = 0
        base_img = Image.fromarray(arr, 'RGBA')

    # Embed Logo if provided
    logo_base64 = options.get('logo_base64')
    if logo_base64:
        try:
            if ',' in logo_base64:
                logo_base64 = logo_base64.split(',', 1)[1]
            logo_bytes = base64.b64decode(logo_base64)
            logo_img = Image.open(io.BytesIO(logo_bytes)).convert('RGBA')

            qr_w, qr_h = base_img.size
            scale = float(options.get('logo_scale', 0.22))
            scale = max(0.12, min(0.32, scale))
            logo_dim = int(qr_w * scale)

            logo_img = logo_img.resize((logo_dim, logo_dim), Image.Resampling.LANCZOS)

            # Circular / Rounded badge card behind logo for clean separation
            badge_pad = int(logo_dim * 0.15)
            badge_dim = logo_dim + (badge_pad * 2)

            badge = Image.new('RGBA', (badge_dim, badge_dim), (0, 0, 0, 0))
            draw = ImageDraw.Draw(badge)
            badge_bg = (255, 255, 255, 255) if not transparent_bg else (255, 255, 255, 240)
            badge_border = (*fg1, 180)

            draw.rounded_rectangle(
                [0, 0, badge_dim - 1, badge_dim - 1],
                radius=int(badge_dim * 0.28),
                fill=badge_bg,
                outline=badge_border,
                width=max(2, int(badge_dim * 0.04))
            )

            x = (qr_w - badge_dim) // 2
            y = (qr_h - badge_dim) // 2
            base_img.paste(badge, (x, y), badge)
            base_img.paste(logo_img, (x + badge_pad, y + badge_pad), logo_img)
        except Exception as e:
            print(f"Logo embedding warning: {e}")

    # Resize to exact requested high-res dimensions (e.g. 512, 1024, 2048)
    if target_size > 0 and base_img.size != (target_size, target_size):
        base_img = base_img.resize((target_size, target_size), Image.Resampling.LANCZOS)

    return base_img, qr


# ==========================================
# ROUTES
# ==========================================

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/health')
def health():
    return jsonify({
        "status": "healthy",
        "service": "QuantumQR Pro Engine",
        "python_version": os.sys.version,
        "opencv_version": cv2.__version__,
        "features": {
            "custom_drawers": list(DRAWER_MAP.keys()),
            "color_modes": ["solid", "vertical", "horizontal", "radial"],
            "export_formats": ["png", "svg", "jpeg", "webp", "pdf"]
        }
    })


@app.route('/api/generate', methods=['POST'])
def api_generate():
    try:
        data = request.json or {}
        text = data.get('data', '').strip()
        if not text:
            return jsonify({"success": False, "error": "No content provided for QR code"}), 400

        fmt = data.get('format', 'png').lower()
        as_download = request.args.get('download', '0') == '1'

        # SVG Export
        if fmt == 'svg':
            qr = qrcode.QRCode(
                version=None,
                error_correction=ERROR_MAP.get(data.get('error_correction', 'M'), ERROR_CORRECT_M),
                box_size=10,
                border=int(data.get('margin', 2))
            )
            qr.add_data(text)
            qr.make(fit=True)
            svg_img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
            svg_buf = io.BytesIO()
            svg_img.save(svg_buf)
            svg_buf.seek(0)
            svg_str = svg_buf.getvalue().decode('utf-8')

            if as_download:
                return send_file(
                    svg_buf,
                    mimetype='image/svg+xml',
                    as_attachment=True,
                    download_name=f"quantum_qr_{datetime.now().strftime('%Y%m%d_%H%M%S')}.svg"
                )

            return jsonify({
                "success": True,
                "format": "svg",
                "svg": svg_str,
                "data_url": f"data:image/svg+xml;base64,{base64.b64encode(svg_buf.getvalue()).decode('utf-8')}",
                "length": len(text),
                "parsed": parse_qr_content(text)
            })

        # Raster / PDF Export
        pil_img, qr_obj = generate_qr_image(text, data)
        buf = io.BytesIO()

        if fmt == 'pdf':
            # Save as high-res PDF
            rgb_img = pil_img.convert('RGB')
            rgb_img.save(buf, format='PDF', resolution=300.0)
            mime = 'application/pdf'
            ext = 'pdf'
        elif fmt in ['jpg', 'jpeg']:
            rgb_img = pil_img.convert('RGB')
            rgb_img.save(buf, format='JPEG', quality=95)
            mime = 'image/jpeg'
            ext = 'jpg'
        elif fmt == 'webp':
            pil_img.save(buf, format='WEBP', quality=95)
            mime = 'image/webp'
            ext = 'webp'
        else:  # default PNG
            pil_img.save(buf, format='PNG')
            mime = 'image/png'
            ext = 'png'

        buf.seek(0)
        img_bytes = buf.getvalue()

        if as_download:
            return send_file(
                io.BytesIO(img_bytes),
                mimetype=mime,
                as_attachment=True,
                download_name=f"quantum_qr_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{ext}"
            )

        b64_str = base64.b64encode(img_bytes).decode('utf-8')
        return jsonify({
            "success": True,
            "format": ext,
            "data_url": f"data:{mime};base64,{b64_str}",
            "width": pil_img.size[0],
            "height": pil_img.size[1],
            "length": len(text),
            "parsed": parse_qr_content(text)
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def _try_detect_with_all(img_candidate):
    """Attempt decoding using both QRCodeDetectorAruco and legacy QRCodeDetector."""
    if img_candidate is None:
        return None, []

    # 1. Try QRCodeDetectorAruco if available
    try:
        aruco = cv2.QRCodeDetectorAruco()
        val, points, _ = aruco.detectAndDecode(img_candidate)
        if val and val.strip():
            pts = points[0].tolist() if points is not None and len(points) > 0 else []
            return val.strip(), pts
    except Exception:
        pass

    # 2. Try legacy QRCodeDetector
    try:
        detector = cv2.QRCodeDetector()
        val, points, _ = detector.detectAndDecode(img_candidate)
        if val and val.strip():
            pts = points[0].tolist() if points is not None and len(points) > 0 else []
            return val.strip(), pts
    except Exception:
        pass

    return None, []


def cv_decode_qr_pipeline(cv_img):
    """
    High-precision multi-stage OpenCV decoding pipeline:
    - Alpha channel transparent background composited over white
    - Multi-scale image pyramid (800px, 600px, full size)
    - Contrast enhancement (CLAHE)
    - Adaptive Gaussian and Otsu binarization
    - Morphological cleanup
    - 90/180/270 rotations
    """
    if cv_img is None:
        return None, []

    # Handle RGBA / BGRA transparency by compositing over crisp white
    if len(cv_img.shape) == 3 and cv_img.shape[2] == 4:
        alpha = cv_img[:, :, 3].astype(float) / 255.0
        bgr = cv_img[:, :, :3].astype(float)
        white_bg = np.ones_like(bgr) * 255.0
        cv_img = (bgr * alpha[:, :, None] + white_bg * (1.0 - alpha[:, :, None])).astype(np.uint8)

    # Prepare scale variations (original, max 800, max 500)
    h, w = cv_img.shape[:2]
    scales = [cv_img]

    for target_max in [800, 500]:
        if max(h, w) > target_max:
            scale_factor = target_max / float(max(h, w))
            new_w = max(1, int(w * scale_factor))
            new_h = max(1, int(h * scale_factor))
            resized = cv2.resize(cv_img, (new_w, new_h), interpolation=cv2.INTER_AREA)
            scales.append(resized)

    for img_variant in scales:
        # Step 1: Direct decode
        val, pts = _try_detect_with_all(img_variant)
        if val:
            return val, pts

        # Convert to Grayscale
        gray = cv2.cvtColor(img_variant, cv2.COLOR_BGR2GRAY) if len(img_variant.shape) == 3 else img_variant

        # Step 2: Grayscale direct
        val, pts = _try_detect_with_all(gray)
        if val:
            return val, pts

        # Step 3: CLAHE Contrast Stretch
        try:
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            val, pts = _try_detect_with_all(enhanced)
            if val:
                return val, pts
        except Exception:
            enhanced = gray

        # Step 4: Otsu Binarization
        try:
            _, otsu = cv2.threshold(enhanced, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            val, pts = _try_detect_with_all(otsu)
            if val:
                return val, pts

            # Inverted Otsu
            val, pts = _try_detect_with_all(255 - otsu)
            if val:
                return val, pts
        except Exception:
            pass

        # Step 5: Adaptive Gaussian Thresholding
        try:
            thresh = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 10
            )
            val, pts = _try_detect_with_all(thresh)
            if val:
                return val, pts
        except Exception:
            pass

        # Step 6: Sharpening kernel
        try:
            kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
            sharpened = cv2.filter2D(gray, -1, kernel)
            val, pts = _try_detect_with_all(sharpened)
            if val:
                return val, pts
        except Exception:
            pass

        # Step 7: Rotations (90, 180, 270 degrees)
        for rot in [cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180, cv2.ROTATE_90_COUNTERCLOCKWISE]:
            try:
                rotated = cv2.rotate(gray, rot)
                val, pts = _try_detect_with_all(rotated)
                if val:
                    return val, []
            except Exception:
                pass

    return None, []


@app.route('/api/scan', methods=['POST'])
def api_scan():
    """
    Accepts uploaded image file or base64 data URL,
    decodes QR code with high-precision OpenCV pipeline, parses structured content.
    """
    try:
        cv_img = None

        if 'file' in request.files:
            file = request.files['file']
            file_bytes = np.frombuffer(file.read(), np.uint8)
            # Use IMREAD_UNCHANGED to preserve alpha channel for transparency handling
            cv_img = cv2.imdecode(file_bytes, cv2.IMREAD_UNCHANGED)

        elif request.json and 'image_base64' in request.json:
            b64 = request.json['image_base64']
            if ',' in b64:
                b64 = b64.split(',', 1)[1]
            img_bytes = base64.b64decode(b64)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            cv_img = cv2.imdecode(np_arr, cv2.IMREAD_UNCHANGED)

        if cv_img is None:
            return jsonify({"success": False, "error": "Invalid or missing image file"}), 400

        content, points = cv_decode_qr_pipeline(cv_img)

        if not content:
            return jsonify({
                "success": False,
                "error": "No QR code could be detected. Please ensure the QR code is clear, well-lit, and in focus."
            }), 200

        parsed = parse_qr_content(content)

        return jsonify({
            "success": True,
            "raw": content,
            "points": points,
            "parsed": parsed
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/batch-generate', methods=['POST'])
def api_batch_generate():
    """
    Batch generation: takes an array of text/URL items,
    generates styled high-res QR codes, and packs them into a downloadable ZIP archive.
    """
    try:
        data = request.json or {}
        items = data.get('items', [])
        if not items:
            return jsonify({"success": False, "error": "No items provided for batch generation"}), 400

        options = data.get('options', {})
        fmt = options.get('format', 'png').lower()
        if fmt not in ['png', 'jpg', 'svg']:
            fmt = 'png'

        zip_buffer = io.BytesIO()
        manifest_lines = ["Index,Filename,Content,Type,Timestamp"]

        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for idx, item in enumerate(items, start=1):
                if isinstance(item, str):
                    text = item.strip()
                    custom_name = f"qr_{idx:03d}"
                else:
                    text = item.get('data', '').strip()
                    custom_name = item.get('filename', f"qr_{idx:03d}").strip()

                if not text:
                    continue

                safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', custom_name)
                parsed = parse_qr_content(text)

                if fmt == 'svg':
                    qr = qrcode.QRCode(
                        version=None,
                        error_correction=ERROR_MAP.get(options.get('error_correction', 'M'), ERROR_CORRECT_M),
                        box_size=10,
                        border=int(options.get('margin', 2))
                    )
                    qr.add_data(text)
                    qr.make(fit=True)
                    svg_img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
                    s_buf = io.BytesIO()
                    svg_img.save(s_buf)
                    file_data = s_buf.getvalue()
                    filename = f"{safe_name}.svg"
                else:
                    pil_img, _ = generate_qr_image(text, options)
                    f_buf = io.BytesIO()
                    if fmt == 'jpg':
                        pil_img.convert('RGB').save(f_buf, format='JPEG', quality=95)
                        filename = f"{safe_name}.jpg"
                    else:
                        pil_img.save(f_buf, format='PNG')
                        filename = f"{safe_name}.png"
                    file_data = f_buf.getvalue()

                zip_file.writestr(filename, file_data)
                manifest_lines.append(f'{idx},"{filename}","{text.replace("\"", "\"\"")}","{parsed["type"]}","{datetime.now().isoformat()}"')

            # Add manifest CSV to zip
            zip_file.writestr("manifest.csv", "\n".join(manifest_lines))

        zip_buffer.seek(0)
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name=f"quantum_qr_batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        )

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/parse', methods=['POST'])
def api_parse():
    """Utility API to parse and categorize any QR code string."""
    data = request.json or {}
    text = data.get('text', '')
    return jsonify({
        "success": True,
        "parsed": parse_qr_content(text)
    })


if __name__ == '__main__':
    print("=" * 60)
    print(" [*] QuantumQR Pro Server running at http://127.0.0.1:5000")
    print("=" * 60)
    app.run(host='127.0.0.1', port=5000, debug=False)

