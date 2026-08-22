import { NextRequest, NextResponse } from 'next/server';

import { timeoutFetch } from '../_lib/http';
import { positionDeRequete } from '../../../../../packages/algorithms/query-params.mjs';
import { cleIncident } from '../../../../../packages/algorithms/alerts.mjs';

// Masque le `fetch` global pour ce module : tout appel sortant est abandonné
// automatiquement au-delà du délai, sans modifier les points d'appel.
const fetch = timeoutFetch();

type Incident={type?:string;geometry?:{type?:string;coordinates?:unknown};properties?:{iconCategory?:number;magnitudeOfDelay?:number;events?:Array<{description?:string;code?:number}>;startTime?:string;endTime?:string;from?:string;to?:string;length?:number;delay?:number;roadNumbers?:string[]}};
const labels:Record<number,string>={1:'Accident',2:'Brouillard',3:'Conditions dangereuses',4:'Pluie',5:'Verglas',6:'Bouchon',7:'Voie fermée',8:'Route fermée',9:'Travaux',10:'Vent',11:'Inondation',14:'Véhicule en panne'};
const icons:Record<number,string>={1:'⚠️',2:'🌫️',3:'⚠️',4:'🌧️',5:'🧊',6:'🚗',7:'🚧',8:'⛔',9:'🚧',10:'💨',11:'🌊',14:'🛠️'};
function firstPoint(g:Incident['geometry']):[number,number]|null{if(!g?.coordinates)return null;const c=g.coordinates as any;if(g.type==='Point'&&Array.isArray(c)&&typeof c[0]==='number')return[c[0],c[1]];if(Array.isArray(c?.[0])&&typeof c[0][0]==='number')return[c[0][0],c[0][1]];if(Array.isArray(c?.[0]?.[0])&&typeof c[0][0][0]==='number')return[c[0][0][0],c[0][0][1]];return null;}
export async function GET(req:NextRequest){const key=process.env.TOMTOM_API_KEY;const coin=(a:string,b:string)=>positionDeRequete(req.nextUrl.searchParams.get(a),req.nextUrl.searchParams.get(b));
// Number(null) vaut 0 et passe Number.isFinite : une bbox absente devenait
// 0,0,0,0 et interrogeait TomTom au large du golfe de Guinee.
const bas=coin('minLat','minLon'),haut=coin('maxLat','maxLon');
if(!bas||!haut)return NextResponse.json({error:'bbox requis'},{status:400});
const minLon=bas.lon,minLat=bas.lat,maxLon=haut.lon,maxLat=haut.lat;if(!key)return NextResponse.json({provider:{name:'TomTom Traffic Incidents',connected:false},incidents:[],speedCamera:{connected:false,label:'Zones de danger / radars : source dédiée à connecter'},message:'Aucune alerte simulée.'});try{const u=new URL('https://api.tomtom.com/traffic/services/5/incidentDetails');u.searchParams.set('key',key);u.searchParams.set('bbox',`${minLon},${minLat},${maxLon},${maxLat}`);u.searchParams.set('language','fr-FR');u.searchParams.set('timeValidityFilter','present');u.searchParams.set('categoryFilter','Accident,DangerousConditions,Rain,Ice,Jam,LaneClosed,RoadClosed,RoadWorks,Wind,Flooding,BrokenDownVehicle');u.searchParams.set('fields','{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,from,to,length,delay,roadNumbers}}}');const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)throw new Error(`TOMTOM_${r.status}`);const d=await r.json() as {incidents?:Incident[]};const incidents=(d.incidents||[]).map((i,index)=>{const category=i.properties?.iconCategory||0,p=firstPoint(i.geometry),delaySec=i.properties?.delay||0;
// L'identifiant etait le rang dans la reponse (`incident-0`, `incident-1`...).
// Ce rang change des qu'un incident apparait ou disparait : un acquittement
// enregistre sur `incident-2` aurait masque un autre incident au releve
// suivant. La cle decrit desormais l'incident lui-meme.
const cle=cleIncident({category,roads:i.properties?.roadNumbers||[],from:i.properties?.from||null,to:i.properties?.to||null,lat:p?.[1]??null,lon:p?.[0]??null});
return{id:cle||`incident-${index}`,key:cle,category,label:labels[category]||'Incident routier',icon:icons[category]||'⚠️',description:i.properties?.events?.[0]?.description||labels[category]||'Incident routier',magnitude:i.properties?.magnitudeOfDelay??0,delayMin:delaySec?Math.round(delaySec/60):null,from:i.properties?.from||null,to:i.properties?.to||null,roads:i.properties?.roadNumbers||[],lat:p?.[1]??null,lon:p?.[0]??null,startTime:i.properties?.startTime||null,endTime:i.properties?.endTime||null};});return NextResponse.json({provider:{name:'TomTom Traffic Incidents',connected:true,updatedAt:new Date().toISOString()},incidents,speedCamera:{connected:false,label:'Zones de danger / radars : source dédiée à connecter'},message:'Incidents routiers temps réel uniquement. Aucun radar inventé.'});}catch(e){return NextResponse.json({provider:{name:'TomTom Traffic Incidents',connected:false},incidents:[],speedCamera:{connected:false,label:'Zones de danger / radars : source dédiée à connecter'},error:e instanceof Error?e.message:'SAFETY_ERROR'},{status:502});}}
