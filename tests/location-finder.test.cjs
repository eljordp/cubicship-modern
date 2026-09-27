const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { milesBetween, rankCounters, searchTerms, init } = require('../locations-search');
const locations = require('../assets/locations.json');
const zips = require('../assets/zip-centroids.json').points;
const counters = locations.map((l, order) => ({ ...l, order, closed: l.closed === true }));

test('distance calculation agrees with a known great-circle route and handles same/antipodal points', () => {
  assert.ok(Math.abs(milesBetween(40.7128, -74.006, 51.5074, -0.1278) - 3461) < 3);
  assert.equal(milesBetween(42, -87, 42, -87), 0);
  assert.ok(Number.isFinite(milesBetween(0, 0, 0, 180)));
});
test('ZIP centers return expected local branches and preserve leading zeros', () => {
  assert.equal(rankCounters(counters, ...zips['60453'])[0].id, 'oak-lawn');
  assert.equal(rankCounters(counters, ...zips['48126'])[0].id, 'dearborn');
  assert.equal(rankCounters(counters, ...zips['08830'])[0].id, 'iselin');
  assert.equal(rankCounters(counters, ...zips['53140'])[0].id, 'milwaukee');
});
test('closed and unmapped counters never become recommendations; Freeport remains ranked', () => {
  const ranked = rankCounters(counters, 41.4871, -81.7663);
  assert.equal(ranked.length, 14);
  assert.ok(!ranked.some((l) => l.id === 'cleveland'));
  assert.ok(ranked.some((l) => l.id === 'freeport'));
  assert.deepEqual(rankCounters(counters, NaN, 0), []);
  assert.deepEqual(rankCounters([{ id:'missing', order:0 }], 42, -87), []);
});
test('every usable branch has sourced coordinates in its state and matching Census ZIP', () => {
  const boxes = { IL:[36.9,42.6,-91.6,-87.4], MI:[41.6,48.4,-90.5,-82.1], NY:[40.4,45.1,-79.8,-71.8], NJ:[38.8,41.4,-75.6,-73.8], WI:[42.4,47.4,-93,-86.7], PA:[39.7,42.6,-80.6,-74.6], IN:[37.7,41.8,-88.2,-84.7] };
  for (const l of counters.filter((l)=>!l.closed)) {
    const [south,north,west,east]=boxes[l.state];
    assert.ok(l.lat>=south && l.lat<=north && l.lng>=west && l.lng<=east,l.id);
    assert.match(l.coordSource,/^https:\/\/geocoding.geo.census.gov\//);
    assert.equal(l.coordCheckedAt,'2026-09-27');
    assert.ok(l.coordMatchedAddress.endsWith(l.address.slice(-5)),l.id);
  }
});
test('static directory retains every branch, directions and no-JS fallback', () => {
  const html=fs.readFileSync(path.join(__dirname,'../dhl-locations.html'),'utf8');
  assert.equal((html.match(/data-search=/g)||[]).length,15);
  assert.equal((html.match(/maps\/dir\/\?api=1/g)||[]).length,15);
  assert.match(html,/<noscript>.*Browse all counters/s);
  assert.match(html,/id="finderControls" hidden/);
  assert.match(html,/id="finderStatus" role="status" aria-live="polite"/);
  for (const l of locations) assert.ok(html.includes('data-id="'+l.id+'"'));
});
// A small DOM adapter lets the browser controller run with deterministic async inputs.
class Element {
  constructor(dataset={}) { this.dataset=dataset;this.children=[];this.listeners={};this.hidden=false;this.textContent='';this.value=''; }
  appendChild(el) { if(el.parent)el.parent.children=el.parent.children.filter(x=>x!==el); this.children.push(el);el.parent=this;return el; }
  querySelector(){return this.distance;}
  addEventListener(name,fn){this.listeners[name]=fn;}
  fire(name){return this.listeners[name]();}
  focus(){this.focused=true;}
}
function fixture(options={}) {
  const ids=Object.fromEntries(['locationSearch','locations','nearestLocations','nearestSection','otherHeading','finderStatus','locationCount','emptyLocations','useLocation','clearLocations','finderControls'].map(id=>[id,new Element()]));
  const cards=locations.map(l=>{const c=new Element({id:l.id,closed:String(l.closed === true),search:[l.city,l.state,l.market,l.address].join(' ').toLowerCase(),...(l.lat===undefined?{}:{lat:String(l.lat),lng:String(l.lng)})});c.distance=new Element();ids.locations.appendChild(c);return c;});
  let geoCalls=0, geoSuccess,geoFailure,fetchCalls=0;
  const browser={ AbortController, setTimeout, clearTimeout, navigator: {geolocation:{getCurrentPosition(ok,fail){geoCalls++;geoSuccess=ok;geoFailure=fail;}}}, fetch:options.fetch|| (async()=>{fetchCalls++;return {ok:true,json:async()=>({points:zips})};})};
  const doc = {getElementById:id=>ids[id],querySelectorAll:()=>cards, addEventListener:(name,fn)=>{doc[name]=fn;}};
  if(options.i18n) browser.CubicI18n=options.i18n;
  init(doc,browser);
  return {ids,cards,browser,changeLanguage:()=>doc["cubic:languagechange"](),get geoCalls(){return geoCalls}, get fetchCalls(){return fetchCalls},success:coords=>geoSuccess({coords}),fail:e=>geoFailure(e),search:async(value)=>{ids.locationSearch.value=value;await ids.locationSearch.fire('input');}};
}
test('permission is requested only on click; denial gives usable manual search', async()=>{
  const f=fixture();assert.equal(f.geoCalls,0);assert.equal(f.fetchCalls,0);
  f.ids.useLocation.fire('click');assert.equal(f.geoCalls,1);assert.equal(f.ids.useLocation.disabled,true);
  f.fail({code:1});assert.equal(f.ids.useLocation.disabled,false);assert.match(f.ids.finderStatus.textContent,/not allowed/);
  await f.search('Illinois');assert.equal(f.cards.filter(c=>!c.hidden).length,3);
  await f.search('IN');assert.equal(f.cards.filter(c=>!c.hidden).length,1);
});
test('ZIP search ranks three first, reset restores all fifteen without requesting location', async()=>{
  const f=fixture();await f.search('60453');assert.equal(f.fetchCalls,1);assert.equal(f.geoCalls,0);
  assert.equal(f.ids.nearestLocations.children.length,3);assert.equal(f.ids.nearestLocations.children[0].dataset.id,'oak-lawn');
  assert.match(f.ids.nearestLocations.children[0].distance.textContent,/ZIP 60453/);
  await f.search('48126');assert.equal(f.fetchCalls,1);
  f.ids.clearLocations.fire('click');assert.equal(f.ids.locations.children.length,15);assert.equal(f.ids.nearestSection.hidden,true);assert.equal(f.ids.locationSearch.focused,true);
});
test('unknown ZIP and data failures preserve address search; failed loads can retry', async()=>{
  const f=fixture();await f.search('00000');assert.match(f.ids.finderStatus.textContent,/could not locate/);assert.equal(f.ids.emptyLocations.hidden,false);
  let attempts=0;
  const bad=fixture({fetch:async()=>{if(++attempts===1)throw Error('offline');return {ok:true,json:async()=>({points:zips})};}});
  await bad.search('60453');assert.match(bad.ids.finderStatus.textContent,/could not load/);assert.equal(bad.cards.filter(c=>!c.hidden).length,1);
  await bad.search('60453');assert.equal(bad.ids.nearestLocations.children[0].dataset.id,'oak-lawn');
});
test('new text or reset invalidates pending geolocation and pending ZIP response', async()=>{
  const f=fixture();f.ids.useLocation.fire('click');await f.search('Milwaukee');f.success({latitude:41.714,longitude:-87.74,accuracy:20});
  assert.equal(f.ids.nearestSection.hidden,true);assert.equal(f.cards.filter(c=>!c.hidden)[0].dataset.id,'milwaukee');
  let resolve;
  const slow=fixture({fetch:()=>new Promise(r=>{resolve=r;})});const pending=slow.search('60453');
  await slow.search('Dearborn');resolve({ok:true,json:async()=>({points:zips})});await pending;
  assert.equal(slow.ids.nearestSection.hidden,true);assert.equal(slow.cards.filter(c=>!c.hidden)[0].dataset.id,'dearborn');
});
test('geolocation ranks counters locally and reports distant/approximate results honestly',()=>{
  const f=fixture();f.ids.useLocation.fire('click');f.success({latitude:37.77,longitude:-122.42,accuracy:6000});
  assert.match(f.ids.finderStatus.textContent,/closest listed counter/);assert.match(f.ids.finderStatus.textContent,/approximate/);
  assert.equal(f.fetchCalls,0);assert.equal(f.ids.nearestLocations.children.length,3);
  assert.ok(!f.ids.nearestLocations.children.some(c=>c.dataset.id==='cleveland'));
});

test('switching languages preserves ranked results and input without repeating location or ZIP requests', async()=>{
  const vm=require('node:vm'), context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/locales/catalog.js'),'utf8'),context);
  const {catalogs,sourceKeys}=context.window.CubicCatalog;
  let language='en';
  const f=fixture({i18n:{t(source,params={}){ const key=sourceKeys[source.trim().replace(/\s+/g,' ').toLowerCase()]; return (catalogs[language][key]||source).replace(/\{(\w+)\}/g,(_,k)=>params[k]); }}});
  await f.search('60453');
  const order=f.ids.nearestLocations.children.map(c=>c.dataset.id);
  language='ar';f.changeLanguage();
  assert.match(f.ids.finderStatus.textContent,/الفروع الأقرب/);
  assert.match(f.ids.nearestLocations.children[0].distance.textContent,/ميل/);
  assert.equal(f.ids.locationSearch.value,'60453');
  assert.deepEqual(f.ids.nearestLocations.children.map(c=>c.dataset.id),order);
  assert.equal(f.fetchCalls,1);assert.equal(f.geoCalls,0);
  language='en';f.changeLanguage();
  assert.match(f.ids.finderStatus.textContent,/Closest counters from ZIP 60453/);
});
