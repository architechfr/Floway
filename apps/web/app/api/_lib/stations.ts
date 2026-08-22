/**
 * Lecture d'un enregistrement du flux « Prix des carburants en France ».
 *
 * Ces fonctions vivaient dans `/api/route`. Elles sont partagees depuis que
 * `/api/stations-near` interroge le meme jeu de donnees : deux listes de
 * categories de services qui divergent produiraient deux classements
 * differents pour la meme station.
 *
 * Rappel de terrain : ce flux ne porte **aucune marque ni enseigne**. Ses
 * champs sont id, latitude, longitude, cp, pop, adresse, ville, horaires,
 * services, prix, geom, les prix et dates par carburant, departement et
 * region. Verifie sur le catalogue de l'API.
 */

export type Point = [number, number];
export type FuelRecord = Record<string, unknown>;

/** Rayon terrestre moyen, en kilometres. */
const R = 6371;
const rad = (n: number) => (n * Math.PI) / 180;

/** Distance orthodromique entre deux points, en kilometres. */
export function haversine(a: Point, b: Point) {
  const x = rad(b[1] - a[1]);
  const y = rad(b[0] - a[0]);
  const h =
    Math.sin(x / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Services declares par la station, decoupes puis nettoyes. */
export function serviceList(record: FuelRecord): string[] {
  return String(record.services || '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function point(r:FuelRecord):Point|null{const g=r.geom as {lon?:number;lat?:number}|{coordinates?:Point}|undefined;if(g&&'lon'in g&&'lat'in g&&typeof g.lon==='number'&&typeof g.lat==='number')return[g.lon,g.lat];if(g&&'coordinates'in g&&Array.isArray(g.coordinates))return g.coordinates;const x=Number(r.longitude),y=Number(r.latitude);return Number.isFinite(x)&&Number.isFinite(y)?[x,y]:null;}

export function field(f:string){const k=f.toLowerCase().replace(/[^a-z0-9]/g,'');if(k.includes('gazole'))return'gazole_prix';if(k.includes('sp95e10')||k==='e10')return'e10_prix';if(k.includes('sp98'))return'sp98_prix';if(k.includes('sp95'))return'sp95_prix';if(k.includes('e85'))return'e85_prix';return'gazole_prix';}

export function price(r:FuelRecord,f:string){const d=Number(r[field(f)]);if(Number.isFinite(d)&&d>0)return d;const raw=String(r.prix||''),a=f.toLowerCase().includes('gazole')?['Gazole']:f.toLowerCase().includes('e10')?['E10','SP95-E10']:[f];for(const x of a){const m=raw.match(new RegExp(`${x}[^0-9]{0,30}([0-9]+[.,][0-9]{2,3})`,'i'));if(m)return Number(m[1].replace(',','.'));}return null;}

export function cats(s:string[]){const h=s.join(' ').toLowerCase(),o:string[]=[];if(/restaur|sandwich|repas|fast.?food|snack/.test(h))o.push('Restauration');if(/cafe|café|boisson|bar/.test(h))o.push('Café');if(/boutique|shop|magasin|épicer|epicer/.test(h))o.push('Boutique');if(/toilet|sanitaire|wc/.test(h))o.push('Toilettes');if(/douche/.test(h))o.push('Douches');if(/wifi|wi-fi/.test(h))o.push('Wi-Fi');if(/borne|recharge|électrique|electrique/.test(h))o.push('Recharge VE');return o;}
