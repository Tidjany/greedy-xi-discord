import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULTS,request,fetchLeague,standingsPayload,statsPayload,publish,save,webhook} from './updater.mjs';
import {nextFixtures,fixturesPayload} from './fixtures.mjs';

export const RPCL={...DEFAULTS,leagueSlug:'rpcl',divisionSlug:'rpcl-s14-knights-league-s14',intervalMinutes:15};
const title='RPCL — Knight’s League · Season 14';
const api=p=>request('https://www.virtualeagues.com'+p);

// Restrict both stats and fixtures to the team-season in this RPCL table.
export function rpclSources({get=api,now=()=>new Date()}={}) {
  let leaguePromise;
  const league=()=>leaguePromise??=fetchLeague(RPCL,get).then(d=>({...d,title}));
  const entry=async()=>{
    const data=await league();
    const row=data.rows.find(r=>r.teamSlug===RPCL.teamSlug);
    if(!row?.teamId || !row.teamSeasonId)throw new Error('Greedy XI’s RPCL registration was not found. Previous messages were kept.');
    return row;
  };
  return {
    standings:league,
    stats:async()=>{
      const row=await entry();
      const d=await get(`/api/team/${encodeURIComponent(row.teamId)}/stats?season=${encodeURIComponent(row.teamSeasonId)}`);
      if(d.teamId!==row.teamId || d.season?.teamSeasonId!==row.teamSeasonId || !Number.isFinite(d.summary?.matches) || !Array.isArray(d.topScorers) || !Array.isArray(d.topAssisters))throw new Error('RPCL season stats format changed. Previous stats were kept.');
      return d;
    },
    fixtures:async()=>{
      const row=await entry();
      const d=await get(`/api/team?id=${encodeURIComponent(row.teamId)}`);
      if(d.team?.id!==row.teamId || !Array.isArray(d.team.teamSeasons))throw new Error('RPCL fixture data could not be verified.');
      const season=d.team.teamSeasons.find(s=>s.id===row.teamSeasonId);
      if(!season || season.divisionSeason?.slug!==RPCL.divisionSlug)throw new Error('RPCL season is missing from the team schedule. Previous fixtures were kept.');
      return nextFixtures({...d.team,teamSeasons:[season]},now());
    }
  };
}
export function rpclStatsPayload(data,c=RPCL) {
  // The shared layout expects an era label; only its heading uses this value.
  // The source data itself is fetched with the RPCL team-season filter above.
  const p=statsPayload({...data,era:{name:'RPCL Season 14'}},c);
  p.embeds[0].title=`${c.teamName} — RPCL Season 14 stats`;
  delete p.embeds[0].description;
  return p;
}
export async function runRPCL({env=process.env,file=fileURLToPath(new URL('./rpcl-state.json',import.meta.url)),sources=rpclSources(),send=publish,log=console.log}={}) {
  const hooks={};
  for(const key of ['standings','fixtures','stats']) {
    const name=`RPCL_${key.toUpperCase()}_WEBHOOK_URL`;
    if(!env[name])throw new Error(`Add the repository secret ${name}.`);
    hooks[key]=webhook(env[name]);
  }
  if(new Set(Object.values(hooks)).size!==3)throw new Error('Use three separate RPCL webhooks, one per channel.');
  let state={};
  try {state=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(e) {if(e.code!=='ENOENT')throw new Error('rpcl-state.json cannot be read. Restore its saved contents before running again.');}
  save(file,state);
  let failures=0;
  for(const [key,format] of [['standings',standingsPayload],['fixtures',fixturesPayload],['stats',rpclStatsPayload]]) {
    try {
      const payload=format(await sources[key](),RPCL);
      const last=payload.embeds.at(-1);
      last.footer.text=last.footer.text.replace(/Checked every 15 minutes|Checks every 15 minutes/g,'Scheduled checks ~15 minutes; delays possible');
      await send(hooks[key],payload,state[key],entry=>{
        state[key]={messageId:entry.messageId,webhookHash:entry.webhookHash};save(file,state);
      });
      log(`RPCL ${key}: Discord message updated.`);
    } catch(e) {failures++;log(`RPCL ${key}: ${e.message}`);}
  }
  return failures;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  runRPCL().then(n=>{process.exitCode=n?1:0;}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
