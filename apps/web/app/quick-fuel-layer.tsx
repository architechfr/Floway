'use client';

import { useEffect, useState } from 'react';

type Vehicle={fuelPct?:number;[key:string]:unknown};
const VEHICLE_KEY='floway:vehicle';

function clamp(n:number){return Math.max(0,Math.min(100,Math.round(n)));}
function readPct(){
 try{const v=JSON.parse(localStorage.getItem(VEHICLE_KEY)||'{}') as Vehicle;return typeof v.fuelPct==='number'?clamp(v.fuelPct):75;}catch{return 75;}
}
function syncReactFuel(pct:number){
 const slider=document.querySelector<HTMLInputElement>('.fuelGauge input[type="range"]');
 if(slider){const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;setter?.call(slider,String(pct));slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));}
}

export default function QuickFuelLayer(){
 const [open,setOpen]=useState(false);const [pct,setPct]=useState(75);
 useEffect(()=>{setPct(readPct());const click=(e:MouseEvent)=>{const t=e.target as HTMLElement|null;if(!t)return;if(t.closest('.fuelGauge b,.v3fuelHero strong,.roadFuel span,[data-floway-fuel-quick]')){e.preventDefault();e.stopPropagation();setPct(readPct());setOpen(true);}};document.addEventListener('click',click,true);return()=>document.removeEventListener('click',click,true)},[]);
 function apply(next:number){const n=clamp(next);setPct(n);syncReactFuel(n);try{const v=JSON.parse(localStorage.getItem(VEHICLE_KEY)||'{}');localStorage.setItem(VEHICLE_KEY,JSON.stringify({...v,fuelPct:n}));}catch{}window.dispatchEvent(new CustomEvent('floway:fuel-updated',{detail:{fuelPct:n}}));}
 return <>{open&&<div className="quickFuelBackdrop" onClick={()=>setOpen(false)}><section className="quickFuelSheet" onClick={e=>e.stopPropagation()}><header><div><small>NIVEAU CARBURANT</small><strong>Corriger maintenant</strong></div><button onClick={()=>setOpen(false)}>×</button></header><div className="quickFuelValue"><b>{pct}%</b><span>Les recommandations sont recalculées immédiatement.</span></div><input aria-label="Pourcentage carburant" type="range" min="0" max="100" value={pct} onChange={e=>apply(Number(e.target.value))}/><div className="quickFuelButtons"><button onClick={()=>apply(pct-5)}>−5</button><button onClick={()=>apply(pct-1)}>−1</button><button onClick={()=>apply(pct+1)}>+1</button><button onClick={()=>apply(pct+5)}>+5</button></div><button className="quickFuelDone" onClick={()=>setOpen(false)}>VALIDER {pct}%</button></section></div>}</>;
}
