import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULTS, webhook, save, fetchLeague, fetchStats, standingsPayload, statsPayload, publish} from './updater.mjs';

// Each GitHub run updates both messages once and exits. Only non-secret message
// IDs and webhook hashes are committed. URLs come exclusively from Actions secrets.
export async function runCloud({env=process.env, file=fileURLToPath(new URL('./cloud-state.json',import.meta.url)), getLeague=fetchLeague, getStats=fetchStats, send=publish, log=console.log}={}) {
  const c={...DEFAULTS, intervalMinutes:15};
  if(!env.STANDINGS_WEBHOOK_URL || !env.STATS_WEBHOOK_URL) throw new Error('Add both repository secrets: STANDINGS_WEBHOOK_URL and STATS_WEBHOOK_URL.');
  c.standingsWebhook=webhook(env.STANDINGS_WEBHOOK_URL);
  c.statsWebhook=webhook(env.STATS_WEBHOOK_URL);
  if(c.standingsWebhook===c.statsWebhook) throw new Error('Use a separate webhook for each channel.');
  // Fail closed on damaged/missing state rather than silently creating duplicates.
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  let failures=0;
  for(const [key,get,format] of [['standings',getLeague,standingsPayload],['stats',getStats,statsPayload]]) {
    try {
      const payload=format(await get(c),c);
      const last=payload.embeds.at(-1);
      last.footer.text=last.footer.text.replace(/Checked every 15 minutes|Checks every 15 minutes/g,'Scheduled checks ~15 minutes; delays possible');
      await send(c[key+'Webhook'],payload,state[key],entry=>{
        // Do not commit timestamps or webhook URLs to the public repository.
        state[key]={messageId:entry.messageId,webhookHash:entry.webhookHash};
        save(file,state);
      });
      log(`${key}: Discord message updated.`);
    } catch(e) { failures++;log(`${key}: ${e.message}`); }
  }
  return failures;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  runCloud().then(n=>{process.exitCode=n?1:0;}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
