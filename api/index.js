'use strict';

const { handleRequest, SECURITY_HEADERS } = require('../server');

module.exports = async function vercelHandler(req, res) {
  try {
    const parsed = new URL(req.url || '/', 'http://127.0.0.1');
    const routed = parsed.searchParams.get('__ekoni_path');
    if (routed === '__root__') {
      req.url = '/';
    } else if (routed !== null) {
      parsed.searchParams.delete('__ekoni_path');
      const qs = parsed.searchParams.toString();
      req.url = '/api/' + routed.replace(/^\/+/, '') + (qs ? '?' + qs : '');
    }
    await handleRequest(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err && err.message ? err.message : 'Internal Server Error' }));
    }
  }
};
