const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const I18N={
  en:{title:'One platform. One appointment. Permission-aware interfaces.',sub:'Interactive pre-development architecture & workflow demonstrator',notice:'Technical review demo - not a production MVP',role:'Role perspective',book:'Booking concurrency',arch:'Architecture',rbac:'RBAC',registers:'Review registers',estimate:'MVP estimate',deliverables:'Deliverables',attempt:'Attempt booking'},
  fr:{title:'Une plateforme. Un rendez-vous. Des interfaces selon les permissions.',sub:'Démonstrateur interactif d’architecture et de flux pré-développement',notice:'Démo de revue technique - pas un MVP en production',role:'Perspective du rôle',book:'Concurrence de réservation',arch:'Architecture',rbac:'RBAC',registers:'Registres de revue',estimate:'Estimation MVP',deliverables:'Livrables',attempt:'Tenter la réservation'}
};
const roles={
  patient:{label:'Patient',tag:'Search, book and manage appointments',caps:['Search published doctors and facilities','Read bookable availability projection','Create appointment','Read own appointment','Request cancel/reschedule*']},
  doctor:{label:'Doctor',tag:'Professional profile, affiliations and facility-specific availability',caps:['Manage own professional profile','Read/respond to affiliations*','Manage affiliation-scoped availability','Read own appointments','Progress consultation workflow*']},
  facility:{label:'Healthcare Facility',tag:'Facility operations, staff, rooms and appointments',caps:['Manage facility profile','Manage scoped staff permissions*','Manage Doctor affiliations*','Read/manage facility appointments','Reception and room operations*']},
  admin:{label:'Medidocta Admin',tag:'Privileged oversight of the same canonical domain records',caps:['Verification review*','Operational oversight','Permissioned appointment support','Audit history','Platform settings*']}
};
const appt={id:'APT-1042',patient:'Amina N.',doctor:'Dr. Etienne Mbarga',facility:'Centre Médical Akwa',date:'08 Oct 2026',time:'10:00–10:30',status:'CONFIRMED'};
const principles=[
  ['AP-001','ONE platform, not three products','One responsive client and one backend domain model.'],
  ['AP-002','Authentication → Role → Permission → Interface','Protected routes depend on server-resolved context.'],
  ['AP-003','Same account and canonical data on every device','No device-specific business-data copies.'],
  ['AP-004','ONE canonical Appointment','Role-specific views reference the same appointment_id.'],
  ['AP-005','Doctor-Facility Affiliation is first-class','Contracts, terms and availability are scoped to affiliation.'],
  ['AP-006','Doctor occupancy is global across facilities','Overlapping booking is blocked regardless of facility.'],
  ['AP-008','Frontend availability is not authoritative','Create/reschedule revalidates inside a DB transaction.'],
  ['AP-009','Canonical codes, localized presentation','FR/EN labels never duplicate business records.']
];
const rbac=[
  ['Patient','Appointment','create / read / cancel / reschedule*','Own/approved subject appointments'],
  ['Doctor','Availability','read / update','Own Doctor-Facility affiliation'],
  ['Doctor','Appointment','read / lifecycle commands*','Appointments where Doctor is party'],
  ['Facility receptionist','Appointment operations','read / arrival / room assignment*','Own facility only'],
  ['Facility finance','Contract / financial terms','read / respond*','Own facility + financial permission'],
  ['Facility admin','Staff membership','invite / role assignment*','Own facility only'],
  ['Medidocta verifier','Verification cases','review / decide*','Assigned/platform verification scope'],
  ['Medidocta admin','Canonical domain resources','privileged support / oversight','Policy-limited internal scope']
];
const gaps=[
  ['BLOCKER','Cross-role appointment identity','Confirm every role screen uses the same canonical appointment and lifecycle.'],
  ['BLOCKER','Booking concurrency UX','Define conflict, retry and stale-slot handling after backend rejection.'],
  ['HIGH','Doctor multi-facility context','Keep facility context visible while editing terms and availability.'],
  ['HIGH','Cancellation / rescheduling','Verify permissions, state transitions, conflicts and notification consequences.'],
  ['HIGH','Booking for another person','Define actor vs appointment subject and consent/history ownership.'],
  ['MEDIUM','Responsive dense calendars','Validate mobile agenda and tablet/desktop calendar behaviors.'],
  ['MEDIUM','FR/EN content expansion','Validate French labels, wrapping, validation and empty/error states.']
];
const decisions=[
  ['DR-001','Can one account hold multiple top-level roles?'],
  ['DR-003','Exact booking-for-another-person subject/consent model'],
  ['DR-004','Final appointment lifecycle and permitted actors'],
  ['DR-007','Availability rule ownership and edit authority'],
  ['DR-009','Capacity semantics beyond Doctor occupancy'],
  ['DR-012','Timezone policy for Cameroon and expansion markets'],
  ['DR-016','Facility staff role catalog / custom bundles']
];
const scenarios=[
  ['same','Two patients / same Doctor interval','409 BOOKING_CONFLICT'],
  ['cross','Same Doctor / different facilities','409 BOOKING_CONFLICT'],
  ['open','Open interval','201 Appointment committed'],
  ['retry','Network retry / same idempotency key','Original result replayed; no duplicate']
];
let state={lang:'en',view:'overview',role:'patient',scenario:'cross',result:''};
const pill=(t,c='')=>`<span class="pill ${c}">${esc(t)}</span>`;
const head=(badge,title,desc,c='')=>`<div class="section-head"><div>${pill(badge,c)}<h2>${esc(title)}</h2><p>${esc(desc)}</p></div><b class="spark">✦</b></div>`;

