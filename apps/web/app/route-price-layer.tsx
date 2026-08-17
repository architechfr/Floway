'use client';

import { useEffect, useState } from 'react';

type PriceSummary={fuel:string;min:number;median:number;max:number;recommended:number|null;count:number};

function parseRoute(){const el=document.querySelector('.v3routeTitle');if(!el)return null;const text=(el.textContent||'').replace('✎','').trim();const parts=text.split('→').map(s=>s.trim()).filter(Boolean);return parts.length>=2?{origin:parts[0],destination:parts[1]}:null;}

export default function RoutePriceLayer(){
 const [summary,setSummary]=useState<PriceSummary|null>(null);
 const [loading,setLoading]=useState(false);
 useEffect(()=>{
  const clean=()=>{const pencil=document.querySelector('.v3routeTitle em') as HTMLElement|null;if(pencil)pencil.style.display='none';const duplicate=document.querySelector('.v3modifyRoute') as HTMLElement|null;if(duplicate)duplicate.style.display='none';};
  const refresh=async()=>{clean();const r=parseRoute();const select=document.querySelector('#v3stations select') as HTMLSelectElement|null;const fuel=select?.value||'Gazole';if(!r)return;setLoading(true);try{const res=await fetch(`/api/route?origin=${encodeURIComponent(r.origin)}&destination=${encodeURIComponent(r.destination)}&fuel=${encodeURIComponent(fuel)}&departureAt=${encodeURIComponent(new Date().toISOString())}`,{cache:'no-store'});const data=await res.json();const prices=(data.stations||[]).map((s:{price?:number})=>Number(s.price)).filter((n:number)=>Number.isFinite(n)&&n>0).sort((a:number,b:number)=>a-b);if(!prices.length){setSummary(null);return}const median=prices[Math.floor(prices.length/2)];const recommended=(data.stations||[])[0]?.price??null;setSummary({fuel,min:prices[0],median,max:prices[prices.length-1],recommended,count:prices.length});}catch{setSummary(null)}finally{setLoading(false)}};
  void refresh();const obs=new MutationObserver(()=>{clean()});obs.observe(document.body,{subtree:true,childList:true});const timer=window.setInterval(()=>void refresh(),30000);document.addEventListener('change',refresh);return()=>{obs.disconnect();window.clearInterval(timer);document.removeEventListener('change',refresh)};
 },[]);
 if(!summary&&!loading)return null;
 return <section className="routePriceRibbon" aria-label="Prix carburant sur le trajet"><div><span>PRIX SUR LE TRAJET</span><strong>{summary?.fuel||'Carburant'}</strong><small>{summary?`${summary.count} stations avec prix exploitable`:'Actualisation…'}</small></div>{summary&&<><div><small>MEILLEUR PRIX</small><b>{summary.min.toFixed(3)} €/L</b></div><div><small>PRIX MÉDIAN</small><b>{summary.median.toFixed(3)} €/L</b></div><div><small>ÉCART MAX</small><b>+{(summary.max-summary.min).toFixed(3)} €/L</b></div></>}</section>;
}
