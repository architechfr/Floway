'use client';

import { useEffect, useState } from 'react';

const LAST_ORIGIN='floway:last-origin-gps';
function setNativeInputValue(input:HTMLInputElement,value:string){const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;setter?.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}

export default function CurrentLocationOrigin(){
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 useEffect(()=>{
  const mount=()=>{
   const form=document.querySelector<HTMLFormElement>('.v3modal');
   if(!form||form.querySelector('[data-floway-current-origin]'))return;
   const labels=form.querySelectorAll('label');const origin=labels[0]?.querySelector('input') as HTMLInputElement|null;if(!origin)return;
   const row=document.createElement('div');row.dataset.flowayCurrentOrigin='1';row.className='flowayOriginAuto';row.innerHTML='<div><strong>📍 Ma position actuelle</strong><small>Localisation GPS en cours…</small></div><button type="button">AUTRE DÉPART</button>';
   origin.classList.add('flowayOriginRaw');origin.insertAdjacentElement('afterend',row);
   const status=row.querySelector('small')!;const change=row.querySelector('button') as HTMLButtonElement;
   const locate=()=>{if(!navigator.geolocation){status.textContent='GPS indisponible';origin.classList.remove('flowayOriginRaw');return;}setBusy(true);setMessage('Localisation en cours…');navigator.geolocation.getCurrentPosition(async p=>{try{const r=await fetch(`/api/reverse-geocode?lat=${p.coords.latitude}&lon=${p.coords.longitude}`,{cache:'no-store'});const j=await r.json();const label=typeof j?.label==='string'&&j.label.trim()?j.label.trim():`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;setNativeInputValue(origin,label);localStorage.setItem(LAST_ORIGIN,JSON.stringify({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,label,updatedAt:Date.now()}));status.textContent=`GPS ±${Math.round(p.coords.accuracy)} m · départ automatique`;setMessage('Départ défini sur votre position actuelle');}catch{status.textContent='Position GPS détectée';}finally{setBusy(false)}},()=>{setBusy(false);status.textContent='Autorisez le GPS ou saisissez un départ';origin.classList.remove('flowayOriginRaw');},{enableHighAccuracy:true,maximumAge:2000,timeout:12000});};
   change.addEventListener('click',()=>{origin.classList.toggle('flowayOriginRaw');if(origin.classList.contains('flowayOriginRaw')){change.textContent='AUTRE DÉPART';locate();}else{change.textContent='MA POSITION';origin.focus();}});
   locate();
  };
  mount();const o=new MutationObserver(mount);o.observe(document.body,{childList:true,subtree:true});return()=>o.disconnect();
 },[]);
 return message?<div className={`flowayOriginToast ${busy?'busy':''}`}>{message}</div>:null;
}
