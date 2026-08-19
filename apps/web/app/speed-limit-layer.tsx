'use client';

import { useEffect } from 'react';

type Pt={lat:number;lon:number;heading:number|null;speed:number|null;ts:number};
const rad=(n:number)=>n*Math.PI/180;
function distance(a:Pt,b:Pt){const R=6371000,dLat=rad(b.lat-a.lat),dLon=rad(b.lon-a.lon),la1=rad(a.lat),la2=rad(b.lat);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h));}

export default function SpeedLimitLayer(){
  useEffect(()=>{
    if(!navigator.geolocation)return;
    let watch:number|null=null;
    let previous:Pt|null=null;
    let lastLookup=0;
    let active=false;
    let cancelled=false;

    const paint=(limit:number|null,road:string|null,speed:number|null,connected:boolean)=>{
      const sign=document.querySelector<HTMLElement>('.roadLimit');
      const value=sign?.querySelector<HTMLElement>('b');
      const label=sign?.querySelector<HTMLElement>('span');
      const speedBox=document.querySelector<HTMLElement>('.roadSpeed');
      if(!sign||!value||!label)return;
      if(limit!=null&&Number.isFinite(limit)){
        value.textContent=String(Math.round(limit));
        label.textContent=road?road.slice(0,18):'limite';
        sign.classList.add('known');
        sign.classList.remove('unavailable');
        speedBox?.classList.toggle('overLimit',speed!=null&&speed>limit+2);
      }else{
        value.textContent='—';
        label.textContent=connected?'non renseignée':'indisponible';
        sign.classList.remove('known');
        sign.classList.add('unavailable');
        speedBox?.classList.remove('overLimit');
      }
    };

    const stop=()=>{if(watch!==null){navigator.geolocation.clearWatch(watch);watch=null;}previous=null;};
    const start=()=>{
      if(watch!==null)return;
      watch=navigator.geolocation.watchPosition(async p=>{
        const current:Pt={lat:p.coords.latitude,lon:p.coords.longitude,heading:Number.isFinite(p.coords.heading)?p.coords.heading:null,speed:p.coords.speed!=null?Math.max(0,p.coords.speed*3.6):null,ts:p.timestamp};
        if(!previous){previous=current;return;}
        const moved=distance(previous,current);
        if(moved<8&&Date.now()-lastLookup<12000)return;
        const from=previous;previous=current;
        if(Date.now()-lastLookup<5000)return;
        lastLookup=Date.now();
        try{
          const q=new URLSearchParams({lat1:String(from.lat),lon1:String(from.lon),lat2:String(current.lat),lon2:String(current.lon)});
          if(current.heading!=null)q.set('heading',String(current.heading));
          const r=await fetch(`/api/speed-limit?${q.toString()}`,{cache:'no-store'});
          const j=await r.json();
          if(cancelled)return;
          paint(typeof j.speedLimit==='number'?j.speedLimit:null,j.roadName||j.roadNumbers?.[0]||null,current.speed,Boolean(j.connected));
        }catch{if(!cancelled)paint(null,null,current.speed,false);}
      },()=>paint(null,null,null,false),{enableHighAccuracy:true,maximumAge:3000,timeout:12000});
    };

    const sync=()=>{const open=Boolean(document.querySelector('.roadNavOverlay'));if(open&&!active){active=true;start();}else if(!open&&active){active=false;stop();}};
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{childList:true,subtree:true});
    sync();
    return()=>{cancelled=true;observer.disconnect();stop();};
  },[]);
  return null;
}
