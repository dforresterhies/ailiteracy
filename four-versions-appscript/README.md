# Four Versions — Apps Script workshop activity

A facilitator-led AI literacy activity for a room of participants. Participants open one public link, create four versions of the same response, classify anonymous responses, and then see the room reveal.

## Architecture

Google Apps Script is the runtime; GitHub is source control. The Apps Script project contains `Code.gs`, `AI.gs`, `Index.html`, and `appsscript.json`, and it creates/uses a Google Sheet for workshop data.

Participants do **not** need a Google account or an individual ChatGPT/Claude/Gemini account. The app can call the OpenAI API from the Apps Script server using a facilitator-owned API key stored in Script Properties.

## Improvements over the prototype

- Each workshop has its own session code and retained data.
- Facilitators set the session title and prompt from the dashboard.
- Participant voting responses never include the hidden response type or owner.
- Facilitator actions require a short-lived server-side token after passphrase authentication.
- The server enforces submission/voting phases and validates votes.
- Built-in workshop AI creates Version B and improves Version A for Version D, so participants do not need separate AI accounts.
- AI usage is limited per participant/session to reduce accidental API-key abuse.
- Responses are length-limited and spreadsheet-formula-like text is escaped before storage.
- Reset affects only the active session.
- The reveal includes debrief prompts for discussion.

## Install in Google Apps Script

1. Go to `script.google.com` and create a new project named **Four Versions**.
2. Replace the default `Code.gs` with `Code.gs` from this folder.
3. Add another script file named `AI` and paste in `AI.gs`.
4. Add an HTML file named exactly `Index` and paste in `Index.html`.
5. In Project Settings, show the `appsscript.json` manifest and replace it with this folder's manifest.
6. Save.
7. Select the `setup` function and click **Run** once. Approve the requested permissions.
8. Check the execution log. `setup()` logs the data spreadsheet URL and generates a facilitator passphrase if `FAC_CODE` is not already set.

## Configure the built-in workshop AI

In **Project Settings → Script Properties**, add:

- `OPENAI_API_KEY` = your OpenAI API key
- optional `OPENAI_MODEL` = model name; if omitted, the app uses `gpt-5-mini`
- optional `FAC_CODE` = your chosen facilitator passphrase; if omitted, `setup()` creates one

The OpenAI API key stays on the Apps Script server. It is never included in the participant HTML or returned to participant browsers.

The current build allows up to four successful workshop-AI calls per participant/session. The normal activity uses two: one for Version B and one for Version D.

## Participant creation flow

- **A · All me:** participant writes the answer.
- **B · Straight AI:** participant clicks **Generate with workshop AI**. No external AI login is needed.
- **C · AI, then me:** the app copies Version B into Version C and the participant edits it to sound like themselves.
- **D · Me, then AI:** participant clicks **Improve my original with workshop AI**, which sends Version A to the server and returns a revised version.

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

Text sent through the built-in workshop AI is sent from Apps Script to the configured OpenAI API project. Use an API project and data controls appropriate for your organization and workshop audience.

## Test before the workshop

Test the final `/exec` link in an incognito/private browser where you are not signed into Google, on the venue Wi-Fi, and on a phone. Complete a full A → B AI generation → C edit → D AI improvement → submit → vote → reveal cycle, then create a fresh workshop session for the live event.
