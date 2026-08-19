'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RESTAURANT_BRANDS, detectRestaurantBrands, loadRestaurantPreferences, saveRestaurantPreferences, type RestaurantBrand } from './restaurant-preferences';

type Station={id:string;name:string;brand?:string;city?:string;distanceKm:number;services?:string[];serviceCategories?:string[];arrivalHour?:number;arrivalMinute?:number};
type RouteData={distanceKm:number;stations:Station[];geometry?:{coordinates:[number,number][]}};
type GuideStep={id:string;instruction:string;icon:string;exit?:string|null;location?:{lat:number;lon:number}|null};
type Guidance={steps:GuideStep[]};
type Pos={lat:number;lon:number;speed:number|null;heading:number|null;accuracy:number;at:number};

const SESSION='floway:active-session';
const rad=(n:number)=>n*Math.PI/180;
function hav(a:[number,number],b:[number,number]){const R=6371,dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]),la1=rad(a[1]),la2=rad(b[1]);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function cumulative(c:[number,number][]){const out=[0];for(let i=1;i<c.length;i++)out[i]=out[i-1]+hav(c[i-1],c[i]);return out;}
function routeFromDom(){const b=document.querySelector<HTMLButtonElement>('.v3routeTitle');const t=b?.textContent?.replace(/\s+/g,' ').trim()||'';const p=t.split('→').map(x=>x.replace('✎','').trim()).filter(Boolean);return p.length>=2?{origin:p[0],destination:p[1]}:null;}
function fmtClock(s:Station){return s.arrivalHour==null?'--:--':`${String(s.arrivalHour).padStart(2,'0')}:${String(s.arrivalMinute||0).padStart(2,'0')}`;}

