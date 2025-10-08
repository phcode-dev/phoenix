#!/usr/bin/env node
/* eslint-env node */

const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const httpProxy = require('http-proxy');

const ACCOUNT_PROD = 'https://account.phcode.dev';
const ACCOUNT_STAGING = 'https://account-stage.phcode.dev';
const ACCOUNT_DEV = 'http://localhost:5000';

// Account server configuration - switch between local and production
let accountServer = ACCOUNT_PROD; // Production
// Set to local development server if --localAccount flag is provided

// Default configuration
let config = {
    port: 8000,
    host: '0.0.0.0',
    root: process.cwd(),
    cache: false,
    cors: true,
    silent: false
};

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    let hasLocalAccount = false;
    let hasStagingAccount = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '-p' && args[i + 1]) {
            config.port = parseInt(args[i + 1]);
            i++;
        } else if (arg === '-a' && args[i + 1]) {
            config.host = args[i + 1];
            i++;
        } else if (arg === '-c-1') {
            config.cache = false;
        } else if (arg === '-c' && args[i + 1]) {
            config.cache = parseInt(args[i + 1]) > 0;
            i++;
        } else if (arg === '--cors') {
            config.cors = true;
        } else if (arg === '-S' || arg === '--silent') {
            config.silent = true;
        } else if (arg === '--log-ip') {
            config.logIp = true;
        } else if (arg === '--localAccount') {
            hasLocalAccount = true;
            accountServer = ACCOUNT_DEV;
        } else if (arg === '--stagingAccount') {
            hasStagingAccount = true;
            accountServer = ACCOUNT_STAGING;
        } else if (!arg.startsWith('-')) {
            config.root = path.resolve(arg);
        }
    }

    // Check for mutually exclusive flags
    if (hasLocalAccount && hasStagingAccount) {
        console.error('Error: --localAccount and --stagingAccount cannot be used together');
        process.exit(1);
    }
}

// Create proxy server
const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    secure: true,
    followRedirects: true
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
    console.error('Proxy Error:', err.message);
    if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy Error', message: err.message }));
    }
});

// Modify proxy request headers
proxy.on('proxyReq', (proxyReq, req) => {
    // Transform localhost:8000 to appear as phcode.dev domain
    const originalReferer = req.headers.referer;
    const originalOrigin = req.headers.origin;

    // Set target host
    const accountHost = new URL(accountServer).hostname;
    proxyReq.setHeader('Host', accountHost);

    // Transform referer from localhost:8000 to phcode.dev
    if (originalReferer && originalReferer.includes('localhost:8000')) {
        const newReferer = originalReferer.replace(/http:\/\/localhost:8000/g, 'https://phcode.dev');
        proxyReq.setHeader('Referer', newReferer);
    } else if (!originalReferer) {
        proxyReq.setHeader('Referer', 'https://phcode.dev/');
    }

    // Transform origin from localhost:8000 to phcode.dev
    if (originalOrigin && originalOrigin.includes('localhost:8000')) {
        const newOrigin = originalOrigin.replace(/http:\/\/localhost:8000/g, 'https://phcode.dev');
        proxyReq.setHeader('Origin', newOrigin);
    }

    // Ensure HTTPS scheme
    proxyReq.setHeader('X-Forwarded-Proto', 'https');
    proxyReq.setHeader('X-Forwarded-For', req.connection.remoteAddress);

});

// Modify proxy response headers
proxy.on('proxyRes', (proxyRes, req, res) => {
    // Pass through cache control and other security headers
    // But translate any domain references back to localhost for the browser

    const setCookieHeader = proxyRes.headers['set-cookie'];
    if (setCookieHeader) {
        // Transform any phcode.dev domain cookies back to localhost
        const modifiedCookies = setCookieHeader.map(cookie => {
            return cookie.replace(/domain=\.?phcode\.dev/gi, 'domain=localhost');
        });
        proxyRes.headers['set-cookie'] = modifiedCookies;
    }

    // Ensure CORS headers if needed
    if (config.cors) {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control';
    }
});

// Get MIME type based on file extension
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.htm': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

