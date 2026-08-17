import { NextRequest, NextResponse } from 'next/server';

type Point=[number,number];
type FuelRecord=Record<string,unknown>;
type GeoFeature={geometry?:{coordinates?:Point};properties?:{label?:string}};
const DATASET='prix-des-carburants-en-france-flux-instantane-v2';
const API=`https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
const rad=(n:number)=>n*Math.PI/180;
function hav(a:Point,b:Point){const R=6371,x=rad(b[1]-a[1]),y=rad(b[0]-a[0]),a1=rad(a[1]),a2=rad(b[1]),h=Math.sin(x/2)**2+Math.cos(a1)*Math.cos(a2)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
async function geocode(q:string){const u=new URL('https://data.geopf.fr/geocodage/search');u.searchParams.set('q',q);u.searchParams.set('limit','1');u.searchParams.set('returntruegeometry','false');const r=await fetch(u,{headers:{Accept:'application/json'},next:{revalidate:86400}});if(!r.ok)return null;const d=await r.json() as {features?:GeoFeature[]};const c=d.features?.[0]?.geometry?.coordinates;return c?{lon:c[0],lat:c[1],label:d.features?.[0]?.properties?.label||q}:null;}
function point(r:FuelRecord):Point|null{const g=r.geom as {lon?:number;lat?:number}|{coordinates?:Point}|undefined;if(g&&'lon'in g&&'lat'in g&&typeof g.lon==='number'&&typeof g.lat==='number')return[g.lon,g.lat];if(g&&'coordinates'in g&&Array.isArray(g.coordinates))return g.coordinates;const lon=Number(r.longitude),lat=Number(r.latitude);return Number.isFinite(lon)&&Number.isFinite(lat)?[lon,lat]:null;}
const fuels=[
 {key:'gazole',label:'Gazole',price:['gazole_prix'],maj:['gazole_maj']},
 {key:'sp95',label:'SP95',price:['sp95_prix'],maj:['sp95_maj']},
 {key:'e10',label:'SP95-E10',price:['e10_prix'],maj:['e10_maj']},
 {key:'sp98',label:'SP98',price:['sp98_prix'],maj:['sp98_maj']},
 {key:'e85',label:'E85',price:['e85_prix'],maj:['e85_maj']},
 {key:'gplc',label:'GPLc',price:['gplc_prix'],maj:['gplc_maj']},
];
function first(record:FuelRecord,keys:string[]){for(const k of keys){const v=record[k];if(v!==undefined&&v!==null&&String(v)!=='')return v;}return null;}
function parseDate(v:unknown){if(typeof v!=='string'||!v)return null;const d=new Date(v);return Number.isNaN(d.getTime())?null:d;}
function fuelList(record:FuelRecord){return fuels.map(f=>{const raw=first(record,f.price),n=Number(raw);if(!Number.isFinite(n)||n<=0)return null;const d=parseDate(first(record,f.maj));const ageHours=d?Math.max(0,(Date.now()-d.getTime())/3600000):null;const freshness=ageHours===null?'inconnue':ageHours<=24?'récente':ageHours<=72?'à vérifier':'ancienne';return{key:f.key,label:f.label,price:Math.round(n*1000)/1000,updatedAt:d?.toISOString()||null,ageHours:ageHours===null?null:Math.round(ageHours*10)/10,freshness};}).filter(Boolean);}
export async function GET(req:NextRequest){const q=req.nextUrl.searchParams.get('q')?.trim();const latP=Number(req.nextUrl.searchParams.get('lat')),lonP=Number(req.nextUrl.searchParams.get('lon'));let lat=Number.isFinite(latP)?latP:null,lon=Number.isFinite(lonP)?lonP:null;if((lat===null||lon===null)&&q){const g=await geocode(q);lat=g?.lat??null;lon=g?.lon??null;}if(lat===null||lon===null)return NextResponse.json({error:'Station introuvable.'},{status:400});try{const u=new URL(API);u.searchParams.set('limit','25');u.searchParams.set('where',`within_distance(geom, geom'POINT(${lon} ${lat})', 4 km)`);const r=await fetch(u,{headers:{Accept:'application/json'},next:{revalidate:600}});if(!r.ok)throw new Error(`FUEL_${r.status}`);const d=await r.json() as {results?:FuelRecord[]};const candidates=(d.results||[]).map(record=>{const p=point(record);return p?{record,p,distanceKm:hav([lon!,lat!],p)}:null;}).filter(Boolean) as Array<{record:FuelRecord;p:Point;distanceKm:number}>;candidates.sort((a,b)=>a.distanceKm-b.distanceKm);const chosen=candidates.find(x=>fuelList(x.record).length>0);if(!chosen)return NextResponse.json({source:'Ministère de l’Économie',official:true,station:null,fuels:[],message:'Aucun prix carburant exploitable trouvé autour de cet arrêt.'});return NextResponse.json({source:'Ministère de l’Économie — Prix des carburants en France',official:true,updatedAt:new Date().toISOString(),station:{id:String(chosen.record.id||''),address:String(chosen.record.adresse||''),city:String(chosen.record.ville||''),distanceFromSearchM:Math.round(chosen.distanceKm*1000)},fuels:fuelList(chosen.record)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'FUEL_LOOKUP_ERROR'},{status:502});}}
