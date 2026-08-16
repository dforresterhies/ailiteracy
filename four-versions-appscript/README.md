# Four Versions — Apps Script workshop activity

A facilitator-led AI literacy activity for a room of participants. Participants open one public link, create four versions of the same response, classify anonymous responses, and then see the room reveal.

## Architecture

Google Apps Script is the runtime; GitHub is source control. The Apps Script project contains `Code.gs`, `Index.html`, and `appsscript.json`, and it creates/uses a Google Sheet for workshop data.

Participants do not need a Google account to use the activity link. For the AI steps, participants use any AI platform they already have access to, such as a school-provided tool or an existing ChatGPT, Claude, Gemini, Copilot, or other account. The activity itself does not call an AI API and does not require an OpenAI API key.

## Improvements over the prototype

- Each workshop has its own session code and retained data.
- Facilitators set the session title and prompt from the dashboard.
- Participant voting responses never include the hidden response type or owner.
- Facilitator actions require a short-lived server-side token after passphrase authentication.
- The server enforces submission/voting phases and validates votes.
- Version B includes a one-click copy button for the exact workshop prompt.
- Version D includes a one-click copy button for an improvement prompt containing the participant's Version A.
- Responses are length-limited and spreadsheet-formula-like text is escaped before storage.
- Reset affects only the active session.
- The reveal includes debrief prompts for discussion.

## Install in Google Apps Script

1. Go to `script.google.com` and create a new project named **Four Versions**.
2. Replace the default `Code.gs` with `Code.gs` from this folder.
3. Add an HTML file named exactly `Index` and paste in `Index.html`.
4. In Project Settings, show the `appsscript.json` manifest and replace it with this folder's manifest.
5. Save.
6. Optional: in Project Settings → Script Properties, add `FAC_CODE` with your chosen facilitator passphrase. If you omit it, `setup()` generates one.
7. Select the `setup` function and click **Run** once. Approve the requested permissions.
8. Check the execution log. `setup()` logs the data spreadsheet URL and the generated facilitator passphrase if one was created.

## Participant creation flow

- **A · All me:** participant writes the answer without AI.
- **B · Straight AI:** participant clicks **Copy exact prompt for AI**, opens a new chat in an AI platform they already use, pastes the prompt, then pastes the first AI response back unchanged.
- **C · AI, then me:** the app copies Version B into Version C and the participant edits it until it sounds like them.
- **D · Me, then AI:** participant clicks **Copy Version A + improvement prompt**, opens a new AI chat, pastes it, then pastes the AI revision back unchanged.

Using different AI platforms makes this a less controlled comparison of one specific model, but it supports the workshop goal of examining how confidently people infer authorship from writing style.

## Deploy for participants

1. Choose **Deploy → New deployment → Web app**.
2. Run the web app as the deploying user.
3. Choose the access option that allows anyone, including people who are not signed in.
4. Deploy and use the resulting `/exec` URL for the workshop.

Do not use the `/dev` test URL with participants.

If your Google Workspace administrator disables anonymous/public Apps Script web apps, the anonymous deployment choice will not be available. In that case, the Workspace policy needs to allow it or the app must be deployed from an account that permits public web apps.

## Run the workshop

1. Open the deployed URL and select **Facilitator**.
2. Enter your facilitator passphrase.
3. Create a new session with a title and workshop prompt.
4. Copy the generated participant link and turn it into a QR code for your slide.
5. Watch submission counts live.
6. Click **Close submissions & start voting** when ready.
7. Click **Reveal results** when most people finish voting.

Participant devices poll while waiting, so they should move to the next phase without needing to reload.

## Privacy

The app does not ask for names or email addresses. It creates a random browser participant ID and stores that ID locally so the same device can resume. The Google Sheet stores the random ID to associate a person's submissions/votes and to avoid giving them their own response to rate.

When participants use an external AI platform for Versions B and D, that platform's own account, privacy, and data-use policies apply.

## Test before the workshop

Test the final `/exec` link in an incognito/private browser where you are not signed into Google, on the venue Wi-Fi, and on a phone. Complete a full A → B copy/paste → C edit → D copy/paste → submit → vote → reveal cycle, then create a fresh workshop session for the live event.
