#!/usr/bin/env node
// =============================================================================
// No-Backdoor System — Backend Health Check Script
// =============================================================================
// Used by Docker HEALTHCHECK instruction to verify the backend service
// is running and responsive. Exits with code 0 if healthy, 1 otherwise.
// =============================================================================

const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/api/health',
  method: 'GET',
  timeout: 5000,
};

const request = http.request(options, (response) => {
  if (response.statusCode === 200) {
    process.exit(0);
  } else {
    console.error(`Health check failed with status: ${response.statusCode}`);
    process.exit(1);
  }
});

request.on('error', (error) => {
  console.error(`Health check request failed: ${error.message}`);
  process.exit(1);
});

request.on('timeout', () => {
  console.error('Health check request timed out');
  request.destroy();
  process.exit(1);
});

request.end();
