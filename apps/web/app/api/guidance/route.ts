import { NextRequest, NextResponse } from 'next/server';

type Point=[number,number];
type GeocodeFeature={geometry?:{coordinates?:Point};properties?:{label?:string}};
type Step={distance?:number;duration?:number;name?:string;ref?:string;destinations?:string;exits?:string;driving_side?:string;maneuver?:{type?:string;modifier?:string;location?:Point;bearing_before?:number;bearing_after?:number};intersections?:Array<{location?:Point;bearing?:number[];entry?:boolean[];in?:number;out?:number;lanes?:Array<{valid?:boolean;indications?:string[]}>}>};

async function geocode(q:string){
  const u=new URL('https://data.geopf.fr/geocodage/search');
  u.searchParams.set('q',q);u.searchParams.set('limit','1');u.searchParams.set('returntruegeometry','false');
  const r=await fetch(u,{headers:{Accept:'application/json'},next:{revalidate:86400}});
  if(!r.ok) throw new Error('GEOCODING_FAILED');
  const d=await r.json() as {features?:GeocodeFeature[]};const f=d.features?.[0],c=f?.geometry?.coordinates;
  if(!c) throw new Error('PLACE_NOT_FOUND');
  return {lon:c[0],lat:c[1],label:f?.properties?.label||q};
}

function icon(type?:string,modifier?:string){
  if(type==='arrive') return '🏁';
  if(type==='depart') return '↑';
  if(type==='roundabout'||type==='rotary') return '↻';
  if(type==='merge') return modifier?.includes('left')?'↖':'↗';
  if(type==='fork') return modifier?.includes('left')?'↖':'↗';
  if(type==='on ramp'||type==='off ramp') return modifier?.includes('left')?'↖':'↗';
  if(modifier?.includes('left')) return '←';
  if(modifier?.includes('right')) return '→';
  if(modifier==='uturn') return '↩';
  return '↑';
}

function instruction(s:Step,index:number){
  const m=s.maneuver||{},road=[s.ref,s.name].filter(Boolean).join(' · ')||'la route';
  const dest=s.destinations?` direction ${s.destinations}`:'';
  const exit=s.exits?` sortie ${s.exits}`:'';
  if(m.type==='depart') return `Prenez ${road}${dest}`;
  if(m.type==='arrive') return 'Vous êtes arrivé à destination';
  if(m.type==='merge') return `Insérez-vous sur ${road}${dest}`;
  if(m.type==='on ramp') return `Prenez la bretelle vers ${road}${dest}`;
  if(m.type==='off ramp') return `Prenez${exit} vers ${road}${dest}`;
  if(m.type==='fork') return `Restez ${m.modifier?.includes('left')?'à gauche':'à droite'} vers ${road}${dest}`;
  if(m.type==='roundabout'||m.type==='rotary') return `Au rond-point, continuez vers ${road}${dest}`;
  if(m.type==='turn') return `Tournez ${m.modifier?.includes('left')?'à gauche':m.modifier?.includes('right')?'à droite':''} sur ${road}${dest}`.replace('  ',' ');
  return index===0?`Continuez sur ${road}${dest}`:`Continuez sur ${road}${dest}`;
}

export async function GET(req:NextRequest){
  const origin=req.nextUrl.searchParams.get('origin')?.trim();
  const destination=req.nextUrl.searchParams.get('destination')?.trim();
  if(!origin||!destination) return NextResponse.json({error:'Départ et destination requis.'},{status:400});
  try{
    const [from,to]=await Promise.all([geocode(origin),geocode(destination)]);
    const u=`https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=false&steps=true&overview=full&geometries=geojson&annotations=false`;
    const r=await fetch(u,{headers:{Accept:'application/json'},cache:'no-store'});
    if(!r.ok) throw new Error('ROUTING_FAILED');
    const d=await r.json();const route=d.routes?.[0],leg=route?.legs?.[0];
    if(!route||!leg) throw new Error('NO_ROUTE');
    const steps=(leg.steps||[] as Step[]).map((s:Step,index:number)=>({
      id:`step-${index}`,
      order:index,
      distanceM:Math.round(s.distance||0),
      durationSec:Math.round(s.duration||0),
      roadName:s.name||null,
      roadRef:s.ref||null,
      destinations:s.destinations||null,
      exit:s.exits||null,
      type:s.maneuver?.type||null,
      modifier:s.maneuver?.modifier||null,
      location:s.maneuver?.location?{lon:s.maneuver.location[0],lat:s.maneuver.location[1]}:null,
      bearingBefore:s.maneuver?.bearing_before??null,
      bearingAfter:s.maneuver?.bearing_after??null,
      icon:icon(s.maneuver?.type,s.maneuver?.modifier),
      instruction:instruction(s,index),
      lanes:s.intersections?.flatMap(x=>x.lanes||[]).map(l=>({valid:Boolean(l.valid),indications:l.indications||[]}))||[]
    }));
    return NextResponse.json({
      provider:{name:'OSRM guidance',connected:true},
      origin:from,destination:to,
      distanceKm:Math.round(route.distance/100)/10,
      durationMin:Math.round(route.duration/60),
      geometry:route.geometry,
      steps
    });
  }catch(e){
    const code=e instanceof Error?e.message:'GUIDANCE_ERROR';
    return NextResponse.json({error:code},{status:502});
  }
}
