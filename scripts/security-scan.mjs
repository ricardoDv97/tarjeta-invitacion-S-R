// Repeatable pre-deploy check. Emits only file paths/categories, never matched data.
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const git = args => execFileSync('git',args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024})
const tracked = git(['ls-files','-z']).split('\0').filter(Boolean)
const files = [...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))]
const findings=[]
const syntheticFixtures=new Set()
if(tracked.some(name=>/(^|\/)\.env(?:$|\.(?!example$))/.test(name))) findings.push({file:'.env',category:'tracked environment file'})
const secrets=[]
try {
  const env=await readFile('.env','utf8')
  for(const line of env.split(/\r?\n/)) {
    const match=line.match(/^([A-Z_]*(?:SECRET|ACCESS_TOKEN|PASSWORD)[A-Z_]*)\s*=\s*(.*?)\s*$/)
    if(match) { const value=match[2].replace(/^(['"])(.*)\1$/,'$2');if(value.length>=12)secrets.push(value) }
  }
} catch(error) { if(error.code!=='ENOENT')throw new Error('Unable to inspect local secret values safely') }
const patterns=[
  ['credential prefix',/\b(?:sb_secret_[A-Za-z0-9_-]{24,}|APP_USR-[A-Za-z0-9_-]{24,})/],
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['literal credential',/(?:password|webhook_secret|access_token)\s*[:=]\s*['"][^'"\r\n]{16,}['"]/i],
]
let scanned=0
for(const file of files) {
  if(!/\.(?:js|mjs|cjs|ts|astro|json|md|sql|html|css|yml|yaml|toml|txt|example)$/.test(file) && !file.startsWith('.'))continue
  let source
  try { source=await readFile(file,'utf8') } catch(error) { if(error.code==='ENOENT')continue;throw new Error('Unable to read scan candidate') }
  scanned++
  if(secrets.some(secret=>source.includes(secret)))findings.push({file,category:'matches local private credential'})
  for(const [category,pattern] of patterns) {
    for(const match of source.matchAll(new RegExp(pattern.source,pattern.flags+'g'))) {
      const literal=match[0].match(/['"]([^'"]+)['"]$/)?.[1]
      if(category==='literal credential' && file.startsWith('tests/') && /^synthetic[-_]/.test(literal??'')) {
        syntheticFixtures.add(file)
      } else findings.push({file,category})
    }
  }
}
// Scan the full tracked diff in memory too; never print its contents here.
const diff=git(['diff','HEAD','--no-ext-diff'])
if(secrets.some(secret=>diff.includes(secret)))findings.push({file:'git diff HEAD',category:'matches local private credential'})
console.log(JSON.stringify({scanned,envTracked:tracked.includes('.env'),syntheticFixtures:[...syntheticFixtures],findings},null,2))
if(findings.length)process.exitCode=1
