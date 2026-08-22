import { NextRequest, NextResponse } from 'next/server';

import { timeoutFetch } from '../_lib/http';
import { positionDeRequete } from '../../../../../packages/algorithms/query-params.mjs';

// Masque le `fetch` global pour ce module : tout appel sortant est abandonné
// automatiquement au-delà du délai, sans modifier les points d'appel.
const fetch = timeoutFetch();

type GeoFeature={geometry?:{coordinates?:[number,number]}};
type PoiResult={dist?:number;poi?:{name?:string;categories?:string[];brands?:Array<{name?:string}>;phone?:string;url?:string;openingHours?:unknown};address?:{freeformAddress?:string;municipality?:string};position?:{lat?:number;lon?:number}};

async function geocode(q:string){const u=new URL('https://data.geopf.fr/geocodage/search');u.searchParams.set('q',q);u.searchParams.set('limit','1');const r=await fetch(u,{headers:{Accept:'application/json'},next:{revalidate:86400}});if(!r.ok)return null;const d=await r.json() as {features?:GeoFeature[]};const c=d.features?.[0]?.geometry?.coordinates;return c?{lon:c[0],lat:c[1]}:null;}
function text(p:PoiResult){return `${p.poi?.name||''} ${(p.poi?.categories||[]).join(' ')}`.toLowerCase();}
function isFuel(p:PoiResult){return /(petrol|fuel|gas station|station-service|station service|carburant)/.test(text(p));}
function isFood(p:PoiResult){return /(restaurant|fast food|cafe|café|coffee|bakery|boulanger|sandwich|food)/.test(text(p));}
function isShop(p:PoiResult){return /(shop|store|supermarket|convenience|boutique)/.test(text(p));}
function compact(p:PoiResult){return{name:p.poi?.name||'POI',brand:p.poi?.brands?.[0]?.name||null,categories:p.poi?.categories||[],distanceM:Math.round(p.dist||0),address:p.address?.freeformAddress||null,city:p.address?.municipality||null,phone:p.poi?.phone||null,url:p.poi?.url||null,openingHours:p.poi?.openingHours||null,lat:p.position?.lat||null,lon:p.position?.lon||null};}

export async function GET(req:NextRequest){
 const key=process.env.TOMTOM_API_KEY;
 const q=req.nextUrl.searchParams.get('q')?.trim();
 // Number(null) vaut 0 et passe Number.isFinite : des coordonnees absentes
 // devenaient le point 0°/0° et empechaient le repli par geocodage du nom.
 const fournie=positionDeRequete(req.nextUrl.searchParams.get('lat'),req.nextUrl.searchParams.get('lon'));
 let lat=fournie?.lat??null,lon=fournie?.lon??null;
 if((lat===null||lon===null)&&q){const g=await geocode(q);lat=g?.lat??null;lon=g?.lon??null;}
 if(lat===null||lon===null)return NextResponse.json({error:'Position de station introuvable.'},{status:400});
 if(!key)return NextResponse.json({provider:{name:'TomTom Search',connected:false},station:null,restaurants:[],shops:[],message:'Enrichissement POI prêt mais TOMTOM_API_KEY non configurée.'});
 try{
  const u=new URL('https://api.tomtom.com/search/2/nearbySearch/.json');u.searchParams.set('key',key);u.searchParams.set('lat',String(lat));u.searchParams.set('lon',String(lon));u.searchParams.set('radius','1200');u.searchParams.set('limit','40');u.searchParams.set('countrySet','FR');u.searchParams.set('language','fr-FR');u.searchParams.set('openingHours','nextSevenDays');
  const r=await fetch(u,{headers:{Accept:'application/json'},next:{revalidate:900}});if(!r.ok)throw new Error(`TOMTOM_${r.status}`);const d=await r.json() as {results?:PoiResult[]};const results=(d.results||[]).sort((a,b)=>(a.dist||99999)-(b.dist||99999));
  const fuel=results.filter(isFuel);const food=results.filter(isFood);const shops=results.filter(isShop);
  const station=fuel.find(x=>(x.dist||99999)<=500)||fuel[0]||null;
  return NextResponse.json({provider:{name:'TomTom Search',connected:true,updatedAt:new Date().toISOString()},station:station?compact(station):null,restaurants:food.slice(0,12).map(compact),shops:shops.slice(0,8).map(compact),poiCount:results.length,searchCenter:{lat,lon}});
 }catch(e){return NextResponse.json({provider:{name:'TomTom Search',connected:false},station:null,restaurants:[],shops:[],error:e instanceof Error?e.message:'POI_ERROR'},{status:502});}
}
