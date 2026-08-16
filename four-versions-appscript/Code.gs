/**
 * Four Versions — facilitator-led AI literacy activity
 *
 * Runtime: Google Apps Script Web App
 * Participant auth: none (deploy for anonymous access)
 * Facilitator auth: passphrase -> short-lived server token
 */

const P = PropertiesService.getScriptProperties();
const RATE_LIMIT = 8;
const MIN_TEXT = 20;
const MAX_TEXT = 3000;
const FAC_TOKEN_TTL = 21600; // 6 hours
const SESSION_CODE_LENGTH = 5;

const SESSION_HEADERS = ['code','createdAt','title','prompt','phase','poolVersion','archived'];
const SUBMISSION_HEADERS = ['timestamp','session','pid','A','B','C','D'];
const POOL_HEADERS = ['session','id','n','owner','type','text'];
const VOTE_HEADERS = ['timestamp','session','pid','respId','guess'];

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.initialSession = normalizeSessionCode_((e && e.parameter && e.parameter.s) || '');
  return t.evaluate()
    .setTitle('Four Versions')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setup() {
  sessionsSheet_(); submissionsSheet_(); poolSheet_(); votesSheet_();
  let facilitatorCode = P.getProperty('FAC_CODE');
  if (!facilitatorCode) {
    facilitatorCode = randomSecret_(12);
    P.setProperty('FAC_CODE', facilitatorCode);
  }
  const out = { ok:true, spreadsheetUrl:ss_().getUrl(), facilitatorCode:facilitatorCode,
    note:'Store the facilitator code somewhere safe. You can replace FAC_CODE in Script Properties.' };
  Logger.log(JSON.stringify(out));
  return out;
}

function ss_() {
  let id = P.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (err) {} }
  const ss = SpreadsheetApp.create('Four Versions — Workshop Data');
  P.setProperty('SHEET_ID', ss.getId());
  return ss;
}
function sheet_(name, headers) {
  const ss = ss_(); let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1);
    sh.getRange(1,1,1,headers.length).setFontWeight('bold');
  }
  return sh;
}
function sessionsSheet_(){return sheet_('Sessions',SESSION_HEADERS);}
function submissionsSheet_(){return sheet_('Submissions',SUBMISSION_HEADERS);}
function poolSheet_(){return sheet_('Pool',POOL_HEADERS);}
function votesSheet_(){return sheet_('Votes',VOTE_HEADERS);}

function getSession(code) {
  const s=getSessionInternal_(code);
  if(!s||s.archived) return {ok:false,message:'Session not found.'};
  return publicSession_(s);
}

function submitAll(code,pid,texts) {
  code=requireSessionCode_(code); pid=validatePid_(pid); const session=requireSession_(code);
  if(session.phase!=='submit') throw new Error('Submissions are closed for this session.');
  const clean={}; ['A','B','C','D'].forEach(k=>clean[k]=validateResponse_(texts&&texts[k],k));
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh=submissionsSheet_(), last=sh.getLastRow();
    const row=[new Date(),code,pid,safeCell_(clean.A),safeCell_(clean.B),safeCell_(clean.C),safeCell_(clean.D)];
    if(last>1){
      const vals=sh.getRange(2,2,last-1,2).getValues();
      for(let i=0;i<vals.length;i++){
        if(String(vals[i][0])===code&&String(vals[i][1])===pid){
          sh.getRange(i+2,1,1,row.length).setValues([row]);
          return {ok:true,updated:true,submissionCount:countSubmissions_(code)};
        }
      }
    }
    sh.appendRow(row); return {ok:true,updated:false,submissionCount:countSubmissions_(code)};
  } finally { lock.releaseLock(); }
}

function getVoteQueue(code,pid) {
  code=requireSessionCode_(code); pid=validatePid_(pid); const session=requireSession_(code);
  if(session.phase!=='vote') return [];
  return buildVoteQueue_(code,pid).map(p=>({id:p.id,n:p.n,text:p.text}));
}

function submitVotes(code,pid,votes) {
  code=requireSessionCode_(code); pid=validatePid_(pid); const session=requireSession_(code);
  if(session.phase!=='vote') throw new Error('Voting is not open.');
  const queue=buildVoteQueue_(code,pid), allowed={}; queue.forEach(item=>allowed[item.id]=true);
  const incoming=votes&&typeof votes==='object'?votes:{}, ids=Object.keys(incoming);
  if(ids.length!==queue.length) throw new Error('Please rate every assigned response before submitting.');
  const rows=[];
  ids.forEach(rid=>{
    if(!allowed[rid]) throw new Error('Invalid response in vote submission.');
    const guess=String(incoming[rid]||'');
    if(!['human','ai','both'].includes(guess)) throw new Error('Invalid vote choice.');
    rows.push([new Date(),code,pid,rid,guess]);
  });
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    deleteRowsMatching_(votesSheet_(),row=>String(row[1])===code&&String(row[2])===pid);
    if(rows.length){ const sh=votesSheet_(); sh.getRange(sh.getLastRow()+1,1,rows.length,VOTE_HEADERS.length).setValues(rows); }
    return {ok:true,count:rows.length};
  } finally { lock.releaseLock(); }
}

