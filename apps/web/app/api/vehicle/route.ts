import { NextRequest, NextResponse } from 'next/server';

type VehicleSpec={brand:string;model:string;year:string;engine:string;fuel:string;tankL:number;consumption:number};
const CATALOG:VehicleSpec[]=[
 {brand:'Volkswagen',model:'Tiguan',year:'2014',engine:'2.0 TDI',fuel:'Gazole',tankL:64,consumption:6.5},
 {brand:'Volkswagen',model:'Tiguan',year:'2014',engine:'2.0 TDI 4Motion',fuel:'Gazole',tankL:64,consumption:6.9},
 {brand:'Peugeot',model:'3008',year:'2020',engine:'BlueHDi 130',fuel:'Gazole',tankL:53,consumption:5.2},
 {brand:'Renault',model:'Captur',year:'2021',engine:'TCe 140',fuel:'SP95-E10',tankL:48,consumption:6.2},
 {brand:'Toyota',model:'RAV4',year:'2021',engine:'2.5 Hybrid',fuel:'SP95-E10',tankL:55,consumption:5.8}
];
function norm(v:string){return v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function autonomy(spec:VehicleSpec,fuelPct:number,reserveKm:number,consumption?:number){const used=consumption&&consumption>0?consumption:spec.consumption;const liters=spec.tankL*Math.max(0,Math.min(100,fuelPct))/100;const theoretical=liters/Math.max(.1,used)*100;return{fuelPct,litersAvailable:Math.round(liters*10)/10,consumption:used,theoreticalRangeKm:Math.round(theoretical),usableRangeKm:Math.max(0,Math.round(theoretical-reserveKm)),reserveKm};}
export async function GET(req:NextRequest){const brand=req.nextUrl.searchParams.get('brand')||'';const model=req.nextUrl.searchParams.get('model')||'';const year=req.nextUrl.searchParams.get('year')||'';const engine=req.nextUrl.searchParams.get('engine')||'';const fuelPct=Number(req.nextUrl.searchParams.get('fuelPct')||75);const reserveKm=Number(req.nextUrl.searchParams.get('reserveKm')||80);const consumption=Number(req.nextUrl.searchParams.get('consumption')||0);const candidates=CATALOG.filter(v=>(!brand||norm(v.brand).includes(norm(brand)))&&(!model||norm(v.model).includes(norm(model)))&&(!year||v.year===year)&&(!engine||norm(v.engine).includes(norm(engine))));const exact=candidates[0]||null;return NextResponse.json({provider:{name:'Floway vehicle catalog v0',connected:true,plateLookup:false},vehicle:exact?{...exact,autonomy:autonomy(exact,fuelPct,reserveKm,consumption||undefined)}:null,candidates:candidates.slice(0,12),message:exact?'Profil véhicule identifié dans le catalogue Floway.':'Véhicule non présent dans le catalogue local : saisie manuelle conservée.'});}
