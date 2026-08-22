'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OriginField from './origin-field';
import { placeLabel } from './lib/place-label';
import { stationTitle, stationSubtitle } from './lib/station-label';
import { useDepartureFuelStation } from './lib/departure-fuel';
import { formatTimeInZone, instantFromLocalInput } from './lib/energy/trip-clock';
import TripContextPanel from './trip-context-panel';
import RouteMap from './route-map';
import { useFlowayStore, routeKey } from './state/floway-store';
import QuickFuelSheet from './quick-fuel-sheet';
import RoutePriceRibbon, { summarizePrices } from './route-price-ribbon';
import SavedPlaces from './saved-places';
import ActionSheet, { type ActionPanel } from './action-sheet';
import RouteActions from './route-actions';
import Toast from './toast';
import StationFuelPanel from './station-fuel-panel';
import StationPoiPanel from './station-poi-panel';
import { rankStops, buildJourney, waitLevel } from './lib/energy/stop-planner';
import type { JourneyStep } from './lib/energy/stop-planner';
import { planEnergy } from './lib/energy/model';
import { cumulativeDistances, routeProgress } from './lib/route-progress';
import NextStations from './next-stations';
import StationOrderSwitch, { type StationOrder } from './station-order';

type Station={id:string;name:string;brand?:string;city:string;address?:string;distanceKm:number;routeOffsetKm?:number;price:number;waitMin:number;detourMin:number;lat?:number;lon?:number;arrivalHour?:number;arrivalMinute?:number;arrivalIso?:string;services?:string[];serviceCategories?:string[];flowayContextScore?:number;smartContext?:{message:string;intent?:string};sources?:{station?:string;priceFreshness?:string;wait?:string};waitModel?:{label:string;confidence:string;measured?:boolean;factors:string[]};priceQuality?:{updatedAt?:string|null;ageHours?:number|null;status?:string;confidence?:string};highway?:boolean;openingHours?:string|null};
type RouteData={origin:{label:string;lat?:number;lon?:number};destination:{label:string;lat?:number;lon?:number};distanceKm:number;durationMin:number;baseDurationMin?:number;stations:Station[];fuel:string;geometry?:{coordinates:[number,number][]};traffic?:{live:boolean;label:string;delayMin:number|null;source?:string|null}};
type Filter='Tous'|'Restauration'|'Café'|'Boutique'|'Toilettes';
type Intent='Auto'|'Manger'|'Café'|'Carburant'|'Recharge'|'Toilettes';
type LivePosition={lat:number;lon:number;accuracy:number;speed:number|null;updatedAt:number};
type JourneyEvent={station:Station;kind:string;label:string;reasons?:string[]};
type SafetyIncident={id:string;label:string;icon:string;description:string;delayMin?:number|null;lat?:number|null;lon?:number|null;roads?:string[]};

const stepIcon=(kind:string)=>kind==='carburant'?'⛽':kind==='repas'?'🍴':kind==='confort'?'☕':'📍';
const serviceIcon=(s:string)=>s==='Restauration'?'🍴':s==='Café'?'☕':s==='Boutique'?'🛍':s==='Toilettes'?'🚻':s==='Recharge VE'?'⚡':s==='Douches'?'🚿':s==='Wi-Fi'?'📶':'⛽';
const duration=(m=0)=>{const h=Math.floor(m/60),r=Math.max(0,Math.round(m%60));return h?`${h} h ${String(r).padStart(2,'0')}`:`${r} min`};
// L'heure affichee vient de l'instant absolu renvoye par l'API, formate dans
// le fuseau du trajet. Les champs arrivalHour/Minute restent un repli.
const clock=(s?:Station)=>{if(s?.arrivalIso){const d=new Date(s.arrivalIso);if(!Number.isNaN(d.getTime()))return formatTimeInZone(d);}
 return s?.arrivalHour==null?'--:--':`${String(s.arrivalHour).padStart(2,'0')}:${String(s.arrivalMinute||0).padStart(2,'0')}`};
