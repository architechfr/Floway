import { NextRequest, NextResponse } from 'next/server';

export async function GET(req:NextRequest){
 const lat=Number(req.nextUrl.searchParams.get('lat'));
 const lon=Number(req.nextUrl.searchParams.get('lon'));
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return NextResponse.json({error:'Coordonnées invalides.'},{status:400});
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
