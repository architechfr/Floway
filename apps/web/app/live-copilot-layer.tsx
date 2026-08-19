'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { detectRestaurantBrands, loadRestaurantPreferences, type RestaurantBrand } from './restaurant-preferences';

type Station={id:string;name:string;brand?:string;city?:string;distanceKm:number;price?:number;waitMin?:number;detourMin?:number;services?:string[];serviceCategories?:string[];arrivalHour?:number;arrivalMinute?:number};
type RouteData={distanceKm:number;durationMin:number;stations:Station[];geometry?:{coordinates:[number,number][]}};
type GuideStep={id:string;distanceM:number;durationSec:number;roadName?:string|null;roadRef?:string|null;destinations?:string|null;exit?:string|null;instruction:string;icon:string;location?:{lat:number;lon:number}|null};
type Guidance={steps:GuideStep[];geometry?:{coordinates:[number,number][]}};
type Pos={lat:number;lon:number;speed:number|null;heading:number|null;accuracy:number;at:number};
type SavedSession={origin:string;destination:string;navOpen?:boolean;updatedAt:number};

const SESSION='floway:active-session';
const rad=(n:number)=>n*Math.PI/180;
function hav(a:[number,number],b:[number,number]){const R=6371,dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]),la1=rad(a[1]),la2=rad(b[1]);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function cumulative(c:[number,number][]){const out=[0];for(let i=1;i<c.length;i++)out[i]=out[i-1]+hav(c[i-1],c[i]);return out;}
function routeFromDom(){const b=document.querySelector<HTMLButtonElement>('.v3routeTitle');const t=b?.textContent?.replace(/\s+/g,' ').trim()||'';const p=t.split('→').map(x=>x.replace('✎','').trim()).filter(Boolean);return p.length>=2?{origin:p[0],destination:p[1]}:null;}
function fmtClock(s:Station){return s.arrivalHour==null?'--:--':`${String(s.arrivalHour).padStart(2,'0')}:${String(s.arrivalMinute||0).padStart(2,'0')}`;}