function getResults(code){
  code=requireSessionCode_(code); const session=requireSession_(code);
  if(session.phase!=='reveal') throw new Error('Results have not been revealed yet.');
  return getResultsInternal_(code);
}

function facilitatorLogin(passphrase) {
  const want=P.getProperty('FAC_CODE');
  if(!want) throw new Error('Facilitator passphrase is not configured. Run setup() first.');
  const got=String(passphrase||'').trim();
  if(!constantTimeEquals_(got,want)) return {ok:false,message:'Passphrase not recognized.'};
  const token=Utilities.getUuid()+Utilities.getUuid();
  CacheService.getScriptCache().put('fac:'+tokenHash_(token),'1',FAC_TOKEN_TTL);
  return {ok:true,token:token,sessions:listSessionsInternal_(12)};
}
function facilitatorListSessions(token){requireFacilitator_(token);return listSessionsInternal_(20);}
function facilitatorCreateSession(token,title,prompt){
  requireFacilitator_(token); title=cleanShort_(title,120)||'Four Versions'; prompt=cleanShort_(prompt,2000);
  if(!prompt) throw new Error('Add a workshop prompt before creating the session.');
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try {
    let code; for(let i=0;i<30;i++){code=randomSessionCode_();if(!getSessionInternal_(code))break;}
    if(!code||getSessionInternal_(code)) throw new Error('Could not create a unique session code. Try again.');
    const now=new Date();
    sessionsSheet_().appendRow([code,now,safeCell_(title),safeCell_(prompt),'submit',String(Date.now()),false]);
    return {ok:true,session:publicSession_(requireSession_(code)),participantUrl:participantUrl_(code)};
  } finally { lock.releaseLock(); }
}
function facilitatorDashboard(token,code){
  requireFacilitator_(token); code=requireSessionCode_(code); const s=requireSession_(code);
  return {ok:true,session:publicSession_(s),participantUrl:participantUrl_(code),submissionCount:countSubmissions_(code),
    voterCount:countVoters_(code),poolCount:getPoolInternal_(code).length,sheetUrl:ss_().getUrl()};
}
function facilitatorCloseSubmissions(token,code){
  requireFacilitator_(token); code=requireSessionCode_(code);
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const session=requireSession_(code); if(session.phase!=='submit') throw new Error('This session is no longer accepting submissions.');
    const rows=submissionRows_(code); if(!rows.length) return {ok:false,message:'No submissions yet.'};
    const order=['A','B','C','D'], counts={A:0,B:0,C:0,D:0}, picked=[];
    shuffle_(rows).forEach(r=>{
      const pid=String(r[2]);
      const texts={A:restoreCell_(r[3]),B:restoreCell_(r[4]),C:restoreCell_(r[5]),D:restoreCell_(r[6])};
      const avail=order.filter(k=>String(texts[k]||'').trim().length>=MIN_TEXT); if(!avail.length)return;
      avail.sort((x,y)=>counts[x]-counts[y]); const low=counts[avail[0]], tied=avail.filter(k=>counts[k]===low);
      const type=tied[Math.floor(Math.random()*tied.length)]; counts[type]++; picked.push({owner:pid,type:type,text:String(texts[type]).trim()});
    });
    if(picked.length<2) return {ok:false,message:'At least two complete submissions are needed for voting.'};
    deleteRowsMatching_(poolSheet_(),row=>String(row[0])===code);
    deleteRowsMatching_(votesSheet_(),row=>String(row[1])===code);
    const poolRows=shuffle_(picked).map((x,i)=>[code,code+'-r'+(i+1),i+1,x.owner,x.type,safeCell_(x.text)]);
    const ps=poolSheet_(); ps.getRange(ps.getLastRow()+1,1,poolRows.length,POOL_HEADERS.length).setValues(poolRows);
    updateSession_(code,{phase:'vote',poolVersion:String(Date.now())});
    return {ok:true,count:poolRows.length,mix:counts};
  } finally { lock.releaseLock(); }
}
function facilitatorReveal(token,code){
  requireFacilitator_(token); code=requireSessionCode_(code); const s=requireSession_(code);
  if(s.phase!=='vote'&&s.phase!=='reveal') throw new Error('Voting has not started.');
  updateSession_(code,{phase:'reveal',poolVersion:String(Date.now())}); return getResultsInternal_(code);
}
function facilitatorResetSession(token,code){
  requireFacilitator_(token); code=requireSessionCode_(code);
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try {
    requireSession_(code); deleteRowsMatching_(submissionsSheet_(),row=>String(row[1])===code);
    deleteRowsMatching_(poolSheet_(),row=>String(row[0])===code); deleteRowsMatching_(votesSheet_(),row=>String(row[1])===code);
    updateSession_(code,{phase:'submit',poolVersion:String(Date.now())}); return {ok:true};
  } finally { lock.releaseLock(); }
}
function facilitatorArchiveSession(token,code){requireFacilitator_(token);code=requireSessionCode_(code);requireSession_(code);updateSession_(code,{archived:true,poolVersion:String(Date.now())});return {ok:true};}

