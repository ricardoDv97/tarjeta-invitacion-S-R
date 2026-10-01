// Local packaging only. No credentials, network or database connection.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const out = new URL('docs/14-APLICACION-CONTROLADA/', root)
const approved = [
  ['20260929000000_atomic_guest_registration.sql', 'b6b8827fe1cb2b4236c7856bca4de993ed3b167f918515d0f5a3c4d83d9f9889'],
  ['20260929000100_mercadopago_payment_attempts.sql', 'f8977617300ed00b3da16f9ba3eafb6e1cc7fddb08f016ba1c8e1d335cfdbe38'],
  ['20260930000000_runtime_least_privilege.sql', '90302ded14f38996eaa374f38c088d159dbe97225c65a947436826884dbae3f7'],
]
const files = await Promise.all(approved.map(async ([name, sha256]) => {
  const bytes = await readFile(new URL(`supabase/migrations/${name}`, root))
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(`Frozen migration changed: ${name}`)
  return { name, sha256, bytes }
}))
await mkdir(out, { recursive: true })
for (let i = 0; i < files.length; i++) {
  const { name, sha256, bytes } = files[i]
  const version = name.slice(0, 14)
  const previous = i ? files[i - 1].name.slice(0, 14) : '20260903000000'
  const migrationName = name.slice(15, -4)
  const tag = '$reviewed_migration$'
  if (bytes.includes(Buffer.from(tag))) throw new Error('SQL delimiter collision')
  const prefix = `-- ONE FILE ONLY. Stop on any error; issue ROLLBACK and do not continue.\n-- Source SHA-256: ${sha256}\n-- Application writes must remain suspended. Check baseline before running.\nBEGIN;\nDO $guard$\nBEGIN\n  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Use the reviewed postgres owner'; END IF;\n  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '${previous}' THEN\n    RAISE EXCEPTION 'Unexpected migration history: STOP';\n  END IF;\nEND;\n$guard$;\n-- BEGIN EXACT APPROVED SOURCE\n`
  const suffix = `\n-- END EXACT APPROVED SOURCE\n-- Version bookkeeping is committed in the same transaction as the migration.\nINSERT INTO supabase_migrations.schema_migrations(version, name, statements)\nVALUES ('${version}', '${migrationName}', ARRAY[${tag}${bytes.toString('utf8')}${tag}]);\nCOMMIT;\n`
  await writeFile(new URL(`${i + 1}0-APPLY-${version}.sql`, out), Buffer.concat([Buffer.from(prefix), bytes, Buffer.from(suffix)]))
}
await writeFile(new URL('SHA256.json', out), JSON.stringify(files.map(({ name, sha256 }) => ({ name, sha256 })), null, 2) + '\n')
// Read-only integrity checks are reused verbatim from the approved preflight.
const preflight = await readFile(new URL('docs/14-PREFLIGHT-READ-ONLY.sql', root), 'utf8')
const counters = preflight.slice(preflight.indexOf('-- Debe dar cero:'))
if (!counters.startsWith('-- Debe dar cero:')) throw new Error('Missing integrity checks')
await writeFile(new URL('40-INTEGRITY-READ-ONLY.sql', out), counters)
