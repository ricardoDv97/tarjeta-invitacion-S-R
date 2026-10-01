import { execFile, execFileSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { createServer } from 'node:net'

// Never accepts DATABASE_URL, PGHOST or an existing data directory.
// Every run initializes its own disposable cluster, bound to loopback only.
export async function startPostgres() {
  const binaries = process.env.TEST_PG_BIN ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/16/bin' : '')
  const binary = name => join(binaries, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
  const root = await mkdtemp(join(tmpdir(), 'wedding-security-pg-'))
  const data = join(root, 'data')
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG|SUPABASE|MERCADOPAGO|DATABASE_URL/.test(key)))
  env.PGCLIENTENCODING = 'UTF8'
  env.PGTZ = 'UTC'
  const options = { windowsHide: true, encoding: 'utf8', env, maxBuffer: 8 * 1024 * 1024 }
  const port = await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolvePort(value)) })
  })
  let started = false
  const stop = async () => {
    if (started) execFileSync(binary('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], { ...options, stdio: 'ignore', timeout: 30000 })
    const target = resolve(root)
    if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('wedding-security-pg-')) throw new Error('Unsafe test cleanup path')
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
  try {
    execFileSync(binary('initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale'], options)
    execFileSync(binary('pg_ctl'), ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { ...options, stdio: 'ignore', timeout: 30000 })
    started = true
    const query = sql => new Promise((resolveQuery, reject) => {
      const child = execFile(binary('psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres'], options,
        (error, stdout, stderr) => error ? reject(new Error(stderr.trim() || 'Local PostgreSQL test failed')) : resolveQuery(stdout.trim()))
      child.stdin.end(sql)
    })
    await query(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users (id uuid primary key);
      grant usage on schema public to service_role, anon, authenticated;
      alter default privileges in schema public grant all on tables to service_role;
      alter default privileges in schema public grant all on sequences to service_role;`)
    const migrate = async (predicate = () => true) => {
      const directory = new URL('../../supabase/migrations/', import.meta.url)
      for (const name of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort().filter(predicate)) {
        await query(`begin;\n${await readFile(new URL(name, directory), 'utf8')}\ncommit;`)
      }
    }
    return { query, migrate, stop }
  } catch (error) {
    await stop()
    throw error
  }
}

export const literal = value => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`
