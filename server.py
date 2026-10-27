import http.server
import socket
import json
import base64
import os
import urllib.parse
import contextlib
from datetime import datetime

PORT = 3000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PHOTOS_DIR = os.path.join(BASE_DIR, "photos")
os.makedirs(PHOTOS_DIR, exist_ok=True)

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

LOCAL_IP = get_local_ip()

class PhotoboothHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/info':
            data = {
                'local_ip': LOCAL_IP,
                'port': PORT,
                'status': 'online',
                'timestamp': datetime.now().isoformat()
            }
            body = json.dumps(data).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path in ('', '/'):
            self.path = '/index.html'

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/save-photo':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                payload = json.loads(post_data.decode('utf-8'))
                image_data = payload.get('image', '')
                frame_type = payload.get('frameType', '4R')

                if ',' in image_data:
                    image_data = image_data.split(',', 1)[1]

                img_bytes = base64.b64decode(image_data)
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                photo_id = f"snap_{timestamp}_{frame_type.lower()}"
                filename = f"{photo_id}.jpg"
                filepath = os.path.join(PHOTOS_DIR, filename)

                with open(filepath, 'wb') as f:
                    f.write(img_bytes)

                download_url = f"http://{LOCAL_IP}:{PORT}/download.html?id={photo_id}"
                direct_img_url = f"http://{LOCAL_IP}:{PORT}/photos/{filename}"

                response = {
                    'success': True,
                    'id': photo_id,
                    'filename': filename,
                    'downloadUrl': download_url,
                    'directUrl': direct_img_url,
                    'localIp': LOCAL_IP
                }

                body = json.dumps(response).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as e:
                err_body = json.dumps({'success': False, 'error': str(e)}).encode('utf-8')
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(err_body)))
                self.end_headers()
                self.wfile.write(err_body)
            return

        self.send_response(404)
        self.end_headers()

class DualStackServer(http.server.ThreadingHTTPServer):
    def server_bind(self):
        with contextlib.suppress(Exception):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        return super().server_bind()

if __name__ == '__main__':
    DualStackServer.allow_reuse_address = True
    DualStackServer.address_family, addr = http.server._get_best_family(None, PORT)
    server = DualStackServer(addr, PhotoboothHandler)
    print(f"=== PixelSnap Photobooth Server Active ===")
    print(f"Local Access:   http://localhost:{PORT}")
    print(f"IP Access:      http://127.0.0.1:{PORT}")
    print(f"Network Access: http://{LOCAL_IP}:{PORT}")
    print(f"Serving from:   {BASE_DIR}")
    print(f"==========================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
