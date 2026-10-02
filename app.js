const $=selector=>document.querySelector(selector);
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

const COPY={
  en:{
    ui:{
      skip:'Skip to main content',menu:'Menu',brandSub:'Architecture demonstrator',
      notice:'Technical review demo - not a production MVP',onePlatform:'ONE PLATFORM',
      africaReady:'Cameroon → Africa-ready architecture',
      title:'One platform. One appointment. Permission-aware interfaces.',
      sub:'Interactive pre-development architecture & workflow demonstrator',
      canonicalData:'CANONICAL DATA',facilityScoped:'FACILITY-SCOPED',serverAuthority:'SERVER AUTHORITY',
      patient:'Patient',doctor:'Doctor',facility:'Facility',admin:'Admin',
      footerA:'Medidocta technical review demonstrator · client handover v1.1',
      footerB:'Interactive prototype only · no real patient data'
    },
    nav:[
      ['overview','Role perspective','▦'],['architecture','Architecture','⌘'],['rbac','RBAC','◇'],
      ['experience','Responsive + FR/EN','◫'],['registers','Review registers','!'],
      ['estimate','MVP estimate','◷'],['deliverables','Deliverables','⇩']
    ],
    common:{interactive:'INTERACTIVE',sameAppointment:'SAME CANONICAL APPOINTMENT',projection:'projection',
      rolePerspective:'Role perspective',switchPerspective:'Switch perspective without changing platform, account or canonical records.',
      concurrency:'CONCURRENCY',bookingConcurrency:'Booking concurrency',
      bookingDesc:'Frontend availability is a projection. Booking authority exists only after backend/database commit.',
      attempt:'Attempt booking',firstClass:'FIRST-CLASS DOMAIN',affiliation:'Doctor-Facility affiliation',
      affiliationDesc:'A Doctor can work with multiple facilities; contract and availability remain facility-specific.',
      workingDays:'Working days',availability:'Availability',fee:'Consultation fee',
      nonNegotiable:'NON-NEGOTIABLE',platform:'ONE Medidocta platform',
      platformDesc:'Authentication establishes identity; server context resolves role, permissions and resource scope before interface access.',
      rbacBadge:'ROLE → PERMISSION → SCOPE',rbacTitle:'RBAC & resource scope',
      rbacDesc:'A role grants capability; scope determines which concrete resources that capability can touch.',
      role:'Role',resource:'Resource',capability:'Capability',scope:'Scope',
      reviewControl:'REVIEW CONTROL',gapTitle:'Gap & decision registers',
      gapDesc:'Unresolved behavior is explicit. The review does not silently invent business rules.',
      figmaPriorities:'Figma validation priorities',productDecision:'PRODUCT DECISION REQUIRED',
      planning:'PLANNING ENVELOPE',estimateTitle:'Full MVP development estimate',
      estimateDesc:'Summary of the editable milestone estimate in the formal handover.',
      handover:'HANDOVER',deliverablesTitle:'Editable client deliverables',
      deliverablesDesc:'Repository-native source artifacts accompany the formal DOCX/PDF/XLSX handover.',
      boundary:'Demo boundary',boundaryText:'No real patient data, production authentication, provider notifications or compliance operations are represented as implemented.',
      experienceBadge:'ONE SHELL · TWO LOCALES',experienceTitle:'Responsive + FR/EN application contract',
      experienceDesc:'Phone, tablet and desktop change layout density only. Locale changes presentation only. Canonical IDs, permissions and APIs stay the same.',
      machineCode:'Stable machine code',localizedCopy:'Localized user copy',
      canonicalRule:'Canonical rule',accessibility:'Accessibility hardening'
    },
    roles:{
      patient:{label:'Patient',tag:'Search, book and manage appointments',caps:['Search published doctors and facilities','Read bookable availability projection','Create appointment','Read own appointment','Request cancel/reschedule*']},
      doctor:{label:'Doctor',tag:'Professional profile, affiliations and facility-specific availability',caps:['Manage own professional profile','Read/respond to affiliations*','Manage affiliation-scoped availability','Read own appointments','Progress consultation workflow*']},
      facility:{label:'Healthcare Facility',tag:'Facility operations, staff, rooms and appointments',caps:['Manage facility profile','Manage scoped staff permissions*','Manage Doctor affiliations*','Read/manage facility appointments','Reception and room operations*']},
      admin:{label:'Medidocta Admin',tag:'Privileged oversight of the same canonical domain records',caps:['Verification review*','Operational oversight','Permissioned appointment support','Audit history','Platform settings*']}
    },
    appointment:{patient:'Patient',doctor:'Doctor',facility:'Facility',time:'Time',status:'Confirmed · demo',
      projectionText:'same appointment_id; fields/actions filtered by permission and resource scope.'},
    principles:[
      ['AP-001','ONE platform, not three products','One responsive client and one backend domain model.'],
      ['AP-002','Authentication → Role → Permission → Interface','Protected routes depend on server-resolved context.'],
      ['AP-003','Same account and canonical data on every device','No device-specific business-data copies.'],
      ['AP-004','ONE canonical Appointment','Role-specific views reference the same appointment_id.'],
      ['AP-005','Doctor-Facility Affiliation is first-class','Contracts, terms and availability are scoped to affiliation.'],
      ['AP-006','Doctor occupancy is global across facilities','Overlapping booking is blocked regardless of facility.'],
      ['AP-008','Frontend availability is not authoritative','Create/reschedule revalidates inside a DB transaction.'],
      ['AP-009','Canonical codes, localized presentation','FR/EN labels never duplicate business records.']
    ],
    rbac:[
      ['Patient','Appointment','create / read / cancel / reschedule*','Own/approved subject appointments'],
      ['Doctor','Availability','read / update','Own Doctor-Facility affiliation'],
      ['Doctor','Appointment','read / lifecycle commands*','Appointments where Doctor is party'],
      ['Facility receptionist','Appointment operations','read / arrival / room assignment*','Own facility only'],
      ['Facility finance','Contract / financial terms','read / respond*','Own facility + financial permission'],
      ['Facility admin','Staff membership','invite / role assignment*','Own facility only'],
      ['Medidocta verifier','Verification cases','review / decide*','Assigned/platform verification scope'],
      ['Medidocta admin','Canonical domain resources','privileged support / oversight','Policy-limited internal scope']
    ],
    gaps:[
      ['BLOCKER','Cross-role appointment identity','Confirm every role screen uses the same canonical appointment and lifecycle.'],
      ['BLOCKER','Booking concurrency UX','Define conflict, retry and stale-slot handling after backend rejection.'],
      ['HIGH','Doctor multi-facility context','Keep facility context visible while editing terms and availability.'],
      ['HIGH','Cancellation / rescheduling','Verify permissions, state transitions, conflicts and notification consequences.'],
      ['HIGH','Booking for another person','Define actor vs appointment subject and consent/history ownership.'],
      ['MEDIUM','Responsive dense calendars','Validate mobile agenda and tablet/desktop calendar behaviors.'],
      ['MEDIUM','FR/EN content expansion','Validate French labels, wrapping, validation and empty/error states.']
    ],
    decisions:[
      ['DR-001','Can one account hold multiple top-level roles?'],['DR-003','Exact booking-for-another-person subject/consent model'],
      ['DR-004','Final appointment lifecycle and permitted actors'],['DR-007','Availability rule ownership and edit authority'],
      ['DR-009','Capacity semantics beyond Doctor occupancy'],['DR-012','Timezone policy for Cameroon and expansion markets'],
      ['DR-016','Facility staff role catalog / custom bundles']
    ],
    scenarios:[
      ['same','Two patients / same Doctor interval','409 BOOKING_CONFLICT','The backend rejects the second overlapping booking.'],
      ['cross','Same Doctor / different facilities','409 BOOKING_CONFLICT','Global Doctor occupancy rejects the cross-facility overlap.'],
      ['open','Open interval','201 APPOINTMENT_COMMITTED','One canonical Appointment is committed.'],
      ['retry','Network retry / same idempotency key','200 IDEMPOTENT_REPLAY','The original result is replayed; no duplicate Appointment is created.']
    ],
    transaction:[
      ['Authorize command','role + resource scope'],['Revalidate','affiliation + availability + lifecycle'],
      ['Protect transaction','global Doctor overlap + capacity + idempotency'],['Commit','one Appointment + event/outbox'],
      ['Async delivery','notifications only after commit']
    ],
    affiliations:[
      ['Centre Médical Akwa','Douala','Mon / Wed / Fri','08:00–13:00','25,000 XAF'],
      ['Clinique Bastos','Yaoundé','Tue / Thu','14:00–18:00','30,000 XAF']
    ],
    flow:['Authentication','Role context','Permissions','Resource scope','Appropriate interface'],
    responsive:[
      ['PHONE','Stacked / agenda-first','Drawer navigation, card results, focused booking review, agenda-first calendars.'],
      ['TABLET','Hybrid split views','Adaptive rail/drawer, split filters/results, calendar/list hybrid.'],
      ['DESKTOP','Dense operational views','Persistent navigation, filter rails, dense calendars/tables and side panels.']
    ],
    responsiveBullets:[
      ['Same account and canonical IDs','Same /v1 APIs','Booking writes stay online/server-authoritative'],
      ['Same permissions/resource scope','Layout adapts to available space','No tablet-specific business database'],
      ['Same Appointment resource','Higher information density','No desktop-only source of truth']
    ],
    localeDemo:{
      code:'409 BOOKING_CONFLICT',
      text:'This slot is no longer available. Refresh availability and try again.',
      rule:'The machine code remains BOOKING_CONFLICT in every locale; only user-facing presentation changes.',
      a11y:'Keyboard focus, skip navigation, visible focus rings, 44px mobile targets, semantic tables/tabs and reduced-motion support.'
    },
    estimate:[['Base engineering','3,440 h'],['Base estimated cost','CAD 262,725'],['+15% planning reserve','3,956 h'],['Reserved estimate','CAD 302,133.75'],['Implementation plan','26 weeks'],['Schedule reserve','+2 weeks']],
    downloads:[['Master technical review','public/deliverables/Medidocta_Technical_Review_Source.md'],['Architecture principles','public/deliverables/registers/Architecture_Principles.csv'],['RBAC matrix','public/deliverables/registers/RBAC_Matrix.csv'],['Workflow wiring map','public/deliverables/registers/Workflow_Wiring_Map.csv'],['Decision register','public/deliverables/registers/Decision_Register.csv'],['Concurrency tests','public/deliverables/registers/Concurrency_Test_Matrix.csv'],['Responsive matrix','public/deliverables/registers/Responsive_Matrix.csv'],['Localization matrix','public/deliverables/registers/Localization_Matrix.csv'],['Release QA','public/deliverables/RELEASE_QA.md']]
  },
  fr:{
    ui:{
      skip:'Aller au contenu principal',menu:'Menu',brandSub:'Démonstrateur d’architecture',
      notice:'Démo de revue technique - pas un MVP en production',onePlatform:'UNE PLATEFORME',
      africaReady:'Cameroun → architecture prête pour l’Afrique',
      title:'Une plateforme. Un rendez-vous. Des interfaces selon les permissions.',
      sub:'Démonstrateur interactif d’architecture et de flux pré-développement',
      canonicalData:'DONNÉES CANONIQUES',facilityScoped:'PORTÉE ÉTABLISSEMENT',serverAuthority:'AUTORITÉ SERVEUR',
      patient:'Patient',doctor:'Médecin',facility:'Établissement',admin:'Admin',
      footerA:'Démonstrateur de revue technique Medidocta · remise client v1.1',
      footerB:'Prototype interactif uniquement · aucune donnée patient réelle'
    },
    nav:[
      ['overview','Perspective du rôle','▦'],['architecture','Architecture','⌘'],['rbac','RBAC','◇'],
      ['experience','Responsive + FR/EN','◫'],['registers','Registres de revue','!'],
      ['estimate','Estimation MVP','◷'],['deliverables','Livrables','⇩']
    ],
    common:{interactive:'INTERACTIF',sameAppointment:'MÊME RENDEZ-VOUS CANONIQUE',projection:'projection',
      rolePerspective:'Perspective du rôle',switchPerspective:'Changez de perspective sans changer de plateforme, de compte ni d’enregistrements canoniques.',
      concurrency:'CONCURRENCE',bookingConcurrency:'Concurrence de réservation',
      bookingDesc:'La disponibilité affichée est une projection. L’autorité de réservation n’existe qu’après validation et commit côté serveur/base de données.',
      attempt:'Tenter la réservation',firstClass:'DOMAINE DE PREMIER NIVEAU',affiliation:'Affiliation Médecin-Établissement',
      affiliationDesc:'Un médecin peut travailler avec plusieurs établissements ; contrat et disponibilité restent propres à chaque établissement.',
      workingDays:'Jours de travail',availability:'Disponibilité',fee:'Tarif de consultation',
      nonNegotiable:'NON NÉGOCIABLE',platform:'UNE plateforme Medidocta',
      platformDesc:'L’authentification établit l’identité ; le contexte serveur résout rôle, permissions et portée des ressources avant l’accès à l’interface.',
      rbacBadge:'RÔLE → PERMISSION → PORTÉE',rbacTitle:'RBAC et portée des ressources',
      rbacDesc:'Un rôle accorde une capacité ; la portée détermine les ressources concrètes concernées.',
      role:'Rôle',resource:'Ressource',capability:'Capacité',scope:'Portée',
      reviewControl:'CONTRÔLE DE REVUE',gapTitle:'Registres des écarts et décisions',
      gapDesc:'Les comportements non résolus restent explicites. La revue n’invente pas silencieusement de règles métier.',
      figmaPriorities:'Priorités de validation Figma',productDecision:'DÉCISION PRODUIT REQUISE',
      planning:'ENVELOPPE DE PLANIFICATION',estimateTitle:'Estimation complète du MVP',
      estimateDesc:'Résumé de l’estimation par jalons du dossier de remise modifiable.',
      handover:'REMISE',deliverablesTitle:'Livrables client modifiables',
      deliverablesDesc:'Les sources natives du dépôt accompagnent la remise formelle DOCX/PDF/XLSX.',
      boundary:'Limite de la démo',boundaryText:'Aucune donnée patient réelle, authentification de production, notification fournisseur ou opération de conformité n’est présentée comme implémentée.',
      experienceBadge:'UN SHELL · DEUX LANGUES',experienceTitle:'Contrat d’application responsive + FR/EN',
      experienceDesc:'Téléphone, tablette et bureau modifient uniquement la densité de mise en page. La langue modifie uniquement la présentation. IDs, permissions et APIs canoniques restent identiques.',
      machineCode:'Code machine stable',localizedCopy:'Texte utilisateur localisé',
      canonicalRule:'Règle canonique',accessibility:'Renforcement accessibilité'
    },
    roles:{
      patient:{label:'Patient',tag:'Rechercher, réserver et gérer les rendez-vous',caps:['Rechercher les médecins et établissements publiés','Lire la projection de disponibilité réservable','Créer un rendez-vous','Lire ses propres rendez-vous','Demander annulation/replanification*']},
      doctor:{label:'Médecin',tag:'Profil professionnel, affiliations et disponibilités par établissement',caps:['Gérer son profil professionnel','Lire/répondre aux affiliations*','Gérer la disponibilité de l’affiliation','Lire ses rendez-vous','Faire progresser le flux de consultation*']},
      facility:{label:'Établissement de santé',tag:'Opérations, équipe, salles et rendez-vous de l’établissement',caps:['Gérer le profil de l’établissement','Gérer les permissions d’équipe avec portée*','Gérer les affiliations des médecins*','Lire/gérer les rendez-vous de l’établissement','Opérations d’accueil et de salle*']},
      admin:{label:'Administration Medidocta',tag:'Supervision privilégiée des mêmes enregistrements canoniques',caps:['Revue de vérification*','Supervision opérationnelle','Support rendez-vous autorisé','Historique d’audit','Paramètres plateforme*']}
    },
    appointment:{patient:'Patient',doctor:'Médecin',facility:'Établissement',time:'Horaire',status:'Confirmé · démo',
      projectionText:'même appointment_id ; champs/actions filtrés par permission et portée de ressource.'},
    principles:[
      ['AP-001','UNE plateforme, pas trois produits','Un client responsive et un seul modèle de domaine backend.'],
      ['AP-002','Authentification → Rôle → Permission → Interface','Les routes protégées dépendent du contexte résolu par le serveur.'],
      ['AP-003','Même compte et mêmes données sur tous les appareils','Aucune copie métier spécifique à un appareil.'],
      ['AP-004','UN rendez-vous canonique','Les vues de rôle référencent le même appointment_id.'],
      ['AP-005','Affiliation Médecin-Établissement de premier niveau','Contrats, conditions et disponibilité sont rattachés à l’affiliation.'],
      ['AP-006','Occupation du médecin globale entre établissements','Les chevauchements sont bloqués quel que soit l’établissement.'],
      ['AP-008','La disponibilité frontend ne fait pas autorité','Création/replanification revalidée dans une transaction base de données.'],
      ['AP-009','Codes canoniques, présentation localisée','Les libellés FR/EN ne dupliquent jamais les données métier.']
    ],
    rbac:[
      ['Patient','Rendez-vous','créer / lire / annuler / replanifier*','Ses rendez-vous / sujet approuvé'],
      ['Médecin','Disponibilité','lire / mettre à jour','Sa propre affiliation Médecin-Établissement'],
      ['Médecin','Rendez-vous','lire / commandes de cycle*','Rendez-vous où le médecin est partie'],
      ['Accueil établissement','Opérations rendez-vous','lire / arrivée / affectation salle*','Son établissement uniquement'],
      ['Finance établissement','Contrat / conditions financières','lire / répondre*','Son établissement + permission financière'],
      ['Admin établissement','Adhésion équipe','inviter / attribuer rôle*','Son établissement uniquement'],
      ['Vérificateur Medidocta','Dossiers de vérification','examiner / décider*','Portée assignée/plateforme'],
      ['Admin Medidocta','Ressources canoniques','support privilégié / supervision','Portée interne limitée par politique']
    ],
    gaps:[
      ['BLOQUANT','Identité du rendez-vous entre rôles','Confirmer que chaque écran de rôle utilise le même rendez-vous canonique et le même cycle.'],
      ['BLOQUANT','UX de concurrence de réservation','Définir conflit, réessai et créneau obsolète après rejet backend.'],
      ['HAUT','Contexte multi-établissements du médecin','Garder l’établissement visible pendant l’édition des conditions et disponibilités.'],
      ['HAUT','Annulation / replanification','Vérifier permissions, transitions, conflits et conséquences de notification.'],
      ['HAUT','Réservation pour une autre personne','Définir acteur, sujet du rendez-vous, consentement et propriété de l’historique.'],
      ['MOYEN','Calendriers denses responsive','Valider agenda mobile et comportements calendrier tablette/bureau.'],
      ['MOYEN','Expansion du contenu FR/EN','Valider libellés français, retour à la ligne, validations et états vide/erreur.']
    ],
    decisions:[
      ['DR-001','Un compte peut-il porter plusieurs rôles de premier niveau ?'],['DR-003','Modèle exact sujet/consentement pour réserver pour autrui'],
      ['DR-004','Cycle final du rendez-vous et acteurs autorisés'],['DR-007','Propriété des règles de disponibilité et autorité de modification'],
      ['DR-009','Sémantique de capacité au-delà de l’occupation du médecin'],['DR-012','Politique de fuseau horaire pour le Cameroun et les marchés futurs'],
      ['DR-016','Catalogue de rôles équipe établissement / bundles personnalisés']
    ],
    scenarios:[
      ['same','Deux patients / même intervalle médecin','409 BOOKING_CONFLICT','Le backend rejette la seconde réservation en chevauchement.'],
      ['cross','Même médecin / établissements différents','409 BOOKING_CONFLICT','L’occupation globale du médecin rejette le chevauchement entre établissements.'],
      ['open','Intervalle libre','201 APPOINTMENT_COMMITTED','Un seul rendez-vous canonique est validé.'],
      ['retry','Réessai réseau / même clé d’idempotence','200 IDEMPOTENT_REPLAY','Le résultat initial est rejoué ; aucun rendez-vous en double n’est créé.']
    ],
    transaction:[
      ['Autoriser la commande','rôle + portée ressource'],['Revalider','affiliation + disponibilité + cycle'],
      ['Protéger la transaction','chevauchement global médecin + capacité + idempotence'],['Valider','un rendez-vous + événement/outbox'],
      ['Livraison asynchrone','notifications uniquement après commit']
    ],
    affiliations:[
      ['Centre Médical Akwa','Douala','Lun / Mer / Ven','08:00–13:00','25 000 XAF'],
      ['Clinique Bastos','Yaoundé','Mar / Jeu','14:00–18:00','30 000 XAF']
    ],
    flow:['Authentification','Contexte de rôle','Permissions','Portée ressource','Interface appropriée'],
    responsive:[
      ['TÉLÉPHONE','Empilé / agenda en priorité','Navigation en tiroir, résultats en cartes, confirmation ciblée, calendriers agenda en priorité.'],
      ['TABLETTE','Vues hybrides divisées','Rail/tiroir adaptatif, filtres/résultats divisés, hybride calendrier/liste.'],
      ['BUREAU','Vues opérationnelles denses','Navigation persistante, filtres persistants, calendriers/tableaux denses et panneaux latéraux.']
    ],
    responsiveBullets:[
      ['Même compte et mêmes IDs canoniques','Mêmes APIs /v1','Écritures de réservation en ligne et autorité serveur'],
      ['Mêmes permissions/portée ressource','La mise en page s’adapte à l’espace','Aucune base métier spécifique tablette'],
      ['Même ressource Rendez-vous','Densité d’information supérieure','Aucune source de vérité réservée au bureau']
    ],
    localeDemo:{
      code:'409 BOOKING_CONFLICT',
      text:'Ce créneau n’est plus disponible. Actualisez les disponibilités et réessayez.',
      rule:'Le code machine reste BOOKING_CONFLICT dans toutes les langues ; seule la présentation utilisateur change.',
      a11y:'Navigation clavier, lien d’évitement, focus visible, cibles tactiles mobiles de 44 px, tableaux/onglets sémantiques et prise en charge de la réduction des mouvements.'
    },
    estimate:[['Ingénierie de base','3 440 h'],['Coût de base estimé','262 725 CAD'],['Réserve de planification +15 %','3 956 h'],['Estimation avec réserve','302 133,75 CAD'],['Plan d’implémentation','26 semaines'],['Réserve calendrier','+2 semaines']],
    downloads:[['Revue technique principale','public/deliverables/Medidocta_Technical_Review_Source.md'],['Principes d’architecture','public/deliverables/registers/Architecture_Principles.csv'],['Matrice RBAC','public/deliverables/registers/RBAC_Matrix.csv'],['Carte de câblage des flux','public/deliverables/registers/Workflow_Wiring_Map.csv'],['Registre des décisions','public/deliverables/registers/Decision_Register.csv'],['Tests de concurrence','public/deliverables/registers/Concurrency_Test_Matrix.csv'],['Matrice responsive','public/deliverables/registers/Responsive_Matrix.csv'],['Matrice de localisation','public/deliverables/registers/Localization_Matrix.csv'],['QA de release','public/deliverables/RELEASE_QA.md']]
  }
};