function buildVoteQueue_(code,pid){
  const pool=getPoolInternal_(code), n=pool.length, take=Math.min(RATE_LIMIT,Math.max(0,n-1)); if(!take)return [];
  const mine=pool.findIndex(p=>p.owner===pid); if(mine<0)return [];
  const out=[]; for(let k=1;k<=take;k++) out.push(pool[(mine+k)%n]); return out;
}
function getResultsInternal_(code){
  const pool=getPoolInternal_(code), tallies={}; pool.forEach(p=>tallies[p.id]={human:0,ai:0,both:0});
  const byId={}; pool.forEach(p=>byId[p.id]=p); let right=0,total=0; const voters={};
  const sh=votesSheet_(), last=sh.getLastRow();
  if(last>1){
    const rows=sh.getRange(2,1,last-1,VOTE_HEADERS.length).getValues();
    rows.forEach(r=>{
      if(String(r[1])!==code)return; const pid=String(r[2]),rid=String(r[3]),guess=String(r[4]);
      if(!tallies[rid]||!byId[rid]||!['human','ai','both'].includes(guess))return;
      voters[pid]=true; tallies[rid][guess]++; const truth=byId[rid].type==='A'?'human':byId[rid].type==='B'?'ai':'both';
      total++; if(guess===truth)right++;
    });
  }
  return {ok:true,pool:pool.map(p=>({id:p.id,n:p.n,type:p.type,text:p.text})),tallies:tallies,voters:Object.keys(voters).length,right:right,total:total,accuracy:total?Math.round(right/total*100):0};
}

