import assert from 'node:assert/strict';

const cdpPort = process.env.CDP_PORT || '9238';
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:8765';
const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
if (!target) throw new Error('No Chrome page target found');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const waiters = new Map();
const pageErrors = [];

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    pageErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  }
  const listeners = waiters.get(message.method);
  if (listeners?.length) listeners.shift()(message.params);
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function waitFor(method) {
  return new Promise((resolve) => {
    const listeners = waiters.get(method) || [];
    listeners.push(resolve);
    waiters.set(method, listeners);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function navigate(path) {
  const loaded = waitFor('Page.loadEventFired');
  await send('Page.navigate', { url: `${baseUrl}/${path}` });
  await loaded;
  await sleep(250);
}

async function setReducedMotion(reduce) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
}

async function waitForState(dayId, wanted, timeout = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = await evaluate(`document.querySelector('#golf-draw-${dayId}')?.dataset.gdState`);
    if (state === wanted) return;
    await sleep(40);
  }
  throw new Error(`${dayId} draw did not reach ${wanted}`);
}


let failForecast = false;
const courseRequests = [];
socket.addEventListener('message', async event => {
  const message = JSON.parse(event.data);
  if (message.method !== 'Fetch.requestPaused') return;
  const {requestId, request} = message.params;
  const u = new URL(request.url);
  if (!u.searchParams.has('hourly')) { await send('Fetch.continueRequest', {requestId}); return; }
  courseRequests.push(request.url);
  const date = u.searchParams.get('start_date');
  const data = {latitude:Number(u.searchParams.get('latitude')),longitude:Number(u.searchParams.get('longitude')),timezone:'Asia/Tokyo',utc_offset_seconds:32400,
    hourly_units:{temperature_2m:'°C',precipitation_probability:'%',wind_speed_10m:'m/s'},
    hourly:{time:Array.from({length:24},(_,i)=>date+'T'+String(i).padStart(2,'0')+':00'),temperature_2m:Array.from({length:24},(_,i)=>i<10?4:i-10+12),precipitation_probability:Array.from({length:24},(_,i)=>i<10?90:(i-10)*5),wind_speed_10m:Array.from({length:24},(_,i)=>i/10)}};
  await send('Fetch.fulfillRequest',{requestId,responseCode:failForecast?503:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from(JSON.stringify(data)).toString('base64')});
});
async function ready(state) {
  for (let i=0;i<100;i++) {
    if(await evaluate(`document.querySelectorAll('.course-weather[data-weather-state="${state}"]').length===3`)) return;
    await sleep(50);
  }
  throw Error('Forecast panels did not reach '+state);
}
async function resize(width) {
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<1024});
  await sleep(80);
}
await send('Page.enable'); await send('Runtime.enable');
await send('Fetch.enable',{patterns:[{urlPattern:'https://api.open-meteo.com/v1/forecast*'}]});
for (const file of ['fukuoka-golf.html','fukuoka-golf-v2.html','fukuoka-golf-en.html']) {
  for(const width of [375,1280]) {
    await resize(width); await navigate(file+'?p=day4'); await ready('fresh');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.course-weather')].map(e=>[e.id,e.open])`),[['course-weather-day2',false],['course-weather-day4',false],['course-weather-day5',false]],file+' starts collapsed');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('#course-weather-day4 .cw-metric dd b')].map(e=>e.textContent)`),['12–18','30','1–2']);
    assert.equal(await evaluate(`document.querySelector('#course-weather-day4 tbody').rows.length`),7);
    await evaluate(`document.querySelector('#course-weather-day4 > summary').click()`);
    assert.equal(await evaluate(`document.querySelector('#course-weather-day4').open`),true,'summary toggles on every viewport');
    const layout=await evaluate(`(() => {const p=document.querySelector('#course-weather-day4'),box=p.getBoundingClientRect();return {scroll:document.documentElement.scrollWidth,width:innerWidth,panel:p.scrollWidth,client:p.clientWidth,summary:p.querySelector('summary').getBoundingClientRect().height,table:p.querySelector('table').getBoundingClientRect().width,available:p.querySelector('.cw-body').clientWidth};})()`);
    assert.ok(layout.scroll<=layout.width+1, file+' no page overflow');
    assert.ok(layout.panel<=layout.client+1,file+' no panel overflow');
    assert.ok(layout.table<=layout.available,file+' hourly table fits');
    assert.ok(layout.summary>=44,file+' accessible touch target');
    await resize(width===375?1280:375);
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.course-weather')].map(e=>e.open)`),[false,true,false],'resize preserves weather choices');
    await evaluate(`document.querySelector('#course-weather-day4 > summary').click()`);
    assert.equal(await evaluate(`document.querySelector('#course-weather-day4').open`),false,'can close after resize');
  }
  failForecast=true; await navigate(file+'?p=day4'); await ready('cached');
  assert.match(await evaluate(`document.querySelector('#course-weather-day4 .cw-status').textContent`),file.includes('-en')?/previous forecast/:/上次預報/);
  assert.equal(await evaluate(`document.querySelector('#course-weather-day4 .cw-metrics').hidden`),false);
  await evaluate(`Object.keys(localStorage).filter(k=>k.startsWith('fukuoka-course-weather-')).forEach(k=>localStorage.removeItem(k))`);
  await navigate(file+'?p=day4'); await ready('unavailable');
  assert.equal(await evaluate(`document.querySelector('#course-weather-day4 .cw-metrics').hidden`),true,'no invented values when unavailable');
  failForecast=false;
  await evaluate(`document.querySelectorAll('.cw-refresh').forEach(b=>b.click())`); await ready('fresh');
}
// A cached response that expires while the page stays open must disappear.
await evaluate(`Object.keys(localStorage).filter(k=>k.startsWith('fukuoka-course-weather-')).forEach(k=>{const r=JSON.parse(localStorage.getItem(k));r.updatedAt=Date.now()-86400000+2500;localStorage.setItem(k,JSON.stringify(r));})`);
failForecast=true;
await navigate('fukuoka-golf.html?p=day4'); await ready('cached');
await sleep(2700);
assert.equal(await evaluate(`document.querySelector('#course-weather-day4').dataset.weatherState`),'unavailable','expired cached data is removed even without navigation');
assert.ok(courseRequests.some(u=>new URL(u).searchParams.get('latitude')==='33.649745'));
assert.ok(courseRequests.some(u=>new URL(u).searchParams.get('latitude')==='33.513042'));
assert.ok(courseRequests.some(u=>new URL(u).searchParams.get('latitude')==='33.424437'));
assert.deepEqual(pageErrors,[]);
await send('Fetch.disable'); socket.close();
console.log('course weather browser checks passed: bilingual, 375/1280px, toggle/resize, cache, unavailable, retry');