export default function LiveCopilotLayer(){
 const [open,setOpen]=useState(false),[food,setFood]=useState(false);
 const [names,setNames]=useState<{origin:string;destination:string}|null>(null),[route,setRoute]=useState<RouteData|null>(null),[guide,setGuide]=useState<Guidance|null>(null);
 const [pos,setPos]=useState<Pos|null>(null),[limit,setLimit]=useState<number|null>(null),[road,setRoad]=useState(''),[prefs,setPrefs]=useState<RestaurantBrand[]>([]);
 const watch=useRef<number|null>(null),last=useRef<Pos|null>(null);

 useEffect(()=>{setPrefs(loadRestaurantPreferences());const sync=()=>{const r=routeFromDom();if(!r)return;setNames(r);try{const old=JSON.parse(localStorage.getItem(SESSION)||'{}');localStorage.setItem(SESSION,JSON.stringify({...old,...r,navOpen:open,updatedAt:Date.now()}));}catch{}};sync();const id=setInterval(sync,1500);return()=>clearInterval(id)},[open]);
 useEffect(()=>{const click=(e:MouseEvent)=>{const t=e.target as HTMLElement|null;if(t?.closest('.navLaunch,.v3nav button:first-child,[data-floway-live-nav]')){e.preventDefault();e.stopPropagation();setOpen(true)}};document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true)},[]);
 useEffect(()=>{if(!open||!names)return;let dead=false;Promise.all([fetch(`/api/route?origin=${encodeURIComponent(names.origin)}&destination=${encodeURIComponent(names.destination)}&fuel=Gazole&departureAt=${encodeURIComponent(new Date().toISOString())}`,{cache:'no-store'}).then(r=>r.json()),fetch(`/api/guidance?origin=${encodeURIComponent(names.origin)}&destination=${encodeURIComponent(names.destination)}`,{cache:'no-store'}).then(r=>r.json())]).then(([r,g])=>{if(dead)return;if(r?.distanceKm)setRoute(r);if(Array.isArray(g?.steps))setGuide(g)}).catch(()=>{});return()=>{dead=true}},[open,names?.origin,names?.destination]);
 useEffect(()=>{if(!open||!navigator.geolocation||watch.current!==null)return;watch.current=navigator.geolocation.watchPosition(p=>{const n:Pos={lat:p.coords.latitude,lon:p.coords.longitude,speed:p.coords.speed,heading:p.coords.heading,accuracy:p.coords.accuracy,at:p.timestamp};const previous=last.current;last.current=n;setPos(n);try{localStorage.setItem('floway:last-position',JSON.stringify(n))}catch{};if(previous){const u=`/api/speed-limit?lat1=${previous.lat}&lon1=${previous.lon}&lat2=${n.lat}&lon2=${n.lon}${Number.isFinite(n.heading)?`&heading=${n.heading}`:''}`;fetch(u,{cache:'no-store'}).then(r=>r.json()).then(j=>{setLimit(typeof j?.speedLimit==='number'?Math.round(j.speedLimit):null);setRoad([...(j?.roadNumbers||[]),j?.roadName].filter(Boolean).join(' · '))}).catch(()=>{})}},()=>{}, {enableHighAccuracy:true,maximumAge:1500,timeout:12000});return()=>{if(watch.current!==null){navigator.geolocation.clearWatch(watch.current);watch.current=null}},[open]);

 const progress=useMemo(()=>{const c=route?.geometry?.coordinates;if(!pos||!c?.length)return null;const cum=cumulative(c);let idx=0,best=Infinity;for(let i=0;i<c.length;i++){const d=hav([pos.lon,pos.lat],c[i]);if(d<best){best=d;idx=i}}return{idx,km:cum[idx],remaining:Math.max(0,(route?.distanceKm||0)-cum[idx]),cum}},[route,pos]);
 const speed=Math.max(0,Math.round((pos?.speed||0)*3.6)),aheadKm=Math.max(2.5,Math.min(9,(Math.max(speed,50)/60)*3));
 const path=useMemo(()=>{const c=route?.geometry?.coordinates;if(!c?.length||!progress)return null;const pts=c.filter((_,i)=>i>=progress.idx&&progress.cum[i]<=progress.km+aheadKm);if(pts.length<2)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),dx=Math.max(.00001,maxX-minX),dy=Math.max(.00001,maxY-minY);return pts.map(p=>`${12+(p[0]-minX)/dx*76},${165-(p[1]-minY)/dy*145}`).join(' ')},[route,progress,aheadKm]);
 const next=useMemo(()=>{if(!guide?.steps?.length||!pos)return null;let chosen:GuideStep|null=null,dist=Infinity;for(const s of guide.steps){if(!s.location)continue;const d=hav([pos.lon,pos.lat],[s.location.lon,s.location.lat]);if(d<dist){dist=d;chosen=s}}return chosen?{...chosen,km:dist}:null},[guide,pos]);
 const upcoming=useMemo(()=>{const km=progress?.km||0;return [...(route?.stations||[])].filter(s=>s.distanceKm>=km).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,5)},[route,progress]);
 function togglePref(b:RestaurantBrand){setPrefs(prev=>{const n=prev.includes(b)?prev.filter(x=>x!==b):[...prev,b];saveRestaurantPreferences(n);return n})}

 if(!open)return null;
 return <div className="copilotOverlay"><section className="copilotShell">
  <header><div><small>FLOWAY COPILOTE</small><strong>{road||names?.origin||'Route en cours'}</strong><span>{names?.destination?`vers ${names.destination}`:''}</span></div><button onClick={()=>setOpen(false)}>×</button></header>
  <div className="copilotMap">{path?<svg viewBox="0 0 100 180" preserveAspectRatio="none"><polyline className="copilotShadow" points={path}/><polyline className="copilotRoad" points={path}/><circle cx="50" cy="150" r="4.2" className="copilotHalo"/><circle cx="50" cy="150" r="2.5" className="copilotCar"/></svg>:<div className="copilotWaiting">GPS + itinéraire en cours de synchronisation…</div>}<div className={`copilotSpeed ${limit&&speed>limit+4?'over':''}`}><b>{speed}</b><span>km/h</span></div><div className="copilotLimit"><b>{limit??'—'}</b><span>limite</span></div><div className="copilotHorizon">≈ 3 min devant · {aheadKm.toFixed(1)} km</div></div>
  <div className="copilotInstruction"><div className="turnIcon">{next?.icon||'↑'}</div><div><small>PROCHAINE INSTRUCTION</small><strong>{next?.instruction||'Continuez sur votre route'}</strong><span>{next?`${next.km<1?Math.round(next.km*1000)+' m':next.km.toFixed(1)+' km'}${next.exit?` · sortie ${next.exit}`:''}`:'Guidage en cours de calcul'}</span></div></div>
  <div className="copilotActions"><button className={food?'active':''} onClick={()=>setFood(v=>!v)}>🍴 MANGER</button><button onClick={()=>{setOpen(false);setTimeout(()=>document.getElementById('v3stations')?.scrollIntoView({behavior:'smooth'}),80)}}>⛽ STATIONS</button></div>
  {food&&<div className="copilotFood"><div className="foodHead"><div><small>MES ENSEIGNES PRÉFÉRÉES</small><strong>Choisis ce que tu veux voir sur la route</strong></div></div><div className="copilotBrandChips">{RESTAURANT_BRANDS.map(b=><button key={b} className={prefs.includes(b)?'active':''} onClick={()=>togglePref(b)}>{prefs.includes(b)?'✓ ':''}{b}</button>)}</div><div className="foodHead next"><div><small>5 PROCHAINS ARRÊTS</small><strong>{prefs.length?'Correspondances préférées mises en avant':'Toutes les offres repas recensées'}</strong></div></div>{upcoming.map((s,i)=>{const all=detectRestaurantBrands(s.services),hit=all.filter(b=>prefs.includes(b));return <article key={s.id}><b>{i+1}</b><div><strong>{s.brand||s.city||s.name}</strong><span>Dans {Math.max(0,Math.round(s.distanceKm-(progress?.km||0)))} km · passage {fmtClock(s)}</span><em>{hit.length?`★ ${hit.join(' · ')}`:all.length?all.join(' · '):(s.serviceCategories||[]).includes('Restauration')?'Restauration recensée · enseigne non confirmée':'Aucune enseigne repas confirmée'}</em></div></article>})}</div>}
  <footer><span>GPS {pos?`±${Math.round(pos.accuracy)} m`:'en attente'}</span><span>{progress?`${Math.round(progress.remaining)} km restants`:'—'}</span><span>{limit?'limite sourcée':'limite non disponible'}</span></footer>
 </section></div>;
}
