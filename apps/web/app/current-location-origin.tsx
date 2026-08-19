'use client';

import { useEffect, useRef, useState } from 'react';

const LAST_ORIGIN='floway:last-origin-gps';
const AUTO_ORIGIN='floway:auto-origin';

type SavedOrigin={lat:number;lon:number;accuracy:number;label:string;updatedAt:number};

function setNativeInputValue(input:HTMLInputElement,value:string){
 const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;
 setter?.call(input,value);
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
}

function readSaved():SavedOrigin|null{
 try{
  const raw=localStorage.getItem(LAST_ORIGIN);if(!raw)return null;
  const v=JSON.parse(raw) as SavedOrigin;
  if(!Number.isFinite(v?.lat)||!Number.isFinite(v?.lon)||!v?.label)return null;
  return v;
 }catch{return null;}
}

export default function CurrentLocationOrigin(){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const locateInFlight=useRef(false);

 useEffect(()=>{
  localStorage.setItem(AUTO_ORIGIN,'1');

  const nativeFetch=window.fetch.bind(window);
  window.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
   try{
    const raw=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
    const u=new URL(raw,window.location.origin);
    if(u.pathname==='/api/route'&&localStorage.getItem(AUTO_ORIGIN)==='1'){
     const saved=readSaved();
     if(saved&&Date.now()-saved.updatedAt<30*60*1000){
      u.searchParams.set('origin',saved.label);
      const next=u.pathname+u.search;
      return nativeFetch(next,init);
     }
    }
   }catch{}
   return nativeFetch(input,init);
  }) as typeof window.fetch;

  const locate=(origin:HTMLInputElement,status:HTMLElement)=>{
   if(locateInFlight.current)return;
   if(!navigator.geolocation){status.textContent='GPS indisponible · saisissez un autre départ';origin.readOnly=false;return;}
   locateInFlight.current=true;setBusy(true);setMessage('Localisation en cours…');
   navigator.geolocation.getCurrentPosition(async p=>{
    try{
     let label=`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
     try{
      const r=await nativeFetch(`/api/reverse-geocode?lat=${p.coords.latitude}&lon=${p.coords.longitude}`,{cache:'no-store'});
      const j=await r.json();
      if(typeof j?.label==='string'&&j.label.trim())label=j.label.trim();
     }catch{}
     const saved:SavedOrigin={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,label,updatedAt:Date.now()};
     localStorage.setItem(LAST_ORIGIN,JSON.stringify(saved));
     localStorage.setItem(AUTO_ORIGIN,'1');
     origin.readOnly=true;
     origin.dataset.flowayGps='1';
     setNativeInputValue(origin,label);
     status.textContent=`📍 Ma position actuelle · GPS ±${Math.round(p.coords.accuracy)} m`;
     setMessage('Départ défini automatiquement sur votre position actuelle');
    }finally{locateInFlight.current=false;setBusy(false);}
   },e=>{
    locateInFlight.current=false;setBusy(false);
    localStorage.setItem(AUTO_ORIGIN,'0');
    origin.readOnly=false;
    origin.removeAttribute('data-floway-gps');
    status.textContent=e.code===1?'Localisation refusée · autorisez le GPS ou saisissez un départ':'Position GPS indisponible · saisissez un départ';
   },{enableHighAccuracy:true,maximumAge:2000,timeout:12000});
  };

  const mount=()=>{
   const form=document.querySelector<HTMLFormElement>('.v3modal');
   if(!form||form.querySelector('[data-floway-current-origin]'))return;
   const labels=form.querySelectorAll('label');
   const origin=labels[0]?.querySelector('input') as HTMLInputElement|null;
   if(!origin)return;

   const row=document.createElement('div');
   row.dataset.flowayCurrentOrigin='1';
   row.style.cssText='display:flex;gap:12px;align-items:center;justify-content:space-between;margin:-6px 0 14px;padding:12px 14px;border:1px solid rgba(78,203,136,.45);border-radius:14px;background:rgba(30,105,72,.12)';
   row.innerHTML='<div style="display:flex;flex-direction:column;gap:3px"><strong style="color:#7fe6a7">📍 Ma position actuelle</strong><small style="color:#9fb2b5">Localisation GPS en cours…</small></div><button type="button" style="white-space:nowrap">AUTRE DÉPART</button>';
   origin.insertAdjacentElement('afterend',row);
   const status=row.querySelector('small') as HTMLElement;
   const change=row.querySelector('button') as HTMLButtonElement;

   origin.readOnly=true;
   origin.placeholder='Localisation automatique…';
   const cached=readSaved();
   if(cached&&Date.now()-cached.updatedAt<10*60*1000){
    setNativeInputValue(origin,cached.label);
    status.textContent=`📍 Ma position actuelle · GPS mémorisé ±${Math.round(cached.accuracy)} m`;
   }

   change.addEventListener('click',()=>{
    const auto=localStorage.getItem(AUTO_ORIGIN)==='1';
    if(auto){
     localStorage.setItem(AUTO_ORIGIN,'0');origin.readOnly=false;origin.removeAttribute('data-floway-gps');change.textContent='MA POSITION';status.textContent='Départ manuel';origin.focus();origin.select();
    }else{
     localStorage.setItem(AUTO_ORIGIN,'1');origin.readOnly=true;change.textContent='AUTRE DÉPART';status.textContent='Localisation GPS en cours…';locate(origin,status);
    }
   });

   if(localStorage.getItem(AUTO_ORIGIN)!=='0')locate(origin,status);
  };

  mount();
  const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});
  return()=>{observer.disconnect();window.fetch=nativeFetch;};
 },[]);

 return message?<div className={`flowayOriginToast ${busy?'busy':''}`}>{message}</div>:null;
}
