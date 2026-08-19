'use client';

import { useEffect, useRef } from 'react';

type SavedSession={origin?:string;destination?:string;navOpen?:boolean;updatedAt?:number};
const SESSION='floway:active-session';

function setInput(input:HTMLInputElement,value:string){const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;setter?.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
function currentRoute(){const b=document.querySelector<HTMLButtonElement>('.v3routeTitle');const t=b?.textContent?.replace(/\s+/g,' ').trim()||'';const p=t.split('→').map(x=>x.replace('✎','').trim()).filter(Boolean);return p.length>=2?{origin:p[0],destination:p[1]}:null;}

export default function SessionRestoreLayer(){
 const restored=useRef(false);
 useEffect(()=>{
   const restore=()=>{
     if(restored.current)return;
     let saved:SavedSession={};try{saved=JSON.parse(localStorage.getItem(SESSION)||'{}')}catch{}
     if(!saved.origin||!saved.destination){const cur=currentRoute();if(cur)try{localStorage.setItem(SESSION,JSON.stringify({...cur,updatedAt:Date.now()}))}catch{};return;}
     const cur=currentRoute();if(!cur)return;
     const same=cur.origin.toLowerCase()===saved.origin.toLowerCase()&&cur.destination.toLowerCase()===saved.destination.toLowerCase();
     if(same){restored.current=true;return;}
     const routeButton=document.querySelector<HTMLButtonElement>('.v3routeTitle');routeButton?.click();
     window.setTimeout(()=>{const form=document.querySelector<HTMLFormElement>('.v3modal');const inputs=form?.querySelectorAll<HTMLInputElement>('input');if(!form||!inputs||inputs.length<2)return;setInput(inputs[0],saved.origin!);setInput(inputs[1],saved.destination!);restored.current=true;form.requestSubmit();},120);
   };
   const timer=window.setTimeout(restore,650);
   const persist=window.setInterval(()=>{const cur=currentRoute();if(cur)try{const old=JSON.parse(localStorage.getItem(SESSION)||'{}');localStorage.setItem(SESSION,JSON.stringify({...old,...cur,updatedAt:Date.now()}))}catch{}},2000);
   return()=>{window.clearTimeout(timer);window.clearInterval(persist)};
 },[]);
 return null;
}
