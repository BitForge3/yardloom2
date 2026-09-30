const express=require('express'),Database=require('better-sqlite3'),crypto=require('crypto');
const {PAYSTACK_SECRET,BASE_URL='http://localhost:3000',PORT=3000,DB_PATH='yardloom.db'}=process.env;
const PRICES={7:5000,30:15000},AGENT_PRICE=20000,FREE_LIMIT=3; // naira
const TYPES=['Land','House','Shop','Apartment','Office'],MODES=['Sale','Rent'];
const db=new Database(DB_PATH);db.pragma('journal_mode = WAL');
db.exec(`
create table if not exists users(id integer primary key,email text unique,name text,salt text,hash text,role text default 'user',agent_until integer default 0,email_ok integer default 0);
create table if not exists sessions(tok text primary key,user_id integer,created integer);
create table if not exists listings(id integer primary key,user_id integer,title text,type text,mode text,price integer,city text,area text,descr text,name text,phone text,photo text,status text default 'pending',verified integer default 0,featured_until integer default 0,created integer);
create table if not exists payments(ref text primary key,listing_id integer,user_id integer,days integer,amount integer,status text default 'pending',kind text default 'feature');
create table if not exists tokens(tok text primary key,user_id integer,kind text,exp integer);`);
for(const a of ["alter table users add column agent_until integer default 0","alter table payments add column kind text default 'feature'","alter table users add column email_ok integer default 0"])try{db.exec(a)}catch{}
const HTTPS=BASE_URL.startsWith('https');
const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
if(HTTPS)res.set('Strict-Transport-Security','max-age=31536000');next()});
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const hashPw=(pw,salt)=>crypto.scryptSync(pw,salt,64).toString('hex');
const q=(s,...a)=>db.prepare(s).get(...a),run=(s,...a)=>db.prepare(s).run(...a);

function applyPayment(ref,paidKobo){
  db.transaction(()=>{
    const p=q('select * from payments where ref=?',ref);
    if(!p||p.status==='paid'||paidKobo!==p.amount*100)return;
    if(p.kind==='agent'){const u=q('select agent_until a from users where id=?',p.user_id);run('update users set agent_until=? where id=?',Math.max(Date.now(),u?.a||0)+p.days*864e5,p.user_id)}
    else{const l=q('select featured_until f from listings where id=?',p.listing_id);run('update listings set featured_until=? where id=?',Math.max(Date.now(),l?.f||0)+p.days*864e5,p.listing_id)}
    run("update payments set status='paid' where ref=?",ref);
  })();
}
// Paystack webhook: needs the raw body to check the signature
app.post('/api/paystack/webhook',express.raw({type:'*/*'}),(req,res)=>{
  if(!PAYSTACK_SECRET)return res.sendStatus(503);
  const sig=crypto.createHmac('sha512',PAYSTACK_SECRET).update(req.body).digest(),got=Buffer.from(String(req.headers['x-paystack-signature']||''),'hex');
  if(got.length!==sig.length||!crypto.timingSafeEqual(sig,got))return res.sendStatus(401);
  try{const e=JSON.parse(req.body);if(e.event==='charge.success'&&e.data.currency==='NGN')applyPayment(e.data.reference,e.data.amount)}catch{}
  res.sendStatus(200);
});
app.use(express.json({limit:'700kb'}));
app.use((req,res,next)=>{const o=req.headers.origin;if(req.method==='POST'&&o&&o!==new URL(BASE_URL).origin)return res.status(403).json({error:'Blocked request.'});next()});
setInterval(()=>run('delete from sessions where created<?',Date.now()-2592e6),36e5).unref();

const cookies=h=>Object.fromEntries((h||'').split(';').map(c=>c.trim().split('=')).filter(a=>a[0]));
app.use((req,res,next)=>{
  const t=cookies(req.headers.cookie).sid;
  req.user=t?q('select u.id,u.email,u.name,u.role,u.email_ok as verified from sessions s join users u on u.id=s.user_id where s.tok=? and s.created>?',sha(t),Date.now()-2592e6):null;
  next();
});
const need=(req,res,next)=>req.user?next():res.status(401).json({error:'Log in first.'});
const verified=(req,res,next)=>req.user.verified?next():res.status(403).json({error:'Please confirm your email first. Check your inbox, or tap Resend email.'});
const admin=(req,res,next)=>req.user?.role==='admin'?next():res.status(403).json({error:'Admins only.'});
const hits=new Map();
const limit=(req,res,next)=>{const k=req.ip,n=(hits.get(k)||0)+1;hits.set(k,n);setTimeout(()=>hits.delete(k),9e5).unref();n>20?res.status(429).json({error:'Too many attempts. Try again in 15 minutes.'}):next()};
function login(res,u){
  const t=crypto.randomBytes(32).toString('hex');
  run('insert into sessions values(?,?,?)',sha(t),u.id,Date.now());
  res.setHeader('Set-Cookie',`sid=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${BASE_URL.startsWith('https')?'; Secure':''}`);
}

