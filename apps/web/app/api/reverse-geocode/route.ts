import { NextRequest, NextResponse } from 'next/server';

import { timeoutFetch } from '../_lib/http';
import { positionDeRequete } from '../../../../../packages/algorithms/query-params.mjs';

// Masque le `fetch` global pour ce module : tout appel sortant est abandonné
// automatiquement au-delà du délai, sans modifier les points d'appel.
const fetch = timeoutFetch();

export async function GET(req:NextRequest){
 // Number(null) vaut 0 : sans ce lecteur, une requete sans lat ni lon
 // geocodait le point 0°/0°, au large du golfe de Guinee.
 const position=positionDeRequete(req.nextUrl.searchParams.get('lat'),req.nextUrl.searchParams.get('lon'));
 if(!position)return NextResponse.json({error:'Coordonnées invalides.'},{status:400});
 const {lat,lon}=position;
 try{
  const u=new URL('https://data.geopf.fr/geocodage/reverse');
  u.searchParams.set('lat',String(lat));u.searchParams.set('lon',String(lon));u.searchParams.set('limit','1');
  const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});
  if(!r.ok)throw new Error('REVERSE_GEOCODING_FAILED');
  const d=await r.json();const f=d?.features?.[0];
  const p=f?.properties||{};
  const label=p.label||[p.name,p.city].filter(Boolean).join(', ')||`${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  return NextResponse.json({label,lat,lon,source:'GéoPlateforme'});
 }catch{
  return NextResponse.json({label:`${lat.toFixed(5)}, ${lon.toFixed(5)}`,lat,lon,source:'GPS'});
 }
}
