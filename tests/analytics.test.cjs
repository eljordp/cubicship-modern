const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../analytics.js'), 'utf8');
function harness({url='https://www.cubicship.com/ship.html?lang=es&utm_source=google&gclid=AD_TEST_123&email=private%40example.com&token=SECRET#PRIVATE', privacy=false, storage=new Map()}={}) {
  const scripts=[], requests=[], listeners={};
  const document={documentElement:{lang:'es'}, referrer:'https://example.org/?email=private@example.com', head:{appendChild:s=>scripts.push(s)}, createElement:()=>({}), addEventListener:(n,f)=>listeners[n]=f};
  const window={};
  vm.runInNewContext(source,{window,document,location:new URL(url),navigator:{globalPrivacyControl:privacy},URL,URLSearchParams,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetch:(url,options)=>{requests.push({url,...options});return Promise.resolve({ok:true});},setTimeout,clearTimeout});
  return {api:window.CubicAnalytics,commands:()=>Array.from(window.dataLayer||[],a=>Array.from(a)),scripts,requests,listeners,storage};
}
test('keeps original GA property and sends one automatic page view beside first-party counts',()=>{
 const h=harness(), configs=h.commands().filter(x=>x[0]==='config');
 assert.equal(configs.length,1); assert.equal(configs[0][1],'G-KQMJQ5RPNG');
 assert.equal(h.scripts.length,1); assert.match(h.scripts[0].src,/googletagmanager.com\/gtag\/js\?id=G-KQMJQ5RPNG$/);
 assert.equal(h.commands().filter(x=>x[0]==='event'&&x[1]==='page_view').length,0);
 assert.equal(JSON.parse(h.requests[0].body).event,'page_view');
 const u=new URL(configs[0][2].page_location);
 assert.equal(u.searchParams.get('gclid'),'AD_TEST_123'); assert.equal(u.searchParams.get('utm_source'),'google');
 assert.equal(u.searchParams.get('email'),null); assert.equal(u.searchParams.get('token'),null); assert.equal(u.hash,'');
 assert.equal(configs[0][2].page_referrer,'https://example.org/');
});
test('only confirmed saves become leads; attempts, errors and arbitrary events cannot',()=>{
 const h=harness();
 for(const name of ['form_submit_attempt','form_invalid','form_error','quote_click','generate_lead','private@example.com']) h.api.event(name,'private@example.com');
 assert.equal(h.commands().filter(x=>x[1]==='generate_lead').length,0);
 h.api.saved('shipping','fixture-request','dearborn'); h.api.saved('shipping','fixture-request','dearborn');
 const leads=h.commands().filter(x=>x[1]==='generate_lead'); assert.equal(leads.length,1);
 assert.equal(leads[0][2].request_type,'shipping'); assert.equal(leads[0][2].location_id,'dearborn');
 assert(!JSON.stringify(h.commands()).includes('fixture-request'));
 assert(!JSON.stringify(h.commands()).includes('private@example.com'));
 const retry=harness({storage:h.storage}); retry.api.saved('shipping','fixture-request','dearborn');
 assert.equal(retry.commands().filter(x=>x[1]==='generate_lead').length,0);
});
test('saved conversions cannot include arbitrary customer fields or invalid request types',()=>{
 const h=harness(); h.api.saved('private@example.com','id','dearborn'); h.api.saved('service','','dearborn');
 h.api.saved('service','safe-id','private@example.com');
 const leads=h.commands().filter(x=>x[1]==='generate_lead'); assert.equal(leads.length,1); assert.equal(leads[0][2].location_id,'');
 assert(!JSON.stringify(h.commands()).includes('private@example.com'));
});
test('local tests and privacy opt-out never contact Google',()=>{
 for(const options of [{privacy:true},{url:'http://localhost:4191/ship.html'}]) {
  const h=harness(options); h.api.saved('shipping','local-fixture','dearborn'); assert.equal(h.scripts.length,0); assert.equal(h.commands().length,0);
  if(options.privacy) assert.equal(h.requests.length,0);
 }
});
test('built original tracked pages retain Google and Vercel analytics',()=>{
 for(const name of ['index.html','ship.html','profile.html','qr-shipment.html','track.html','about.html']) {
  const page=fs.readFileSync(require.resolve('../public/'+name),'utf8');
  assert.match(page,/src="\/analytics.js"/); assert.match(page,/src="\/_vercel\/insights\/script.js"/);
 }
});
