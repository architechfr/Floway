'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Pos={lat:number;lon:number;speed:number|null;heading?:number|null;accuracy?:number;at?:number};
type Incident={id:string;label:string;icon?:string;description?:string;lat?:number|null;lon?:number|null;roads?:string[]};
const rad=(n:number)=>n*Math.PI/180;
function hav(a:[number,number],b:[number,number]){const R=6371,dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]),la1=rad(a[1]),la2=rad(b[1]);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h));}

export default function SafetyAlertLayer(){
 const [pos,setPos]=useState<Pos|null>(null),[limit,setLimit]=useState<number|null>(null),[incidents,setIncidents]=useState<Incident[]>([]),[sourceOk,setSourceOk]=useState(false);
 const prev=useRef<Pos|null>(null),lastSafety=useRef(0),lastSafetyPos=useRef<Pos|null>(null);
 useEffect(()=>{const onGps=(e:Event)=>{const n=(e as CustomEvent<Pos>).detail;if(!n)return;const p=prev.current;prev.current=n;setPos(n);if(p){const u=`/api/speed-limit?lat1=${p.lat}&lon1=${p.lon}&lat2=${n.lat}&lon2=${n.lon}${Number.isFinite(n.heading)?`&heading=${n.heading}`:''}`;fetch(u,{cache:'no-store'}).then(r=>r.json()).then(j=>setLimit(typeof j?.speedLimit==='number'?Math.round(j.speedLimit):null)).catch(()=>{})}const moved=lastSafetyPos.current?hav([lastSafetyPos.current.lon,lastSafetyPos.current.lat],[n.lon,n.lat]):99;if(Date.now()-lastSafety.current<12000&&moved<.25)return;lastSafety.current=Date.now();lastSafetyPos.current=n;const d=.035;fetch(`/api/safety?minLon=${n.lon-d}&minLat=${n.lat-d}&maxLon=${n.lon+d}&maxLat=${n.lat+d}`,{cache:'no-store'}).then(r=>r.json()).then(j=>{setSourceOk(Boolean(j?.provider?.connected));setIncidents(Array.isArray(j?.incidents)?j.incidents:[])}).catch(()=>{setSourceOk(false);setIncidents([])})};window.addEventListener('floway:gps',onGps as EventListener);return()=>window.removeEventListener('floway:gps',onGps as EventListener)},[]);
 const speed=Math.max(0,Math.round((pos?.speed||0)*3.6));
 const over=Boolean(limit&&speed>limit+3);
 const danger=useMemo(()=>{if(!pos)return null;return incidents.map(i=>({...i,distanceKm:i.lat!=null&&i.lon!=null?hav([pos.lon,pos.lat],[i.lon,i.lat]):999})).filter(i=>i.distanceKm<=1).sort((a,b)=>a.distanceKm-b.distanceKm)[0]||null},[incidents,pos]);
 if(!danger&&!over)return null;
 return <aside className={`flowaySafetyAlert ${danger?'danger':''} ${over?'overspeed':''}`} aria-live="assertive">
  <div className="safetyFlash"/>
  <section>
   <small>{danger?'⚠ ZONE DE DANGER À MOINS DE 1 KM':'⚠ VITESSE À CONTRÔLER'}</small>
   <h2>{danger?danger.label:'Ralentissez'}</h2>
   {danger&&<strong className="dangerDistance">{danger.distanceKm<.1?'< 100 m':`${Math.round(danger.distanceKm*1000)} m`}</strong>}
   <div className="speedRecall"><div><span>VITESSE ACTUELLE</span><b>{speed}</b><em>km/h</em></div><div className="legal"><span>LIMITATION</span><b>{limit??'—'}</b><em>km/h</em></div></div>
   <p>{danger?(danger.description||'Restez attentif et respectez la signalisation en place.'):limit?`Limitation détectée : ${limit} km/h.`:'Respectez la signalisation affichée sur la route.'}</p>
   <footer>{sourceOk?'Données danger : TomTom Traffic':'Zone de danger non sourcée : aucune alerte inventée'} · La signalisation physique reste prioritaire.</footer>
  </section>
 </aside>
}
