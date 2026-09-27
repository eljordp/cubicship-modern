const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {parseHTML} = require('linkedom');
const {canonicalLanguage, resolveLanguage} = require('../i18n.js');
const languages = require('../locales/languages.json');
const root = path.resolve(__dirname, '..');
const runtime = fs.readFileSync(path.join(root, 'i18n.js'), 'utf8');
function catalog() {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/locales/catalog.js'),'utf8'), context);
  return context.window.CubicCatalog;
}
function harness(fetch, query='en') {
  const {document,window} = parseHTML('<html><head><title>Shipping request</title></head><body><label><select data-language-picker></select></label><p id="copy">Get a quote first</p><input id="name" value="مريم García"><textarea id="notes">Documents from Warszawa</textarea><p translate="no" id="address">123 Main St</p><a href="/ship.html?mode=quote#main">Ship</a></body></html>');
  // Linkedom's select has no setter, unlike real browsers.
  Object.defineProperty(document.querySelector('select'), 'value', {value:'en',writable:true});
  const saved=[];
  const win={document,location:new URL('https://example.com/ship.html?lang='+query),navigator:{languages:['en']},localStorage:{getItem:()=>null,setItem:(key,value)=>saved.push([key,value])},history:{replaceState(){}},CubicCatalog:catalog(),fetch,AbortController,setTimeout,clearTimeout};
  vm.runInNewContext(runtime,{window:win,URL,URLSearchParams,Intl,MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent});
  return {win,document,saved};
}
function dictionary(code) { return JSON.parse(fs.readFileSync(path.join(root,'locales/extra',code+'.json'),'utf8')); }

test('browser language aliases respect script and regional preferences', () => {
  for (const [input,want] of [['zh-CN','zh-Hans'],['zh-SG','zh-Hans'],['zh-Hans-CN','zh-Hans'],['zh','zh-Hans'],['tl-PH','fil'],['fil-PH','fil'],['ur-PK','ur'],['fr-CA','fr'],['yo-NG','yo'],['ig-NG','ig'],['ha-NG','ha']]) assert.equal(canonicalLanguage(input),want,input);
  for (const input of ['zh-Hant','zh-TW','zh-HK','ng','de']) assert.equal(canonicalLanguage(input),null,input);
  assert.equal(resolveLanguage(null,null,['zh-Hant-TW','fr-CA']),'fr');
  assert.equal(resolveLanguage(null,'es',['en'],'/zh-Hans'),'zh-Hans');
  assert.equal(resolveLanguage('en','es',['en'],'/ur.html'),'en');
});

test('every added catalog has exact keys, intact slots, no empty copy, and matching content-hashed assets',()=>{
  const core=catalog();
  assert.deepEqual(Object.keys(core.catalogs).sort(),['ar','en','es']);
  const expected=Object.keys(core.catalogs.en).sort();
  const slots=text=>(text.match(/\{\w+\}/g)||[]).sort();
  for (const {code} of languages.filter(x=>!['en','es','ar'].includes(x.code))) {
    const data=dictionary(code);
    assert.deepEqual(Object.keys(data).sort(),expected,code);
    let changed=0;
    for(const id of expected) {
      assert.equal(typeof data[id],'string',code+':'+id);
      assert.ok(data[id].trim(),code+':'+id);
      assert.deepEqual(slots(data[id]),slots(core.catalogs.en[id]),code+':'+id);
      if(data[id]!==core.catalogs.en[id]) changed++;
    }
    assert.ok(changed>expected.length*.9,code+' contains excessive English fallback');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'public',core.localeFiles[code].json),'utf8')),data);
    const context={window:{CubicCatalog:{catalogs:{}}}};
    vm.runInNewContext(fs.readFileSync(path.join(root,'public',core.localeFiles[code].script),'utf8'),context);
    assert.equal(JSON.stringify(context.window.CubicCatalog.catalogs[code]),JSON.stringify(data));
  }
});

