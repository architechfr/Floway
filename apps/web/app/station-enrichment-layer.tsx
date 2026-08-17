'use client';

import { useEffect } from 'react';

type Poi={name:string;brand:string|null;categories:string[];distanceM:number;address:string|null;city:string|null;phone:string|null;url:string|null};
type Details={provider:{name:string;connected:boolean;updatedAt?:string};station:Poi|null;restaurants:Poi[];shops:Poi[];message?:string};

function el<K extends keyof HTMLElementTagNameMap>(tag:K,cls?:string,text?:string){const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;}

export default function StationEnrichmentLayer(){
 useEffect(()=>{
  let stopped=false;
  async function enrich(detail:HTMLElement){
   if(detail.querySelector('.flowayPoiEnrichment'))return;
   const body=detail.querySelector<HTMLElement>('.v3detailBody');if(!body)return;
   const h2=body.querySelector('h2')?.textContent?.trim()||'';
   const p=body.querySelector('p')?.textContent?.trim()||'';
   const parts=p.split('·').map(x=>x.trim()).filter(Boolean);
   const query=[h2,parts[0],parts[1]].filter(Boolean).join(' ');
   const panel=el('section','flowayPoiEnrichment');panel.append(el('small','flowayPoiEyebrow','DONNÉES LOCALES ENRICHIES'),el('h3','',"Enseigne & restauration autour de l’arrêt"),el('p','flowayPoiLoading','Recherche des commerces et restaurants proches…'));
   const anchor=body.querySelector('.restaurantCallout')||body.querySelector('.v3detailAI');body.insertBefore(panel,anchor||null);
   try{
    const r=await fetch(`/api/station-details?q=${encodeURIComponent(query)}`,{cache:'no-store'});const data=await r.json() as Details;if(stopped||!panel.isConnected)return;panel.textContent='';panel.append(el('small','flowayPoiEyebrow','DONNÉES LOCALES ENRICHIES'),el('h3','',"Enseigne & restauration autour de l’arrêt"));
    if(!data.provider.connected){panel.append(el('p','flowayPoiNotice',data.message||'Source POI non connectée.'));return;}
    const stationBox=el('div','flowayPoiStation');const brand=data.station?.brand||data.station?.name||'Enseigne à confirmer';stationBox.append(el('span','', '⛽'),el('div',''));const stationCopy=stationBox.lastElementChild as HTMLElement;stationCopy.append(el('small','', 'STATION / ENSEIGNE'),el('strong','',brand));if(data.station?.name&&data.station.name!==brand)stationCopy.append(el('em','',data.station.name));panel.append(stationBox);
    const foodTitle=el('div','flowayPoiTitle');foodTitle.append(el('strong','',`🍴 Restauration à proximité`),el('small','',`${data.restaurants.length} résultat${data.restaurants.length>1?'s':''}`));panel.append(foodTitle);
    if(data.restaurants.length){const list=el('div','flowayPoiList');for(const poi of data.restaurants.slice(0,8)){const row=el('div','flowayPoiRow');const name=el('strong','',poi.brand||poi.name);const meta=el('small','',`${poi.distanceM} m${poi.brand&&poi.name!==poi.brand?` · ${poi.name}`:''}`);row.append(name,meta);list.append(row);}panel.append(list);}else panel.append(el('p','flowayPoiNotice','Aucun restaurant identifié dans un rayon de 1,2 km.'));
    panel.append(el('small','flowayPoiSource',`Source : ${data.provider.name} · données POI distinctes des prix carburant officiels.`));
   }catch{if(panel.isConnected){panel.textContent='';panel.append(el('small','flowayPoiEyebrow','DONNÉES LOCALES ENRICHIES'),el('p','flowayPoiNotice','Enrichissement temporairement indisponible.'));}}
  }
  function scan(){document.querySelectorAll<HTMLElement>('.v3detail').forEach(x=>void enrich(x));}
  scan();const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true});return()=>{stopped=true;observer.disconnect();};
 },[]);
 return null;
}