// Serve static files
function serveStaticFile(req, res, filePath) {
    fs.stat(filePath, (err, stats) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return;
        }

        if (stats.isDirectory()) {
            // Try to serve index.html from directory
            const indexPath = path.join(filePath, 'index.html');
            fs.stat(indexPath, (err, indexStats) => {
                if (!err && indexStats.isFile()) {
                    serveStaticFile(req, res, indexPath);
                } else {
                    // List directory contents
                    fs.readdir(filePath, (err, files) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'text/plain' });
                            res.end('Error reading directory');
                            return;
                        }

                        const html = `
                            <!DOCTYPE html>
                            <html>
                            <head><title>Directory listing</title></head>
                            <body>
                                <h1>Directory listing for ${req.url}</h1>
                                <ul>
                                    ${files.map(file => 
                                        `<li><a href="${path.join(req.url, file)}">${file}</a></li>`
                                    ).join('')}
                                </ul>
                            </body>
                            </html>
                        `;

                        const headers = {
                            'Content-Type': 'text/html',
                            'Content-Length': Buffer.byteLength(html)
                        };

                        if (!config.cache) {
                            headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
                            headers['Pragma'] = 'no-cache';
                            headers['Expires'] = '0';
                        }

                        if (config.cors) {
                            headers['Access-Control-Allow-Origin'] = '*';
                            headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                            headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control';
                        }

                        res.writeHead(200, headers);
                        res.end(html);
                    });
                }
            });
            return;
        }

        // Serve file
        const mimeType = getMimeType(filePath);
        const headers = {
            'Content-Type': mimeType,
            'Content-Length': stats.size
        };

        if (!config.cache) {
            headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
            headers['Pragma'] = 'no-cache';
            headers['Expires'] = '0';
        }

        if (config.cors) {
            headers['Access-Control-Allow-Origin'] = '*';
            headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control';
        }

        res.writeHead(200, headers);

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error reading file');
        });
    });
}

// Create HTTP server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // Handle CORS preflight
    if (req.method === 'OPTIONS' && config.cors) {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control'
        });
        res.end();
        return;
    }

    // Handle proxy config request
    if (parsedUrl.pathname === '/proxy/config') {
        const configResponse = {
            accountURL: accountServer + '/'
        };

        if (!config.silent) {
            console.log(`[CONFIG] ${req.method} ${parsedUrl.pathname} -> ${JSON.stringify(configResponse)}`);
        }

        const headers = {
            'Content-Type': 'application/json'
        };

        if (config.cors) {
            headers['Access-Control-Allow-Origin'] = '*';
            headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
            headers['Access-Control-Allow-Headers'] = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control';
        }

        res.writeHead(200, headers);
        res.end(JSON.stringify(configResponse));
        return;
    }

    // Check if this is a proxy request
    if (parsedUrl.pathname.startsWith('/proxy/accounts')) {
        // Extract the path after /proxy/accounts
        const targetPath = parsedUrl.pathname.replace('/proxy/accounts', '');
        const originalUrl = req.url;

        // Modify the request URL for the proxy
        req.url = targetPath + (parsedUrl.search || '');

        if (!config.silent) {
            console.log(`[PROXY] ${req.method} ${originalUrl} -> ${accountServer}${req.url}`);
        }

        // Proxy the request
        proxy.web(req, res, {
            target: accountServer,
            changeOrigin: true,
            secure: true
        });
        return;
    }

    // Serve static files
    let filePath = path.join(config.root, parsedUrl.pathname);

    // Security: prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(config.root)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    if (!config.silent) {
        // Skip logging PWA asset requests to reduce noise. chrome somehoe sends this every second to dev server.
        if (!parsedUrl.pathname.includes('/assets/pwa/')) {
            const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}${config.logIp ? ` (${clientIp})` : ''}`);
        }
    }

    // Handle directory requests without trailing slash
    fs.stat(filePath, (err, stats) => {
        if (err) {
            serveStaticFile(req, res, filePath);
        } else if (stats.isDirectory() && !parsedUrl.pathname.endsWith('/')) {
            // Redirect to URL with trailing slash for directories
            res.writeHead(301, { 'Location': req.url + '/' });
            res.end();
        } else {
            serveStaticFile(req, res, filePath);
        }
    });
});

// Parse arguments and start server
parseArgs();

server.listen(config.port, config.host, () => {
    if (!config.silent) {
        console.log(`Starting up http-server, serving ${config.root}`);
        console.log(`Available on:`);
        console.log(`  http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
        console.log(`Proxy routes:`);
        console.log(`  /proxy/accounts/* -> ${accountServer}/*`);
        console.log('Hit CTRL-C to stop the server');
    }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down the server...');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down the server...');
    server.close(() => {
        process.exit(0);
    });
});
