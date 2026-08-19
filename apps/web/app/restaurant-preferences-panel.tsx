'use client';

import { useEffect, useMemo, useState } from 'react';
import { RESTAURANT_BRANDS, RestaurantBrand, detectRestaurantBrands, loadRestaurantPreferences, saveRestaurantPreferences } from './restaurant-preferences';

type Station={id:string;name:string;brand?:string;city:string;distanceKm:number;arrivalHour?:number;arrivalMinute?:number;services?:string[];serviceCategories?:string[];price:number;waitMin:number};

const clock=(s:Station)=>s.arrivalHour==null?'--:--':`${String(s.arrivalHour).padStart(2,'0')}:${String(s.arrivalMinute||0).padStart(2,'0')}`;

export default function RestaurantPreferencesPanel({stations,currentKm,onSelect}:{stations:Station[];currentKm:number;onSelect:(s:Station)=>void}){
 const [prefs,setPrefs]=useState<RestaurantBrand[]>([]);
 useEffect(()=>setPrefs(loadRestaurantPreferences()),[]);
 function toggle(brand:RestaurantBrand){setPrefs(prev=>{const next=prev.includes(brand)?prev.filter(x=>x!==brand):[...prev,brand];saveRestaurantPreferences(next);return next;});}
 const upcoming=useMemo(()=>stations.filter(s=>s.distanceKm>=currentKm).map(s=>({station:s,brands:detectRestaurantBrands(s.services)})).filter(x=>x.brands.length>0),[stations,currentKm]);
 const matches=useMemo(()=>upcoming.filter(x=>!prefs.length||x.brands.some(b=>prefs.includes(b))).slice(0,8),[upcoming,prefs]);
 const byBrand=useMemo(()=>prefs.map(brand=>({brand,distances:upcoming.filter(x=>x.brands.includes(brand)).slice(0,4).map(x=>Math.max(0,Math.round(x.station.distanceKm-currentKm)))})),[prefs,upcoming,currentKm]);
 return <section className="restaurantPrefs"><div className="restaurantPrefsHead"><div><span>MES RESTAURANTS</span><h3>Où retrouver vos enseignes sur la route ?</h3></div><small>Préférences mémorisées sur ce téléphone</small></div><div className="restaurantBrandChips">{RESTAURANT_BRANDS.map(brand=><button key={brand} className={prefs.includes(brand)?'active':''} onClick={()=>toggle(brand)}>{prefs.includes(brand)?'✓ ':''}{brand}</button>)}</div>{prefs.length>0&&<div className="restaurantForecast">{byBrand.map(x=><div key={x.brand}><strong>{x.brand}</strong><span>{x.distances.length?x.distances.map(d=>`${d} km`).join(' · '):'Pas encore trouvé sur la portion analysée'}</span></div>)}</div>}<div className="restaurantUpcoming"><div className="roadSectionTitle"><span>{prefs.length?'PROCHAINS MATCHS':'RESTAURANTS IDENTIFIÉS DEVANT VOUS'}</span><small>{matches.length} résultat(s)</small></div>{matches.length?matches.map(({station,brands})=><button key={station.id} onClick={()=>onSelect(station)}><div><strong>{station.brand||station.city||station.name}</strong><small>Dans {Math.max(0,Math.round(station.distanceKm-currentKm))} km · passage {clock(station)}</small><span>🍴 {brands.join(' · ')}</span></div><b>›</b></button>):<p className="restaurantEmpty">Aucune enseigne préférée n’est encore identifiée dans les données des prochaines aires. Floway n’invente pas les marques absentes de la source.</p>}</div></section>;
}
