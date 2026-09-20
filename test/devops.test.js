const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Fly.io DevOps & Database Path Resolution Suite', async (t) => {
  const rootDir = path.resolve(__dirname, '..');

  await t.test('1. Verify Dockerfile exists and contains required Fly.io build specs', () => {
    const dockerfilePath = path.join(rootDir, 'Dockerfile');
    assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile must exist');
    const content = fs.readFileSync(dockerfilePath, 'utf8');

    assert.ok(content.includes('FROM node:20-slim'), 'Must use node:20-slim base');
    assert.ok(content.includes('python3'), 'Must install python3 for better-sqlite3');
    assert.ok(content.includes('make'), 'Must install make for better-sqlite3');
    assert.ok(content.includes('g++'), 'Must install g++ for better-sqlite3');
    assert.ok(content.includes('gcc'), 'Must install gcc for better-sqlite3');
    assert.ok(content.includes('WORKDIR /app'), 'Must set WORKDIR /app');
    assert.ok(content.includes('npm ci --omit=dev'), 'Must run npm ci --omit=dev');
    assert.ok(content.includes('npm rebuild better-sqlite3'), 'Must rebuild better-sqlite3');
    assert.ok(content.includes('node deploy-commands.js && node index.js'), 'Must execute startup chain');
  });

  await t.test('2. Verify fly.toml contains 24/7 background worker specs with persistent disk', () => {
    const flyPath = path.join(rootDir, 'fly.toml');
    assert.ok(fs.existsSync(flyPath), 'fly.toml must exist');
    const content = fs.readFileSync(flyPath, 'utf8');

    assert.ok(content.includes('app = "dhakan-discord-bot"'), 'App name must be dhakan-discord-bot');
    assert.ok(content.includes('primary_region = "sin"'), 'Primary region must be sin');
    assert.ok(content.includes('DB_PATH = "/data/database.sqlite"'), 'DB_PATH must point to /data/database.sqlite');
    assert.ok(content.includes('source = "dhakan_data"'), 'Mount source must be dhakan_data');
    assert.ok(content.includes('destination = "/data"'), 'Mount destination must be /data');
    assert.ok(content.includes('initial_size = "1gb"'), 'Mount initial_size must be 1gb');
    assert.ok(content.includes('auto_stop_machines = false'), 'auto_stop_machines must be false for 24/7 worker');
    assert.ok(content.includes('auto_start_machines = false'), 'auto_start_machines must be false');
    assert.ok(!content.includes('[http_service]'), 'Must not include [http_service] for Discord bot background worker');
  });

  await t.test('3. Verify .dockerignore excludes sensitive and unneeded assets', () => {
    const ignorePath = path.join(rootDir, '.dockerignore');
    assert.ok(fs.existsSync(ignorePath), '.dockerignore must exist');
    const content = fs.readFileSync(ignorePath, 'utf8');

    assert.ok(content.includes('node_modules/'), 'Must ignore node_modules');
    assert.ok(content.includes('.git/'), 'Must ignore .git');
    assert.ok(content.includes('.env'), 'Must ignore .env');
    assert.ok(content.includes('test/'), 'Must ignore test/');
    assert.ok(content.includes('*.sqlite'), 'Must ignore *.sqlite');
  });

  await t.test('4. Verify database path resolution logic in db.js', () => {
    const dbSource = fs.readFileSync(path.join(rootDir, 'database/db.js'), 'utf8');

    assert.ok(dbSource.includes('process.env.DB_PATH'), 'Must check process.env.DB_PATH');
    assert.ok(dbSource.includes('path.join(__dirname, \'../database.sqlite\')'), 'Must default to ../database.sqlite');
    assert.ok(dbSource.includes('fs.mkdirSync(dir, { recursive: true })'), 'Must synchronously create parent directory');
  });
});
