import {request,validatePayload} from './updater.mjs';

const zone='America/New_York';
const text=x=>String(x??'').replace(/[`<>@\\\r\n]/g,'').replace(/([*_~|])/g,'\\$1');
function badge(value) {
  try { const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password?u.href:null; }
  catch { return null; }
}
// Mirror Virtualeagues' getScheduledDatetime: matchTime is Eastern time,
// and older records may store either a date-only UTC value or an actual instant.
function easternDate(d) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(p=>[p.type,p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function easternInstant(date,time) {
  const [y,m,d]=date.split('-').map(Number), [h,min]=time.split(':').map(Number);
  const target=Date.UTC(y,m-1,d,h,min);
  const guess=new Date(target+5*3600000);
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(guess).map(p=>[p.type,p.value]));
  return new Date(guess.getTime()+target-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute));
}
export function kickoff(match) {
  if(!match.matchDate)return null;
  const original=new Date(match.matchDate);
  if(!Number.isFinite(original.getTime()))throw new Error('Fixture date format changed; keeping the previous games display.');
  if(!match.matchTime)return original;
  const time=String(match.matchTime).trim();
  if(!/^\d{1,2}:\d{2}$/.test(time) || +time.split(':')[0]>23 || +time.split(':')[1]>59)throw new Error('Fixture time format changed; keeping the previous games display.');
  const a=easternInstant(easternDate(original),time);
  const b=easternInstant(original.toISOString().slice(0,10),time);
  return Math.abs(a-original)<=Math.abs(b-original)?a:b;
}
export function nextFixtures(team,now=new Date()) {
  if(!team?.id || !Array.isArray(team.teamSeasons))throw new Error('Team schedule format changed; keeping the previous games display.');
  const found=new Map();
  for(const season of team.teamSeasons) {
    const competition=season.cupSeason ?? season.divisionSeason;
    if(['COMPLETED','CANCELLED'].includes(competition?.status))continue;
    const league=season.divisionSeason?.division?.league;
    const cup=season.cupSeason?.cupCompetition;
    const name=league?`${league.shortName || league.name} ${season.divisionSeason.division.name} — Season ${season.divisionSeason.seasonNumber}`:cup?`${cup.shortName || cup.name} — Season ${season.cupSeason.seasonNumber}`:'Competition TBC';
    for(const [key,venue,opponentKey] of [['homeMatches','Home','awayTeamSeason'],['awayMatches','Away','homeTeamSeason']]) {
      if(!Array.isArray(season[key]))throw new Error('Team fixtures missing; keeping the previous games display.');
      for(const m of season[key]) {
        if(['CANCELLED','COMPLETED','FORFEIT','LIVE','IN_PROGRESS'].includes(m.status) || m.homeScore!=null || m.awayScore!=null || m.statsSubmitted===true)continue;
        const date=kickoff(m);
        if(date && date<=now)continue;
        if(!m.id)throw new Error('Fixture identifier missing.');
        found.set(m.id,{id:m.id,opponent:m[opponentKey]?.team?.name || 'Opponent TBC',teamBadge:badge(team.logoUrl),opponentBadge:badge(m[opponentKey]?.team?.logoUrl),venue,competition:name,date:date?.toISOString()??null,postponed:m.status==='POSTPONED'});
      }
    }
  }
  return [...found.values()].sort((a,b)=>(a.date?Date.parse(a.date):Infinity)-(b.date?Date.parse(b.date):Infinity)||a.id.localeCompare(b.id)).slice(0,2);
}
export async function fetchFixtures(c,get=endpoint=>request('https://www.virtualeagues.com'+endpoint),now=new Date()) {
  const resolved=await get(`/api/teams/resolve?club=${encodeURIComponent(c.teamSlug)}`);
  if(!resolved.id)throw new Error('Team could not be resolved for fixtures.');
  const data=await get(`/api/team?id=${encodeURIComponent(resolved.id)}`);
  if(data.team?.id!==resolved.id)throw new Error('Wrong team returned for fixtures.');
  return nextFixtures(data.team,now);
}
export function fixturesPayload(matches,c,stamp=new Date().toISOString()) {
  const embeds=matches.slice(0,2).map((m,i)=>{
    const unix=m.date?Math.floor(Date.parse(m.date)/1000):null;
    const when=unix?`<t:${unix}:D>\n<t:${unix}:t> · <t:${unix}:R>`:'Date and time TBC';
    const ownBadge=badge(m.teamBadge),opponentBadge=badge(m.opponentBadge);
    return {
      author:{name:`${c.teamName} · ${i===0?'NEXT MATCH':'UP NEXT'}`.slice(0,256),...(ownBadge?{icon_url:ownBadge}:{})},
      title:`vs ${text(m.opponent)}`.slice(0,256),
      description:text(m.competition).slice(0,200)+(m.postponed?'\n⚠️ Postponed':''),
      color:m.venue==='Home'?0x00c997:0xed0960,
      fields:[{name:'📅 Kickoff',value:when,inline:true},{name:m.venue==='Home'?'🏠 Home':'✈️ Away',value:text(c.teamName).slice(0,200),inline:true}],
      ...(opponentBadge?{thumbnail:{url:opponentBadge}}:{})
    };
  });
  if(!embeds.length)embeds.push({title:`${c.teamName} — Next games`,description:'No upcoming fixtures currently listed.',color:0xed0960});
  embeds.at(-1).footer={text:`Virtualeagues • Checks every ${c.intervalMinutes} minutes • Last successful check`};
  embeds.at(-1).timestamp=stamp;
  return validatePayload({embeds,allowed_mentions:{parse:[]}});
}
