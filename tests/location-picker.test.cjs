const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {parseHTML} = require('linkedom');
const {init} = require('../location-picker');
const finder = require('../locations-search');
const locations = require('../assets/locations.json');
const points = require('../assets/zip-centroids.json').points;
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(settings = {}) {
  const {document, window} = parseHTML('<html><body><label for="locationId">Location</label><select id="locationId"></select><input id="senderPostal"></body></html>');
  const select=document.getElementById('locationId');
  select.innerHTML='<option value="">Choose</option>'+locations.filter(l=>!l.openingSoon).map(l=>'<option value="'+l.id+'">'+l.city+'</option>').join('');
  Object.defineProperty(select,'value',{value:settings.selected||'',writable:true});
  const storage=new Map(settings.saved ? [['cubicship:shipping-zip',settings.saved]] : []), calls=[];
  let success, failure, geoCalls=0;
  const browser={ Event:window.Event, AbortController, setTimeout,clearTimeout,
    navigator:{geolocation:{getCurrentPosition(ok,fail){geoCalls++;success=ok;failure=fail;}}},
    CubicLocationSearch:{...finder,validPoint:(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    fetch:async(url,options={})=>{calls.push({url,options});if(settings.fetch)return settings.fetch(url,options);if(url.includes('zip-centroids'))return {ok:true,json:async()=>({points})};return {status:401,ok:false};}
  };
  const controller=init(document,browser,locations), el=id=>document.getElementById(id);
  return {document,browser,el,controller,calls,storage,select,get geoCalls(){return geoCalls},success:coords=>success({coords}),fail:error=>failure(error),click:id=>el(id).dispatchEvent(new window.Event('click')),input:value=>{el('nearbyZip').value=value;el('nearbyZip').dispatchEvent(new window.Event('input'));},cards:()=>[...document.querySelectorAll('.nearby-card')].map(el=>el.dataset.locationId)};
}
test('ZIP search suggests eligible nearby counters, retains explicit selection, and fills only an untouched origin ZIP',async()=>{
 const f=fixture({selected:'dearborn'});await tick();assert.equal(f.geoCalls,0);
 f.input('60453');await f.controller.find();assert.equal(f.cards()[0],'oak-lawn');assert.equal(f.select.value,'dearborn');assert.equal(f.el('senderPostal').value,'60453');
 f.el('senderPostal').value='08830';f.el('senderPostal').dispatchEvent(new f.browser.Event('input'));
 f.input('48126');await f.controller.find();assert.equal(f.el('senderPostal').value,'08830');assert.equal(f.cards()[0],'dearborn');
 assert.ok(!f.cards().includes('cleveland'));assert.ok(!f.cards().includes('freeport'));
});
test('location permission is click-only; denial and late callbacks preserve manual choice',async()=>{
 const f=fixture();await tick();assert.equal(f.geoCalls,0);f.click('nearbyGeo');assert.equal(f.geoCalls,1);f.fail({code:1});assert.match(f.el('nearbyStatus').textContent,/not allowed/);
 f.click('nearbyGeo');f.input('60453');await f.controller.find();f.success({latitude:42.335,longitude:-83.17,accuracy:20});assert.equal(f.cards()[0],'oak-lawn');
 assert.equal(f.storage.size,0);assert.ok(!f.calls.some(c=>JSON.stringify(c).includes('latitude')));
});
test('guest ZIP persists only after save, restores on return, and can be forgotten',async()=>{
 const f=fixture();await tick();f.input('08830');await f.controller.find();assert.equal(f.storage.size,0);f.click('nearbySave');await tick();assert.equal(f.storage.get('cubicship:shipping-zip'),'08830');
 const restored=fixture({saved:'08830'});await tick();await tick();assert.equal(restored.el('nearbyZip').value,'08830');assert.equal(restored.cards()[0],'iselin');assert.equal(restored.geoCalls,0);
 restored.click('nearbyForget');await tick();assert.equal(restored.storage.size,0);assert.match(restored.el('nearbySaved').textContent,/removed/);
});
test('account ZIP takes precedence over device ZIP and updates through an authenticated JSON request',async()=>{
 const f=fixture({saved:'60453',fetch:async(url,options)=>url.includes('zip-centroids')?{ok:true,json:async()=>({points})}:{ok:true,status:200,json:async()=>({ok:true,preferences:{zip:'48126'}})}});
 await tick();await tick();assert.equal(f.el('nearbyZip').value,'48126');assert.equal(f.cards()[0],'dearborn');
 f.input('08830');f.click('nearbySave');await tick();const write=f.calls.find(c=>c.options.method==='PATCH');assert.equal(write.options.credentials,'same-origin');assert.deepEqual(JSON.parse(write.options.body),{zip:'08830'});assert.equal(f.storage.get('cubicship:shipping-zip'),'60453');
});
test('a slow account load never replaces a ZIP already typed; lookup failures leave manual options usable',async()=>{
 let resolve;const f=fixture({fetch:async(url)=>url.includes('zip-centroids')?{ok:false}:new Promise(r=>resolve=r)});
 f.input('60453');resolve({ok:true,status:200,json:async()=>({preferences:{zip:'48126'}})});await tick();assert.equal(f.el('nearbyZip').value,'60453');
 await f.controller.find();assert.match(f.el('nearbyStatus').textContent,/could not load/);assert.equal(f.select.options.length,14);
});
test('unknown ZIP and geolocation far from a branch remain honest; selection updates the existing form value',async()=>{
 const f=fixture();await tick();f.input('00000');await f.controller.find();assert.match(f.el('nearbyStatus').textContent,/could not locate/);assert.equal(f.cards().length,0);
 f.click('nearbyGeo');f.success({latitude:37.77,longitude:-122.42,accuracy:6000});assert.match(f.el('nearbyStatus').textContent,/closest listed counter/);assert.equal(f.cards().length,3);
 const first=f.document.querySelector('.nearby-card');first.dispatchEvent(new f.browser.Event('click'));assert.equal(f.select.value,first.dataset.locationId);assert.equal(f.document.querySelector('.nearby-card').getAttribute('aria-pressed'),'true');
});
function handlerFixture(settings={}) {
 const calls=[],customer={id:'session-account',source:'supabase'}, module={exports:{}};
 const auth={json:(res,status,body)=>{res.statusCode=status;res.body=body;},publicCustomer:c=>c,requireCustomer:async(req,res)=>{res.statusCode=401;return null;},readBody:async req=>req.body};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/customer-me'),'utf8'),{module,URL,require:key=>({
 './_customer-auth':auth,'./_supabase-customer-store':{maybeRequireCustomer:async()=>settings.anonymous?null:customer},
 './_shipping-preferences':{shippingPreferences:async(c,next)=>{calls.push([c.id,next]);return next||{zip:'08830'};}}
 })[key]});
 return {calls,call:async(method,body,headers={})=>{const res={setHeader(){}};await module.exports({method,body,query:{preferences:'shipping'},headers:{host:'cubicship.com','content-type':'application/json',...headers}},res);return res;}};
}
test('saved ZIP API authenticates reads/writes, binds writes to session, rejects invalid ZIP and cross-origin writes',async()=>{
 const anon=handlerFixture({anonymous:true});assert.equal((await anon.call('PATCH',{zip:'48126'})).statusCode,401);assert.equal(anon.calls.length,0);
 const f=handlerFixture();assert.equal((await f.call('PATCH',{zip:'123'})).statusCode,400);assert.equal((await f.call('PATCH',{zip:'48126'},{origin:'https://unrelated.example'})).statusCode,403);
 assert.equal((await f.call('PATCH',{zip:'48126'},{'content-type':'text/plain'})).statusCode,415);assert.equal(f.calls.length,0);
 assert.equal((await f.call('PATCH',{zip:'08830',customerId:'other',role:'admin'})).statusCode,200);assert.equal(f.calls[0][0],'session-account');assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][1])),{zip:'08830'});
 assert.equal((await f.call('GET')).body.preferences.zip,'08830');assert.equal((await f.call('PATCH',{zip:''})).body.preferences.zip,'');
});
test('Supabase ZIP preferences preserve unrelated account metadata and never store coordinates',async()=>{
 const module={exports:{}},calls=[];
 const admin={getUserById:async id=>{calls.push(['get',id]);return {data:{user:{user_metadata:{name:'Test',cubicship_shipping:{zip:'08830'}}}}};},updateUserById:async(id,value)=>{calls.push(['update',id,value]);return {};}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/_shipping-preferences'),'utf8'),{module,process:{env:{}},require:key=>key==='@supabase/supabase-js'?{createClient:()=>({auth:{admin}})}:{}});
 const prefs=module.exports;assert.equal((await prefs.shippingPreferences({id:'own',source:'supabase'})).zip,'08830');
 await prefs.shippingPreferences({id:'own',source:'supabase'},{zip:'60453',latitude:40});const saved=calls.find(c=>c[0]==='update');assert.equal(saved[1],'own');assert.equal(saved[2].user_metadata.name,'Test');assert.deepEqual(JSON.parse(JSON.stringify(saved[2].user_metadata.cubicship_shipping)),{zip:'60453'});
});
test('language changes retain ZIP, selected branch and ranking without new network or location calls',async()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../public/locales/catalog.js'),'utf8'),context);
 const {sourceKeys,catalogs}=context.window.CubicCatalog;let language='en';
 const f=fixture();f.browser.CubicI18n={t(source,params={}){const key=sourceKeys[source.trim().replace(/\s+/g,' ').toLowerCase()];return (catalogs[language][key]||source).replace(/\{(\w+)\}/g,(_,k)=>params[k]??'');}};
 await tick();f.input('60453');await f.controller.find();f.document.querySelector('.nearby-card').dispatchEvent(new f.browser.Event('click'));
 const order=f.cards(),calls=f.calls.length;language='es';f.document.dispatchEvent(new f.browser.Event('cubic:languagechange'));
 assert.match(f.el('nearbyStatus').textContent,/Elija un punto de envío/);language='ar';f.document.dispatchEvent(new f.browser.Event('cubic:languagechange'));
 assert.match(f.el('nearbyStatus').textContent,/اختر أحد الفروع/);assert.deepEqual(f.cards(),order);assert.equal(f.select.value,'oak-lawn');assert.equal(f.el('nearbyZip').value,'60453');assert.equal(f.calls.length,calls);assert.equal(f.geoCalls,0);
});
test('failed account save is not reported as saved, and account changes discard an earlier pending preference',async()=>{
 const f=fixture({fetch:async(url,options)=>options.method==='PATCH'?{ok:false}:{ok:true,json:async()=>({preferences:{zip:''}})}});await tick();f.input('60453');f.click('nearbySave');await tick();assert.match(f.el('nearbySaved').textContent,/could not save/);assert.equal(f.el('nearbyForget').hidden,true);
 let resolve;const slow=fixture({fetch:async()=>new Promise(r=>resolve=r)});const first=resolve;
 slow.browser.fetch=async()=>({status:401,ok:false});await slow.controller.loadPreference(true);first({ok:true,json:async()=>({preferences:{zip:'48126'}})});await tick();assert.equal(slow.el('nearbyZip').value,'');assert.match(slow.el('nearbySave').textContent,/this device/);
});
