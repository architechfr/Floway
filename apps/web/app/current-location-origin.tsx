'use client';

import { useEffect, useState } from 'react';

const LAST_ORIGIN='floway:last-origin-gps';

function setNativeInputValue(input:HTMLInputElement,value:string){
 const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;
 setter?.call(input,value);
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
}

export default function CurrentLocationOrigin(){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  const mount=()=>{
   const form=document.querySelector<HTMLFormElement>('.v3modal');
   if(!form||form.querySelector('[data-floway-current-origin]'))return;
   const labels=form.querySelectorAll('label');
   const origin=labels[0]?.querySelector('input') as HTMLInputElement|null;
   if(!origin)return;
   const btn=document.createElement('button');
   btn.type='button';btn.dataset.flowayCurrentOrigin='1';btn.className='flowayCurrentOrigin';
   btn.textContent='📍 UTILISER MA POSITION';
   btn.addEventListener('click',()=>{
    if(!navigator.geolocation){setMessage('Géolocalisation indisponible sur cet appareil.');return;}
    setBusy(true);setMessage('Localisation en cours…');
    navigator.geolocation.getCurrentPosition(async p=>{
      try{
        const r=await fetch(`/api/reverse-geocode?lat=${p.coords.latitude}&lon=${p.coords.longitude}`,{cache:'no-store'});
        const j=await r.json();
        const label=typeof j?.label==='string'&&j.label.trim()?j.label.trim():`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
        setNativeInputValue(origin,label);
        try{localStorage.setItem(LAST_ORIGIN,JSON.stringify({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,label,updatedAt:Date.now()}));}catch{}
        setMessage(`Ma position détectée · ${label}`);
      }catch{
        setMessage('Position détectée, mais adresse momentanément indisponible.');
      }finally{setBusy(false);}
    },()=>{setBusy(false);setMessage('Autorise la localisation pour utiliser Ma position.');},{enableHighAccuracy:true,maximumAge:3000,timeout:12000});
   });
   origin.insertAdjacentElement('afterend',btn);
  };
  mount();const o=new MutationObserver(mount);o.observe(document.body,{childList:true,subtree:true});return()=>o.disconnect();
 },[]);
 return message?<div className={`flowayOriginToast ${busy?'busy':''}`}>{message}</div>:null;
}
