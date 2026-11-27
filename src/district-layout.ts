// Ground-plan metres, shared by the render batches and vehicle collision solver.
export interface Lot { id:string; x:number; z:number; width:number; depth:number }
function lot(id:string,x:number,z:number,width:number,depth:number):Lot { return {id,x,z,width,depth} }
function shed(id:string,x:number,z:number,width:number,depth:number,height:number,accent:string,doors=1){
  return {...lot(id,x,z,width,depth),height,accent,doors};
}
export const DISTRICT_SHEDS=[
  shed('yard',-14,-22,6.6,5,3.35,'#324962',2),shed('substation',-17.7,-23.5,2.2,3.6,2.35,'#cf9837'),
  shed('foundry',0,-36,7.4,5.1,4.05,'#746851',2),shed('uplink',14,-22,6.6,4.6,3.45,'#725d49',1),
  shed('depot',0,-10,4.3,3.05,2.85,'#34495b'),shed('bagging',-19,-29,5,3.2,2.7,'#746c59'),
  shed('lab',-14,-35,4.3,3.25,3.3,'#465b65'),shed('depotannex',17,-34,4.75,3.6,2.9,'#746c59'),
  shed('parts',-23,-15,4.4,3.1,2.4,'#465b65'),shed('records',-30,-24,5.3,3.6,2.5,'#746c59'),
  shed('pump',8,-45,5.7,3.6,2.9,'#465b65'),shed('yardoffice',23,-41,4.8,3.3,2.6,'#746c59'),
  shed('depotwest',-34,-32,4.6,4.4,2.5,'#465b65')
];
export const CITY_BLOCKS=[
  {...lot('workers-court',-17,-3.4,7.1,4.55),floors:5,style:'housing'},
  {...lot('quarry-house',-7.4,-44.1,5.65,4.7),floors:6,style:'tower'},
  {...lot('exchange',9,-35.9,6.25,4.35),floors:4,style:'market'}
] as const;
export const DISTRICT_TANKS=[[-5,-37,2.4,4],[-7.7,-37,2.1,3.6],[-24,-38,2.65,4.8],[-27,-38,2.5,4.2],
  [12,-42,2.65,4.4],[15,-42,2.65,3.9],[-28,-16,2.75,4.7]].map(([x,z,d,height],i)=>({...lot('tank'+i,x,z,d,d),height}));
export const DISTRICT_CARGO=[[-26,-29],[-28.3,-29],[-26,-30.5],[-11,-40.7],[-13.2,-40.7],[17.7,-38.7],[20,-38.7],[-1,-45.2]]
  .map(([x,z],i)=>lot('cargo'+i,x,z,1.85,.94));
export const GANTRIES=[[-22,-34,8.4,9],[26,-43,7.8,8]];
export const POWER_MASTS=Array.from({length:7},(_,i)=>lot('pylon'+i,-33+i*8,-47-i*.2,1.05,1.05));
export const SWITCHGEAR=[-16,-13].map((x,i)=>lot('switchbank'+i,x,-26.05,1.55,1.35));
export const CANOPY_POSTS=[-1.86,1.86].map((x,i)=>lot('forecourt-post'+i,x,-6.63,.18,.18));
const buildings:Lot[]=[...DISTRICT_SHEDS,...CITY_BLOCKS,...DISTRICT_TANKS,...DISTRICT_CARGO,...POWER_MASTS,...SWITCHGEAR,...CANOPY_POSTS,
  ...GANTRIES.map(([x,z],i)=>lot('cranebase'+i,x,z,1.42,1.42)),lot('depotmast',-2.7,-10.4,.68,.68)];
export const DISTRICT_FOOTPRINTS=buildings.map(b=>({...b,minX:b.x-b.width/2,maxX:b.x+b.width/2,minZ:b.z-b.depth/2,maxZ:b.z+b.depth/2}));
