const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

const PORT = 3000;
const BASE_DIR = __dirname;
const PHOTOS_DIR = path.join(BASE_DIR, 'photos');

if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const LOCAL_IP = getLocalIp();

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // API: Info
    if (pathname === '/api/info' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            localIp: LOCAL_IP,
            port: PORT,
            status: 'online',
            time: new Date().toISOString()
        }));
        return;
    }

    // API: Save Photo
    if (pathname === '/api/save-photo' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });

        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                let imgData = data.image || '';
                const frameType = (data.frameType || '4R').toLowerCase();

                if (imgData.includes(',')) {
                    imgData = imgData.split(',')[1];
                }

                const buffer = Buffer.from(imgData, 'base64');
                const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
                const photoId = `snap_${timestamp}_${frameType}`;
                const filename = `${photoId}.jpg`;
                const filePath = path.join(PHOTOS_DIR, filename);

                fs.writeFileSync(filePath, buffer);

                const downloadUrl = `http://${LOCAL_IP}:${PORT}/download.html?id=${photoId}`;
                const directUrl = `http://${LOCAL_IP}:${PORT}/photos/${filename}`;

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    id: photoId,
                    filename: filename,
                    downloadUrl: downloadUrl,
                    directUrl: directUrl,
                    localIp: LOCAL_IP
                }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // Static File Serving
    if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
    }

    const filePath = path.join(BASE_DIR, pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(BASE_DIR)) {
        res.writeHead(403);
        res.end('Access Denied');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache'
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`=== AM Street Photobooth Server Active ===`);
    console.log(`Local Access:   http://localhost:${PORT}`);
    console.log(`IP Access:      http://127.0.0.1:${PORT}`);
    console.log(`Network Access: http://${LOCAL_IP}:${PORT}`);
    console.log(`Serving from:   ${BASE_DIR}`);
    console.log(`==========================================`);
});
