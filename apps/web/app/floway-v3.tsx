'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Station={id:string;name:string;city:string;distanceKm:number;price:number;waitMin:number;detourMin:number;arrivalHour?:number;arrivalMinute?:number;serviceCategories?:string[];flowayContextScore?:number;smartContext?:{message:string}};
type RouteData={origin:{label:string};destination:{label:string};distanceKm:number;durationMin:number;stations:Station[];fuel:string};
type Filter='Tous'|'Restauration'|'Café'|'Boutique'|'Toilettes';

const serviceIcon=(s:string)=>s==='Restauration'?'🍴':s==='Café'?'☕':s==='Boutique'?'🛍':s==='Toilettes'?'🚻':s==='Recharge VE'?'⚡':'⛽';
const short=(s:string)=>s.split(',')[0];
const duration=(m=0)=>{const h=Math.floor(m/60),r=m%60;return h?`${h} h ${String(r).padStart(2,'0')}`:`${r} min`};
const clock=(s?:Station)=>s?.arrivalHour==null?'--:--':`${String(s.arrivalHour).padStart(2,'0')}:${String(s.arrivalMinute||0).padStart(2,'0')}`;
const localDateTime=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const score=(s:Station)=>s.waitMin+s.detourMin+s.price*2-(s.flowayContextScore||0);