const {RESEND_API_KEY,MAIL_FROM='Yardloom <onboarding@resend.dev>'}=process.env;
async function mail(to,subject,html){
  if(!RESEND_API_KEY){console.log('\n[email not configured] To: '+to+'\n'+subject+'\n'+html.replace(/<[^>]+>/g,' ')+'\n');return}
  try{await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:MAIL_FROM,to,subject,html})})}catch{console.error('Email failed to send')}
}
function token(uid,kind,ms){const t=crypto.randomBytes(32).toString('hex');run('delete from tokens where user_id=? and kind=?',uid,kind);run('insert into tokens values(?,?,?,?)',sha(t),uid,kind,Date.now()+ms);return t}
function useToken(t,kind){const h=sha(String(t||'')),r=q('select * from tokens where tok=? and kind=? and exp>?',h,kind,Date.now());if(r)run('delete from tokens where tok=?',h);return r}
const esc=x=>String(x).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
function sendVerify(id,email,name){const l=`${BASE_URL}/verify?token=${token(id,'verify',864e5)}`;return mail(email,'Confirm your Yardloom email',`<p>Hi ${esc(name)},</p><p>Confirm your email to start posting: <a href="${l}">${l}</a></p><p>This link works for 24 hours. If you did not sign up, ignore this email.</p>`)}
app.post('/api/register',limit,(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),pw=String(req.body.password||''),name=String(req.body.name||'').trim();
  if(!/^\S+@\S+\.\S+$/.test(email)||pw.length<8||pw.length>200||!name||name.length>60||req.body.agree!==true)return res.status(400).json({error:'Enter your name, a valid email and a password of at least 8 characters, and agree to the Terms.'});
  if(q('select 1 from users where email=?',email))return res.status(409).json({error:'That email already has an account. Log in instead.'});
  const salt=crypto.randomBytes(16).toString('hex');
  const r=run('insert into users(email,name,salt,hash,role) values(?,?,?,?,?)',email,name,salt,hashPw(pw,salt),'user');
  login(res,{id:r.lastInsertRowid});sendVerify(r.lastInsertRowid,email,name);res.json({id:r.lastInsertRowid,name,email,role:'user',verified:false});
});
app.post('/api/login',limit,(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),u=q('select * from users where email=?',email);
  const pw=String(req.body.password||'').slice(0,200),salt=u?u.salt:'0'.repeat(32),h=Buffer.from(hashPw(pw,salt),'hex');
  if(!u||!crypto.timingSafeEqual(h,Buffer.from(u.hash,'hex')))return res.status(401).json({error:'Wrong email or password.'});
  login(res,u);res.json({id:u.id,name:u.name,email,role:u.role,verified:!!u.email_ok});
});
app.post('/api/logout',(req,res)=>{const t=cookies(req.headers.cookie).sid;if(t)run('delete from sessions where tok=?',sha(t));res.setHeader('Set-Cookie','sid=; Path=/; Max-Age=0');res.json({});});
app.get('/verify',(req,res)=>{const r=useToken(req.query.token,'verify');if(r)run('update users set email_ok=1 where id=?',r.user_id);res.redirect(r?'/?verified=1':'/?verified=0')});
app.post('/api/resend',need,limit,(req,res)=>{if(!req.user.verified)sendVerify(req.user.id,req.user.email,req.user.name);res.json({})});
app.post('/api/forgot',limit,(req,res)=>{
  const u=q('select * from users where email=?',String(req.body.email||'').trim().toLowerCase());
  if(u){const l=`${BASE_URL}/?reset=${token(u.id,'reset',36e5)}`;mail(u.email,'Reset your Yardloom password',`<p>Reset your password: <a href="${l}">${l}</a></p><p>This link works for 1 hour. If you did not ask for it, ignore this email.</p>`)}
  res.json({});
});
app.post('/api/reset',limit,(req,res)=>{
  const pw=String(req.body.password||'');
  if(pw.length<8||pw.length>200)return res.status(400).json({error:'Use a password of at least 8 characters.'});
  const r=useToken(req.body.token,'reset');if(!r)return res.status(400).json({error:'This link has expired. Ask for a new one.'});
  const salt=crypto.randomBytes(16).toString('hex');
  run('update users set salt=?,hash=?,email_ok=1 where id=?',salt,hashPw(pw,salt),r.user_id);
  run('delete from sessions where user_id=?',r.user_id);res.json({});
});
app.get('/api/me',(req,res)=>res.json(req.user));

