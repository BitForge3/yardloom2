
const $=s=>document.querySelector(s);
const colors={Land:'#5f7f3b',House:'#0e4d3a',Shop:'#8a5a1f',Apartment:'#2f5d8a',Office:'#5a4a7a'};
const naira=n=>'₦'+Number(n).toLocaleString('en-NG');
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ph=l=>`class="ph" style="background-color:${colors[l.type]};${l.photo?`background-image:url(${esc(l.photo)})`:''}"`;
const isF=l=>l.featured_until>Date.now();
let me=null,list=[],cur=null,reg=false;
async function api(u,body){const r=await fetch(u,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Something went wrong. Try again.');return d}
async function load(){try{list=await api('/api/listings')}catch(e){list=[]}render()}
function render(){
 const q=$('#q').value.toLowerCase(),t=$('#fType').value,m=$('#fMode').value,s=$('#fSort').value;
 let r=list.filter(l=>(!t||l.type===t)&&(!m||l.mode===m)&&(!q||(l.title+l.area+l.city).toLowerCase().includes(q)));
 r.sort((a,b)=>s==='lo'?a.price-b.price:s==='hi'?b.price-a.price:(isF(b)?1:0)-(isF(a)?1:0)||b.created-a.created);
 $('#count').textContent=r.length+(r.length===1?' property':' properties');
 $('#grid').innerHTML=r.length?r.map(l=>`<button class="card" data-id="${l.id}"><div ${ph(l)}>${l.photo?'':esc(l.type)}<span class="tag">For ${l.mode.toLowerCase()}</span>${isF(l)?'<span class="tag f">Featured</span>':''}</div><div class="body"><div class="price">${naira(l.price)}${l.mode==='Rent'?' /yr':''}</div><h3>${esc(l.title)}</h3><div class="meta">${esc(l.area)}, ${esc(l.city)}${l.verified?' · Verified':''}</div></div></button>`).join(''):'<div class="empty">No properties yet. Post the first one.</div>';
}
['#q','#fType','#fMode','#fSort'].forEach(i=>$(i).addEventListener('input',render));
document.addEventListener('click',e=>{if(e.target.closest('[data-close]'))e.target.closest('dialog').close();if(e.target.tagName==='DIALOG')e.target.close()});
$('#grid').addEventListener('click',e=>{
 const c=e.target.closest('.card');if(!c)return;
 const l=cur=list.find(x=>x.id==c.dataset.id);
 const n=l.phone.replace(/\D/g,'').replace(/^0/,'234'),msg=encodeURIComponent(`Hello ${l.name}, I saw "${l.title}" on Yardloom. Is it still available?`);
 $('#viewBody').innerHTML=`<div ${ph(l)}>${l.photo?'':esc(l.type)}</div><div class="price">${naira(l.price)}${l.mode==='Rent'?' per year':''}</div><h2>${esc(l.title)}</h2><div class="meta">${esc(l.type)} for ${l.mode.toLowerCase()} · ${esc(l.area)}, ${esc(l.city)}</div><p>${esc(l.desc||'No description added.')}</p><div class="meta">Listed by ${esc(l.name)}${l.verified?' (Verified)':''}</div><p class="note">Never pay before you have inspected the property and checked its documents.</p><div class="acts"><a class="btn" style="text-decoration:none" href="https://wa.me/${n}?text=${msg}" target="_blank" rel="noopener">Message on WhatsApp</a>${me&&me.id===l.user_id?'<button class="btn alt" id="mkF">Feature this listing</button>':''}<button class="btn ghost" data-close>Close</button></div>`;
 $('#view').showModal();
 const b=$('#mkF');if(b)b.onclick=()=>{$('#view').close();$('#fTitle').textContent=l.title;$('#fErr').textContent='';$('#feat').showModal()};
});
function showMe(){$('#vbar').hidden=!(me&&!me.verified);$('#authBtn').textContent=me?'Log out':'Log in';$('#admBtn').hidden=!(me&&me.role==='admin')}
function authMode(r){reg=r;$('#aTitle').textContent=r?'Create an account':'Log in';$('#aNameW').hidden=!r;$('#aAgreeW').hidden=!r;$('#aForgot').parentElement.hidden=r;$('#aGo').textContent=r?'Create account':'Log in';$('#aSwitch').textContent=r?'I have an account':'Create an account';$('#aErr').textContent=''}
function openAuth(r){authMode(r);$('#auth').showModal()}
$('#authBtn').onclick=async()=>{if(me){await api('/api/logout',{});me=null;showMe();render()}else openAuth(false)};
$('#aSwitch').onclick=()=>authMode(!reg);
$('#aGo').onclick=async()=>{try{me=await api(reg?'/api/register':'/api/login',{email:$('#aEmail').value,password:$('#aPass').value,name:$('#aName').value,agree:$('#aAgree').checked});$('#auth').close();showMe();render();if(reg)alert('Account created. Check your email and tap the link to confirm it.')}catch(e){$('#aErr').textContent=e.message}};
$('#priceBtn').onclick=()=>$('#price').showModal();
$('#postBtn').onclick=()=>{if(!me){openAuth(true);return}$('#err').textContent='';$('#post').showModal()};
$('#cancel').onclick=()=>$('#post').close();
function shrink(f){return new Promise(res=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,600/im.width),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.6))};im.onerror=()=>res('');im.src=r.result};r.onerror=()=>res('');r.readAsDataURL(f)})}
$('#save').onclick=async()=>{
 const g=i=>$(i).value.trim(),f=$('#pPhoto').files[0];
 try{
  const r=await api('/api/listings',{title:g('#pTitle'),type:$('#pType').value,mode:$('#pMode').value,price:g('#pPrice'),city:g('#pCity'),area:g('#pArea'),desc:g('#pDesc'),name:g('#pName'),phone:g('#pPhone'),photo:f?await shrink(f):''});
  $('#post').close();['#pTitle','#pPrice','#pCity','#pArea','#pDesc','#pPhoto'].forEach(i=>$(i).value='');
  alert(r.status==='pending'?'Submitted. Your listing will appear once it is approved.':'Your listing is live.');load();
 }catch(e){$('#err').textContent=e.message}
};
$('#fSend').onclick=async()=>{try{const r=await api(`/api/listings/${cur.id}/feature`,{days:+$('#fPlan').value});location.href=r.url}catch(e){$('#fErr').textContent=e.message}};
async function adm(){
 const a=await api('/api/admin/listings'),p=a.filter(x=>x.status==='pending'),v=a.filter(x=>x.status==='approved');
 $('#admP').innerHTML=p.length?p.map(l=>`<div class="it"><span>${esc(l.title)}, ${naira(l.price)}, ${esc(l.city)}</span><span><button class="btn" data-a="approve" data-i="${l.id}">Approve</button> <button class="btn ghost" data-a="reject" data-i="${l.id}">Reject</button></span></div>`).join(''):'<p class="meta">Nothing waiting.</p>';
 $('#admL').innerHTML=v.length?v.map(l=>`<div class="it"><span>${esc(l.title)}</span><span><button class="btn ghost" data-a="verify" data-i="${l.id}">${l.verified?'Unverify':'Verify'}</button> <button class="btn ghost" data-a="remove" data-i="${l.id}">Remove</button></span></div>`).join(''):'<p class="meta">No live listings yet.</p>';
}
$('#admBtn').onclick=async()=>{await adm();$('#adm').showModal()};
$('#adm').addEventListener('click',async e=>{const d=e.target.dataset;if(!d.a)return;try{await api('/api/admin/listings/'+d.i,{action:d.a});await adm();load()}catch(x){alert(x.message)}});
(async()=>{try{me=await api('/api/me')}catch(e){}showMe();load();if(location.search.includes('paid=1')){history.replaceState(null,'','/');alert('Payment received. Your listing will show as Featured shortly.')}})();

$('#agentBtn').onclick=async()=>{if(!me){$('#price').close();openAuth(true);return}try{const r=await api('/api/agent',{});location.href=r.url}catch(e){alert(e.message)}};

$('#aForgot').onclick=async e=>{e.preventDefault();const em=$('#aEmail').value.trim();if(!em){$('#aErr').textContent='Type your email above first.';return}try{await api('/api/forgot',{email:em});$('#aErr').textContent='If that email has an account, we have sent a reset link.'}catch(x){$('#aErr').textContent=x.message}};
$('#vRe').onclick=async()=>{try{await api('/api/resend',{});alert('Sent. Check your inbox and spam folder.')}catch(e){alert(e.message)}};
const P=new URLSearchParams(location.search);
if(P.get('reset')){const tk=P.get('reset');history.replaceState(null,'','/');$('#rst').showModal();$('#rGo').onclick=async()=>{try{await api('/api/reset',{token:tk,password:$('#rPass').value});$('#rst').close();alert('Password changed. Please log in.');openAuth(false)}catch(e){$('#rErr').textContent=e.message}}}
if(P.has('verified')){alert(P.get('verified')==='1'?'Email confirmed. You can now post.':'That link has expired. Log in and tap Resend email.');history.replaceState(null,'','/')}
