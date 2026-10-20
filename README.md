# Greedy XI: free Discord standings and stats

This version runs on GitHub's cloud. Your laptop can be off. No local installation, Terminal commands, paid hosting, or full Discord bot account is needed.

It updates the same messages in **#league-table** and **#stats**, scheduled about every 15 minutes. The table and stats remain visible in Discord at all times between updates. It uses Discord webhooks: Discord displays the name and avatar you choose for them, much like a bot's posts.

## Cost and limits

Use a **public GitHub repository** and the supplied workflow's **ubuntu-latest** standard runner. Standard GitHub-hosted Actions runs in public repositories are currently free. No paid hosting plan is required. The code and message IDs will be public, while the two webhook URLs must go in private repository Secrets. Do not upload them as files.

This is scheduled refreshing, not a real-time feed. GitHub can delay or drop scheduled runs. In public repositories, GitHub automatically disables scheduled workflows after 60 days without repository activity. Check GitHub's notifications; if it pauses, open Actions, select the workflow, and click Enable workflow. The existing Discord display remains visible with its last successful check time.

Official sources: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [scheduled workflow limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Step 1: Create the Discord channels and delivery addresses

If you already have these, reuse them.

1. Open your Discord server. Click **+** beside a channel category.
2. Choose **Text**, name it **league-table**, and create it.
3. Repeat to create **stats**.
4. Click your server name → **Server Settings → Integrations → Webhooks**.
5. Create a webhook named **Greedy XI Table**, choose **#league-table**, and save.
6. Create a second webhook named **Greedy XI Stats**, choose **#stats**, and save.

You can give both webhooks your team logo. Each has a **Copy Webhook URL** button; you'll use those addresses in step 3. You need permission to manage webhooks, or your server owner can create them for you.

[Discord's webhook instructions](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks).

## Step 2: Upload the prepared files to GitHub

1. Double-click **Greedy-XI-Discord-Free.zip** to extract it.
2. Sign in or create a free account at [github.com](https://github.com).
3. Click **+ → New repository**. Name it **greedy-xi-discord**.
4. Choose **Public**. Select **Add a README file**, then **Create repository**.
5. Choose **Add file → Upload files**.
6. From inside the extracted folder, drag these four files into the upload area:
   - **updater.mjs**
   - **cloud.mjs**
   - **cloud-state.json**
   - **README.md**
7. Click **Commit changes**, then confirm if prompted.

These files must appear directly on the repository's main page, not inside an extra folder. None contains a webhook URL. Do not upload config.json or state.json from any previous version.

## Step 3: Save your two webhook URLs privately

In your new GitHub repository:

1. Click **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. In **Name**, paste exactly: **STANDINGS_WEBHOOK_URL**.
4. Return to Discord, copy the webhook URL for **Greedy XI Table**, and paste it into GitHub's **Secret** box. Click **Add secret**.
5. Create another repository secret named exactly **STATS_WEBHOOK_URL**.
6. Copy the webhook URL for **Greedy XI Stats** into its Secret box and save.

Use **Secrets**, not Variables. Do not paste these addresses into code, comments, this chat, or public messages. Anyone with a webhook URL can post through it.

## Step 4: Add the automatic schedule

1. Open the supplied **discord-update.yml** file in a text editor, such as TextEdit, and copy all its contents.
2. On GitHub, return to your repository's **Code** tab.
3. Choose **Add file → Create new file**.
4. In the filename box, type this exact path:

   **.github/workflows/discord-update.yml**

5. Paste the copied contents into the large editor underneath. No changes to the text are needed.
6. Click **Commit changes**, choose to commit directly to the default/main branch, and confirm.

The full filename is essential: GitHub only recognizes the schedule when the file is inside **.github/workflows/**.

## Step 5: Start it and check Discord

1. Open your repository's **Actions** tab. Enable Actions if GitHub asks.
2. Click **Update Greedy XI in Discord** on the left.
3. Click **Run workflow**, keep the default branch selected, and click the green **Run workflow** button.
4. Wait for the run to finish. A green check means both updates and saving their message IDs succeeded.
5. Open **#league-table** and **#stats** in Discord. Pin each message using its message menu if you wish.

That's it. You can close GitHub and turn off your laptop. Later updates are scheduled automatically; you do not have to keep any app open. You can use **Run workflow** whenever you want an extra refresh.

The first successful run saves the message IDs in **cloud-state.json** in your repository. Later runs use those IDs to edit the same posts. That file contains no webhook URLs. Keep it in place and don't overwrite it with the empty starter file. If a message is deleted, the updater recreates it on the next successful run.

## What the team sees

- **League table:** all 20 teams in MLPC Gold Season 4, in the website's ranking order, including adjusted points and Greedy XI's position. Wide table panels may need horizontal scrolling on phones.
- **Stats:** Greedy XI's current-era view, matching Stats → Era in your screenshots. It includes the summary, scorers, assisters, contributions, saves, possession won, tackles, interceptions, clean sheets, and key passes. Up to five players per category are shown. These are across competitions, as on that website view.
- **Timestamp:** the last successful check. Numbers change only after Virtualeagues changes. If a fetch fails, the previous display stays visible.

## If a run has a red X

Click the failed run in **Actions**, then click the **update** job and expand the failed step.

- **Add both repository secrets:** add the two secrets from step 3, spelled exactly, then choose **Re-run all jobs**.
- **HTTP 403/404 in the refresh step:** confirm that both Discord webhooks still exist and point to the correct channels. Replace their GitHub secret values if needed.
- **Permission denied / 403 during Remember Discord message IDs:** open **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions**, and save. Remove any repository rule preventing the workflow from saving cloud-state.json, or use a new personal repository with no such rule. Check cloud-state.json before rerunning: if IDs were not saved, the rerun may create duplicate messages. Keep the successful pair and delete any extra posts manually.
- **No scheduled runs:** make sure the workflow is on the default branch and Actions is enabled. GitHub can delay scheduled runs. If disabled for inactivity, select the workflow and click **Enable workflow**.
- **Network or format error:** the website may be temporarily unavailable or may have changed its data format. The next scheduled run tries again. Persistent format changes require an updater change.

To stop updates: **Actions → Update Greedy XI in Discord → ⋯ → Disable workflow**. Messages stay visible.

Stop any older laptop or paid-hosting copy before using this version, so only one updater controls these channels. No cloud account has been connected and nothing has been posted to your Discord merely by creating this package.