export default function FlowayV3(){
 const [origin,setOrigin]=useState('Paris');
 const [destination,setDestination]=useState('Lyon');
 const [draftOrigin,setDraftOrigin]=useState('Paris');
 const [draftDestination,setDraftDestination]=useState('Lyon');
 const [departure,setDeparture]=useState(localDateTime());
 const [draftDeparture,setDraftDeparture]=useState(localDateTime());
 const [fuel,setFuel]=useState('Gazole');
 const [route,setRoute]=useState<RouteData|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [editing,setEditing]=useState(false);
 const [selected,setSelected]=useState<Station|null>(null);
 const [filter,setFilter]=useState<Filter>('Tous');
 const [startAfter,setStartAfter]=useState(120);

 async function loadRoute(from:string,to:string,nextFuel=fuel,when=departure){
  setLoading(true);setError('');
  try{
   const iso=new Date(when).toISOString();
   const r=await fetch(`/api/route?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&fuel=${encodeURIComponent(nextFuel)}&departureAt=${encodeURIComponent(iso)}`,{cache:'no-store'});
   const j=await r.json(); if(!r.ok) throw new Error(j.error||'Calcul impossible');
   setRoute(j);setOrigin(j.origin.label);setDestination(j.destination.label);setDeparture(when);
   setStartAfter(Math.min(Math.max(120,Math.round(j.distanceKm*.48/10)*10),Math.max(0,Math.floor(j.distanceKm-50))));
  }catch(e){setError(e instanceof Error?e.message:'Impossible de calculer cet itinéraire.')}finally{setLoading(false)}
 }
 useEffect(()=>{const now=localDateTime();setDeparture(now);setDraftDeparture(now);void loadRoute('Paris','Lyon','Gazole',now)},[]);

 const stations=useMemo(()=>[...(route?.stations||[])].sort((a,b)=>a.distanceKm-b.distanceKm),[route]);
 const eligible=useMemo(()=>stations.filter(s=>s.distanceKm>=startAfter&&(filter==='Tous'||s.serviceCategories?.includes(filter))),[stations,startAfter,filter]);
 const best=useMemo(()=>[...eligible].sort((a,b)=>score(a)-score(b))[0],[eligible]);
 const first=eligible[0];
 const saved=best&&first?Math.max(0,first.waitMin+first.detourMin-best.waitMin-best.detourMin):0;
 const pauses=route?Math.max(0,Math.floor((route.durationMin-1)/120)):0;
 const sampled=useMemo(()=>{
  if(!stations.length||!route) return [] as Station[];
  return [.16,.32,.48,.64,.82].map(r=>stations.reduce((a,b)=>Math.abs(b.distanceKm-route.distanceKm*r)<Math.abs(a.distanceKm-route.distanceKm*r)?b:a,stations[0])).filter((s,i,a)=>a.findIndex(x=>x.id===s.id)===i);
 },[stations,route]);

 async function submit(e:FormEvent){e.preventDefault();await loadRoute(draftOrigin.trim(),draftDestination.trim(),fuel,draftDeparture);setEditing(false)}
 const eta=route?duration(route.durationMin+pauses*15):'—';
 const bestTravel=best&&route?duration(Math.round(best.distanceKm/Math.max(route.distanceKm,1)*route.durationMin)):'—';

 return <main className="v3app">
  <header className="v3top">
   <button className="v3icon">☰</button>
   <div className="v3brand"><span>≋</span><strong>Floway</strong><small>CHAQUE PAUSE COMPTE</small></div>
   <div className="v3status"><button>🔔<b>2</b></button><span>● Trafic fluide</span><span>☀ 18°C</span></div>
  </header>

  {error&&<div className="v3error">{error}</div>}

  <section className="v3topgrid">
   <article className="v3hero">
    <div className="v3heroshade"/>
    <div className="v3heroContent">
     <span className="v3hello">Bonjour 👋</span>
     <h1>Prêt pour<br/>une belle route ?</h1>
     <button className="v3routeTitle" onClick={()=>setEditing(true)}>{short(origin)} <i>→</i> {short(destination)} <em>✎</em></button>
     <div className="v3heroMetrics"><div><b>{route?Math.round(route.distanceKm):'—'} km</b><small>Distance</small></div><div><b>{route?duration(route.durationMin):'—'}</b><small>Durée estimée</small></div><div><b>{pauses}</b><small>Pauses conseillées</small></div></div>
     <button className="v3full" onClick={()=>route&&setStartAfter(Math.min(Math.round(route.distanceKm*.55/10)*10,Math.max(0,route.distanceKm-60)))}>DÉPART AVEC LE PLEIN ⛽</button>
    </div>
    <div className="v3miniRoute">
     <span>{short(origin)}</span><span>{short(destination)}</span>
     <div className="v3track"><i/><b className="v3car">🚙</b>{sampled.slice(0,3).map((s,i)=><button key={s.id} style={{left:`${35+i*18}%`}} onClick={()=>setSelected(s)}>{serviceIcon(s.serviceCategories?.[0]||'')}</button>)}<i/></div>
     <small>0 km</small><small>{route?Math.round(route.distanceKm):0} km</small>
    </div>
   </article>

   <aside className="v3feed">
    <div className="v3panelHead"><div><span>FIL DU VOYAGE</span><h2>Toutes les stations sur l’itinéraire</h2></div><b>{stations.length} stations</b></div>
    <div className="v3vertical"><i className="v3line"/><div className="v3end"><i/><strong>{short(origin)}</strong><small>0 km</small></div>
     {sampled.map((s,i)=><button key={s.id} className={best?.id===s.id?'v3feedStop recommended':'v3feedStop'} onClick={()=>setSelected(s)}><span>{serviceIcon(s.serviceCategories?.[0]||'')}</span><div><strong>{s.city||s.name}</strong><small>{Math.round(s.distanceKm)} km · {clock(s)}</small></div>{best?.id===s.id&&<em>FLOWAY AI ✦</em>}</button>)}
     <div className="v3end bottom"><i/><strong>{short(destination)}</strong><small>{route?Math.round(route.distanceKm):0} km · arrivée</small></div>
    </div>
    <button className="v3ghost" onClick={()=>document.getElementById('v3stations')?.scrollIntoView({behavior:'smooth'})}>VOIR TOUTES LES STATIONS</button>
   </aside>
  </section>

  <section className="v3midgrid">
   <article className="v3recommend">
    <div className="v3stopImage"><span>PROCHAINE PAUSE RECOMMANDÉE</span><button>♡</button></div>
    <div className="v3stopInfo"><div><h2>Aire de<br/>{best?(best.city||best.name):'—'}</h2><div className="v3services">{(best?.serviceCategories||['Carburant','Restauration','Café','Toilettes']).slice(0,6).map(s=><span key={s}><i>{serviceIcon(s)}</i>{s}</span>)}</div></div><aside><b>{best?`Dans ${Math.round(best.distanceKm)} km`:'—'}</b><strong>{bestTravel}</strong><small>depuis {short(origin)}</small><ul><li>Votre pause idéale</li><li>Services adaptés</li><li>Attente optimisée</li></ul><button onClick={()=>best&&setSelected(best)}>VOIR LE DÉTAIL</button></aside></div>
   </article>

   <article className="v3ai">
    <div className="v3panelHead"><div><span>FLOWAY AI</span><h2>Optimisé pour vous</h2></div><b>✦</b></div>
    <div className="v3orb"><i/><i/><i/><strong>✦</strong></div>
    <h3>{best?'Votre meilleur arrêt est déjà identifié.':'Floway analyse votre trajet.'}</h3>
    <p>{best?.smartContext?.message||'Floway croise heure de passage, détour, attente, carburant et services pour recommander le meilleur moment de pause.'}</p>
    <div className="v3aiStats"><div><small>TEMPS GAGNÉ</small><b>≈ {saved} min</b></div><div><small>DÉTOUR</small><b>{best?`+${best.detourMin} min`:'—'}</b></div><div><small>ATTENTE</small><b>{best?`${best.waitMin} min`:'—'}</b></div></div>
   </article>
  </section>

  <section className="v3planner">
   <div><span>QUAND VEUX-TU COMMENCER À CHERCHER ?</span><h2>Après {Math.round(startAfter)} km · environ {route?duration(Math.round(startAfter/Math.max(route.distanceKm,1)*route.durationMin)):'—'}</h2></div><button onClick={()=>route&&setStartAfter(Math.round(route.distanceKm*.55/10)*10)}>Départ avec le plein</button>
   <input type="range" min="0" max={Math.max(50,Math.floor(route?.distanceKm||500))} step="10" value={startAfter} onChange={e=>setStartAfter(Number(e.target.value))}/>
   <div className="v3chips">{(['Tous','Restauration','Café','Boutique','Toilettes'] as Filter[]).map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{x}</button>)}</div>
  </section>

  <section className="v3featuregrid">
   <article className="photo"><span>PAUSES INTELLIGENTES</span><h3>Au bon moment,<br/>au bon endroit.</h3></article>
   <article><span>COMMUNAUTÉ ACTIVE</span><h3>Avis, photos et conseils<br/>de voyageurs.</h3><div className="v3avatars"><i>👨</i><i>👩</i><i>🧔</i><b>★ 4,8</b></div></article>
   <article><span>POUR TOUS LES VÉHICULES</span><h3>Thermique · Électrique<br/>ou Hybride.</h3><div className="v3vehicle">⛽ ⚡ 🔌</div></article>
   <article><span>TEMPS OPTIMISÉ</span><h3>{eta}<br/>voyage Floway</h3><strong>+{pauses*15} min de pauses utiles</strong></article>
  </section>

  <section className="v3stations" id="v3stations"><div className="v3panelHead"><div><span>ARRÊTS ÉLIGIBLES APRÈS {Math.round(startAfter)} KM</span><h2>Toutes les stations</h2></div><select value={fuel} onChange={e=>{setFuel(e.target.value);void loadRoute(origin,destination,e.target.value,departure)}}><option>Gazole</option><option>SP95-E10</option><option>SP98</option><option>E85</option></select></div><div className="v3cards">{eligible.slice(0,18).map(s=><button key={s.id} onClick={()=>setSelected(s)}><span>{serviceIcon(s.serviceCategories?.[0]||'')}</span><div><strong>{s.city||s.name}</strong><small>{Math.round(s.distanceKm)} km · {clock(s)}</small></div><b>{s.waitMin} min</b></button>)}</div></section>

  <nav className="v3nav"><button className="active">⌁<span>ROUTE</span></button><button onClick={()=>document.getElementById('v3stations')?.scrollIntoView({behavior:'smooth'})}>⛽<span>STATIONS</span></button><a href="/ev">✦<span>FLOWAY AI</span></a><button>◉<span>COMMUNAUTÉ</span></button><button>○<span>PROFIL</span></button></nav>

  {editing&&<div className="v3overlay" onClick={()=>!loading&&setEditing(false)}><form className="v3modal" onSubmit={submit} onClick={e=>e.stopPropagation()}><span>NOUVEL ITINÉRAIRE</span><h2>Où va-t-on ?</h2><label>Départ<input value={draftOrigin} onChange={e=>setDraftOrigin(e.target.value)} required/></label><label>Destination<input value={draftDestination} onChange={e=>setDraftDestination(e.target.value)} required/></label><label>Heure de départ<input type="datetime-local" value={draftDeparture} onChange={e=>setDraftDeparture(e.target.value)} required/></label><button disabled={loading}>{loading?'ANALYSE…':'ANALYSER LE TRAJET →'}</button></form></div>}

  {selected&&<div className="v3overlay" onClick={()=>setSelected(null)}><article className="v3detail" onClick={e=>e.stopPropagation()}><button className="v3close" onClick={()=>setSelected(null)}>←</button><div className="v3detailImage"><span>RECOMMANDATION FLOWAY</span></div><div className="v3detailBody"><h2>{selected.name}</h2><p>{selected.city} · {Math.round(selected.distanceKm)} km · passage {clock(selected)}</p><div className="v3detailStats"><div><small>ATTENTE</small><b>{selected.waitMin} min</b></div><div><small>PRIX</small><b>{selected.price?`${selected.price.toFixed(3)} €/L`:'—'}</b></div><div><small>DÉTOUR</small><b>+{selected.detourMin} min</b></div></div><div className="v3services">{(selected.serviceCategories||[]).map(s=><span key={s}><i>{serviceIcon(s)}</i>{s}</span>)}</div><div className="v3detailAI"><span>FLOWAY AI ✦</span><p>{selected.smartContext?.message||'Cet arrêt est analysé selon votre heure de passage, le détour, l’attente et les services disponibles.'}</p></div><button className="v3choose" onClick={()=>setSelected(null)}>CHOISIR CET ARRÊT →</button></div></article></div>}
 </main>
}