function publicSession_(s){return {ok:true,code:s.code,title:s.title,prompt:s.prompt,phase:s.phase,poolVersion:s.poolVersion,submissionCount:countSubmissions_(s.code)};}
function getSessionInternal_(code){
  code=normalizeSessionCode_(code); if(!code)return null; const sh=sessionsSheet_(),last=sh.getLastRow(); if(last<2)return null;
  const rows=sh.getRange(2,1,last-1,SESSION_HEADERS.length).getValues();
  for(let i=rows.length-1;i>=0;i--) if(String(rows[i][0]).toUpperCase()===code) return sessionFromRow_(rows[i],i+2);
  return null;
}
function sessionFromRow_(r,rowNumber){return {row:rowNumber,code:String(r[0]).toUpperCase(),createdAt:r[1],title:restoreCell_(r[2]),prompt:restoreCell_(r[3]),phase:String(r[4]||'submit'),poolVersion:String(r[5]||'0'),archived:r[6]===true||String(r[6]).toLowerCase()==='true'};}
function requireSession_(code){const s=getSessionInternal_(code);if(!s||s.archived)throw new Error('Session not found.');return s;}
function updateSession_(code,patch){
  const s=requireSession_(code),sh=sessionsSheet_(),row=sh.getRange(s.row,1,1,SESSION_HEADERS.length).getValues()[0];
  if(Object.prototype.hasOwnProperty.call(patch,'title'))row[2]=safeCell_(cleanShort_(patch.title,120));
  if(Object.prototype.hasOwnProperty.call(patch,'prompt'))row[3]=safeCell_(cleanShort_(patch.prompt,2000));
  if(Object.prototype.hasOwnProperty.call(patch,'phase'))row[4]=patch.phase;
  if(Object.prototype.hasOwnProperty.call(patch,'poolVersion'))row[5]=String(patch.poolVersion);
  if(Object.prototype.hasOwnProperty.call(patch,'archived'))row[6]=!!patch.archived;
  sh.getRange(s.row,1,1,SESSION_HEADERS.length).setValues([row]);
}
function listSessionsInternal_(limit){
  const sh=sessionsSheet_(),last=sh.getLastRow();if(last<2)return [];
  return sh.getRange(2,1,last-1,SESSION_HEADERS.length).getValues().map((r,i)=>sessionFromRow_(r,i+2)).filter(s=>!s.archived)
    .sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,limit||20)
    .map(s=>({code:s.code,title:s.title,prompt:s.prompt,phase:s.phase,poolVersion:s.poolVersion}));
}
function participantUrl_(code){const base=ScriptApp.getService().getUrl()||'';return base?base+'?s='+encodeURIComponent(code):'?s='+encodeURIComponent(code);}
function submissionRows_(code){const sh=submissionsSheet_(),last=sh.getLastRow();if(last<2)return [];return sh.getRange(2,1,last-1,SUBMISSION_HEADERS.length).getValues().filter(r=>String(r[1])===code);}
function countSubmissions_(code){return submissionRows_(code).length;}
function countVoters_(code){const sh=votesSheet_(),last=sh.getLastRow();if(last<2)return 0;const rows=sh.getRange(2,1,last-1,VOTE_HEADERS.length).getValues(),seen={};rows.forEach(r=>{if(String(r[1])===code)seen[String(r[2])]=true;});return Object.keys(seen).length;}
function getPoolInternal_(code){const sh=poolSheet_(),last=sh.getLastRow();if(last<2)return [];return sh.getRange(2,1,last-1,POOL_HEADERS.length).getValues().filter(r=>String(r[0])===code).map(r=>({id:String(r[1]),n:Number(r[2]),owner:String(r[3]),type:String(r[4]),text:restoreCell_(r[5])}));}
function deleteRowsMatching_(sh,predicate){const last=sh.getLastRow();if(last<2)return;const width=sh.getLastColumn(),rows=sh.getRange(2,1,last-1,width).getValues();for(let i=rows.length-1;i>=0;i--)if(predicate(rows[i]))sh.deleteRow(i+2);}
function requireFacilitator_(token){token=String(token||'');if(!token)throw new Error('Facilitator session expired. Sign in again.');const key='fac:'+tokenHash_(token),cache=CacheService.getScriptCache();if(cache.get(key)!=='1')throw new Error('Facilitator session expired. Sign in again.');cache.put(key,'1',FAC_TOKEN_TTL);return true;}
function tokenHash_(token){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,token,Utilities.Charset.UTF_8);return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');}
function constantTimeEquals_(a,b){a=String(a||'');b=String(b||'');let diff=a.length^b.length,len=Math.max(a.length,b.length);for(let i=0;i<len;i++)diff|=(a.charCodeAt(i%Math.max(a.length,1))||0)^(b.charCodeAt(i%Math.max(b.length,1))||0);return diff===0;}
function validatePid_(pid){pid=String(pid||'').trim();if(!/^[a-zA-Z0-9_-]{8,80}$/.test(pid))throw new Error('Invalid participant id.');return pid;}
function validateResponse_(value,label){const s=String(value==null?'':value).trim();if(s.length<MIN_TEXT)throw new Error('Version '+label+' needs at least '+MIN_TEXT+' characters.');if(s.length>MAX_TEXT)throw new Error('Version '+label+' is too long. Keep it under '+MAX_TEXT+' characters.');return s;}
function normalizeSessionCode_(code){return String(code||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);}
function requireSessionCode_(code){code=normalizeSessionCode_(code);if(!/^[A-Z2-9]{4,12}$/.test(code))throw new Error('Invalid session code.');return code;}
function cleanShort_(value,max){return String(value==null?'':value).replace(/\u0000/g,'').trim().slice(0,max);}
function safeCell_(value){const s=String(value==null?'':value);return /^[=+\-@]/.test(s)?"'"+s:s;}
function restoreCell_(value){const s=String(value==null?'':value);return s.length>1&&s[0]==="'"&&/^[=+\-@]/.test(s.slice(1))?s.slice(1):s;}
function randomSessionCode_(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='';for(let i=0;i<SESSION_CODE_LENGTH;i++)out+=chars[Math.floor(Math.random()*chars.length)];return out;}
function randomSecret_(n){const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';let out='';for(let i=0;i<n;i++)out+=chars[Math.floor(Math.random()*chars.length)];return out;}
function shuffle_(arr){const x=arr.slice();for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)),t=x[i];x[i]=x[j];x[j]=t;}return x;}
