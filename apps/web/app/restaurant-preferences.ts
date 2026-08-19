export const RESTAURANT_BRANDS=[
  "McDonald's",
  'Burger King',
  'PAUL',
  'Brioche Dorée',
  'Starbucks',
  'KFC',
  'Quick',
  'Subway',
] as const;

export type RestaurantBrand=typeof RESTAURANT_BRANDS[number];

const aliases:Record<RestaurantBrand,RegExp>={
  "McDonald's":/\b(mc\s?do|mcdonald'?s?)\b/i,
  'Burger King':/\bburger\s?king\b/i,
  'PAUL':/\bpaul\b/i,
  'Brioche Dorée':/\bbrioche\s+dor[eé]e\b/i,
  'Starbucks':/\bstarbucks\b/i,
  'KFC':/\bkfc\b|kentucky\s+fried\s+chicken/i,
  'Quick':/\bquick\b/i,
  'Subway':/\bsubway\b/i,
};

export function detectRestaurantBrands(services:string[]|undefined):RestaurantBrand[]{
  if(!services?.length)return[];
  const haystack=services.join(' · ');
  return RESTAURANT_BRANDS.filter(brand=>aliases[brand].test(haystack));
}

export function loadRestaurantPreferences():RestaurantBrand[]{
  if(typeof window==='undefined')return[];
  try{
    const raw=JSON.parse(localStorage.getItem('floway:restaurantPreferences')||'[]');
    if(!Array.isArray(raw))return[];
    return raw.filter((x):x is RestaurantBrand=>RESTAURANT_BRANDS.includes(x as RestaurantBrand));
  }catch{return[];}
}

export function saveRestaurantPreferences(brands:RestaurantBrand[]){
  if(typeof window==='undefined')return;
  localStorage.setItem('floway:restaurantPreferences',JSON.stringify(brands));
}