test('lazy language requests commit atomically and the latest selection wins',async()=>{
  const pending=[];
  const {win,document,saved}=harness(url=>new Promise(resolve=>pending.push({url,resolve})));
  await win.CubicI18n.ready;
  const older=win.CubicI18n.setLanguage('pl');
  const newer=win.CubicI18n.setLanguage('ur');
  assert.equal(document.documentElement.lang,'en');
  assert.equal(document.querySelector('select').getAttribute('aria-busy'),'true');
  pending[1].resolve({ok:true,json:async()=>dictionary('ur')});
  assert.equal(await newer,true);
  assert.equal(document.documentElement.lang,'ur');
  assert.equal(document.documentElement.dir,'rtl');
  pending[0].resolve({ok:true,json:async()=>dictionary('pl')});
  assert.equal(await older,false);
  assert.equal(document.documentElement.lang,'ur');
  assert.equal(document.querySelector('#name').value,'مريم García');
  assert.equal(document.querySelector('#notes').value,'Documents from Warszawa');
  assert.equal(document.querySelector('#address').textContent,'123 Main St');
  assert.deepEqual(saved,[['cubicship.language','ur']]);
  assert.equal(document.querySelector('a').getAttribute('href'),'/ship.html?mode=quote&lang=ur#main');
  assert.equal(document.querySelector('select').hasAttribute('aria-busy'),false);
  assert.equal(await win.CubicI18n.setLanguage('en'),true);
  assert.equal(document.querySelector('#copy').textContent,'Get a quote first');
});

test('failed or incomplete translations keep the current language and can be retried',async()=>{
  let attempts=0;
  const {win,document,saved}=harness(async()=>{ attempts++; return {ok:true,json:async()=>attempts===1?{}:dictionary('hi')}; });
  await win.CubicI18n.ready;
  assert.equal(await win.CubicI18n.setLanguage('hi'),false);
  assert.equal(document.documentElement.lang,'en');
  assert.equal(document.querySelector('select').value,'en');
  assert.equal(document.querySelector('.cs-language-status').hidden,false);
  assert.equal(saved.length,0);
  assert.equal(await win.CubicI18n.setLanguage('hi'),true);
  assert.equal(document.documentElement.lang,'hi');
  assert.equal(document.querySelector('.cs-language-status').hidden,true);
  assert.equal(attempts,2);
});

test('initial detected locale loads without storing an explicit preference',async()=>{
  const {win,document,saved}=harness(async()=>({ok:true,json:async()=>dictionary('bn')}),'bn-BD');
  assert.equal(await win.CubicI18n.ready,true);
  assert.equal(document.documentElement.lang,'bn');
  assert.equal(saved.length,0);
});

test('every language share URL includes native initial HTML, metadata and a working English switch',async()=>{
  const rewrites=require('../vercel.json').rewrites;
  for(const {code,dir,og} of languages.filter(x=>x.code!=='en')) {
    const {document,window}=parseHTML(fs.readFileSync(path.join(root,'public',code+'.html'),'utf8'));
    assert.equal(document.documentElement.lang,code);
    assert.equal(document.documentElement.dir,dir);
    assert.equal(document.querySelector('meta[property="og:locale"]').content,og);
    assert.equal(document.querySelector('meta[property="og:url"]').content,'https://cubicship.com/'+code);
    assert.ok(rewrites.some(x=>x.source==='/'+code&&x.destination==='/'+code+'.html'),code);
    assert.equal(document.querySelectorAll('[data-language-picker] option').length,languages.length);
    const core=catalog();
    if(core.localeFiles[code]) core.catalogs[code]=dictionary(code);
    const title=document.title;
    assert.notEqual(title,parseHTML(fs.readFileSync(path.join(root,'public/index.html'),'utf8')).document.title,code);
    document.querySelector('[data-language-picker]').remove();
    const win={document,location:new URL('https://example.com/'+code),navigator:{languages:['en']},localStorage:{getItem:()=>null,setItem(){}},history:{replaceState(){}},CubicCatalog:core};
    vm.runInNewContext(runtime,{window:win,URL,URLSearchParams,Intl,MutationObserver:window.MutationObserver,CustomEvent:window.CustomEvent});
    await win.CubicI18n.ready;
    assert.equal(document.title,title,code);
    await win.CubicI18n.setLanguage('en');
    assert.equal(document.documentElement.dir,'ltr');
    assert.equal(document.title,parseHTML(fs.readFileSync(path.join(root,'public/index.html'),'utf8')).document.title,code);
  }
});