function nav(){
  const t=I18N[state.lang];
  const items=[['overview',t.role,'▦'],['architecture',t.arch,'⌘'],['rbac',t.rbac,'◇'],['registers',t.registers,'!'],['estimate',t.estimate,'◷'],['deliverables',t.deliverables,'⇩']];
  $('#nav').innerHTML=items.map(x=>`<button data-view="${x[0]}" class="${state.view===x[0]?'active':''}"><i>${x[2]}</i><span>${x[1]}</span></button>`).join('');
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render()});
}
function roleDemo(){
  const r=roles[state.role];
  return `<section class="panel">${head('INTERACTIVE',I18N[state.lang].role,'Switch perspective without changing platform or canonical records.','blue')}
  <div class="tabs">${Object.entries(roles).map(([k,v])=>`<button data-role="${k}" class="${state.role===k?'active':''}">${v.label}</button>`).join('')}</div>
  <div class="role-grid">
    <article><h3>${r.label}</h3><p>${r.tag}</p><div class="chips">${r.caps.map(x=>`<span>✓ ${x}</span>`).join('')}</div></article>
    <article class="record"><div class="record-title"><div><small>SAME CANONICAL APPOINTMENT</small><h3>${appt.id}</h3></div>${pill(appt.status,'green')}</div>
      <dl><div><dt>Patient</dt><dd>${appt.patient}</dd></div><div><dt>Doctor</dt><dd>${appt.doctor}</dd></div><div><dt>Facility</dt><dd>${appt.facility}</dd></div><div><dt>Time</dt><dd>${appt.date} · ${appt.time}</dd></div></dl>
      <p class="scope"><b>${r.label} projection:</b> same <code>appointment_id</code>; fields/actions filtered by permission and resource scope.</p>
    </article>
  </div></section>`;
}
function booking(){
  return `<section class="panel">${head('CONCURRENCY',I18N[state.lang].book,'Frontend availability is a projection. Booking authority exists only after backend/database commit.','red')}
  <div class="booking-grid">
    <div>${scenarios.map(x=>`<button class="scenario ${state.scenario===x[0]?'active':''}" data-scenario="${x[0]}"><b>${x[1]}</b><span>${x[2]}</span></button>`).join('')}</div>
    <div class="transaction">
      ${[['1','Authorize command','role + resource scope'],['2','Revalidate','affiliation + availability + lifecycle'],['3','Protect transaction','global Doctor overlap + capacity + idempotency'],['4','Commit','one Appointment + event/outbox'],['5','Async delivery','notifications only after commit']].map(x=>`<div><span>${x[0]}</span><p><b>${x[1]}</b><small>${x[2]}</small></p></div>`).join('')}
      <button id="run" class="primary">⚡ ${I18N[state.lang].attempt}</button>
      ${state.result?`<div class="outcome ${state.result.startsWith('409')?'bad':'good'}">${esc(state.result)}</div>`:''}
    </div>
  </div></section>`;
}
function affiliation(){
  const rows=[['Centre Médical Akwa','Douala','Mon / Wed / Fri','08:00–13:00','25,000 XAF'],['Clinique Bastos','Yaoundé','Tue / Thu','14:00–18:00','30,000 XAF']];
  return `<section class="panel">${head('FIRST-CLASS DOMAIN','Doctor-Facility affiliation','A Doctor can work with multiple facilities; contract and availability remain facility-specific.','purple')}
  <div class="aff-grid">${rows.map((x,i)=>`<article><div class="num">0${i+1}</div><h3>${x[0]}</h3><p>${x[1]}</p><dl><div><dt>Working days</dt><dd>${x[2]}</dd></div><div><dt>Availability</dt><dd>${x[3]}</dd></div><div><dt>Consultation fee</dt><dd>${x[4]}</dd></div></dl></article>`).join('')}</div></section>`;
}
function architecture(){
  return `<section class="panel">${head('NON-NEGOTIABLE','ONE Medidocta platform','Authentication establishes identity; server context resolves role, permissions and resource scope before interface access.')}
  <div class="flow">${['Authentication','Role context','Permissions','Resource scope','Appropriate interface'].map((x,i)=>`<article><span>${i+1}</span><b>${x}</b></article>`).join('<i>›</i>')}</div>
  <div class="principles">${principles.map(x=>`<article><small>${x[0]}</small><b>${x[1]}</b><p>${x[2]}</p></article>`).join('')}</div></section>`;
}
function rbacView(){
  return `<section class="panel">${head('ROLE → PERMISSION → SCOPE','RBAC & resource scope','A role grants capability; scope determines which concrete resources that capability can touch.','blue')}
  <div class="table-wrap"><table><thead><tr><th>Role</th><th>Resource</th><th>Capability</th><th>Scope</th></tr></thead><tbody>${rbac.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}
function registers(){
  return `<section class="panel">${head('REVIEW CONTROL','Gap & decision registers','Unresolved behavior is explicit. The review does not silently invent business rules.','orange')}
  <h3 class="sub">Figma validation priorities</h3><div class="register">${gaps.map(x=>`<article>${pill(x[0],x[0]==='BLOCKER'?'red':x[0]==='HIGH'?'orange':'blue')}<div><b>${x[1]}</b><p>${x[2]}</p></div></article>`).join('')}</div>
  <h3 class="sub">PRODUCT DECISION REQUIRED</h3><div class="register">${decisions.map(x=>`<article>${pill(x[0],'orange')}<div><b>${x[1]}</b><p>PRODUCT DECISION REQUIRED</p></div></article>`).join('')}</div></section>`;
}
function estimate(){
  const rows=[['Base engineering','3,440 h'],['Base estimated cost','CAD 262,725'],['+15% planning reserve','3,956 h'],['Reserved estimate','CAD 302,133.75'],['Implementation plan','26 weeks'],['Schedule reserve','+2 weeks']];
  return `<section class="panel">${head('PLANNING ENVELOPE','Full MVP development estimate','Summary of the editable milestone estimate in the formal handover.','green')}<div class="metrics">${rows.map(x=>`<article><span>${x[0]}</span><b>${x[1]}</b></article>`).join('')}</div></section>`;
}
function downloads(){
  const d=[['Master technical review','public/deliverables/Medidocta_Technical_Review_Source.md'],['Architecture principles','public/deliverables/registers/Architecture_Principles.csv'],['RBAC matrix','public/deliverables/registers/RBAC_Matrix.csv'],['Workflow wiring map','public/deliverables/registers/Workflow_Wiring_Map.csv'],['Decision register','public/deliverables/registers/Decision_Register.csv'],['Concurrency tests','public/deliverables/registers/Concurrency_Test_Matrix.csv'],['Platform diagram source','public/deliverables/diagrams/platform-architecture.mmd'],['Release QA','public/deliverables/RELEASE_QA.md']];
  return `<section class="panel">${head('HANDOVER','Editable client deliverables','Repository-native source artifacts accompany the formal DOCX/PDF/XLSX handover.')}<div class="downloads">${d.map(x=>`<a href="${x[1]}" target="_blank">⇩ <span>${x[0]}</span><b>›</b></a>`).join('')}</div><div class="boundary"><b>Demo boundary</b><p>No real patient data, production authentication, persistence, notifications or compliance operations are represented as implemented.</p></div></section>`;
}
function wire(){
  document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{state.role=b.dataset.role;content()});
  document.querySelectorAll('[data-scenario]').forEach(b=>b.onclick=()=>{state.scenario=b.dataset.scenario;state.result='';content()});
  const r=$('#run'); if(r) r.onclick=()=>{state.result=scenarios.find(x=>x[0]===state.scenario)[2];content()};
}
function content(){
  let h='';
  if(state.view==='overview') h=roleDemo()+booking()+affiliation();
  if(state.view==='architecture') h=architecture()+affiliation();
  if(state.view==='rbac') h=rbacView();
  if(state.view==='registers') h=registers();
  if(state.view==='estimate') h=estimate();
  if(state.view==='deliverables') h=downloads();
  $('#content').innerHTML=h; wire();
}
function translate(){
  const t=I18N[state.lang]; document.documentElement.lang=state.lang;
  $('[data-i18n="title"]').textContent=t.title; $('[data-i18n="sub"]').textContent=t.sub; $('[data-i18n="notice"]').textContent=t.notice;
  $('#langBtn').textContent=state.lang==='en'?'FR':'EN';
}
function render(){translate();nav();content()}
$('#langBtn').onclick=()=>{state.lang=state.lang==='en'?'fr':'en';render()};
render();