const pub=`l.id,l.user_id,l.title,l.type,l.mode,l.price,l.city,l.area,l.descr as "desc",l.name,l.phone,l.photo,l.featured_until,l.created,(l.verified=1 or u.agent_until>strftime('%s','now')*1000) as verified`;
const from='from listings l join users u on u.id=l.user_id';
app.get('/api/listings',(req,res)=>res.json(db.prepare(`select ${pub} ${from} where l.status='approved' order by l.created desc limit 500`).all()));
app.post('/api/listings',need,verified,(req,res)=>{
  const b=req.body,s=k=>String(b[k]||'').trim(),price=Math.round(+b.price);
  if(s('title').length<3||!TYPES.includes(b.type)||!MODES.includes(b.mode)||!(price>0)||!s('city')||!s('name')||s('phone').replace(/\D/g,'').length<10)
    return res.status(400).json({error:'Check the title, price, city, name and WhatsApp number.'});
  const photo=typeof b.photo==='string'&&b.photo.length<400000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(b.photo)?b.photo:'';
  const n=q("select count(*) c from listings where user_id=? and status in ('pending','approved')",req.user.id).c,ag=q('select agent_until a from users where id=?',req.user.id).a;
  if(n>=FREE_LIMIT&&req.user.role!=='admin'&&ag<Date.now())return res.status(402).json({error:`Free accounts can post ${FREE_LIMIT} listings. Get the Agent plan for unlimited listings.`});
  const status=req.user.role==='admin'?'approved':'pending';
  run('insert into listings(user_id,title,type,mode,price,city,area,descr,name,phone,photo,status,created) values(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    req.user.id,s('title').slice(0,120),b.type,b.mode,price,s('city').slice(0,60),(s('area')||s('city')).slice(0,80),s('desc').slice(0,2000),s('name').slice(0,60),s('phone').slice(0,20),photo,status,Date.now());
  res.json({status});
});
// Paid featuring
app.post('/api/listings/:id/feature',need,verified,async(req,res)=>{
  const days=+req.body.days,l=q("select * from listings where id=? and user_id=? and status='approved'",req.params.id,req.user.id);
  if(!PRICES[days]||!l)return res.status(400).json({error:'That listing cannot be featured.'});
  if(!PAYSTACK_SECRET)return res.status(500).json({error:'Payments are not set up yet.'});
  const ref='yl_'+crypto.randomBytes(10).toString('hex');
  run('insert into payments(ref,listing_id,user_id,days,amount) values(?,?,?,?,?)',ref,l.id,req.user.id,days,PRICES[days]);
  try{
    const r=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:'Bearer '+PAYSTACK_SECRET,'Content-Type':'application/json'},
      body:JSON.stringify({email:req.user.email,amount:PRICES[days]*100,currency:'NGN',reference:ref,callback_url:BASE_URL+'/paid'})});
    const d=await r.json();if(!d.status)throw 0;res.json({url:d.data.authorization_url});
  }catch{res.status(502).json({error:'Could not reach Paystack. Try again.'})}
});
app.post('/api/agent',need,verified,async(req,res)=>{ // Agent plan: 30 days, pay again to renew
  if(!PAYSTACK_SECRET)return res.status(500).json({error:'Payments are not set up yet.'});
  const ref='yl_'+crypto.randomBytes(10).toString('hex');
  run("insert into payments(ref,listing_id,user_id,days,amount,kind) values(?,0,?,30,?,'agent')",ref,req.user.id,AGENT_PRICE);
  try{
    const r=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:'Bearer '+PAYSTACK_SECRET,'Content-Type':'application/json'},
      body:JSON.stringify({email:req.user.email,amount:AGENT_PRICE*100,currency:'NGN',reference:ref,callback_url:BASE_URL+'/paid'})});
    const d=await r.json();if(!d.status)throw 0;res.json({url:d.data.authorization_url});
  }catch{res.status(502).json({error:'Could not reach Paystack. Try again.'})}
});
app.get('/paid',async(req,res)=>{ // Paystack sends the buyer back here
  try{
    const ref=String(req.query.reference||req.query.trxref||'');
    const r=await fetch('https://api.paystack.co/transaction/verify/'+encodeURIComponent(ref),{headers:{Authorization:'Bearer '+PAYSTACK_SECRET}});
    const d=await r.json();if(d.status&&d.data.status==='success'&&d.data.currency==='NGN')applyPayment(ref,d.data.amount);
  }catch{}
  res.redirect('/?paid=1');
});
// Admin moderation
app.get('/api/admin/listings',need,admin,(req,res)=>res.json(db.prepare(`select ${pub},l.status ${from} order by l.status='pending' desc,l.created desc limit 500`).all()));
app.post('/api/admin/listings/:id',need,admin,(req,res)=>{
  const id=req.params.id,a=req.body.action;
  if(a==='approve')run("update listings set status='approved' where id=?",id);
  else if(a==='reject'||a==='remove')run('delete from listings where id=?',id);
  else if(a==='verify')run('update listings set verified=1-verified where id=?',id);
  else return res.status(400).json({error:'Unknown action.'});
  res.json({});
});
app.use(express.static('public'));
app.listen(PORT,()=>{console.log('Yardloom running on '+BASE_URL);
  if(!PAYSTACK_SECRET)console.warn('Warning: PAYSTACK_SECRET is not set. Payments are off.');
  if(!RESEND_API_KEY)console.warn('Warning: RESEND_API_KEY is not set. Emails are printed here instead of sent.')});
