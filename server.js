import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMoonTideData } from './src/data.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

const server = createServer(async (request, response) => {
    try {
        const url = new URL(request.url, `http://${request.headers.host}`);

        if (request.method === 'OPTIONS') {
            writeCors(response, 204);
            return;
        }

        if (url.pathname === '/api/data') {
            await handleDataRequest(url, response);
            return;
        }

        await handleStaticRequest(url.pathname, response);
    } catch (error) {
        writeJson(response, 500, {
            error: error.message || '服务器内部错误。'
        });
    }
});

server.listen(port, host, () => {
    console.log(`Chiba moon/tide app running at http://${host}:${port}`);
});

async function handleDataRequest(url, response) {
    const start = url.searchParams.get('start') || '';
    const end = url.searchParams.get('end') || '';
    const startHour = url.searchParams.get('startHour') ?? 18;
    const endHour = url.searchParams.get('endHour') ?? 6;

    try {
        const data = await getMoonTideData(start, end, startHour, endHour);
        writeJson(response, 200, data);
    } catch (error) {
        writeJson(response, 400, {
            error: error.message || '数据获取失败。'
        });
    }
}

async function handleStaticRequest(pathname, response) {
    const requestPath = pathname === '/' ? '/index.html' : pathname;
    const normalized = normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[/\\])+/, '');
    const filePath = join(publicDir, normalized);

    if (!filePath.startsWith(publicDir)) {
        writeText(response, 403, 'Forbidden');
        return;
    }

    try {
        const data = await readFile(filePath);
        response.writeHead(200, {
            'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream'
        });
        response.end(data);
    } catch {
        writeText(response, 404, 'Not found');
    }
}

function writeJson(response, status, payload) {
    response.writeHead(status, corsHeaders({
        'Content-Type': 'application/json; charset=utf-8'
    }));
    response.end(JSON.stringify(payload));
}

function writeText(response, status, text) {
    response.writeHead(status, corsHeaders({
        'Content-Type': 'text/plain; charset=utf-8'
    }));
    response.end(text);
}

function writeCors(response, status) {
    response.writeHead(status, corsHeaders());
    response.end();
}

function corsHeaders(headers = {}) {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        ...headers
    };
}
