import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SITE = 'https://www.virtualeagues.com';
const COLOR = 0xed0960;
export const DEFAULTS = {teamSlug:'los-toxicos', teamName:'Greedy XI', leagueSlug:'mlpc', divisionSlug:'gold-s4', intervalMinutes:5};
export function configuration(local={}, env=process.env) {
  const c={...DEFAULTS,...local};
  const settings={STANDINGS_WEBHOOK_URL:'standingsWebhook',STATS_WEBHOOK_URL:'statsWebhook',TEAM_SLUG:'teamSlug',TEAM_NAME:'teamName',LEAGUE_SLUG:'leagueSlug',DIVISION_SLUG:'divisionSlug'};
  for(const [key,field] of Object.entries(settings)) if(env[key]) c[field]=env[key];
  if(env.UPDATE_INTERVAL_MINUTES) c.intervalMinutes=Number(env.UPDATE_INTERVAL_MINUTES);
  if(!Number.isFinite(c.intervalMinutes) || c.intervalMinutes<1) throw new Error('Update interval must be at least 1 minute.');
  return c;
}
export function stateDirectory(env=process.env) {
  if(env.RAILWAY_ENVIRONMENT_ID && !env.RAILWAY_VOLUME_MOUNT_PATH) throw new Error('Attach a Railway volume at /data before starting. This preserves the Discord message IDs across deployments.');
  return path.resolve(env.STATE_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || ROOT);
}
const hash = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const clean = x => String(x ?? '').replace(/[`<>@\\\r\n]/g, '').trim();
const markdown = x => clean(x).replace(/([*_~|])/g,'\\$1');
function load(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file,'utf8')); }
  catch(e) { if(e.code === 'ENOENT') return fallback; throw new Error(`${path.basename(file)} cannot be read. Restore the file or correct its JSON.`); }
}
export function save(file, data) {
  fs.writeFileSync(file+'.tmp', JSON.stringify(data,null,2)+'\n', {mode:0o600});
  fs.chmodSync(file+'.tmp',0o600);
  fs.renameSync(file+'.tmp',file);
}
export function webhook(value) {
  const u = new URL(value.trim());
  if(u.protocol !== 'https:' || u.hostname !== 'discord.com' || !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname)) throw new Error('Use the complete Copy Webhook URL from Discord.');
  return u.origin+u.pathname;
}
export async function request(url, options={}, fetcher=fetch) {
  for(let attempt=0;attempt<4;attempt++) {
    let r;
    try { r=await fetcher(url,{...options,signal:AbortSignal.timeout(25000),redirect:'error'}); }
    catch { throw new Error('Network request failed. Check internet access; the next cycle will retry.'); }
    const body=await r.json().catch(()=>null);
    if(r.status===429 && attempt<3) { await delay(Math.min(60000,Math.max(1000,Number(body?.retry_after ?? 5)*1000))); continue; }
    if(r.status>=500 && attempt<3) { await delay((attempt+1)*1500); continue; }
    if(!r.ok) { const e=new Error(`HTTP ${r.status}${r.status===404?' (page, webhook or message not found)':r.status===403?' (access denied)':''}`); e.status=r.status; e.discordCode=body?.code; throw e; }
    if(!body || typeof body!=='object') throw new Error('The service returned unexpected data. Previous Discord data was kept.');
    return body;
  }
}
const api = endpoint => request(SITE+endpoint);
export async function fetchLeague(c, get=api) {
  const d=await get(`/api/leagues/${encodeURIComponent(c.leagueSlug)}/divisions/${encodeURIComponent(c.divisionSlug)}`);
  const season=d.seasons?.find(s=>s.slug===c.divisionSlug);
  if(!d.league?.id || !season?.id) throw new Error('The configured league season was not found.');
  // This page passes its division-season ID with NO divisionId query parameter.
  const data=await get(`/api/league/${d.league.id}/season/${season.id}/standings`);
  if(!Array.isArray(data.standings) || !data.standings.length || data.standings.some(r=> !r.teamName || !Number.isFinite(r.position) || !Number.isFinite(r.played))) throw new Error('Standings format changed or table is empty. Previous Discord table was kept.');
  return {title:`${d.league.shortName || d.league.name} ${d.division.name} — ${season.name}`, rows:data.standings};
}
export async function fetchStats(c, get=api) {
  const team=await get(`/api/teams/resolve?club=${encodeURIComponent(c.teamSlug)}`);
  if(!team.id) throw new Error('Team could not be resolved.');
  const data=await get(`/api/team/${encodeURIComponent(team.id)}/stats`);
  if(data.teamId!==team.id || !data.era?.name || !Number.isFinite(data.summary?.matches) || !Array.isArray(data.topScorers) || !Array.isArray(data.topAssisters)) throw new Error('Stats format changed. Previous Discord stats were kept.');
  return data;
}
export function standingsPayload(data, c, stamp=new Date().toISOString()) {
  const nameWidth=17;
  const header=' # '+'Team'.padEnd(nameWidth)+'  P  GD Pts';
  const lines=data.rows.map(r=>{
    const name=clean(r.teamName);
    const label=name.length>nameWidth?name.slice(0,nameWidth-1)+'…':name;
    return `${String(r.position).padStart(2)} ${label.padEnd(nameWidth)} ${String(r.played).padStart(2)} ${String(r.goalDifference).padStart(3)} ${String(r.totalPoints ?? r.points).padStart(3)}`;
  });
  const embeds=[];
  for(let i=0;i<lines.length;i+=18) embeds.push({title:`${data.title}${i?' (continued)':''}`,description:'```text\n'+header+'\n'+lines.slice(i,i+18).join('\n')+'\n```',color:COLOR});
  const ours=data.rows.find(r=>r.teamSlug===c.teamSlug || r.teamName.toLowerCase()===c.teamName.toLowerCase());
  if(ours) embeds[0].fields=[{name:c.teamName,value:`#${ours.position} • P ${ours.played} • GD ${ours.goalDifference} • ${ours.totalPoints ?? ours.points} pts`}];
  embeds.at(-1).footer={text:`Virtualeagues • Checked every ${c.intervalMinutes} minutes • P played / GD goal difference / Pts points`};
  embeds.at(-1).timestamp=stamp;
  return validatePayload({embeds,allowed_mentions:{parse:[]}});
}
const LEADERS=[['topScorers','Top scorers','goals'],['topAssisters','Top assisters','assists'],['topContribution','Top contributions (G+A)','value'],['topSaves','Top saves','value'],['topPossessionWon','Top possession won','value'],['topTackles','Top tackles','value'],['topInterceptions','Top interceptions','value'],['topCleanSheets','Top clean sheets','value'],['topKeyPasses','Top key passes','value']];
export function statsPayload(d,c,stamp=new Date().toISOString()) {
  const s=d.summary;
  const result=x=>x?`${clean(x.score)} vs ${markdown(x.opponent)}`:'None yet';
  const fields=[{name:'Team summary',value:`Matches **${s.matches}** • Wins **${s.wins}** • Draws **${s.draws}** • Losses **${s.losses}**\nGoals for **${s.goalsFor}** • Against **${s.goalsAgainst}** • Difference **${s.goalDifference}**\nClean sheets **${s.cleanSheets}** • Win rate **${s.winRate}%** • Streak **${clean(s.currentStreak)||'None'}**\nBiggest win: ${result(s.biggestWin)}\nHeaviest loss: ${result(s.heaviestLoss)}`}];
  for(const [key,name,metric] of LEADERS) fields.push({name,value:(d[key]??[]).slice(0,5).map((p,i)=>`${i+1}. ${markdown(clean(p.name).slice(0,70))} — **${p[metric] ?? 0}**`).join('\n')||'No data recorded yet',inline:true});
  return validatePayload({embeds:[{title:`${c.teamName} — ${d.era.name} stats`,description:'Current era, across competitions • Same scope as Stats → Era on the website.\nLeaderboards show up to five players per category.',color:COLOR,fields,footer:{text:`Virtualeagues • Last successful check • Checks every ${c.intervalMinutes} minutes`},timestamp:stamp}],allowed_mentions:{parse:[]}});
}
export function validatePayload(p) {
  let chars=0;
  if(p.embeds.length>10) throw new Error('Too many Discord embeds.');
  for(const e of p.embeds) {
    if((e.title?.length??0)>256 || (e.description?.length??0)>4096 || (e.fields?.length??0)>25) throw new Error('Discord display limit exceeded.');
    chars+=(e.title?.length??0)+(e.description?.length??0)+(e.footer?.text.length??0);
    for(const f of e.fields??[]) { if(f.name.length>256 || f.value.length>1024) throw new Error('Discord field limit exceeded.'); chars+=f.name.length+f.value.length; }
  }
  if(chars>6000) throw new Error('Discord text limit exceeded. Previous message was kept.');
  return p;
}
export async function publish(url, payload, entry, persist, send=request) {
  const fingerprint=hash(url);
  let id=entry?.webhookHash===fingerprint?entry.messageId:null;
  const options={method:id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
  let message;
  if(id) {
    try { message=await send(`${url}/messages/${id}`,options); }
    catch(e) { if(e.status!==404 || e.discordCode!==10008) throw e; id=null; }
  }
  if(!id) message=await send(`${url}?wait=true`,{...options,method:'POST'});
  if(!message?.id) throw new Error('Discord did not return a message ID.');
  await persist({webhookHash:fingerprint,messageId:message.id,lastSuccess:new Date().toISOString()});
}
async function setup() {
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  try {
    console.log('Create two Discord text channels and a separate webhook in each.\nPaste URLs here locally. Keep them private.\n');
    const standingsWebhook=webhook(await rl.question('League-table channel webhook URL: '));
    const statsWebhook=webhook(await rl.question('Stats channel webhook URL: '));
    if(standingsWebhook===statsWebhook) throw new Error('Use two different webhooks, one for each channel.');
    save(path.join(ROOT,'config.json'),{...DEFAULTS,standingsWebhook,statsWebhook});
    console.log('\nSaved privately in config.json. Ready to update both channels.');
  } finally { rl.close(); }
}
async function main() {
  if(Number(process.versions.node.split('.')[0])<22) throw new Error('Install Node.js LTS (22 or newer).');
  if(process.argv.includes('--setup')) { await setup(); return; }
  const preview=process.argv.includes('--preview');
  let c=configuration(load(path.join(ROOT,'config.json'),{}));
  if(!preview && (!c.standingsWebhook || !c.statsWebhook)) {
    if(!process.stdin.isTTY || process.env.RAILWAY_ENVIRONMENT_ID) throw new Error('Set both STANDINGS_WEBHOOK_URL and STATS_WEBHOOK_URL in the hosting service Variables.');
    await setup(); c=configuration(load(path.join(ROOT,'config.json'),{}));
  }
  if(!preview) {
    c.standingsWebhook=webhook(c.standingsWebhook);c.statsWebhook=webhook(c.statsWebhook);
    if(c.standingsWebhook===c.statsWebhook) throw new Error('Use two different webhooks, one per channel.');
  }
  const dir=preview?ROOT:stateDirectory();
  const stateFile=path.join(dir,'state.json');
  const state=load(stateFile,{});
  if(!preview) { fs.mkdirSync(dir,{recursive:true});save(stateFile,state); }
  const tasks=[['standings',fetchLeague,standingsPayload],['stats',fetchStats,statsPayload]];
  do {
    let failed=false;
    for(const [key,get,format] of tasks) {
      try {
        const p=format(await get(c),c);
        if(preview) console.log(JSON.stringify(p,null,2));
        else await publish(c[key+'Webhook'],p,state[key],entry=>{state[key]=entry;save(stateFile,state);});
        console.log(`${new Date().toLocaleString()}: ${key} ${preview?'preview verified':'updated'}.`);
      } catch(e) { failed=true;console.error(`${key}: ${e.message} Last successful check remains displayed in Discord.`); }
    }
    if(preview || process.argv.includes('--once')) { if(failed)process.exitCode=1;break; }
    console.log(`Next check in ${c.intervalMinutes} minutes. Updater running.`);
    await delay(c.intervalMinutes*60000);
  } while(true);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e.message);process.exitCode=1;});
