'use client';

import { useEffect } from 'react';

type Place={id:string;label:string;address:string;icon:string;priority:boolean};
const KEY='floway:saved-places';
const DEFAULTS:Place[]=[
 {id:'home',label:'Domicile',address:'',icon:'🏠',priority:true},
 {id:'work',label:'Bureau',address:'',icon:'💼',priority:true},
 {id:'second-home',label:'Maison secondaire',address:'',icon:'⭐',priority:true},
];

function load(){try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]') as Place[];const map=new Map(raw.map(p=>[p.id,p]));return [...DEFAULTS.map(p=>({...p,...map.get(p.id)})),...raw.filter(p=>!DEFAULTS.some(d=>d.id===p.id))];}catch{return DEFAULTS}}
function save(x:Place[]){localStorage.setItem(KEY,JSON.stringify(x));}
function setNativeInputValue(input:HTMLInputElement,value:string){const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')?.set;setter?.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}

export default function SavedPlacesLayer(){
 useEffect(()=>{
  const mount=()=>{
   const form=document.querySelector<HTMLFormElement>('.v3modal');
   if(!form||form.querySelector('[data-floway-saved-places]'))return;
   const labels=form.querySelectorAll('label');
   const destination=labels[1]?.querySelector('input') as HTMLInputElement|null;
   if(!destination)return;
   const box=document.createElement('section');box.dataset.flowaySavedPlaces='1';box.className='flowaySavedPlaces';
   const render=()=>{
    const places=load();box.innerHTML='<small>DESTINATIONS RAPIDES</small><div class="flowayPriorityPlaces"></div><div class="flowayRegularPlaces"></div>';
    const priority=box.querySelector('.flowayPriorityPlaces')!;const regular=box.querySelector('.flowayRegularPlaces')!;
    places.filter(p=>p.priority).forEach(p=>{const b=document.createElement('button');b.type='button';b.className=p.address?'savedPlace ready':'savedPlace empty';b.textContent=`${p.icon} ${p.label}${p.address?'':' +'}`;b.addEventListener('click',()=>{if(!p.address){const a=window.prompt(`Adresse pour ${p.label}`,'');if(!a?.trim())return;const next=load().map(x=>x.id===p.id?{...x,address:a.trim()}:x);save(next);render();return;}setNativeInputValue(destination,p.address);});priority.appendChild(b)});
    places.filter(p=>!p.priority).forEach(p=>{const b=document.createElement('button');b.type='button';b.className='savedPlace regular';b.textContent=`☆ ${p.label}`;b.addEventListener('click',()=>setNativeInputValue(destination,p.address));regular.appendChild(b)});
    const add=document.createElement('button');add.type='button';add.className='savedPlace add';add.textContent='+ FAVORI';add.addEventListener('click',()=>{const label=window.prompt('Nom du favori','');if(!label?.trim())return;const address=window.prompt(`Adresse de ${label.trim()}`,'');if(!address?.trim())return;const next=load();next.push({id:`fav-${Date.now()}`,label:label.trim(),address:address.trim(),icon:'☆',priority:false});save(next);render();});regular.appendChild(add);
   };
   render();destination.insertAdjacentElement('afterend',box);
  };
  mount();const o=new MutationObserver(mount);o.observe(document.body,{childList:true,subtree:true});return()=>o.disconnect();
 },[]);
 return null;
}