export default function LiveCopilotLayer(){
 const [open,setOpen]=useState(false);const [routeNames,setRouteNames]=useState<{origin:string;destination:string}|null>(null);const [route,setRoute]=useState<RouteData|null>(null);const [guide,setGuide]=useState<Guidance|null>(null);const [pos,setPos]=useState<Pos|null>(null);const [limit,setLimit]=useState<number|null>(null);const [road,setRoad]=useState('');const [prefs,setPrefs]=useState<RestaurantBrand[]>([]);const [showFood,setShowFood]=useState(false);const previous=useRef<Pos|null>(null);const watch=useRef<number|null>(null);

 useEffect(()=>{setPrefs(loadRestaurantPreferences());const sync=()=>{const r=routeFromDom();if(r){setRouteNames(r);try{const old=JSON.parse(localStorage.getItem(SESSION)||'{}') as Partial<SavedSession>;localStorage.setItem(SESSION,JSON.stringify({...old,...r,navOpen:open,updatedAt:Date.now()}));}catch{}}};sync();const id=window.setInterval(sync,1500);return()=>window.clearInterval(id)},[open]);
 useEffect(()=>{const click=(e:MouseEvent)=>{const t=e.target as HTMLElement|null;if(!t)return;const nav=t.closest('.navLaunch,.v3nav button:first-child,[data-floway-live-nav]');if(nav){e.preventDefault();e.stopPropagation();setOpen(true);}};document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true)},[]);
 useEffect(()=>{if(!open||!routeNames)return;let stop=false;Promise.all([
   fetch(`/api/route?origin=${encodeURIComponent(routeNames.origin)}&destination=${encodeURIComponent(routeNames.destination)}&fuel=Gazole&departureAt=${encodeURIComponent(new Date().toISOString())}`,{cache:'no-store'}).then(r=>r.json()),
   fetch(`/api/guidance?origin=${encodeURIComponent(routeNames.origin)}&destination=${encodeURIComponent(routeNames.destination)}`,{cache:'no-store'}).then(r=>r.json())
 ]).then(([r,g])=>{if(stop)return;if(r?.distanceKm)setRoute(r);if(Array.isArray(g?.steps))setGuide(g);}).catch(()=>{});return()=>{stop=true}},[open,routeNames?.origin,routeNames?.destination]);
 useEffect(()=>{if(!open||!navigator.geolocation)return;if(watch.current!==null)return;watch.current=navigator.geolocation.watchPosition(p=>{const n:Pos={lat:p.coords.latitude,lon:p.coords.longitude,speed:p.coords.speed,heading:p.coords.heading,accuracy:p.coords.accuracy,at:p.timestamp};previous.current=pos||previous.current;setPos(n);try{localStorage.setItem('floway:last-position',JSON.stringify(n));}catch{}},()=>{}, {enableHighAccuracy:true,maximumAge:2000,timeout:12000});return()=>{if(watch.current!==null){navigator.geolocation.clearWatch(watch.current);watch.current=null}},[open,pos]);
 useEffect(()=>{if(!open||!pos||!previous.current)return;const p=previous.current;const u=`/api/speed-limit?lat1=${p.lat}&lon1=${p.lon}&lat2=${pos.lat}&lon2=${pos.lon}${Number.isFinite(pos.heading)?`&heading=${pos.heading}`:''}`;fetch(u,{cache:'no-store'}).then(r=>r.json()).then(j=>{setLimit(typeof j?.speedLimit==='number'?Math.round(j.speedLimit):null);setRoad([...(j?.roadNumbers||[]),j?.roadName].filter(Boolean).join(' · '));}).catch(()=>{});},[open,pos?.lat,pos?.lon,pos?.heading]);

 const progress=useMemo(()=>{const coords=route?.geometry?.coordinates;if(!pos||!coords?.length)return null;const cum=cumulative(coords);let idx=0,best=Infinity;for(let i=0;i<coords.length;i++){const d=hav([pos.lon,pos.lat],coords[i]);if(d<best){best=d;idx=i}}return{idx,km:cum[idx],remaining:Math.max(0,(route?.distanceKm||0)-cum[idx]),off:best,cum}},[route,pos]);
 const speed=Math.max(0,Math.round((pos?.speed||0)*3.6));const aheadKm=Math.max(2.5,Math.min(9,(Math.max(speed,50)/60)*3));
 const windowPath=useMemo(()=>{const coords=route?.geometry?.coordinates;if(!coords?.length||!progress)return null;const endKm=progress.km+aheadKm;const pts=coords.filter((_,i)=>i>=progress.idx&&progress.cum[i]<=endKm);if(pts.length<2)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),dx=Math.max(.00001,maxX-minX),dy=Math.max(.00001,maxY-minY);return pts.map(p=>`${12+(p[0]-minX)/dx*76},${165-(p[1]-minY)/dy*145}`).join(' ');},[route,progress,aheadKm]);
 const nextStep=useMemo(()=>{if(!guide?.steps?.length||!pos)return null;let best:GuideStep|null=null,dist=Infinity;for(const s of guide.steps){if(!s.location)continue;const d=hav([pos.lon,pos.lat],[s.location.lon,s.location.lat]);if(d<dist){dist=d;best=s}}return best?{...best,distanceNowKm:dist}:null},[guide,pos]);
 const upcoming=useMemo(()=>{const km=progress?.km||0;return [...(route?.stations||[])].filter(s=>s.distanceKm>=km).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,5)},[route,progress]);
 const preferredHits=useMemo(()=>upcoming.map(s=>({station:s,brands:detectRestaurantBrands(s.services).filter(b=>prefs.includes(b))})),[upcoming,prefs]);

 if(!open)return null;
 return <div className="copilotOverlay"><section className="copilotShell">
  <header><div><small>FLOWAY COPILOTE</small><strong>{road||routeNames?.origin||'Route en cours'}</strong><span>{routeNames?.destination?`vers ${routeNames.destination}`:''}</span></div><button onClick={()=>setOpen(false)}>×</button></header>
  <div className="copilotMap">{windowPath?<svg viewBox="0 0 100 180" preserveAspectRatio="none"><polyline className="copilotShadow" points={windowPath}/><polyline className="copilotRoad" points={windowPath}/><circle cx="50" cy="150" r="4.2" className="copilotHalo"/><circle cx="50" cy="150" r="2.5" className="copilotCar"/></svg>:<div className="copilotWaiting">GPS + itinéraire en cours de synchronisation…</div>}
   <div className={`copilotSpeed ${limit&&speed>limit+4?'over':''}`}><b>{speed}</b><span>km/h</span></div><div className="copilotLimit"><b>{limit??'—'}</b><span>limite</span></div><div className="copilotHorizon">≈ 3 min devant · {aheadKm.toFixed(1)} km</div>
  </div>
  <div className="copilotInstruction"><div className="turnIcon">{nextStep?.icon||'↑'}</div><div><small>PROCHAINE INSTRUCTION</small><strong>{nextStep?.instruction||'Continuez sur votre route'}</strong><span>{nextStep?`${nextStep.distanceNowKm<1?Math.round(nextStep.distanceNowKm*1000)+' m':nextStep.distanceNowKm.toFixed(1)+' km'}${nextStep.exit?` · sortie ${nextStep.exit}`:''}`:'Guidage en cours de calcul'}</span></div></div>
  <div className="copilotActions"><button className={showFood?'active':''} onClick={()=>setShowFood(v=>!v)}>🍴 MANGER</button><button onClick={()=>{setOpen(false);window.setTimeout(()=>document.getElementById('v3stations')?.scrollIntoView({behavior:'smooth'}),80)}}>⛽ STATIONS</button><button onClick={()=>setPrefs(loadRestaurantPreferences())}>↻ PRÉFÉRENCES</button></div>
  {showFood&&<div className="copilotFood"><div className="foodHead"><div><small>5 PROCHAINS ARRÊTS</small><strong>{prefs.length?`Préférences : ${prefs.join(' · ')}`:'Toutes les offres repas recensées'}</strong></div></div>{upcoming.map((s,i)=>{const all=detectRestaurantBrands(s.services);const hit=preferredHits[i]?.brands||[];return <button key={s.id}><b>{i+1}</b><div><strong>{s.brand||s.city||s.name}</strong><span>Dans {Math.max(0,Math.round(s.distanceKm-(progress?.km||0)))} km · passage {fmtClock(s)}</span><em>{hit.length?`★ ${hit.join(' · ')}`:all.length?all.join(' · '):(s.serviceCategories||[]).includes('Restauration')?'Restauration recensée · enseigne non confirmée':'Aucune enseigne repas confirmée'}</em></div><i>›</i></button>})}</div>}
  <footer><span>GPS {pos?`±${Math.round(pos.accuracy)} m`:'en attente'}</span><span>{progress?`${Math.round(progress.remaining)} km restants`:'—'}</span><span>{limit?'limite sourcée':'limite non disponible'}</span></footer>
 </section></div>;
}
