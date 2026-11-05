import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
const wx = require('../course-weather.js');
const course = { day:'day4', date:'2026-11-09', lat:33.513042, lon:130.541229, start:10, end:16 };
const now = Date.parse('2026-11-05T06:00:00Z');
function fixture() {
  return {latitude:33.5, longitude:130.5625, timezone:'Asia/Tokyo', utc_offset_seconds:32400,
    hourly_units:{temperature_2m:'°C', precipitation_probability:'%', wind_speed_10m:'m/s'},
    hourly:{ time:['2026-11-08T12:00','2026-11-09T03:00',...Array.from({length:7},(_,i)=>`2026-11-09T${i+10}:00`),'2026-11-09T20:00'],
    temperature_2m:[30,4,12,13,14,15,16,17,18,7], precipitation_probability:[100,99,0,10,20,30,40,50,60,90],wind_speed_10m:[20,20,1,2,3,4,5,6,7,20]}};
}
function storage() {const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),values};}
const success=async()=>({ok:true,json:async()=>fixture()});
const failure=async()=>{throw new Error('offline')};
test('play window excludes other dates, overnight lows and evening rain',()=>{
 const hours=wx.selectHours(fixture(),course);
 assert.equal(hours.length,7);assert.equal(hours[0].time,'10:00');assert.equal(hours[6].time,'16:00');
 assert.deepEqual(wx.summarize(hours),{temperature:[12,18],rain:60,wind:[1,7],partial:false});
});
test('missing or invalid values do not become zero or a complete maximum',()=>{
 const payload=fixture();payload.hourly.temperature_2m[2]=null;payload.hourly.precipitation_probability[4]=150;payload.hourly.wind_speed_10m[3]='';
 const hours=wx.selectHours(payload,course);
 assert.equal(hours[0].temperature,null);assert.equal(hours[2].rain,null);assert.equal(hours[1].wind,null);
 assert.deepEqual(wx.summarize(hours),{temperature:null,rain:null,wind:null,partial:true});
 const missing=fixture();missing.hourly.time[4]='2026-11-08T12:00';
 assert.equal(wx.selectHours(missing,course)[2].temperature,null);
});
test('zero rain and calm wind remain valid; empty payload has no usable summary',()=>{
 const data=fixture();data.hourly.precipitation_probability.fill(0);data.hourly.wind_speed_10m.fill(0);
 assert.equal(wx.summarize(wx.selectHours(data,course)).rain,0);
 assert.deepEqual(wx.summarize(wx.selectHours(data,course)).wind,[0,0]);
 assert.equal(wx.summarize(wx.selectHours({},course)),null);
});
test('requests use the course coordinate, exact trip day, Japanese time and m/s',()=>{
 const u=new URL(wx.requestUrl(course));
 assert.equal(u.searchParams.get('latitude'),'33.513042');assert.equal(u.searchParams.get('longitude'),'130.541229');
 assert.equal(u.searchParams.get('start_date'),'2026-11-09');assert.equal(u.searchParams.get('end_date'),'2026-11-09');
 assert.equal(u.searchParams.get('timezone'),'Asia/Tokyo');assert.equal(u.searchParams.get('wind_speed_unit'),'ms');
 assert.equal(u.searchParams.get('hourly'),'temperature_2m,precipitation_probability,wind_speed_10m');
});
test('fresh results survive a later network failure as explicitly cached data',async()=>{
 const local=storage();let requested='';
 const fresh=await wx.loadForecast(course,{fetch:async u=>{requested=u;return success()},storage:local,now});
 assert.equal(new URL(requested).searchParams.get('latitude'),'33.513042');assert.equal(fresh.state,'fresh');assert.equal(fresh.updatedAt,now);
 const fallback=await wx.loadForecast(course,{fetch:failure,storage:local,now:now+3600000});
 assert.equal(fallback.state,'cached');assert.equal(fallback.updatedAt,now);assert.equal(fallback.summary.rain,60);
});
test('expired, future, malformed or wrong-course cache cannot masquerade as a forecast',async()=>{
 for (const change of [r=>({...r,updatedAt:now-86400001}),r=>({...r,updatedAt:now+60000}),r=>({...r,course:{...r.course,date:'2026-11-10'}}),r=>({...r,payload:{}})]) {
  const local=storage();await wx.loadForecast(course,{fetch:success,storage:local,now});
  const [key,value]=[...local.values][0];local.setItem(key,JSON.stringify(change(JSON.parse(value))));
  assert.equal((await wx.loadForecast(course,{fetch:failure,storage:local,now})).state,'unavailable');
 }
 const local=storage();await wx.loadForecast(course,{fetch:success,storage:local,now});
 local.setItem([...local.values.keys()][0],'{broken');
 assert.equal((await wx.loadForecast(course,{fetch:failure,storage:local,now})).state,'unavailable');
});
test('unusable or mislocated server responses preserve valid cached forecasts',async()=>{
 for(const mutate of [()=>({}),d=>({...d,latitude:35.7,longitude:139.7}),d=>({...d,timezone:'UTC',utc_offset_seconds:0}),d=>({...d,hourly_units:{...d.hourly_units,wind_speed_10m:'km/h'}})]){
  const local=storage();await wx.loadForecast(course,{fetch:success,storage:local,now});
  const before=[...local.values.values()][0];
  const result=await wx.loadForecast(course,{fetch:async()=>({ok:true,json:async()=>mutate(fixture())}),storage:local,now:now+1000});
  assert.equal(result.state,'cached');assert.equal([...local.values.values()][0],before);
 }
});
test('blocked storage does not prevent fresh data and requests time out',async()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
 assert.equal((await wx.loadForecast(course,{fetch:success,storage:blocked,now})).state,'fresh');
 const result=await wx.loadForecast(course,{fetch:()=>new Promise(()=>{}),storage:blocked,now,timeoutMs:10});
 assert.equal(result.state,'unavailable');
});
