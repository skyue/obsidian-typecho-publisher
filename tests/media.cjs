const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const requests = [], posts = [], notices = [];
let fail = false;
class TFile { constructor(name) { this.path = name; this.name = name; this.extension = name.split('.').pop(); this.basename = name; } }
const el = () => new Proxy({}, {get: (_, key) => ['createEl', 'createDiv', 'createSpan'].includes(key) ? el : () => {}});
const obsidian = {TFile, getLanguage: () => 'en', Notice: class { constructor(s) { notices.push(s); } }, Modal: class { constructor() { this.modalEl = el(); this.contentEl = el(); this.titleEl = el(); } open() { this.onOpen(); } }, requestUrl: async r => { requests.push(r); if (fail) throw Error('simulated network failure'); return {status:200}; }};
const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  const exports = cache[name] = {};
  const source = fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports, require: n => n === 'obsidian' ? obsidian : n === './xmlrpc-client' ? {XmlRpcClient:class {async editPost(id, post) {posts.push(post);} }} : load(n.slice(2)), crypto:require('node:crypto').webcrypto, URL, TextEncoder, console, setTimeout:()=>{}});
  return exports;
}
(async () => {
  const utils = load('markdown-utils');
  const code = '`![[inline.mp4]]`\n```md\n![[code.mp3]]\n```';
  assert.equal(utils.extractImages(code).length, 0);
  assert.equal(utils.replaceImageUrls(code, new Map()), code);
  const files = ['clip.mp4','sound.mp3','photo.png','manual.pdf'].map(n => new TFile(n));
  let text = '---\ndate: 2026-11-01\ntypecho_postid: 123\n---\n' + files.map(f => `![[${f.name}]]`).join('\n') + '\n![remote](https://cdn.test/remote.webm)\n' + code;
  const settings = {xmlrpcUrl:'https://blog.test',username:'test',password:'test',fieldMapping:{dateCreated:'date'},fieldRequired:{},slugDateFormat:'YYYYMMDD',useImageHost:true,imageHostType:'r2',r2AccountId:'test',r2AccessKeyId:'test',r2SecretAccessKey:'test',r2Bucket:'test',r2PublicUrlPrefix:'https://cdn.test',r2PathPrefix:'media',imageCache:{'clip.mp4':'https://old.test/clip.mp4','sound.mp3':'https://old.test/sound.mp3'}};
  const vault = {read:async()=>text,readBinary:async()=>new Uint8Array([1,2,3]).buffer,getAbstractFileByPath:n=>files.find(f=>f.path===n)};
  let saved = 0;
  const service = new (load('publish-service').PublishService)({},vault,{getFileCache:()=>null},()=>settings,async()=>{saved++;},async()=>{});
  await service.publish(new TFile('note.md'));
  assert.equal(requests.length,4); assert.equal(posts.length,1); assert.equal(saved,1);
  assert.deepEqual(requests.map(r=>r.contentType),['video/mp4','audio/mpeg','image/png','application/pdf']);
  assert.ok(requests.every(r=>r.method==='PUT' && r.headers.Authorization.startsWith('AWS4-HMAC-SHA256')));
  assert.match(posts[0].description,/<video controls/); assert.match(posts[0].description,/<audio controls/);
  assert.match(posts[0].description,/!\[photo.png\]\(https:\/\/cdn.test\/media\/photo.png\)/);
  assert.match(posts[0].description,/<a href="https:\/\/cdn.test\/media\/manual.pdf">/);
  assert.ok(posts[0].description.includes(code)); assert.ok(!posts[0].description.includes('https://old.test'));
  await service.publish(new TFile('note.md')); assert.equal(requests.length,4); assert.equal(posts.length,2);
  delete settings.imageCache['media-v2:clip.mp4']; fail=true;
  await service.publish(new TFile('note.md')); assert.equal(requests.length,5); assert.equal(settings.imageCache['media-v2:clip.mp4'],undefined); assert.ok(notices.some(n=>n.includes('simulated network failure')));
  fail=false;
  await service.publish(new TFile('note.md')); assert.equal(requests.length,6); assert.ok(settings.imageCache['media-v2:clip.mp4']);
  console.log('PASS: publish pipeline, signed R2 requests and MIME, mixed media output, code protection, legacy cache migration, cache reuse, failed upload retry');
})().catch(e=>{console.error(e);process.exitCode=1;});
