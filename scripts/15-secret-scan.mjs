import { execFileSync } from 'node:child_process'
import { readFileSync,writeFileSync } from 'node:fs'
process.loadEnvFile('.env')
const keys=['MERCADOPAGO_ACCESS_TOKEN','MERCADOPAGO_WEBHOOK_SECRET','SUPABASE_SECRET_KEY']
const values=keys.map(key=>({key,value:process.env[key]})).filter(item=>item.value?.length>12)
const tracked=execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split('\n')
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n')
const findings=[]
for(const path of new Set(files)){
 if(!/\.(md|json|js|mjs|astro|sql|ts|css|example|txt)$/.test(path))continue
 let source;try{source=readFileSync(path,'utf8')}catch{continue}
 for(const item of values)if(source.includes(item.value))findings.push({path,type:'configured secret',key:item.key})
 if(/APP_USR-\d{8,}-\d{5,}-[a-f0-9]{20,}/i.test(source))findings.push({path,type:'access token pattern'})
}
const result={timestamp:new Date().toISOString(),scope:'Tracked and untracked non-ignored text files; configured server secrets + MP token pattern. .env values never printed.',envTracked:tracked.some(f=>/^\.env(?:\.|$)/.test(f)&&f!=='.env.example'),scannedFiles:files.length,findings,secretValuesLogged:false}
writeFileSync('docs/15-SECRET-SCAN-EVIDENCE.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify({envTracked:result.envTracked,findings:findings.length,scannedFiles:files.length}))
if(result.envTracked||findings.length)process.exitCode=1