const localDateTime=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const toRad=(n:number)=>n*Math.PI/180;
function haversine(a:[number,number],b:[number,number]){const R=6371,dLat=toRad(b[1]-a[1]),dLon=toRad(b[0]-a[0]),la1=toRad(a[1]),la2=toRad(b[1]);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
function intentCategory(intent:Intent){return intent==='Manger'?'Restauration':intent==='Recharge'?'Recharge VE':intent==='Carburant'?'Carburant':intent;}
function score(s:Station,intent:Intent){let value=s.waitMin+s.detourMin+s.price*2-(s.flowayContextScore||0);if(intent!=='Auto'){const cat=intentCategory(intent);const match=cat==='Carburant'||s.serviceCategories?.includes(cat);value+=match?-25:80;}return value;}
// Seuils d'affluence : ceux du moteur de classement, pas une seconde table
// qui derivrait. Sans estimation, on le dit plutot que d'afficher un niveau.
function crowd(wait?:number){const l=waitLevel(wait);return l?{label:l.label,icon:l.icon}:{label:'non estimée',icon:'—'};}
function eventLabel(kind:string){return kind==='Restauration'?'Repas':kind==='Café'?'Pause café':kind==='Recharge VE'?'Recharge':kind==='Toilettes'?'Pause':kind==='Carburant'?'Ravitaillement':'Arrêt';}

export default function FlowayV3(){
 const [origin,setOrigin]=useState('Paris'); const [destination,setDestination]=useState('Lyon');
 const [draftOrigin,setDraftOrigin]=useState('Paris'); const [draftDestination,setDraftDestination]=useState('Lyon');
 const [departure,setDeparture]=useState(localDateTime()); const [draftDeparture,setDraftDeparture]=useState(localDateTime());
 const [fuel,setFuel]=useState('Gazole'); const [route,setRoute]=useState<RouteData|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 const [editing,setEditing]=useState(false); const [selected,setSelected]=useState<Station|null>(null); const [filter,setFilter]=useState<Filter>('Tous'); const [intent,setIntent]=useState<Intent>('Manger');
 const [hydrated,setHydrated]=useState(false);
 const [live,setLive]=useState<LivePosition|null>(null); const [gpsState,setGpsState]=useState<'off'|'requesting'|'on'|'error'>('off'); const [gpsError,setGpsError]=useState(''); const watchRef=useRef<number|null>(null);
 const [fuelSheetOpen,setFuelSheetOpen]=useState(false);
 const [panel,setPanel]=useState<ActionPanel>(null);
 const [toast,setToast]=useState('');
 const [stopFavorite,setStopFavorite]=useState(false);
 const toastTimer=useRef<number|null>(null);
 const [stationOrder,setStationOrder]=useState<StationOrder>('classement');
 const [navOpen,setNavOpen]=useState(false); const [safetyConnected,setSafetyConnected]=useState(false); const [safetyIncidents,setSafetyIncidents]=useState<SafetyIncident[]>([]); const [safetyUpdatedAt,setSafetyUpdatedAt]=useState<string|null>(null);

 const { vehicleConfirmed, vehicle:storeVehicle, trip:storeTrip, setTrip:setStoreTrip, lastRoute, setLastRoute, hydrated:storeHydrated, favoriteRoutes, toggleFavoriteRoute } = useFlowayStore();

 // Source unique du niveau de carburant depuis la suppression du profil
 // vehicule historique : `trip.fuelLevelPct` du store, celui qui alimente
 // le plan d'energie.
 const applyFuelPct=useCallback((next:number)=>{
  setStoreTrip({fuelLevelPct:Math.max(0,Math.min(100,Math.round(next)))});
 },[setStoreTrip]);

 // Un seul calcul d'itineraire a la fois : changer de carburant ou inverser le
 // trajet coup sur coup lançait plusieurs requetes, et la premiere revenue
 // ecrasait la derniere demandee. Le calcul en cours est abandonne.
 const routeEnCours=useRef<AbortController|null>(null);
 useEffect(()=>()=>routeEnCours.current?.abort(),[]);
 async function loadRoute(from:string,to:string,nextFuel=fuel,when=departure){
  routeEnCours.current?.abort();
  const controller=new AbortController();
  routeEnCours.current=controller;
  setLoading(true);setError('');
  try{
   const iso=(instantFromLocalInput(when)||new Date()).toISOString();
   const r=await fetch(`/api/route?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&fuel=${encodeURIComponent(nextFuel)}&departureAt=${encodeURIComponent(iso)}`,{cache:'no-store',signal:controller.signal});
   const j=await r.json();
   if(controller.signal.aborted)return;
   if(!r.ok)throw new Error(j.error||'Calcul impossible');
   setRoute(j);setOrigin(j.origin.label);setDestination(j.destination.label);setDeparture(when);
   setLastRoute({origin:j.origin.label,destination:j.destination.label});
  }catch(e){
   // Abandon volontaire : une requete plus recente a pris la main, il n'y a
   // ni erreur a afficher ni chargement a arreter.
   if(controller.signal.aborted)return;
   setError(e instanceof Error?e.message:'Impossible de calculer cet itinéraire.');
  }finally{
   if(!controller.signal.aborted)setLoading(false);
  }
 }
 // Arret de la surveillance GPS au demontage, independamment du chargement
 // initial : ce dernier attend l'hydratation du store et se relancerait sinon.
 useEffect(()=>()=>{if(watchRef.current!==null&&typeof navigator!=='undefined'&&navigator.geolocation)navigator.geolocation.clearWatch(watchRef.current)},[]);

 // Chargement initial. Il reprend le dernier trajet calcule, la ou l'ancien
 // layer `session-restore` ouvrait la fenetre d'itineraire, reecrivait les
 // deux champs via le setter natif de HTMLInputElement puis appelait
 // requestSubmit() 650 ms apres l'affichage. Le store etant hydrate dans un
 // effet du provider, qui s'execute apres ceux de ses enfants, on attend
 // `storeHydrated` avant de lire `lastRoute`.
 // Profil vehicule et intention : relus des le montage, sans dependre du
 // store, pour que l'affichage parte tout de suite sur les bonnes valeurs.
 useEffect(()=>{
  const now=localDateTime();setDeparture(now);setDraftDeparture(now);
  // `floway:vehicle` portait le profil historique (marque, reservoir, conso),
  // remplace par le profil du store. La cle est retiree pour de bon.
  try{const savedIntent=localStorage.getItem('floway:intent') as Intent|null;if(savedIntent)setIntent(savedIntent);localStorage.removeItem('floway:vehicle');}catch{}
  setHydrated(true);
 },[]);

 // Chargement initial de l'itineraire. Il reprend le dernier trajet calcule,
 // la ou l'ancien layer `session-restore` ouvrait la fenetre d'itineraire,
 // reecrivait les deux champs via le setter natif de HTMLInputElement puis
 // appelait requestSubmit() 650 ms apres l'affichage. Le store etant hydrate
 // dans un effet du provider, qui s'execute apres ceux de ses enfants, on
 // attend `storeHydrated` avant de lire `lastRoute`.
 const booted=useRef(false);
 useEffect(()=>{
  if(!storeHydrated||booted.current)return;
  booted.current=true;
  const start=lastRoute??{origin:'Paris',destination:'Lyon'};
  setDraftOrigin(start.origin);setDraftDestination(start.destination);
  void loadRoute(start.origin,start.destination,'Gazole',localDateTime());
 },[storeHydrated,lastRoute]);
 useEffect(()=>{if(!hydrated)return;try{localStorage.setItem('floway:intent',intent)}catch{}},[intent,hydrated]);
 function startGps(){if(typeof navigator==='undefined'||!navigator.geolocation){setGpsState('error');setGpsError('Géolocalisation non disponible sur cet appareil.');return}if(watchRef.current!==null){navigator.geolocation.clearWatch(watchRef.current);watchRef.current=null;setGpsState('off');setLive(null);return}setGpsState('requesting');setGpsError('');watchRef.current=navigator.geolocation.watchPosition(p=>{setLive({lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy,speed:p.coords.speed,updatedAt:p.timestamp});setGpsState('on')},e=>{setGpsState('error');setGpsError(e.code===1?'Autorise la localisation dans ton navigateur pour activer le mode trajet.':'Position GPS momentanément indisponible.')},{enableHighAccuracy:true,maximumAge:5000,timeout:12000});}
 const [roadLimit,setRoadLimit]=useState<{limit:number|null;road:string|null;connected:boolean}|null>(null);

 // Position quantifiee a ~220 m : la limitation change par troncon, pas au
 // metre. Sans cela l'effet se relancerait a chaque tick GPS, et le quota
 // gratuit Snap to Roads (2 500 requetes par mois) partirait en une soiree.
 const limitLat=live?Math.round(live.lat*500)/500:null,limitLon=live?Math.round(live.lon*500)/500:null;
 const lastLimitAt=useRef(0);
 useEffect(()=>{
  if(!navOpen||limitLat===null||limitLon===null){setRoadLimit(null);return;}
  // Garde-fou supplementaire : jamais plus d'un appel toutes les 8 secondes,
  // meme si la position quantifiee change vite.
  if(Date.now()-lastLimitAt.current<8000)return;
  lastLimitAt.current=Date.now();
  let cancelled=false;
  const q=new URLSearchParams({lat1:String(limitLat),lon1:String(limitLon),lat2:String(limitLat+0.0015),lon2:String(limitLon+0.0015)});
  if(live?.speed!=null)q.set('heading',String(Math.max(0,Math.round((live.speed||0)*0))));
  fetch(`/api/speed-limit?${q.toString()}`,{cache:'no-store'})
   .then(r=>r.json())
   .then(j=>{if(cancelled)return;setRoadLimit({limit:typeof j?.speedLimit==='number'?j.speedLimit:null,road:j?.roadName||j?.roadNumbers?.[0]||null,connected:Boolean(j?.connected)});})
   .catch(()=>{if(!cancelled)setRoadLimit(null);});
  return()=>{cancelled=true};
 },[navOpen,limitLat,limitLon,live?.speed]);

 // Position quantifiee a 0.05 deg (~5 km) : les deps de l'effet ne changent
 // plus a chaque tick GPS (~1 Hz), sinon l'intervalle de 30 s etait annule
 // avant de se declencher et /api/safety etait appele ~60 fois par minute.
 const safetyLat=live?Math.round(live.lat*20)/20:null,safetyLon=live?Math.round(live.lon*20)/20:null;
 useEffect(()=>{if(safetyLat===null||safetyLon===null)return;let cancelled=false;const run=async()=>{try{const latPad=.18,lonPad=.24;const u=`/api/safety?minLon=${safetyLon-lonPad}&minLat=${safetyLat-latPad}&maxLon=${safetyLon+lonPad}&maxLat=${safetyLat+latPad}`;const r=await fetch(u,{cache:'no-store'});const j=await r.json();if(cancelled)return;setSafetyConnected(Boolean(j?.provider?.connected));setSafetyIncidents(Array.isArray(j?.incidents)?j.incidents:[]);setSafetyUpdatedAt(j?.provider?.updatedAt||null);}catch{if(!cancelled){setSafetyConnected(false);setSafetyIncidents([])}}};void run();const id=window.setInterval(run,30000);return()=>{cancelled=true;window.clearInterval(id)}},[safetyLat,safetyLon]);

 const stations=useMemo(()=>[...(route?.stations||[])].sort((a,b)=>a.distanceKm-b.distanceKm),[route]);
  // Cumul des distances : une fois par itineraire. Il etait recalcule a chaque
 // point GPS, soit un parcours complet de la geometrie environ une fois par
 // seconde.
 const cumulKm=useMemo(()=>{const coords=route?.geometry?.coordinates;return coords?.length?cumulativeDistances(coords):null},[route]);
 // Dernier sommet atteint : la recherche repart de la, un vehicule avance.
 const dernierSommet=useRef(0);
 useEffect(()=>{dernierSommet.current=0},[route]);
 const liveProgress=useMemo(()=>{
  const coords=route?.geometry?.coordinates;
  if(!live||!coords?.length||!cumulKm)return null;
  const p=routeProgress(coords,cumulKm,[live.lon,live.lat],{fromIndex:dernierSommet.current});
  if(!p)return null;
  dernierSommet.current=p.index;
  return {km:Math.min(route!.distanceKm,p.km),offRouteKm:p.offRouteKm,remainingKm:Math.max(0,route!.distanceKm-p.km)};
 },[live,route,cumulKm]);
 const currentKm=liveProgress?.km||0;

 // Plan d'energie issu du vehicule et du niveau saisis par l'utilisateur.
 // Null tant qu'il n'a rien renseigne : on ne suppose ni reservoir ni
 // consommation. C'est la seule source d'autonomie de l'ecran depuis la
 // suppression du profil vehicule historique, qui restait figé sur un
 // Volkswagen Tiguan que personne ne pouvait corriger.
 const energyPlan=useMemo(()=>{
  if(!storeVehicle)return null;
  const electric=storeVehicle.energyKind==='electrique';
  const capacity=electric?storeVehicle.battery?.value:storeVehicle.tank?.value;
  const consumption=electric?storeVehicle.electricConsumption?.value:storeVehicle.fuelConsumption?.value;
  const level=electric?storeTrip.batteryLevelPct:storeTrip.fuelLevelPct;
  // distanceKm a 0 tant que l'itineraire n'est pas calcule : l'autonomie n'en
  // depend pas, seuls les champs « trajet » du plan restent alors sans objet.
  const plan=planEnergy({capacity,consumption,levelPct:level,distanceKm:route?.distanceKm??0,reservePct:storeTrip.reservePct});
  return plan.missing.length?null:plan;
 },[storeVehicle,storeTrip,route]);
 // Niveau du reservoir ou de la batterie selon l'energie du vehicule retenu.
 const electricVehicle=storeVehicle?.energyKind==='electrique';
 const levelPct=electricVehicle?storeTrip.batteryLevelPct:storeTrip.fuelLevelPct;
 // Synthese des prix : lue dans les stations deja renvoyees par /api/route.
 // L'ancien layer `route-price` refaisait l'appel entier pour cela seul.
 const priceSummary=useMemo(()=>summarizePrices(stations,fuel),[stations,fuel]);
 // Autonomie affichee : `null` tant que le vehicule n'est pas renseigne.
 // On prefere ne rien afficher a afficher un chiffre invente.
 const theoreticalRange=energyPlan?.remainingRangeKm??null;
 const usableRange=energyPlan?.usableRemainingRangeKm??null;
 const emergencyFuel=energyPlan!==null&&(levelPct<=10||(usableRange??0)<=0);
 const criticalRange=theoreticalRange===null?0:Math.max(0,theoreticalRange-Math.max(10,theoreticalRange*.25));
 const fuelTargetKm=route&&usableRange!==null?Math.min(route.distanceKm,Math.max(currentKm,currentKm+usableRange)):null;

 const eligible=useMemo(()=>stations.filter(s=>s.distanceKm>=currentKm&&(filter==='Tous'||s.serviceCategories?.includes(filter))),[stations,currentKm,filter]);
 const emergencyStations=useMemo(()=>eligible.filter(s=>s.distanceKm-currentKm<=criticalRange),[eligible,currentKm,criticalRange]);
 // Classement motive : besoin reel de carburant, heure de passage, horaires
 // d'ouverture, prix et nombre de personnes a bord.
 // Plein avant de partir.
 //
 // Le besoin se lit sur le plan d'energie, pas sur le classement : c'est le
 // classement qui doit s'y adapter, sinon la dependance tourne en rond.
 const pleinNecessaire=energyPlan!==null&&energyPlan.firstStopAtKm!==null&&currentKm<1;
 const departureStation=useDepartureFuelStation(route?.origin,fuel,pleinNecessaire);

 // Situation energetique une fois le plein fait au depart.
 const energyPlanApresPlein=useMemo(()=>{
  if(!storeVehicle||!route)return null;
  const electric=storeVehicle.energyKind==='electrique';
  const capacity=electric?storeVehicle.battery?.value:storeVehicle.tank?.value;
  const consumption=electric?storeVehicle.electricConsumption?.value:storeVehicle.fuelConsumption?.value;
  const plan=planEnergy({capacity,consumption,levelPct:100,distanceKm:route.distanceKm,reservePct:storeTrip.reservePct});
  return plan.missing.length?null:plan;
 },[storeVehicle,storeTrip,route]);

 // Si l'on fait le plein avant de partir, la suite du trajet se planifie sur
 // un reservoir plein. Sans cela, le classement n'admettrait comme arrets
 // carburant que les stations atteignables avec le niveau *actuel* — souvent
 // aucune — et la route resterait sans ravitaillement apres le plein.
 // Apres un plein — au depart comme en urgence — la suite du trajet roule sur
 // un reservoir plein. Sans cela le classement n'admet comme arrets carburant
 // que les stations atteignables avec le niveau *actuel*, souvent aucune.
 const energyPlanEffectif=(departureStation||emergencyFuel)?energyPlanApresPlein:energyPlan;

 const stopPlan=useMemo(()=>rankStops({
  stations:eligible,
  departureAt:instantFromLocalInput(departure)||new Date(),
  durationMin:route?.durationMin||0,
  distanceKm:route?.distanceKm||0,
  currentKm,
  energyPlan:energyPlanEffectif,
  context:{passengers:storeTrip.passengers,meal:storeTrip.meal},
 }),[eligible,departure,route,currentKm,energyPlanEffectif,storeTrip]);

 const best=useMemo(()=>{if(emergencyFuel){const pool=emergencyStations.length?emergencyStations:eligible.filter(s=>s.distanceKm-currentKm<=(theoreticalRange??0)*.92);
  // On y fait le plein complet : c'est le litre qui compte, pas le kilometre.
  // Le tri purement kilometrique proposait l'aire la plus proche en ignorant
  // son prix, alors que 0,10 EUR/L sur un reservoir de 60 L font 6 EUR pour
  // quelques kilometres. L'atteignabilite reste la contrainte, le prix devient
  // l'objectif ; un kilometre parcouru vaut environ trois centimes au litre,
  // meme convention que la recherche de station au depart.
  const cout=(x:Station)=>(typeof x.price==='number'&&x.price>0?x.price:Number.POSITIVE_INFINITY)+((x.distanceKm-currentKm)+x.detourMin*2)*.003;
  return[...pool].sort((a,b)=>cout(a)-cout(b))[0]}const cat=intentCategory(intent);const preferred=intent==='Auto'||cat==='Carburant'?eligible:eligible.filter(s=>s.serviceCategories?.includes(cat));const pool=preferred.length?preferred:eligible;const ids=new Set(pool.map(x=>x.id));const rankedId=stopPlan.stops.find(x=>ids.has(String(x.station.id)))?.station.id;const ranked=pool.find(x=>x.id===rankedId);return ranked||[...pool].sort((a,b)=>score(a,intent)-score(b,intent))[0]},[eligible,intent,emergencyFuel,emergencyStations,currentKm,theoreticalRange,stopPlan]);
 // Ordre de la liste : le classement Floway par defaut. Auparavant la liste
 // suivait le point kilometrique, si bien que l'affluence, le prix et le
 // detour pesaient dans le score sans jamais changer ce qui etait montre.
 const plannedById=useMemo(()=>new Map(stopPlan.stops.map((x,rank)=>[String(x.station.id),{...x,rank}])),[stopPlan]);
 const listedStations=useMemo(()=>{
  if(stationOrder==='distance')return eligible;
  const rang=(s:Station)=>plannedById.get(String(s.id))?.rank??Number.POSITIVE_INFINITY;
  return [...eligible].sort((a,b)=>rang(a)-rang(b));
 },[eligible,plannedById,stationOrder]);

 const first=eligible[0]; const saved=best&&first?Math.max(0,first.waitMin+first.detourMin-best.waitMin-best.detourMin):0; const pauses=route?Math.max(0,Math.floor((route.durationMin-1)/120)):0;

 // Fil du voyage : construit par le moteur de planification, pas ici.
 // L'heuristique precedente placait un ravitaillement meme le plein fait — un
 // arret a 131 km avec 900 km d'autonomie — et un cafe « 55 km apres le
 // meilleur arret », sans egard pour l'heure ni pour l'espacement.
 const journey=useMemo(()=>{
  // Le fil n'affichait qu'une seule etape quand le carburant etait critique :
  // sur 750 km, il restait 742 km et un diner a caler apres le plein. L'arret
  // urgent ouvre desormais le voyage au lieu de le remplacer.
  const urgente=emergencyFuel&&best?best:null;
  const {steps,notes}=buildJourney({plan:stopPlan,distanceKm:route?.distanceKm||0,durationMin:route?.durationMin||0,currentKm,departureStation:urgente?null:departureStation,urgentStation:urgente as never});
  return{steps:steps.map((x:JourneyStep)=>({station:x.station as unknown as Station,kind:x.kind as string,label:x.label,reasons:x.reasons})),notes};
 },[stopPlan,route,currentKm,emergencyFuel,best,departureStation]);
 const events:JourneyEvent[]=journey.steps;
 const nearbyIncidents=useMemo(()=>{if(!live)return[];return safetyIncidents.map(i=>({...i,distanceKm:i.lat!=null&&i.lon!=null?haversine([live.lon,live.lat],[i.lon,i.lat]):null})).filter(i=>i.distanceKm!=null&&i.distanceKm<=35).sort((a,b)=>(a.distanceKm||999)-(b.distanceKm||999)).slice(0,5)},[safetyIncidents,live]);
 const [contextOpen,setContextOpen]=useState(false);

 // Prix median releve sur le trajet : donnee reelle du flux data.gouv.fr,
 // seule base honnete pour estimer un cout. Null si aucune station n'a de prix.
 const medianFuelPrice=useMemo(()=>{
  const prices=(route?.stations||[]).map(x=>x.price).filter(p=>typeof p==='number'&&p>0).sort((a,b)=>a-b);
  return prices.length?prices[Math.floor(prices.length/2)]:null;
 },[route]);

 // A la premiere analyse d'itineraire, on demande le contexte : c'est l'ordre
 // voulu, le trajet d'abord, puis avec quoi et dans quelles conditions.
 useEffect(()=>{if(route&&!vehicleConfirmed)setContextOpen(true)},[route,vehicleConfirmed]);

 // Reference stable : OriginField la place en dependance d'un useEffect.
 const setDraftOriginStable=useCallback((v:string)=>setDraftOrigin(v),[]);

 // Message bref. Le minuteur precedent est annule : deux messages coup sur
 // coup ne se coupent plus l'un l'autre.
 const notify=useCallback((message:string)=>{
  setToast(message);
  if(toastTimer.current!==null)window.clearTimeout(toastTimer.current);
  toastTimer.current=window.setTimeout(()=>setToast(''),3200);
 },[]);
 useEffect(()=>()=>{if(toastTimer.current!==null)window.clearTimeout(toastTimer.current)},[]);

 // Rejouer un itineraire : appel direct du calcul. L'ancien layer ouvrait la
 // fenetre d'itineraire par un clic simule sur `.v3routeTitle`, ecrivait dans
 // les deux champs via le setter natif de HTMLInputElement, puis appelait
 // `requestSubmit()` 100 ms plus tard.
 const playRoute=useCallback((from:string,to:string)=>{
  setDraftOrigin(from);setDraftDestination(to);
  void loadRoute(from,to,fuel,departure);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[fuel,departure]);

 const routeIsFavorite=useMemo(
  ()=>favoriteRoutes.some(r=>routeKey(r.origin,r.destination)===routeKey(origin,destination)),
  [favoriteRoutes,origin,destination],
 );
 const scrollToStations=useCallback(()=>document.getElementById('v3stations')?.scrollIntoView({behavior:'smooth'}),[]);
 async function submit(e:FormEvent){e.preventDefault();await loadRoute(draftOrigin.trim(),draftDestination.trim(),fuel,draftDeparture);setEditing(false)}
 const eta=route?duration(route.durationMin+pauses*15):'—'; const bestTravel=best&&route?duration(Math.max(0,Math.round((best.distanceKm-currentKm)/Math.max(route.distanceKm,1)*route.durationMin))):'—';
 const trafficLabel=route?.traffic?.label||'Trafic non connecté';
 const speedKmh=live?.speed!=null?Math.max(0,Math.round(live.speed*3.6)):0;

 return <main className="v3app">
  <header className="v3top"><button className="v3icon" onClick={()=>setPanel('menu')} aria-label="Menu Floway">☰</button><div className="v3brand"><span>≋</span><strong>Floway</strong><small>CHAQUE PAUSE COMPTE</small></div><div className="v3status"><button onClick={()=>setPanel('alerts')} aria-label={nearbyIncidents.length?`${nearbyIncidents.length} alerte${nearbyIncidents.length>1?'s':''} à proximité`:'Alertes du trajet'}>🔔{nearbyIncidents.length>0&&<b>{nearbyIncidents.length}</b>}</button><span className={route?.traffic?.live?'trafficLive':'trafficOff'}>● {trafficLabel}</span><span>🌦 Météo à connecter</span></div></header>
  {error&&<div className="v3error">{error}</div>}
  <section className="v3livebar"><div><span className={gpsState==='on'?'liveDot on':'liveDot'}/><strong>{gpsState==='on'?'MODE TRAJET ACTIF':'LOCALISATION MOBILE'}</strong><small>{liveProgress?`${Math.round(liveProgress.km)} km parcourus · ${Math.round(liveProgress.remainingKm)} km restants`:gpsError||'Active le GPS pour que Floway s’adapte à ta position réelle.'}</small></div><div className="liveMeta">{live&&<><span>± {Math.round(live.accuracy)} m</span>{live.speed!=null&&<span>{speedKmh} km/h</span>}</>}</div><div className="liveActions"><button onClick={startGps}>{gpsState==='requesting'?'LOCALISATION…':gpsState==='on'?'ARRÊTER GPS':'ACTIVER GPS'}</button><button className="navLaunch" onClick={()=>{if(gpsState==='off')startGps();setNavOpen(true)}}>NAVIGATION</button></div></section>


  <section className="v3topgrid"><article className="v3hero"><div className="v3heroshade"/><div className="v3heroContent"><span className="v3hello">Bonjour 👋</span><h1>Prêt pour<br/>une belle route ?</h1><button className="v3routeTitle" title={`${origin} → ${destination}`} onClick={()=>setEditing(true)}>{placeLabel(origin)} <i>→</i> {placeLabel(destination)}</button><RouteActions isFavorite={routeIsFavorite} disabled={loading} onReverse={()=>{if(!origin||!destination)return notify('Itinéraire introuvable.');notify(`${placeLabel(destination)} → ${placeLabel(origin)} en cours de calcul…`);playRoute(destination,origin)}} onToggleFavorite={()=>{if(!origin||!destination)return notify('Aucun itinéraire actif à enregistrer.');notify(toggleFavoriteRoute(origin,destination)?'Itinéraire enregistré sur ce téléphone.':'Itinéraire retiré des favoris.')}}/><div className="v3heroMetrics"><div><b>{route?Math.round(route.distanceKm):'—'} km</b><small>Distance</small></div><div><b>{route?duration(route.durationMin):'—'}</b><small>Durée estimée</small></div><div><b>{pauses}</b><small>Pauses conseillées</small></div></div><div className={`v3fuelHero ${emergencyFuel?'critical':''}`}><button type="button" className="fuelQuickTrigger" onClick={()=>setFuelSheetOpen(true)} aria-label="Corriger le niveau de carburant"><strong>{electricVehicle?'🔋':'⛽'} {levelPct}%</strong></button><span>{!energyPlan?'Autonomie inconnue · renseignez votre véhicule':emergencyFuel?(best?`${electricVehicle?'Batterie critique':'Carburant critique'} · arrêt conseillé dans ${Math.max(0,Math.round(best.distanceKm-currentKm))} km`:(electricVehicle?'Batterie critique · aucune borne sûre identifiée sur le trajet':'Carburant critique · aucune station sûre identifiée sur le trajet')):fuelTargetKm!==null&&route&&fuelTargetKm<route.distanceKm?`${electricVehicle?'Recharge':'Ravitaillement'} à envisager vers ${Math.round(fuelTargetKm)} km`:'Autonomie suffisante pour ce trajet'}</span></div></div><div className="v3miniRoute"><span title={origin}>{placeLabel(origin)}</span><span title={destination}>{placeLabel(destination)}</span><div className="v3track"><i/><b className="v3car" style={liveProgress&&route?{left:`${Math.min(94,Math.max(3,liveProgress.km/route.distanceKm*100))}%`}:undefined}>🚗</b>{events.map((e,i)=>{const pct=route?Math.min(96,Math.max(4,e.station.distanceKm/route.distanceKm*100)):50;
    // Les etiquettes kilometriques se chevauchaient des que deux etapes etaient
    // proches. On n'affiche que celles suffisamment espacees ; l'information
    // complete reste dans l'infobulle.
    const prev=i>0&&route?Math.min(96,Math.max(4,events[i-1].station.distanceKm/route.distanceKm*100)):-99;
    const showLabel=pct-prev>=11;
    return <button key={e.station.id} className={`journeyMarker${e.station.highway?' highway':''}`} style={{left:`${pct}%`}} onClick={()=>setSelected(e.station)} title={`${e.label} · ${Math.round(e.station.distanceKm)} km${e.station.highway?' · aire d’autoroute':''}`}><span>{stepIcon(e.kind)}</span>{showLabel&&<small>{Math.round(e.station.distanceKm)} km</small>}</button>;})}<i/></div><small>{liveProgress?`${Math.round(liveProgress.km)} km`:'0 km'}</small><small>{route?Math.round(route.distanceKm):0} km</small></div></article>
   <aside className="v3feed"><div className="v3panelHead"><div><span>FIL DU VOYAGE</span><h2>Ce qui compte vraiment sur votre route</h2></div><b>{events.length?`${events.length} arrêt${events.length>1?"s":""} conseillé${events.length>1?"s":""}`:"Aucun arrêt nécessaire"}</b></div><div className="v3vertical"><i className="v3line"/><div className="v3end"><i/><strong>{liveProgress?'Votre position':placeLabel(origin)}</strong><small>{liveProgress?`${Math.round(liveProgress.km)} km parcourus`:'0 km'}</small></div>{events.map(e=><button key={e.station.id} className={best?.id===e.station.id?'v3feedStop recommended':'v3feedStop'} onClick={()=>setSelected(e.station)}><span>{stepIcon(e.kind)}</span><div><strong>{e.label}</strong><small>{Number.isFinite(e.station.distanceKm)?`${Math.round(e.station.distanceKm)} km · ${clock(e.station)} · ${stationTitle(e.station)}`:`avant le départ${(e.station as {detourKm?:number}).detourKm!=null?` · à ${(e.station as {detourKm?:number}).detourKm} km`:''} · ${stationTitle(e.station)}`}</small></div>{best?.id===e.station.id&&<em>{emergencyFuel?'PRIORITÉ SÉCURITÉ':'FLOWAY AI ✦'}</em>}</button>)}<div className="v3end bottom"><i/><strong>{placeLabel(destination)}</strong><small>{route?Math.round(route.distanceKm):0} km · arrivée</small></div></div>{journey.notes.length>0&&<div className="v3journeyNotes">{journey.notes.map((n:string)=><p key={n}>{n}</p>)}</div>}<button className="v3ghost" onClick={scrollToStations}>VOIR TOUTES LES STATIONS</button></aside></section>

  {route?.geometry?.coordinates?.length&&<section className="v3mapSection"><div className="v3panelHead"><div><span>ITINÉRAIRE</span><h2>Votre route</h2></div></div>
   <RouteMap geometry={route.geometry.coordinates} live={live?{lat:live.lat,lon:live.lon}:null}
    stops={stopPlan.stops.slice(0,12).map(x=>({id:String(x.station.id),lat:(x.station as unknown as Station).lat,lon:(x.station as unknown as Station).lon,
     label:String((x.station as unknown as Station).name||''),kind:x.necessity,highway:Boolean((x.station as unknown as Station).highway)}))}
    onSelectStop={id=>{const station=stations.find(x=>String(x.id)===id);if(station)setSelected(station)}}/>
  </section>}

  <section className="v3intent"><div><span>QUE CHERCHES-TU POUR TON PROCHAIN ARRÊT ?</span><h2>{emergencyFuel?'⛽ Carburant critique : le plein passe devant, le reste suit':intent==='Auto'?'Floway choisit selon l’heure et le trajet':intent==='Manger'?'🍴 Premier arrêt mémorisé : manger':intent==='Recharge'?'Priorité aux bornes de recharge':`Priorité mémorisée : ${intent.toLowerCase()}`}</h2></div><div className="intentChips">{(['Auto','Manger','Café','Carburant','Recharge','Toilettes'] as Intent[]).map(x=><button key={x} className={intent===x?'active':''} onClick={()=>setIntent(x)} >{x==='Auto'?'✨':x==='Manger'?'🍴':x==='Café'?'☕':x==='Carburant'?'⛽':x==='Recharge'?'⚡':'🚻'} {x==='Auto'?'Floway choisit':x}</button>)}</div></section>

  <section className="v3midgrid"><article className={`v3recommend ${emergencyFuel?'fuelEmergency':''}`}><div className="v3stopImage"><span>{emergencyFuel?'⛽ ARRÊT CARBURANT PRIORITAIRE':intent==='Manger'?'🍴 ARRÊT REPAS RECOMMANDÉ':'PROCHAINE PAUSE RECOMMANDÉE'}</span><button onClick={()=>{const next=!stopFavorite;setStopFavorite(next);notify(next?'Arrêt ajouté aux favoris.':'Arrêt retiré des favoris.')}} aria-pressed={stopFavorite} aria-label={stopFavorite?'Retirer cet arrêt des favoris':'Ajouter cet arrêt aux favoris'}>{stopFavorite?'♥':'♡'}</button></div><div className="v3stopInfo"><div><h2>{best?.brand&&<small className="stationBrand">{best.brand}</small>}Aire de<br/>{best?(best.city||best.name):'—'}</h2><div className="v3services">{(best?.serviceCategories||['Carburant','Restauration','Café','Toilettes']).slice(0,7).map(s=><span key={s}><i>{serviceIcon(s)}</i>{s}</span>)}</div></div><aside><b>{best?`Dans ${Math.max(0,Math.round(best.distanceKm-currentKm))} km`:'—'}</b><strong>{bestTravel}</strong><small>{liveProgress?'depuis votre position':`depuis ${placeLabel(origin)}`}</small><ul><li>{emergencyFuel?'Le carburant passe avant toutes les autres préférences':intent==='Manger'?'Restauration obligatoire pour ce choix':intent==='Auto'?'Contexte horaire analysé':`Priorité ${intent.toLowerCase()}`}</li><li>{best?.services?.length||0} services recensés</li><li>{best?`${crowd(best.waitMin).icon} Affluence prévue ${crowd(best.waitMin).label.toLowerCase()}`:'Affluence à estimer'}</li></ul><button onClick={()=>best&&setSelected(best)}>VOIR LE DÉTAIL</button></aside></div></article>
   <article className="v3ai"><div className="v3panelHead"><div><span>FLOWAY AI</span><h2>Optimisé pour vous</h2></div><b>✦</b></div><div className="v3orb"><i/><i/><i/><strong>✦</strong></div><h3>{emergencyFuel?(best?'Votre niveau de carburant impose un arrêt maintenant.':'Votre niveau de carburant est critique.') : best?intent==='Manger'?'Votre arrêt repas est prioritaire.':'Votre meilleur arrêt est identifié.':'Floway analyse votre trajet.'}</h3><p>{emergencyFuel?(best?`Avec ${levelPct}% ${electricVehicle?'de batterie':'de carburant'}, Floway limite la recherche aux stations atteignables avec marge de sécurité. Les préférences repas et prix redeviennent actives après ravitaillement.`:'Aucune station du trajet n’est dans une zone jugée sûre avec le niveau actuel. Floway doit rechercher autour de votre position avant de poursuivre.'):(best?.smartContext?.message||'Floway croise heure de passage, position réelle, détour, affluence prédictive, carburant et services pour recommander le meilleur arrêt.')}</p><div className="v3aiStats"><div><small>AUTONOMIE SÛRE</small><b>{usableRange===null?'—':`${Math.round(usableRange)} km`}</b></div><div><small>DÉTOUR</small><b>{best?`+${best.detourMin} min`:'—'}</b></div><div><small>AFFLUENCE</small><b>{best?`${crowd(best.waitMin).icon} ${crowd(best.waitMin).label}`:'—'}</b></div></div></article></section>

  <section className={`v3planner vehicleLogic ${emergencyFuel?'criticalFuel':''}`}><div><span>LOGIQUE D’AUTONOMIE</span><h2>{energyPlan?`${levelPct}% ${electricVehicle?'de batterie':'de carburant'} · ≈ ${Math.round(theoreticalRange!)} km théoriques · ≈ ${Math.round(usableRange!)} km sûrs`:`${levelPct}% · autonomie inconnue`}</h2><p>{!energyPlan?'Capacité et consommation ne sont pas renseignées : Floway n’affiche aucune autonomie plutôt qu’un chiffre inventé, et classe les arrêts sans contrainte de carburant.':emergencyFuel?'Niveau critique : Floway donne la priorité absolue à la station atteignable la plus sûre et neutralise temporairement les autres intentions.':(electricVehicle?'La charge reste une contrainte physique : Floway conserve toujours une marge de sécurité avant de proposer les autres besoins.':'Le carburant reste une contrainte physique : Floway conserve toujours une marge de sécurité avant de proposer les autres besoins.')}</p></div><button onClick={()=>setContextOpen(true)}>RÉGLER LE NIVEAU ET LE VÉHICULE</button><div className="v3chips">{(['Tous','Restauration','Café','Boutique','Toilettes'] as Filter[]).map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{x}</button>)}</div></section>
  <section className="v3featuregrid"><article className="photo"><span>PAUSES INTELLIGENTES</span><h3>Au bon moment,<br/>pour la bonne raison.</h3></article><article><span>COMMUNAUTÉ</span><h3>À construire sans inventer<br/>de signal terrain.</h3><div className="v3communityTruth"><b>0</b><small>signalement utilisateur exploité pour l’instant</small></div></article><article><span>SÉCURITÉ ROUTIÈRE</span><h3>Incidents réels<br/>et zones de danger.</h3><div className="v3safetyState">{safetyConnected?`⚠ ${nearbyIncidents.length} incident(s) à proximité · TomTom Traffic`:'📷 Incidents / zones de danger : source à connecter ou indisponible'}</div><button className="v3ghost" onClick={()=>setNavOpen(true)}>OUVRIR LA NAVIGATION</button></article><article><span>TEMPS OPTIMISÉ</span><h3>{eta}<br/>voyage Floway</h3><strong>+{pauses*15} min de pauses utiles</strong></article></section>
  <section className="v3stations" id="v3stations"><div className="v3panelHead"><div><span>STATIONS DEVANT VOUS</span><h2>{stationOrder==='classement'?'Classées par Floway':'Dans l’ordre du trajet'}</h2></div><StationOrderSwitch value={stationOrder} onChange={setStationOrder}/><select value={fuel} onChange={e=>{setFuel(e.target.value);void loadRoute(origin,destination,e.target.value,departure)}}><option>Gazole</option><option>SP95-E10</option><option>SP98</option><option>E85</option></select></div><RoutePriceRibbon summary={priceSummary}/><div className="v3cards">{listedStations.slice(0,24).map((s,index)=><button key={s.id} className={s.highway?'v3highway':undefined} onClick={()=>setSelected(s)}><span>{stationOrder==='classement'?<b className="v3rank">{index+1}</b>:serviceIcon(s.serviceCategories?.[0]||'')}</span><div><strong>{s.highway&&<i className="v3highwayTag">A</i>}{stationTitle(s)}</strong><small>{[stationSubtitle(s,stationTitle(s)),`${Math.max(0,Math.round(s.distanceKm-currentKm))} km devant`,clock(s)].filter(Boolean).join(' · ')}</small><em>{(s.serviceCategories||[]).slice(0,3).join(' · ')}</em></div><b>{typeof s.price==='number'&&<u className="v3price">{s.price.toFixed(3)} €/L</u>}<span>{crowd(s.waitMin).icon} {crowd(s.waitMin).label}</span></b></button>)}</div></section>
  <nav className="v3nav"><button className="active" onClick={()=>setNavOpen(true)}>⌁<span>NAVIGATION</span></button><button onClick={scrollToStations}>⛽<span>STATIONS</span></button><a href="/ev">⚡<span>ÉLECTRIQUE</span></a><button onClick={()=>setPanel('community')}>◉<span>COMMUNAUTÉ</span></button><button onClick={()=>setPanel('profile')}>○<span>PROFIL</span></button></nav>

  {navOpen&&<div className="roadNavOverlay"><section className="roadNav"><header><div><small>FLOWAY LIVE</small><strong>{placeLabel(origin)} → {placeLabel(destination)}</strong></div><button onClick={()=>setNavOpen(false)}>×</button></header><div className="roadNavMap">{route?.geometry?.coordinates?.length?<RouteMap geometry={route.geometry.coordinates} live={live?{lat:live.lat,lon:live.lon}:null} height={400}
     stops={journey.steps.map(x=>({id:String(x.station.id),lat:x.station.lat,lon:x.station.lon,label:x.label,kind:x.kind as 'carburant'|'repas'|'confort',highway:Boolean(x.station.highway)}))}
     onSelectStop={id=>{const station=stations.find(x=>String(x.id)===id);if(station){setNavOpen(false);setSelected(station)}}}/>:<div className="roadNoMap">Itinéraire en cours de chargement</div>}<div className={`roadSpeed ${roadLimit?.limit!=null&&speedKmh>roadLimit.limit+2?'overLimit':''}`}><b>{speedKmh}</b><span>km/h GPS</span></div><div className={`roadLimit ${roadLimit?.limit!=null?'known':'unavailable'}`}><b>{roadLimit?.limit!=null?Math.round(roadLimit.limit):'—'}</b><span>{roadLimit?.limit!=null?(roadLimit.road?roadLimit.road.slice(0,18):'limite'):(roadLimit?.connected?'non renseignée':'indisponible')}</span></div>{liveProgress&&<div className="roadRemaining">{Math.round(liveProgress.remainingKm)} km restants</div>}</div><div className={`roadFuel ${emergencyFuel?'critical':''}`}><button type="button" className="fuelQuickTrigger" onClick={()=>setFuelSheetOpen(true)} aria-label="Corriger le niveau de carburant"><span>{electricVehicle?'🔋':'⛽'} {levelPct}%</span></button><strong>{!energyPlan?'Autonomie inconnue · véhicule non renseigné':emergencyFuel?(best?`Arrêt carburant dans ${Math.max(0,Math.round(best.distanceKm-currentKm))} km`:'Recherche carburant urgente'):`Autonomie sûre ≈ ${Math.round(usableRange!)} km`}</strong></div><NextStations stations={stations} currentKm={currentKm} distanceKm={route?.distanceKm||0} durationMin={route?.durationMin||0} fuel={fuel} onSelect={id=>{const station=stations.find(x=>String(x.id)===id);if(station){setNavOpen(false);setSelected(station)}}}/><div className="roadAlerts"><div className="roadSectionTitle"><span>SÉCURITÉ ROUTIÈRE</span><small>{safetyConnected?'TomTom Traffic · temps réel':'Données indisponibles'}</small></div>{nearbyIncidents.length?nearbyIncidents.map(i=><article key={i.id}><b>{i.icon}</b><div><strong>{i.label}{i.roads?.length?` · ${i.roads.join(', ')}`:''}</strong><small>{i.distanceKm!=null?`${i.distanceKm.toFixed(1)} km à proximité`:'distance inconnue'}{i.delayMin?` · +${i.delayMin} min`:''}</small><p>{i.description}</p></div></article>):<div className="roadClear">{safetyConnected?'Aucun incident TomTom détecté dans la zone surveillée.':'Aucune alerte affichée tant qu’une source réelle n’est pas disponible.'}</div>}<div className="roadDangerTruth">📷 Zones de danger / radars : aucune donnée inventée. Source dédiée encore à connecter.</div></div><footer><span>{gpsState==='on'?'● GPS actif':'○ GPS inactif'}</span><span>± {live?Math.round(live.accuracy):'—'} m</span><span>{safetyUpdatedAt?`maj ${new Date(safetyUpdatedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`:'sécurité non mise à jour'}</span></footer></section></div>}

  {contextOpen&&route&&<TripContextPanel distanceKm={route.distanceKm} fuelPricePerL={medianFuelPrice} onClose={()=>setContextOpen(false)}/>}

  <ActionSheet panel={panel} onPanel={setPanel} onPickRoute={playRoute} onScrollToStations={scrollToStations} onNotify={notify}/>
 <Toast message={toast}/>
 {fuelSheetOpen&&<QuickFuelSheet pct={levelPct} onChange={applyFuelPct} onClose={()=>setFuelSheetOpen(false)}/>}
 {editing&&<div className="v3overlay" onClick={()=>!loading&&setEditing(false)}><form className="v3modal" onSubmit={submit} onClick={e=>e.stopPropagation()}><span>NOUVEL ITINÉRAIRE</span><h2>Où va-t-on ?</h2><OriginField value={draftOrigin} onChange={setDraftOriginStable} disabled={loading}/><label>Destination<input value={draftDestination} onChange={e=>setDraftDestination(e.target.value)} required/></label><SavedPlaces onPick={setDraftDestination} disabled={loading}/><label>Heure de départ<input type="datetime-local" value={draftDeparture} onChange={e=>setDraftDeparture(e.target.value)} required/></label><button disabled={loading}>{loading?'ANALYSE…':'ANALYSER LE TRAJET →'}</button></form></div>}

  {selected&&<div className="v3overlay" onClick={()=>setSelected(null)}><article className="v3detail" onClick={e=>e.stopPropagation()}><button className="v3close" onClick={()=>setSelected(null)}>←</button><div className="v3detailImage"><span>FICHE ARRÊT FLOWAY</span></div><div className="v3detailBody"><span className="detailEyebrow">STATION / AIRE SUR VOTRE ITINÉRAIRE</span><h2>{selected.brand&&<small className="stationBrand">{selected.brand}</small>}{selected.name}</h2><p>{selected.address&&`${selected.address} · `}{selected.city} · {Math.max(0,Math.round(selected.distanceKm-currentKm))} km devant · passage {clock(selected)}</p><div className="v3detailStats"><div><small>AFFLUENCE PRÉVUE</small><b>{crowd(selected.waitMin).icon} {crowd(selected.waitMin).label}</b></div><div><small>PRIX {fuel.toUpperCase()}</small><b>{selected.price?`${selected.price.toFixed(3)} €/L`:'—'}</b></div><div><small>DÉTOUR</small><b>+{selected.detourMin} min</b></div></div><StationFuelPanel station={selected}/><p className="predictionTruth">L’affluence est une prédiction Floway, pas une mesure de file d’attente en temps réel.</p><h3 className="detailSectionTitle">SERVICES DISPONIBLES</h3><div className="v3services rich">{(selected.serviceCategories||[]).map(s=><span key={s}><i>{serviceIcon(s)}</i>{s}</span>)}</div>{selected.services?.length?<><h3 className="detailSectionTitle">DÉTAIL DES SERVICES RECENSÉS</h3><div className="rawServices">{selected.services.map(s=><span key={s}>{s}</span>)}</div></>:null}<StationPoiPanel station={selected}/><div className="restaurantCallout"><div>🍴</div><div><strong>La restauration peut décider de l’arrêt</strong><p>{selected.serviceCategories?.includes('Restauration')?'Cette aire dispose d’une offre de restauration recensée. Floway la valorise davantage si votre priorité est de manger.':'Aucune restauration détaillée n’est encore recensée ici : Floway ne la choisira pas en premier si votre priorité est de manger.'}</p></div></div><div className="v3detailAI"><span>FLOWAY AI ✦</span><p>{selected.smartContext?.message||'Cet arrêt est analysé selon votre heure de passage, votre position, le détour, l’affluence prédictive et les services disponibles.'}</p>{selected.waitModel?.factors?.length?<ul>{selected.waitModel.factors.map(f=><li key={f}>{f}</li>)}</ul>:null}</div>{(()=>{const rang=plannedById.get(String(selected.id));if(!rang)return null;return <div className="rankWhy"><strong>Rang {rang.rank+1} sur {stopPlan.stops.length} pour ce trajet</strong>{rang.reasons.length?<ul>{rang.reasons.map(r=><li key={r}>{r}</li>)}</ul>:<p>Aucun critere ne distingue cet arret des autres : il est classe sur le prix, le detour et l’affluence.</p>}</div>})()}{selected.sources&&<div className="detailSources"><small>Données station : {selected.sources.station||'source publique'}</small><small>Prix : {selected.sources.priceFreshness||'mise à jour disponible'}</small><small>Affluence : {selected.sources.wait||'estimation Floway'}</small></div>}<button className="v3choose" onClick={()=>{notify(`${selected.name} est maintenant votre arrêt Floway.`);setSelected(null)}}>CHOISIR CET ARRÊT →</button></div></article></div>}
 </main>
}
