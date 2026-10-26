(function(){
const B='https://unnatividya.com';
const UNIS={
 muj:{id:'muj',name:'Manipal University Jaipur',short:'MUJ',slug:'manipal-university-jaipur',loc:'Jaipur, Rajasthan',est:2011,rating:4.7,reviews:'3,240',learners:'52,000+',placement:88,avg:'₹7.2 LPA',avgN:7.2,high:'₹24 LPA',partners:'320+',feeFrom:'₹75,000',approvals:['UGC-entitled','NAAC A+','AICTE','WES recognised'],
  about:'Manipal University Jaipur is part of the Manipal education ecosystem and offers UGC-entitled online degrees for learners who need flexible study without leaving work or family commitments.',
  about2:'The current official Online Manipal pages highlight NAAC A+ accreditation, online proctored exams, digital learning support, placement assistance, and scholarship/EMI options for eligible learners.'},
 smu:{id:'smu',name:'Sikkim Manipal University',short:'SMU',slug:'sikkim-manipal-university',loc:'Gangtok, Sikkim',est:1995,rating:4.5,reviews:'2,180',learners:'—',placement:81,avg:'₹5.1 LPA',avgN:5.1,high:'—',partners:'—',feeFrom:'₹55,000',approvals:['UGC-entitled','NAAC A+','AIU member'],
  about:'Sikkim Manipal University offers UGC-entitled online degrees across management, commerce, IT and humanities, with some of the lowest listed tuition in our catalog.',about2:''},
 amity:{id:'amity',name:'Amity University Online',short:'Amity',slug:'amity-online',loc:'Noida, Uttar Pradesh',est:2005,rating:4.4,reviews:'5,960',learners:'—',placement:84,avg:'₹6.5 LPA',avgN:6.5,high:'—',partners:'—',feeFrom:'₹99,000',approvals:['UGC-entitled','NAAC A+','WES recognised','QS ranked'],
  about:'Amity University Online offers UGC-entitled online degrees across management, IT, commerce and humanities, with WES recognition and the widest program range of the three.',about2:''}
};
const RAW=[
 ['bcom-smu','B.Com','smu','UG','Commerce',75000,36,2083,4.4,350,''],
 ['bcom-muj','B.Com','muj','UG','Commerce',99000,36,2750,4.5,480,'Accounting with AI|Banking & FinTech|Business Accounting & Taxation|Business Analytics'],
 ['bcom-amity','B.Com','amity','UG','Commerce',115000,36,4792,4.4,760,'International Finance & Accounting'],
 ['bcomh-amity','B.Com Honours','amity','UG','Commerce',175000,36,7292,4.3,240,'International Business|Business Data Processing|Marketing Management|HRM'],
 ['ba-smu','BA','smu','UG','Arts & Humanities',75000,36,2083,4.4,310,'English|Political Science|Sociology'],
 ['ba-amity','BA','amity','UG','Arts & Humanities',115000,36,4792,4.3,260,'Sociology|Political Science|English|Economics'],
 ['bajmc-amity','BA JMC','amity','UG','Arts & Humanities',190000,36,7917,4.3,190,''],
 ['bba-smu','BBA','smu','UG','Management',90000,36,2500,4.6,420,'Business Analytics & FinTech|Entrepreneurship|Operations & Supply Chain Management|Banking & Insurance'],
 ['bba-muj','BBA','muj','UG','Management',139500,36,3875,4.6,640,'Human Resource Management|Marketing|Finance & Accounting|Entrepreneurship Management & Family Business'],
 ['bba-amity','BBA','amity','UG','Management',199000,36,8292,4.3,910,'Data Analytics|Travel and Tourism Management'],
 ['bca-muj','BCA','muj','UG','IT & Computers',139500,36,3875,4.6,730,'Data Science & Analytics|Cloud Computing|Cybersecurity'],
 ['bca-amity','BCA','amity','UG','IT & Computers',175000,36,7292,4.3,820,'Fintech & AI|Data Engineering|Software Engineering|Data Analytics'],
 ['mcom-smu','M.Com','smu','PG','Commerce',75000,24,3125,4.4,260,'Finance|Marketing'],
 ['mcom-muj','M.Com','muj','PG','Commerce',108000,24,4500,4.6,290,''],
 ['mcom-amity','M.Com','amity','PG','Commerce',150000,24,6250,4.4,310,'Financial Management|Financial Technology'],
 ['maeco-muj','MA Economics','muj','PG','Arts & Humanities',80000,24,3333,4.2,170,''],
 ['maeng-smu','MA English','smu','PG','Arts & Humanities',75000,24,3125,4.4,210,''],
 ['majmc-muj','MA JMC','muj','PG','Arts & Humanities',80000,24,3333,4.5,220,''],
 ['majmc-amity','MA JMC','amity','PG','Arts & Humanities',130000,24,5417,4.3,240,'Journalism & Mass Communication'],
 ['mapol-smu','MA Political Science','smu','PG','Arts & Humanities',75000,24,3125,4.4,190,''],
 ['mapp-amity','MA Public Policy & Governance','amity','PG','Arts & Humanities',150000,24,6250,4.2,110,'Leadership and Administrative Thinkers|Economics and Public Policy|Urban and Rural Development in India'],
 ['masoc-smu','MA Sociology','smu','PG','Arts & Humanities',75000,24,3125,4.5,180,''],
 ['mba-smu','MBA','smu','PG','Management',120000,24,4583,4.5,860,'Marketing|Finance|HR|Systems'],
 ['mba-muj','MBA','muj','PG','Management',180000,24,7500,4.7,1420,'Finance|Marketing|Human Resource Management|Analytics & Data Science|Operations Management|IT & FinTech|Information System Management|Project Management|International Business|Supply Chain Management|BFSI|Retail Management|Digital Marketing'],
 ['mba-amity','MBA','amity','PG','Management',225000,24,9375,4.4,2210,'Business Analytics|Data Science|Digital Marketing Management|Entrepreneurship and Leadership Management'],
 ['mca-smu','MCA','smu','PG','IT & Computers',110000,24,4083,4.6,410,'AI & Machine Learning|Data Science|Cloud Computing|Cyber Security'],
 ['mca-muj','MCA','muj','PG','IT & Computers',158000,24,6583,4.7,560,'AI and Data Science|Cloud Computing|Cybersecurity|Comprehensive Emerging Technologies'],
 ['mca-amity','MCA','amity','PG','IT & Computers',199000,24,8292,4.4,690,'Fintech & AI|Machine Learning & Artificial Intelligence|Cyber Security|Software Engineering'],
 ['mscds-amity','MSc Data Science','amity','PG','IT & Computers',275000,24,11458,4.4,150,''],
 ['mscmath-muj','MSc Mathematics','muj','PG','IT & Computers',80000,24,3333,4.6,130,'Mathematics|Data Science|Computational Science|Econometrics']
];
const ICON={'Management':'business_center','IT & Computers':'computer','Commerce':'account_balance','Arts & Humanities':'auto_stories'};
const C=RAW.map(([id,short,uni,lvl,stream,fee,months,emi,rating,reviews,specs])=>({id,short,title:'Online '+short,uni,lvl,stream,fee,months,emi,rating,reviews,icon:ICON[stream],specs:specs?specs.split('|'):['General']}));
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const slugify=s=>s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// specializations: degree + spec name
const SPECS={};
C.forEach(c=>c.specs.forEach(s=>{ if(s==='General')return; const key=slugify(c.short+'-'+s); (SPECS[key]=SPECS[key]||{key,name:s,degree:c.short,stream:c.stream,lvl:c.lvl,icon:c.icon,courses:[]}).courses.push(c.id); }));
const store={
 get(k){try{return JSON.parse(localStorage.getItem('uv_'+k))}catch(e){return null}},
 set(k,v){try{localStorage.setItem('uv_'+k,JSON.stringify(v))}catch(e){} window.dispatchEvent(new Event('uv-store'));},
 saved(){return store.get('saved')||[]}, compare(){return store.get('compare')||['mba-muj','mba-smu','mba-amity']},
 toggleSaved(id){const s=store.saved();store.set('saved',s.includes(id)?s.filter(x=>x!==id):[...s,id]);},
 toggleCompare(id){const c=store.compare();store.set('compare',c.includes(id)?c.filter(x=>x!==id):(c.length>=3?[...c.slice(1),id]:[...c,id]));}
};
const GUIDES=[
 {slug:'mba-fees',cat:'Fees',title:'Online MBA fees compared across 3 universities',read:'6 min',desc:'Total tuition, semester fees and EMI for MUJ, SMU and Amity, side by side.',degree:'MBA'},
 {slug:'mba-eligibility',cat:'Eligibility',title:'Online MBA eligibility across universities',read:'5 min',desc:'Minimum marks, reserved-category relaxations and what documents you need.',degree:'MBA'},
 {slug:'mba-career-scope',cat:'Careers',title:'Online MBA career scope, by university',read:'7 min',desc:'Roles, salary ranges and placement-assistance records for each program.',degree:'MBA'},
 {slug:'mba-ugc-approval',cat:'Approvals',title:'Is Online MBA UGC approved?',read:'4 min',desc:'What UGC-DEB entitlement means and how to check it yourself.',degree:'MBA'},
 {slug:'mca-fees',cat:'Fees',title:'Online MCA fees compared across 3 universities',read:'5 min',desc:'Tuition, duration and EMI for every MCA we list.',degree:'MCA'},
 {slug:'bca-fees',cat:'Fees',title:'Online BCA fees compared across universities',read:'4 min',desc:'MUJ and Amity BCA tuition, specialisations and financing.',degree:'BCA'}
];
const FAQ_GENERAL=[
 ['Are online degrees valid for government jobs?','Yes. UGC-entitled online degrees are legally equivalent to on-campus degrees for government jobs, PSU recruitment and higher studies.'],
 ['Is counselling really free?','Yes — universities compensate us equally, so counselling costs you nothing and our advice carries no commission bias.'],
 ['Can I pay via EMI?','Every listed program offers no-cost EMI through education loan partners, plus semester-wise payment options.'],
 ['How do you verify fees and approvals?',"We check every fee, approval and admission date against the university's own published pages each admission cycle, and flag anything we can't independently confirm."],
 ['Will my certificate say "online"?','No. A UGC-entitled online degree carries the same certificate as the on-campus program — there is no "online" marking that affects how employers or government bodies treat it.'],
 ['How can I speak to an expert?','Call 1800-120-4050 or request a callback. A counsellor will call you, usually within one working day.']
];
const ADMISSION=[
 {n:1,icon:'edit_document',t:'Application',d:'Fill basic, education, and work-experience details and pay the application fee.'},
 {n:2,icon:'payments',t:'Fee payment',d:'Pay first semester/year fee or full program fee through available payment/EMI options.'},
 {n:3,icon:'upload_file',t:'Document upload',d:'Upload academic documents, ID proof, and other requested records.'},
 {n:4,icon:'verified',t:'University approval',d:'The university evaluates documents and confirms admission.'}
];
const P=(page,q)=>page+'.dc.html'+(q?'?'+q:'');
window.UV={B,UNIS,C,SPECS,GUIDES,FAQ_GENERAL,ADMISSION,inr,slugify,store,P,
 byId:id=>C.find(c=>c.id===id),
 logo:u=>`${B}/universities/${UNIS[u].slug}-logo.svg`,
 campus:u=>`${B}/universities/${UNIS[u].slug}-campus.webp`,
 q:k=>{try{return new URLSearchParams(location.search).get(k)}catch(e){return null}},
 card(c){const u=UNIS[c.uni];return {...c,uniName:u.name,uniShort:u.short,logo:`${B}/universities/${u.slug}-logo.svg`,campus:`${B}/universities/${u.slug}-campus.webp`,feeF:inr(c.fee),emiF:inr(c.emi)+'/mo',lvlLong:c.lvl==='PG'?'Postgraduate':'Undergraduate',specCount:c.specs[0]==='General'?'1 specialisation':c.specs.length+' specialisations',href:P('Course','id='+c.id),applyHref:P('Apply','course='+c.id)};}
};
// Scroll-entrance animation for page sections (skips hero/first screen, respects reduced motion)
(function(){
 if(window.__uvReveal)return; window.__uvReveal=true;
 if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const seen=new WeakSet();
 const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){const el=e.target;el.style.opacity='1';el.style.transform='none';io.unobserve(el);}}),{rootMargin:'0px 0px -8% 0px',threshold:0.06});
 const scan=()=>{document.querySelectorAll('main section, main > div > div[style*="border-radius"]').forEach(el=>{
   if(seen.has(el))return; seen.add(el);
   if(el.closest('header,footer')||el.parentElement.closest('main section'))return;
   const r=el.getBoundingClientRect(); if(r.top<window.innerHeight*0.9)return;
   el.style.opacity='0';el.style.transform='translateY(24px)';el.style.transition='opacity .6s cubic-bezier(.2,.7,.2,1), transform .6s cubic-bezier(.2,.7,.2,1)';io.observe(el);});};
 const start=()=>{scan();new MutationObserver(()=>{clearTimeout(window.__uvRT);window.__uvRT=setTimeout(scan,80);}).observe(document.body,{childList:true,subtree:true});};
 if(document.body)setTimeout(start,250);else addEventListener('DOMContentLoaded',()=>setTimeout(start,250));
})();
})();