const APPOINTMENT={
  id:'APT-1042',
  patient:'Amina N.',
  doctor:'Dr. Etienne Mbarga',
  facility:'Centre Médical Akwa',
  startsAt:'2026-10-08T09:00:00Z',
  endsAt:'2026-10-08T09:30:00Z',
  timeZone:'Africa/Douala'
};

function initialLanguage(){
  const query=new URLSearchParams(location.search).get('lang');
  if(query&&['fr','en'].includes(query.toLowerCase())) return query.toLowerCase();
  try{
    const saved=localStorage.getItem('medidocta-demo-locale');
    if(['fr','en'].includes(saved)) return saved;
  }catch{}
  const browser=(navigator.languages||[navigator.language||'en']).map(x=>String(x).toLowerCase().split('-')[0]);
  return browser.includes('fr')?'fr':'en';
}

const validViews=new Set(['overview','architecture','rbac','experience','registers','estimate','deliverables']);
const hashView=location.hash.replace(/^#/,'');
let state={
  lang:initialLanguage(),
  view:validViews.has(hashView)?hashView:'overview',
  role:'patient',
  scenario:'cross',
  result:null
};

const copy=()=>COPY[state.lang];
const pill=(text,color='')=>`<span class="pill ${color}">${esc(text)}</span>`;
const head=(badge,title,desc,color='')=>`<div class="section-head"><div>${pill(badge,color)}<h2>${esc(title)}</h2><p>${esc(desc)}</p></div><b class="spark" aria-hidden="true">✦</b></div>`;

function localeTag(){return state.lang==='fr'?'fr-CM':'en-CM'}
function appointmentTime(){
  const start=new Date(APPOINTMENT.startsAt);
  const end=new Date(APPOINTMENT.endsAt);
  const date=new Intl.DateTimeFormat(localeTag(),{timeZone:APPOINTMENT.timeZone,dateStyle:'medium'}).format(start);
  const timeFormatter=new Intl.DateTimeFormat(localeTag(),{timeZone:APPOINTMENT.timeZone,hour:'2-digit',minute:'2-digit'});
  return `${date} · ${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
}

function nav(){
  $('#nav').innerHTML=copy().nav.map(([id,label,icon])=>`
    <button type="button" data-view="${id}" class="${state.view===id?'active':''}" ${state.view===id?'aria-current="page"':''}>
      <i aria-hidden="true">${icon}</i><span>${esc(label)}</span>
    </button>
  `).join('');
  document.querySelectorAll('[data-view]').forEach(button=>{
    button.onclick=()=>{
      state.view=button.dataset.view;
      location.hash=state.view;
      closeMenu();
      render();
      $('#mainContent').focus({preventScroll:true});
    };
  });
}

function roleDemo(){
  const c=copy();
  const role=c.roles[state.role];
  return `<section class="panel" aria-labelledby="role-title">${head(c.common.interactive,c.common.rolePerspective,c.common.switchPerspective,'blue')}
    <div class="tabs" role="tablist" aria-label="${esc(c.common.rolePerspective)}">
      ${Object.entries(c.roles).map(([key,value])=>`<button type="button" role="tab" data-role="${key}" class="${state.role===key?'active':''}" aria-selected="${state.role===key}">${esc(value.label)}</button>`).join('')}
    </div>
    <div class="role-grid">
      <article><h3 id="role-title">${esc(role.label)}</h3><p>${esc(role.tag)}</p><div class="chips">${role.caps.map(item=>`<span>✓ ${esc(item)}</span>`).join('')}</div></article>
      <article class="record">
        <div class="record-title"><div><small>${esc(c.common.sameAppointment)}</small><h3>${APPOINTMENT.id}</h3></div>${pill(c.appointment.status,'green')}</div>
        <dl>
          <div><dt>${esc(c.appointment.patient)}</dt><dd>${esc(APPOINTMENT.patient)}</dd></div>
          <div><dt>${esc(c.appointment.doctor)}</dt><dd>${esc(APPOINTMENT.doctor)}</dd></div>
          <div><dt>${esc(c.appointment.facility)}</dt><dd>${esc(APPOINTMENT.facility)}</dd></div>
          <div><dt>${esc(c.appointment.time)}</dt><dd>${esc(appointmentTime())}</dd></div>
        </dl>
        <p class="scope"><b>${esc(role.label)} ${esc(c.common.projection)}:</b> ${esc(c.appointment.projectionText)}</p>
      </article>
    </div>
  </section>`;
}

function booking(){
  const c=copy();
  return `<section class="panel" aria-labelledby="booking-title">${head(c.common.concurrency,c.common.bookingConcurrency,c.common.bookingDesc,'red')}
    <div class="booking-grid">
      <div role="group" aria-label="${esc(c.common.bookingConcurrency)}">
        ${c.scenarios.map(([id,label,code])=>`<button type="button" class="scenario ${state.scenario===id?'active':''}" data-scenario="${id}" aria-pressed="${state.scenario===id}"><b>${esc(label)}</b><span>${esc(code)}</span></button>`).join('')}
      </div>
      <div class="transaction" id="booking-title">
        ${c.transaction.map(([title,detail],index)=>`<div><span aria-hidden="true">${index+1}</span><p><b>${esc(title)}</b><small>${esc(detail)}</small></p></div>`).join('')}
        <button id="run" type="button" class="primary">⚡ ${esc(c.common.attempt)}</button>
        ${state.result?renderOutcome():''}
      </div>
    </div>
  </section>`;
}

function renderOutcome(){
  const scenario=copy().scenarios.find(item=>item[0]===state.result);
  if(!scenario) return '';
  const bad=scenario[2].startsWith('409');
  return `<div class="outcome ${bad?'bad':'good'}" role="status"><code>${esc(scenario[2])}</code>${esc(scenario[3])}</div>`;
}

function affiliation(){
  const c=copy();
  return `<section class="panel">${head(c.common.firstClass,c.common.affiliation,c.common.affiliationDesc,'purple')}
    <div class="aff-grid">${c.affiliations.map((row,index)=>`<article><div class="num">0${index+1}</div><h3>${esc(row[0])}</h3><p>${esc(row[1])}</p><dl>
      <div><dt>${esc(c.common.workingDays)}</dt><dd>${esc(row[2])}</dd></div>
      <div><dt>${esc(c.common.availability)}</dt><dd>${esc(row[3])}</dd></div>
      <div><dt>${esc(c.common.fee)}</dt><dd>${esc(row[4])}</dd></div>
    </dl></article>`).join('')}</div>
  </section>`;
}

function architecture(){
  const c=copy();
  return `<section class="panel">${head(c.common.nonNegotiable,c.common.platform,c.common.platformDesc)}
    <div class="flow" tabindex="0" aria-label="${esc(c.common.platform)}">${c.flow.map((label,index)=>`<article><span>${index+1}</span><b>${esc(label)}</b></article>${index<c.flow.length-1?'<i aria-hidden="true">›</i>':''}`).join('')}</div>
    <div class="principles">${c.principles.map(item=>`<article><small>${esc(item[0])}</small><b>${esc(item[1])}</b><p>${esc(item[2])}</p></article>`).join('')}</div>
  </section>`;
}

function rbacView(){
  const c=copy();
  return `<section class="panel">${head(c.common.rbacBadge,c.common.rbacTitle,c.common.rbacDesc,'blue')}
    <div class="table-wrap" tabindex="0"><table><caption>${esc(c.common.rbacTitle)}</caption><thead><tr>
      <th scope="col">${esc(c.common.role)}</th><th scope="col">${esc(c.common.resource)}</th><th scope="col">${esc(c.common.capability)}</th><th scope="col">${esc(c.common.scope)}</th>
    </tr></thead><tbody>${c.rbac.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  </section>`;
}

function experience(){
  const c=copy();
  return `<section class="panel">${head(c.common.experienceBadge,c.common.experienceTitle,c.common.experienceDesc,'green')}
    <div class="experience-grid">${c.responsive.map((card,index)=>`<article class="experience-card">${pill(card[0],index===0?'blue':index===1?'purple':'green')}<h3>${esc(card[1])}</h3><p>${esc(card[2])}</p><ul>${c.responsiveBullets[index].map(item=>`<li>${esc(item)}</li>`).join('')}</ul></article>`).join('')}</div>
    <div class="locale-demo">
      <article><small>${esc(c.common.machineCode)}</small><h3><code>${esc(c.localeDemo.code)}</code></h3><p><b>${esc(c.common.localizedCopy)}:</b> ${esc(c.localeDemo.text)}</p><p><b>${esc(c.common.canonicalRule)}:</b> ${esc(c.localeDemo.rule)}</p></article>
      <article><small>A11Y</small><h3>${esc(c.common.accessibility)}</h3><p>${esc(c.localeDemo.a11y)}</p></article>
    </div>
  </section>`;
}

function registers(){
  const c=copy();
  return `<section class="panel">${head(c.common.reviewControl,c.common.gapTitle,c.common.gapDesc,'orange')}
    <h3 class="sub">${esc(c.common.figmaPriorities)}</h3>
    <div class="register">${c.gaps.map(item=>`<article>${pill(item[0],/BLOCK|BLOQ/.test(item[0])?'red':/HIGH|HAUT/.test(item[0])?'orange':'blue')}<div><b>${esc(item[1])}</b><p>${esc(item[2])}</p></div></article>`).join('')}</div>
    <h3 class="sub">${esc(c.common.productDecision)}</h3>
    <div class="register">${c.decisions.map(item=>`<article>${pill(item[0],'orange')}<div><b>${esc(item[1])}</b><p>${esc(c.common.productDecision)}</p></div></article>`).join('')}</div>
  </section>`;
}

function estimate(){
  const c=copy();
  return `<section class="panel">${head(c.common.planning,c.common.estimateTitle,c.common.estimateDesc,'green')}<div class="metrics">${c.estimate.map(item=>`<article><span>${esc(item[0])}</span><b>${esc(item[1])}</b></article>`).join('')}</div></section>`;
}

function downloads(){
  const c=copy();
  return `<section class="panel">${head(c.common.handover,c.common.deliverablesTitle,c.common.deliverablesDesc)}
    <div class="downloads">${c.downloads.map(item=>`<a href="${esc(item[1])}" target="_blank" rel="noopener">⇩ <span>${esc(item[0])}</span><b aria-hidden="true">›</b></a>`).join('')}</div>
    <div class="boundary"><b>${esc(c.common.boundary)}</b><p>${esc(c.common.boundaryText)}</p></div>
  </section>`;
}

function content(){
  let html='';
  if(state.view==='overview') html=roleDemo()+booking()+affiliation();
  if(state.view==='architecture') html=architecture()+affiliation();
  if(state.view==='rbac') html=rbacView();
  if(state.view==='experience') html=experience();
  if(state.view==='registers') html=registers();
  if(state.view==='estimate') html=estimate();
  if(state.view==='deliverables') html=downloads();
  $('#content').innerHTML=html;
  wireContent();
}

function wireContent(){
  document.querySelectorAll('[data-role]').forEach(button=>{
    button.onclick=()=>{state.role=button.dataset.role;content()};
  });
  document.querySelectorAll('[data-scenario]').forEach(button=>{
    button.onclick=()=>{state.scenario=button.dataset.scenario;state.result=null;content()};
  });
  const run=$('#run');
  if(run) run.onclick=()=>{
    state.result=state.scenario;
    content();
    const scenario=copy().scenarios.find(item=>item[0]===state.result);
    $('#liveRegion').textContent=`${scenario[2]}. ${scenario[3]}`;
  };
}

function translateStatic(){
  const c=copy();
  document.documentElement.lang=state.lang;
  document.title=state.lang==='fr'
    ? 'Medidocta - Démonstrateur architecture & flux'
    : 'Medidocta - Architecture & Workflow Demonstrator';

  document.querySelectorAll('[data-i18n]').forEach(element=>{
    const key=element.dataset.i18n;
    if(Object.prototype.hasOwnProperty.call(c.ui,key)) element.textContent=c.ui[key];
  });

  const langBtn=$('#langBtn');
  langBtn.textContent=state.lang==='en'?'FR':'EN';
  langBtn.setAttribute('aria-label',state.lang==='en'?'Passer au français':'Switch to English');

  $('#menuBtn').setAttribute('aria-label',c.ui.menu);
  $('#navBackdrop').setAttribute('aria-label',state.lang==='fr'?'Fermer la navigation':'Close navigation');
}

function saveLanguage(){
  try{localStorage.setItem('medidocta-demo-locale',state.lang)}catch{}
}

function openMenu(){
  document.body.classList.add('nav-open');
  $('#menuBtn').setAttribute('aria-expanded','true');
  $('#navBackdrop').hidden=false;
}
function closeMenu(){
  document.body.classList.remove('nav-open');
  $('#menuBtn').setAttribute('aria-expanded','false');
  $('#navBackdrop').hidden=true;
}

function render(){
  translateStatic();
  nav();
  content();
}

$('#langBtn').onclick=()=>{
  state.lang=state.lang==='en'?'fr':'en';
  saveLanguage();
  render();
  $('#liveRegion').textContent=state.lang==='fr'?'Interface en français':'Interface in English';
};
$('#menuBtn').onclick=()=>document.body.classList.contains('nav-open')?closeMenu():openMenu();
$('#navBackdrop').onclick=closeMenu;
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body.classList.contains('nav-open')){
    closeMenu();
    $('#menuBtn').focus();
  }
});
window.addEventListener('hashchange',()=>{
  const next=location.hash.replace(/^#/,'');
  if(validViews.has(next)&&next!==state.view){
    state.view=next;
    render();
  }
});
window.addEventListener('resize',()=>{
  if(window.innerWidth>767) closeMenu();
});

render();
