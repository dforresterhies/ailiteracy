/**
 * Built-in workshop AI.
 * Store OPENAI_API_KEY in Apps Script Project Settings -> Script Properties.
 * Optional: set OPENAI_MODEL. Defaults to gpt-5-mini.
 * The API key is used only on the Apps Script server and is never returned to browsers.
 */

const AI_USAGE_HEADERS = ['timestamp','session','pid','mode','model'];
const AI_MAX_CALLS_PER_PARTICIPANT = 4;

function aiUsageSheet_() {
  return sheet_('AIUsage', AI_USAGE_HEADERS);
}

function generateWorkshopAI(code, pid, mode, inputText) {
  code = requireSessionCode_(code);
  pid = validatePid_(pid);
  const session = requireSession_(code);
  if (session.phase !== 'submit') throw new Error('Workshop AI is only available during the creation phase.');

  mode = String(mode || '');
  if (!['straight','improve'].includes(mode)) throw new Error('Invalid AI action.');

  const key = String(P.getProperty('OPENAI_API_KEY') || '').trim();
  if (!key) throw new Error('Workshop AI is not configured yet. Ask the facilitator to add the API key.');

  const model = String(P.getProperty('OPENAI_MODEL') || 'gpt-5-mini').trim();
  const used = countAiUsage_(code, pid);
  if (used >= AI_MAX_CALLS_PER_PARTICIPANT) throw new Error('You have used the workshop AI limit for this activity.');

  let instruction;
  if (mode === 'straight') {
    instruction = [
      'Answer the workshop prompt directly.',
      'Return only the answer, with no preface or commentary about being an AI.',
      'Use natural prose and aim for roughly 100 to 180 words unless the prompt clearly calls for something shorter.',
      '',
      'WORKSHOP PROMPT:',
      session.prompt
    ].join('\n');
  } else {
    const original = validateResponse_(inputText, 'A');
    instruction = [
      'Improve the writing below while preserving its meaning and point of view.',
      'Make it clearer, more polished, and more readable without adding invented personal facts.',
      'Return only the revised version, with no preface or explanation.',
      '',
      'WORKSHOP PROMPT:',
      session.prompt,
      '',
      'PARTICIPANT ORIGINAL:',
      original
    ].join('\n');
  }

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    payload: JSON.stringify({
      model: model,
      input: instruction,
      max_output_tokens: 500
    }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  let data = {};
  try { data = JSON.parse(response.getContentText() || '{}'); } catch (e) {}
  if (status < 200 || status >= 300) {
    throw new Error('Workshop AI could not generate a response right now (API status ' + status + ').');
  }

  const text = extractOpenAIText_(data).trim();
  if (!text) throw new Error('Workshop AI returned an empty response. Try again.');
  if (text.length > MAX_TEXT) throw new Error('Workshop AI returned too much text. Try again.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    aiUsageSheet_().appendRow([new Date(), code, pid, mode, model]);
  } finally {
    lock.releaseLock();
  }

  return { ok: true, text: text, remaining: Math.max(0, AI_MAX_CALLS_PER_PARTICIPANT - used - 1) };
}

function countAiUsage_(code, pid) {
  const sh = aiUsageSheet_();
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const rows = sh.getRange(2, 1, last - 1, AI_USAGE_HEADERS.length).getValues();
  let count = 0;
  rows.forEach(r => {
    if (String(r[1]) === code && String(r[2]) === pid) count++;
  });
  return count;
}

function extractOpenAIText_(data) {
  if (data && typeof data.output_text === 'string') return data.output_text;
  const parts = [];
  const output = data && Array.isArray(data.output) ? data.output : [];
  output.forEach(item => {
    const content = item && Array.isArray(item.content) ? item.content : [];
    content.forEach(part => {
      if (part && typeof part.text === 'string') parts.push(part.text);
    });
  });
  return parts.join('\n');
}
